// 多方法估值计算引擎
import type { ValuationParams, ValuationResult, ValuationMethod } from '../types/valuation.ts';
import { normalizeCAGR, calcPEGStock, calcPEG } from './formulas.ts';
import type { PEGStock } from '../types/peg.ts';

/** 格式化金额，保留2位小数 */
const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '0.00');
/** 格式化百分比 */
const fmtPct = (n: number) => (Number.isFinite(n) ? n.toFixed(1) + '%' : '0.0%');

/** 根据安全系数返回投资建议（与 PEG 页面建议列保持一致） */
export function getAdvice(factor: number): string {
  if (factor > 1) return '重点关注';
  if (factor >= 0.75) return '分批建仓';
  if (factor >= 0.5) return '持续跟踪';
  if (factor >= 0.25) return '短期忽略';
  return '高风险';
}

// ============ PEG 估值法（成长股）============
function calcPEGDetailed(stock: PEGStock, currentPrice: number): ValuationResult {
  const pe = stock.pe || 0;
  const rawCagr = stock.cagr || 0;
  const cagr = normalizeCAGR(stock.cagr);
  const cagrPct = cagr * 100;
  const prosperityIndex = stock.prosperityIndex || 100;
  const peg = calcPEG(pe, stock.cagr);
  const pegResult = calcPEGStock(stock);
  const fairValue = pegResult.fairValue;
  const buySignal = pegResult.idealBuyPoint;
  const sellSignal = pegResult.reducePosition;
  const safetyFactor = currentPrice > 0 ? fairValue / currentPrice : 0;
  const rating = getAdvice(safetyFactor);

  return {
    method: 'peg',
    fairValue,
    buySignal,
    sellSignal,
    safetyFactor,
    rating,
    detail: '基于彼得·林奇PEG法：合理价 = 当前股价 / PEG × 景气指数%，理想买点 = 合理价 × 0.75',
    inputParams: [
      { label: '前瞻PE', value: String(pe || '-') },
      { label: 'CAGR', value: fmtPct(cagrPct) },
      { label: 'PEG', value: peg.toFixed(2) },
      { label: '景气指数', value: String(prosperityIndex) + '%' },
    ],
    calculationSteps: [
      {
        label: '步骤0：CAGR 归一化',
        formula: `原始CAGR = ${fmt(rawCagr)}，若 > 1 则 ÷100 转为小数`,
        calc: `原始CAGR = ${fmt(rawCagr)} ${rawCagr > 1 ? '(百分比格式，>1，需 ÷100)' : '(已为小数格式)'}` +
          ` → 归一化CAGR = ${fmt(cagr)}（${fmt(cagrPct)}%）`,
        result: fmtPct(cagrPct),
      },
      {
        label: '步骤1：计算PEG',
        formula: `PEG = ${fmt(pe)} / (${fmt(cagrPct)} × 100)`,
        calc: `PEG = ${fmt(pe)} / (${fmt(cagrPct)} × 100) = ${fmt(peg)}`,
        result: peg.toFixed(2),
      },
      {
        label: '步骤2：计算合理价位',
        formula: `合理价 = ${fmt(currentPrice)} / ${fmt(peg)} × ${prosperityIndex}%`,
        calc: `合理价 = ${fmt(currentPrice)} / ${fmt(peg)} × ${prosperityIndex}% = ${fmt(fairValue)}`,
        result: fmt(fairValue),
      },
      {
        label: '步骤3：计算理想买点',
        formula: `理想买点 = ${fmt(fairValue)} × 0.75`,
        calc: `理想买点 = ${fmt(fairValue)} × 0.75 = ${fmt(buySignal)}`,
        result: fmt(buySignal),
      },
      {
        label: '步骤4：计算卖出信号',
        formula: `卖出信号 = ${fmt(fairValue)} × 1.5`,
        calc: `卖出信号 = ${fmt(fairValue)} × 1.5 = ${fmt(sellSignal)}`,
        result: fmt(sellSignal),
      },
      {
        label: '步骤5：计算安全系数',
        formula: `安全系数 = ${fmt(fairValue)} / ${fmt(currentPrice)}`,
        calc: `安全系数 = ${fmt(fairValue)} / ${fmt(currentPrice)} = ${fmt(safetyFactor)}（${(safetyFactor * 100).toFixed(0)}%）`,
        result: fmt(safetyFactor),
      },
      {
        label: '步骤6：评级判断',
        formula: `根据安全系数 ${fmt(safetyFactor)} 判断投资建议`,
        calc: `${fmt(safetyFactor)} ${safetyFactor > 1 ? '> 1.0' : safetyFactor >= 0.75 ? '≥ 0.75' : safetyFactor >= 0.5 ? '≥ 0.5' : safetyFactor >= 0.25 ? '≥ 0.25' : '< 0.25'}`,
        result: rating,
      },
    ],
  };
}

