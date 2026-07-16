// 财务数据获取模块（支持 A股 + 港股）
// A股数据来源：
//   1. 东方财富 datacenter RPT_LICO_FN_CPD（业绩报表）→ BPS、ROE、DPS、股息率、毛利率
//   2. 东方财富 F10 ZYZBAjaxNew（主要财务指标）→ 资产负债率
// 港股数据来源：
//   1. 东方财富港股F10 PCF10 → 主要财务指标
//   2. 腾讯财经港股接口 → 财务摘要
//   3. 本地 fallback 默认值 → 根据行业类型推断
// 注意：浏览器环境需通过 Vite 代理 /api/datacenter、/api/emweb、/api/qt 访问，避免 CORS。

/**
 * 单只股票的财务指标
 */
export interface FinancialData {
  pb?: number;        // 市净率（由行情接口提供，这里不再重复获取）
  roe?: number;       // 净资产收益率(%)，取最近年报加权ROE
  bvps?: number;      // 每股净资产(元)
  dps?: number;       // 每股股息(元)，由年报"10派X元"解析（估值用，仅年报）
  dpsTtm?: number;    // TTM每股股息(元)：年报+同年度中期分红之和，用于按当前价计算股息率
  ps?: number;        // 市销率（不从此接口获取，由调用方用市值/营收计算或默认值）
  divYield?: number;  // 当前股息率(%)
  grossMargin?: number; // 毛利率(%)
  debtRatio?: number;   // 资产负债率(%)
  goodwillRatio?: number; // 商誉占归母净资产比例(%)，用于商誉减值风险评估
}

/** 判断是否为港股代码（1-5位纯数字） */
function isHKStock(code: string): boolean {
  const numeric = /^\d+$/.test(code);
  const len = code.length;
  return numeric && len >= 1 && len <= 5;
}

/** 根据纯数字股票代码生成 F10 接口需要的带市场前缀代码 */
function toF10Code(code: string): string {
  if (isHKStock(code)) {
    // 港股：东方财富港股F10使用 HK+5位数字 格式
    return `HK${code.padStart(5, '0')}`;
  }
  if (/^[68]/.test(code)) return `SH${code}`;
  if (/^[023]/.test(code)) return `SZ${code}`;
  if (/^[48]/.test(code)) return `BJ${code}`;
  return `SH${code}`;
}

/** 从分红方案文本中提取每股股息（元） */
function parseDivPerShare(script: string | null | undefined): number | undefined {
  if (!script) return undefined;
  const patterns = [
    /10派([\d.]+)元/,
    /10股派([\d.]+)元/,
    /每10股派([\d.]+)元/,
    /10股派息([\d.]+)元/,
    /10股现金分红([\d.]+)元/,
    /每10股派\s*港?币?\s*([\d.]+)\s*元?/,
    /([\d.]+)\s*港仙/,
    /10股送([\d.]+)元/,
  ];
  for (const p of patterns) {
    const m = script.match(p);
    if (m && m[1]) {
      let div = parseFloat(m[1]) / 10;
      // 港仙换算：1港仙 = 0.01港元
      if (script.includes('港仙')) div = div / 100;
      return div;
    }
  }
  return undefined;
}

/** 判断是否为年报记录 */
function isAnnualReport(item: any): boolean {
  return item?.DATEMMDD === '年报' || (item?.QDATE && String(item.QDATE).endsWith('Q4')) ||
    (item?.REPORT_DATE && String(item.REPORT_DATE).includes('12-31'));
}

/** 计算 TTM 每股股息(元)：最新年报(1231) + 同一年度内的中期(0630)/三季报(0930)分红之和。
 *  从 ASSIGNDSCRPT 解析每股股息，不依赖 ZXGXL（ZXGXL 是按报告期历史收盘价算的股息率，非当前价口径）。
 *  items 已按 REPORTDATE 降序排列。只取最近一个分红年度，不跨到上一个年报，避免高估。 */
function calcTTMDPS(items: any[]): number | undefined {
  let summing = false, sum = 0, seenAnnual = 0;
  for (const r of items) {
    const rd = String(r.REPORTDATE || '').replace(/\D/g, '').slice(0, 8);
    const isAnnual = rd.endsWith('1231');
    const dps = parseDivPerShare(r.ASSIGNDSCRPT);
    if (isAnnual) {
      seenAnnual++;
      if (seenAnnual === 1) { summing = true; if (dps != null) sum += dps; continue; }
      else break;
    }
    if (summing && dps != null) sum += dps;
  }
  return sum > 0 ? sum : undefined;
}

