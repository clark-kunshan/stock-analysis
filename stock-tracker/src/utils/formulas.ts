// 估值计算公式引擎 - 完全匹配Excel公式
import type { PEGStock, PEGCalcResult } from '../types/peg.ts';
import type { PEStock, PECalcResult } from '../types/pe.ts';
import type { IndexValuation, IndexCalcResult } from '../types/index.ts';

// ============ PEG估值法公式 ============

/**
 * 归一化 CAGR：确保始终为小数格式（0.15 = 15%）
 * 如果值 > 1，说明是百分比格式（15.4），除以 100 转小数
 */
export function normalizeCAGR(cagr: number): number {
  if (!cagr || isNaN(cagr)) return 0;
  if (cagr > 1) return cagr / 100;
  return cagr;
}

// R: PEG(E) = Q / (P * 100)
// Excel: R7 = Q7/(P7*100)
export function calcPEG(pe: number, cagr: number): number {
  const c = normalizeCAGR(cagr);
  if (c === 0) return 0;
  return pe / (c * 100);
}

// H: 理想买点 = F / R * 0.75 * E%
// Excel: H7 = F7/R7*0.75*E7%
export function calcIdealBuyPoint(price: number, peg: number, prosperityIndex: number): number {
  if (peg === 0) return 0;
  return price / peg * 0.75 * (prosperityIndex / 100);
}

// G: 合理价位 = H / 0.75
// Excel: G7 = H7/0.75
export function calcFairValue(idealBuyPoint: number): number {
  return idealBuyPoint / 0.75;
}

// I: 减仓价位 = G * 1.5
// Excel: I7 = G7*1.5
export function calcReducePosition(fairValue: number): number {
  return fairValue * 1.5;
}

// J: 1年内卖点 = F / R * 2 * E%
// Excel: J7 = F7/R7*2*E7%
export function calcOneYearSellPoint(price: number, peg: number, prosperityIndex: number): number {
  if (peg === 0) return 0;
  return price / peg * 2 * (prosperityIndex / 100);
}

// L: 3年后理想估值(亿) = K / R * (1+P)^3 * E%
// Excel: L7 = K7/R7*(1+P7)^3*E7%
export function calcThreeYearValuation(marketCap: number, peg: number, cagr: number, prosperityIndex: number): number {
  if (peg === 0) return 0;
  const c = normalizeCAGR(cagr);
  return marketCap / peg * Math.pow(1 + c, 3) * (prosperityIndex / 100);
}

// B: 安全系数 = H / F
// Excel: B7 = H7/F7
export function calcSafetyFactor(idealBuyPoint: number, currentPrice: number): number {
  if (currentPrice === 0) return 0;
  return idealBuyPoint / currentPrice;
}

// PEG完整计算
// PEG(E) 始终用公式计算：前瞻PE / (CAGR * 100)
// pegCar（机构一致预期）只在"机构预期PEG"列单独展示，不参与公式计算
export function calcPEGStock(stock: PEGStock): PEGCalcResult {
  const cagr = normalizeCAGR(stock.cagr);
  const peg = calcPEG(stock.pe, stock.cagr);
  const idealBuyPoint = calcIdealBuyPoint(stock.currentPrice, peg, stock.prosperityIndex);
  const fairValue = calcFairValue(idealBuyPoint);
  const reducePosition = calcReducePosition(fairValue);
  const oneYearSellPoint = calcOneYearSellPoint(stock.currentPrice, peg, stock.prosperityIndex);
  const threeYearValuation = calcThreeYearValuation(stock.marketCap, peg, cagr, stock.prosperityIndex);
  const safetyFactor = calcSafetyFactor(idealBuyPoint, stock.currentPrice);

  return { peg, idealBuyPoint, fairValue, reducePosition, oneYearSellPoint, threeYearValuation, safetyFactor };
}

// 判断是否有 EPS 预测数据
export function hasEpsData(stock: { eps2026?: number; eps2027?: number; eps2028?: number }): boolean {
  return !!(stock.eps2026 || stock.eps2027 || stock.eps2028);
}

// 获取显示用的 CAGR：
// 1. 有 EPS 数据 → 用 stock.cagr
// 2. 无 EPS 数据 → 返回 0（不使用 pegCar 反算，因为 TTM PE 反推增长率不准确）
export function getDisplayCAGR(stock: { cagr?: number; pegCar?: number; pe?: number; eps2026?: number; eps2027?: number; eps2028?: number }): number {
  if (hasEpsData(stock) && stock.cagr) {
    return stock.cagr;
  }
  return 0;
}

// ============ PE区间估值法公式 ============

// H: 加仓点 = E * F
// Excel: H4 = E4*F4
export function calcPEBuyPoint(eps: number, peLow: number): number {
  return eps * peLow;
}