// ============ PB-ROE 法（银行）============
function calcPBROE(params: ValuationParams, currentPrice: number): ValuationResult {
  const pb = params.pb || 0;
  const roe = params.roe || 0;
  const reqReturn = params.requiredReturn || 10;
  const bvps = params.bvps || (pb > 0 && currentPrice > 0 ? currentPrice / pb : 0);

  const fairPB = reqReturn > 0 ? roe / reqReturn : 0;
  const fairValue = bvps * fairPB;
  const buySignal = fairValue * 0.5;
  const sellSignal = fairValue * 1.2;
  const safetyFactor = currentPrice > 0 ? fairValue / currentPrice : 0;
  const rating = getAdvice(safetyFactor);

  return {
    method: 'pb_roe',
    fairValue,
    buySignal,
    sellSignal,
    safetyFactor,
    rating,
    detail: 'PB-ROE法：合理PB = ROE / 要求回报率，合理价 = 每股净资产 × 合理PB',
    inputParams: [
      { label: 'PB', value: pb.toFixed(2) },
      { label: 'ROE', value: roe + '%' },
      { label: '要求回报', value: reqReturn + '%' },
      { label: '每股净资产', value: bvps.toFixed(2) },
      { label: '合理PB', value: fairPB.toFixed(2) },
    ],
    calculationSteps: [
      {
        label: '步骤1：计算合理PB',
        formula: `合理PB = ${roe}% / ${reqReturn}%`,
        calc: `合理PB = ${roe}% / ${reqReturn}% = ${fmt(fairPB)}`,
        result: fmt(fairPB),
      },
      {
        label: '步骤2：计算合理价位',
        formula: `合理价 = ${fmt(bvps)} × ${fmt(fairPB)}`,
        calc: `合理价 = ${fmt(bvps)} × ${fmt(fairPB)} = ${fmt(fairValue)}`,
        result: fmt(fairValue),
      },
      {
        label: '步骤3：计算理想买点',
        formula: `理想买点 = ${fmt(fairValue)} × 0.5`,
        calc: `理想买点 = ${fmt(fairValue)} × 0.5 = ${fmt(buySignal)}`,
        result: fmt(buySignal),
      },
      {
        label: '步骤4：计算卖出信号',
        formula: `卖出信号 = ${fmt(fairValue)} × 1.2`,
        calc: `卖出信号 = ${fmt(fairValue)} × 1.2 = ${fmt(sellSignal)}`,
        result: fmt(sellSignal),
      },
      {
        label: '步骤5：计算安全系数',
        formula: `安全系数 = ${fmt(fairValue)} / ${fmt(currentPrice)}`,
        calc: `安全系数 = ${fmt(fairValue)} / ${fmt(currentPrice)} = ${fmt(safetyFactor)}`,
        result: fmt(safetyFactor),
      },
      {
        label: '步骤6：评级判断',
        formula: `根据安全系数 ${fmt(safetyFactor)} 判断投资建议`,
        calc: `${fmt(safetyFactor)} ${safetyFactor > 1 ? '> 1.0' : safetyFactor >= 0.75 ? '≥ 0.75' : safetyFactor >= 0.5 ? '≥ 0.5' : safetyFactor >= 0.25 ? '≥ 0.25' : '< 0.25'}`,
        result: rating,
      },
    ],
  };
}

