// 指数估值数据类型 (对应 Sheet: 估值)
export interface IndexValuation {
  id: string;              // 唯一标识
  indexName: string;       // A: 主要指数名称
  indexCode: string;       // 指数代码 (用于API)
  points: number;          // B: 点位 (API获取)
  yearChange: number;      // C: 年内涨幅(%) (API获取)
  currentPE: number;       // D: 当前(TTM)市盈率 (API获取)
  avgPE10Y: number;        // E: 10年平均市盈率
  percentile10Y: number;   // F: 10年分位点(%)
  // G: 修正后分位点 = F * I (公式计算)
  // H: 估值 (严重高估/高估/合理/低估/严重低估) 自动计算
  weight: number;          // I: 加权修正系数
}

// 指数估值计算结果
export interface IndexCalcResult {
  adjustedPercentile: number; // G: 修正后分位点
  valuation: '严重高估' | '高估' | '合理' | '低估' | '严重低估'; // H: 估值
}

export type TabType = 'peg' | 'pe' | 'index' | 'multival' | 'holders' | 'hotmoney';