// I: 减仓点 = E * G
// Excel: I4 = E4*G4
export function calcPESellPoint(eps: number, peHigh: number): number {
  return eps * peHigh;
}

// M: 当前评级 - 根据收盘价与加仓点/减仓点比较
export function calcPERating(closingPrice: number, buyPoint: number, sellPoint: number): PECalcResult['rating'] {
  if (closingPrice === 0 || buyPoint === 0) return '合理';
  if (closingPrice <= buyPoint * 0.8) return '严重低估';
  if (closingPrice <= buyPoint) return '低估';
  if (closingPrice >= sellPoint * 1.2) return '严重高估';
  if (closingPrice >= sellPoint) return '高估';
  return '合理';
}

// PE完整计算
export function calcPEStock(stock: PEStock): PECalcResult {
  const buyPoint = calcPEBuyPoint(stock.avgEPS, stock.peLow);
  const sellPoint = calcPESellPoint(stock.avgEPS, stock.peHigh);
  const rating = calcPERating(stock.closingPrice, buyPoint, sellPoint);
  return { buyPoint, sellPoint, rating };
}

// ============ 指数估值公式 ============

// G: 修正后分位点 = F * I
// Excel: H5 = G5*K5 (修正后分位点 = 10年分位点 * 加权)
export function calcAdjustedPercentile(percentile: number, weight: number): number {
  return percentile * weight;
}

// H: 估值等级判断
// ≥90 严重高估, 75-90 高估, 25-75 合理, 10-25 低估, ≤10 严重低估
export function calcValuationRating(adjustedPercentile: number): IndexCalcResult['valuation'] {
  if (adjustedPercentile >= 90) return '严重高估';
  if (adjustedPercentile >= 75) return '高估';
  if (adjustedPercentile >= 25) return '合理';
  if (adjustedPercentile >= 10) return '低估';
  return '严重低估';
}

// 指数完整计算
export function calcIndexValuation(index: IndexValuation): IndexCalcResult {
  const adjustedPercentile = calcAdjustedPercentile(index.percentile10Y, index.weight);
  const valuation = calcValuationRating(adjustedPercentile);
  return { adjustedPercentile, valuation };
}

// ============ 格式化工具 ============

export function formatNumber(num: number, decimals: number = 2): string {
  if (!num && num !== 0) return '-';
  if (isNaN(num)) return '-';
  return num.toFixed(decimals);
}

export function formatMarketCap(num: number): string {
  if (!num) return '-';
  if (num >= 10000) return (num / 10000).toFixed(2) + '万亿';
  return num.toFixed(0) + '亿';
}

export function formatPercent(num: number): string {
  if (!num && num !== 0) return '-';
  return num.toFixed(2) + '%';
}

export function getValuationColor(valuation: string): string {
  switch (valuation) {
    case '严重高估': return 'valuation-severe-high';
    case '高估': return 'valuation-high';
    case '合理': return 'valuation-fair';
    case '低估': return 'valuation-low';
    case '严重低估': return 'valuation-severe-low';
    default: return '';
  }
}

export function getChangeColor(value: number): string {
  if (value > 0) return 'text-red-600';
  if (value < 0) return 'text-green-600';
  return 'text-gray-500';
}

/** 根据股票代码判断所属板块 */
export function getStockBoard(stockCode: string): string {
  if (!stockCode) return '-';
  const c = stockCode.trim();
  if (/^688/.test(c)) return '科创板';
  if (/^30[01]/.test(c)) return '创业板';
  if (/^60[0-5]/.test(c)) return '沪主板';
  if (/^0[0-3]/.test(c)) return '深主板';
  if (/^[48]/.test(c) && c.length >= 5) return '北交所';
  return '-';
}

/** 基于K线技术分析的入场信号
 * 综合均线、金叉、量能、突破形态判断买卖时机
 * 返回信号等级、文字、样式类名和强度分数(0-100)
 */
