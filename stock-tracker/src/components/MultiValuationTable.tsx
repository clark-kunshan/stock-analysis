import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react';
import type { PEGStock } from '../types/peg.ts';
import type { PEGGroup } from '../hooks/usePEGStocks.ts';
import type { ValuationParams, ValuationMethod, ValuationResult } from '../types/valuation.ts';
import { VALUATION_METHODS } from '../types/valuation.ts';
import { detectValuationMethod, getDefaultParams, getIndustryDefaultParams, getEpsReliabilityScore } from '../utils/industryValuation.ts';
import { calcMultiValuation, getMethodInputFields } from '../utils/multiValuation.ts';
import { calcPEGStock, hasEpsData, getDisplayCAGR, formatNumber, formatMarketCap, getChangeColor, getStockBoard, getEntrySignal, getFundamentalScore, getFundamentalClass, getActionSignal, getMainTrendSignal } from '../utils/formulas.ts';
import { useLocalStorage } from '../hooks/useLocalStorage.ts';
import { MultiValuationChart } from './MultiValuationChart.tsx';
import { HolderIndustryChart } from './HolderIndustryChart.tsx';
import { HOT_MONEY_NAMES } from '../api/holders.ts';
import { getSwotByCode, requestSwotAnalysis, fetchCachedSwot } from '../utils/swotData.ts';
import { saveSnapshot } from '../utils/snapshot.ts';

const PAGE_SIZE = 50;

/** 鏍规嵁鍙俊搴﹁瘎鍒嗚繑鍥炴牱寮忥紙5=缁匡紝1=绾級 */
function getReliabilityClass(score: number): string {
  if (score >= 5) return 'bg-green-100 text-green-700';
  if (score >= 4) return 'bg-blue-50 text-blue-700';
  if (score >= 3) return 'bg-yellow-50 text-yellow-700';
  if (score >= 2) return 'bg-orange-50 text-orange-700';
  return 'bg-red-100 text-red-700';
}

/** 鏍规嵁鍙俊搴﹁瘎鍒嗚繑鍥炴枃瀛楄鏄?*/
function getReliabilityText(score: number): string {
  const map: Record<number, string> = { 5: '高', 4: '较高', 3: '中', 2: '较低', 1: '低' };
  return map[score] || '中';
}

interface MultiValuationTableProps {
  groups: PEGGroup[];
  onUpdatePEG: (id: string, field: keyof PEGStock, value: any) => void;
  onToggleWatched?: (stockCode: string) => void;
  onRefreshFinancials?: (onProgress?: (current: number, total: number) => void) => Promise<void>;
  onRefreshHolders?: (onProgress?: (current: number, total: number) => void) => Promise<void>;
  onUpdatePosition?: (stockCode: string, position: { positionQty: number; positionCost: number; positionDate: string }) => void;
  onUpdateSwot?: (stockCode: string, swot: NonNullable<PEGStock['swot']>) => void;
  onBatchUpdateSwot?: (updates: { stockCode: string; swot: NonNullable<PEGStock['swot']> }[]) => void;
}

/** 寤鸿棰滆壊锛堜笌 PEG 椤甸潰寤鸿鍒椾繚鎸佷竴鑷达級 */
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

/** 瀹夊叏绯绘暟棰滆壊 */
function getSafetyColor(factor: number): string {
  if (factor >= 1.5) return 'text-green-700 font-bold';
  if (factor >= 1) return 'text-green-600 font-semibold';
  if (factor >= 0.7) return 'text-yellow-600';
  if (factor >= 0.5) return 'text-orange-600';
  return 'text-red-600 font-bold';
}

/** 鏂规硶鏍囩棰滆壊 */
function getMethodTagClass(method: ValuationMethod): string {
  const info = VALUATION_METHODS.find(m => m.method === method);
  return info?.color || 'bg-gray-100 text-gray-700';
}

/** 鏂规硶鐭爣绛?*/
function getMethodShortLabel(method: ValuationMethod): string {
  const info = VALUATION_METHODS.find(m => m.method === method);
  return info?.shortLabel || method;
}

/** 鏂规硶瀹屾暣鏍囩 */
function getMethodLabel(method: ValuationMethod): string {
  const info = VALUATION_METHODS.find(m => m.method === method);
  return info?.label || method;
}

/** 鎸佷粨鍙樺姩鐘舵€侀鑹诧細加仓/新进=绾紝减仓=缁匡紝涓嶅彉=鐏?*/
function getHolderChangeClass(change: string | undefined): string {
  if (!change) return 'text-gray-400';
  if (change === '加仓' || change === '新进') return 'text-red-600 font-semibold';
  if (change === '减仓') return 'text-green-600 font-semibold';
  return 'text-gray-500';
}

