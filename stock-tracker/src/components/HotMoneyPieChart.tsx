import { useState, useMemo, useCallback } from 'react';
import type { PEGStock } from '../types/peg.ts';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { HOT_MONEY_NAMES, HOT_MONEY_ALIAS, resolvePrimaryName, fetchStocksByHolder, fetchHoldersByStock } from '../api/holders.ts';
import type { MarketHolderResult, StockHolderResult } from '../api/holders.ts';
import { calcPEGStock } from '../utils/formulas.ts';
import { getAdvice } from '../utils/multiValuation.ts';

/** 推荐颜色样式（与 MultiValuationTable 建议列完全一致） */
function getAdviceClass(advice: string): string {
  switch (advice) {
    case '重点关注': return 'bg-green-200 text-green-800 font-bold';
    case '分批建仓': return 'bg-green-100 text-green-700 font-semibold';
    case '持续跟踪': return 'bg-yellow-100 text-yellow-700';
    case '短期忽略': return 'bg-orange-100 text-orange-700 font-semibold';
    case '高风险': return 'bg-red-200 text-red-800 font-bold';
    default: return 'text-gray-400';
  }
}

interface HotMoneyPieChartProps {
  stocks: PEGStock[];
  onRefreshHolders?: () => void;
  updatingHolders?: boolean;
}

// ===== 从 HOT_MONEY_NAMES 中挑出「个人大佬」（去掉营业部、私募机构、泛词），按家族分组 =====
const HOT_MONEY_GROUPS: Array<{ label: string; names: string[] }> = [
  {
    label: '章建平家族（章盟主）',
    names: ['章建平', '章晓静', '章华妹', '方德基', '章利云', '方文艳'],
  },
  {
    label: '葛卫东家族',
    names: ['葛卫东', '葛贵兰', '葛强', '葛俊宏', '葛耀辉', '葛雅欣', '葛蓓蓓', '葛小舟'],
  },
  {
    label: '新生代游资代表',
    names: ['陈小群', '赵老哥', '赵强', '孙煜', '孙哥'],
  },
  {
    label: '老牌顶级牛散',
    names: ['方新侠', '徐开东', '徐翔', '徐留胜', '黄峥', '陈发树', '王卫',
            '吕强', '周宇光', '陈世辉', '夏重阳', '张素芬', '王一虹'],
  },
  {
    label: '明星基金经理/私募创始人',
    names: ['林园', '但斌', '冯柳', '邓晓峰', '邱国鹭', '张磊',
            '周应波', '朱少醒', '谢治宇', '董承非', '傅鹏博', '刘彦春'],
  },
];

// 扁平化成 <option value="name">Name</option> 的结构，附加家族前缀
const FLAT_OPTIONS: Array<{ value: string; label: string; family: string }> = HOT_MONEY_GROUPS.flatMap(g =>
  g.names.filter(n => HOT_MONEY_NAMES.includes(n)).map(n => ({ value: n, label: n, family: g.label }))
);

// 24 种颜色，用于饼图切片
const PIE_COLORS = [
  '#6366F1', '#EC4899', '#F59E0B', '#10B981', '#EF4444',
  '#8B5CF6', '#06B6D4', '#F97316', '#14B8A6', '#E11D48',
  '#3B82F6', '#A855F7', '#84CC16', '#FBBF24', '#0EA5E9',
  '#22C55E', '#DC2626', '#0891B2', '#D946EF', '#65A30D',
  '#B45309', '#7C3AED', '#7DD3FC', '#F87171',
];