export function getEntrySignal(stock: PEGStock): { level: 'strong' | 'medium' | 'weak' | 'none'; text: string; className: string; strength: number } {
  const klines = stock.recentKlines;

  // 如果没有K线数据，回退到简单价格信号
  if (!klines || klines.length < 20) {
    const change = stock.changePercent ?? 0;
    if (change >= 3) return { level: 'weak', text: `↑ +${change.toFixed(1)}%`, className: 'text-red-600', strength: 30 };
    if (change <= -3) return { level: 'weak', text: `↓ ${change.toFixed(1)}%`, className: 'text-green-600', strength: 10 };
    return { level: 'none', text: '—', className: 'text-gray-400', strength: 0 };
  }

  // 计算技术指标
  const ma5 = calculateMA(klines, 5);
  const ma10 = calculateMA(klines, 10);
  const ma20 = calculateMA(klines, 20);
  const ma60 = calculateMA(klines, 60);
  const latestIdx = klines.length - 1;
  const latestClose = klines[latestIdx].close;
  const volumeTrend = calculateVolumeTrend(klines, 5);

  // 1) 最强信号：放量突破 + 均线多头
  const volumeBreakout = detectVolumeBreakout(klines, ma20);
  const maAlignment = getMAAlignment(ma5[latestIdx] || 0, ma10[latestIdx] || 0, ma20[latestIdx] || 0, ma60[latestIdx] || 0);
  const goldenCrossMA5MA20 = detectGoldenCross(ma5, ma20);

  if (volumeBreakout && maAlignment === 'bullish') {
    return { level: 'strong', text: '🚀 强势突破', className: 'bg-gradient-to-r from-red-500 to-orange-500 text-white font-bold px-2 py-0.5 rounded shadow-lg', strength: 95 };
  }

  // 2) 强信号：均线多头 + 金叉
  if (maAlignment === 'bullish' && goldenCrossMA5MA20) {
    return { level: 'strong', text: '📈 金叉买入', className: 'bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold px-2 py-0.5 rounded shadow-lg', strength: 90 };
  }

  // 3) 强信号：放量突破
  if (volumeBreakout && volumeTrend >= 0.3) {
    return { level: 'strong', text: '🔥 放量突破', className: 'bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded border border-red-300', strength: 85 };
  }

  // 4) 中等信号：上升趋势中 + 均线多头
  const inUpTrend = isInUpTrend(klines, ma20);
  if (inUpTrend && maAlignment === 'bullish') {
    return { level: 'medium', text: '📈 上升趋势', className: 'bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded', strength: 70 };
  }

  // 5) 中等信号：支撑位反弹
  const supportRebound = detectSupportRebound(klines, ma20, ma60);
  if (supportRebound) {
    return { level: 'medium', text: '🛡️ 支撑反弹', className: 'bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded', strength: 65 };
  }

  // 6) 中等信号：MA5金叉MA10
  const goldenCrossMA5MA10 = detectGoldenCross(ma5, ma10);
  if (goldenCrossMA5MA10) {
    return { level: 'medium', text: '⚡ MA5金叉', className: 'bg-green-50 text-green-700 font-semibold px-2 py-0.5 rounded', strength: 60 };
  }

  // 7) 弱信号：站上MA20
  const latestMA20 = ma20[latestIdx] || 0;
  if (latestClose >= latestMA20 * 1.005 && !inUpTrend) {
    return { level: 'weak', text: '📌 站上MA20', className: 'bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded', strength: 40 };
  }

  // 8) 弱信号：量能放大
  if (volumeTrend >= 0.5 && !volumeBreakout) {
    return { level: 'weak', text: '💧 量能放大', className: 'bg-blue-50 text-blue-700 px-2 py-0.5 rounded', strength: 35 };
  }

  // 9) 下降趋势警示
  const inDownTrend = isInDownTrend(klines, ma20);
  const deathCrossMA5MA20 = detectDeathCross(ma5, ma20);
  if (inDownTrend || deathCrossMA5MA20) {
    return { level: 'weak', text: '⬇️ 下降趋势', className: 'bg-gray-100 text-gray-600 px-2 py-0.5 rounded', strength: 15 };
  }

  // 10) 震荡整理
  if (maAlignment === 'mixed') {
    return { level: 'none', text: '➡️ 震荡整理', className: 'bg-gray-50 text-gray-500 px-2 py-0.5 rounded', strength: 20 };
  }

  return { level: 'none', text: '—', className: 'text-gray-400', strength: 0 };
}

/** 判断主升浪起点信号
 * 综合条件：
 * 1) 均线多头排列刚形成（MA5>MA10>MA20>MA60 且近期才完成排列）
 * 2) 突破长期盘整平台（60日内价格区间收窄后放量突破）
 * 3) 量能持续放大（连续2-3日递增）
 * 4) 底部构筑完成（有过筑底过程）
 */