/** 行业财务指标 fallback 默认值（适用于 A股和港股） */
const INDUSTRY_DEFAULTS: Record<string, FinancialData> = {
  '银行': { roe: 10, grossMargin: 45, debtRatio: 90, divYield: 5 },
  '保险': { roe: 12, grossMargin: 35, debtRatio: 85, divYield: 4 },
  '电讯': { roe: 11, grossMargin: 55, debtRatio: 40, divYield: 6 },
  '公用事业': { roe: 10, grossMargin: 40, debtRatio: 50, divYield: 5 },
  '地产': { roe: 12, grossMargin: 30, debtRatio: 70, divYield: 4 },
  '石油能源': { roe: 15, grossMargin: 40, debtRatio: 45, divYield: 6 },
  '汽车': { roe: 13, grossMargin: 25, debtRatio: 55, divYield: 3 },
  '互联网': { roe: 18, grossMargin: 50, debtRatio: 35, divYield: 2 },
  '科技硬件': { roe: 15, grossMargin: 20, debtRatio: 50, divYield: 3 },
  '医药': { roe: 14, grossMargin: 60, debtRatio: 30, divYield: 2 },
  '消费': { roe: 16, grossMargin: 45, debtRatio: 35, divYield: 3 },
  '综合企业': { roe: 11, grossMargin: 30, debtRatio: 55, divYield: 4 },
  '航运物流': { roe: 12, grossMargin: 25, debtRatio: 50, divYield: 5 },
  '金融': { roe: 11, grossMargin: 40, debtRatio: 80, divYield: 5 },
  'REITs': { roe: 8, grossMargin: 60, debtRatio: 40, divYield: 7 },
  '基建': { roe: 10, grossMargin: 20, debtRatio: 65, divYield: 4 },
  '航空': { roe: 8, grossMargin: 15, debtRatio: 70, divYield: 3 },
  '材料': { roe: 12, grossMargin: 25, debtRatio: 55, divYield: 4 },
  '证券': { roe: 10, grossMargin: 35, debtRatio: 75, divYield: 3 },
  '港股': { roe: 12, grossMargin: 30, debtRatio: 55, divYield: 4 },
  'default': { roe: 10, grossMargin: 30, debtRatio: 50, divYield: 4 },
};

/** 根据行业名称匹配 fallback 财务指标 */
function getFinancialDefaults(industry: string): FinancialData {
  if (!industry) return INDUSTRY_DEFAULTS['default'];
  const industryKey = Object.keys(INDUSTRY_DEFAULTS).find(key =>
    industry.includes(key) || key.includes(industry)
  );
  return industryKey ? INDUSTRY_DEFAULTS[industryKey] : INDUSTRY_DEFAULTS['default'];
}

/** 从港股 F10 接口获取财务数据 */
async function fetchHKFinancialData(code: string): Promise<FinancialData | null> {
  const hkCode = toF10Code(code);
  const results: FinancialData = {};

  // 尝试多个港股财务接口
  try {
    // 港股主要财务指标接口
    const url1 = `/api/emweb/PC_HSF10/NewFinanceAnalysis/ZYZBAjaxNew?type=0&code=${hkCode}`;
    const response1 = await fetch(url1, { signal: AbortSignal.timeout(10000) });
    const data1 = await response1.json();
    const items = data1?.data;
    if (items && items.length > 0) {
      const latest = items[0];
      if (latest.ROE) results.roe = parseFloat(latest.ROE);
      if (latest.ZCFZL) results.debtRatio = parseFloat(latest.ZCFZL);
      if (latest.MLL) results.grossMargin = parseFloat(latest.MLL);
      if (latest.BPS) results.bvps = parseFloat(latest.BPS);
    }
  } catch (e) {
    console.debug(`港股F10接口失败 ${code}:`, e);
  }

  try {
    // 港股分红派息接口
    const url2 = `/api/emweb/PC_HSF10/CompanyOperation/InvestorRelationAjax?code=${hkCode}&type=FH&pageNumber=1&pageSize=10`;
    const response2 = await fetch(url2, { signal: AbortSignal.timeout(8000) });
    const data2 = await response2.json();
    const rows = data2?.result?.data;
    if (rows && rows.length > 0) {
      const latestDiv = rows[0];
      const divText = String(latestDiv.ASSIGNDSCRPT || latestDiv.DESC || '');
      const dps = parseDivPerShare(divText);
      if (dps !== undefined) results.dps = dps;
    }
  } catch (e) {
    console.debug(`港股分红接口失败 ${code}:`, e);
  }

  // 如果获取了部分数据，则返回
  const hasData = Object.values(results).some(v => v !== undefined);
  return hasData ? results : null;
}

