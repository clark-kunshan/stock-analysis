// 十大流通股东数据获取模块
// 数据来源：东方财富 datacenter RPT_F10_EH_FREEHOLDERS
// 通过 Vite 代理 /api/datacenter 访问，避免 CORS

/** 单个持仓明细记录 */
export interface HolderDetail {
  name: string;          // 完整持有者名称（如"全国社保基金一一八组合"）
  shortName: string;     // 缩写（如"社保"）
  type: string;          // 分类：社保/汇金/证金/大基金/国调/外管局/养老金/北向资金/瑞银/高盛/阿布达比...
  ratio: number;         // 占流通股比例(%)
  holdNum: number;       // 持股数(股)
  holdNumChange: number; // 变动数(股，正=增持，负=减持)
  change: string;        // 新进/加仓/减仓/不变
  reportDate: string;    // 报告期（如"2025-03-31"）
}

export interface HolderData {
  // 国家队持仓（社保基金及国家大基金）
  nationalTeamName?: string;     // 持有者简称
  nationalTeamRatio?: number;    // 占流通股比例(%)
  nationalTeamChange?: string;   // 新进/加仓/减仓/不变
  nationalTeamCount?: number;    // 国家队持仓家数
  // 外资（北向资金 + QFII）持仓
  foreignRatio?: number;         // 合计占流通股比例(%)
  foreignChange?: string;        // 变动状态（取最大持股者）
  foreignCount?: number;         // 外资持仓家数
  foreignName?: string;          // 最大外资持有者简称
  // QFII 专属摘要
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
}

/** 判断持仓类型 */
function getHolderType(holderName: string, isNewType: string, isLandStock: string | number): string {
  if (isLandStock === '1' || isLandStock === 1) return '北向资金';
  if (!holderName) return '其他';
  // 国家队类型
  if (holderName.includes('社保') || holderName.includes('社会保障')) return '社保';
  if (holderName.includes('汇金')) return '汇金';
  if (holderName.includes('证金')) return '证金';
  if (holderName.includes('集成电路') || holderName.includes('大基金')) return '大基金';
  if (holderName.includes('国调')) return '国调';
  if (holderName.includes('外管局') || holderName.includes('梧桐树')) return '外管局';
  if (holderName.includes('养老')) return '养老金';
  // QFII 外资机构子类型
  if (isNewType === 'QFII') {
    const n = holderName.toUpperCase();
    if (holderName.includes('阿布达比') || n.includes('ABU DHABI')) return '阿布达比';
    if (holderName.includes('瑞银') || n.includes('UBS')) return '瑞银';
    if (holderName.includes('高盛') || n.includes('GOLDMAN')) return '高盛';
    if (holderName.includes('摩根士丹利') || n.includes('MORGAN STANLEY')) return '摩根士丹利';
    if (holderName.includes('摩根大通') || n.includes('J.P.MORGAN') || n.includes('JPMORGAN')) return '摩根大通';
    if (holderName.includes('巴克莱') || n.includes('BARCLAYS')) return '巴克莱';
    if (holderName.includes('法国巴黎银行') || n.includes('BNP')) return '法国巴黎银行';
    if (holderName.includes('淡马锡') || n.includes('TEMASEK')) return '淡马锡';
    if (holderName.includes('德意志银行') || n.includes('DEUTSCHE')) return '德意志银行';
    if (holderName.includes('富达') || n.includes('FIDELITY')) return '富达';
    if (holderName.includes('比尔') || n.includes('BILL &')) return '比尔盖茨';
    if (holderName.includes('马来西亚') || n.includes('MAYBANK')) return '马来西亚银行';
    if (holderName.includes('三井') || n.includes('MITSUI')) return '三井住友';
    if (holderName.includes('三星') || n.includes('SAMSUNG')) return '三星资产';
    return 'QFII';
  }
  return isNewType || '其他';
}