// 从 stock.holderDetails + 顶层 hotMoney* 字段中，找出匹配某大佬名的持仓记录
// 宽松匹配：去掉所有空白、全角空格、半角空格、点号、括号干扰字符，再做子串匹配
function normalizeName(s: string | undefined | null): string {
  if (!s) return '';
  return String(s)
    .replace(/[\s\u3000\u00A0\.·•・()（）\[\]【】\-_—,"'`~!@#$%^&*+=\\/|<>?;:，。、；：？、《》「」『』]/g, '')
    .toLowerCase()
    .trim();
}
// 变动状态优先级：新进(4) > 加仓(3) > 不变(2) > 减仓(1) > 其它(0)
function changePriority(change: string): number {
  switch (change) {
    case '新进': return 4;
    case '加仓': return 3;
    case '不变': return 2;
    case '减仓': return 1;
    default: return 0;
  }
}
// 从 stock.holderDetails + 顶层 hotMoney* 字段中，找出匹配某大佬名的持仓记录
// 宽松匹配：去掉所有空白、全角空格、半角空格、点号、括号干扰字符，再做子串匹配
// 新增别名匹配：当 keyword = "冯柳" 时，会同时把 HOT_MONEY_ALIAS['冯柳'] 中每个别名（高毅邻山、高毅）也拿去匹配
// 返回时附带 primaryName（主名），用于后续同一人多个产品/外号的加总去重
function findHolderByName(
  stock: PEGStock,
  keyword: string,
): {
  name: string;           // 展示名（命中时的真实持仓名，或主名+别名括号形式）
  primaryName: string;    // 主名（赵老哥/赵强 → 统一为"赵强"，高毅邻山/高毅晓峰 → 冯柳/邓晓峰）
  ratio: number;
  change: string;
  holdNum: number;
} | null {
  const kw = normalizeName(keyword);
  if (!kw) return null;

  // ==== 关键词集合：原关键词 + 该关键词对应的全部别名（支持主名、外号、产品名）====
  const keywordList = [keyword];
  // 1) 从 HOT_MONEY_ALIAS 找：主名 → [别名们]，把别名也加入匹配池
  const directAliases = HOT_MONEY_ALIAS[keyword];
  if (directAliases && directAliases.length) keywordList.push(...directAliases);
  // 2) 反向：如果 keyword 本身是别人的别名，把它的主名拿来（如 keyword = 孙煜 → 主名 孙哥 也加进来）
  const reversePrimary = resolvePrimaryName(keyword);
  if (reversePrimary && !keywordList.includes(reversePrimary)) keywordList.push(reversePrimary);
  const reverseAliases = reversePrimary ? (HOT_MONEY_ALIAS[reversePrimary] || []) : [];
  for (const a of reverseAliases) if (!keywordList.includes(a)) keywordList.push(a);
  const normalizedKeywords = keywordList.map(k => ({ raw: k, norm: normalizeName(k) })).filter(x => x.norm);

  // 预计算该股票主名集合（一次循环拿所有命中，避免重复遍历）
  const details = stock.holderDetails || [];

  type CandidateHit = {
    rawName: string;
    ratio: number;
    change: string;
    holdNum: number;
    matchedKeyword: string;
    primaryName: string | null;
  };
  const hits: CandidateHit[] = [];

  const tryHit = (holderName: string, shortName: string, ratio: number, change: string, holdNum: number) => {
    const nn = normalizeName(holderName);
    const sn = normalizeName(shortName);
    if (!nn && !sn) return;
    for (const { raw: rawKw, norm: normKw } of normalizedKeywords) {
      if (!normKw) continue;
      const matched =
        (nn && (nn.includes(normKw) || normKw.includes(nn))) ||
        (sn && (sn.includes(normKw) || normKw.includes(sn)));
      if (matched) {
        const primary = resolvePrimaryName(holderName) || resolvePrimaryName(shortName) || resolvePrimaryName(rawKw);
        hits.push({
          rawName: holderName || shortName,
          ratio: ratio || 0,
          change: change || '—',
          holdNum: holdNum || 0,
          matchedKeyword: rawKw,
          primaryName: primary,
        });
        break;
      }
    }
  };

  // 1) 从 holderDetails 中找出所有命中
  for (const h of details) {
    tryHit(h.name || '', h.shortName || '', h.ratio || 0, h.change || '—', h.holdNum || 0);
  }
  // 2) 顶层 hotMoneyName 兜底命中（只在 holderDetails 没有任何命中时用）
  if (hits.length === 0 && stock.hotMoneyName) {
    tryHit(stock.hotMoneyName, stock.hotMoneyName, stock.hotMoneyRatio || 0, stock.hotMoneyChange || '—', 0);
  }
  if (hits.length === 0) return null;

  // 按「变动优先级 + ratio 」排序，挑出代表性的一条作为展示基准；
  // 返回的 ratio/holdNum 是这个 primaryName 所有命中的汇总值（同一产品多期、或同经理多产品同时持有的情况）
  const byPrimary = new Map<string, CandidateHit[]>();
  for (const h of hits) {
    const key = h.primaryName || h.rawName;
    if (!byPrimary.has(key)) byPrimary.set(key, []);
    byPrimary.get(key)!.push(h);
  }
  // 因为只查了一个 keyword，返回第一个有主名的分组；若都没有返回首个命中
  let chosenGroup: CandidateHit[] | undefined;
  for (const [pn, group] of byPrimary) {
    if (pn) { chosenGroup = group; break; }
  }
  chosenGroup = chosenGroup || [...byPrimary.values()][0];
  if (!chosenGroup || chosenGroup.length === 0) return null;

  const primaryName = chosenGroup[0].primaryName || normalizeName(chosenGroup[0].rawName);
  const topHit = [...chosenGroup].sort(
    (a, b) => (changePriority(b.change) - changePriority(a.change)) || (b.ratio - a.ratio)
  )[0];

  const totalRatio = chosenGroup.reduce((s, h) => s + (h.ratio || 0), 0);
  const totalHoldNum = chosenGroup.reduce((s, h) => s + (h.holdNum || 0), 0);

  // 展示名：如果有主名且主名 ≠ 真实持仓名，就显示"主名（持仓名）"；否则直接显示持仓名
  const displayName =
    primaryName && normalizeName(primaryName) !== normalizeName(topHit.rawName) && normalizeName(topHit.rawName)
      ? `${primaryName}（${topHit.rawName}）`
      : primaryName || topHit.rawName;

  return {
    name: displayName,
    primaryName: primaryName || topHit.rawName,
    ratio: Math.round(totalRatio * 10000) / 10000,
    change: topHit.change,
    holdNum: totalHoldNum,
  };
}

// 按 type 汇总持有者：返回合计比例、主名称（比例最高的）、主变动、家数
function aggregateHoldersByType(
  stock: PEGStock,
  allowedTypes: string[]
): { ratio: number; name: string; change: string; count: number } {
  const details = stock.holderDetails || [];
  let total = 0;
  let topName = '';
  let topRatio = 0;
  let topChange = '—';
  let count = 0;
  const set = new Set(allowedTypes);
  for (const h of details) {
    if (!h.type || !set.has(h.type)) continue;
    const r = h.ratio || 0;
    total += r;
    count += 1;
    if (r > topRatio) {
      topRatio = r;
      topName = h.shortName || h.name;
      topChange = h.change || '—';
    }
  }
  return {
    ratio: Math.round(total * 10000) / 10000,
    name: topName || '—',
    change: topChange,
    count,
  };
}

export function HotMoneyPieChart({ stocks, onRefreshHolders, updatingHolders }: HotMoneyPieChartProps) {
  const [selectedName, setSelectedName] = useState<string>('章建平');
  const [includeFamily, setIncludeFamily] = useState<boolean>(true); // 默认合并家族（更符合使用习惯）
  const [marketResults, setMarketResults] = useState<MarketHolderResult[]>([]);
  const [searchingMarket, setSearchingMarket] = useState(false);
  const [marketProgress, setMarketProgress] = useState('');
  
  const [stockSearchCode, setStockSearchCode] = useState('');
  const [stockSearchResults, setStockSearchResults] = useState<StockHolderResult[]>([]);
  const [searchingStock, setSearchingStock] = useState(false);

  // 当前需要匹配的关键词集合（可能 1 个人名，也可能是整个家族）
  const matchKeywords = useMemo<string[]>(() => {
    if (!includeFamily) return [selectedName];
    const group = HOT_MONEY_GROUPS.find(g => g.names.includes(selectedName));
    return group ? group.names.filter(n => HOT_MONEY_NAMES.includes(n)) : [selectedName];
  }, [selectedName, includeFamily]);

  // 股票池中已有的股票代码集合（用于全市场搜索结果标注"已在池中"）
  const poolStockCodes = useMemo(() => new Set(stocks.map(s => s.stockCode).filter(Boolean)), [stocks]);

  // 全市场搜索：通过东方财富 API 反查每位家族成员在全市场持有的所有股票
  const handleSearchMarket = useCallback(async () => {
    setSearchingMarket(true);
    setMarketProgress('0/' + matchKeywords.length);
    setMarketResults([]);
    try {
      const results = await fetchStocksByHolder(matchKeywords, (cur, total) => {
        setMarketProgress(cur + '/' + total);
      });
      setMarketResults(results);
    } catch (e) {
      console.error('全市场搜索失败:', e);
    } finally {
      setSearchingMarket(false);
      setMarketProgress('');
    }
  }, [matchKeywords]);

  const handleSearchStock = useCallback(async () => {
    const code = stockSearchCode.trim();
    if (!code) return;
    setSearchingStock(true);
    setStockSearchResults([]);
    try {
      const normalized = code.toUpperCase().replace(/\s/g, '');
      let searchCode = normalized;
      if (/^[A-Za-z]+/.test(normalized)) {
        searchCode = normalized.slice(-6);
      }
      const results = await fetchHoldersByStock(searchCode);
      setStockSearchResults(results);
    } catch (e) {
      console.error('股票查询失败:', e);
    } finally {
      setSearchingStock(false);
    }
  }, [stockSearchCode]);

  // 全市场搜索结果：按家族成员分组统计
  const marketByMember = useMemo(() => {
    const map = new Map<string, MarketHolderResult[]>();
    for (const r of marketResults) {
      // 用 resolvePrimaryName 把别名归到主名
      const primary = resolvePrimaryName(r.holderName) || matchKeywords.find(kw => r.holderName.includes(kw)) || r.holderName;
      if (!map.has(primary)) map.set(primary, []);
      map.get(primary)!.push(r);
    }
    // 每组内按比例降序
    for (const [, list] of map) list.sort((a, b) => b.ratio - a.ratio);
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [marketResults, matchKeywords]);

  // 扫描所有股票，汇总该大佬/家族的持仓分布
  // 数据分两层：
  //   detailRows = 明细表：「股票 × 单个家族成员」粒度（每人单独一行，章建平、方文艳分别显示）
  //   pieData    = 饼图数据：「股票」粒度，家族成员持仓金额聚合到同一切片（避免饼图被拆碎）
  const { pieData, detailRows } = useMemo(() => {
    // ====== 关键修复：同一只股票可能存在于多个分组（沪深300+中证500+中证1000），按 stockCode 先去重 ======
    const seenCodes = new Set<string>();
    const uniqueStocks: PEGStock[] = [];
    for (const s of stocks) {
      if (!s || !s.stockCode) continue;
      if (seenCodes.has(s.stockCode)) continue;
      seenCodes.add(s.stockCode);
      uniqueStocks.push(s);
    }

    // 🔍 调试日志（浏览器 F12 → Console 查看）
    // eslint-disable-next-line no-console
    console.debug('[游资持仓分布] 当前匹配关键词集合（matchKeywords）：', matchKeywords);
    // eslint-disable-next-line no-console
    console.debug('[游资持仓分布] 去重前股票数 =', stocks.length, '，去重后 =', uniqueStocks.length);

    type DetailRow = {
      stockCode: string;
      company: string;
      holderName: string;
      ratio: number;
      holdAmount: number;
      marketCap: number;
      change: string;
      board: string;
      rating: string;
      ratingClassName: string;
      safetyFactorPct: number;
      socialSecRatio: number;
      socialSecName: string;
      socialSecChange: string;
      socialSecCount: number;
      foreignRatio: number;
      foreignName: string;
      foreignChange: string;
      foreignCount: number;
    };
    const detailRows: DetailRow[] = [];

    // 第1轮：扫出所有匹配的家族成员明细
    for (const s of uniqueStocks) {
      const marketCap = s.marketCap || 0;
      // 🔍 调试：当前股票是否有持仓明细 / 顶层 hotMoney
      // eslint-disable-next-line no-console
      if ((s.holderDetails && s.holderDetails.length > 0) || s.hotMoneyName) {
        console.debug(
          `📦 扫描股票：${s.company}(${s.stockCode}) ` +
          `holderDetails.length=${(s.holderDetails || []).length}  ` +
          `topHotMoneyName=${s.hotMoneyName || '—'}  topHotMoneyRatio=${(s.hotMoneyRatio ?? 0).toFixed(2)}%`
        );
      }
      // ===== 推荐评级（与 MultiValuationTable / calcPEGDetailed 完全一致）=====
      const peCalc = calcPEGStock(s);
      // 注意：calcPEGDetailed 安全系数口径是 fairValue/currentPrice（不是 idealBuyPoint/currentPrice）
      const sfForRating = s.currentPrice > 0 ? peCalc.fairValue / s.currentPrice : 0;
      const rating = s.currentPrice && sfForRating > 0 ? getAdvice(sfForRating) : '-';
      const ratingClassName = s.currentPrice && sfForRating > 0 ? getAdviceClass(rating) : 'text-gray-400';
      const safetyFactorPct = Math.round(sfForRating * 10000) / 100;
      // ===== 社保持仓（社保+养老金，从 holderDetails 中汇总） =====
      const ssInfo = aggregateHoldersByType(s, ['社保', '养老金']);
      // ===== 外资持仓（北向资金+QFII，顶层字段已汇总，兜底用 holderDetails 汇总） =====
      const ffInfo = s.foreignRatio && s.foreignRatio > 0
        ? { ratio: s.foreignRatio, name: s.foreignName || '—', change: s.foreignChange || '—', count: s.foreignCount || 1 }
        : aggregateHoldersByType(s, ['北向资金', 'QFII', '阿布扎比', '银行', '高盛', '摩根士丹利', '摩根大通', '卢森堡', '法国巴黎银行', '汇丰', '德意志银行', '富达', '比尔盖茨', '马来西亚银行', '三井住友', '三星资产']);

      // 同一只股票按「主名」聚合成一条（赵老哥/赵强、高毅邻山1号/2号 视为同一人），
      // Map key = stockCode + primaryName，value = 累加后的明细行（ratio、holdNum 累加，change 取更激进）
      type PrimaryAgg = {
        primaryKey: string;
        holderName: string;
        ratio: number;
        holdNum: number;
        change: string;
      };
      const perPrimaryMap = new Map<string, PrimaryAgg>();

      for (const kw of matchKeywords) {
        const hit = findHolderByName(s, kw);
        // 🔍 调试：单个关键词在当前股票是否命中
        // eslint-disable-next-line no-console
        if (hit) console.debug(`  ✅ ${kw} → 命中 ${hit.name}  primaryName=${hit.primaryName} ratio=${hit.ratio.toFixed(3)}%  holdNum=${hit.holdNum||0}`);
        if (!hit) continue;
        // 放宽条件：有比例 OR 有持股数 都保留（避免 ratio 解析为 0 但有真实持股的情况）
        if (hit.ratio <= 0 && (hit.holdNum || 0) <= 0) {
          // eslint-disable-next-line no-console
          console.debug(`  ⚠️  ${kw} 命中但比例与持股数均为 0，跳过 (${s.company} ${s.stockCode})`);
          continue;
        }
        const primaryKey = `${s.stockCode}-${normalizeName(hit.primaryName)}`;
        const existing = perPrimaryMap.get(primaryKey);
        if (!existing) {
          perPrimaryMap.set(primaryKey, {
            primaryKey,
            holderName: hit.name,
            ratio: hit.ratio,
            holdNum: hit.holdNum,
            change: hit.change,
          });
        } else {
          // 同一个主名命中了多次：持股比例与持股数累加；变动状态取优先级更高的那个
          existing.ratio = Math.round((existing.ratio + hit.ratio) * 10000) / 10000;
          existing.holdNum = existing.holdNum + hit.holdNum;
          if (changePriority(hit.change) > changePriority(existing.change)) {
            existing.change = hit.change;
          }
          // 展示名保留更短/更像"主名"的那个
          if (existing.holderName.length > hit.name.length && hit.name) {
            existing.holderName = hit.name;
          }
        }
      }
      // 将每只股票按「主名」聚合后的记录展开为明细表
      for (const agg of perPrimaryMap.values()) {
        // 比例为 0 但有持股数时，用持股数反推占比（避免 holdAmount=0）
        const ratio = agg.ratio > 0 ? agg.ratio :
          (marketCap > 0 && s.currentPrice > 0 ? ((agg.holdNum || 0) * s.currentPrice) / (marketCap * 1e8) * 100 : 0);
        const holdAmount = marketCap > 0 ? marketCap * (ratio / 100) : 0;
        detailRows.push({
          stockCode: s.stockCode,
          company: s.company,
          holderName: agg.holderName,
          ratio: Math.round(ratio * 10000) / 10000,
          holdAmount: Math.round(holdAmount * 10000) / 10000,
          marketCap,
          change: agg.change,
          board: getBoard(s.stockCode),
          rating,
          ratingClassName,
          safetyFactorPct,
          socialSecRatio: ssInfo.ratio,
          socialSecName: ssInfo.name,
          socialSecChange: ssInfo.change,
          socialSecCount: ssInfo.count,
          foreignRatio: ffInfo.ratio,
          foreignName: ffInfo.name,
          foreignChange: ffInfo.change,
          foreignCount: ffInfo.count,
        });
      }
    }
    detailRows.sort((a, b) => {
      // 先按股票分组，再按金额降序（同一只股票里家族成员按比例排序）
      if (a.stockCode !== b.stockCode) {
        return b.marketCap - a.marketCap || b.holdAmount - a.holdAmount;
      }
      return b.holdAmount - a.holdAmount;
    });

    // 第2轮：按股票聚合，生成饼图切片（一家公司一个切片）
    const perStockMap = new Map<string, {
      stockCode: string;
      company: string;
      marketCap: number;
      board: string;
      totalRatio: number;      // 家族成员合计占流通股比例(%)
      totalAmount: number;     // 家族成员合计持仓金额(亿)
      members: Array<{ name: string; ratio: number; amount: number; change: string }>;
    }>();

    for (const r of detailRows) {
      let agg = perStockMap.get(r.stockCode);
      if (!agg) {
        agg = {
          stockCode: r.stockCode,
          company: r.company,
          marketCap: r.marketCap,
          board: r.board,
          totalRatio: 0,
          totalAmount: 0,
          members: [],
        };
        perStockMap.set(r.stockCode, agg);
      }
      agg.totalRatio += r.ratio;
      agg.totalAmount += r.holdAmount;
      agg.members.push({ name: r.holderName, ratio: r.ratio, amount: r.holdAmount, change: r.change });
    }

    const pieData = [...perStockMap.values()]
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .map(agg => {
        // 按持仓金额降序排列成员（展示时用）—— 先复制再排序，避免污染原数组
        const membersByAmount = [...agg.members].sort((a, b) => b.amount - a.amount);
        // 计算变动状态：复制一份成员，按变动优先级排序，取最激进的
        const firstChange = [...agg.members].sort(
          (a, b) => changePriority(b.change) - changePriority(a.change)
        )[0]?.change || '—';
        // 名单汇总：按金额降序显示
        const holderList = membersByAmount.map(m => `${m.name}(${m.ratio.toFixed(2)}%)`).join('、');
        return {
          ...agg,
          members: membersByAmount,
          _firstChange: firstChange,
          _holderList: holderList,
        };
      });

    return { pieData, detailRows };
  }, [stocks, matchKeywords]);

  // 🔍 调试：useMemo 产出后打印结果
  // eslint-disable-next-line no-console
  console.debug(
    `[游资持仓分布] 扫描完成：matchKeywords=${JSON.stringify(matchKeywords)}  ` +
    `detailRows.length=${detailRows.length}  pieData.length=${pieData.length}`
  );
  const totalHoldAmount = pieData.reduce((sum, r) => sum + r.totalAmount, 0);
  const totalStocks = pieData.length;
  const top1Ratio = totalHoldAmount > 0 && pieData[0] ? (pieData[0].totalAmount / totalHoldAmount) * 100 : 0;
  const top3Ratio = totalHoldAmount > 0
    ? (pieData.slice(0, 3).reduce((s, r) => s + r.totalAmount, 0) / totalHoldAmount) * 100
    : 0;

  return (
    <div className="max-w-full mx-auto p-4">
      {/* 顶部：选择器 + 统计卡片 */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">选择游资大佬</label>
          <div className="flex items-center gap-2">
            <select
              value={selectedName}
              onChange={e => setSelectedName(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[180px]"
            >
              {HOT_MONEY_GROUPS.map(g => (
                <optgroup key={g.label} label={g.label}>
                  {g.names.filter(n => HOT_MONEY_NAMES.includes(n)).map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <label
              className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer select-none"
              title="勾选后会将同一家族的所有成员持仓合并统计（例如章建平+章晓静+方文艳...）"
            >
              <input
                type="checkbox"
                checked={includeFamily}
                onChange={e => setIncludeFamily(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              合并家族成员
            </label>
            {onRefreshHolders && (
              <button
                onClick={onRefreshHolders}
                disabled={updatingHolders}
                className="px-3 py-1.5 text-xs bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                title="从东方财富拉取最新十大流通股东数据（游资/社保/外资）"
              >
                {updatingHolders ? '刷新持仓中...' : '刷新持仓'}
              </button>
            )}
            <button
              onClick={handleSearchMarket}
              disabled={searchingMarket}
              className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 transition-colors whitespace-nowrap"
              title="在东方财富全市场反查每位家族成员持有的所有股票（不局限于当前股票池）"
            >
              {searchingMarket ? `搜索全市场中(${marketProgress})...` : '搜索全市场'}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">按股票查游资</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={stockSearchCode}
              onChange={e => setStockSearchCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearchStock()}
              placeholder="输入股票代码或名称"
              className="px-3 py-1.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400 w-[200px]"
              title="输入股票代码（如002044）或股票名称（如美年健康）"
            />
            <button
              onClick={handleSearchStock}
              disabled={searchingStock || !stockSearchCode.trim()}
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              title="查询该股票的十大流通股东，高亮显示游资持仓"
            >
              {searchingStock ? '查询中...' : '查询'}
            </button>
          </div>
        </div>

        <div className="ml-auto flex gap-3">
          <StatCard label="持有股票" value={`${totalStocks} 只`} color="text-indigo-600" />
          <StatCard
            label="估算总持仓"
            value={totalHoldAmount >= 1 ? totalHoldAmount.toFixed(2) + ' 亿' : totalHoldAmount.toFixed(4) + ' 亿'}
            color="text-emerald-600"
          />
          <StatCard label="Top1 集中度" value={top1Ratio.toFixed(1) + '%'} color="text-pink-600" />
          <StatCard label="Top3 集中度" value={top3Ratio.toFixed(1) + '%'} color="text-amber-600" />
        </div>
      </div>

      {/* 主体：饼图 + 明细表 */}
      {pieData.length === 0 ? (
        <div className="py-16 text-center text-gray-400 border border-dashed border-gray-300 rounded bg-gray-50">
          <div className="text-3xl mb-2">📊</div>
          <div className="text-sm">当前未找到「{matchKeywords.join(' / ')}」的持仓数据</div>
          <div className="text-xs text-gray-400 mt-1">请先点击右上角「刷新持仓」按钮拉取最新十大流通股东数据</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* 饼图 */}
          <div className="lg:col-span-2 border border-gray-200 rounded p-3 bg-white" style={{ overflow: 'visible' }}>
            <div className="text-sm font-semibold text-gray-700 mb-2">
              「{matchKeywords.join(' / ')}」持仓股票分布（按家族成员合计金额）
            </div>
            <div style={{ width: '100%', height: 480, overflow: 'visible' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 40, right: 30, bottom: 10, left: 30 }}>
                  <Pie
                    data={pieData}
                    dataKey="totalAmount"
                    nameKey="company"
                    cx="50%"
                    cy="55%"
                    outerRadius={125}
                    innerRadius={55}
                    paddingAngle={1}
                    label={(props: any) => {
                      const company = props.name || '';
                      const percent = props.percent;
                      if (!percent || percent < 0.015) return '';
                      const short = String(company)
                        .replace(/\d+$/, '')
                        .replace(/\(\d+\)/g, '')
                        .replace(/（\d+）/g, '')
                        .trim()
                        .slice(0, 6);
                      const pct = (percent * 100).toFixed(percent < 0.05 ? 1 : 0);
                      return `${short} ${pct}%`;
                    }}
                    labelLine={{ stroke: '#999', strokeWidth: 1 }}
                  >
                    {pieData.map((_entry, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (active && payload && payload[0]) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white border border-gray-200 shadow-lg rounded p-2 text-xs space-y-1 min-w-[220px] max-w-[320px]">
                            <div className="font-semibold text-gray-800 truncate border-b border-gray-100 pb-1">
                              {d.company} <span className="text-gray-400 font-normal">（家族合计{d.totalRatio.toFixed(2)}%）</span>
                            </div>
                            <div className="text-gray-500">持有者名单：<span className="text-gray-700">{d._holderList || '—'}</span></div>
                            <div>合计估算金额：<span className="text-emerald-600 font-medium">{d.totalAmount.toFixed(2)} 亿</span></div>
                            <div>总市值：{d.marketCap.toFixed(0)} 亿（{d.board}）</div>
                            <div className="pl-1 space-y-0.5 mt-1 pt-1 border-t border-gray-100">
                              {(d.members || []).slice(0, 8).map((m: any, idx: number) => (
                                <div key={idx} className="flex justify-between gap-2">
                                  <span className="truncate text-gray-600">· {m.name}</span>
                                  <span className="text-right flex gap-2 flex-shrink-0">
                                    <span className="text-indigo-600">{m.ratio.toFixed(2)}%</span>
                                    <span className={m.change === '加仓' || m.change === '新进' ? 'text-red-600' : m.change === '减仓' ? 'text-green-600' : 'text-gray-500'}>
                                      {m.change}
                                    </span>
                                  </span>
                                </div>
                              ))}
                              {(d.members || []).length > 8 &&
                                <div className="text-gray-400 text-[10px]">...还有 {(d.members || []).length - 8} 位成员</div>
                              }
                            </div>
                            <div className={d._firstChange === '加仓' || d._firstChange === '新进' ? 'text-red-600 font-medium' : d._firstChange === '减仓' ? 'text-green-600' : 'text-gray-500'}>
                              主导变动：{d._firstChange}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={90}
                    wrapperStyle={{ fontSize: 11, lineHeight: '18px', paddingTop: 8 }}
                    formatter={(value: string) => {
                      const clean = String(value || '')
                        .replace(/\d+$/, '')
                        .replace(/\(\d+\)/g, '')
                        .replace(/（\d+）/g, '')
                        .trim();
                      return clean.length > 8 ? clean.slice(0, 8) : clean;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 明细表（每人一行）：同一股票的家族成员排在一起，章建平、方文艳各一行） */}
          <div className="lg:col-span-3 border border-gray-200 rounded bg-white overflow-hidden">
            <div className="p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-700">
                持仓明细（共 {detailRows.length} 条 · 覆盖 {pieData.length} 只股票）
              </div>
              <div className="text-xs text-gray-500">按股票分组，同一只股票按持仓金额降序</div>
            </div>
            <div className="overflow-auto max-h-[520px]">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-2 py-2 border-b border-gray-200 text-gray-600">#</th>
                    <th className="text-left px-2 py-2 border-b border-gray-200 text-gray-600 whitespace-nowrap">股票</th>
                    <th className="text-left px-2 py-2 border-b border-gray-200 text-gray-600 whitespace-nowrap">家族成员</th>
                    <th className="text-center px-2 py-2 border-b border-gray-200 text-gray-600 whitespace-nowrap">推荐</th>
                    <th className="text-right px-2 py-2 border-b border-gray-200 text-gray-600 whitespace-nowrap">社保/养老</th>
                    <th className="text-right px-2 py-2 border-b border-gray-200 text-gray-600 whitespace-nowrap">外资持仓</th>
                    <th className="text-right px-2 py-2 border-b border-gray-200 text-gray-600 whitespace-nowrap">板块</th>
                    <th className="text-right px-2 py-2 border-b border-gray-200 text-gray-600 whitespace-nowrap">总市值</th>
                    <th className="text-right px-2 py-2 border-b border-gray-200 text-gray-600 whitespace-nowrap">个人占比</th>
                    <th className="text-right px-2 py-2 border-b border-gray-200 text-gray-600 whitespace-nowrap">个人估算金额</th>
                    <th className="text-right px-2 py-2 border-b border-gray-200 text-gray-600 whitespace-nowrap">占总资金</th>
                    <th className="text-center px-2 py-2 border-b border-gray-200 text-gray-600 whitespace-nowrap">变动</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((r, i) => {
                    const pct = totalHoldAmount > 0 ? (r.holdAmount / totalHoldAmount) * 100 : 0;
                    return (
                      <tr key={`${r.stockCode}-${r.holderName}`} className="hover:bg-blue-50 transition-colors">
                        <td className="px-2 py-1.5 border-b border-gray-100 text-gray-400">{i + 1}</td>
                        <td className="px-2 py-1.5 border-b border-gray-100 text-gray-800 font-medium whitespace-nowrap">{r.company}</td>
                        <td className="px-2 py-1.5 border-b border-gray-100 text-gray-700 whitespace-nowrap">{r.holderName}</td>
                        <td className="px-2 py-1.5 border-b border-gray-100 text-center whitespace-nowrap"
                            title={`安全系数：${r.safetyFactorPct > 0 ? r.safetyFactorPct.toFixed(0) + '%' : '数据不足'}`}>
                          <span className={`px-1.5 py-0.5 rounded text-[11px] whitespace-nowrap ${r.ratingClassName}`}>
                            {r.rating}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 border-b border-gray-100 text-right whitespace-nowrap"
                            title={r.socialSecRatio > 0 ? `${r.socialSecName}（${r.socialSecCount}家） 变动：${r.socialSecChange}` : '无社保或养老金持仓'}>
                          {r.socialSecRatio > 0 ? (
                            <div className="leading-tight">
                              <div className="text-red-600 font-semibold">{r.socialSecRatio.toFixed(2)}%</div>
                              <div className="text-[10px] text-gray-500 truncate max-w-[90px]" style={{textAlign:'right'}}>{r.socialSecName}{r.socialSecCount > 1 ? `+${r.socialSecCount-1}` : ''}</div>
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 border-b border-gray-100 text-right whitespace-nowrap"
                            title={r.foreignRatio > 0 ? `${r.foreignName}（${r.foreignCount}家） 变动：${r.foreignChange}` : '无外资持仓（北向/QFII）'}>
                          {r.foreignRatio > 0 ? (
                            <div className="leading-tight">
                              <div className="text-orange-600 font-semibold">{r.foreignRatio.toFixed(2)}%</div>
                              <div className="text-[10px] text-gray-500 truncate max-w-[90px]" style={{textAlign:'right'}}>{r.foreignName}{r.foreignCount > 1 ? `+${r.foreignCount-1}` : ''}</div>
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 border-b border-gray-100 text-right text-gray-500">{r.board}</td>
                        <td className="px-2 py-1.5 border-b border-gray-100 text-right text-gray-600 whitespace-nowrap">{r.marketCap >= 1000 ? (r.marketCap / 10000).toFixed(2) + '万亿' : r.marketCap.toFixed(0) + '亿'}</td>
                        <td className="px-2 py-1.5 border-b border-gray-100 text-right text-indigo-600 font-medium">{r.ratio.toFixed(2)}%</td>
                        <td className="px-2 py-1.5 border-b border-gray-100 text-right text-emerald-600 font-semibold whitespace-nowrap">{r.holdAmount >= 1 ? r.holdAmount.toFixed(2) + '亿' : r.holdAmount.toFixed(3) + '亿'}</td>
                        <td className="px-2 py-1.5 border-b border-gray-100 text-right text-gray-700">{pct.toFixed(1)}%</td>
                        <td className={`px-2 py-1.5 border-b border-gray-100 text-center font-medium whitespace-nowrap ${
                          r.change === '加仓' || r.change === '新进' ? 'text-red-600' :
                          r.change === '减仓' ? 'text-green-600' : 'text-gray-500'
                        }`}>
                          {r.change}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 全市场搜索结果（独立于股票池，显示家族成员在全市场所有股票的持仓） */}
      {marketResults.length > 0 && (
        <div className="mt-6 border border-orange-300 rounded-lg bg-orange-50/30 overflow-hidden">
          <div className="px-4 py-2 bg-orange-100 border-b border-orange-200 flex items-center gap-2">
            <span className="text-sm font-semibold text-orange-800">
              🔍 全市场搜索结果：{matchKeywords.join(' / ')} （共 {marketResults.length} 条持仓，{marketByMember.length} 位成员）
            </span>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-orange-50">
                <tr className="text-gray-600">
                  <th className="text-left px-3 py-2 border-b border-orange-200 whitespace-nowrap">家族成员</th>
                  <th className="text-left px-3 py-2 border-b border-orange-200 whitespace-nowrap">股票代码</th>
                  <th className="text-left px-3 py-2 border-b border-orange-200 whitespace-nowrap">股票名称</th>
                  <th className="text-left px-3 py-2 border-b border-orange-200 whitespace-nowrap">持有人全称</th>
                  <th className="text-right px-3 py-2 border-b border-orange-200 whitespace-nowrap">占流通股</th>
                  <th className="text-right px-3 py-2 border-b border-orange-200 whitespace-nowrap">持股数(万股)</th>
                  <th className="text-center px-3 py-2 border-b border-orange-200 whitespace-nowrap">变动</th>
                  <th className="text-right px-3 py-2 border-b border-orange-200 whitespace-nowrap">报告期</th>
                  <th className="text-center px-3 py-2 border-b border-orange-200 whitespace-nowrap">状态</th>
                </tr>
              </thead>
              <tbody>
                {marketByMember.flatMap(([member, list]) =>
                  list.map((r, idx) => (
                    <tr key={`${member}-${r.stockCode}-${idx}`} className="hover:bg-orange-50/50">
                      <td className="px-3 py-1.5 border-b border-orange-100 text-orange-800 font-medium whitespace-nowrap">
                        {idx === 0 ? `${member}（${list.length}只）` : ''}
                      </td>
                      <td className="px-3 py-1.5 border-b border-orange-100 text-gray-700 whitespace-nowrap">{r.stockCode}</td>
                      <td className="px-3 py-1.5 border-b border-orange-100 text-blue-600 font-medium whitespace-nowrap">{r.stockName || '—'}</td>
                      <td className="px-3 py-1.5 border-b border-orange-100 text-gray-600">{r.holderName}</td>
                      <td className="px-3 py-1.5 border-b border-orange-100 text-right text-indigo-600 font-medium whitespace-nowrap">{r.ratio.toFixed(2)}%</td>
                      <td className="px-3 py-1.5 border-b border-orange-100 text-right text-gray-600 whitespace-nowrap">{(r.holdNum / 10000).toFixed(0)}</td>
                      <td className="px-3 py-1.5 border-b border-orange-100 text-center whitespace-nowrap">
                        <span className={
                          r.change === '加仓' || r.change === '新进' ? 'text-red-600 font-medium' :
                          r.change === '减仓' ? 'text-green-600' : 'text-gray-500'
                        }>
                          {r.change}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 border-b border-orange-100 text-right text-gray-400 whitespace-nowrap">{r.reportDate}</td>
                      <td className="px-3 py-1.5 border-b border-orange-100 text-center whitespace-nowrap">
                        {poolStockCodes.has(r.stockCode) ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">在池中</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500">非池中</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-gray-500 border-t border-orange-200">
            💡 以上数据来自东方财富全市场反查，不局限于当前股票池。「在池中」=该股票已在你的股票池里，「非池中」=需要添加到池中才能看到完整估值数据。
          </div>
        </div>
      )}

      {/* 按股票查游资结果 */}
      {stockSearchResults.length > 0 && (
        <div className="mt-6 border border-green-300 rounded-lg bg-green-50/30 overflow-hidden">
          <div className="px-4 py-2 bg-green-100 border-b border-green-200 flex items-center gap-2">
            <span className="text-sm font-semibold text-green-800">
              🔍 股票查询结果：{stockSearchResults[0]?.stockCode} {stockSearchResults[0]?.stockName}（共 {stockSearchResults.length} 位持有人，其中游资 {stockSearchResults.filter(r => r.isHotMoney).length} 位）
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-green-50">
                <tr className="text-gray-600">
                  <th className="text-center px-3 py-2 border-b border-green-200 whitespace-nowrap">排名</th>
                  <th className="text-left px-3 py-2 border-b border-green-200 whitespace-nowrap">持有人名称</th>
                  <th className="text-center px-3 py-2 border-b border-green-200 whitespace-nowrap">类型</th>
                  <th className="text-right px-3 py-2 border-b border-green-200 whitespace-nowrap">占流通股</th>
                  <th className="text-right px-3 py-2 border-b border-green-200 whitespace-nowrap">持股数(万股)</th>
                  <th className="text-center px-3 py-2 border-b border-green-200 whitespace-nowrap">变动</th>
                  <th className="text-right px-3 py-2 border-b border-green-200 whitespace-nowrap">报告期</th>
                </tr>
              </thead>
              <tbody>
                {stockSearchResults.map((r, idx) => (
                  <tr key={idx} className={`hover:bg-green-50/50 ${r.isHotMoney ? 'bg-red-50/30' : ''}`}>
                    <td className="px-3 py-1.5 border-b border-green-100 text-center text-gray-500 whitespace-nowrap">#{r.holderRank || idx + 1}</td>
                    <td className={`px-3 py-1.5 border-b border-green-100 font-medium ${r.isHotMoney ? 'text-red-700' : 'text-gray-800'}`}>
                      {r.isHotMoney && <span className="text-red-500 mr-1">🔥</span>}
                      {r.holderName}
                    </td>
                    <td className="px-3 py-1.5 border-b border-green-100 text-center whitespace-nowrap">
                      {r.isHotMoney ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-700">游资</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600">{r.holderType || '其他'}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 border-b border-green-100 text-right text-indigo-600 font-medium whitespace-nowrap">{r.ratio.toFixed(2)}%</td>
                    <td className="px-3 py-1.5 border-b border-green-100 text-right text-gray-600 whitespace-nowrap">{(r.holdNum / 10000).toFixed(0)}</td>
                    <td className="px-3 py-1.5 border-b border-green-100 text-center whitespace-nowrap">
                      <span className={
                        r.change === '加仓' || r.change === '新进' ? 'text-red-600 font-medium' :
                        r.change === '减仓' ? 'text-green-600' : 'text-gray-500'
                      }>
                        {r.change}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 border-b border-green-100 text-right text-gray-400 whitespace-nowrap">{r.reportDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-gray-500 border-t border-green-200">
            💡 🔥标记 = 该持有人在游资白名单中。可结合「选择游资大佬」功能进一步查看该游资的完整持仓分布。
          </div>
        </div>
      )}

      {/* 底部提示说明 */}
      <div className="mt-4 px-3 py-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700 leading-relaxed">
        <strong>💡 估算口径说明：</strong>饼图切片大小 = 个股总市值（亿）× 该股东占流通股比例。
        数据来源于公司定期报告披露的<strong>前十大流通股东</strong>，所以游资如果没进前十大就不会显示。
        未进前十大的零散席位 / 龙虎榜数据暂未纳入。
        如果某只股票找不到对应大佬，请点击顶部「刷新持仓」按钮重新拉取十大流通股东数据。
      </div>
    </div>
  );
}

// ===== 小组件：统计卡片 =====
function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="px-4 py-2 border border-gray-200 rounded bg-white shadow-sm min-w-[110px]">
      <div className="text-[11px] text-gray-500 leading-none">{label}</div>
      <div className={`mt-1 text-sm font-bold leading-tight ${color}`}>{value}</div>
    </div>
  );
}

// ===== 工具：板块判断 =====
function getBoard(code: string): string {
  if (!code) return '-';
  const c = code.trim();
  if (/^688/.test(c)) return '科创板';
  if (/^30[01]/.test(c)) return '创业板';
  if (/^60[0-5]/.test(c)) return '沪主板';
  if (/^0[0-3]/.test(c)) return '深主板';
  if (/^[48]/.test(c) && c.length >= 5) return '北交所';
  // 港股：1-5位纯数字
  if (/^\d{1,5}$/.test(c)) return '港股';
  return '-';
}