/** 从东方财富港股行情接口补充财务数据 */
async function fetchHKQuoteFinancial(code: string): Promise<FinancialData | null> {
  try {
    // 东方财富港股行情接口包含部分财务指标
    const hkCode = code.padStart(5, '0');
    const url = `/api/push2/api/qt/stock/get?secid=116.${hkCode}&fields=f57,f58,f162,f167,f173`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await response.json();
    const quote = data?.data;
    if (!quote) return null;

    const results: FinancialData = {};
    if (quote.f167) results.bvps = parseFloat(quote.f167);
    if (quote.f173) results.roe = parseFloat(quote.f173);
    return results;
  } catch (e) {
    console.debug(`港股行情财务数据失败 ${code}:`, e);
    return null;
  }
}

/** 从腾讯财经港股接口获取财务摘要 */
async function fetchHKTencentFinancial(code: string): Promise<FinancialData | null> {
  try {
    const url = `/api/qt/l=hk${code.padStart(5, '0')}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const text = await response.text();
    // 解析腾讯接口返回的 v_s_hk00700="...~指标1~指标2~..."
    const match = text.match(/v_s_hk\d+="([^"]*)"/);
    if (!match) return null;

    const fields = match[1].split('~');
    // 腾讯港股接口部分字段包含财务指标
    const results: FinancialData = {};
    // 字段位置根据实际数据解析，这里尝试常见位置
    if (fields.length > 30) {
      const divYield = parseFloat(fields[30]);
      if (!isNaN(divYield) && divYield > 0) results.divYield = divYield;
    }
    if (fields.length > 39) {
      const pb = parseFloat(fields[39]);
      if (!isNaN(pb) && pb > 0) results.pb = pb;
    }
    return results;
  } catch (e) {
    console.debug(`腾讯港股财务接口失败 ${code}:`, e);
    return null;
  }
}

/** 从 A股 F10 主要财务指标接口获取资产负债率 */
async function fetchDebtRatio(code: string): Promise<number | undefined> {
  const f10Code = toF10Code(code);
  const url = `/api/emweb/PC_HSF10/NewFinanceAnalysis/ZYZBAjaxNew?type=0&code=${f10Code}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    const items = data?.data;
    if (items && items.length > 0) {
      const annual = items.find((item: any) =>
        item.REPORT_DATE && String(item.REPORT_DATE).includes('12-31')
      ) || items[0];
      const zcfzl = parseFloat(annual.ZCFZL);
      return isNaN(zcfzl) ? undefined : zcfzl;
    }
  } catch (e) {
    console.debug(`获取资产负债率失败 ${code}:`, e);
  }
  return undefined;
}

/**
 * 批量获取 A股 商誉占归母净资产比例(%)
 * 数据源：东方财富 datacenter 资产负债表报表 RPT_F10_FINANCE_GBALANCE
 *   - GOODWILL：商誉（为 null 表示无商誉 → 比例记 0）
 *   - TOTAL_PARENT_EQUITY：归母股东权益合计（净资产）
 * 仅处理 A股（该报表不覆盖港股）。取每只股票最新报告期。
 */
