import { HSI_CONSTITUENTS } from '../data/hkConstituents';

// 东方财富行情API（使用JSONP回调绕过CORS）
const EASTMONEY_API = 'https://push2.eastmoney.com/api/qt/stock/get';
const EASTMONEY_LIST_API = 'https://push2.eastmoney.com/api/qt/clist/get';

// 通过JSONP获取数据
function jsonpFetch(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const callbackName = `jsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    
    (window as any)[callbackName] = (data: any) => {
      resolve(data);
      delete (window as any)[callbackName];
      document.head.removeChild(script);
    };
    
    script.src = `${url}&cb=${callbackName}`;
    script.onerror = () => {
      reject(new Error(`JSONP request failed: ${url}`));
      delete (window as any)[callbackName];
      document.head.removeChild(script);
    };
    
    document.head.appendChild(script);
    
    // 超时处理
    setTimeout(() => {
      if ((window as any)[callbackName]) {
        reject(new Error(`JSONP timeout: ${url}`));
        delete (window as any)[callbackName];
        if (script.parentNode) document.head.removeChild(script);
      }
    }, 10000);
  });
}

/**
 * 将 fetch 返回的 ArrayBuffer 按 GBK 解码（兼容港股/腾讯接口的中文编码），
 * 若浏览器不支持 GBK 则回退到 UTF-8。
 */
function decodeGbkBuffer(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('gbk').decode(buffer);
  } catch (e) {
    console.warn('GBK 解码不可用，回退 UTF-8:', e);
    return new TextDecoder('utf-8').decode(buffer);
  }
}

// 解析腾讯证券行情字符串，提取关键字段
function parseTencentQuote(raw: string): {
  price: number;
  marketCap: number;
  changePercent: number;
  volumeRatio: number;
  turnoverRate: number;
  name: string;
  pb: number;
} | null {
  const match = raw.match(/v_[a-z]{2}(\d{4,6})="(.*?)"/);
  if (!match) return null;
  const parts = match[2].split('~');
  const price = parseFloat(parts[3]) || 0;      // 当前价
  const marketCap = parseFloat(parts[44]) || 0; // 总市值(亿)
  const changePercent = parseFloat(parts[31]) || 0; // 当日涨幅%
  const volumeRatio = parseFloat(parts[35]) || 0;   // 量比
  const turnoverRate = parseFloat(parts[33]) || 0;  // 换手率%
  const name = parts[1] || '';                  // 股票名称
  const pb = parseFloat(parts[46]) || 0;        // 市净率
  return { price, marketCap, changePercent, volumeRatio, turnoverRate, name, pb };
}

// 判断股票/ETF/指数的市场前缀
function getMarketPrefix(code: string): string {
  if (code === 'HSI') return 'hk';
  const numeric = /^\d+$/.test(code);
  const len = code.length;
  // 港股：1-5 位纯数字（如 00700 腾讯、00005 汇丰），不是 6 位 A 股
  if (numeric && len >= 1 && len <= 5) return 'hk';
  // 上海：6开头（A股主板）、5开头（ETF）
  if (code.startsWith('6') || code.startsWith('5')) return 'sh';
  // 深圳：0开头（深主板）、3开头（创业板）、9开头（深证指数）、1/2开头（中小板/B股）
  if (code.startsWith('0') || code.startsWith('3') || code.startsWith('9') || code.startsWith('1') || code.startsWith('2')) return 'sz';
  return 'sh';
}
export async function fetchStockQuote(stockCode: string): Promise<{
  price: number;
  marketCap: number;
  yearChange: number;
  change: number;
  changePercent: number;
  volumeRatio: number;
  turnoverRate: number;
  name: string;
} | null> {
  try {
    const market = getMarketPrefix(stockCode);
    const url = `/api/qt/q=${market}${stockCode}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const text = await response.text();
    const q = parseTencentQuote(text);
    if (!q || q.price <= 0) return null;
    return {
      price: q.price,
      marketCap: q.marketCap,
      yearChange: 0,       // 年内涨幅通过 fetchBatchQuotes 单独获取
      change: 0,
      changePercent: q.changePercent,
      volumeRatio: q.volumeRatio,
      turnoverRate: q.turnoverRate,
      name: q.name,
    };
  } catch (e) {
    console.error('获取行情失败:', stockCode, e);
    return null;
  }
}