export function getMainTrendSignal(stock: PEGStock): { 
  signal: '主升浪启动' | '蓄势待发' | '趋势形成中' | '观望'; 
  className: string; 
  reason: string;
} {
  const klines = stock.recentKlines;
  
  if (!klines || klines.length < 30) {
    return { signal: '观望', className: 'text-gray-400', reason: '数据不足' };
  }

  const ma5 = calculateMA(klines, 5);
  const ma10 = calculateMA(klines, 10);
  const ma20 = calculateMA(klines, 20);
  const ma60 = calculateMA(klines, 60);
  const latestIdx = klines.length - 1;
  const latestClose = klines[latestIdx].close;

  const ma5Val = ma5[latestIdx] || 0;
  const ma10Val = ma10[latestIdx] || 0;
  const ma20Val = ma20[latestIdx] || 0;
  const ma60Val = ma60[latestIdx] || 0;
  const isMaBullish = ma5Val > ma10Val && ma10Val > ma20Val && ma20Val > ma60Val;

  let justFormedBullish = false;
  for (let i = 1; i <= 5; i++) {
    const idx = Math.max(0, latestIdx - i);
    const m5 = ma5[idx] || 0;
    const m10 = ma10[idx] || 0;
    const m20 = ma20[idx] || 0;
    const m60 = ma60[idx] || 0;
    if (!(m5 > m10 && m10 > m20 && m20 > m60)) {
      justFormedBullish = true;
      break;
    }
  }

  const recent60 = klines.slice(-60);
  const high60 = Math.max(...recent60.map(k => k.close));
  const low60 = Math.min(...recent60.map(k => k.close));
  const range60 = low60 > 0 ? (high60 - low60) / low60 : 0;
  const isConsolidation = range60 > 0 && range60 <= 0.35;
  
  const aboveResistance = latestClose >= high60 * 0.98;
  const volumeTrend = calculateVolumeTrend(klines, 5);
  const volumeBreakout = detectVolumeBreakout(klines, ma20);
  const isBreakout = aboveResistance && (volumeBreakout || volumeTrend >= 0.3);

  const recentVolumes = klines.slice(-5).map(k => k.volume);
  const volIncreaseCount = recentVolumes.reduce((count, v, i) => {
    if (i === 0) return 0;
    return count + (v > recentVolumes[i-1] ? 1 : 0);
  }, 0);
  const hasSustainedVolume = volIncreaseCount >= 2;

  const recent20 = klines.slice(-20);
  const minIdx = recent20.reduce((minI, k, i) => k.close < recent20[minI].close ? i : minI, 0);
  const bottomRecovery = minIdx < recent20.length - 3 && 
    recent20[recent20.length - 1].close > recent20[minIdx].close * 1.05;

  if (isMaBullish && justFormedBullish && isBreakout && hasSustainedVolume) {
    return { 
      signal: '主升浪启动', 
      className: 'bg-gradient-to-r from-red-500 to-orange-500 text-white font-bold px-2 py-0.5 rounded shadow-lg', 
      reason: '均线多头刚形成+放量突破盘整+量能持续' 
    };
  }

  if (isConsolidation && aboveResistance && volumeTrend >= 0.2 && bottomRecovery) {
    return { 
      signal: '蓄势待发', 
      className: 'bg-gradient-to-r from-orange-400 to-yellow-400 text-white font-semibold px-2 py-0.5 rounded', 
      reason: '盘整末期+放量接近压力位+底部已确认' 
    };
  }

  if (isMaBullish && isInUpTrend(klines, ma20) && volumeTrend >= 0.1) {
    return { 
      signal: '趋势形成中', 
      className: 'bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded', 
      reason: '均线多头+上升趋势+量能配合' 
    };
  }

  return { signal: '观望', className: 'text-gray-400', reason: '暂不满足主升浪条件' };
}

// ========== 技术指标计算辅助函数 ==========
function calculateMA(klines: { close: number }[], period: number): number[] {
  const result: number[] = [];
  let sum = 0;
  for (let i = 0; i < klines.length; i++) {
    sum += klines[i].close;
    if (i >= period - 1) {
      if (i >= period) sum -= klines[i - period].close;
      result.push(sum / period);
    } else {
      result.push(0);
    }
  }
  return result;
}

function getMAAlignment(ma5: number, ma10: number, ma20: number, ma60: number): 'bullish' | 'bearish' | 'mixed' {
  if (ma5 > ma10 && ma10 > ma20 && ma20 > ma60) return 'bullish';
  if (ma5 < ma10 && ma10 < ma20 && ma20 < ma60) return 'bearish';
  return 'mixed';
}

function detectGoldenCross(maShort: number[], maLong: number[], index?: number): boolean {
  const idx = index ?? maShort.length - 1;
  if (idx < 1 || idx >= maShort.length) return false;
  return maShort[idx - 1] < maLong[idx - 1] && maShort[idx] >= maLong[idx];
}

function detectDeathCross(maShort: number[], maLong: number[], index?: number): boolean {
  const idx = index ?? maShort.length - 1;
  if (idx < 1 || idx >= maShort.length) return false;
  return maShort[idx - 1] > maLong[idx - 1] && maShort[idx] <= maLong[idx];
}