/** 持有者名称缩写 */
function shortenHolderName(name: string): string {
  if (!name) return '';
  // 国家队
  if (name.includes('社保')) return '社保';
  if (name.includes('汇金')) return '汇金';
  if (name.includes('证金')) return '证金';
  if (name.includes('集成电路') || name.includes('大基金')) return '大基金';
  if (name.includes('国调')) return '国调';
  if (name.includes('外管局') || name.includes('梧桐树')) return '外管局';
  if (name.includes('养老')) return '养老金';
  // QFII
  if (name.includes('阿布达比') || name.toUpperCase().includes('ABU DHABI')) return '阿布达比';
  if (name.includes('瑞银') || name.toUpperCase().includes('UBS')) return '瑞银';
  if (name.includes('高盛') || name.toUpperCase().includes('GOLDMAN')) return '高盛';
  if (name.includes('摩根士丹利') || name.toUpperCase().includes('MORGAN STANLEY')) return '摩根士丹利';
  if (name.includes('摩根大通') || name.toUpperCase().includes('J.P.MORGAN') || name.toUpperCase().includes('JPMORGAN')) return '摩根大通';
  if (name.includes('巴克莱') || name.toUpperCase().includes('BARCLAYS')) return '巴克莱';
  if (name.includes('法国巴黎银行') || name.toUpperCase().includes('BNP')) return '法国巴黎银行';
  if (name.includes('淡马锡') || name.toUpperCase().includes('TEMASEK')) return '淡马锡';
  if (name.includes('德意志银行') || name.toUpperCase().includes('DEUTSCHE')) return '德意志银行';
  if (name.includes('富达') || name.toUpperCase().includes('FIDELITY')) return '富达';
  if (name.includes('比尔') || name.toUpperCase().includes('BILL &')) return '比尔盖茨';
  // 其他：取前4字
  return name.length > 4 ? name.slice(0, 4) : name;
}

/** 根据持股变动数量判断变动状态 */
function getChangeStatus(holdNumChange: number, holdNum: number): string {
  if (holdNumChange === undefined || holdNumChange === null || isNaN(holdNumChange)) return '不变';
  if (holdNumChange > 0) {
    // 如果变动量等于持有量，说明是新进
    if (holdNum > 0 && Math.abs(holdNumChange - holdNum) < 1) return '新进';
    return '加仓';
  }
  if (holdNumChange < 0) return '减仓';
  return '不变';
}

/** 判断是否为港股代码（1-5位纯数字） */
function isHKStock(code: string): boolean {
  const numeric = /^\d+$/.test(code);
  const len = code.length;
  return numeric && len >= 1 && len <= 5;
}

/**
 * 著名游资大佬名称列表
 * 包括个人姓名、关联账户、投资公司、以及明星基金经理的典型产品名（抓取阶段识别用）
 * ⚠️ 如果你新增的人名/产品名必须同时出现在 HOT_MONEY_ALIAS 里（如果要被 UI 层聚合成对应主名），否则仅会被识别为"游资"但无法按基金经理分组
 */
export const HOT_MONEY_NAMES = [
  // ===== 章建平家族（章盟主） =====
  '章建平', '章晓静', '章华妹', '方德基', '章利云', '方文艳',
  // ===== 葛卫东家族 =====
  '葛卫东', '葛贵兰', '葛强', '葛俊宏', '葛耀辉', '葛雅欣', '葛蓓蓓', '葛小舟',
  // ===== 陈小群（新生代游资代表） =====
  '陈小群',
  // ===== 其他著名顶级游资/牛散 =====
  '方新侠', '赵老哥', '赵强', '孙煜', '孙哥',
  '徐开东', '徐翔', '徐留胜', '黄峥', '陈发树', '王卫',
  '吕强', '周宇光', '陈世辉', '夏重阳', '张素芬', '王一虹',
  // ===== 明星基金经理 / 私募创始人 个人名 =====
  '林园', '但斌', '冯柳', '邓晓峰', '邱国鹭', '张磊',
  '周应波', '朱少醒', '谢治宇', '董承非', '傅鹏博', '刘彦春',
  // ===== 明星基金经理 典型产品/公司关键词（抓取阶段识别，对应 HOT_MONEY_ALIAS 反向映射到主名）=====
  // 林园
  '林园投资', '林园资管', '林园私募', '深圳林园', '林园1号', '林园2号', '林园3号', '林园4号', '林园5号', '林园6号', '林园7号', '林园8号', '林园9号', '林园10号', '林园11号', '林园12号', '林园13号', '林园14号', '林园15号', '林园16号', '林园17号', '林园18号', '林园19号', '林园20号', '林园21号', '林园22号', '林园23号', '林园24号', '林园25号', '林园26号', '林园27号', '林园28号', '林园29号', '林园30号',
  // 但斌 / 东方港湾
  '东方港湾', '东方港湾马拉松', '东方港湾1号', '深圳东方港湾',
  // 冯柳 / 邓晓峰 / 邱国鹭 （高毅资产系列）
  '高毅邻山', '高毅晓峰', '高毅邱国鹭', '高毅资产', '邻山1号', '晓峰鸿远', '晓峰2号',
  // 张磊 / 高瓴
  '高瓴资本', '高瓴价值', 'Hillhouse',
  // 傅鹏博 / 睿远基金
  '睿远基金', '睿远成长价值', '睿远均衡价值', '睿远稳进',
  // 谢治宇 / 兴证全球
  '兴全合润', '兴全合宜', '兴全趋势投资', '兴全社会责任', '兴全商业模式',
  // 朱少醒 / 富国基金
  '富国天惠', '富国天惠精选',
  // 刘彦春 / 景顺长城
  '景顺长城新兴成长', '景顺长城鼎益', '景顺长城内需增长', '景顺长城内需增长贰号', '景顺长城绩优成长',
  // 周应波 / 中欧基金 + 运舟私募
  '中欧时代先锋', '中欧明睿新常态', '中欧互联网先锋', '上海运舟', '运舟投资',
  // 董承非 / 兴全 + 睿郡
  '兴全模式', '兴全新视野', '睿郡资产', '上海睿郡',
  // 葛卫东 / 混沌
  '混沌道然', '上海混沌',
  // 其他泛称
  '牛散', '超级牛散',
  // ===== 知名私募/游资机构 =====
  '高瓴', '高毅', '景林', '淡水泉', '重阳', '重阳投资', '睿远',
  '盘京', '涵德', '宽远', '宁泉', '拾贝', '鸣石', '幻方',
  '永安国富', '石锋资产', '正心谷', '源乐晟', '半夏投资',
  '朱雀', '中欧瑞博', '敦和资管', '量化投资', '量化私募',
  // ===== 知名营业部（游资聚集地）=====
  '东方财富证券', '中信证券上海', '华泰证券上海',
  '兴业证券陕西', '光大证券宁波', '财通证券杭州',
  '国信证券深圳', '平安证券深圳', '招商证券深圳',
  '国泰君安上海', '华泰证券深圳益田路', '中信建投北京',
  '拉萨团结路', '拉萨东环路', '宁波解放南路',
];