// 通过腾讯证券 K 线接口获取单只股票的年内涨幅
// 取今年第一个交易日收盘价与当前价格计算
export async function fetchYearChangeByKline(stockCode: string, currentPrice: number): Promise<number> {
  try {
    const market = getMarketPrefix(stockCode);
    if (market === 'hk') {
      // 港股 K 线尝试用腾讯接口，失败则回退 0
      const year = new Date().getFullYear();
      const url = `/api/qkline/ifzqgtimg/appstock/app/newfqkline/get?_var=kd&param=${market}${stockCode},day,${year - 1}-12-26,${year}-01-15,10,qfq&r=${Math.random()}`;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const text = await response.text();
        const match = text.match(/kd=(.*)/);
        if (!match) return 0;
        const data = JSON.parse(match[1]);
        const klines = data?.data?.[`${market}${stockCode}`]?.qfqday ?? data?.data?.[`${market}${stockCode}`]?.day;
        if (!klines || klines.length === 0) return 0;
        const firstOfYear = klines.find((k: any[]) => k[0] >= `${year}-01-01`);
        if (!firstOfYear) return 0;
        const firstClose = parseFloat(firstOfYear[2]);
        if (!firstClose || firstClose <= 0) return 0;
        return Math.round((currentPrice - firstClose) / firstClose * 10000) / 100;
      } catch {
        return 0;
      }
    }
    const year = new Date().getFullYear();
    const url = `/api/qkline/ifzqgtimg/appstock/app/newfqkline/get?_var=kd&param=${market}${stockCode},day,${year - 1}-12-26,${year}-01-15,10,qfq&r=${Math.random()}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const text = await response.text();
    const match = text.match(/kd=(.*)/);
    if (!match) return 0;
    const data = JSON.parse(match[1]);
    const klines = data?.data?.[`${market}${stockCode}`]?.qfqday;
    if (!klines || klines.length === 0) return 0;
    // 找今年第一个交易日收盘价（第3列，索引2）
    const firstOfYear = klines.find((k: any[]) => k[0] >= `${year}-01-01`);
    if (!firstOfYear) return 0;
    const firstClose = parseFloat(firstOfYear[2]);
    if (!firstClose || firstClose <= 0) return 0;
    // 年内涨幅 = (当前价 - 年初收盘) / 年初收盘 * 100
    return Math.round((currentPrice - firstClose) / firstClose * 10000) / 100;
  } catch {
    return 0;
  }
}

// 获取最近N个交易日的K线数据（用于技术分析）
export async function fetchRecentKlines(stockCode: string, count: number = 60): Promise<{
  date: string; open: number; close: number; high: number; low: number; volume: number;
}[]> {
  try {
    const market = getMarketPrefix(stockCode);
    // 腾讯K线API不支持相对日期(如-60)，必须用显式日期
    // N个交易日 ≈ N*1.5个自然日，额外留20天余量
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Math.ceil(count * 1.5) - 20);
    const startStr = startDate.toISOString().slice(0, 10);
    const url = `/api/qkline/ifzqgtimg/appstock/app/newfqkline/get?_var=kd&param=${market}${stockCode},day,${startStr},,${count},qfq&r=${Math.random()}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const text = await response.text();
    const match = text.match(/kd=(.*)/);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    const klines = data?.data?.[`${market}${stockCode}`]?.qfqday ?? data?.data?.[`${market}${stockCode}`]?.day;
    if (!klines || klines.length === 0) return [];
    return klines.map((k: any[]) => ({
      date: k[0] || '',
      open: parseFloat(k[1]) || 0,
      close: parseFloat(k[2]) || 0,
      high: parseFloat(k[3]) || 0,
      low: parseFloat(k[4]) || 0,
      volume: parseFloat(k[5]) || 0,
    })).filter((k: any) => k.close > 0);
  } catch {
    return [];
  }
}