// ============ PB分位法（强周期）============
function calcPBPercentile(params: ValuationParams, currentPrice: number): ValuationResult {
  const pb = params.pb || 0;
  const pbLow = params.pbHistLow || 0;
  const pbHigh = params.pbHistHigh || 0;
  const bvps = params.bvps || (pb > 0 && currentPrice > 0 ? currentPrice / pb : 0);

  const range = pbHigh - pbLow;
  const percentile = range > 0 ? ((pb - pbLow) / range) * 100 : 0;
  const midPB = (pbLow + pbHigh) / 2;
  const fairValue = bvps * midPB;
  const buySignal = bvps * pbLow * 1.2;
  const sellSignal = bvps * pbHigh * 0.8;
  const safetyFactor = currentPrice > 0 ? fairValue / currentPrice : 0;
  const rating = getAdvice(safetyFactor);

  return {
    method: 'pb_percentile',
    fairValue,
    buySignal,
    sellSignal,
    safetyFactor,
    rating,
    detail: 'PB分位法：当前PB vs 历史10年PB区间，合理价 = 每股净资产 × 历史中位PB',
    inputParams: [
      { label: '当前PB', value: pb.toFixed(2) },
      { label: 'PB低位', value: pbLow.toFixed(2) },
      { label: 'PB高位', value: pbHigh.toFixed(2) },
      { label: 'PB分位', value: percentile.toFixed(0) + '%' },
      { label: '每股净资产', value: bvps.toFixed(2) },
    ],
    calculationSteps: [
      {
        label: '步骤1：计算PB分位',
        formula: `分位 = (${fmt(pb)} - ${fmt(pbLow)}) / (${fmt(pbHigh)} - ${fmt(pbLow)}) × 100%`,
        calc: `分位 = (${fmt(pb)} - ${fmt(pbLow)}) / (${fmt(pbHigh)} - ${fmt(pbLow)}) × 100% = ${fmt(percentile)}%`,
        result: fmt(percentile) + '%',
      },
      {
        label: '步骤2：计算历史中位PB',
        formula: `中位PB = (${fmt(pbLow)} + ${fmt(pbHigh)}) / 2`,
        calc: `中位PB = (${fmt(pbLow)} + ${fmt(pbHigh)}) / 2 = ${fmt(midPB)}`,
        result: fmt(midPB),
      },
      {
        label: '步骤3：计算合理价位',
        formula: `合理价 = ${fmt(bvps)} × ${fmt(midPB)}`,
        calc: `合理价 = ${fmt(bvps)} × ${fmt(midPB)} = ${fmt(fairValue)}`,
        result: fmt(fairValue),
      },
      {
        label: '步骤4：计算理想买点',
        formula: `理想买点 = ${fmt(bvps)} × ${fmt(pbLow)} × 1.2`,
        calc: `理想买点 = ${fmt(bvps)} × ${fmt(pbLow)} × 1.2 = ${fmt(buySignal)}`,
        result: fmt(buySignal),
      },
      {
        label: '步骤5：计算卖出信号',
        formula: `卖出信号 = ${fmt(bvps)} × ${fmt(pbHigh)} × 0.8`,
        calc: `卖出信号 = ${fmt(bvps)} × ${fmt(pbHigh)} × 0.8 = ${fmt(sellSignal)}`,
        result: fmt(sellSignal),
      },
      {
        label: '步骤6：评级判断',
        formula: `根据安全系数 ${fmt(safetyFactor)} 判断投资建议`,
        calc: `${fmt(safetyFactor)} ${safetyFactor > 1 ? '> 1.0' : safetyFactor >= 0.75 ? '≥ 0.75' : safetyFactor >= 0.5 ? '≥ 0.5' : safetyFactor >= 0.25 ? '≥ 0.25' : '< 0.25'}`,
        result: rating,
      },
    ],
  };
}