function calculateVolumeTrend(klines: { volume: number }[], days: number = 5): number {
  if (klines.length < days * 2) return 0;
  const recent = klines.slice(-days).map(k => k.volume);
  const previous = klines.slice(-days * 2, -days).map(k => k.volume);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / days;
  const prevAvg = previous.reduce((a, b) => a + b, 0) / days;
  return prevAvg === 0 ? 0 : (recentAvg - prevAvg) / prevAvg;
}

function detectVolumeBreakout(klines: { close: number; open: number; volume: number }[], ma20: number[]): boolean {
  if (klines.length < 5 || ma20.length < 5) return false;
  const latest = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  const latestMA20 = ma20[ma20.length - 1];
  const aboveMA20 = latest.close >= latestMA20 * 1.005;
  const volumeSpike = prev.volume > 0 && latest.volume >= prev.volume * 1.5;
  const priceIncrease = prev.close > 0 && (latest.close - prev.close) / prev.close >= 0.02;
  return aboveMA20 && volumeSpike && priceIncrease;
}

function detectSupportRebound(klines: { close: number; open: number }[], ma20: number[], ma60: number[]): boolean {
  if (klines.length < 3 || ma20.length < 3 || ma60.length < 3) return false;
  const latest = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  const latestMA20 = ma20[ma20.length - 1];
  const latestMA60 = ma60[ma60.length - 1];
  const nearMA20 = prev.close <= latestMA20 * 1.02;
  const nearMA60 = prev.close <= latestMA60 * 1.02;
  const todayUp = latest.close > latest.open && prev.close > 0 && (latest.close - prev.close) / prev.close >= 0.01;
  return (nearMA20 || nearMA60) && todayUp;
}

function isInUpTrend(klines: { close: number }[], ma20: number[]): boolean {
  if (klines.length < 20 || ma20.length < 20) return false;
  const latestClose = klines[klines.length - 1].close;
  const latestMA20 = ma20[ma20.length - 1];
  const aboveMA20 = latestClose >= latestMA20;
  const ma20TrendUp = ma20.slice(-10).every((val, idx, arr) => idx === 0 || val >= arr[idx - 1]);
  return aboveMA20 && ma20TrendUp;
}

function isInDownTrend(klines: { close: number }[], ma20: number[]): boolean {
  if (klines.length < 20 || ma20.length < 20) return false;
  const latestClose = klines[klines.length - 1].close;
  const latestMA20 = ma20[ma20.length - 1];
  const belowMA20 = latestClose < latestMA20;
  const ma20TrendDown = ma20.slice(-10).every((val, idx, arr) => idx === 0 || val <= arr[idx - 1]);
  return belowMA20 && ma20TrendDown;
}

/** 基本面综合评分（满分100分）
 * 返回总分 + 详细计算过程（每项含原始值、得分、满分）
 */
