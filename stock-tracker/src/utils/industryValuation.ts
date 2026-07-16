// 行业 -> 估值方法映射
import type { ValuationMethod, ValuationParams } from '../types/valuation.ts';
import type { PEGStock } from '../types/peg.ts';

/** 行业关键词 -> 估值方法 的映射规则 */
const INDUSTRY_RULES: Array<{
  keywords: string[];
  method: ValuationMethod;
}> = [
  // 银行 -> PB-ROE法
  { keywords: ['银行'], method: 'pb_roe' },

  // 保险 -> EV法
  { keywords: ['保险', '人寿'], method: 'ev' },

  // 券商 -> PB+情绪法
  { keywords: ['证券', '券商'], method: 'pb_sentiment' },

  // 强周期 -> PB分位法
  {
    keywords: ['钢铁', '煤炭', '有色', '金属', '采矿', '化工', '化学', '航运', '海运',
               '石油', '石化', '海油', '油气', '开采', '能源', '天然气',
               '水泥', '建材', '玻璃', '铝', '铜', '锂', '稀土',
               '化肥', '农药', '钛白', '聚氨酯', '纤维', '涂料', '航空'],
    method: 'pb_percentile',
  },

  // 房地产 -> NAV法
  { keywords: ['房地产', '地产', '置业', '置业'], method: 'nav' },

  // 公用事业 -> 股息率法
  {
    keywords: ['电力', '水务', '燃气', '高速公路', '港口', '机场', '铁路', '地铁',
               '环保', '垃圾', '供热', '核电', '水电', '火电', '风电运营', '光伏运营'],
    method: 'dividend',
  },

  // 亏损成长股 -> PS法（需要手动指定，不自动匹配）
  // PS法不自动匹配，因为亏损股需要人工判断
];

/** 根据行业名称自动推断估值方法 */
export function detectValuationMethod(industry: string): ValuationMethod {
  if (!industry) return 'peg';

  const lower = industry.toLowerCase();
  for (const rule of INDUSTRY_RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return rule.method;
      }
    }
  }
  return 'peg';
}

/** 根据行业名称判断PEG是否适合（返回true表示适合PEG，false表示推荐其他方法） */
export function isPEGSuitable(industry: string): boolean {
  return detectValuationMethod(industry) === 'peg';
}

/** 获取估值方法的短名称（用于表格标签） */
export function getMethodShortName(method: ValuationMethod): string {
  const map: Record<ValuationMethod, string> = {
    peg: 'PEG',
    pb_roe: 'PB-ROE',
    pb_percentile: 'PB分位',
    ev: 'EV',
    nav: 'NAV',
    dividend: '股息率',
    pb_sentiment: 'PB+情绪',
    ps: 'PS',
  };
  return map[method] || method;
}
export function getDefaultParams(method: ValuationMethod): Partial<ValuationParams> {
  switch (method) {
    case 'pb_roe':
      return { requiredReturn: 10 };
    case 'ev':
      return { evMultiple: 1.2 };
    case 'nav':
      return { navDiscount: 0.65 };
    case 'dividend':
      return { reqDivYield: 5 };
    case 'pb_sentiment':
      return { marketSentiment: 'normal' };
    default:
      return {};
  }
}

/**
 * 根据行业和当前股价，自动推断该股票的估值参数默认值。
 * 用于一键补齐非 PEG 方法缺失的输入参数，避免表格出现大量“-”。
 * 注意：这里使用的是行业典型经验值，用户应在“参数”面板中核改为真实数据。
 */
