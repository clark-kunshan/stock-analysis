// PE区间估值法数据类型 (对应 Sheet: PE区间估值法原始表格)
export interface PEStock {
  id: string;              // 唯一标识
  category: string;        // A: 分类 (酒、医等)
  stockCode: string;       // B: 股票代码
  stockName: string;       // C: 股票名称
  coreCompetitiveness: string; // D: 核心竞争力
  avgEPS: number;          // E: 预估未来3年每股平均收益
  peLow: number;           // F: PE估值区间(低)
  peHigh: number;          // G: PE估值区间(高)
  // H: 加仓点 = E * F (公式计算)
  // I: 减仓点 = E * G (公式计算)
  competitivenessScore: number; // J: 竞争力评分 (0-100)
  totalShares: number;     // K: 总股本(亿)
  closingPrice: number;    // L: 收盘价 (API获取)
  // M: 当前评级 (低估/合理/高估) 自动计算
  updateTime: string;      // N: 更新时间
}

// PE区间估值计算结果
export interface PECalcResult {
  buyPoint: number;        // H: 加仓点
  sellPoint: number;       // I: 减仓点
  rating: '严重低估' | '低估' | '合理' | '高估' | '严重高估'; // M: 当前评级
}