// 批量获取股票行情（腾讯证券接口，一次请求50只，包含实时价格 + 年内涨幅 + 量比）
export async function fetchBatchQuotes(stockCodes: string[], _currentPrices?: Map<string, number>): Promise<Map<string, {
  price: number;
  marketCap: number;
  yearChange: number;
  changePercent: number;
  volumeRatio: number;
  turnoverRate: number;
  name: string;
  pb: number;
}>> {
  const result = new Map<string, { price: number; marketCap: number; yearChange: number; changePercent: number; volumeRatio: number; turnoverRate: number; name: string; pb: number }>();
  const BATCH_SIZE = 50; // 腾讯接口每次最多50只

  // Phase 1: 批量获取实时行情（价格、市值、PB、量比、换手率）
  for (let i = 0; i < stockCodes.length; i += BATCH_SIZE) {
    const batch = stockCodes.slice(i, i + BATCH_SIZE);
    const secids = batch.map(code => getMarketPrefix(code) + code).join(',');
    try {
      const url = `/api/qt/q=${secids}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const buffer = await response.arrayBuffer();
      const text = decodeGbkBuffer(buffer);
      // 解析每只股票
      const lines = text.split('\n').filter(l => l.trim());
      for (const line of lines) {
        const codeMatch = line.match(/v_[a-z]{2}(\d{4,6})/);
        if (!codeMatch) continue;
        const code = codeMatch[1];
        const q = parseTencentQuote(line);
        if (q && q.price > 0) {
          result.set(code, {
            price: q.price,
            marketCap: q.marketCap,
            changePercent: q.changePercent,
            volumeRatio: q.volumeRatio,
            turnoverRate: q.turnoverRate,
            name: q.name,
            pb: q.pb,
            yearChange: 0,
          });
        }
      }
    } catch (e) {
      console.error('批量获取行情失败:', e);
    }
  }

  // Phase 2: 并发获取年内涨幅（腾讯 K 线）
  const CONCURRENCY = 20;
  const codesWithPrice = stockCodes.filter(c => result.has(c));
  for (let i = 0; i < codesWithPrice.length; i += CONCURRENCY) {
    const batch = codesWithPrice.slice(i, i + CONCURRENCY);
    const yearChanges = await Promise.all(
      batch.map(code => fetchYearChangeByKline(code, result.get(code)!.price))
    );
    for (let j = 0; j < batch.length; j++) {
      const entry = result.get(batch[j])!;
      result.set(batch[j], { ...entry, yearChange: yearChanges[j] });
    }
  }

  return result;
}

// 获取指数数据
export async function fetchIndexData(indexCode: string): Promise<{
  points: number;
  yearChange: number;
  changePercent: number;
  pe: number;
} | null> {
  try {
    // 指数代码映射（含ETF）
    const marketMap: Record<string, string> = {
      '000001': '1',   // 上证指数
      '399001': '0',   // 深证成指
      '399006': '0',   // 创业板指
      '000300': '1',   // 沪深300
      '000688': '1',   // 科创50
      '000950': '1',   // 中证A50
      '000905': '1',   // 中证500
      '000852': '1',   // 中证1000
      '930050': '1',   // 中证A50
      '881001': '90',  // wind全A
      // ETF（上交所）
      '513040': '1',   // 港股通互联网ETF
      '513120': '1',   // 港股创新药
      '560020': '1',   // 红利ETF
      '510300': '1',   // 沪深300ETF
      // ETF（深交所）
      '159915': '0',   // 创业板ETF
    };
    const market = marketMap[indexCode] || (/^[0-3]\d{5}$/.test(indexCode) ? (indexCode.startsWith('0') || indexCode.startsWith('3') ? '0' : '1') : '1');
    const url = `${EASTMONEY_API}?secid=${market}.${indexCode}&fields=f43,f57,f58,f170,f162,f169`;
    
    const data = await jsonpFetch(url);
    if (!data?.data) return null;
    
    const d = data.data;
    return {
      points: (d.f43 || 0) / 100,
      yearChange: (d.f170 || 0) / 100,
      changePercent: (d.f170 || 0) / 100,
      pe: (d.f162 || 0) / 100,
    };
  } catch (e) {
    console.error('获取指数数据失败:', indexCode, e);
    return null;
  }
}

// 通用指数成分股获取函数（基于 datacenter-web API）
async function fetchIndexConstituents(
  typeCode: string,
  indexName: string,
): Promise<Array<{
  code: string;
  name: string;
  price: number;
  changePercent: number;
  yearChange: number;
  marketCap: number;
  industry: string;
}>> {
  const allStocks: Array<{
    code: string;
    name: string;
    price: number;
    changePercent: number;
    yearChange: number;
    marketCap: number;
    industry: string;
  }> = [];

  const pageSize = 500;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_INDEX_TS_COMPONENT&columns=SECURITY_CODE,SECURITY_NAME_ABBR,CLOSE_PRICE,CHANGE_RATE,FREE_CAP,INDUSTRY&filter=(TYPE=${typeCode})&pageNumber=${page}&pageSize=${pageSize}&sortColumns=WEIGHT&sortTypes=-1&source=WEB&client=WEB`;
      const response = await fetch(url);
      const data = await response.json();

      if (data?.result?.data && data.result.data.length > 0) {
        for (const item of data.result.data) {
          allStocks.push({
            code: item.SECURITY_CODE,
            name: item.SECURITY_NAME_ABBR,
            price: item.CLOSE_PRICE || 0,
            changePercent: item.CHANGE_RATE || 0,
            yearChange: 0, // 先置0，后续用 fetchBatchQuotes 补充真实年内涨幅
            marketCap: item.FREE_CAP || 0, // 流通市值（亿）
            industry: item.INDUSTRY || '',
          });
        }
        // 检查是否还有更多页
        const total = data.result.count || 0;
        if (page * pageSize >= total) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    } catch (e) {
      console.error(`获取${indexName}成分股失败, page:`, page, e);
      hasMore = false;
    }
  }

  console.log(`成功获取 ${allStocks.length} 只${indexName}成分股`);

  // 批量获取年内涨幅（通过腾讯证券 K 线接口计算，支持 fetch，无 CORS 限制）
  if (allStocks.length > 0) {
    try {
      const codes = allStocks.map(s => s.code);
      // fetchBatchQuotes 自行获取实时价格，无需传入 priceMap
      const quoteMap = await fetchBatchQuotes(codes);
      let updated = 0;
      for (const s of allStocks) {
        const q = quoteMap.get(s.code);
        if (q) {
          if (q.price > 0) s.price = q.price;
          if (q.marketCap > 0) s.marketCap = q.marketCap;
          if (q.yearChange !== 0) s.yearChange = q.yearChange;
          updated++;
        }
      }
      console.log(`成功补充 ${updated} 只${indexName}年内涨幅数据`);
    } catch (e) {
      console.warn(`获取${indexName}年内涨幅失败，请点击“刷新行情”更新`, e);
    }
  }

  return allStocks;
}

// 获取沪深300成分股列表 (TYPE=1, ~300只)
export function fetchCSI300Constituents() {
  return fetchIndexConstituents('1', '沪深300');
}

// 获取中证500成分股列表 (TYPE=3, ~500只)
export function fetchCSI500Constituents() {
  return fetchIndexConstituents('3', '中证500');
}

// 获取中证1000成分股列表 (TYPE=7, ~1000只)
export function fetchCSI1000Constituents() {
  return fetchIndexConstituents('7', '中证1000');
}

// 获取港股（全市场）列表
export async function fetchHKEXConstituents(): Promise<Array<{
  code: string;
  name: string;
  price: number;
  changePercent: number;
  yearChange: number;
  marketCap: number;
  industry: string;
}>> {
  const allStocks: Array<{
    code: string;
    name: string;
    price: number;
    changePercent: number;
    yearChange: number;
    marketCap: number;
    industry: string;
  }> = [];

  // 港股代码统一为 5 位数字，前面补 0（如 00700）
  const normalizeHKCode = (raw: string) => {
    const num = raw.replace(/\D/g, '');
    return num.padStart(5, '0');
  };

  // 去重
  const seenCodes = new Set<string>();
  const addStock = (s: typeof allStocks[0]) => {
    if (!seenCodes.has(s.code)) {
      seenCodes.add(s.code);
      allStocks.push(s);
    }
  };

  // 方案1：分页获取全市场港股（主板+创业板+科创板+主板ETF+创业板ETF+基金+债券），每次500只，最多获取30页
  const pageSize = 500;
  const maxPages = 30;
  const marketFilters = [
    'm:128+t:3',     // 港股主板
    'm:128+t:4',     // 港股创业板
    'm:128+t:13',    // 港股科创板
    'm:128+t:5',     // 港股主板ETF
    'm:128+t:6',     // 港股创业板ETF
    'm:128+t:7',     // 港股主板基金
    'm:128+t:8',     // 港股创业板基金
    'm:128+t:10',    // 港股主板债券
  ];

  for (const fs of marketFilters) {
    for (let pn = 1; pn <= maxPages; pn++) {
      try {
        const url = `/api/push2/api/qt/clist/get?pn=${pn}&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f20&fs=${encodeURIComponent(fs)}&fields=f12,f14,f20,f170&_=${Date.now()}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const buffer = await response.arrayBuffer();
        const text = decodeGbkBuffer(buffer);
        const data = JSON.parse(text);

        if (data?.data?.diff && Array.isArray(data.data.diff) && data.data.diff.length > 0) {
          for (const item of data.data.diff) {
            const code = normalizeHKCode(item.f12 || '');
            if (code) {
              addStock({
                code,
                name: item.f14 || '',
                price: 0,
                changePercent: (item.f170 || 0) / 100,
                yearChange: 0,
                marketCap: (item.f20 || 0) / 100000000,
                industry: '',
              });
            }
          }
          console.log(`[${fs}] page ${pn}: 获取 ${data.data.diff.length} 只，累计 ${allStocks.length} 只`);
          if (data.data.diff.length < pageSize) break;
        } else {
          break;
        }
      } catch (e) {
        console.warn(`[${fs}] page ${pn} 获取失败:`, e);
        break;
      }
    }
  }

  // 按市值排序，保留前5000只
  if (allStocks.length > 0) {
    allStocks.sort((a, b) => b.marketCap - a.marketCap);
    if (allStocks.length > 5000) allStocks.length = 5000;
  }

  // 方案2：使用本地恒生指数成分股 fallback（补充未被接口返回的重要股票）
  for (const c of HSI_CONSTITUENTS) {
    addStock({
      code: c.code,
      name: c.name,
      price: 0,
      changePercent: 0,
      yearChange: 0,
      marketCap: 0,
      industry: c.industry,
    });
  }

  console.log(`港股列表获取完成：API ${allStocks.length} 只`);

  // 批量获取实时行情与年内涨幅（腾讯接口，支持港股）
  if (allStocks.length > 0) {
    try {
      const codes = allStocks.map(s => s.code);
      const quoteMap = await fetchBatchQuotes(codes);
      let updated = 0;
      for (const s of allStocks) {
        const q = quoteMap.get(s.code);
        if (q) {
          if (q.price > 0) s.price = q.price;
          if (q.marketCap > 0) s.marketCap = q.marketCap;
          if (q.yearChange !== 0) s.yearChange = q.yearChange;
          if (q.name) s.name = q.name;
          updated++;
        }
      }
      console.log(`成功补充 ${updated} 只港股行情数据`);
    } catch (e) {
      console.warn('获取港股行情失败:', e);
    }
  }

  return allStocks;
}

// ============ 指数估值API ============

// 蛋卷基金指数代码映射
const DANJUAN_INDEX_MAP: Record<string, string> = {
  '399001': 'SZ399001',   // 深证成指
  '399006': 'SZ399006',   // 创业板指
  'HSI': 'HKHSI',         // 恒生指数
  '000300': 'SH000300',   // 沪深300
  '000688': 'SH000688',   // 科创50
  '000905': 'SH000905',   // 中证500
  '000852': 'SH000852',   // 中证1000
  '000016': 'SH000016',   // 上证50
  '930050': 'CSI930050',  // 中证A50
  '000001': 'SH000001',   // 上证指数
};

// 从蛋卷基金API获取指数PE和百分位数据
export async function fetchIndexValuations(): Promise<Map<string, {
  pe: number;
  pePercentile: number;
  pb: number;
  pbPercentile: number;
  roe: number;
}>> {
  const result = new Map();
  try {
    const response = await fetch('/api/danjuan/index_eva/dj');
    const data = await response.json();
    const items = data?.data?.items;
    if (!items || !Array.isArray(items)) return result;

    const reverseMap = new Map<string, string>();
    Object.entries(DANJUAN_INDEX_MAP).forEach(([local, dj]) => reverseMap.set(dj, local));

    for (const item of items) {
      const localCode = reverseMap.get(item.index_code);
      if (localCode) {
        result.set(localCode, {
          pe: item.pe || 0,
          pePercentile: Math.round((item.pe_percentile || 0) * 10000) / 100,  // 保甂2位小数
          pb: item.pb || 0,
          pbPercentile: Math.round((item.pb_percentile || 0) * 10000) / 100,
          roe: item.roe || 0,
        });
      }
    }
  } catch (e) {
    console.error('获取蛋卷指数估值数据失败:', e);
  }
  return result;
}

// 从中证指数API获取指数行情（点位、涨幅、PE）
// 支持：上证000001, 沪深300(000300), 科创50(000688), 中证A50(930050)等
export async function fetchCSIIndexQuote(indexCode: string): Promise<{
  points: number;
  yearChange: number;
  pe: number;
} | null> {
  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const start = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    const url = `/api/csindex/perf/index-perf?indexCode=${indexCode}&startDate=${start}&endDate=${today}`;
    const response = await fetch(url);
    const data = await response.json();
    const items = data?.data;
    if (!items || items.length === 0) return null;
    const latest = items[items.length - 1];
    return {
      points: latest.close || 0,
      yearChange: latest.changePct || 0,
      pe: latest.peg || 0,
    };
  } catch (e) {
    console.error('获取中证指数行情失败:', indexCode, e);
    return null;
  }
}

// 从东方财富push2his获取指数K线（适用于深证/创业板/恒生/中证A50等csindex不支持的指数）
// secid格式：市场编号.指数代码  深证=0 沪=1 港=100
const PUSH2HIS_SECID_MAP: Record<string, string> = {
  '000001': '1.000001',   // 上证指数
  '399001': '0.399001',   // 深证成指
  '399006': '0.399006',   // 创业板指
  'HSI': '100.HSI',       // 恒生指数
  '000300': '1.000300',   // 沪深300
  '000688': '1.000688',   // 科创50
  '930050': '2.930050',   // 中证A50 (沪深市场)
  '881001': '90.881001',  // wind全A
  '000905': '1.000905',   // 中证500
  '000852': '1.000852',   // 中证1000
};

// 批量获取多个指数实时行情（点位、涨跌幅）
// 使用push2.eastmoney.com批量接口
export async function fetchPush2HisQuote(indexCode: string): Promise<{
  points: number;
  yearChange: number;
} | null> {
  const secid = PUSH2HIS_SECID_MAP[indexCode];
  if (!secid) return null;
  try {
    // 使用 push2 批量实时行情接口
    const url = `/api/push2/api/qt/ulist.np/get?fltt=2&secids=${encodeURIComponent(secid)}&fields=f12,f14,f2,f3,f4`;
    const response = await fetch(url);
    const data = await response.json();
    const diff = data?.data?.diff;
    if (!diff || diff.length === 0) return null;
    const item = diff[0];
    return {
      points: item.f2 || 0,
      yearChange: item.f3 || 0,  // f3 是当日涨跌幅，不是年内涨幅
    };
  } catch (e) {
    console.error('获取push2行情失败:', indexCode, e);
    return null;
  }
}

// 批量获取指数年内涨幅（需要当年年初收盘价）
// 使用csindex获取年初到现在的走势数据
export async function fetchIndexYearChange(indexCode: string, csindexCode?: string): Promise<number> {
  const code = csindexCode || indexCode;
  try {
    const now = new Date();
    const yearStart = `${now.getFullYear()}0101`;
    const today = now.toISOString().slice(0, 10).replace(/-/g, '');
    const url = `/api/csindex/perf/index-perf?indexCode=${code}&startDate=${yearStart}&endDate=${today}`;
    const response = await fetch(url);
    const data = await response.json();
    const items = data?.data;
    if (!items || items.length < 2) return 0;
    const first = items[0];
    const latest = items[items.length - 1];
    if (!first.close || !latest.close) return 0;
    return parseFloat(((latest.close - first.close) / first.close * 100).toFixed(2));
  } catch (e) {
    return 0;
  }
}
// 批量获取股票CAGR和机构一致预期PEG（来自东方财富 RPT_VALUEANALYSIS_DET）
// CAGR = PE_TTM / (PEG_CAR * 100)
export async function fetchBatchCAGR(
  stockCodes: string[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, { cagr: number; pegCar: number }>> {
  const result = new Map<string, { cagr: number; pegCar: number }>();

  // 尝试最近几天的日期（处理周末/节假日）
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  // 分批获取，每批100只
  const batchSize = 100;
  for (let batchStart = 0; batchStart < stockCodes.length; batchStart += batchSize) {
    const batch = stockCodes.slice(batchStart, batchStart + batchSize);
    const codeFilter = batch.map(c => `%22${c}%22`).join(',');

    for (const today of dates) {
      const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_VALUEANALYSIS_DET&columns=SECURITY_CODE,PE_TTM,PEG_CAR&filter=(SECURITY_CODE+in+(${codeFilter}))(TRADE_DATE=%27${today}%27)&pageNumber=1&pageSize=${batchSize}&source=WEB&client=WEB`;

      try {
        const response = await fetch(url);
        const data = await response.json();

        if (data?.result?.data && data.result.data.length > 0) {
          for (const item of data.result.data) {
            const code = item.SECURITY_CODE;
            const pe = item.PE_TTM;
            const peg = item.PEG_CAR;
            if (pe && peg && pe > 0 && peg > 0) {
              const cagr = pe / (peg * 100);
              result.set(code, {
                cagr: Math.round(cagr * 10000) / 10000,
                pegCar: Math.round(peg * 10000) / 10000,
              });
            }
          }
          break; // 找到数据就停止尝试日期
        }
      } catch (e) {
        console.error('批量获取CAGR失败, date:', today, e);
      }
    }

    onProgress?.(Math.min(batchStart + batchSize, stockCodes.length), stockCodes.length);
  }

  console.log(`成功获取 ${result.size} 只股票的CAGR和PEG_CAR数据`);
  return result;
}

// 批量获取股票所属行业
export async function fetchBatchIndustry(
  stockCodes: string[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  // 尝试最近几天的日期
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const batchSize = 100;
  for (let batchStart = 0; batchStart < stockCodes.length; batchStart += batchSize) {
    const batch = stockCodes.slice(batchStart, batchStart + batchSize);
    const codeFilter = batch.map(c => `%22${c}%22`).join(',');

    for (const date of dates) {
      try {
        const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_VALUEANALYSIS_DET&columns=SECURITY_CODE,BOARD_NAME&filter=(SECURITY_CODE+in+(${codeFilter}))(TRADE_DATE=%27${date}%27)&pageNumber=1&pageSize=${batchSize}&source=WEB&client=WEB`;
        const response = await fetch(url);
        const data = await response.json();

        if (data?.result?.data && data.result.data.length > 0) {
          for (const item of data.result.data) {
            if (item.BOARD_NAME) {
              result.set(item.SECURITY_CODE, item.BOARD_NAME);
            }
          }
          break;
        }
      } catch (e) {
        console.error('获取股票行业信息失败:', e);
      }
    }

    onProgress?.(batchStart + batch.length, stockCodes.length);
  }

  console.log(`成功获取 ${result.size} 只股票的行业信息`);
  return result;
}

// 批量获取股票行业公认PE（基于行业PE中位数）
export async function fetchBatchIndustryPE(
  stockCodes: string[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  // 尝试最近几天的日期
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  let tradeDate = '';
  let stockIndustryMap = new Map<string, string>(); // code -> industry

  // Step 1: 获取目标股票的行业信息
  const batchSize = 100;
  for (let batchStart = 0; batchStart < stockCodes.length; batchStart += batchSize) {
    const batch = stockCodes.slice(batchStart, batchStart + batchSize);
    const codeFilter = batch.map(c => `%22${c}%22`).join(',');

    for (const date of dates) {
      try {
        const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_VALUEANALYSIS_DET&columns=SECURITY_CODE,BOARD_NAME&filter=(SECURITY_CODE+in+(${codeFilter}))(TRADE_DATE=%27${date}%27)&pageNumber=1&pageSize=${batchSize}&source=WEB&client=WEB`;
        const response = await fetch(url);
        const data = await response.json();

        if (data?.result?.data && data.result.data.length > 0) {
          if (!tradeDate) tradeDate = date;
          for (const item of data.result.data) {
            if (item.BOARD_NAME) {
              stockIndustryMap.set(item.SECURITY_CODE, item.BOARD_NAME);
            }
          }
          break;
        }
      } catch (e) {
        console.error('获取股票行业信息失败:', e);
      }
    }

    onProgress?.(Math.min(batchStart + batchSize, stockCodes.length), stockCodes.length * 2);
  }

  if (stockIndustryMap.size === 0 || !tradeDate) {
    console.error('无法获取股票行业信息');
    return result;
  }

  // Step 2: 获取每个行业的所有股票PE，计算中位数
  const industries = [...new Set(stockIndustryMap.values())];
  const industryMedianPE = new Map<string, number>();

  for (let i = 0; i < industries.length; i++) {
    const industry = industries[i];
    try {
      // 查询该行业的所有股票PE
      const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_VALUEANALYSIS_DET&columns=PE_TTM&filter=(BOARD_NAME=%22${encodeURIComponent(industry)}%22)(TRADE_DATE=%27${tradeDate}%27)&pageNumber=1&pageSize=500&source=WEB&client=WEB`;
      const response = await fetch(url);
      const data = await response.json();

      if (data?.result?.data) {
        const pes = data.result.data
          .map((r: any) => r.PE_TTM)
          .filter((pe: number) => pe > 0 && pe < 200)
          .sort((a: number, b: number) => a - b);

        if (pes.length >= 3) {
          const median = pes[Math.floor(pes.length / 2)];
          industryMedianPE.set(industry, Math.round(median * 10) / 10);
        }
      }
    } catch (e) {
      console.error('获取行业PE失败:', industry, e);
    }

    onProgress?.(stockCodes.length + i + 1, stockCodes.length + industries.length);
  }

  // Step 3: 为每只股票分配行业PE
  for (const [code, industry] of stockIndustryMap) {
    const medianPE = industryMedianPE.get(industry);
    if (medianPE) {
      result.set(code, medianPE);
    }
  }

  console.log(`成功获取 ${result.size} 只股票的行业公认PE（来自 ${industryMedianPE.size} 个行业）`);
  return result;
}

// ============ 财务数据API ============

/**
 * 批量获取股票财务指标
 * 从东方财富 data center API 获取：PB、ROE、每股净资产(BVPS)、每股股息(DPS)、PS
 * 返回 Map<股票代码, 财务数据对象>
 */
export async function fetchBatchFinancials(
  stockCodes: string[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, {
  pb: number;
  roe: number;
  bvps: number;
  dps: number;
  ps: number;
}>> {
  const result = new Map<string, any>();

  // 尝试最近5个交易日的日期
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const batchSize = 100;
  for (let batchStart = 0; batchStart < stockCodes.length; batchStart += batchSize) {
    const batch = stockCodes.slice(batchStart, batchStart + batchSize);
    const codeFilter = batch.map(c => `"${c}"`).join(',');

    let fetched = false;
    for (const date of dates) {
      // 尝试多个可能的报表名称和字段组合
      const reportConfigs = [
        {
          // 配置1：RPT_VALUATION_ANALYSIS_DET 表
          reportName: 'RPT_VALUATION_ANALYSIS_DET',
          fields: 'SECURITY_CODE,PB_TTM,ROE_TTM,BPS,DPS,PS_TTM',
          fieldMap: {
            code: 'SECURITY_CODE',
            pb: 'PB_TTM',
            roe: 'ROE_TTM',
            bvps: 'BPS',
            dps: 'DPS',
            ps: 'PS_TTM',
          },
        },
        {
          // 配置2：RPT_F10_FINANCE_MAIN 表（主要财务指标）
          reportName: 'RPT_F10_FINANCE_MAIN',
          fields: 'SECURITY_CODE,PB_MRQ,ROE_MRQ,BPS_MRQ,DPS_MRQ,PS_TTM',
          fieldMap: {
            code: 'SECURITY_CODE',
            pb: 'PB_MRQ',
            roe: 'ROE_MRQ',
            bvps: 'BPS_MRQ',
            dps: 'DPS_MRQ',
            ps: 'PS_TTM',
          },
        },
      ];

      for (const config of reportConfigs) {
        const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=${config.reportName}&columns=${config.fields}&filter=(SECURITY_CODE+in+(${codeFilter}))(TRADE_DATE='${date}')&pageNumber=1&pageSize=${batchSize}&source=WEB&client=WEB`;

        try {
          const response = await fetch(url);
          const data = await response.json();

          if (data?.result?.data && data.result.data.length > 0) {
            for (const item of data.result.data) {
              const code = item[config.fieldMap.code];
              if (code) {
                result.set(code, {
                  pb: parseFloat(item[config.fieldMap.pb]) || 0,
                  roe: parseFloat(item[config.fieldMap.roe]) || 0,
                  bvps: parseFloat(item[config.fieldMap.bvps]) || 0,
                  dps: parseFloat(item[config.fieldMap.dps]) || 0,
                  ps: parseFloat(item[config.fieldMap.ps]) || 0,
                });
              }
            }
            fetched = true;
            break;
          }
        } catch (e) {
          console.error('获取财务数据失败, config:', config.reportName, 'date:', date, e);
        }
      }

      if (fetched) break;
    }

    onProgress?.(Math.min(batchStart + batchSize, stockCodes.length), stockCodes.length);
  }

  console.log(`成功获取 ${result.size} 只股票的财务数据`);
  return result;
}

// ============ 历史PB分位数据API ============

/**
 * 获取单只股票的历史每日PB数据
 * 数据源：东方财富 datacenter RPT_VALUEANALYSIS_DET 表（字段 PB_MRQ）
 * 缓存：localStorage 7天TTL，避免重复请求
 */
export async function fetchPBHistory(stockCode: string, years: number = 10): Promise<number[]> {
  // 检查缓存
  const cacheKey = `pb-hist-${stockCode}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < 7 * 24 * 60 * 60 * 1000 && Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch { /* ignore */ }
  }

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - years);
  const startDateStr = startDate.toISOString().slice(0, 10);

  const url = `/api/datacenter/api/data/v1/get?` +
    `reportName=RPT_VALUEANALYSIS_DET&` +
    `columns=TRADE_DATE,PB_MRQ&` +
    `filter=(SECURITY_CODE="${stockCode}")(TRADE_DATE>='${startDateStr}')(TRADE_DATE<='${endDate}')&` +
    `pageNumber=1&pageSize=5000&sortColumns=TRADE_DATE&sortTypes=1&source=WEB&client=WEB`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!data?.success) {
      console.warn(`[PB历史] ${stockCode} API返回失败:`, data?.message);
      return [];
    }
    const rows = data?.result?.data;
    if (!rows || rows.length === 0) {
      console.warn(`[PB历史] ${stockCode} 无数据`);
      return [];
    }

    const pbValues: number[] = [];
    for (const row of rows) {
      const pb = parseFloat(row.PB_MRQ);
      if (!isNaN(pb) && pb > 0) pbValues.push(pb);
    }
    console.log(`[PB历史] ${stockCode} 获取到 ${pbValues.length} 条PB数据`);

    // 缓存结果
    if (pbValues.length > 0) {
      localStorage.setItem(cacheKey, JSON.stringify({ data: pbValues, ts: Date.now() }));
    }
    return pbValues;
  } catch (e) {
    console.warn(`[PB历史] ${stockCode} 请求失败:`, e);
    return [];
  }
}

/** 线性插值法计算分位数 */
function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  if (sortedArr.length === 1) return sortedArr[0];
  const idx = (p / 100) * (sortedArr.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  const frac = idx - lo;
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * frac;
}

/**
 * 获取单只股票的历史PB分位数据（10%低位和90%高位）
 * 返回 { pbHistLow, pbHistHigh, sampleCount }
 */
export async function fetchPBPercentile(stockCode: string, years: number = 10): Promise<{
  pbHistLow: number;
  pbHistHigh: number;
  sampleCount: number;
}> {
  const pbValues = await fetchPBHistory(stockCode, years);
  if (pbValues.length < 30) {
    return { pbHistLow: 0, pbHistHigh: 0, sampleCount: pbValues.length };
  }
  const sorted = [...pbValues].sort((a, b) => a - b);
  return {
    pbHistLow: Math.round(percentile(sorted, 10) * 100) / 100,
    pbHistHigh: Math.round(percentile(sorted, 90) * 100) / 100,
    sampleCount: pbValues.length,
  };
}

/**
 * 批量获取多只股票的历史PB分位数据
 * 并发控制：同时最多5个请求
 */
export async function fetchBatchPBPercentile(
  stockCodes: string[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, { pbHistLow: number; pbHistHigh: number; sampleCount: number }>> {
  const result = new Map<string, { pbHistLow: number; pbHistHigh: number; sampleCount: number }>();
  const total = stockCodes.length;
  let completed = 0;
  const CONCURRENCY = 5;

  const tasks = stockCodes.map(code => async () => {
    try {
      const pct = await fetchPBPercentile(code);
      if (pct.pbHistLow > 0 && pct.pbHistHigh > 0) {
        result.set(code, pct);
      }
    } catch (e) {
      console.debug(`批量获取PB分位失败 ${code}:`, e);
    } finally {
      completed++;
      onProgress?.(completed, total);
    }
  });

  // 分批执行，每批 CONCURRENCY 个
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(t => t()));
  }

  return result;
}

// 判断是否在交易时间
export function isTradingTime(): boolean {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const day = now.getDay();
  
  // 周末不交易
  if (day === 0 || day === 6) return false;
  
  // 上午 9:30-11:30, 下午 13:00-15:00
  const time = hours * 60 + minutes;
  return (time >= 570 && time <= 690) || (time >= 780 && time <= 900);
}