export function getIndustryDefaultParams(stock: PEGStock, method: ValuationMethod): Partial<ValuationParams> {
  const industry = (stock.highlight || '').toLowerCase();
  const price = stock.currentPrice || 0;
  const base = getDefaultParams(method);

  switch (method) {
    case 'pb_roe': {
      // 银行股：优先使用真实财务数据，否则使用经验默认值
      const company = (stock.company || '').toLowerCase();

      // 根据银行类型给出差异化默认 ROE/PB（无真实数据时使用）
      const bankDefaults: Record<string, { pb: number; roe: number }> = {
        '招商': { pb: 0.85, roe: 11.5 },
        '宁波': { pb: 0.85, roe: 12.5 },
        '杭州': { pb: 0.75, roe: 12.0 },
        '成都': { pb: 0.75, roe: 14.0 },
        '江苏': { pb: 0.70, roe: 13.0 },
        '南京': { pb: 0.70, roe: 11.5 },
        '兴业': { pb: 0.70, roe: 10.5 },
        '平安银行': { pb: 0.65, roe: 10.0 },
        '建设': { pb: 0.65, roe: 10.0 },
        '邮储': { pb: 0.65, roe: 10.0 },
        '交通': { pb: 0.60, roe: 9.0 },
        '工商': { pb: 0.60, roe: 9.5 },
        '中国': { pb: 0.55, roe: 9.0 },   // 中国银行
        '农业': { pb: 0.55, roe: 8.5 },
        '中信': { pb: 0.60, roe: 9.0 },
        '光大': { pb: 0.55, roe: 8.0 },
        '华夏': { pb: 0.50, roe: 7.0 },
        '民生': { pb: 0.45, roe: 6.5 },
        '浦发': { pb: 0.50, roe: 7.5 },
        '上海': { pb: 0.60, roe: 8.5 },
        '北京': { pb: 0.60, roe: 9.0 },
        '浙商': { pb: 0.65, roe: 9.5 },
        '渝农商': { pb: 0.60, roe: 10.0 },
        '沪农商': { pb: 0.60, roe: 10.0 },
      };

      let defaultPB = 0.6;
      let defaultROE = 10;
      for (const [key, def] of Object.entries(bankDefaults)) {
        if (company.includes(key)) {
          defaultPB = def.pb;
          defaultROE = def.roe;
          break;
        }
      }

      const pb = stock.pb !== undefined && stock.pb > 0 ? stock.pb : defaultPB;
      const roe = stock.roe !== undefined && stock.roe > 0 ? stock.roe : defaultROE;
      const bvps = stock.bvps !== undefined && stock.bvps > 0
        ? stock.bvps
        : (price > 0 && pb > 0 ? price / pb : 0);

      return { ...base, pb, roe, bvps };
    }

    case 'pb_percentile': {
      // 强周期股：优先级 1) API真实历史PB分位 2) 子行业经验值 3) 通用默认
      let pb = stock.pb !== undefined && stock.pb > 0 ? stock.pb : 1.5;
      let pbHistLow = stock.pbHistLow !== undefined && stock.pbHistLow > 0 ? stock.pbHistLow : undefined;
      let pbHistHigh = stock.pbHistHigh !== undefined && stock.pbHistHigh > 0 ? stock.pbHistHigh : undefined;

      // 子行业默认值（当真实数据缺失时使用）
      if (pbHistLow === undefined || pbHistHigh === undefined || stock.pb === undefined || stock.pb <= 0) {
        if (industry.includes('煤炭')) {
          if (stock.pb === undefined || stock.pb <= 0) pb = 1.4;
          if (pbHistLow === undefined) pbHistLow = 0.9;
          if (pbHistHigh === undefined) pbHistHigh = 2.2;
        } else if (industry.includes('钢铁')) {
          if (stock.pb === undefined || stock.pb <= 0) pb = 0.9;
          if (pbHistLow === undefined) pbHistLow = 0.6;
          if (pbHistHigh === undefined) pbHistHigh = 1.6;
        } else if (industry.includes('铜') || industry.includes('铝') || industry.includes('有色') || industry.includes('金属')) {
          if (stock.pb === undefined || stock.pb <= 0) pb = 1.8;
          if (pbHistLow === undefined) pbHistLow = 1.2;
          if (pbHistHigh === undefined) pbHistHigh = 3.5;
        } else if (industry.includes('锂') || industry.includes('稀土')) {
          if (stock.pb === undefined || stock.pb <= 0) pb = 2.5;
          if (pbHistLow === undefined) pbHistLow = 1.5;
          if (pbHistHigh === undefined) pbHistHigh = 6.0;
        } else if (industry.includes('化工') || industry.includes('化学') || industry.includes('化肥') || industry.includes('农药')) {
          if (stock.pb === undefined || stock.pb <= 0) pb = 1.8;
          if (pbHistLow === undefined) pbHistLow = 1.0;
          if (pbHistHigh === undefined) pbHistHigh = 3.5;
        } else if (industry.includes('航运') || industry.includes('海运')) {
          if (stock.pb === undefined || stock.pb <= 0) pb = 1.5;
          if (pbHistLow === undefined) pbHistLow = 0.8;
          if (pbHistHigh === undefined) pbHistHigh = 3.0;
        } else if (industry.includes('石油') || industry.includes('石化') || industry.includes('海油') || industry.includes('油气') || industry.includes('天然气')) {
          if (stock.pb === undefined || stock.pb <= 0) pb = 1.1;
          if (pbHistLow === undefined) pbHistLow = 0.8;
          if (pbHistHigh === undefined) pbHistHigh = 2.0;
        } else if (industry.includes('水泥') || industry.includes('建材') || industry.includes('玻璃')) {
          if (stock.pb === undefined || stock.pb <= 0) pb = 1.0;
          if (pbHistLow === undefined) pbHistLow = 0.7;
          if (pbHistHigh === undefined) pbHistHigh = 2.0;
        }
      }

      // 最终兜底
      if (pbHistLow === undefined) pbHistLow = 1.0;
      if (pbHistHigh === undefined) pbHistHigh = 3.0;

      const bvps = stock.bvps !== undefined && stock.bvps > 0 ? stock.bvps : (price > 0 && pb > 0 ? price / pb : 0);
      return { ...base, pb, pbHistLow, pbHistHigh, bvps };
    }

    case 'ev': {
      // 保险股：默认 EV 倍数 1.2，每股 EV 近似为当前价 / 1.2
      const evMultiple = 1.2;
      const evPerShare = price > 0 ? price / evMultiple : 0;
      return { ...base, evMultiple, evPerShare };
    }

    case 'nav': {
      // 地产股：默认折价 0.65，每股 NAV 近似为当前价 / 0.65
      const navDiscount = 0.65;
      const navPerShare = price > 0 && navDiscount > 0 ? price / navDiscount : 0;
      return { ...base, navDiscount, navPerShare };
    }

    case 'dividend': {
      // 公用事业：优先使用真实每股股息；无真实数据时，若 API 返回了股息率，用股价反推每股股息
      const industry = (stock.highlight || '').toLowerCase();
      let reqDivYield = 5; // 默认要求股息率
      if (industry.includes('水电') || industry.includes('火电') || industry.includes('电力') || industry.includes('核电')) {
        reqDivYield = 4;
      } else if (industry.includes('高速') || industry.includes('铁路') || industry.includes('港口')) {
        reqDivYield = 5;
      } else if (industry.includes('水务') || industry.includes('燃气') || industry.includes('环保')) {
        reqDivYield = 4.5;
      } else if (industry.includes('机场')) {
        reqDivYield = 3.5; // 机场股股息率通常较低，且周期性较强
      }
      let divPerShare = stock.dps !== undefined && stock.dps > 0 ? stock.dps : 0;
      let divYield = stock.divYield !== undefined && stock.divYield > 0 ? stock.divYield : 0;

      // 兜底1：有 DPS 无股息率时，用当前价计算股息率用于展示
      if (divYield <= 0 && divPerShare > 0 && price > 0) {
        divYield = (divPerShare / price) * 100;
      }
      // 兜底2：无 DPS 但有 API 股息率时，用股价反推 DPS（避免合理价=当前价的循环依赖）
      if (divPerShare <= 0 && divYield > 0 && price > 0) {
        divPerShare = price * (divYield / 100);
      }

      return { ...base, reqDivYield, divPerShare, divYield };
    }

    case 'pb_sentiment': {
      // 券商股：默认 PB 1.2，每股净资产 = 股价 / PB
      const pb = 1.2;
      const bvps = price > 0 && pb > 0 ? price / pb : 0;
      return { ...base, pb, bvps };
    }

    case 'ps': {
      // 亏损成长股：默认 PS 5，每股营收 = 股价 / PS
      const ps = 5;
      const psLow = 3;
      const psHigh = 10;
      const revPerShare = price > 0 && ps > 0 ? price / ps : 0;
      return { ...base, ps, psLow, psHigh, revPerShare };
    }

    default:
      return base;
  }
}

