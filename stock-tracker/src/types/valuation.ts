// 多方法估值类型定义

/** 估值方法枚举 */
export type ValuationMethod =
  | 'peg'            // PEG估值法（消费/医药/科技等成长股）
  | 'pb_roe'         // PB-ROE法（银行）
  | 'pb_percentile'  // PB分位法（钢铁/煤炭/有色/化工/航运等强周期）
  | 'ev'             // EV内含价值法（保险）
  | 'nav'            // NAV净资产价值法（房地产）
  | 'dividend'       // 股息率法（电力/高速/港口等公用事业）
  | 'pb_sentiment'   // PB+市场情绪法（券商）
  | 'ps';            // PS市销率法（亏损成长股/SaaS）

/** 估值方法显示信息 */
export interface ValuationMethodInfo {
  method: ValuationMethod;
  label: string;         // 中文标签
  shortLabel: string;    // 简短标签（表格用）
  description: string;   // 方法说明
  suitableFor: string;   // 适用行业
  color: string;         // 标签颜色 tailwind class
}

/** 每只股票的估值参数（存储在 localStorage，与 PEGStock 分离） */
export interface ValuationParams {
  stockCode: string;
  method: ValuationMethod;

  // === PB-ROE法（银行）===
  pb?: number;              // 当前市净率
  roe?: number;             // 净资产收益率(%)
  requiredReturn?: number;  // 要求回报率(%, 默认10)
  bvps?: number;            // 每股净资产(Book Value Per Share)

  // === PB分位法（强周期）===
  pbHistLow?: number;       // 历史10年PB低位(10%分位)
  pbHistHigh?: number;      // 历史10年PB高位(90%分位)

  // === EV内含价值法（保险）===
  evPerShare?: number;      // 每股内含价值
  evMultiple?: number;      // EV倍数(默认1.0-1.5)

  // === NAV法（房地产）===
  navPerShare?: number;     // 每股NAV
  navDiscount?: number;     // NAV折价率(0.5-0.8)

  // === 股息率法（公用事业）===
  divPerShare?: number;     // 每股股息
  reqDivYield?: number;     // 要求股息率(%, 默认5)
  divYield?: number;        // 当前股息率(%, 用于展示)

  // === PS法（亏损成长股）===
  ps?: number;              // 当前市销率
  psLow?: number;           // 行业PS下限
  psHigh?: number;          // 行业PS上限
  revPerShare?: number;     // 每股营收

  // === PB+情绪法（券商）===
  marketSentiment?: 'bear' | 'normal' | 'bull';  // 市场情绪
}

/** 估值计算结果 */
export interface ValuationResult {
  method: ValuationMethod;
  fairValue: number;        // 合理价位
  buySignal: number;        // 买入信号价
  sellSignal: number;       // 卖出信号价
  safetyFactor: number;     // 安全系数 = 合理价 / 当前价
  rating: string;           // 评级：严重低估/低估/合理/高估/严重高估
  detail: string;           // 计算过程说明
  inputParams: { label: string; value: string }[];  // 输入参数展示
  /** 分步骤计算过程展示 */
  calculationSteps: {
    label: string;          // 步骤名称，如"步骤1：计算PEG"
    formula: string;        // 公式表达式，如"PEG = 前瞻PE / (CAGR×100)"
    calc: string;           // 代入数值后的计算过程，如"20 / (15×100) = 1.33"
    result: string;         // 结果，如"1.33"
  }[];
}

/** 估值方法元数据 */
export const VALUATION_METHODS: ValuationMethodInfo[] = [
  {
    method: 'peg',
    label: 'PEG估值法',
    shortLabel: 'PEG',
    description: '合理价 = 前瞻EPS × CAGR×100 × 景气指数%',
    suitableFor: '消费/医药/科技等盈利稳定成长股',
    color: 'bg-blue-100 text-blue-700',
  },
  {
    method: 'pb_roe',
    label: 'PB-ROE法',
    shortLabel: 'PB-ROE',
    description: '合理PB = ROE ÷ 要求回报率，合理价 = 每股净资产 × 合理PB',
    suitableFor: '银行',
    color: 'bg-green-100 text-green-700',
  },
  {
    method: 'pb_percentile',
    label: 'PB分位法',
    shortLabel: 'PB分位',
    description: '当前PB vs 历史10年PB区间，低位买入高位卖出',
    suitableFor: '钢铁/煤炭/有色/化工/航运/石油/水泥',
    color: 'bg-orange-100 text-orange-700',
  },
  {
    method: 'ev',
    label: 'EV内含价值法',
    shortLabel: 'EV',
    description: '合理市值 = EV × 倍数(1.0~1.5)',
    suitableFor: '保险',
    color: 'bg-purple-100 text-purple-700',
  },
  {
    method: 'nav',
    label: 'NAV净资产法',
    shortLabel: 'NAV',
    description: '合理价 = 每股NAV × 折价率(0.5~0.8)',
    suitableFor: '房地产',
    color: 'bg-amber-100 text-amber-700',
  },
  {
    method: 'dividend',
    label: '股息率法',
    shortLabel: '股息率',
    description: '合理价 = 每股股息 ÷ 要求股息率',
    suitableFor: '电力/水务/高速/港口等公用事业',
    color: 'bg-teal-100 text-teal-700',
  },
  {
    method: 'pb_sentiment',
    label: 'PB+情绪法',
    shortLabel: 'PB+情绪',
    description: '根据市场情绪(熊/正常/牛)确定合理PB区间',
    suitableFor: '券商/证券',
    color: 'bg-rose-100 text-rose-700',
  },
  {
    method: 'ps',
    label: 'PS市销率法',
    shortLabel: 'PS',
    description: '合理价区间 = 每股营收 × 行业PS下限~上限',
    suitableFor: '亏损成长股/SaaS/创新药',
    color: 'bg-indigo-100 text-indigo-700',
  },
];