/**
 * 游资/明星基金经理 别名映射表（双向查找表）
 *  方向 1：主名 → [别名 / 产品名 / 外号] —— 用于 UI 层选「林园」时把他名下所有产品也一起扫
 *  方向 2：别名 → 主名（通过 resolvePrimaryName 反向查）—— 抓取阶段扫到"高毅邻山 1 号"，会被归到"冯柳"主名下去重聚合
 * ⚠️ 注意：所有别名也会自动展平后并入 HOT_MONEY_MATCH_WHITELIST，用于抓取阶段 isHotMoney 识别；
 *          同一个人多个产品/多个外号命中时，最终明细按主名合并为一条，避免重复计数。
 */
export interface HotMoneyAliasMap {
  [primaryName: string]: string[];
}
export const HOT_MONEY_ALIAS: HotMoneyAliasMap = {
  // ===== 章建平家族（每位成员都建立别名映射，确保 resolvePrimaryName 能正确归一）=====
  '章建平': ['章盟主', '盟主', '浙江章盟主'],
  '章晓静': ['章建平妻子', '章晓静（女）'],
  '方文艳': ['方文艳（女）'],
  '方德基': ['方德基（男）'],
  '章华妹': ['章华妹（女）'],
  '章利云': ['章利云（女）'],
  // ===== 葛卫东家族 =====
  '葛卫东': ['混沌', '混沌道然', '上海混沌', '混沌投资'],
  // ===== 新生代游资（外号 ↔ 实名）=====
  '赵老哥': ['赵强', '八年一万倍'],
  '赵强':   ['赵老哥', '八年一万倍'],
  '孙哥':   ['孙煜', '孙国栋'],
  '孙煜':   ['孙哥', '孙国栋'],
  '陈小群': ['新生代陈小群', '小群'],
  '方新侠': ['新侠'],
  // ===== 明星基金经理 / 私募创始人 =====
  '冯柳': [
    '高毅邻山', '邻山', '高毅邻山1号', '高毅邻山2号', '邻山1号远望',
    '高毅资产', '高毅', '高毅邻山1号远望基金',
  ],
  '邓晓峰': [
    '高毅晓峰', '晓峰', '高毅晓峰鸿远', '高毅晓峰2号', '晓峰鸿远',
    '高毅资产', '高毅',
  ],
  '邱国鹭': [
    '高毅资产', '高毅', '高毅邱国鹭',
    '重阳投资', '重阳',
  ],
  // 林园（扩充覆盖所有常见产品格式：深圳林园、林园资管、林园投资X号、外贸信托/华润信托发行的林园产品）
  '林园': (() => {
    const base = [
      '林园投资', '林园资管', '林园私募', '林园投资管理',
      '深圳市林园投资', '深圳林园', '深圳市林园',
      '林园投资集合资金信托', '林园私募证券投资基金',
    ];
    // 林园 1~50 号（市场上常见的林园1-30 号，直接写全，避免正则匹配的边界问题）
    for (let i = 1; i <= 50; i++) {
      base.push(`林园${i}号`);
      base.push(`林园投资${i}号`);
      base.push(`林园投资${i}号私募`);
      base.push(`林园${i}号私募证券投资基金`);
      base.push(`林园投资${i}期`);
    }
    return base;
  })(),
  // 但斌 / 东方港湾
  '但斌': [
    '东方港湾', '深圳市东方港湾', '深圳东方港湾',
    '东方港湾但斌', '东方港湾马拉松',
    '东方港湾1号', '东方港湾2号', '东方港湾3号',
    '东方港湾马拉松私募证券投资基金',
  ],
  // 张磊 / 高瓴
  '张磊': [
    '高瓴', '高瓴资本', '高瓴价值', '高瓴HHLR', 'Hillhouse',
    '高瓴天成', '高瓴礼仁',
  ],
  // 傅鹏博 / 睿远
  '傅鹏博': [
    '睿远', '睿远基金', '睿远成长价值', '睿远成长',
    '睿远均衡价值', '睿远均衡', '睿远稳进',
  ],
  // 谢治宇 / 兴证全球
  '谢治宇': [
    '兴全合润', '兴全合宜', '兴全趋势投资', '兴全趋势',
    '兴全社会责任', '兴全商业模式优选', '兴全基金',
  ],
  // 朱少醒 / 富国天惠
  '朱少醒': [
    '富国天惠', '富国天惠精选成长', '富国基金', '富国朱少醒',
  ],
  // 刘彦春 / 景顺长城
  '刘彦春': [
    '景顺长城', '景顺长城新兴成长', '景顺新兴成长',
    '景顺长城鼎益', '景顺鼎益',
    '景顺长城内需增长', '景顺内需增长',
    '景顺长城内需增长贰号', '景顺长城绩优成长',
  ],
  // 周应波 / 中欧 + 运舟私募
  '周应波': [
    '中欧时代先锋', '中欧明睿新常态', '中欧明睿',
    '中欧互联网先锋', '中欧基金',
    '上海运舟', '运舟私募', '运舟投资', '运舟',
  ],
  // 董承非 / 兴全 + 睿郡
  '董承非': [
    '兴全模式', '兴全新视野', '兴全基金',
    '睿郡资产', '睿郡', '上海睿郡',
  ],
};