export function getFundamentalScore(stock: PEGStock): {
  total: number;
  details: string;
  breakdown: Array<{ name: string; rawValue: string; score: number; max: number }>;
} {
  const roe = stock.roe ?? 0;
  const gm = stock.grossMargin ?? 0;
  const cagrRaw = normalizeCAGR(stock.cagr);
  const cagr = cagrRaw * 100;
  const dr = stock.debtRatio ?? 0;
  const dy = stock.divYield ?? 0;
  const peg = stock.pegCar ?? 0;
  const gw = stock.goodwillRatio; // 商誉占归母净资产比例(%)，undefined=未获取

  let total = 0;
  const breakdown: Array<{ name: string; rawValue: string; score: number; max: number }> = [];

  // 1. ROE (22分)
  let roeScore = 0;
  if (roe >= 20) roeScore = 22;
  else if (roe >= 15) roeScore = 16;
  else if (roe >= 10) roeScore = 11;
  else if (roe >= 5) roeScore = 5;
  total += roeScore;
  breakdown.push({ name: 'ROE', rawValue: roe > 0 ? roe.toFixed(1) + '%' : '-', score: roeScore, max: 22 });

  // 2. 毛利率 (18分)
  let gmScore = 0;
  if (gm >= 40) gmScore = 18;
  else if (gm >= 25) gmScore = 13;
  else if (gm >= 15) gmScore = 7;
  else if (gm > 0) gmScore = 3;
  total += gmScore;
  breakdown.push({ name: '毛利率', rawValue: gm > 0 ? gm.toFixed(1) + '%' : '-', score: gmScore, max: 18 });

  // 3. 成长性CAGR (18分)
  let cagrScore = 0;
  if (cagr >= 20) cagrScore = 18;
  else if (cagr >= 10) cagrScore = 13;
  else if (cagr >= 5) cagrScore = 7;
  else if (cagr > 0) cagrScore = 3;
  total += cagrScore;
  breakdown.push({ name: '成长性CAGR', rawValue: cagr > 0 ? cagr.toFixed(1) + '%' : '-', score: cagrScore, max: 18 });

  // 4. 资产负债率 (12分)
  let drScore = 0;
  if (dr > 0 && dr <= 30) drScore = 12;
  else if (dr > 0 && dr <= 50) drScore = 8;
  else if (dr > 0 && dr <= 65) drScore = 4;
  total += drScore;
  breakdown.push({ name: '资产负债率', rawValue: dr > 0 ? dr.toFixed(1) + '%' : '-', score: drScore, max: 12 });

  // 5. 股息率 (10分)
  let dyScore = 0;
  if (dy >= 3) dyScore = 10;
  else if (dy >= 2) dyScore = 7;
  else if (dy >= 1) dyScore = 4;
  total += dyScore;
  breakdown.push({ name: '股息率', rawValue: dy > 0 ? dy.toFixed(2) + '%' : '-', score: dyScore, max: 10 });

  // 6. PEG估值 (10分)
  let pegScore = 0;
  if (peg > 0 && peg <= 0.8) pegScore = 10;
  else if (peg > 0 && peg <= 1.2) pegScore = 7;
  else if (peg > 0 && peg <= 1.5) pegScore = 4;
  total += pegScore;
  breakdown.push({ name: 'PEG', rawValue: peg > 0 ? peg.toFixed(2) : '-', score: pegScore, max: 10 });

  // 7. 商誉减值风险 (10分) —— 商誉占归母净资产比例越低越安全
  //    无商誉/极低占比得满分；占比越高，未来减值冲击利润的风险越大，扣分越多
  let gwScore = 0;
  let gwRaw: string;
  if (gw === undefined) {
    gwScore = 10;              // 数据未获取，暂视为无重大减值风险
    gwRaw = '-';
  } else if (gw <= 0) {
    gwScore = 10;              // 无商誉
    gwRaw = '无';
  } else if (gw <= 10) {
    gwScore = 10;              // 占比≤10%，风险极低
    gwRaw = gw.toFixed(1) + '%';
  } else if (gw <= 20) {
    gwScore = 8;
    gwRaw = gw.toFixed(1) + '%';
  } else if (gw <= 30) {
    gwScore = 6;
    gwRaw = gw.toFixed(1) + '%';
  } else if (gw <= 50) {
    gwScore = 3;
    gwRaw = gw.toFixed(1) + '%';
  } else {
    gwScore = 0;              // 占比>50%，减值风险高
    gwRaw = gw.toFixed(1) + '%';
  }
  total += gwScore;
  breakdown.push({ name: '商誉减值', rawValue: gwRaw, score: gwScore, max: 10 });

  const details = breakdown.map(b => `${b.name} ${b.rawValue} → ${b.score}/${b.max}`).join('\n');

  return { total, details, breakdown };
}

/** 基本面评分样式 */
export function getFundamentalClass(score: number): string {
  if (score >= 80) return 'bg-emerald-100 text-emerald-800 font-bold';
  if (score >= 60) return 'bg-blue-100 text-blue-700 font-semibold';
  if (score >= 40) return 'bg-yellow-100 text-yellow-700';
  if (score > 0) return 'bg-red-100 text-red-600';
  return 'text-gray-300';
}

/** 综合操作建议 — 三维度综合判断"买入/观望/持有/卖出"
 *  估值维度：安全系数（>0.75 低估, 0.5-0.75 合理, 0.25-0.5 偏高, <0.25 高估）
 *  技术维度：getEntrySignal 的 strength（>=60 看多, <40 看空, 中间震荡）
 *  基本面：getFundamentalScore 的 total（>60 合格门槛）
 */