// ============ EV内含价值法（保险）============
function calcEV(params: ValuationParams, currentPrice: number): ValuationResult {
  const evPerShare = params.evPerShare || 0;
  const evMultiple = params.evMultiple || 1.2;

  const fairValue = evPerShare * evMultiple;
  const buySignal = evPerShare * 0.8;
  const sellSignal = evPerShare * 1.5;
  const safetyFactor = currentPrice > 0 ? fairValue / currentPrice : 0;
  const rating = getAdvice(safetyFactor);

  return {
    method: 'ev',
    fairValue,
    buySignal,
    sellSignal,
    safetyFactor,
    rating,
    detail: 'EV内含价值法：合理价 = 每股EV × EV倍数，买入信号 = 每股EV × 0.8',
    inputParams: [
      { label: '每股EV', value: evPerShare.toFixed(2) },
      { label: 'EV倍数', value: evMultiple.toFixed(2) },
      { label: '买入(EV×0.8)', value: buySignal.toFixed(2) },
      { label: '卖出(EV×1.5)', value: sellSignal.toFixed(2) },
    ],
    calculationSteps: [
      {
        label: '步骤1：计算合理价位',
        formula: `合理价 = ${fmt(evPerShare)} × ${fmt(evMultiple)}`,
        calc: `合理价 = ${fmt(evPerShare)} × ${fmt(evMultiple)} = ${fmt(fairValue)}`,
        result: fmt(fairValue),
      },
      {
        label: '步骤2：计算理想买点',
        formula: `理想买点 = ${fmt(evPerShare)} × 0.8`,
        calc: `理想买点 = ${fmt(evPerShare)} × 0.8 = ${fmt(buySignal)}`,
        result: fmt(buySignal),
      },
      {
        label: '步骤3：计算卖出信号',
        formula: `卖出信号 = ${fmt(evPerShare)} × 1.5`,
        calc: `卖出信号 = ${fmt(evPerShare)} × 1.5 = ${fmt(sellSignal)}`,
        result: fmt(sellSignal),
      },
      {
        label: '步骤4：计算安全系数',
        formula: `安全系数 = ${fmt(fairValue)} / ${fmt(currentPrice)}`,
        calc: `安全系数 = ${fmt(fairValue)} / ${fmt(currentPrice)} = ${fmt(safetyFactor)}`,
        result: fmt(safetyFactor),
      },
      {
        label: '步骤5：评级判断',
        formula: `根据安全系数 ${fmt(safetyFactor)} 判断投资建议`,
        calc: `${fmt(safetyFactor)} ${safetyFactor >= 1.5 ? '≥ 1.5' : safetyFactor >= 1.1 ? '≥ 1.1' : safetyFactor >= 0.9 ? '≥ 0.9' : safetyFactor >= 0.7 ? '≥ 0.7' : '< 0.7'}`,
        result: rating,
      },
    ],
  };
}

// ============ NAV法（房地产）============
function calcNAV(params: ValuationParams, currentPrice: number): ValuationResult {
  const navPerShare = params.navPerShare || 0;
  const discount = params.navDiscount || 0.65;

  const fairValue = navPerShare * discount;
  const buySignal = navPerShare * 0.4;
  const sellSignal = navPerShare * 0.9;
  const safetyFactor = currentPrice > 0 ? fairValue / currentPrice : 0;
  const rating = getAdvice(safetyFactor);

  return {
    method: 'nav',
    fairValue,
    buySignal,
    sellSignal,
    safetyFactor,
    rating,
    detail: 'NAV法：合理价 = 每股NAV × 折价率，买入信号 = 每股NAV × 0.4',
    inputParams: [
      { label: '每股NAV', value: navPerShare.toFixed(2) },
      { label: '折价率', value: (discount * 100).toFixed(0) + '%' },
      { label: '买入(NAV×0.4)', value: buySignal.toFixed(2) },
      { label: '卖出(NAV×0.9)', value: sellSignal.toFixed(2) },
    ],
    calculationSteps: [
      {
        label: '步骤1：计算合理价位',
        formula: `合理价 = ${fmt(navPerShare)} × ${fmt(discount)}`,
        calc: `合理价 = ${fmt(navPerShare)} × ${fmt(discount)} = ${fmt(fairValue)}`,
        result: fmt(fairValue),
      },
      {
        label: '步骤2：计算理想买点',
        formula: `理想买点 = ${fmt(navPerShare)} × 0.4`,
        calc: `理想买点 = ${fmt(navPerShare)} × 0.4 = ${fmt(buySignal)}`,
        result: fmt(buySignal),
      },
      {
        label: '步骤3：计算卖出信号',
        formula: `卖出信号 = ${fmt(navPerShare)} × 0.9`,
        calc: `卖出信号 = ${fmt(navPerShare)} × 0.9 = ${fmt(sellSignal)}`,
        result: fmt(sellSignal),
      },
      {
        label: '步骤4：计算安全系数',
        formula: `安全系数 = ${fmt(fairValue)} / ${fmt(currentPrice)}`,
        calc: `安全系数 = ${fmt(fairValue)} / ${fmt(currentPrice)} = ${fmt(safetyFactor)}`,
        result: fmt(safetyFactor),
      },
      {
        label: '步骤5：评级判断',
        formula: `根据安全系数 ${fmt(safetyFactor)} 判断投资建议`,
        calc: `${fmt(safetyFactor)} ${safetyFactor >= 2 ? '≥ 2.0' : safetyFactor >= 1.3 ? '≥ 1.3' : safetyFactor >= 0.8 ? '≥ 0.8' : safetyFactor >= 0.5 ? '≥ 0.5' : '< 0.5'}`,
        result: rating,
      },
    ],
  };
}