/**
 * 「抓取阶段完整白名单：HOT_MONEY_NAMES ∪（HOT_MONEY_ALIAS 所有别名）去重
 * 用于 isHotMoney 判断：只要持仓名包含这里任意关键词，就识别为"游资/私募"放入 holderDetails（避免明星经理的产品名抓取阶段被漏掉）
 */
const _aliasFlat = new Set<string>();
for (const n of HOT_MONEY_NAMES) _aliasFlat.add(normalizeHolderName(n));
for (const aliases of Object.values(HOT_MONEY_ALIAS)) {
  for (const a of aliases) _aliasFlat.add(normalizeHolderName(a));
}
export const HOT_MONEY_MATCH_WHITELIST: string[] = [..._aliasFlat].filter(Boolean);

/**
 * 反向查「别名 → 主名」表。
 * 命中别名后，返回主名，用于同一人多产品/外号去重聚合。
 *   例：lookupAliasPrimary("高毅邻山 1 号远望基金")   → 返回 "冯柳"
 *       lookupAliasPrimary("富国天惠精选成长混合...")     → 返回 "朱少醒"
 *       lookupAliasPrimary("赵老哥")                     → 返回 "赵强"
 *       lookupAliasPrimary("孙煜")                       → 返回 "孙哥"
 * 未命中返回 null。
 */
export function resolvePrimaryName(name: string): string | null {
  const norm = normalizeHolderName(name);
  if (!norm) return null;
  // 0) 特例优先：赵老哥/赵强、孙哥/孙煜 固定主名
  if (norm.includes('zhaolaoge') || norm.includes('赵老哥') || (norm.includes('赵') && norm.includes('强'))) {
    // 中文 normalizeHolderName 没去掉中文字 → 用中文字直接匹配更稳
  }
  if (norm.includes('赵老哥') || norm.includes('赵强') || /赵[^，。；]*强/.test(name) || /赵[^，。；]*老哥/.test(name)) return '赵强';
  if (norm.includes('孙哥') || norm.includes('孙煜') || norm.includes('孙国栋')) return '孙哥';
  // 1) 完全匹配主名
  for (const primary of Object.keys(HOT_MONEY_ALIAS)) {
    if (norm === normalizeHolderName(primary)) return primary;
  }
  // 2) 反向查找：别名包含于 norm（或 norm 包含别名）→ 返回该主名
  for (const [primary, aliases] of Object.entries(HOT_MONEY_ALIAS)) {
    for (const a of aliases) {
      const na = normalizeHolderName(a);
      if (!na) continue;
      if (norm.includes(na) || na.includes(norm)) return primary;
    }
  }
  return null;
}

/**
 * 判断是否为游资
 * 通过名称匹配著名游资大佬、知名私募、游资聚集地营业部
 */