export function getActionSignal(
  stock: PEGStock,
  safetyFactor: number
): { action: string; reason: string; className: string } {

  if (!stock.currentPrice || safetyFactor === 0) {
    return { action: '—', reason: '数据不足', className: 'text-gray-400' };
  }

  const entrySignal = getEntrySignal(stock);
  const fundamental = getFundamentalScore(stock);
  const techStrength = entrySignal.strength;
  const fundamentalScore = fundamental.total;
  const isBullishTech = techStrength >= 60;
  const isBearishTech = techStrength < 40;

  if (safetyFactor < 0.25) {
    return {
      action: '卖出',
      reason: '估值严重高估',
      className: 'bg-green-600 text-white font-bold',
    };
  }

  if (safetyFactor > 0.75) {
    if (isBullishTech && fundamentalScore > 60) {
      const techText = techStrength >= 85 ? '技术面强势' : '技术面转强';
      return {
        action: '买入',
        reason: `估值偏低，${techText}`,
        className: 'bg-red-600 text-white font-bold',
      };
    }
    if (isBullishTech && fundamentalScore <= 60) {
      return {
        action: '观望',
        reason: '估值低但基本面待改善',
        className: 'bg-amber-100 text-amber-800 font-semibold',
      };
    }
    if (isBearishTech) {
      return {
        action: '观望',
        reason: '估值低但趋势向下，等企稳',
        className: 'bg-amber-100 text-amber-800 font-semibold',
      };
    }
    return {
      action: '分批建仓',
      reason: '估值偏低，逢低布局',
      className: 'bg-red-100 text-red-700 font-semibold',
    };
  }

  if (safetyFactor >= 0.5) {
    if (isBullishTech && fundamentalScore > 60) {
      return {
        action: '持有',
        reason: '估值合理，趋势尚可',
        className: 'bg-gray-100 text-gray-700 font-medium',
      };
    }
    return {
      action: '持有',
      reason: '估值合理，维持仓位',
      className: 'bg-gray-100 text-gray-700',
    };
  }

  if (isBearishTech) {
    return {
      action: '减仓',
      reason: '估值偏高且趋势走弱',
      className: 'bg-green-100 text-green-700 font-semibold',
    };
  }
  return {
    action: '谨慎持有',
    reason: '估值偏高，注意风险',
    className: 'bg-orange-100 text-orange-700 font-medium',
  };
}

// ============ 行业洞察分析 ============

const INDUSTRY_MAP: Record<string, string> = {
  '互联网': '互联网', '科技': '互联网', '互联网医疗': '互联网',
  '科技硬件': '科技硬件', '半导体': '科技硬件',
  '医药': '医药', '医药流通': '医药', '医疗器械': '医药',
  '食品饮料': '食品饮料',
  '消费': '消费', '消费服务': '消费', '纺织服装': '消费', '零售': '消费', '餐饮': '消费', '游戏': '互联网', '电子商务': '互联网',
  '银行': '银行', '金融': '银行',
  '证券': '证券',
  '保险': '保险', '保险科技': '保险',
  '地产': '地产', '物业服务': '地产', 'REITs': '地产',
  '公用事业': '公用事业', '电力': '公用事业', '燃气': '公用事业',
  '能源': '能源', '石油能源': '能源',
  '新能源': '新能源', '动力电池': '新能源', '新能源材料': '新能源',
  '汽车': '汽车', '汽车零售': '汽车', '汽车零部件': '汽车',
  '家电': '家电', '材料': '材料',
  '基建': '基建', '交通基建': '基建',
  '物流': '物流', '航运': '物流',
  '航空': '航空', '综合企业': '综合', '港股': '综合', '教育': '教育',
};

function normalizeIndustry(industry: string): string {
  if (!industry) return '未分类';
  for (const [key, value] of Object.entries(INDUSTRY_MAP)) {
    if (industry.includes(key)) return value;
  }
  return industry;
}

export interface IndustryInsight {
  industry: string;
  stockCount: number;
  avgProsperityIndex: number;
  avgSafetyFactor: number;
  avgFundamentalScore: number;
  avgTechStrength: number;
  avgYearChange: number;
  buyRatio: number;
  sellRatio: number;
  compositeScore: number;
  status: 'boom' | 'neutral' | 'recession';
  statusText: string;
  statusColor: string;
  topStocks: Array<{ stockCode: string; company: string; safetyFactor: number; fundamentalScore: number; actionSignal: string }>;
}