// ============ 股息率法（公用事业）============
function calcDividend(params: ValuationParams, currentPrice: number): ValuationResult {
  const divPerShare = params.divPerShare || 0;
  const reqYield = params.reqDivYield || 5;
  const reportedYield = params.divYield || 0; // 年报披露的最新股息率

  // 若缺少每股股息，无法计算合理价，避免用 price × yield 反推导致合理价=当前价
  const hasDps = divPerShare > 0;

  const fairValue = hasDps && reqYield > 0 ? divPerShare / (reqYield / 100) : 0;
  const buySignal = hasDps && (reqYield + 1) > 0 ? divPerShare / ((reqYield + 1) / 100) : 0;
  const sellSignal = hasDps && (reqYield - 1.5) > 0 ? divPerShare / ((reqYield - 1.5) / 100) : 0;
  const safetyFactor = hasDps && currentPrice > 0 ? fairValue / currentPrice : 0;
  const currentYield = currentPrice > 0 ? (divPerShare / currentPrice) * 100 : 0;
  const rating = hasDps ? getAdvice(safetyFactor) : '-';

  return {
    method: 'dividend',
    fairValue,
    buySignal,
    sellSignal,
    safetyFactor,
    rating,
    detail: hasDps
      ? '股息率法：合理价 = 每股股息 / 要求股息率，当前股息率 = 每股股息 / 当前股价'
      : '缺少每股股息(DPS)数据。可能该公司近年未分红，请点击“获取财报数据”刷新，或在参数面板输入真实 DPS。',
    inputParams: [
      { label: '每股股息', value: hasDps ? divPerShare.toFixed(3) : '待输入' },
      { label: '要求股息率', value: reqYield + '%' },
      { label: '当前股息率', value: (reportedYield > 0 ? reportedYield : currentYield).toFixed(2) + '%' },
      { label: '买入价', value: hasDps ? buySignal.toFixed(2) : '-' },
      { label: '卖出价', value: hasDps ? sellSignal.toFixed(2) : '-' },
    ],
    calculationSteps: [
      {
        label: '步骤1：确认每股股息',
        formula: `每股股息 = ${hasDps ? fmt(divPerShare) : '待输入'}`,
        calc: hasDps
          ? `每股股息 = ${fmt(divPerShare)} 元（由年报分红方案解析）`
          : `未获取到每股股息(DPS)。可能原因：1) 该公司近年未分红；2) 尚未点击“获取财报数据”刷新。请从 F10 分红页面填入真实 DPS，或切换为其他估值方法。`,
        result: hasDps ? fmt(divPerShare) : '待输入',
      },
      ...(hasDps ? [
        {
          label: '步骤2：计算当前股息率',
          formula: `当前股息率 = ${fmt(divPerShare)} / ${fmt(currentPrice)} × 100%`,
          calc: `当前股息率 = ${fmt(divPerShare)} / ${fmt(currentPrice)} × 100% = ${fmt(currentYield)}%`,
          result: fmt(currentYield) + '%',
        },
        {
          label: '步骤3：计算合理价位',
          formula: `合理价 = ${fmt(divPerShare)} / ${reqYield}%`,
          calc: `合理价 = ${fmt(divPerShare)} / ${reqYield}% = ${fmt(fairValue)}`,
          result: fmt(fairValue),
        },
        {
          label: '步骤4：计算理想买点',
          formula: `理想买点 = ${fmt(divPerShare)} / ${reqYield + 1}%`,
          calc: `理想买点 = ${fmt(divPerShare)} / ${reqYield + 1}% = ${fmt(buySignal)}`,
          result: fmt(buySignal),
        },
        {
          label: '步骤5：计算卖出信号',
          formula: `卖出信号 = ${fmt(divPerShare)} / ${reqYield - 1.5}%`,
          calc: `卖出信号 = ${fmt(divPerShare)} / ${reqYield - 1.5}% = ${fmt(sellSignal)}`,
          result: fmt(sellSignal),
        },
        {
          label: '步骤6：计算安全系数',
          formula: `安全系数 = ${fmt(fairValue)} / ${fmt(currentPrice)}`,
          calc: `安全系数 = ${fmt(fairValue)} / ${fmt(currentPrice)} = ${fmt(safetyFactor)}`,
          result: fmt(safetyFactor),
        },
        {
          label: '步骤7：评级判断',
          formula: `根据安全系数 ${fmt(safetyFactor)} 判断投资建议`,
          calc: `${fmt(safetyFactor)} ${safetyFactor > 1 ? '> 1.0' : safetyFactor >= 0.75 ? '≥ 0.75' : safetyFactor >= 0.5 ? '≥ 0.5' : safetyFactor >= 0.25 ? '≥ 0.25' : '< 0.25'}`,
          result: rating,
        },
      ] : []),
    ],
  };
}