/**
 * 宽松归一化股东名字：去掉全角/半角空格、各种括号/标点，再转小写
 * 解决：方文艳  vs  方文艳（个人）/ 方文 艳  因脏字符匹配不到
 */
function normalizeHolderName(s: string | undefined | null): string {
  if (!s) return '';
  return String(s)
    .replace(/[\s\u3000\u00A0\.·•・()（）\[\]【】\-_—,"'`~!@#$%^&*+=\\/|<>?;:，。、；：？、《》「」『』]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * 通过名称匹配著名游资大佬、知名私募、游资聚集地营业部
 * ⚠️ 这里使用的是「完整白名单 HOT_MONEY_MATCH_WHITELIST = HOT_MONEY_NAMES ∪ HOT_MONEY_ALIAS 所有别名」，
 * 明星基金经理（朱少醒/谢治宇/刘彦春/但斌/林园等）的产品名（富国天惠/兴全合润/景顺长城/东方港湾/林园投资X号等）必须通过这里识别，否则根本不会进入 holderDetails，UI 层再怎么匹配都是空！
 */
function isHotMoney(holder: any): boolean {
  const holderName = normalizeHolderName(holder.HOLDER_NAME);
  if (!holderName) return false;
  // 宽松匹配：持仓名包含任意白名单关键词（已经归一化 → 子串匹配）
  return HOT_MONEY_MATCH_WHITELIST.some(keyword => holderName.includes(keyword));
}

/**
 * 判断是否为国家队成员
 * 包括：HOLDER_NEWTYPE 为 "国家队"、"国家大基金"、"社保"
 * 或名称包含"养老"（基本养老保险基金）
 */
function isNationalTeam(holder: any): boolean {
  return holder.HOLDER_NEWTYPE === '国家队' ||
    holder.HOLDER_NEWTYPE === '国家大基金' ||
    holder.HOLDER_NEWTYPE === '社保' ||
    ((holder.HOLDER_NEWTYPE === '其他' || holder.HOLDER_NEWTYPE === '') &&
     (holder.HOLDER_NAME || '').includes('养老'));
}

/**
 * 判断是否为外资
 * 包括：IS_LANDSTOCK="1"（北向资金/香港中央结算）
 * 或 HOLDER_NEWTYPE="QFII"（瑞银/高盛/阿布达比等）
 */
function isForeignHolder(holder: any): boolean {
  return holder.IS_LANDSTOCK === '1' || holder.IS_LANDSTOCK === 1 ||
    holder.HOLDER_NEWTYPE === 'QFII';
}

/**
 * 批量获取十大流通股东数据
 * 筛选国家队（社保/汇金/证金/大基金/养老金）和外资（北向资金+QFII）
 *
 * @param stockCodes 股票代码列表（仅A股有效，港股自动跳过）
 * @param onProgress 进度回调
 */
export async function fetchBatchHolders(
  stockCodes: string[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, HolderData>> {
  const result = new Map<string, HolderData>();

  // 仅A股有十大流通股东数据，过滤掉港股
  const aShareCodes = stockCodes.filter(code => !isHKStock(code));
  const hkCount = stockCodes.length - aShareCodes.length;
  if (hkCount > 0) {
    console.log(`持仓数据：跳过 ${hkCount} 只港股（无十大流通股东数据）`);
  }

  if (aShareCodes.length === 0) {
    console.warn('没有可获取持仓数据的A股');
    return result;
  }

  const BATCH_SIZE = 50; // 每批50只股票，pageSize=500（每只最多10条记录）

  for (let batchStart = 0; batchStart < aShareCodes.length; batchStart += BATCH_SIZE) {
    const batch = aShareCodes.slice(batchStart, batchStart + BATCH_SIZE);
    const codeFilter = batch.map(c => `"${c}"`).join(',');

    const url = `/api/datacenter/api/data/v1/get?` +
      `reportName=RPT_F10_EH_FREEHOLDERS&` +
      `columns=SECURITY_CODE,HOLDER_NAME,HOLD_NUM,FREE_HOLDNUM_RATIO,HOLD_NUM_CHANGE,IS_LANDSTOCK,HOLDER_NEWTYPE,HOLDER_STATE_NEW,HOLDER_RANK,END_DATE&` +
      `filter=(SECURITY_CODE+in+(${codeFilter}))(IS_MAX_REPORTDATE=%221%22)&` +
      `sortColumns=SECURITY_CODE,HOLDER_RANK&sortTypes=1,1&` +
      `pageNumber=1&pageSize=500&source=WEB&client=WEB`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      const rows = data?.result?.data;

      if (rows && rows.length > 0) {
        // 按股票代码分组
        const grouped = new Map<string, any[]>();
        for (const item of rows) {
          const code = item.SECURITY_CODE;
          if (!code) continue;
          if (!grouped.has(code)) grouped.set(code, []);
          grouped.get(code)!.push(item);
        }

        for (const [code, holders] of grouped) {
          const holderData: HolderData = {};
          const details: HolderDetail[] = [];
          const reportDate = holders[0]?.END_DATE || '';

          // === 外资持仓：北向资金 + QFII ===
          const foreignHolders = holders.filter(h => isForeignHolder(h));
          if (foreignHolders.length > 0) {
            // 按比例降序
            foreignHolders.sort((a, b) =>
              (parseFloat(b.FREE_HOLDNUM_RATIO) || 0) - (parseFloat(a.FREE_HOLDNUM_RATIO) || 0)
            );
            // 合计外资比例
            let totalForeignRatio = 0;
            let qfiiTotalRatio = 0;
            const qfiiHolders: any[] = [];

            for (const h of foreignHolders) {
              const ratio = parseFloat(h.FREE_HOLDNUM_RATIO) || 0;
              if (ratio > 0) {
                totalForeignRatio += ratio;
                const changeNum = parseFloat(h.HOLD_NUM_CHANGE) || 0;
                const holdNum = parseFloat(h.HOLD_NUM) || 0;
                const change = getChangeStatus(changeNum, holdNum);
                const holderType = getHolderType(h.HOLDER_NAME || '', h.HOLDER_NEWTYPE || '', h.IS_LANDSTOCK);

                // 添加到明细
                details.push({
                  name: h.HOLDER_NAME || '',
                  shortName: shortenHolderName(h.HOLDER_NAME || ''),
                  type: holderType,
                  ratio: Math.round(ratio * 100) / 100,
                  holdNum: holdNum,
                  holdNumChange: changeNum,
                  change: change,
                  reportDate: h.END_DATE || reportDate,
                });

                // QFII 单独统计
                if (h.HOLDER_NEWTYPE === 'QFII') {
                  qfiiTotalRatio += ratio;
                  qfiiHolders.push(h);
                }
              }
            }

            if (totalForeignRatio > 0) {
              holderData.foreignRatio = Math.round(totalForeignRatio * 100) / 100;
              holderData.foreignCount = foreignHolders.length;
              // 取最大持股者的变动状态
              const top = foreignHolders[0];
              holderData.foreignName = shortenHolderName(top.HOLDER_NAME || '');
              holderData.foreignChange = getChangeStatus(
                parseFloat(top.HOLD_NUM_CHANGE) || 0,
                parseFloat(top.HOLD_NUM) || 0
              );
            }

            // QFII 摘要
            if (qfiiHolders.length > 0 && qfiiTotalRatio > 0) {
              const topQfii = qfiiHolders.sort((a, b) =>
                (parseFloat(b.FREE_HOLDNUM_RATIO) || 0) - (parseFloat(a.FREE_HOLDNUM_RATIO) || 0)
              )[0];
              holderData.qfiiName = shortenHolderName(topQfii.HOLDER_NAME || '');
              holderData.qfiiRatio = Math.round(qfiiTotalRatio * 100) / 100;
              holderData.qfiiChange = getChangeStatus(
                parseFloat(topQfii.HOLD_NUM_CHANGE) || 0,
                parseFloat(topQfii.HOLD_NUM) || 0
              );
              holderData.qfiiCount = qfiiHolders.length;
            }
          }

          // === 国家队持仓：社保/汇金/证金/大基金/养老金 ===
          const nationalTeamHolders = holders.filter(h => isNationalTeam(h));
          if (nationalTeamHolders.length > 0) {
            // 按持股比例降序排列
            nationalTeamHolders.sort((a, b) =>
              (parseFloat(b.FREE_HOLDNUM_RATIO) || 0) - (parseFloat(a.FREE_HOLDNUM_RATIO) || 0)
            );
            // 合计国家队比例
            let totalNationalRatio = 0;
            for (const h of nationalTeamHolders) {
              const hRatio = parseFloat(h.FREE_HOLDNUM_RATIO) || 0;
              if (hRatio > 0) {
                totalNationalRatio += hRatio;
                // 所有国家队成员添加到明细列表（避免与外资明细重复）
                const holderName = h.HOLDER_NAME || '';
                const alreadyAdded = details.some(d => d.name === holderName);
                if (!alreadyAdded) {
                  const hChangeNum = parseFloat(h.HOLD_NUM_CHANGE) || 0;
                  const hHoldNum = parseFloat(h.HOLD_NUM) || 0;
                  details.push({
                    name: holderName,
                    shortName: shortenHolderName(holderName),
                    type: getHolderType(holderName, h.HOLDER_NEWTYPE || '', h.IS_LANDSTOCK),
                    ratio: Math.round(hRatio * 100) / 100,
                    holdNum: hHoldNum,
                    holdNumChange: hChangeNum,
                    change: getChangeStatus(hChangeNum, hHoldNum),
                    reportDate: h.END_DATE || reportDate,
                  });
                }
              }
            }
            if (totalNationalRatio > 0) {
              const top = nationalTeamHolders[0];
              holderData.nationalTeamName = shortenHolderName(top.HOLDER_NAME || '');
              holderData.nationalTeamRatio = Math.round(totalNationalRatio * 100) / 100;
              const changeNum = parseFloat(top.HOLD_NUM_CHANGE) || 0;
              const holdNum = parseFloat(top.HOLD_NUM) || 0;
              holderData.nationalTeamChange = getChangeStatus(changeNum, holdNum);
              holderData.nationalTeamCount = nationalTeamHolders.length;
            }
          }

          // === 游资持仓：著名游资大佬/知名私募 ===
          const hotMoneyHolders = holders.filter(h => isHotMoney(h));
          if (hotMoneyHolders.length > 0) {
            hotMoneyHolders.sort((a, b) =>
              (parseFloat(b.FREE_HOLDNUM_RATIO) || 0) - (parseFloat(a.FREE_HOLDNUM_RATIO) || 0)
            );
            let totalHotMoneyRatio = 0;
            for (const h of hotMoneyHolders) {
              const hRatio = parseFloat(h.FREE_HOLDNUM_RATIO) || 0;
              const hHoldNum = parseFloat(h.HOLD_NUM) || 0;
              // 放宽：有持股比例 OR 有持股数 都保留（避免 ratio 解析为 0 但有真实持股的情况被误过滤）
              if (hRatio > 0 || hHoldNum > 0) {
                totalHotMoneyRatio += hRatio;
                const holderName = h.HOLDER_NAME || '';
                const alreadyAdded = details.some(d => d.name === holderName);
                if (!alreadyAdded) {
                  const hChangeNum = parseFloat(h.HOLD_NUM_CHANGE) || 0;
                  details.push({
                    name: holderName,
                    shortName: shortenHolderName(holderName),
                    type: '游资',
                    ratio: Math.round(hRatio * 100) / 100,
                    holdNum: hHoldNum,
                    holdNumChange: hChangeNum,
                    change: getChangeStatus(hChangeNum, hHoldNum),
                    reportDate: h.END_DATE || reportDate,
                  });
                }
              }
            }
            if (totalHotMoneyRatio > 0) {
              const top = hotMoneyHolders[0];
              holderData.hotMoneyName = shortenHolderName(top.HOLDER_NAME || '');
              holderData.hotMoneyRatio = Math.round(totalHotMoneyRatio * 100) / 100;
              const changeNum = parseFloat(top.HOLD_NUM_CHANGE) || 0;
              const holdNum = parseFloat(top.HOLD_NUM) || 0;
              holderData.hotMoneyChange = getChangeStatus(changeNum, holdNum);
              holderData.hotMoneyCount = hotMoneyHolders.length;
            }
          }

          // 按比例降序排列明细
          details.sort((a, b) => b.ratio - a.ratio);
          if (details.length > 0) {
            holderData.holderDetails = details;
          }

          if (holderData.nationalTeamName || holderData.foreignRatio !== undefined || holderData.hotMoneyName) {
            result.set(code, holderData);
          }
        }
      }
    } catch (e) {
      console.error('批量获取持仓数据失败, batch:', batchStart, e);
    }

    onProgress?.(Math.min(batchStart + BATCH_SIZE, aShareCodes.length), aShareCodes.length);
    // 批次间延迟，避免请求过快
    if (batchStart + BATCH_SIZE < aShareCodes.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  console.log(`成功获取 ${result.size} / ${aShareCodes.length} 只股票的持仓数据`);
  return result;
}

/**
 * 全市场反查：通过持有人名称搜索其持有的所有股票
 * 数据来源：东方财富 RPT_F10_EH_FREEHOLDERS，按 HOLDER_NAME like 过滤
 *
 * @param holderNames 持有人名称列表（如 ['章建平', '章晓静', '方文艳']）
 * @param onProgress 进度回调
 * @returns 去重后的持仓记录列表
 */
export interface MarketHolderResult {
  stockCode: string;
  stockName: string;         // 股票简称（SECURITY_NAME_ABBR）
  holderName: string;       // 完整持有人名称
  ratio: number;            // 占流通股比例(%)
  holdNum: number;          // 持股数(股)
  change: string;           // 新进/加仓/减仓/不变
  reportDate: string;       // 报告期
}

export async function fetchStocksByHolder(
  holderNames: string[],
  onProgress?: (current: number, total: number) => void
): Promise<MarketHolderResult[]> {
  const results: MarketHolderResult[] = [];
  const seen = new Set<string>(); // 按 stockCode + holderName 去重

  for (let i = 0; i < holderNames.length; i++) {
    const name = holderNames[i];
    // EastMoney API 不支持 like 查询，只支持 = 精确匹配
    const filter = `(HOLDER_NAME="${name}")(IS_MAX_REPORTDATE="1")`;
    const url = `/api/datacenter/api/data/v1/get?` +
        `reportName=RPT_F10_EH_FREEHOLDERS&` +
        `columns=SECURITY_CODE,SECURITY_NAME_ABBR,HOLDER_NAME,HOLD_NUM,FREE_HOLDNUM_RATIO,HOLD_NUM_CHANGE,IS_LANDSTOCK,HOLDER_NEWTYPE,HOLDER_STATE_NEW,HOLDER_RANK,END_DATE&` +
        `filter=${encodeURIComponent(filter)}&` +
        `sortColumns=FREE_HOLDNUM_RATIO&sortTypes=-1&` +
        `pageNumber=1&pageSize=200&source=WEB&client=WEB`;

    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const data = await resp.json();
      const rows = data?.result?.data;
      if (rows && rows.length > 0) {
        for (const row of rows) {
          const code = row.SECURITY_CODE;
          const hName = row.HOLDER_NAME || '';
          const key = `${code}-${hName}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const changeNum = parseFloat(row.HOLD_NUM_CHANGE) || 0;
          const holdNum = parseFloat(row.HOLD_NUM) || 0;
          results.push({
            stockCode: code,
            stockName: row.SECURITY_NAME_ABBR || '',
            holderName: hName,
            ratio: Math.round((parseFloat(row.FREE_HOLDNUM_RATIO) || 0) * 100) / 100,
            holdNum,
            change: getChangeStatus(changeNum, holdNum),
            reportDate: row.END_DATE || '',
          });
        }
      }
    } catch (e) {
      console.error(`全市场搜索持有人 "${name}" 失败:`, e);
    }

    onProgress?.(i + 1, holderNames.length);
    // 请求间延迟，避免被限流
    if (i < holderNames.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  console.log(`全市场搜索完成：${holderNames.length} 位持有人，共找到 ${results.length} 条持仓记录`);
  return results;
}

export interface StockHolderResult {
  stockCode: string;
  stockName: string;
  holderName: string;
  ratio: number;
  holdNum: number;
  change: string;
  holderRank: number;
  reportDate: string;
  holderType: string;
  isHotMoney: boolean;
}

export async function fetchHoldersByStock(stockCode: string): Promise<StockHolderResult[]> {
  const results: StockHolderResult[] = [];
  const filter = `(SECURITY_CODE="${stockCode}")(IS_MAX_REPORTDATE="1")`;
  const url = `/api/datacenter/api/data/v1/get?` +
    `reportName=RPT_F10_EH_FREEHOLDERS&` +
    `columns=SECURITY_CODE,SECURITY_NAME_ABBR,HOLDER_NAME,HOLD_NUM,FREE_HOLDNUM_RATIO,HOLD_NUM_CHANGE,IS_LANDSTOCK,HOLDER_NEWTYPE,HOLDER_STATE_NEW,HOLDER_RANK,END_DATE&` +
    `filter=${encodeURIComponent(filter)}&` +
    `sortColumns=HOLDER_RANK&sortTypes=1&` +
    `pageNumber=1&pageSize=20&source=WEB&client=WEB`;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await resp.json();
    const rows = data?.result?.data;
    if (rows && rows.length > 0) {
      for (const row of rows) {
        const holderName = row.HOLDER_NAME || '';
        const holdNum = parseFloat(row.HOLD_NUM) || 0;
        const changeNum = parseFloat(row.HOLD_NUM_CHANGE) || 0;
        results.push({
          stockCode: row.SECURITY_CODE || '',
          stockName: row.SECURITY_NAME_ABBR || '',
          holderName,
          ratio: Math.round((parseFloat(row.FREE_HOLDNUM_RATIO) || 0) * 100) / 100,
          holdNum,
          change: getChangeStatus(changeNum, holdNum),
          holderRank: parseInt(row.HOLDER_RANK) || 0,
          reportDate: row.END_DATE || '',
          holderType: row.HOLDER_NEWTYPE || '',
          isHotMoney: isHotMoney(holderName),
        });
      }
    }
  } catch (e) {
    console.error(`查询股票 ${stockCode} 的持仓失败:`, e);
  }

  console.log(`股票 ${stockCode} 查询完成：共 ${results.length} 条持仓记录，其中游资 ${results.filter(r => r.isHotMoney).length} 条`);
  return results;
}