export function getIndustryInsights(stocks: PEGStock[]): IndustryInsight[] {
  const industryGroups = new Map<string, PEGStock[]>();
  for (const stock of stocks) {
    if (!stock.stockCode || !stock.currentPrice) continue;
    const industry = normalizeIndustry(stock.highlight);
    if (!industryGroups.has(industry)) industryGroups.set(industry, []);
    industryGroups.get(industry)!.push(stock);
  }

  const insights: IndustryInsight[] = [];
  for (const [industry, industryStocks] of industryGroups) {
    if (industryStocks.length < 1) continue;

    // 只对有有效估值数据的股票进行评分（pe>0, cagr>0, prosperityIndex>0）
    const validStocks = industryStocks.filter(s =>
      s.currentPrice > 0 && s.pe > 0 && s.cagr > 0 && s.prosperityIndex > 0
    );

    let totalProsperity = 0, totalSafety = 0, totalFundamental = 0, totalTechStrength = 0, totalYearChange = 0;
    let buyCount = 0, sellCount = 0;
    let scoredCount = validStocks.length;

    if (scoredCount === 0) {
      // 没有完整估值数据的行业，用行业内所有股票做基础评分
      // 景气指数（如果有）+ 年内涨幅作为简单判断
      const stocksWithSomeData = industryStocks.filter(s =>
        s.currentPrice > 0 && (s.prosperityIndex > 0 || s.yearChange !== 0)
      );
      if (stocksWithSomeData.length === 0) {
        scoredCount = industryStocks.length;
        for (const stock of industryStocks) {
          totalProsperity += 50; // 默认中性景气
          totalSafety += 0.5;    // 默认安全系数
          totalFundamental += 50; // 默认基本面
          totalTechStrength += 50; // 默认技术面
          totalYearChange += 0;
        }
      } else {
        scoredCount = stocksWithSomeData.length;
        for (const stock of stocksWithSomeData) {
          const fundamental = getFundamentalScore(stock);
          const entrySignal = getEntrySignal(stock);
          totalProsperity += stock.prosperityIndex > 0 ? stock.prosperityIndex : 50;
          totalSafety += 0.5;
          totalFundamental += fundamental.total > 0 ? fundamental.total : 50;
          totalTechStrength += entrySignal.strength > 0 ? entrySignal.strength : 50;
          totalYearChange += stock.yearChange || 0;
        }
      }
    } else {
      for (const stock of validStocks) {
        const pegResult = calcPEGStock(stock);
        const safety = pegResult.safetyFactor;
        const fundamental = getFundamentalScore(stock);
        const entrySignal = getEntrySignal(stock);
        const actionSignal = getActionSignal(stock, safety);

        totalProsperity += stock.prosperityIndex;
        totalSafety += safety;
        totalFundamental += fundamental.total > 0 ? fundamental.total : 50;
        totalTechStrength += entrySignal.strength > 0 ? entrySignal.strength : 50;
        totalYearChange += stock.yearChange;
        if (actionSignal.action === '买入') buyCount++;
        if (actionSignal.action === '卖出') sellCount++;
      }
    }

    const count = industryStocks.length;
    const avgProsperity = totalProsperity / scoredCount;
    const avgSafety = totalSafety / scoredCount;
    const avgFundamental = totalFundamental / scoredCount;
    const avgTech = totalTechStrength / scoredCount;
    const avgYearChange = totalYearChange / scoredCount;

    const prosperityScore = Math.min(100, avgProsperity);
    const safetyScore = Math.min(100, avgSafety * 100);
    const fundamentalScore = avgFundamental;
    const techScore = avgTech;
    const momentumScore = Math.max(0, Math.min(100, (avgYearChange + 50) * 1.2));

    const compositeScore = Math.round(
      prosperityScore * 0.25 + safetyScore * 0.20 + fundamentalScore * 0.25 + techScore * 0.15 + momentumScore * 0.15
    );

    let status: IndustryInsight['status'] = 'neutral';
    let statusText = '中性';
    let statusColor = 'text-blue-600 bg-blue-100';

    if (compositeScore >= 60) {
      status = 'boom';
      statusText = '景气';
      statusColor = 'text-emerald-600 bg-emerald-100';
    } else if (compositeScore >= 40) {
      status = 'neutral';
      statusText = '中性';
      statusColor = 'text-blue-600 bg-blue-100';
    } else {
      status = 'recession';
      statusText = '衰退';
      statusColor = 'text-red-600 bg-red-100';
    }

    const sortedStocks = [...industryStocks]
      .filter(s => s.currentPrice)
      .sort((a, b) => {
        const safetyA = a.pe > 0 && a.cagr > 0 ? calcPEGStock(a).safetyFactor : 0.5;
        const safetyB = b.pe > 0 && b.cagr > 0 ? calcPEGStock(b).safetyFactor : 0.5;
        return safetyB - safetyA;
      })
      .slice(0, 3);

    const topStocks = sortedStocks.map(stock => {
      const hasValidData = stock.pe > 0 && stock.cagr > 0;
      const safety = hasValidData ? calcPEGStock(stock).safetyFactor : 0.5;
      const fundamental = getFundamentalScore(stock);
      const action = getActionSignal(stock, safety);
      return {
        stockCode: stock.stockCode, company: stock.company,
        safetyFactor: safety, fundamentalScore: fundamental.total > 0 ? fundamental.total : 50,
        actionSignal: hasValidData ? action.action : '持续跟踪',
      };
    });

    insights.push({
      industry, stockCount: count, avgProsperityIndex: Math.round(avgProsperity),
      avgSafetyFactor: Math.round(avgSafety * 100) / 100, avgFundamentalScore: Math.round(avgFundamental),
      avgTechStrength: Math.round(avgTech), avgYearChange: Math.round(avgYearChange * 10) / 10,
      buyRatio: Math.round(buyCount / count * 100), sellRatio: Math.round(sellCount / count * 100),
      compositeScore, status, statusText, statusColor, topStocks,
    });
  }

  insights.sort((a, b) => b.compositeScore - a.compositeScore);
  return insights;
}