// ============ PB+情绪法（券商）============
function calcPBSentiment(params: ValuationParams, currentPrice: number): ValuationResult {
  const pb = params.pb || 0;
  const sentiment = params.marketSentiment || 'normal';
  const bvps = params.bvps || (pb > 0 && currentPrice > 0 ? currentPrice / pb : 0);

  const pbRanges: Record<string, { low: number; high: number; mid: number }> = {
    bear: { low: 0.8, high: 1.2, mid: 1.0 },
    normal: { low: 1.2, high: 2.0, mid: 1.6 },
    bull: { low: 2.5, high: 4.0, mid: 3.2 },
  };
  const range = pbRanges[sentiment];

  const fairValue = bvps * range.mid;
  const buySignal = bvps * range.low;
  const sellSignal = bvps * range.high;
  const safetyFactor = currentPrice > 0 ? fairValue / currentPrice : 0;
  const rating = getAdvice(safetyFactor);
  const sentimentLabel = sentiment === 'bear' ? '熊市' : sentiment === 'bull' ? '牛市' : '正常';

  return {
    method: 'pb_sentiment',
    fairValue,
    buySignal,
    sellSignal,
    safetyFactor,
    rating,
    detail: 'PB+情绪法：根据市场情绪确定合理PB区间，合理价 = 每股净资产 × 合理PB中值',
    inputParams: [
      { label: '当前PB', value: pb.toFixed(2) },
      { label: '市场情绪', value: sentimentLabel },
      { label: '合理PB区间', value: `${range.low}~${range.high}` },
      { label: '每股净资产', value: bvps.toFixed(2) },
    ],
    calculationSteps: [
      {
        label: '步骤1：确定情绪合理PB区间',
        formula: `${sentimentLabel}市合理PB区间 = ${range.low} ~ ${range.high}`,
        calc: `${sentimentLabel}市合理PB区间 = ${range.low} ~ ${range.high}（中值 ${range.mid}）`,
        result: `${range.low}~${range.high}`,
      },
      {
        label: '步骤2：计算合理价位',
        formula: `合理价 = ${fmt(bvps)} × ${range.mid}`,
        calc: `合理价 = ${fmt(bvps)} × ${range.mid} = ${fmt(fairValue)}`,
        result: fmt(fairValue),
      },
      {
        label: '步骤3：计算理想买点',
        formula: `理想买点 = ${fmt(bvps)} × ${range.low}`,
        calc: `理想买点 = ${fmt(bvps)} × ${range.low} = ${fmt(buySignal)}`,
        result: fmt(buySignal),
      },
      {
        label: '步骤4：计算卖出信号',
        formula: `卖出信号 = ${fmt(bvps)} × ${range.high}`,
        calc: `卖出信号 = ${fmt(bvps)} × ${range.high} = ${fmt(sellSignal)}`,
        result: fmt(sellSignal),
      },
      {
        label: '步骤5：计算安全系数',
        formula: `安全系数 = ${fmt(fairValue)} / ${fmt(currentPrice)}`,
        calc: `安全系数 = ${fmt(fairValue)} / ${fmt(currentPrice)} = ${fmt(safetyFactor)}`,
        result: fmt(safetyFactor),
      },
      {
        label: '步骤6：评级判断',
        formula: `根据安全系数 ${fmt(safetyFactor)} 判断投资建议`,
        calc: `${fmt(safetyFactor)} ${safetyFactor > 1 ? '> 1.0' : safetyFactor >= 0.75 ? '≥ 0.75' : safetyFactor >= 0.5 ? '≥ 0.5' : safetyFactor >= 0.25 ? '≥ 0.25' : '< 0.25'}`,
        result: rating,
      },
    ],
  };
}