async function fetchBatchGoodwill(aShareCodes: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (aShareCodes.length === 0) return map;

  const batchSize = 50;
  for (let start = 0; start < aShareCodes.length; start += batchSize) {
    const batch = aShareCodes.slice(start, start + batchSize);
    const codeFilter = batch.map(c => `"${c}"`).join(',');
    try {
      const filter = `(SECURITY_CODE in (${codeFilter}))`;
      const pageSize = Math.max(200, batch.length * 12);
      const url = `/api/datacenter/api/data/v1/get?` +
        `reportName=RPT_F10_FINANCE_GBALANCE&` +
        `columns=SECURITY_CODE,REPORT_DATE,GOODWILL,TOTAL_PARENT_EQUITY&` +
        `filter=${encodeURIComponent(filter)}&` +
        `sortColumns=REPORT_DATE&sortTypes=-1&` +
        `pageNumber=1&pageSize=${pageSize}&source=WEB&client=WEB`;
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      const rows = data?.result?.data;
      if (rows && rows.length > 0) {
        // rows 已按报告期降序，首次出现即为该股票最新一期
        for (const item of rows) {
          const code = item.SECURITY_CODE;
          if (!code || map.has(code)) continue;
          const equity = parseFloat(item.TOTAL_PARENT_EQUITY);
          if (!(equity > 0)) continue;
          const goodwill = item.GOODWILL == null ? 0 : parseFloat(item.GOODWILL);
          if (isNaN(goodwill)) continue;
          map.set(code, (goodwill / equity) * 100);
        }
      }
    } catch (e) {
      console.debug('A股商誉数据批量获取失败:', e);
    }
    if (start + batchSize < aShareCodes.length) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  return map;
}

/**
 * 批量获取股票财务指标（支持 A股 + 港股）
 *
 * A股处理流程：
 *   - datacenter RPT_LICO_FN_CPD（批量，50只/次）→ BPS/ROE/DPS/股息率/毛利率
 *   - F10 ZYZBAjaxNew（逐只）→ 资产负债率
 *
 * 港股处理流程：
 *   - 港股F10接口 → 主要财务指标
 *   - 东方财富港股行情接口 → 补充财务数据
 *   - 腾讯财经港股接口 → 股息率、PB
 *   - 行业 fallback 默认值 → 最后保障
 */
export async function fetchBatchFinancials(
  stockCodes: string[],
  onProgress?: (current: number, total: number) => void,
  industryMap?: Map<string, string>,  // 可选：股票代码到行业的映射，用于港股 fallback
  onPartialResult?: (partialResult: Map<string, FinancialData>) => void  // 部分结果回调，用于分阶段更新
): Promise<Map<string, FinancialData>> {
  const result = new Map<string, FinancialData>();
  const total = stockCodes.length;

  // ── 分组：A股代码 / 港股代码 ──
  const aShareCodes: string[] = [];
  const hkCodes: string[] = [];
  for (const code of stockCodes) {
    if (isHKStock(code)) {
      hkCodes.push(code);
    } else {
      aShareCodes.push(code);
    }
  }

  console.log(`财务数据获取：A股 ${aShareCodes.length}只，港股 ${hkCodes.length}只`);

  // ── Phase 1: A股 datacenter 批量获取（BPS/ROE/DPS/股息率/毛利率）──
  if (aShareCodes.length > 0) {
    const batchSize = 50;
    for (let batchStart = 0; batchStart < aShareCodes.length; batchStart += batchSize) {
      const batch = aShareCodes.slice(batchStart, batchStart + batchSize);
      const codeFilter = batch.map(c => `"${c}"`).join(',');

      try {
        const pageSize = Math.max(200, batch.length * 12);
        const filter = `(SECURITY_CODE in (${codeFilter}))`;
        const url = `/api/datacenter/api/data/v1/get?` +
          `reportName=RPT_LICO_FN_CPD&` +
          `columns=SECURITY_CODE,SECURITY_NAME_ABBR,REPORTDATE,BPS,WEIGHTAVG_ROE,ASSIGNDSCRPT,ZXGXL,XSMLL,DATEMMDD,QDATE&` +
          `filter=${encodeURIComponent(filter)}&` +
          `sortColumns=REPORTDATE&sortTypes=-1&` +
          `pageNumber=1&pageSize=${pageSize}&source=WEB&client=WEB`;

        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const data = await response.json();
        const rows = data?.result?.data;

        if (rows && rows.length > 0) {
          const grouped = new Map<string, any[]>();
          for (const item of rows) {
            const code = item.SECURITY_CODE;
            if (!code) continue;
            if (!grouped.has(code)) grouped.set(code, []);
            grouped.get(code)!.push(item);
          }

          for (const [code, items] of grouped) {
            const latest = items[0];
            const annual = items.find(isAnnualReport) || latest;

            const bvps = parseFloat(latest.BPS) || undefined;
            const roe = parseFloat(annual.WEIGHTAVG_ROE) || undefined;
            const dps = parseDivPerShare(annual.ASSIGNDSCRPT);   // 年报每股股息（估值用）
            const dpsTtm = calcTTMDPS(items);                      // TTM每股股息（年报+中期）
            // 股息率由下游用 dpsTtm/当前价 计算（修正ZXGXL历史价口径）；此处保留历史值作兜底
            const divYield = parseFloat(annual.ZXGXL || latest.ZXGXL) || undefined;
            const grossMargin = parseFloat(annual.XSMLL || latest.XSMLL) || undefined;

            result.set(code, { bvps, roe, dps, dpsTtm, divYield, grossMargin });
          }
        }
      } catch (e) {
        console.debug('A股批量财务数据获取失败:', e);
      }

      onProgress?.(Math.min(batchStart + batchSize, total), total);
      if (batchStart + batchSize < aShareCodes.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // Phase 1 完成后触发部分结果回调，让 ROE/毛利率/BPS/DPS 等数据先显示出来
    onPartialResult?.(new Map(result));
  }

  // ── Phase 2: A股 F10 逐只获取资产负债率（同时补全缺失的行业默认值）──
  if (aShareCodes.length > 0) {
    const CONCURRENCY = 20;  // 提高并发数加速资产负债率获取
    for (let i = 0; i < aShareCodes.length; i += CONCURRENCY) {
      const batch = aShareCodes.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(code => fetchDebtRatio(code)));
      for (let j = 0; j < batch.length; j++) {
        const code = batch[j];
        let existing = result.get(code);

        // 如果批量接口没有返回数据，创建一个新的财务数据对象
        if (!existing) {
          existing = {};
          result.set(code, existing);
        }

        // 更新资产负债率
        if (results[j] !== undefined) {
          existing.debtRatio = results[j];
        }
      }

      // 每批资产负债率获取完成后触发回调，让数据逐步补全
      onPartialResult?.(new Map(result));

      onProgress?.(Math.min(i + CONCURRENCY + hkCodes.length * 0, total), total);
      if (i + CONCURRENCY < aShareCodes.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }

  // ── Phase 2.5: A股商誉占净资产比例（用于商誉减值风险评分）──
  if (aShareCodes.length > 0) {
    try {
      const goodwillMap = await fetchBatchGoodwill(aShareCodes);
      for (const [code, ratio] of goodwillMap) {
        let existing = result.get(code);
        if (!existing) {
          existing = {};
          result.set(code, existing);
        }
        existing.goodwillRatio = ratio;
      }
      onPartialResult?.(new Map(result));
    } catch (e) {
      console.debug('商誉数据阶段失败:', e);
    }
  }

  // ── Phase 3: 港股财务数据获取（3个接口 + 行业 fallback）──
  if (hkCodes.length > 0) {
    const HK_CONCURRENCY = 8;
    let hkProgress = aShareCodes.length;
    for (let i = 0; i < hkCodes.length; i += HK_CONCURRENCY) {
      const batch = hkCodes.slice(i, i + HK_CONCURRENCY);
      const results = await Promise.all(batch.map(async code => {
        // 依次尝试3个接口
        const f10 = await fetchHKFinancialData(code);
        const quote = await fetchHKQuoteFinancial(code);
        const tencent = await fetchHKTencentFinancial(code);
        // 合并所有接口结果
        const merged: FinancialData = { ...(f10 || {}), ...(quote || {}), ...(tencent || {}) };
        // 使用行业 fallback 补充缺失字段
        const industry = industryMap?.get(code) || '';
        const defaults = getFinancialDefaults(industry);
        if (merged.roe === undefined) merged.roe = defaults.roe;
        if (merged.grossMargin === undefined) merged.grossMargin = defaults.grossMargin;
        if (merged.debtRatio === undefined) merged.debtRatio = defaults.debtRatio;
        if (merged.divYield === undefined) merged.divYield = defaults.divYield;
        return merged;
      }));

      for (let j = 0; j < batch.length; j++) {
        result.set(batch[j], results[j]);
      }
      hkProgress += batch.length;
      onProgress?.(Math.min(hkProgress, total), total);
      if (i + HK_CONCURRENCY < hkCodes.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }

  // ── Phase 4: 统一 fallback 处理 ──
  // 为所有股票补充缺失的财务指标（使用行业默认值）
  for (const code of stockCodes) {
    let data = result.get(code);
    if (!data) {
      data = {};
      result.set(code, data);
    }

    // 获取行业信息
    const industry = industryMap?.get(code) || '';
    const defaults = getFinancialDefaults(industry);

    // 补充缺失字段
    if (data.roe === undefined) data.roe = defaults.roe;
    if (data.grossMargin === undefined) data.grossMargin = defaults.grossMargin;
    if (data.debtRatio === undefined) data.debtRatio = defaults.debtRatio;
    if (data.divYield === undefined) data.divYield = defaults.divYield;
  }

  console.log(`成功获取 ${result.size} / ${stockCodes.length} 只股票的财务数据（A股：${aShareCodes.length}，港股：${hkCodes.length}）`);
  return result;
}

/**
 * 获取单只股票的详细财务数据（用于调试）
 */
export async function fetchStockFinancials(stockCode: string): Promise<FinancialData | null> {
  const map = await fetchBatchFinancials([stockCode]);
  return map.get(stockCode) || null;
}