/** 判断文本中是否包含任一关键词 */
function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some(kw => text.includes(kw));
}

/**
 * 根据行业判断 EPS 一致预期的可信度（1-5 分）。
 * 5 分最可信（需求稳定、现金流可预测），1 分最不可信（政策敏感、强周期、难预测）。
 */
export function getEpsReliabilityScore(stock: PEGStock): number {
  const industry = (stock.highlight || '').toLowerCase();
  const company = (stock.company || '').toLowerCase();
  const text = industry + ' ' + company;

  // 5分：需求稳定、现金流可预测、弱周期
  if (matchesAny(text, [
    '风电运营', '光伏运营', '水电', '火电', '核电',
    '银行', '保险', '证券', '券商',
    '电力', '水务', '燃气', '高速公路', '高速', '公路', '铁路', '港口',
    '环保', '垃圾', '供热',
    '食品', '饮料', '白酒', '啤酒',
  ])) return 5;

  // 4分：消费/制造/基础设施，需求相对稳定
  if (matchesAny(text, [
    '汽车零部件', '家电', '纺织', '服装', '机械', '设备',
    '建筑', '基建', '交通', '机场', '物流',
    '养殖', '农业', '牧业', '百货', '零售', '日用品', '化妆品',
    '医药', '医疗', '生物',
  ])) return 4;

  // 3分：科技/成长，变化快但有一定规律
  if (matchesAny(text, [
    '半导体', '芯片', '电子', '通信', '计算机', '软件',
    '光伏', '风电', '锂电', '电池', '汽车', '新能源车', '新能源',
    '传媒', '互联网',
  ])) return 3;

  // 2分：强周期
  if (matchesAny(text, [
    '石油', '石化', '海油', '油气', '煤炭', '有色', '金属', '钢铁',
    '化工', '化学', '化肥', '农药', '锂', '稀土',
    '水泥', '建材', '玻璃', '铝', '铜', '钛白', '聚氨酯', '纤维', '涂料',
    '能源', '天然气', '开采', '航运', '海运',
  ])) return 2;

  // 1分：高度不确定/政策敏感
  if (matchesAny(text, [
    '房地产', '地产', '置业', '教育', '影视', '游戏', '航空',
  ])) return 1;

  return 3;
}