// ============ PS市销率法（亏损成长股）============
function calcPS(params: ValuationParams, currentPrice: number): ValuationResult {
  const ps = params.ps || 0;
  const psLow = params.psLow || 0;
  const psHigh = params.psHigh || 0;
  const revPerShare = params.revPerShare || 0;

  const fairValueLow = revPerShare * psLow;
  const fairValueHigh = revPerShare * psHigh;
  const fairValue = (fairValueLow + fairValueHigh) / 2;
  const buySignal = fairValueLow;
  const sellSignal = fairValueHigh;
  const safetyFactor = currentPrice > 0 ? fairValue / currentPrice : 0;
  const rating = getAdvice(safetyFactor);

  return {
    method: 'ps',
    fairValue,
    buySignal,
    sellSignal,
    safetyFactor,
    rating,
    detail: 'PS市销率法：合理价区间 = 每股营收 × 行业PS下限~上限',
    inputParams: [
      { label: '当前PS', value: ps.toFixed(2) },
      { label: 'PS下限', value: psLow.toFixed(2) },
      { label: 'PS上限', value: psHigh.toFixed(2) },
      { label: '每股营收', value: revPerShare.toFixed(2) },
      { label: '合理价区间', value: `${fairValueLow.toFixed(2)}~${fairValueHigh.toFixed(2)}` },
    ],
    calculationSteps: [
      {
        label: '步骤1：计算合理价区间',
        formula: `合理价区间 = ${fmt(revPerShare)} × ${fmt(psLow)} ~ ${fmt(revPerShare)} × ${fmt(psHigh)}`,
        calc: `合理价区间 = ${fmt(revPerShare)} × ${fmt(psLow)} ~ ${fmt(revPerShare)} × ${fmt(psHigh)} = ${fmt(fairValueLow)} ~ ${fmt(fairValueHigh)}`,
        result: `${fmt(fairValueLow)}~${fmt(fairValueHigh)}`,
      },
      {
        label: '步骤2：计算合理价位中值',
        formula: `合理价 = (${fmt(fairValueLow)} + ${fmt(fairValueHigh)}) / 2`,
        calc: `合理价 = (${fmt(fairValueLow)} + ${fmt(fairValueHigh)}) / 2 = ${fmt(fairValue)}`,
        result: fmt(fairValue),
      },
      {
        label: '步骤3：计算理想买点',
        formula: `理想买点 = ${fmt(buySignal)}`,
        calc: `理想买点 = 区间下限 = ${fmt(buySignal)}`,
        result: fmt(buySignal),
      },
      {
        label: '步骤4：计算卖出信号',
        formula: `卖出信号 = ${fmt(sellSignal)}`,
        calc: `卖出信号 = 区间上限 = ${fmt(sellSignal)}`,
        result: fmt(sellSignal),
      },
      {
        label: '步骤5：计算安全系数',
        formula: `安全系数 = ${fmt(fairValue)} / ${fmt(currentPrice)}`,
        calc: `安全系数 = ${fmt(fairValue)} / ${fmt(currentPrice)} = ${fmt(safetyFactor)}`,
        result: fmt(safetyFactor),
      },
      {
        label: '步骤6：评级判断',
        formula: `根据安全系数 ${fmt(safetyFactor)} 判断投资建议`,
        calc: `${fmt(safetyFactor)} ${safetyFactor > 1 ? '> 1.0' : safetyFactor >= 0.75 ? '≥ 0.75' : safetyFactor >= 0.5 ? '≥ 0.5' : safetyFactor >= 0.25 ? '≥ 0.25' : '< 0.25'}`,
        result: rating,
      },
    ],
  };
}

