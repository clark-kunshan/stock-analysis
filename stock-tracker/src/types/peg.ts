// SWOT风险项：支持纯字符串（旧数据兼容）和带概率的对象（新数据）
export type SwotRiskItem = string | { text: string; probability: '高' | '中' | '低' };

// K线数据类型
export interface KlineData {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

/** 单个持仓明细记录（国家队/北向资金） */
export interface HolderDetail {
  name: string;          // 完整持有者名称
  shortName: string;     // 缩写
  type: string;          // 分类：社保/汇金/证金/大基金/国调/外管局/北向资金
  ratio: number;         // 占流通股比例(%)
  holdNum: number;       // 持股数(股)
  holdNumChange: number; // 变动数(股)
  change: string;        // 新进/加仓/减仓/不变
  reportDate: string;    // 报告期
}

// PEG估值法数据类型 (对应 Sheet: 股票(PEG)估值计算方法)
export interface PEGStock {
  id: string;              // 唯一标识
  company: string;         // C: 公司名+代码
  stockCode: string;       // 股票代码 (从company中提取)
  highlight: string;       // D: 看点
  prosperityIndex: number; // E: 景气指数 (0-200)
  currentPrice: number;    // F: 当前股价 (API获取)
  // G: 合理价位 = H / 0.75 (公式计算)
  // H: 理想买点 = F / R * 0.75 * E% (公式计算)
  // I: 减仓价位 = G * 1.5 (公式计算)
  // J: 1年内卖点 = F / R * 2 * E% (公式计算)
  marketCap: number;       // K: 当前市值(亿) (API获取)
  // L: 3年后理想估值(亿) = K / R * (1+P)^3 * E% (公式计算)
  yearChange: number;      // M: 年内涨幅(%) (API获取)
  changePercent?: number;   // 当日涨跌幅(%)
  volumeRatio?: number;     // 量比
  turnoverRate?: number;    // 换手率(%)
  riskTracking: string;    // N: 风险追踪
  updateDate: string;      // O: 更新日期
  cagr: number;            // P: CAGR(E) 预期复合增长率
  eps2026?: number;        // 2026年预测EPS（分析师一致预期）
  eps2027?: number;        // 2027年预测EPS（分析师一致预期）
  eps2028?: number;        // 2028年预测EPS（分析师一致预期）
  pe: number;              // Q: 前瞻PE（股价/预期EPS）
  pegCar?: number;         // 机构一致预期PEG（来自API PEG_CAR）
  // R: PEG(E) = 优先用pegCar，否则用 Q / (P * 100) (公式计算)
  // B: 安全系数 = H / F (公式计算)
  watched?: boolean;       // 自选标记
  // 财务指标（从财报API自动获取）
  pb?: number;             // 市净率
  roe?: number;            // 净资产收益率(%)
  bvps?: number;          // 每股净资产(元)
  dps?: number;            // 每股股息(元)
  ps?: number;             // 市销率
  divYield?: number;       // 当前股息率(%)
  grossMargin?: number;    // 毛利率(%)
  debtRatio?: number;      // 资产负债率(%)
  goodwillRatio?: number;  // 商誉占归母净资产比例(%)，用于商誉减值风险评估
  pbHistLow?: number;      // 历史10年PB低位(10%分位，从API动态获取)
  pbHistHigh?: number;     // 历史10年PB高位(90%分位，从API动态获取)
  // 国家队持仓（社保基金及国家大基金）
  nationalTeamName?: string;     // 持有者简称（如"汇金"、"社保"）
  nationalTeamRatio?: number;    // 占流通股比例(%)
  nationalTeamChange?: string;   // 新进/加仓/减仓/不变
  nationalTeamCount?: number;    // 国家队持仓家数（多家时显示+N）
  // 外资（北向资金 + QFII）持仓
  foreignRatio?: number;         // 合计占流通股比例(%)
  foreignChange?: string;        // 变动状态
  foreignCount?: number;         // 外资持仓家数
  foreignName?: string;          // 最大外资持有者简称
  // QFII 专属（瑞银/高盛/阿布达比等）
  qfiiName?: string;             // 最大QFII持有者简称
  qfiiRatio?: number;            // QFII合计占流通股比例(%)
  qfiiChange?: string;           // QFII变动状态
  qfiiCount?: number;            // QFII持仓家数
  // 游资持仓（著名游资大佬/知名私募）
  hotMoneyName?: string;         // 游资持有者简称
  hotMoneyRatio?: number;        // 游资合计占流通股比例(%)
  hotMoneyChange?: string;       // 游资变动状态
  hotMoneyCount?: number;        // 游资持仓家数
  // 全部持仓明细（展开时显示）
  holderDetails?: HolderDetail[]; // 国家队+外资+游资的逐条明细
  recentKlines?: KlineData[]; // K线数据（用于技术分析）
  // 个人持仓记录
  positionQty?: number;           // 持仓数量(股)
  positionCost?: number;          // 成本价(元)
  positionDate?: string;          // 建仓日期
  // SWOT分析
  swot?: {
    strengths: string[];   // 优势
    weaknesses: SwotRiskItem[];    // 劣势（含概率）
    opportunities: string[];   // 机会
    threats: SwotRiskItem[];     // 威胁（含概率）
  };
}

// PEG估值计算结果
export interface PEGCalcResult {
  peg: number;             // R: PEG
  idealBuyPoint: number;   // H: 理想买点
  fairValue: number;       // G: 合理价位
  reducePosition: number;  // I: 减仓价位
  oneYearSellPoint: number;// J: 1年内卖点
  threeYearValuation: number; // L: 3年后理想估值
  safetyFactor: number;    // B: 安全系数
}