/** 鎸佷粨类型鏍囩棰滆壊 */
function getHolderTypeClass(type: string): string {
  switch (type) {
    case '社保': return 'bg-pink-100 text-pink-700 border-pink-200';
    case '汇金': return 'bg-purple-100 text-purple-700 border-purple-200';
    case '证金': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    case '大基金': return 'bg-orange-100 text-orange-700 border-orange-200';
    case '国调': return 'bg-teal-100 text-teal-700 border-teal-200';
    case '外管局': return 'bg-cyan-100 text-cyan-700 border-cyan-200';
    case '养老金': return 'bg-amber-100 text-amber-700 border-amber-200';
    case '北向资金': return 'bg-blue-100 text-blue-700 border-blue-200';
    case '银行': return 'bg-sky-100 text-sky-700 border-sky-200';
    case '高盛': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case '摩根士丹利': return 'bg-violet-100 text-violet-700 border-violet-200';
    case '摩根大通': return 'bg-purple-100 text-purple-700 border-purple-200';
    case '阿布扎比': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case '卢森堡': return 'bg-lime-100 text-lime-700 border-lime-200';
    case '法国巴黎银行': return 'bg-stone-100 text-stone-700 border-stone-200';
    case '汇丰': return 'bg-rose-100 text-rose-700 border-rose-200';
    case '德意志银行': return 'bg-gray-100 text-gray-700 border-gray-200';
    case '富达': return 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200';
    case '比尔盖茨': return 'bg-green-100 text-green-700 border-green-200';
    case 'QFII': return 'bg-blue-50 text-blue-600 border-blue-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

/** 鎸佷粨归类锛氬浗瀹堕槦/外资/游资/其他 */
const NATIONAL_TEAM_TYPES = new Set(['社保', '汇金', '证金', '大基金', '国调', '外管局', '养老金']);
const HOT_MONEY_TYPES = new Set(['游资']);
function getHolderCategory(type: string): { label: string; cls: string } {
  if (NATIONAL_TEAM_TYPES.has(type)) return { label: '国家队', cls: 'bg-red-100 text-red-700 border-red-200' };
  if (HOT_MONEY_TYPES.has(type)) return { label: '游资', cls: 'bg-purple-100 text-purple-700 border-purple-200' };
  if (type === '北向资金' || type === 'QFII' || type === '阿布扎比' || type === '银行' || type === '高盛' ||
      type === '摩根士丹利' || type === '摩根大通' || type === '卢森堡' || type === '法国巴黎银行' ||
      type === '汇丰' || type === '德意志银行' || type === '富达' || type === '比尔盖茨' ||
      type === '马来西亚银行' || type === '三井住友' || type === '三星资产') {
    return { label: '外资', cls: 'bg-orange-100 text-orange-700 border-orange-200' };
  }
  return { label: '其他', cls: 'bg-gray-100 text-gray-600 border-gray-200' };
}

/** 鏍煎紡鍖栨寔鑲℃暟涓轰竾鑲?*/
function formatShares(shares: number): string {
  if (!shares || shares === 0) return '—';
  const wan = shares / 10000;
  if (wan >= 10000) return (wan / 10000).toFixed(1) + '亿股';
  if (wan >= 100) return wan.toFixed(0) + '万股';
  return wan.toFixed(1) + '万股';
}

function formatChangeNum(changeNum: number): string {
  if (!changeNum || changeNum === 0) return '—';
  const wan = changeNum / 10000;
  const sign = changeNum > 0 ? '+' : '';
  if (Math.abs(wan) >= 10000) return sign + (wan / 10000).toFixed(1) + '亿股';
  if (Math.abs(wan) >= 100) return sign + wan.toFixed(0) + '万股';
  return sign + wan.toFixed(1) + '万股';
}

/** 持仓明细灞曞紑琛?*/
function HolderDetailRow({ stock, colSpan }: { stock: PEGStock; colSpan: number }) {
  const details = stock.holderDetails;
  if (!details || details.length === 0) return null;
  const reportDate = details[0]?.reportDate || '';
  return (
    <tr className="bg-blue-50">
      <td colSpan={colSpan} className="p-0" style={{ background: '#eff6ff', whiteSpace: 'normal' }}>
        <div style={{ position: 'sticky', left: 0, padding: '0.75rem', background: '#eff6ff', maxWidth: 'calc(100vw - 40px)', zIndex: 5, overflow: 'auto' }}>
        <div className="text-xs">
          <div className="font-semibold text-blue-900 mb-2 text-sm flex items-center gap-2">
            <span>🏦 持仓明细</span>
            {reportDate && <span className="text-gray-500 font-normal text-xs">报告期：{reportDate}</span>}
            <span className="text-gray-400 font-normal text-xs">共{details.length} 家机构持仓</span>
          </div>
          <div>
            <table className="border-collapse w-auto">
              <thead>
                <tr className="border-b border-blue-200">
                  <th className="text-left py-1 px-2 text-blue-800 font-semibold">持有者</th>
                  <th className="text-center py-1 px-2 text-blue-800 font-semibold">类型</th>
                  <th className="text-center py-1 px-2 text-blue-800 font-semibold">归类</th>
                  <th className="text-right py-1 px-2 text-blue-800 font-semibold">占流通股%</th>
                  <th className="text-right py-1 px-2 text-blue-800 font-semibold">持股数</th>
                  <th className="text-right py-1 px-2 text-blue-800 font-semibold">变动数</th>
                  <th className="text-center py-1 px-2 text-blue-800 font-semibold">变动状态</th>
                </tr>
              </thead>
              <tbody>
                {details.map((d, i) => (
                  <tr key={i} className="border-b border-blue-100 hover:bg-blue-100/50">
                    <td className="py-1 px-2 text-gray-800 font-medium">{d.name}</td>
                    <td className="text-center py-1 px-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] border ${getHolderTypeClass(d.type)}`}>
                        {d.type}
                      </span>
                    </td>
                    <td className="text-center py-1 px-2">
                      {(() => { const cat = getHolderCategory(d.type); return (
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${cat.cls}`}>
                          {cat.label}
                        </span>
                      ); })()}
                    </td>
                    <td className="text-right py-1 px-2 text-blue-600 font-semibold">{d.ratio}%</td>
                    <td className="text-right py-1 px-2 text-gray-600">{formatShares(d.holdNum)}</td>
                    <td className={`text-right py-1 px-2 ${d.holdNumChange > 0 ? 'text-red-600' : d.holdNumChange < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {formatChangeNum(d.holdNumChange)}
                    </td>
                    <td className={`text-center py-1 px-2 ${getHolderChangeClass(d.change)}`}>
                      {d.change}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      </td>
    </tr>
  );
}

export function MultiValuationTable({ groups, onUpdatePEG, onToggleWatched, onRefreshFinancials, onRefreshHolders, onUpdatePosition, onUpdateSwot, onBatchUpdateSwot }: MultiValuationTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<'none' | 'safety' | 'method' | 'reliability' | 'fundamental' | 'dividend'>('safety');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [methodFilter, setMethodFilter] = useState<ValuationMethod | 'all'>('all');
  const [activeGroupIdx, setActiveGroupIdx] = useState(0);
  const [searchText, setSearchText] = useState<string>('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [expandedFundamentalRow, setExpandedFundamentalRow] = useState<string | null>(null);
  const [expandedHolderRow, setExpandedHolderRow] = useState<string | null>(null);
  const [expandedSwotRow, setExpandedSwotRow] = useState<string | null>(null);
  const [financialsLoading, setFinancialsLoading] = useState(false);
  const [financialsProgress, setFinancialsProgress] = useState('');
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [holdersProgress, setHoldersProgress] = useState('');
  const tableRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const [mvTableWidth, setMvTableWidth] = useState(2200);

  const syncScrollMv = (src: HTMLDivElement | null, dst: HTMLDivElement | null) => {
    if (src && dst && dst.scrollLeft !== src.scrollLeft) {
      dst.scrollLeft = src.scrollLeft;
    }
  };

  const enableWheelScrollMv = (container: HTMLDivElement | null) => {
    if (!container) return;
    const handler = (e: WheelEvent) => {
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        container.scrollLeft += e.deltaY || e.deltaX;
      }
    };
    container.addEventListener('wheel', handler, { passive: false });
    return () => container.removeEventListener('wheel', handler);
  };

// 婊氬姩鍚屾 + 琛ㄦ牸瀹藉害妫€娴?
  useEffect(() => {
    const c1 = enableWheelScrollMv(tableRef.current);
    const c2 = enableWheelScrollMv(topBarRef.current);
    const timer = setTimeout(() => {
      const table = tableRef.current?.querySelector('table') as HTMLTableElement | null;
      if (table) setMvTableWidth(table.offsetWidth);
    }, 100);
    return () => { c1?.(); c2?.(); clearTimeout(timer); };
  }, [activeGroupIdx, currentPage, methodFilter]);

  const SEARCH_GROUPS = ['沪深300', '中证500', '中证1000', '港股', '自选', '优选', '潜力股', '机构重仓', '机构金选', '主升浪信号', '游资重仓', '高股息', '我的持仓'];
  const currentGroupName = SEARCH_GROUPS[activeGroupIdx];

// 浼板€煎弬鏁板瓨鍌紙鐙珛浜?PEGStock 鏁版嵁锛?
  const [valParams, setValParams] = useLocalStorage<Record<string, ValuationParams>>('multi-val-params', {});

  // 鏀堕泦鎵€鏈夎偂绁紙鍖呮嫭鎸囨暟鎴愬垎鑲″拰鑷€夊垎缁勶級
  const allStocks = useMemo(() => {
    return groups
      .filter(g => SEARCH_GROUPS.includes(g.name))
      .flatMap(g => g.stocks.map(s => ({ stock: s, groupName: g.name })));
  }, [groups]);

// 涓烘瘡鍙偂绁ㄨ幏鍙栦及鍊煎弬鏁帮紙鑷姩妫€娴嬫柟娉曞苟琛ラ綈行业默认鍙傛暟锛?
  const stocksWithParams = useMemo(() => {
    return allStocks.map(({ stock, groupName }) => {
      const detectedMethod = detectValuationMethod(stock.highlight || '');
      const saved = valParams[stock.stockCode];
      const method = saved?.method || detectedMethod;

      // 鍩虹榛樿鍊?+ 行业默认鍊硷紙鏍规嵁褰撳墠鑲′环鍜岃储鍔℃暟鎹姩鎬佽绠楋級
      const defaults = {
        ...getDefaultParams(method),
        ...getIndustryDefaultParams(stock, method),
      };

// 濡傛灉鏈湴宸蹭繚瀛樺弬鏁帮紝鍙敤瀹冩樉寮忚缃繃鐨勫瓧娈碉紱缺少瀛楁鐢ㄩ粯璁ゅ€艰ˉ榻?
// 注意：PB分位数据优先使用股票数据中的真实值，不受用户保存的旧值影响
      const params: ValuationParams = saved
        ? { 
            ...defaults, 
            ...saved,
            ...(stock.pbHistLow !== undefined && stock.pbHistLow > 0 && { pbHistLow: stock.pbHistLow }),
            ...(stock.pbHistHigh !== undefined && stock.pbHistHigh > 0 && { pbHistHigh: stock.pbHistHigh }),
          }
        : { stockCode: stock.stockCode, method, ...defaults };

      return { stock, groupName, params };
    });
  }, [allStocks, valParams]);

// 璁＄畻浼板€肩粨鏋?
  const stocksWithResults = useMemo(() => {
    return stocksWithParams.map(({ stock, groupName, params }) => {
      let result: ValuationResult;
      if (!stock.currentPrice) {
        result = {
          method: params.method,
          fairValue: 0,
          buySignal: 0,
          sellSignal: 0,
          safetyFactor: 0,
          rating: '-',
          detail: '无股价数据',
          inputParams: [],
          calculationSteps: [],
        };
      } else {
        result = calcMultiValuation(stock, params);
      }
      return { stock, groupName, params, result };
    });
  }, [stocksWithParams]);

// 浼橀€夎偂绁細鍚屾椂鑾峰緱鍥藉闃熷拰外资加仓/新进鐨勮偂绁紙璺ㄦ墍鏈夊垎缁勶紝鍘婚噸锛屾帓闄ゅ矖鑲?/鍒涗笟鏉?/绉戝垱鏉匡級
  const preferredStocks = useMemo(() => {
    const seen = new Set<string>();
    return stocksWithResults.filter(r => {
      if (seen.has(r.stock.stockCode)) return false;
      // 排除港股、创业板、科创板
      if (r.groupName === '港股') return false;
      const board = getStockBoard(r.stock.stockCode);
      if (board === '创业板' || board === '科创板') return false;
      const nt = r.stock.nationalTeamChange;
      const fc = r.stock.foreignChange;
      if ((nt === '加仓' || nt === '新进') && (fc === '加仓' || fc === '新进')) {
        seen.add(r.stock.stockCode);
        return true;
      }
      return false;
    });
  }, [stocksWithResults]);

// 娼滃姏鑲★細鍩烘湰闈㈣瘎鍒?> 60 涓斿畨鍏ㄧ郴鏁?>= 0.75锛堥噸鐐瑰叧娉ㄦ垨分批建仓锛夌殑鑲＄エ锛堣法鎵€鏈夊垎缁勶紝鍘婚噸锛屾帓闄ゅ矖鑲?/鍒涗笟鏉?/绉戝垱鏉匡級
  const potentialStocks = useMemo(() => {
    const seen = new Set<string>();
    return stocksWithResults.filter(r => {
      if (seen.has(r.stock.stockCode)) return false;
      // 排除港股、创业板、科创板
      if (r.groupName === '港股') return false;
      const board = getStockBoard(r.stock.stockCode);
      if (board === '创业板' || board === '科创板') return false;
      const fundamentalScore = getFundamentalScore(r.stock);
      const safetyFactor = r.result.safetyFactor;
      if (fundamentalScore.total > 60 && safetyFactor >= 0.75) {
        seen.add(r.stock.stockCode);
        return true;
      }
      return false;
    }).sort((a, b) => {
      const scoreA = getFundamentalScore(a.stock);
      const scoreB = getFundamentalScore(b.stock);
      if (b.result.safetyFactor !== a.result.safetyFactor) {
        return b.result.safetyFactor - a.result.safetyFactor;
      }
      return scoreB.total - scoreA.total;
    });
  }, [stocksWithResults]);

// 机构重仓：社保+养老金合计持仓比例 >= 2%，且至少有一家机构持仓（跨所有分组，去重，排除港股/创业板/科创板）
  const institutionalStocks = useMemo(() => {
    const seen = new Set<string>();
    return stocksWithResults.filter(r => {
      if (seen.has(r.stock.stockCode)) return false;
      // 排除港股、创业板、科创板
      if (r.groupName === '港股') return false;
      const board = getStockBoard(r.stock.stockCode);
      if (board === '创业板' || board === '科创板') return false;
      const details = r.stock.holderDetails;
      if (!details || details.length === 0) return false;

      // 绛涢€夌ぞ淇濆拰养老金
      const sbOrPension = details.filter(h => h.type === '社保' || h.type === '养老金');
      if (sbOrPension.length === 0) return false;

      // 鍚堣鎸佷粨姣斾緥
      const totalRatio = sbOrPension.reduce((sum, h) => sum + (h.ratio || 0), 0);
// 妫€鏌ユ槸鍚︽湁涓€瀹舵槸加仓鎴栨柊杩?
      const hasBuying = sbOrPension.some(h => h.change === '加仓' || h.change === '新进');

      if (totalRatio >= 2) {                                        // 放宽到 >= 2%
        seen.add(r.stock.stockCode);
        return true;
      }
      return false;
    }).sort((a, b) => {
      // 鎸夌ぞ淇?养老金鍚堣鎸佷粨姣斾緥闄嶅簭
      const ratioA = (a.stock.holderDetails || [])
        .filter(h => h.type === '社保' || h.type === '养老金')
        .reduce((sum, h) => sum + (h.ratio || 0), 0);
      const ratioB = (b.stock.holderDetails || [])
        .filter(h => h.type === '社保' || h.type === '养老金')
        .reduce((sum, h) => sum + (h.ratio || 0), 0);
      return ratioB - ratioA;
    });
  }, [stocksWithResults]);

// 机构金选：基本面分数>=65 + 社保/养老金/证金/汇金/QFII有持仓 + 建议（重点关注/分批建仓）（跨所有分组，去重，排除港股/创业板/科创板）
  const goldenPicksStocks = useMemo(() => {
    const seen = new Set<string>();
    const targetTypes = new Set(['社保', '养老金', '证金', '汇金', 'QFII']);
    return stocksWithResults.filter(r => {
      if (seen.has(r.stock.stockCode)) return false;
      // 排除港股、创业板、科创板
      if (r.groupName === '港股') return false;
      const board = getStockBoard(r.stock.stockCode);
      if (board === '创业板' || board === '科创板') return false;

      const fundamentalScore = getFundamentalScore(r.stock).total;
      if (fundamentalScore < 65) return false;

      const details = r.stock.holderDetails;
      if (!details || details.length === 0) return false;

      const hasTargetHolder = details.some(h => targetTypes.has(h.type));
      if (!hasTargetHolder) return false;

      const advice = r.result.rating;
      if (advice !== '重点关注' && advice !== '分批建仓') return false;

      seen.add(r.stock.stockCode);
      return true;
    }).sort((a, b) => {
      const scoreA = getFundamentalScore(a.stock).total;
      const scoreB = getFundamentalScore(b.stock).total;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.result.safetyFactor - a.result.safetyFactor;
    });
  }, [stocksWithResults]);

  // 主升浪信号股票：主升浪启动 / 蓄势待发 / 趋势形成中（跨所有分组，去重，排除港股/创业板/科创板，按信号优先级排序）
  const mainTrendStocks = useMemo(() => {
    const seen = new Set<string>();
    const signalPriority: Record<string, number> = { '主升浪启动': 3, '蓄势待发': 2, '趋势形成中': 1 };
    return stocksWithResults
      .filter(r => {
        if (seen.has(r.stock.stockCode)) return false;
        // 排除港股、创业板、科创板
        if (r.groupName === '港股') return false;
        const board = getStockBoard(r.stock.stockCode);
        if (board === '创业板' || board === '科创板') return false;
        const mt = getMainTrendSignal(r.stock);
        if (mt.signal === '观望') return false;
        seen.add(r.stock.stockCode);
        return true;
      })
      .map(r => ({ ...r, mainTrend: getMainTrendSignal(r.stock) }))
      .sort((a, b) => {
        const pa = signalPriority[a.mainTrend.signal] ?? 0;
        const pb = signalPriority[b.mainTrend.signal] ?? 0;
        if (pb !== pa) return pb - pa;
        return b.result.safetyFactor - a.result.safetyFactor;
      });
  }, [stocksWithResults]);

  // 游资重仓：有游资持仓的股票（放宽条件，不强制加仓/新进，不设比例门槛；跨所有分组，去重，排除港股/创业板/科创板）
  // 判断游资范围：holderDetails.type === '游资'  或  name 匹配 HOT_MONEY_NAMES 白名单（章建平家族/葛卫东家族/陈小群等）
  const hotMoneyStocks = useMemo(() => {
    const collectHM = (s: PEGStock) => {
      const details = s.holderDetails || [];
      return details.filter(h => {
        if (h.type === '游资') return true;
        const n = (h.name || '').toLowerCase();
        return HOT_MONEY_NAMES.some(nm => n.includes(nm.toLowerCase()));
      });
    };
    const seen = new Set<string>();
    return stocksWithResults.filter(r => {
      if (seen.has(r.stock.stockCode)) return false;
      // 排除港股、创业板、科创板
      if (r.groupName === '港股') return false;
      const board = getStockBoard(r.stock.stockCode);
      if (board === '创业板' || board === '科创板') return false;
      // 有游资持仓数据（top字段或detail字段任一即可，或 name 匹配白名单）
      const hotMoneyFromDetails = collectHM(r.stock);
      const hasAny =
        (r.stock.hotMoneyRatio !== undefined && r.stock.hotMoneyRatio > 0) ||
        hotMoneyFromDetails.length > 0 ||
        !!r.stock.hotMoneyName;
      if (!hasAny) return false;
      seen.add(r.stock.stockCode);
      return true;
    }).sort((a, b) => {
      // 按游资合计持仓比例降序；比例相同则按持仓家数降序
      const detailsA = collectHM(a.stock);
      const detailsB = collectHM(b.stock);
      const ratioA = Math.max(a.stock.hotMoneyRatio || 0, detailsA.reduce((sum, h) => sum + (h.ratio || 0), 0));
      const ratioB = Math.max(b.stock.hotMoneyRatio || 0, detailsB.reduce((sum, h) => sum + (h.ratio || 0), 0));
      if (ratioB !== ratioA) return ratioB - ratioA;
      const countA = Math.max(a.stock.hotMoneyCount || 0, detailsA.length);
      const countB = Math.max(b.stock.hotMoneyCount || 0, detailsB.length);
      return countB - countA;
    });
  }, [stocksWithResults]);

  // 高股息·重点关注：股息率 > 5% 且 安全系数 > 1（重点关注）的股票（跨所有分组，去重），按股息率降序排列
  const highDividendStocks = useMemo(() => {
    const seen = new Set<string>();
    return stocksWithResults
      .filter(r => {
        if (seen.has(r.stock.stockCode)) return false;
        const dy = r.stock.divYield ?? 0;
        if (dy <= 5) return false;                                  // 股息率 > 5%
        if ((r.result?.safetyFactor ?? 0) <= 1) return false;       // 安全系数 > 1（重点关注）
        seen.add(r.stock.stockCode);
        return true;
      })
      .sort((a, b) => (b.stock.divYield ?? 0) - (a.stock.divYield ?? 0));
  }, [stocksWithResults]);

  // 持仓汇总通用计算函数
  const calcHolderSummary = (typeFilter: string[]) => {
    interface PositionDetail {
      stockCode: string;
      company: string;
      ratio: number;
      holdNum: number;
      change: string;
      reportDate: string;
      type: string;
    }
    const summary: { [name: string]: PositionDetail[] } = {};
    for (const r of stocksWithResults) {
      const details = r.stock.holderDetails;
      if (!details) continue;
      for (const h of details) {
        if (typeFilter.includes(h.type)) {
          if (!summary[h.name]) summary[h.name] = [];
          summary[h.name].push({ stockCode: r.stock.stockCode, company: r.stock.company, ratio: h.ratio || 0, holdNum: h.holdNum || 0, change: h.change || '—', reportDate: h.reportDate || '', type: h.type });
        }
      }
    }
    return Object.entries(summary).map(([name, positions]) => ({
      name,
      shortName: positions[0]?.type,
      count: positions.length,
      totalRatio: positions.reduce((sum, p) => sum + p.ratio, 0),
      positions: positions.sort((a, b) => b.ratio - a.ratio),
    })).sort((a, b) => b.count - a.count || b.totalRatio - a.totalRatio);
  };

// 社保持仓汇总
  const socialSecuritySummary = useMemo(() => calcHolderSummary(['社保']), [stocksWithResults]);

// 养老金持仓汇总
  const pensionSummary = useMemo(() => calcHolderSummary(['养老金']), [stocksWithResults]);

// 外资持仓汇总
  const foreignSummary = useMemo(() => calcHolderSummary(['北向资金', 'QFII']), [stocksWithResults]);

// 国家队持仓汇总（汇金、证金、国调、大基金、外管局）
  const nationalTeamSummary = useMemo(() => calcHolderSummary(['汇金', '证金', '国调', '大基金', '外管局']), [stocksWithResults]);

  // 过滤（支持按股票代码/名称/行业搜索，限定在当前分组；优选/潜力股/机构重仓/机构金选模式跨所有分组）
  const filtered = useMemo(() => {
    let result;
    if (currentGroupName === '优选') {
      result = preferredStocks;
    } else if (currentGroupName === '潜力股') {
      result = potentialStocks;
    } else if (currentGroupName === '机构重仓') {
      result = institutionalStocks;
    } else if (currentGroupName === '机构金选') {
      result = goldenPicksStocks;
    } else if (currentGroupName === '主升浪信号') {
      result = mainTrendStocks;
    } else if (currentGroupName === '游资重仓') {
      result = hotMoneyStocks;
    } else if (currentGroupName === '高股息') {
      result = highDividendStocks;
    } else if (currentGroupName === '我的持仓') {
      const positionStocks = stocksWithResults.filter(r => r.stock.positionQty && r.stock.positionQty > 0);
      const seen = new Set<string>();
      result = positionStocks.filter(r => {
        if (seen.has(r.stock.stockCode)) return false;
        seen.add(r.stock.stockCode);
        return true;
      });
    } else {
      result = stocksWithResults.filter(r => r.groupName === currentGroupName);
    }
    if (methodFilter !== 'all') {
      result = result.filter(r => r.params.method === methodFilter);
    }
    if (searchText.trim()) {
      const kw = searchText.trim().toLowerCase();
      result = result.filter(r =>
        r.stock.company.toLowerCase().includes(kw) ||
        r.stock.stockCode.toLowerCase().includes(kw) ||
        (r.stock.highlight || '').toLowerCase().includes(kw)
      );
    }
    return result;
  }, [stocksWithResults, preferredStocks, potentialStocks, institutionalStocks, goldenPicksStocks, mainTrendStocks, hotMoneyStocks, highDividendStocks, methodFilter, currentGroupName, searchText]);

  // 鎺掑簭
  const sorted = useMemo(() => {
    if (sortColumn === 'none') return filtered;
    return [...filtered].sort((a, b) => {
      let va: number, vb: number;
      if (sortColumn === 'safety') {
        va = a.stock.currentPrice ? a.result.safetyFactor : -1;
        vb = b.stock.currentPrice ? b.result.safetyFactor : -1;
      } else if (sortColumn === 'reliability') {
        // PEG 鏂规硶鎸?EPS 棰勬祴鍙俊搴︽帓搴忥紱其他鏂规硶瑙嗕负 0
        va = a.params.method === 'peg' ? getEpsReliabilityScore(a.stock) : 0;
        vb = b.params.method === 'peg' ? getEpsReliabilityScore(b.stock) : 0;
      } else if (sortColumn === 'fundamental') {
        va = getFundamentalScore(a.stock).total;
        vb = getFundamentalScore(b.stock).total;
      } else if (sortColumn === 'dividend') {
        va = a.stock.divYield ?? 0;
        vb = b.stock.divYield ?? 0;
      } else {
        // 按方法排序
        va = a.params.method.localeCompare(b.params.method);
        vb = b.params.method.localeCompare(a.params.method);
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [filtered, sortColumn, sortDir]);

  // 鍒嗛〉
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageStocks = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

// 鏇存柊浼板€煎弬鏁?
  const updateParams = useCallback((stockCode: string, updates: Partial<ValuationParams>) => {
    setValParams(prev => {
      const existing = prev[stockCode] || {
        stockCode,
        method: detectValuationMethod(''),
        ...getDefaultParams('peg'),
      };
      return {
        ...prev,
        [stockCode]: { ...existing, ...updates },
      };
    });
  }, [setValParams]);

// 鍒囨崲浼板€兼柟娉?
  const changeMethod = useCallback((stockCode: string, method: ValuationMethod) => {
    const defaults = getDefaultParams(method);
    updateParams(stockCode, { method, ...defaults });
  }, [updateParams]);

  // 鑷姩妫€娴嬫墍鏈夎偂绁ㄧ殑鏂规硶锛屽苟濉厖行业默认鍙傛暟
  const autoDetectAll = useCallback(() => {
    setValParams(prev => {
      const next = { ...prev };
      for (const { stock } of allStocks) {
        const method = detectValuationMethod(stock.highlight || '');
        const existing = next[stock.stockCode];
        next[stock.stockCode] = {
          ...existing,
          ...getDefaultParams(method),
          ...getIndustryDefaultParams(stock, method),
          stockCode: stock.stockCode,
          method,
        };
      }
      return next;
    });
  }, [allStocks, setValParams]);

  // 仅补齐已有方法但缺少的关键参数（不覆盖用户已填写的值）
  const fillMissingParams = useCallback(() => {
    setValParams(prev => {
      const next = { ...prev };
      for (const { stock } of allStocks) {
        const existing = next[stock.stockCode];
        const method = existing?.method || detectValuationMethod(stock.highlight || '');
        const defaults = {
          ...getDefaultParams(method),
          ...getIndustryDefaultParams(stock, method),
        };

// 只补充当前为 0 / undefined 的字段，保留用户已填写的值
        const merged: ValuationParams = { ...(existing as ValuationParams | undefined), stockCode: stock.stockCode, method } as ValuationParams;
        for (const [key, value] of Object.entries(defaults)) {
          const k = key as keyof ValuationParams;
          if (merged[k] === undefined || merged[k] === 0 || merged[k] === '') {
            (merged as any)[k] = value;
          }
        }
        next[stock.stockCode] = merged;
      }
      return next;
    });
  }, [allStocks, setValParams]);

  // 获取财报数据
  const handleRefreshFinancials = useCallback(async () => {
    if (!onRefreshFinancials) return;
    setFinancialsLoading(true);
    try {
      await onRefreshFinancials((current, total) => {
        setFinancialsProgress(`${current}/${total}`);
      });
      // 获取完成后自动补齐参数，将新获取的财务数据写入估值参数
      fillMissingParams();
      // 保存快照
      saveSnapshot();
    } catch (e) {
      console.error('获取财报数据失败:', e);
    } finally {
      setFinancialsLoading(false);
      setFinancialsProgress('');
    }
  }, [onRefreshFinancials, fillMissingParams]);

  // SWOT：自动静默加载已有的本地分析数据（纯本地读取，无网络请求）
  // 新公司的SWOT分析由用户在对话中按需请求，AI单独研究后写入数据库
  const swotAutoLoaded = useRef(false);
  useEffect(() => {
    if (swotAutoLoaded.current || !onBatchUpdateSwot) return;
    const updates: { stockCode: string; swot: NonNullable<PEGStock['swot']> }[] = [];
    for (const { stock } of allStocks) {
      if (stock.swot) continue; // 已有数据跳过
      const swotData = getSwotByCode(stock.stockCode);
      if (swotData) updates.push({ stockCode: stock.stockCode, swot: swotData });
    }
    if (updates.length > 0) {
      swotAutoLoaded.current = true;
      onBatchUpdateSwot(updates);
    }
  }, [allStocks, onBatchUpdateSwot]);

  // SWOT 按需分析：提交请求 + 轮询结果
  const [swotPending, setSwotPending] = useState<Set<string>>(new Set());
  const swotPollingRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const handleRequestSwot = useCallback(async (stockCode: string, stockName: string) => {
    // 先检查缓存中是否已有结果（可能之前已分析过）
    const cached = await fetchCachedSwot(stockCode);
    if (cached) {
      onUpdateSwot?.(stockCode, cached);
      return;
    }
    // 提交分析请求
    await requestSwotAnalysis(stockCode, stockName);
    setSwotPending(prev => new Set(prev).add(stockCode));

    // 轮询缓存（每 5 秒查一次，最多 6 分钟）
    let attempts = 0;
    const maxAttempts = 72;
    if (swotPollingRef.current[stockCode]) clearInterval(swotPollingRef.current[stockCode]);
    swotPollingRef.current[stockCode] = setInterval(async () => {
      attempts++;
      const data = await fetchCachedSwot(stockCode);
      if (data) {
        onUpdateSwot?.(stockCode, data);
        setSwotPending(prev => {
          const next = new Set(prev);
          next.delete(stockCode);
          return next;
        });
        clearInterval(swotPollingRef.current[stockCode]);
        delete swotPollingRef.current[stockCode];
      } else if (attempts >= maxAttempts) {
        // 超时停止轮询
        setSwotPending(prev => {
          const next = new Set(prev);
          next.delete(stockCode);
          return next;
        });
        clearInterval(swotPollingRef.current[stockCode]);
        delete swotPollingRef.current[stockCode];
      }
    }, 5000);
  }, [onUpdateSwot]);

  // 组件卸载时清理所有轮询
  useEffect(() => {
    return () => {
      Object.values(swotPollingRef.current).forEach(clearInterval);
    };
  }, []);

  // 启动时检查缓存：如果之前已分析过的公司，自动加载
  const swotCacheChecked = useRef(false);
  useEffect(() => {
    if (swotCacheChecked.current || !onUpdateSwot) return;
    swotCacheChecked.current = true;
    (async () => {
      for (const { stock } of allStocks) {
        if (stock.swot) continue;
        const cached = await fetchCachedSwot(stock.stockCode);
        if (cached) onUpdateSwot(stock.stockCode, cached);
      }
    })();
  }, [allStocks, onUpdateSwot]);

  // 进入"我的持仓"或"自选"TAB时，自动为缺少SWOT的股票提交分析请求
  const swotAutoRequestedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (currentGroupName !== '我的持仓' && currentGroupName !== '自选') return;
    if (swotAutoRequestedRef.current.has(currentGroupName)) return;

    let targetStocks: typeof stocksWithResults;
    if (currentGroupName === '我的持仓') {
      targetStocks = stocksWithResults.filter(r =>
        r.stock.positionQty && r.stock.positionQty > 0 && !r.stock.swot
      );
    } else {
      targetStocks = stocksWithResults.filter(r => !r.stock.swot);
    }

    if (targetStocks.length === 0) {
      swotAutoRequestedRef.current.add(currentGroupName);
      return;
    }

    swotAutoRequestedRef.current.add(currentGroupName);
    for (const { stock } of targetStocks) {
      if (!swotPending.has(stock.stockCode)) {
        handleRequestSwot(stock.stockCode, stock.company);
      }
    }
  }, [currentGroupName, stocksWithResults, swotPending, handleRequestSwot]);

  // 获取持仓数据（国家队+外资）
  const handleRefreshHolders = useCallback(async () => {
    if (!onRefreshHolders) return;
    setHoldersLoading(true);
    try {
      await onRefreshHolders((current, total) => {
        setHoldersProgress(`${current}/${total}`);
      });
    } catch (e) {
      console.error('获取持仓数据失败:', e);
    } finally {
      setHoldersLoading(false);
      setHoldersProgress('');
    }
  }, [onRefreshHolders]);

  const toggleSort = (col: 'safety' | 'method' | 'reliability' | 'fundamental' | 'dividend') => {
    if (sortColumn === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else if (sortColumn === 'none') {
      setSortColumn(col);
      setSortDir('desc');
    } else {
      setSortColumn('none');
    }
  };

  // 统计（限定当前分组）
  const methodStats = useMemo(() => {
    const stats: Record<string, number> = {};
    let groupData;
    if (currentGroupName === '优选') {
      groupData = preferredStocks;
    } else if (currentGroupName === '潜力股') {
      groupData = potentialStocks;
    } else if (currentGroupName === '机构重仓') {
      groupData = institutionalStocks;
    } else if (currentGroupName === '机构金选') {
      groupData = goldenPicksStocks;
    } else if (currentGroupName === '主升浪信号') {
      groupData = mainTrendStocks;
    } else if (currentGroupName === '游资重仓') {
      groupData = hotMoneyStocks;
    } else if (currentGroupName === '高股息') {
      groupData = highDividendStocks;
    } else if (currentGroupName === '我的持仓') {
      const seen = new Set<string>();
      groupData = stocksWithResults.filter(r => {
        if (seen.has(r.stock.stockCode)) return false;
        if (r.stock.positionQty && r.stock.positionQty > 0) {
          seen.add(r.stock.stockCode);
          return true;
        }
        return false;
      });
    } else {
      groupData = stocksWithResults.filter(r => r.groupName === currentGroupName);
    }
    for (const { params } of groupData) {
      stats[params.method] = (stats[params.method] || 0) + 1;
    }
    return stats;
  }, [stocksWithResults, preferredStocks, potentialStocks, institutionalStocks, goldenPicksStocks, mainTrendStocks, hotMoneyStocks, highDividendStocks, currentGroupName]);

  const inputFieldsCache = useMemo(() => {
    const cache: Record<string, ReturnType<typeof getMethodInputFields>> = {};
    for (const m of VALUATION_METHODS) {
      cache[m.method] = getMethodInputFields(m.method);
    }
    return cache;
  }, []);

  // 持仓表格渲染函数
  const renderHolderTable = (
    data: any[],
    title: string,
    icon: string,
    headerBg: string,
    headerBorder: string,
    titleColor: string,
    tagColorMap: { [k: string]: string },
    detailBg: string,
    detailBorder: string,
    detailTextColor: string
  ) => {
    if (data.length === 0) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className={`px-4 py-2 ${headerBg} border-b ${headerBorder} rounded-t-lg flex items-center justify-between`}>
          <h3 className={`text-sm font-semibold ${titleColor}`}>{icon} {title}（共 {data.length} 家机构）</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-1.5 text-left font-medium text-gray-600">机构名称</th>
                <th className="px-3 py-1.5 text-center font-medium text-gray-600">类型</th>
                <th className="px-3 py-1.5 text-center font-medium text-gray-600">持仓股票数</th>
                <th className="px-3 py-1.5 text-center font-medium text-gray-600">总持仓占比</th>
                <th className="px-3 py-1.5 text-left font-medium text-gray-600">持仓明细</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, idx) => (
                <tr key={item.name} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-1.5 font-medium text-gray-800" title={item.name}>{item.name.length > 25 ? item.name.substring(0, 25) + '...' : item.name}</td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${tagColorMap[item.shortName] || 'bg-gray-100 text-gray-700'}`}>{item.shortName}</span>
                  </td>
                  <td className="px-3 py-1.5 text-center text-gray-600">{item.count}</td>
                  <td className={`px-3 py-1.5 text-center font-semibold ${detailTextColor}`}>{item.totalRatio.toFixed(2)}%</td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {item.positions.map((p: any) => (
                        <div key={p.stockCode} className={`px-1.5 py-0.5 ${detailBg} border ${detailBorder} rounded text-[10px] whitespace-nowrap`} title={`${p.company}\n占比: ${p.ratio.toFixed(2)}%\n持股: ${Math.round(p.holdNum / 10000)}万股\n变动: ${p.change}`}>
                          {p.company} <span className={`font-semibold ${detailTextColor}`}>{p.ratio.toFixed(2)}%</span> <span className={p.change === '加仓' ? 'text-red-500' : p.change === '新进' ? 'text-green-500' : 'text-gray-400'}>{p.change}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const hasAnyHolderData = socialSecuritySummary.length > 0 || pensionSummary.length > 0 || foreignSummary.length > 0 || nationalTeamSummary.length > 0;

  return (
    <div className="p-2">
      {/* 行业多方法估值内容 */}
          {/* 工具栏：方法统计 + 搜索 + 按钮 */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            {/* 方法统计 */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setMethodFilter('all')}
                className={`text-xs px-2 py-0.5 rounded transition-all border border-gray-200 ${
                  methodFilter === 'all'
                    ? 'bg-blue-500 text-white ring-2 ring-blue-300 scale-105'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 opacity-80'
                }`}
              >
                全部
              </button>
              {VALUATION_METHODS.map(m => {
                const count = methodStats[m.method] || 0;
                if (count === 0 && m.method !== 'peg') return null;
                const isActive = methodFilter === m.method;
                return (
                  <button
                    key={m.method}
                    onClick={() => setMethodFilter(isActive ? 'all' : m.method)}
                    title={isActive ? '点击取消筛选' : '点击筛选'}
                    className={`text-xs px-2 py-0.5 rounded transition-all border ${getMethodTagClass(m.method)} ${
                      isActive
                        ? 'ring-2 ring-blue-400 scale-105 font-semibold shadow-sm'
                        : 'opacity-60 hover:opacity-100 border-transparent'
                    }`}
                  >
                    {m.shortLabel} <span className="font-bold">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex-1" />

            {/* 搜索框 */}
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={searchText}
                onChange={e => { setSearchText(e.target.value); setCurrentPage(1); }}
                placeholder="搜索股票名称 / 代码 / 行业"
                className="text-xs border border-gray-300 rounded px-2 py-1 w-48 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {searchText && (
                <button
                  onClick={() => { setSearchText(''); setCurrentPage(1); }}
                  className="text-xs text-gray-500 hover:text-gray-700 px-1"
                  title="清空搜索"
                >
                  ×
                </button>
              )}
            </div>

            {/* 自动检测按钮 */}
            <button
              onClick={autoDetectAll}
              className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded transition-colors"
              title="根据行业名称自动匹配估值方法并补充默认参数"
            >
              自动匹配方法
            </button>

            {/* 补齐参数按钮 */}
            <button
              onClick={fillMissingParams}
              className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded transition-colors"
              title="为当前已选估值方法补齐缺少参数（不覆盖已填写值）"
            >
              补齐参数
            </button>

            {/* 获取财报数据按钮 */}
            {onRefreshFinancials && (
              <button
                onClick={handleRefreshFinancials}
                disabled={financialsLoading}
                className={`text-xs px-3 py-1 rounded transition-colors ${
                  financialsLoading ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'
                }`}
                title="从东方财富API获取PB、ROE、每股净资产等财务数据，自动补充估值参数"
              >
                {financialsLoading ? '获取中..' : '获取财报数据'}
              </button>
            )}

            {/* 获取进度 */}
            {financialsProgress && (
              <span className="text-xs text-gray-500 ml-2">
                进度: {financialsProgress}
              </span>
            )}

            {/* 获取持仓数据按钮 */}
            {onRefreshHolders && (
              <button
                onClick={handleRefreshHolders}
                disabled={holdersLoading}
                className={`text-xs px-3 py-1 rounded transition-colors ${
                  holdersLoading ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-cyan-500 hover:bg-cyan-600 text-white'
                }`}
                title="从东方财富API获取十大流通股东，筛选国家队、外资（北向资金+QFII）和游资持仓"
              >
                {holdersLoading ? `获取中..${holdersProgress ? ` (${holdersProgress})` : ''}` : '刷新持仓'}
              </button>
            )}
          </div>

          {/* 分组切换 Tab */}
      <div className="flex items-center gap-1 mb-2 border-b border-gray-200">
        {SEARCH_GROUPS.map((g, i) => {
          let count;
          if (g === '优选') {
            count = preferredStocks.length;
          } else if (g === '潜力股') {
            count = potentialStocks.length;
          } else if (g === '机构重仓') {
            count = institutionalStocks.length;
          } else if (g === '机构金选') {
            count = goldenPicksStocks.length;
          } else if (g === '主升浪信号') {
            count = mainTrendStocks.length;
          } else if (g === '游资重仓') {
            count = hotMoneyStocks.length;
          } else if (g === '高股息') {
            count = highDividendStocks.length;
          } else if (g === '我的持仓') {
            const positionStocks = stocksWithResults.filter(r => r.stock.positionQty && r.stock.positionQty > 0);
            const seen = new Set<string>();
            count = positionStocks.filter(r => {
              if (seen.has(r.stock.stockCode)) return false;
              seen.add(r.stock.stockCode);
              return true;
            }).length;
          } else {
            count = stocksWithResults.filter(r => r.groupName === g).length;
          }

          let icon = '';
          let activeColor = 'text-blue-600';
          let hoverColor = 'text-gray-500 hover:text-gray-700 hover:bg-gray-100';
          let title = undefined;

          if (g === '优选') {
            icon = '★ ';
            activeColor = 'text-amber-600';
            hoverColor = 'text-amber-500 hover:text-amber-700 hover:bg-amber-50';
            title = '自动筛选：同时获得国家队和外资加仓/新进的股票（排除港股/创业板/科创板）';
          } else if (g === '潜力股') {
            icon = '🏆 ';
            activeColor = 'text-emerald-600';
            hoverColor = 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50';
            title = '自动筛选：基本面大于60分且安全系数不低于0.75（重点关注或分批建仓）的股票（排除港股/创业板/科创板）';
          } else if (g === '机构重仓') {
            icon = '🏦 ';
            activeColor = 'text-blue-600';
            hoverColor = 'text-blue-500 hover:text-blue-700 hover:bg-blue-50';
            title = '自动筛选：社保+养老金合计持仓>=5%且至少一家加仓/新进的股票（排除港股/创业板/科创板）';
          } else if (g === '机构金选') {
            icon = '💎 ';
            activeColor = 'text-purple-600';
            hoverColor = 'text-purple-500 hover:text-purple-700 hover:bg-purple-50';
            title = '自动筛选：基本面≥65分 + 社保/养老金/证金/汇金/QFII持仓 + 建议（重点关注/分批建仓），排除港股/创业板/科创板';
          } else if (g === '主升浪信号') {
            icon = '🚀 ';
            activeColor = 'text-red-600';
            hoverColor = 'text-red-500 hover:text-red-700 hover:bg-red-50';
            title = '自动筛选：主升浪启动 / 蓄势待发 / 趋势形成中（排除港股/创业板/科创板）— 均线多头排列刚形成、放量突破盘整平台、量能持续放大的买点候选';
          } else if (g === '游资重仓') {
            icon = '🔥 ';
            activeColor = 'text-orange-600';
            hoverColor = 'text-orange-500 hover:text-orange-700 hover:bg-orange-50';
            title = '自动筛选：所有有游资持仓的股票（排除港股/创业板/科创板），知名私募/游资扎堆的短线活跃股，按持仓比例降序排列';
          } else if (g === '高股息') {
            icon = '💰 ';
            activeColor = 'text-green-600';
            hoverColor = 'text-green-500 hover:text-green-700 hover:bg-green-50';
            title = '自动筛选：股息率 > 5% 且安全系数 > 1（重点关注）的股票（跨所有分组去重），按股息率降序排列';
          } else if (g === '我的持仓') {
            icon = '📈 ';
            activeColor = 'text-indigo-600';
            hoverColor = 'text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50';
            title = '我的持仓：已添加持仓记录的股票（显示持仓数量、成本价、盈亏等）';
          }

          return (
            <button
              key={g}
              onClick={() => {
                setActiveGroupIdx(i);
                setCurrentPage(1);
                setExpandedRow(null);
                // 高股息标签默认按股息率降序；其他标签恢复默认安全系数降序
                if (g === '高股息') {
                  setSortColumn('dividend');
                  setSortDir('desc');
                } else if (sortColumn === 'dividend') {
                  setSortColumn('safety');
                  setSortDir('desc');
                }
              }}
              className={`px-4 py-1.5 text-xs font-medium rounded-t transition-colors ${
                i === activeGroupIdx
                  ? `bg-white ${activeColor} border border-b-white -mb-px shadow-sm`
                  : hoverColor
              }`}
              title={title}
            >
              {icon}{g}
              <span className="ml-1 text-gray-400">({count})</span>
            </button>
          );
        })}
      </div>

      {currentGroupName === '优选' && (
        <div className="mb-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
          ★ <strong>优选股票</strong>：同时获得国家队（社保/汇金/证金/大基金等）和外资（北向资金/QFII）加仓或新进的股票（已排除港股、创业板、科创板），共 {preferredStocks.length} 只
        </div>
      )}

      {currentGroupName === '潜力股' && (
        <div className="mb-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700">
          🏆 <strong>潜力股</strong>：基本面评分大于 60 分且安全系数不低于 0.75（重点关注或分批建仓）的股票（已排除港股、创业板、科创板），共 {potentialStocks.length} 只
        </div>
      )}

      {currentGroupName === '机构重仓' && (
        <div className="mb-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
          🏦 <strong>机构重仓</strong>：社保+养老金合计持仓比例大于等于 5%，且至少有一家机构加仓或新进的股票（已排除港股、创业板、科创板），共 {institutionalStocks.length} 只
        </div>
      )}

      {currentGroupName === '机构金选' && (
        <div className="mb-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded text-xs text-purple-700">
          💎 <strong>机构金选</strong>：基本面评分 ≥ 65 分 + 社保/养老金/证金/汇金/QFII 有持仓 + 推荐建议为「重点关注」或「分批建仓」（已排除港股、创业板、科创板），共 {goldenPicksStocks.length} 只
        </div>
      )}

      {currentGroupName === '主升浪信号' && (
        <div className="mb-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          🚀 <strong>主升浪信号</strong>：自动筛选「主升浪启动 / 蓄势待发 / 趋势形成中」三种买点信号的股票（已排除港股、创业板、科创板）— 按信号优先级排序（主升浪启动 ＞ 蓄势待发 ＞ 趋势形成中），再按安全系数排序，共 {mainTrendStocks.length} 只
        </div>
      )}

      {currentGroupName === '游资重仓' && (
        <div className="mb-2 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700">
          🔥 <strong>游资重仓</strong>：所有有游资（知名私募/游资大佬）持仓的股票（已排除港股、创业板、科创板），按游资持仓比例降序 → 持仓家数降序排列，共 {hotMoneyStocks.length} 只
        </div>
      )}

      {currentGroupName === '高股息' && (
        <div className="mb-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded text-xs text-green-700">
          💰 <strong>高股息·重点关注</strong>：仅筛选股息率 &gt; 5% 且安全系数 &gt; 1（重点关注）的股票（跨所有分组去重），按股息率降序排列，共 {highDividendStocks.length} 只
        </div>
      )}

      {currentGroupName === '我的持仓' && (
        <div className="mb-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded text-xs text-indigo-700">
          📈 <strong>我的持仓</strong>：已添加持仓记录的股票（显示持仓数量、成本价、盈亏等，已按股票代码去重），共 {(function() { const ps = stocksWithResults.filter(r => r.stock.positionQty && r.stock.positionQty > 0); const s = new Set<string>(); return ps.filter(r => { if (s.has(r.stock.stockCode)) return false; s.add(r.stock.stockCode); return true; }).length; })()} 只
        </div>
      )}

      {/* 顶部同步滚动条 */}
      <div className="px-4 pt-2">
        <div ref={topBarRef} className="scrollbar-top" onScroll={(e) => syncScrollMv(e.currentTarget, tableRef.current)}>
          <div className="scrollbar-top-inner" style={{ width: mvTableWidth }} />
        </div>
        <span className="scroll-hint">提示：Shift + 鼠标滚轮 横向滚动</span>
      </div>
      {/* 表格 */}
      <div ref={tableRef} className="table-container" onScroll={(e) => syncScrollMv(e.currentTarget, topBarRef.current)}>
        <table className="stock-table" style={{ minWidth: '2420px' }}>
          <thead>
            <tr>
              <th>序号</th>
              {currentGroupName === '我的持仓' && (
                <th title="根据当前股价与买入/卖出信号的关系判断">信号状态</th>
              )}
              <th className="cursor-pointer select-none" onClick={() => toggleSort('method')} title="点击排序">
                估值方法 {sortColumn === 'method' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('reliability')} title="点击排序">
                可信度 {sortColumn === 'reliability' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th>公司</th>
              <th>板块</th>
              <th>行业</th>
              <th>当前<br/>股价</th>
              <th>合理<br/>价位</th>
              <th>买入<br/>信号</th>
              <th>卖出<br/>信号</th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('safety')} title="点击排序">
                安全系数 {sortColumn === 'safety' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th>建议</th>
              <th>反弹信号</th>
              <th>操作建议</th>
              <th
                className={`cursor-pointer select-none ${currentGroupName === '高股息' ? 'text-green-700 font-bold' : ''}`}
                title="点击按股息率排序"
                onClick={() => toggleSort('dividend')}
              >
                股息率 {sortColumn === 'dividend' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th title="判断是否处于主升浪起点：均线多头刚形成+放量突破盘整+量能持续">主升浪</th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('fundamental')} title="点击排序：基本面评分（满分100）">
                基本面 {sortColumn === 'fundamental' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th title="SWOT分析：优势、劣势、机会、威胁（点击展开查看）">SWOT</th>
              <th title="国家队持仓（社保/汇金/证金/大基金/养老金）">国家队</th>
              <th title="外资持仓（北向资金/QFII，合计占比）">外资</th>
              <th title="游资持仓（知名私募机构等）">游资</th>
              <th>PE</th>
              <th>CAGR</th>
              <th title="机构一致预期PEG（来自东方财富PEG_CAR）">PEG<br/>(机构)</th>
              <th title="前瞻PE / (CAGR * 100)，公式计算">PEG<br/>(公式)</th>
              <th title="当前实际市净率 PB（来自实时行情）">当前<br/>PB</th>
              <th title="当前PB在历史10年区间中的百分位位置">PB分位</th>
              <th title="历史10年PB低位（10%分位）">PB<br/>(10%)</th>
              <th title="历史10年PB高位（90%分位）">PB<br/>(90%)</th>
              <th className="text-blue-700">EPS<br/>2026E</th>
              <th className="text-blue-700">EPS<br/>2027E</th>
              <th className="text-blue-700">EPS<br/>2028E</th>
              <th>市值<br/>(亿)</th>
              <th>年内<br/>涨跌幅%</th>
              <th className="text-indigo-600" title="持仓数量(股)">持仓<br/>数量</th>
              <th className="text-indigo-600" title="持仓成本价(元)">成本<br/>价</th>
              <th className="text-indigo-600" title="持仓盈亏">盈亏<br/>金额</th>
              <th className="text-indigo-600" title="持仓盈亏比例">盈亏<br/>比例</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {pageStocks.map(({ stock: s, params, result }, idx) => {
              const globalIdx = (currentPage - 1) * PAGE_SIZE + idx;
              const isExpanded = expandedRow === s.stockCode;

              return (
                <Fragment key={s.stockCode}>
                  <tr className={isExpanded ? '!bg-blue-50' : ''}>
                    {/* 序号 */}
                    <td className="text-gray-500">{globalIdx + 1}</td>
                    {/* 持仓信号状态（仅「我的持仓」分组显示） */}
                    {currentGroupName === '我的持仓' && (() => {
                      const price = s.currentPrice;
                      const buy = result.buySignal;
                      const sell = result.sellSignal;
                      let signal = '';
                      let cls = '';
                      if (price > 0 && buy > 0 && price <= buy) {
                        signal = '🟢 买入区间';
                        cls = 'bg-green-100 text-green-800 font-bold';
                      } else if (price > 0 && sell > 0 && price >= sell) {
                        signal = '🔴 卖出区间';
                        cls = 'bg-red-100 text-red-800 font-bold';
                      } else if (price > 0 && buy > 0 && sell > 0 && price > buy && price < sell) {
                        signal = '⚪ 持有区间';
                        cls = 'bg-gray-100 text-gray-600';
                      } else {
                        signal = '— 无信号';
                        cls = 'text-gray-400';
                      }
                      return (
                        <td>
                          <span className={`inline-block px-2 py-0.5 rounded text-xs ${cls}`} title={`买入信号: ${buy > 0 ? buy.toFixed(2) : '-'}  卖出信号: ${sell > 0 ? sell.toFixed(2) : '-'}`}>
                            {signal}
                          </span>
                        </td>
                      );
                    })()}
                    {/* 估值方法标签 */}
                    <td>
                      <select
                        value={params.method}
                        onChange={e => changeMethod(s.stockCode, e.target.value as ValuationMethod)}
                        className={`text-xs px-1.5 py-0.5 rounded border-0 cursor-pointer ${getMethodTagClass(params.method)}`}
                        title={getMethodLabel(params.method)}
                      >
                        {VALUATION_METHODS.map(m => (
                          <option key={m.method} value={m.method}>{m.shortLabel}</option>
                        ))}
                      </select>
                    </td>
                    {/* 鍙潬鎬э紙浠匬EG鏂规硶鏄剧ず锛?*/}
                    <td>
                      {params.method === 'peg' ? (
                        <span className={`inline-block px-1.5 py-0.5 rounded font-semibold ${getReliabilityClass(getEpsReliabilityScore(s))}`}>
                          {getEpsReliabilityScore(s)}
                          <span className="ml-0.5 opacity-75">{getReliabilityText(getEpsReliabilityScore(s))}</span>
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    {/* 鍏徃 */}
                    <td className="text-left font-medium whitespace-nowrap">{s.company}</td>
                    {/* 鏉垮潡 */}
                    <td>{getStockBoard(s.stockCode)}</td>
                    {/* 琛屼笟 */}
                    <td>{s.highlight || '-'}</td>
                    {/* 褰撳墠鑲′环 */}
                    <td className={s.yearChange >= 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                      {s.currentPrice ? formatNumber(s.currentPrice) : '-'}
                    </td>
                    {/* 鍚堢悊浠蜂綅 */}
                    <td className={`formula-cell ${s.currentPrice ? 'text-blue-700' : 'text-gray-400'}`}>
                      {s.currentPrice && result.fairValue > 0 ? formatNumber(result.fairValue) : '-'}
                    </td>
                    {/* 涔板叆淇″彿 */}
                    <td className={`formula-cell ${s.currentPrice && result.buySignal > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {s.currentPrice && result.buySignal > 0 ? formatNumber(result.buySignal) : '-'}
                    </td>
                    {/* 鍗栧嚭淇″彿 */}
                    <td className={`formula-cell ${s.currentPrice && result.sellSignal > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {s.currentPrice && result.sellSignal > 0 ? formatNumber(result.sellSignal) : '-'}
                    </td>
                    {/* 瀹夊叏绯绘暟 */}
                    <td className={`font-semibold ${s.currentPrice ? getSafetyColor(result.safetyFactor) : 'text-gray-400'}`}>
                      {s.currentPrice && result.safetyFactor > 0 ? (result.safetyFactor * 100).toFixed(0) + '%' : '-'}
                    </td>
                    {/* 寤鸿 */}
                    <td>
                      <span className={`text-xs px-2 py-0.5 rounded ${s.currentPrice ? getAdviceClass(result.rating) : 'text-gray-400'}`}>
                        {s.currentPrice ? result.rating : '-'}
                      </span>
                    </td>
                    {/* 鍙嶅脊淇″彿 */}
                    <td>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${getEntrySignal(s).className}`}>
                        {getEntrySignal(s).text}
                      </span>
                    </td>
                    {/* 鎿嶄綔寤鸿 */}
                    <td className="text-center whitespace-nowrap">
                      {(() => {
                        const sig = getActionSignal(s, result.safetyFactor);
                        return (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs ${sig.className}`}>
                              {sig.action}
                            </span>
                            <span className="text-[10px] text-gray-400 leading-none">{sig.reason}</span>
                          </div>
                        );
                      })()}
                    </td>
                    {/* 股息率 */}
                    <td className={`text-center whitespace-nowrap font-semibold ${currentGroupName === '高股息' && (s.divYield ?? 0) >= 5 ? 'text-green-700' : ((s.divYield ?? 0) > 0 ? 'text-blue-600' : 'text-gray-300')}`}>
                      {(s.divYield ?? 0) > 0 ? (s.divYield!).toFixed(2) + '%' : '-'}
                    </td>
                    {/* 主升浪信号 */}
                    <td className="text-center whitespace-nowrap">
                      {(() => {
                        const mt = getMainTrendSignal(s);
                        return (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${mt.className}`}>
                              {mt.signal}
                            </span>
                            <span className="text-[10px] text-gray-400 leading-none">{mt.reason}</span>
                          </div>
                        );
                      })()}
                    </td>
                    {/* 鍩烘湰闈㈣瘎鍒?*/}
                    <td
                      className="cursor-pointer hover:bg-gray-100 transition-colors"
                      title="点击查看详细打分过程"
                      onClick={() => setExpandedFundamentalRow(prev => prev === s.stockCode ? null : s.stockCode)}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${getFundamentalClass(getFundamentalScore(s).total)}`}>
                          {getFundamentalScore(s).total > 0 ? getFundamentalScore(s).total + '分' : '-'}
                        </span>
                        {getFundamentalScore(s).total > 0 && (
                          <span className="text-[10px] text-gray-400 leading-none">
                            {expandedFundamentalRow === s.stockCode ? '▲ 收起' : '▼ 展开'}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* SWOT分析 */}
                    <td
                      className="cursor-pointer hover:bg-purple-50 transition-colors text-center"
                      title="点击查看SWOT分析（优势、劣势、机会、威胁）"
                      onClick={() => {
                        const hasSwot = s.swot && (s.swot.strengths.length > 0 || s.swot.weaknesses.length > 0 || s.swot.opportunities.length > 0 || s.swot.threats.length > 0);
                        if (hasSwot) setExpandedSwotRow(prev => prev === s.stockCode ? null : s.stockCode);
                      }}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        {s.swot && (s.swot.strengths.length > 0 || s.swot.weaknesses.length > 0 || s.swot.opportunities.length > 0 || s.swot.threats.length > 0) ? (
                          <>
                            <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700 font-medium">
                              已分析
                            </span>
                            <span className="text-[10px] text-gray-400 leading-none">
                              {expandedSwotRow === s.stockCode ? '▲ 收起' : '▼ 展开'}
                            </span>
                          </>
                        ) : swotPending.has(s.stockCode) ? (
                          <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700 font-medium animate-pulse">
                            分析中...
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRequestSwot(s.stockCode, s.company);
                            }}
                            className="inline-block px-1.5 py-0.5 rounded text-xs bg-violet-500 hover:bg-violet-600 text-white font-medium transition-colors"
                            title="点击请求AI单独分析该公司的SWOT"
                          >
                            🔍分析
                          </button>
                        )}
                      </div>
                    </td>
                    {/* 国家队持仓（所有模式均显示合计占比；机构重仓模式下仅计算社保+养老金） */}
                    {(() => {
                      const holderKey = `mval-${s.stockCode}`;
                      const isHolderExpanded = expandedHolderRow === holderKey;
                      const hasDetails = s.holderDetails && s.holderDetails.length > 0;

                      let displayRatio = s.nationalTeamRatio;
                      let displayChange = s.nationalTeamChange;
                      let displayCount = s.nationalTeamCount;
                      let displayTitle = hasDetails ? '点击查看持仓明细' : '国家队持仓（社保/汇金/证金/大基金/养老金）';

                      if (currentGroupName === '机构重仓' && s.holderDetails) {
                        const sbOrPension = s.holderDetails.filter(h => h.type === '社保' || h.type === '养老金');
                        displayRatio = sbOrPension.reduce((sum, h) => sum + (h.ratio || 0), 0);
                        displayCount = sbOrPension.length;
                        const hasBuying = sbOrPension.some(h => h.change === '加仓' || h.change === '新进');
                        displayChange = hasBuying ? '加仓' : (sbOrPension[0]?.change || '—');
                        displayTitle = '社保+养老金持仓';
                      } else if (currentGroupName === '游资重仓') {
                        // 兜底：type==='游资' 或 name 匹配 HOT_MONEY_NAMES 白名单（章建平家族/葛卫东家族/陈小群等）
                        const hotMoneyDetails = s.holderDetails
                          ? s.holderDetails.filter(h => {
                              if (h.type === '游资') return true;
                              const n = (h.name || '').toLowerCase();
                              return HOT_MONEY_NAMES.some(nm => n.includes(nm.toLowerCase()));
                            })
                          : [];
                        const ratioFromDetails = hotMoneyDetails.reduce((sum, h) => sum + (h.ratio || 0), 0);
                        displayRatio = Math.max(s.hotMoneyRatio || 0, ratioFromDetails);
                        displayChange = s.hotMoneyChange || (hotMoneyDetails[0]?.change ?? '—');
                        displayCount = Math.max(s.hotMoneyCount || 0, hotMoneyDetails.length);
                        displayTitle = '游资持仓（章建平家族/葛卫东家族/陈小群等知名牛散+私募）';
                      }

                      if (displayRatio === undefined || displayRatio === 0) {
                        return <td className="text-center text-gray-300 text-xs">—</td>;
                      }
                      return (
                        <td
                          className={`text-center text-xs whitespace-nowrap ${hasDetails ? 'cursor-pointer hover:bg-blue-50 transition-colors' : ''}`}
                          title={displayTitle}
                          onClick={hasDetails ? () => setExpandedHolderRow(prev => prev === holderKey ? null : holderKey) : undefined}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-blue-600">{typeof displayRatio === 'number' ? displayRatio.toFixed(2) : displayRatio}%</span>
                            <span className={getHolderChangeClass(displayChange)}>
                              {displayChange || '—'}
                              {displayCount && displayCount > 1 && (
                                <span className="text-gray-400 ml-0.5" title={`共${displayCount}家机构持仓`}>+{displayCount - 1}</span>
                              )}
                            </span>
                            {hasDetails && (
                              <span className="text-[10px] text-blue-400 leading-none">{isHolderExpanded ? '▲ 收起' : '▼ 明细'}</span>
                            )}
                          </div>
                        </td>
                      );
                    })()}
                    {/* 外资持仓（北向资金/QFII，显示合计占比） */}
                    {(() => {
                      const holderKey = `mval-${s.stockCode}`;
                      const isHolderExpanded = expandedHolderRow === holderKey;
                      const hasDetails = s.holderDetails && s.holderDetails.length > 0;
                      const hasQFII = s.qfiiRatio !== undefined && s.qfiiRatio > 0;
                      if (s.foreignRatio === undefined || s.foreignRatio === 0) {
                        return <td className="text-center text-gray-300 text-xs">—</td>;
                      }
                      return (
                        <td
                          className={`text-center text-xs whitespace-nowrap ${hasDetails ? 'cursor-pointer hover:bg-blue-50 transition-colors' : ''}`}
                          title={hasDetails ? '点击查看持仓明细' : '外资持仓（北向资金/QFII，合计占比）'}
                          onClick={hasDetails ? () => setExpandedHolderRow(prev => prev === holderKey ? null : holderKey) : undefined}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-blue-600">{typeof s.foreignRatio === 'number' ? s.foreignRatio.toFixed(2) : s.foreignRatio}%</span>
                            <span className={getHolderChangeClass(s.foreignChange)}>
                              {s.foreignChange || '—'}
                              {s.foreignCount && s.foreignCount > 1 && (
                                <span className="text-gray-400 ml-0.5" title={`共${s.foreignCount}家外资持仓`}>+{s.foreignCount - 1}</span>
                              )}
                            </span>
                            {hasQFII && (
                              <span className="text-[10px] text-sky-500 leading-none" title={`QFII: ${s.qfiiName} ${typeof s.qfiiRatio === 'number' ? s.qfiiRatio.toFixed(2) : s.qfiiRatio}%`}>
                                {s.qfiiName} {typeof s.qfiiRatio === 'number' ? s.qfiiRatio.toFixed(2) : s.qfiiRatio}%
                              </span>
                            )}
                            {hasDetails && (
                              <span className="text-[10px] text-blue-400 leading-none">{isHolderExpanded ? '▲ 收起' : '▼ 明细'}</span>
                            )}
                          </div>
                        </td>
                      );
                    })()}
                    {/* 游资持仓（知名私募机构等） */}
                    {(() => {
                      const holderKey = `mval-${s.stockCode}`;
                      const hasDetails = s.holderDetails && s.holderDetails.length > 0;
                      if (!s.hotMoneyName && s.hotMoneyRatio === undefined) {
                        return <td className="text-center text-gray-300 text-xs">—</td>;
                      }
                      return (
                        <td
                          className={`text-center text-xs whitespace-nowrap ${hasDetails ? 'cursor-pointer hover:bg-blue-50 transition-colors' : ''}`}
                          title={hasDetails ? '点击查看持仓明细' : '游资持仓（知名私募机构等）'}
                          onClick={hasDetails ? () => setExpandedHolderRow(prev => prev === holderKey ? null : holderKey) : undefined}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-purple-600">{s.hotMoneyRatio}%</span>
                            <span className={getHolderChangeClass(s.hotMoneyChange)}>
                              {s.hotMoneyChange || '—'}
                              {s.hotMoneyCount && s.hotMoneyCount > 1 && (
                                <span className="text-gray-400 ml-0.5" title={`共${s.hotMoneyCount}家游资持仓`}>+{s.hotMoneyCount - 1}</span>
                              )}
                            </span>
                          </div>
                        </td>
                      );
                    })()}
                    {/* PE */}
                    <td className="text-center">{hasEpsData(s) ? (s.pe ? formatNumber(s.pe, 2) : '-') : '-'}</td>
                    {/* CAGR */}
                    <td className="text-center">{getDisplayCAGR(s) ? formatNumber(getDisplayCAGR(s) * 100, 2) + '%' : '-'}</td>
                    {/* PEG(机构)：机构一致预期 */}
                    <td className={`text-center text-xs font-semibold ${
                      s.pegCar && s.pegCar < 1 ? 'text-green-600'
                      : s.pegCar && s.pegCar <= 1.5 ? 'text-yellow-600'
                      : s.pegCar && s.pegCar > 1.5 ? 'text-red-600'
                      : 'text-gray-400'
                    }`} title="来自东方财富机构一致预期PEG">
                      {s.pegCar && s.pegCar > 0 ? formatNumber(s.pegCar, 2) : '-'}
                    </td>
                    {/* PEG(公式)：公式计算 = 前瞻PE / (CAGR * 100)，只有有EPS数据时才显示 */}
                    {(() => {
                      const pegE = hasEpsData(s) ? calcPEGStock(s).peg : 0;
                      return (
                        <td className={`text-center text-xs font-semibold ${
                          pegE > 0 && pegE < 1 ? 'text-green-600'
                          : pegE > 0 && pegE <= 1.5 ? 'text-yellow-600'
                          : pegE > 0 && pegE > 1.5 ? 'text-red-600'
                          : 'text-gray-400'
                        }`} title="前瞻PE / (CAGR * 100)，公式计算">
                          {pegE > 0 ? formatNumber(pegE, 2) : '-'}
                        </td>
                      );
                    })()}
                    {/* 当前PB：实时市净率 */}
                    <td className="text-center text-xs font-medium text-gray-800" title="当前实际PB（实时行情）">
                      {s.pb && s.pb > 0 ? s.pb.toFixed(2) : '-'}
                    </td>
                    {/* PB分位：当前PB在历史区间中的位置 */}
                    {(() => {
                      const pb = s.pb ?? 0;
                      const pbLow = params.pbHistLow ?? 0;
                      const pbHigh = params.pbHistHigh ?? 0;
                      if (pb <= 0 || pbLow <= 0 || pbHigh <= 0) {
                        return <td className="text-center text-gray-400 text-xs">-</td>;
                      }
                      const percentile = ((pb - pbLow) / (pbHigh - pbLow)) * 100;
                      const clampedPercentile = Math.max(0, Math.min(100, percentile));
                      let displayValue: string;
                      if (clampedPercentile < 1) displayValue = clampedPercentile.toFixed(1) + '%';
                      else if (clampedPercentile < 5) displayValue = clampedPercentile.toFixed(1) + '%';
                      else displayValue = Math.round(clampedPercentile) + '%';
                      let color = 'text-gray-600';
                      if (clampedPercentile <= 20) color = 'text-green-600 font-bold';
                      else if (clampedPercentile >= 80) color = 'text-red-600 font-bold';
                      else if (clampedPercentile <= 50) color = 'text-blue-600';
                      return (
                        <td className={`text-center text-xs ${color}`} title={`PB=${pb.toFixed(2)}, 区间[${pbLow.toFixed(2)}, ${pbHigh.toFixed(2)}], 分位=${percentile.toFixed(1)}%`}>
                          {displayValue}
                        </td>
                      );
                    })()}
                    {/* PB(10%)：历史10年低位 */}
                    <td className="text-center text-xs text-blue-600 font-medium">
                      {params.pbHistLow && params.pbHistLow > 0 ? params.pbHistLow.toFixed(2) : '-'}
                    </td>
                    {/* PB(90%)：历史10年高位 */}
                    <td className="text-center text-xs text-red-600 font-medium">
                      {params.pbHistHigh && params.pbHistHigh > 0 ? params.pbHistHigh.toFixed(2) : '-'}
                    </td>
                    {/* EPS 2026E */}
                    <td className="formula-cell text-blue-700 text-xs text-center">{s.eps2026 ? formatNumber(s.eps2026, 2) : '-'}</td>
                    {/* EPS 2027E */}
                    <td className="formula-cell text-blue-700 text-xs text-center">{s.eps2027 ? formatNumber(s.eps2027, 2) : '-'}</td>
                    {/* EPS 2028E */}
                    <td className="formula-cell text-blue-700 text-xs text-center">{s.eps2028 ? formatNumber(s.eps2028, 2) : '-'}</td>
                    {/* 市值 */}
                    <td>{s.marketCap ? formatMarketCap(s.marketCap) : '-'}</td>
                    {/* 年内涨跌幅 */}
                    <td className={getChangeColor(s.yearChange)}>
                      {s.yearChange ? formatNumber(s.yearChange) + '%' : '-'}
                    </td>
                    {/* 持仓数量 */}
                    <td className="text-center text-xs">
                      {s.positionQty && s.positionQty > 0 ? (s.positionQty / 10000).toFixed(2) + '万' : '-'}
                    </td>
                    {/* 成本价 */}
                    <td className="text-center text-xs">
                      {s.positionCost && s.positionCost > 0 ? s.positionCost.toFixed(2) : '-'}
                    </td>
                    {/* 盈亏金额 */}
                    <td className={`text-center text-xs font-medium ${
                      s.positionQty && s.positionQty > 0 && s.positionCost && s.currentPrice
                        ? (s.currentPrice - s.positionCost) >= 0 ? 'text-red-600' : 'text-green-600'
                        : 'text-gray-400'
                    }`}>
                      {s.positionQty && s.positionQty > 0 && s.positionCost && s.currentPrice
                        ? (((s.currentPrice - s.positionCost) * s.positionQty) / 10000).toFixed(2) + '万'
                        : '-'}
                    </td>
                    {/* 盈亏比例 */}
                    <td className={`text-center text-xs font-medium ${
                      s.positionCost && s.positionCost > 0 && s.currentPrice
                        ? ((s.currentPrice - s.positionCost) / s.positionCost) >= 0 ? 'text-red-600' : 'text-green-600'
                        : 'text-gray-400'
                    }`}>
                      {s.positionCost && s.positionCost > 0 && s.currentPrice
                        ? (((s.currentPrice - s.positionCost) / s.positionCost) * 100).toFixed(2) + '%'
                        : '-'}
                    </td>
                    {/* 操作 */}
                    <td>
                      <div className="flex items-center justify-center gap-2">
                        {onToggleWatched && (
                          <button
                            onClick={() => onToggleWatched(s.stockCode)}
                            className={`text-xs px-2 py-0.5 rounded transition-colors ${
                              s.watched
                                ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-pink-100 hover:text-pink-700'
                            }`}
                            title={s.watched ? '点击移除自选' : '点击加入自选'}
                          >
                            {s.watched ? '★ 已加入' : '☆ 加入自选'}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const qty = prompt(`请输入持仓数量（股）：`, String(s.positionQty || ''));
                            if (qty === null) return;
                            const cost = prompt(`请输入成本价（元）：`, String(s.positionCost || s.currentPrice || ''));
                            if (cost === null) return;
                            const qtyNum = parseFloat(qty);
                            const costNum = parseFloat(cost);
                            if (!isNaN(qtyNum) && qtyNum > 0 && !isNaN(costNum) && costNum > 0) {
                              onUpdatePosition?.(s.stockCode, {
                                positionQty: qtyNum,
                                positionCost: costNum,
                                positionDate: new Date().toISOString().slice(0, 10),
                              });
                            }
                          }}
                          className={`text-xs px-2 py-0.5 rounded transition-colors ${
                            s.positionQty && s.positionQty > 0
                              ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-indigo-100 hover:text-indigo-700'
                          }`}
                          title={s.positionQty && s.positionQty > 0 ? '点击修改持仓' : '点击添加持仓'}
                        >
                          {s.positionQty && s.positionQty > 0 ? '📈 修改持仓' : '📈 添加持仓'}
                        </button>
                        <button
                          onClick={() => setExpandedRow(isExpanded ? null : s.stockCode)}
                          className="text-xs text-blue-500 hover:text-blue-700"
                        >
                          {isExpanded ? '收起' : '参数'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* 展开行：参数编辑 */}
                  {isExpanded && (
                    <tr className="bg-blue-50 border-b border-blue-100">
                      <td colSpan={currentGroupName === '我的持仓' ? 35 : 34} className="p-0" style={{ background: '#eff6ff', whiteSpace: 'normal' }}>
                        <div style={{ position: 'sticky', left: 0, padding: '0.75rem', background: '#eff6ff', maxWidth: 'calc(100vw - 40px)', zIndex: 5, overflow: 'auto' }}>
                        <div className="flex items-start gap-4 flex-wrap">
                          {/* 鍙傛暟杈撳叆鍖?*/}
                          <div className="flex-1 min-w-[400px]">
                            <div className="text-xs text-gray-500 mb-2">
                              {getMethodLabel(params.method)} —参数设置
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                              {inputFieldsCache[params.method]?.map(field => (
                                <div key={String(field.field)} className="flex flex-col gap-0.5">
                                  <label className="text-xs text-gray-500">{field.label}</label>
                                  {field.type === 'select' ? (
                                    <select
                                      value={String(params[field.field] || '')}
                                      onChange={e => updateParams(s.stockCode, { [field.field]: e.target.value } as any)}
                                      className="text-xs border border-gray-300 rounded px-2 py-1 w-28"
                                    >
                                      {field.options?.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type="number"
                                      value={params[field.field] as number ?? ''}
                                      onChange={e => updateParams(s.stockCode, { [field.field]: Number(e.target.value) } as any)}
                                      placeholder={field.placeholder}
                                      className="text-xs border border-gray-300 rounded px-2 py-1 w-28"
                                    />
                                  )}
                                </div>
                              ))}
                              {params.method === 'peg' && (
                                <div className="text-xs text-gray-400 italic">
                                  PEG法参数请在「PEG估值」页面编辑（CAGR/EPS/景气指数）
                                </div>
                              )}
                            </div>
                          </div>
                          {/* 计算结果详情 */}
                          <div className="flex-1 min-w-[420px]">
                            <div className="text-xs font-semibold text-gray-700 mb-2">计算过程</div>
                            <div className="text-xs text-gray-500 mb-2 bg-gray-50 rounded px-2 py-1">
                              {result.detail}
                            </div>
                            <div className="space-y-1.5">
                              {result.calculationSteps.map((step, i) => {
                                const isKeyStep = step.label.includes('合理价位') || step.label.includes('理想买点');
                                return (
                                  <div
                                    key={i}
                                    className={`flex items-center justify-between rounded px-2 py-1.5 border ${
                                      isKeyStep ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100'
                                    }`}
                                  >
                                    <div className="flex flex-col gap-0.5">
                                      <span className={`text-xs font-medium ${isKeyStep ? 'text-blue-700' : 'text-gray-600'}`}>
                                        {step.label}
                                      </span>
                                      <span className="text-xs text-gray-400">{step.formula}</span>
                                      <span className="text-xs text-gray-500">{step.calc}</span>
                                    </div>
                                    <div className={`text-sm font-bold min-w-[80px] text-right ${
                                      isKeyStep ? 'text-blue-700' : 'text-gray-700'
                                    }`}>
                                      {step.result}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {/* 输入参数展示 */}
                            {result.inputParams.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-gray-200">
                                <div className="text-xs text-gray-500 mb-1.5">输入参数</div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {result.inputParams.map((p, i) => (
                                    <span key={`${p.label}-${i}`} className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                                      {p.label}: <span className="font-semibold">{p.value}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {expandedFundamentalRow === s.stockCode && (
                    <tr className="bg-amber-50">
                      <td colSpan={currentGroupName === '我的持仓' ? 35 : 34} className="p-0" style={{ background: '#fffbeb', whiteSpace: 'normal' }}>
                        <div style={{ position: 'sticky', left: 0, padding: '0.75rem', background: '#fffbeb', maxWidth: 'calc(100vw - 40px)', zIndex: 5, overflow: 'auto' }}>
                        <div className="text-xs">
                          <div className="font-semibold text-amber-900 mb-2 text-sm">📊 基本面评分详细过程（总分 {getFundamentalScore(s).total}/100）</div>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                            {getFundamentalScore(s).breakdown.map((item) => (
                              <div
                                key={item.name}
                                className="bg-white rounded p-2 border border-amber-200"
                              >
                                <div className="font-semibold text-amber-800 mb-1">{item.name}</div>
                                <div className="text-gray-600 mb-1">原始值：<span className="font-medium text-gray-800">{item.rawValue}</span></div>
                                <div className="text-gray-500">得分：<span className="font-bold text-amber-700">{item.score}/{item.max}</span></div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 text-gray-500 text-[11px]">
                            评分标准：ROE（≥20%满分/≥15%18分/≥10%12分），毛利率（≥40%满分/≥25%14分/≥15%8分），CAGR（≥20%满分/≥10%14分/≥5%8分），资产负债率（≤30%满分/≤50%10分/≤65%5分），股息率（≥3%满分/≥2%7分/≥1%4分），PEG（≤0.8满分/≤1.2 7分/≤1.5 4分）
                          </div>
                        </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {/* SWOT分析展开行 */}
                  {expandedSwotRow === s.stockCode && (
                    <tr className="bg-purple-50">
                      <td colSpan={currentGroupName === '我的持仓' ? 35 : 34} className="p-0" style={{ background: '#faf5ff', whiteSpace: 'normal' }}>
                        <div style={{ position: 'sticky', left: 0, padding: '0.75rem', background: '#faf5ff', maxWidth: 'calc(100vw - 40px)', zIndex: 5, overflow: 'auto' }}>
                        <div className="text-xs">
                          <div className="font-semibold text-purple-900 mb-3 text-sm flex items-center justify-between">
                            <span>📊 SWOT分析</span>
                            <span className="text-gray-500 font-normal text-xs">
                              {s.company}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* 优势 Strengths */}
                            <div className="bg-white rounded p-3 border border-green-200">
                              <div className="font-semibold text-green-700 mb-2 flex items-center gap-1">
                                <span className="w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-[10px] font-bold">S</span>
                                优势 (Strengths)
                              </div>
                              <div className="space-y-1 mb-2">
                                {s.swot && s.swot.strengths && s.swot.strengths.length > 0 ? s.swot.strengths.map((item, i) => (
                                  <div key={i} className="flex items-start gap-1 text-gray-700">
                                    <span className="text-green-500 mt-0.5">•</span>
                                    <span className="flex-1">{item}</span>
                                  </div>
                                )) : (
                                  <div className="text-gray-400 italic">暂无优势分析</div>
                                )}
                              </div>
                            </div>
                            {/* 劣势 Weaknesses */}
                            <div className="bg-white rounded p-3 border border-red-200">
                              <div className="font-semibold text-red-700 mb-2 flex items-center gap-1">
                                <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-[10px] font-bold">W</span>
                                劣势 (Weaknesses)
                              </div>
                              <div className="space-y-1 mb-2">
                                {s.swot && s.swot.weaknesses && s.swot.weaknesses.length > 0 ? s.swot.weaknesses.map((item, i) => {
                                  const text = typeof item === 'string' ? item : item.text;
                                  const prob = typeof item === 'string' ? null : item.probability;
                                  return (
                                    <div key={i} className="flex items-start gap-1 text-gray-700">
                                      <span className="text-red-500 mt-0.5">•</span>
                                      <span className="flex-1">{text}</span>
                                      {prob && (
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap ${
                                          prob === '高' ? 'bg-red-500 text-white' :
                                          prob === '中' ? 'bg-amber-400 text-white' :
                                          'bg-green-400 text-white'
                                        }`} title={`发生概率：${prob}`}>{prob}</span>
                                      )}
                                    </div>
                                  );
                                }) : (
                                  <div className="text-gray-400 italic">暂无劣势分析</div>
                                )}
                              </div>
                            </div>
                            {/* 机会 Opportunities */}
                            <div className="bg-white rounded p-3 border border-blue-200">
                              <div className="font-semibold text-blue-700 mb-2 flex items-center gap-1">
                                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">O</span>
                                机会 (Opportunities)
                              </div>
                              <div className="space-y-1 mb-2">
                                {s.swot && s.swot.opportunities && s.swot.opportunities.length > 0 ? s.swot.opportunities.map((item, i) => (
                                  <div key={i} className="flex items-start gap-1 text-gray-700">
                                    <span className="text-blue-500 mt-0.5">•</span>
                                    <span className="flex-1">{item}</span>
                                  </div>
                                )) : (
                                  <div className="text-gray-400 italic">暂无机会分析</div>
                                )}
                              </div>
                            </div>
                            {/* 威胁 Threats */}
                            <div className="bg-white rounded p-3 border border-orange-200">
                              <div className="font-semibold text-orange-700 mb-2 flex items-center gap-1">
                                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[10px] font-bold">T</span>
                                威胁 (Threats)
                              </div>
                              <div className="space-y-1 mb-2">
                                {s.swot && s.swot.threats && s.swot.threats.length > 0 ? s.swot.threats.map((item, i) => {
                                  const text = typeof item === 'string' ? item : item.text;
                                  const prob = typeof item === 'string' ? null : item.probability;
                                  return (
                                    <div key={i} className="flex items-start gap-1 text-gray-700">
                                      <span className="text-orange-500 mt-0.5">•</span>
                                      <span className="flex-1">{text}</span>
                                      {prob && (
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap ${
                                          prob === '高' ? 'bg-red-500 text-white' :
                                          prob === '中' ? 'bg-amber-400 text-white' :
                                          'bg-green-400 text-white'
                                        }`} title={`发生概率：${prob}`}>{prob}</span>
                                      )}
                                    </div>
                                  );
                                }) : (
                                  <div className="text-gray-400 italic">暂无威胁分析</div>
                                )}
                              </div>
                            </div>
                          </div>
                          {/* 编辑提示 */}
                          <div className="mt-3 text-gray-500 text-[11px] bg-purple-100/50 rounded px-2 py-1.5 flex items-center justify-between">
                            <span>💡 点击 SWOT 列「🔍分析」可请求 AI 单独分析</span>
                            <span className="flex items-center gap-2">
                              <span className="flex items-center gap-0.5">
                                <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-semibold">高</span>
                                <span>&gt;60%</span>
                              </span>
                              <span className="flex items-center gap-0.5">
                                <span className="bg-amber-400 text-white text-[9px] px-1.5 py-0.5 rounded-full font-semibold">中</span>
                                <span>30-60%</span>
                              </span>
                              <span className="flex items-center gap-0.5">
                                <span className="bg-green-400 text-white text-[9px] px-1.5 py-0.5 rounded-full font-semibold">低</span>
                                <span>&lt;30%</span>
                              </span>
                            </span>
                          </div>
                        </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {expandedHolderRow === `mval-${s.stockCode}` && (
                    <HolderDetailRow stock={s} colSpan={28} />
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 分页（与 PEG 页面保持一致） */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-500">
            共<strong>{sorted.length}</strong> 只
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage <= 1}
              className="px-2 py-1 text-xs rounded border hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              首页
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-2 py-1 text-xs rounded border hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                  page === currentPage
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'hover:bg-gray-100'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-2 py-1 text-xs rounded border hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              下一页
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage >= totalPages}
              className="px-2 py-1 text-xs rounded border hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              末页
            </button>
            <span className="text-xs text-gray-500 ml-2">
              第{(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, sorted.length)} / {sorted.length}
            </span>
          </div>
        </div>
      )}

          {/* 行业安全系数柱状图 */}
          <MultiValuationChart data={filtered} />

      {/* 方法说明 */}
      <div className="mt-3 p-3 bg-gray-50 rounded text-xs text-gray-600">
        <div className="font-semibold mb-1">估值方法说明</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {VALUATION_METHODS.map(m => (
            <div key={m.method} className="flex items-start gap-2">
              <span className={`px-1.5 py-0 rounded ${getMethodTagClass(m.method)} whitespace-nowrap`}>{m.shortLabel}</span>
              <span>
                <span className="font-medium">{m.label}</span>：{m.description}
                <span className="text-gray-400">（{m.suitableFor}）</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}