// ============ 统一计算入口 ============
export function calcMultiValuation(
  stock: PEGStock,
  params: ValuationParams,
): ValuationResult {
  const currentPrice = stock.currentPrice || 0;

  if (!stock.currentPrice) {
    return {
      method: params.method || 'peg',
      fairValue: 0,
      buySignal: 0,
      sellSignal: 0,
      safetyFactor: 0,
      rating: '-',
      detail: '无股价数据，无法计算',
      inputParams: [],
      calculationSteps: [],
    };
  }

  // 如果方法为 PEG，直接用现有的 PEG 计算
  if (params.method === 'peg' || !params.method) {
    return calcPEGDetailed(stock, currentPrice);
  }

  // 按方法分发
  switch (params.method) {
    case 'pb_roe':
      return calcPBROE(params, currentPrice);
    case 'pb_percentile':
      return calcPBPercentile(params, currentPrice);
    case 'ev':
      return calcEV(params, currentPrice);
    case 'nav':
      return calcNAV(params, currentPrice);
    case 'dividend':
      return calcDividend(params, currentPrice);
    case 'pb_sentiment':
      return calcPBSentiment(params, currentPrice);
    case 'ps':
      return calcPS(params, currentPrice);
    default:
      return calcPBROE(params, currentPrice);
  }
}

/** 获取某估值方法需要输入的参数字段列表 */
export function getMethodInputFields(method: ValuationMethod): Array<{
  field: keyof ValuationParams;
  label: string;
  type: 'number' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
}> {
  switch (method) {
    case 'pb_roe':
      return [
        { field: 'pb', label: '当前PB', type: 'number', placeholder: '如 0.6' },
        { field: 'roe', label: 'ROE(%)', type: 'number', placeholder: '如 12' },
        { field: 'requiredReturn', label: '要求回报率(%)', type: 'number', placeholder: '默认10' },
        { field: 'bvps', label: '每股净资产', type: 'number', placeholder: '如 15.5' },
      ];
    case 'pb_percentile':
      return [
        { field: 'pb', label: '当前PB', type: 'number', placeholder: '如 1.2' },
        { field: 'pbHistLow', label: 'PB历史低位(10%)', type: 'number', placeholder: '如 0.5' },
        { field: 'pbHistHigh', label: 'PB历史高位(90%)', type: 'number', placeholder: '如 3.0' },
        { field: 'bvps', label: '每股净资产', type: 'number', placeholder: '如 8.5' },
      ];
    case 'ev':
      return [
        { field: 'evPerShare', label: '每股EV(元)', type: 'number', placeholder: '如 45.0' },
        { field: 'evMultiple', label: 'EV倍数', type: 'number', placeholder: '默认1.2' },
      ];
    case 'nav':
      return [
        { field: 'navPerShare', label: '每股NAV(元)', type: 'number', placeholder: '如 20.0' },
        { field: 'navDiscount', label: 'NAV折价率', type: 'number', placeholder: '默认0.65' },
      ];
    case 'dividend':
      return [
        { field: 'divPerShare', label: '每股股息(元)', type: 'number', placeholder: '如 0.35' },
        { field: 'reqDivYield', label: '要求股息率(%)', type: 'number', placeholder: '默认5' },
      ];
    case 'pb_sentiment':
      return [
        { field: 'pb', label: '当前PB', type: 'number', placeholder: '如 1.5' },
        { field: 'bvps', label: '每股净资产', type: 'number', placeholder: '如 12.0' },
        {
          field: 'marketSentiment', label: '市场情绪', type: 'select',
          options: [
            { value: 'bear', label: '熊市' },
            { value: 'normal', label: '正常' },
            { value: 'bull', label: '牛市' },
          ],
        },
      ];
    case 'ps':
      return [
        { field: 'ps', label: '当前PS', type: 'number', placeholder: '如 8.5' },
        { field: 'psLow', label: '行业PS下限', type: 'number', placeholder: '如 4' },
        { field: 'psHigh', label: '行业PS上限', type: 'number', placeholder: '如 15' },
        { field: 'revPerShare', label: '每股营收(元)', type: 'number', placeholder: '如 2.5' },
      ];
    default:
      return [];
  }
}
