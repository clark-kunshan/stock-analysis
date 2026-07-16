import React, { Fragment, useState, useRef, useEffect } from 'react';
import type { PEGStock, HolderDetail } from '../types/peg.ts';
import type { PEGGroup } from '../hooks/usePEGStocks.ts';
import { calcPEGStock, hasEpsData, getDisplayCAGR, formatNumber, formatMarketCap, getChangeColor, getStockBoard, getEntrySignal, getFundamentalScore, getFundamentalClass, getActionSignal, getMainTrendSignal } from '../utils/formulas.ts';
import { getEpsReliabilityScore, isPEGSuitable, getMethodShortName, detectValuationMethod } from '../utils/industryValuation.ts';
import { EditableCell } from './EditableCell.tsx';

const PAGE_SIZE = 50;

type SortColumn = 'none' | 'safety' | 'cagr' | 'fundamental';
type SortDir = 'asc' | 'desc';

interface PEGTableProps {
  stocks: PEGStock[];
  groups: PEGGroup[];
  activeGroupIdx: number;
  onGroupChange: (idx: number) => void;
  onUpdate: (id: string, field: keyof PEGStock, value: any) => void;
  onToggleWatched: (stockId: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  // 搜索高亮行
  highlightStock?: { stock: PEGStock; groupName: string } | null;
  onClearHighlight?: () => void;
  onToggleHighlightWatched?: (stockCode: string) => void;
  // 行业搜索模式：跨分组展示匹配行业的所有股票
  industrySearchResults?: Array<{ stock: PEGStock; groupName: string }> | null;
  industryKeyword?: string;
  onClearIndustrySearch?: () => void;
  onToggleIndustryWatched?: (stockCode: string) => void;
}

/** 安全系数底色：绿(<70%) / 黄(70-100%) / 红(>=100%) */
function getSafetyBg(factor: number): string {
  if (factor >= 1) return 'bg-red-100';
  if (factor >= 0.7) return 'bg-yellow-100';
  return 'bg-green-100';
}

/** 根据安全系数返回投资建议 */
function getAdvice(factor: number): { text: string; className: string } {
  if (factor > 1) return { text: '重点关注', className: 'text-green-800 font-bold' };
  if (factor >= 0.75) return { text: '分批建仓', className: 'text-green-600 font-semibold' };
  if (factor >= 0.5) return { text: '持续跟踪', className: 'text-blue-600 font-medium' };
  if (factor >= 0.25) return { text: '短期忽略', className: 'text-yellow-600 font-medium' };
  return { text: '高估陷阱', className: 'text-red-600 font-bold' };
}

/** 根据可信度评分返回样式（5=绿，1=红） */
function getReliabilityClass(score: number): string {
  if (score >= 5) return 'bg-green-100 text-green-700';
  if (score >= 4) return 'bg-blue-50 text-blue-700';
  if (score >= 3) return 'bg-yellow-50 text-yellow-700';
  if (score >= 2) return 'bg-orange-50 text-orange-700';
  return 'bg-red-100 text-red-700';
}

/** 根据可信度评分返回文字说明 */
function getReliabilityText(score: number): string {
  const map: Record<number, string> = { 5: '高', 4: '较高', 3: '中', 2: '较低', 1: '低' };
  return map[score] || '中';
}

/** PEG适用性标签 */
function MethodTag({ industry }: { industry: string }) {
  const suitable = isPEGSuitable(industry);
  const method = detectValuationMethod(industry);
  const shortName = getMethodShortName(method);
  if (suitable) {
    return (
      <span className="inline-flex items-center gap-0.5 ml-1 px-1 py-0.5 text-[10px] leading-none rounded bg-green-50 text-green-700 border border-green-200" title="该行业适合PEG估值法">
        <span className="text-green-500">✓</span>PEG
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 ml-1 px-1 py-0.5 text-[10px] leading-none rounded bg-gray-100 text-gray-500 border border-gray-200" title={`推荐用${shortName}法估值`}>
      {shortName}
    </span>
  );
}

/** 基本面评分单元格 + 点击展开详情 */
function FundamentalCell({ stock, rowKey, expandedRow, onToggle }: {
  stock: PEGStock;
  rowKey: string;
  expandedRow: string | null;
  onToggle: (key: string) => void;
}) {
  const score = getFundamentalScore(stock);
  const isExpanded = expandedRow === rowKey;
  return (
    <td
      className="cursor-pointer hover:bg-gray-100 transition-colors"
      title="点击查看详细打分过程"
      onClick={() => onToggle(rowKey)}
    >
      <div className="flex flex-col items-center gap-0.5">
        <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${getFundamentalClass(score.total)}`}>
          {score.total > 0 ? score.total + '分' : '-'}
        </span>
        {score.total > 0 && (
          <span className="text-[10px] text-gray-400 leading-none">{isExpanded ? '▲ 收起' : '▼ 展开'}</span>
        )}
      </div>
    </td>
  );
}

/** 基本面评分的详细展开行：展示每一项指标的打分过程 */
function FundamentalDetailRow({ stock, colSpan }: { stock: PEGStock; colSpan: number }) {
  const score = getFundamentalScore(stock);
  return (
    <tr className="bg-amber-50">
      <td colSpan={colSpan} className="p-3">
        <div className="text-xs">
          <div className="font-semibold text-amber-900 mb-2 text-sm">📊 基本面评分详细过程（总分 {score.total}/100）</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {score.breakdown.map((item) => (
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
      </td>
    </tr>
  );
}

/** 基本面评分表头单元格（用于行业搜索表格，不支持排序） */
function FundamentalCellSimple({ stock }: { stock: PEGStock }) {
  const score = getFundamentalScore(stock);
  return (
    <td title={score.details}>
      <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${getFundamentalClass(score.total)}`}>
        {score.total > 0 ? score.total + '分' : '-'}
      </span>
    </td>
  );
}

/** 可信度单元格 */
function ReliabilityCell({ stock }: { stock: PEGStock }) {
  const score = getEpsReliabilityScore(stock);
  return (
    <td className={`text-center text-xs font-semibold ${getReliabilityClass(score)}`}>
      {score}
      <span className="ml-0.5 opacity-75">{getReliabilityText(score)}</span>
    </td>
  );
}

/** 持仓变动状态颜色：加仓/新进=红，减仓=绿，不变=灰 */
function getHolderChangeClass(change: string | undefined): string {
  if (!change) return 'text-gray-400';
  if (change === '加仓' || change === '新进') return 'text-red-600 font-semibold';
  if (change === '减仓') return 'text-green-600 font-semibold';
  return 'text-gray-500';
}

/** 持仓类型标签颜色 */
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
    case '瑞银': return 'bg-sky-100 text-sky-700 border-sky-200';
    case '高盛': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case '摩根士丹利': return 'bg-violet-100 text-violet-700 border-violet-200';
    case '摩根大通': return 'bg-purple-100 text-purple-700 border-purple-200';
    case '阿布达比': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case '巴克莱': return 'bg-lime-100 text-lime-700 border-lime-200';
    case '法国巴黎银行': return 'bg-stone-100 text-stone-700 border-stone-200';
    case '淡马锡': return 'bg-rose-100 text-rose-700 border-rose-200';
    case '德意志银行': return 'bg-gray-100 text-gray-700 border-gray-200';
    case '富达': return 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200';
    case '比尔盖茨': return 'bg-green-100 text-green-700 border-green-200';
    case 'QFII': return 'bg-blue-50 text-blue-600 border-blue-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

/** 持仓归类：国家队/外资/游资/其他 */
const NATIONAL_TEAM_TYPES = new Set(['社保', '汇金', '证金', '大基金', '国调', '外管局', '养老金']);
const HOT_MONEY_TYPES = new Set(['游资']);
function getHolderCategory(type: string): { label: string; cls: string } {
  if (NATIONAL_TEAM_TYPES.has(type)) return { label: '国家队', cls: 'bg-red-100 text-red-700 border-red-200' };
  if (HOT_MONEY_TYPES.has(type)) return { label: '游资', cls: 'bg-purple-100 text-purple-700 border-purple-200' };
  if (type === '北向资金' || type === 'QFII' || !NATIONAL_TEAM_TYPES.has(type)) {
    // QFII子类型和阿布达比/瑞银/高盛等都是外资
    if (type === '北向资金' || type === 'QFII' || type === '阿布达比' || type === '瑞银' || type === '高盛' ||
        type === '摩根士丹利' || type === '摩根大通' || type === '巴克莱' || type === '法国巴黎银行' ||
        type === '淡马锡' || type === '德意志银行' || type === '富达' || type === '比尔盖茨' ||
        type === '马来西亚银行' || type === '三井住友' || type === '三星资产') {
      return { label: '外资', cls: 'bg-orange-100 text-orange-700 border-orange-200' };
    }
  }
  return { label: '其他', cls: 'bg-gray-100 text-gray-600 border-gray-200' };
}

/** 格式化持股数为万股 */
function formatShares(shares: number): string {
  if (!shares || shares === 0) return '—';
  const wan = shares / 10000;
  if (wan >= 10000) return (wan / 10000).toFixed(1) + '亿股';
  if (wan >= 100) return wan.toFixed(0) + '万股';
  return wan.toFixed(1) + '万股';
}

/** 格式化变动数 */
function formatChangeNum(changeNum: number): string {
  if (!changeNum || changeNum === 0) return '—';
  const wan = changeNum / 10000;
  const sign = changeNum > 0 ? '+' : '';
  if (Math.abs(wan) >= 10000) return sign + (wan / 10000).toFixed(1) + '亿股';
  if (Math.abs(wan) >= 100) return sign + wan.toFixed(0) + '万股';
  return sign + wan.toFixed(1) + '万股';
}

/** 国家队持仓单元格（显示汇总占比，可点击展开明细） */
function NationalTeamCell({ stock, rowKey, expandedRow, onToggle }: {
  stock: PEGStock;
  rowKey: string;
  expandedRow: string | null;
  onToggle: (key: string) => void;
}) {
  if (stock.nationalTeamRatio === undefined || stock.nationalTeamRatio === 0) {
    return <td className="text-center text-gray-300 text-xs">—</td>;
  }
  const isExpanded = expandedRow === rowKey;
  const hasDetails = stock.holderDetails && stock.holderDetails.length > 0;
  return (
    <td
      className={`text-center text-xs whitespace-nowrap ${hasDetails ? 'cursor-pointer hover:bg-blue-50 transition-colors' : ''}`}
      title={hasDetails ? '点击查看持仓明细' : '国家队持仓（社保/汇金/证金/大基金/养老金，汇总占比）'}
      onClick={hasDetails ? () => onToggle(rowKey) : undefined}
    >
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-blue-600">{typeof stock.nationalTeamRatio === 'number' ? stock.nationalTeamRatio.toFixed(2) : stock.nationalTeamRatio}%</span>
        <span className={getHolderChangeClass(stock.nationalTeamChange)}>
          {stock.nationalTeamChange || '—'}
          {stock.nationalTeamCount && stock.nationalTeamCount > 1 && (
            <span className="text-gray-400 ml-0.5" title={`共${stock.nationalTeamCount}家机构持仓`}>+{stock.nationalTeamCount - 1}</span>
          )}
        </span>
        {hasDetails && (
          <span className="text-[10px] text-blue-400 leading-none">{isExpanded ? '▲ 收起' : '▼ 明细'}</span>
        )}
      </div>
    </td>
  );
}

/** 外资持仓单元格（显示汇总占比，可点击展开明细，含北向资金+QFII） */
function ForeignCell({ stock, rowKey, expandedRow, onToggle }: {
  stock: PEGStock;
  rowKey: string;
  expandedRow: string | null;
  onToggle: (key: string) => void;
}) {
  if (stock.foreignRatio === undefined || stock.foreignRatio === 0) {
    return <td className="text-center text-gray-300 text-xs">—</td>;
  }
  const isExpanded = expandedRow === rowKey;
  const hasDetails = stock.holderDetails && stock.holderDetails.length > 0;
  const hasQFII = stock.qfiiRatio !== undefined && stock.qfiiRatio > 0;
  return (
    <td
      className={`text-center text-xs whitespace-nowrap ${hasDetails ? 'cursor-pointer hover:bg-blue-50 transition-colors' : ''}`}
      title={hasDetails ? '点击查看持仓明细' : '外资持仓（北向资金+QFII，汇总占比）'}
      onClick={hasDetails ? () => onToggle(rowKey) : undefined}
    >
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-blue-600">{typeof stock.foreignRatio === 'number' ? stock.foreignRatio.toFixed(2) : stock.foreignRatio}%</span>
        <span className={getHolderChangeClass(stock.foreignChange)}>
          {stock.foreignChange || '—'}
          {stock.foreignCount && stock.foreignCount > 1 && (
            <span className="text-gray-400 ml-0.5" title={`共${stock.foreignCount}家外资持仓`}>+{stock.foreignCount - 1}</span>
          )}
        </span>
        {hasQFII && (
          <span className="text-[10px] text-sky-500 leading-none" title={`QFII: ${stock.qfiiName} ${typeof stock.qfiiRatio === 'number' ? stock.qfiiRatio.toFixed(2) : stock.qfiiRatio}%`}>
            {stock.qfiiName} {typeof stock.qfiiRatio === 'number' ? stock.qfiiRatio.toFixed(2) : stock.qfiiRatio}%
          </span>
        )}
        {hasDetails && (
          <span className="text-[10px] text-blue-400 leading-none">{isExpanded ? '▲ 收起' : '▼ 明细'}</span>
        )}
      </div>
    </td>
  );
}

/** 游资持仓单元格（可点击展开明细，含著名游资大佬/知名私募） */
function HotMoneyCell({ stock, rowKey, expandedRow, onToggle }: {
  stock: PEGStock;
  rowKey: string;
  expandedRow: string | null;
  onToggle: (key: string) => void;
}) {
  if (!stock.hotMoneyName && stock.hotMoneyRatio === undefined) {
    return <td className="text-center text-gray-300 text-xs">—</td>;
  }
  const isExpanded = expandedRow === rowKey;
  const hasDetails = stock.holderDetails && stock.holderDetails.length > 0;
  return (
    <td
      className={`text-center text-xs whitespace-nowrap ${hasDetails ? 'cursor-pointer hover:bg-blue-50 transition-colors' : ''}`}
      title={hasDetails ? '点击查看持仓明细' : '游资持仓（章建平/葛卫东/知名私募等）'}
      onClick={hasDetails ? () => onToggle(rowKey) : undefined}
    >
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-purple-600">{stock.hotMoneyRatio}%</span>
        <span className={getHolderChangeClass(stock.hotMoneyChange)}>
          {stock.hotMoneyChange || '—'}
          {stock.hotMoneyCount && stock.hotMoneyCount > 1 && (
            <span className="text-gray-400 ml-0.5" title={`共${stock.hotMoneyCount}家游资持仓`}>+{stock.hotMoneyCount - 1}</span>
          )}
        </span>
        {hasDetails && (
          <span className="text-[10px] text-purple-400 leading-none">{isExpanded ? '▲ 收起' : '▼ 明细'}</span>
        )}
      </div>
    </td>
  );
}

/** 持仓明细展开行：展示全部国家队+北向资金的逐条明细 */
function HolderDetailRow({ stock, colSpan }: { stock: PEGStock; colSpan: number }) {
  const details = stock.holderDetails;
  if (!details || details.length === 0) return null;
  const reportDate = details[0]?.reportDate || '';
  return (
    <tr className="bg-blue-50">
      <td colSpan={colSpan} className="p-3">
        <div className="text-xs">
          <div className="font-semibold text-blue-900 mb-2 text-sm flex items-center gap-2">
            <span>🏦 持仓明细</span>
            {reportDate && <span className="text-gray-500 font-normal text-xs">报告期：{reportDate}</span>}
            <span className="text-gray-400 font-normal text-xs">共 {details.length} 家机构持仓</span>
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
      </td>
    </tr>
  );
}

export function PEGTable({ stocks, groups, activeGroupIdx, onGroupChange, onUpdate, onToggleWatched, onAdd, onRemove, highlightStock, onClearHighlight, onToggleHighlightWatched, industrySearchResults, industryKeyword, onClearIndustrySearch, onToggleIndustryWatched }: PEGTableProps) {
  const isWatchedGroup = groups[activeGroupIdx]?.name === '自选';
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<SortColumn>('none');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [industryFilter, setIndustryFilter] = useState<Set<string>>(new Set());
  const [showIndustryDropdown, setShowIndustryDropdown] = useState(false);
  const [industrySearch, setIndustrySearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const industryDropdownRef = useRef<HTMLDivElement>(null);
  const industryBtnRef = useRef<HTMLButtonElement>(null);
  const searchTableRef = useRef<HTMLDivElement>(null);
  const searchTopBarRef = useRef<HTMLDivElement>(null);
  const mainTableRef = useRef<HTMLDivElement>(null);
  const mainTopBarRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);

  // 同步顶部滚动条和主容器的横向滚动
  const syncScroll = (src: HTMLDivElement | null, dst: HTMLDivElement | null) => {
    if (src && dst && dst.scrollLeft !== src.scrollLeft) {
      dst.scrollLeft = src.scrollLeft;
    }
  };

  // Shift+滚轮横向滚动
  const enableWheelScroll = (container: HTMLDivElement | null) => {
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
  const [expandedFundamentalRow, setExpandedFundamentalRow] = useState<string | null>(null);
  const [expandedHolderRow, setExpandedHolderRow] = useState<string | null>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inDropdown = industryDropdownRef.current && industryDropdownRef.current.contains(target);
      const inBtn = industryBtnRef.current && industryBtnRef.current.contains(target);
      if (!inDropdown && !inBtn) {
        setShowIndustryDropdown(false);
      }
    };
    const scrollHandler = () => setShowIndustryDropdown(false);
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', scrollHandler, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', scrollHandler, true);
    };
  }, []);

  // 顶部滚动条同步 + 滚轮横向滚动
  useEffect(() => {
    const cleanup1 = enableWheelScroll(searchTableRef.current);
    const cleanup2 = enableWheelScroll(searchTopBarRef.current);
    const cleanup3 = enableWheelScroll(mainTableRef.current);
    const cleanup4 = enableWheelScroll(mainTopBarRef.current);
    return () => { cleanup1?.(); cleanup2?.(); cleanup3?.(); cleanup4?.(); };
  }, [industrySearchResults, activeGroupIdx]);

  // 检测表格实际宽度，用于同步顶部滚动条的占位
  useEffect(() => {
    const timer = setTimeout(() => {
      const table = (searchTableRef.current?.querySelector('table')
        || mainTableRef.current?.querySelector('table')) as HTMLTableElement | null;
      if (table) setTableWidth(table.offsetWidth);
    }, 100);
    return () => clearTimeout(timer);
  }, [industrySearchResults, activeGroupIdx, currentPage]);

  // 切换分组时重置行业筛选
  const allIndustries = Array.from(new Set(stocks.map(s => s.highlight || '').filter(Boolean))).sort();

  const toggleFundamental = (key: string) => {
    setExpandedFundamentalRow(prev => prev === key ? null : key);
  };

  const toggleHolder = (key: string) => {
    setExpandedHolderRow(prev => prev === key ? null : key);
  };

  // 行业筛选逻辑
  const filteredByIndustry = industryFilter.size === 0
    ? stocks
    : stocks.filter(s => industryFilter.has(s.highlight || ''));

  // 排序逻辑
  const sortedStocks = sortColumn === 'none' ? filteredByIndustry : [...filteredByIndustry].sort((a, b) => {
    let va: number, vb: number;
    if (sortColumn === 'safety') {
      // 无 EPS 数据的股票不参与安全系数排序，始终放在最后
      const aHasEps = hasEpsData(a);
      const bHasEps = hasEpsData(b);
      if (!aHasEps && !bHasEps) return 0;
      if (!aHasEps) return 1;
      if (!bHasEps) return -1;
      va = a.currentPrice ? calcPEGStock(a).safetyFactor : -1;
      vb = b.currentPrice ? calcPEGStock(b).safetyFactor : -1;
    } else if (sortColumn === 'fundamental') {
      va = getFundamentalScore(a).total;
      vb = getFundamentalScore(b).total;
    } else {
      // CAGR
      va = a.cagr ?? 0;
      vb = b.cagr ?? 0;
    }
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  const totalPages = Math.max(1, Math.ceil(sortedStocks.length / PAGE_SIZE));
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pageStocks = sortedStocks.slice(startIdx, startIdx + PAGE_SIZE);

  const toggleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      // 同一列：asc → desc → none
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortColumn('none'); setSortDir('asc'); }
    } else {
      setSortColumn(col);
      setSortDir('asc');
    }
    setCurrentPage(1);
  };

  const arrow = (col: SortColumn) =>
    sortColumn === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  // 当股票数量变化时，确保当前页有效
  const safeCurrentPage = Math.min(currentPage, totalPages);
  if (safeCurrentPage !== currentPage) {
    setTimeout(() => setCurrentPage(safeCurrentPage), 0);
  }

  

  const switchGroup = (idx: number) => {
    onGroupChange(idx);
    setCurrentPage(1);
    setSortColumn('none');
    setSortDir('asc');
    setIndustryFilter(new Set());
    setShowIndustryDropdown(false);
    setIndustrySearch('');
  };

  return (
    <>
      {/* 指数分组子标签 */}
      {groups.length > 1 && (
        <div className="flex items-center gap-1 px-4 pt-2 bg-slate-50 border-b">
          {groups.map((g, i) => (
            <button
              key={g.name}
              onClick={() => switchGroup(i)}
              className={`px-4 py-1.5 text-xs font-medium rounded-t transition-colors ${
                i === activeGroupIdx
                  ? 'bg-white text-blue-600 border border-b-white -mb-px shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {g.name}
              <span className="ml-1 text-gray-400">({g.stocks.length})</span>
            </button>
          ))}
        </div>
      )}

      {/* 行业搜索激活时：展示跨分组匹配结果 */}
      {industrySearchResults ? (
        <>
          {/* 顶部同步滚动条 */}
          <div className="px-4 pt-2">
            <div ref={searchTopBarRef} className="scrollbar-top" onScroll={(e) => syncScroll(e.currentTarget, searchTableRef.current)}>
              <div className="scrollbar-top-inner" style={{ width: tableWidth }} />
            </div>
            <span className="scroll-hint">⇆ Shift + 鼠标滚轮 横向滚动</span>
          </div>
          <div ref={searchTableRef} className="table-container" onScroll={(e) => syncScroll(e.currentTarget, searchTopBarRef.current)}>
          {/* 搜索结果头部信息条 */}
          <div className="px-4 py-2 bg-blue-50 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-700 font-medium">
                行业搜索：「{industryKeyword}」
              </span>
              <span className="text-xs text-blue-500 bg-white border border-blue-200 px-2 py-0.5 rounded-full">
                共 {industrySearchResults.length} 只股票
              </span>
            </div>
            <button
              onClick={onClearIndustrySearch}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"
              title="清除搜索"
            >
              × 退出行业搜索
            </button>
          </div>
          <table className="stock-table">
            <thead>
              <tr>
                <th>分组</th>
                <th>序号</th>
                <th>安全系数</th>
                <th>建议</th>
                <th>反弹信号</th>
                <th>操作建议</th>
                <th title="判断是否处于主升浪起点：均线多头刚形成+放量突破盘整+量能持续">主升浪</th>
                <th title="基本面评分（满分100）">基本面</th>
                <th title="国家队持仓（社保/汇金/证金/大基金等）">国家队</th>
                <th title="北向资金持仓（香港中央结算）">外资</th>
                <th title="游资持仓（章建平/葛卫东/知名私募等）">游资</th>
                <th>公司</th>
                <th>板块</th>
                <th>行业</th>
                <th>景气指数<br/><span className="text-xs font-normal opacity-75">(0-200)</span></th>
                <th>当前<br/>股价</th>
                <th>合理<br/>价位</th>
                <th>理想<br/>买点</th>
                <th>减仓<br/>价位</th>
                <th>1年内<br/>卖点</th>
                <th>当前市値<br/>(亿)</th>
                <th>3年后理想<br/>估値(亿)</th>
                <th>年内<br/>涨幅%</th>
                <th>机构预期<br/><span className="text-xs font-normal opacity-75">PEG</span></th>
                <th>更新<br/>日期</th>
                <th>CAGR<br/>(中)</th>
                <th title="1-5分：5分最可信，1分最不可信">预测<br/>可信度</th>
                <th className="text-blue-700">2026E<br/><span className="text-xs font-normal opacity-75">EPS</span></th>
                <th className="text-blue-700">2027E<br/><span className="text-xs font-normal opacity-75">EPS</span></th>
                <th className="text-blue-700">2028E<br/><span className="text-xs font-normal opacity-75">EPS</span></th>
                <th>前瞻PE<br/><span className="text-xs font-normal opacity-75">(中)</span></th>
                <th>PEG<br/>(中)</th>
                <th>自选</th>
              </tr>
            </thead>
            <tbody>
              {industrySearchResults.length === 0 ? (
                <tr><td colSpan={31} className="text-center py-8 text-gray-400">未找到行业「{industryKeyword}」的相关股票</td></tr>
              ) : (
                industrySearchResults.map(({ stock: s, groupName }, idx) => {
                  const c = calcPEGStock(s);
                  const sColor =
                    groupName === '沪深300' ? 'bg-orange-500'
                    : groupName === '中证500' ? 'bg-amber-500'
                    : 'bg-rose-500';
                  const sHasEps = hasEpsData(s);
                  return (
                    <Fragment key={`${groupName}-${s.id}`}>
                    <tr className={s.watched ? 'bg-purple-50' : ''} style={s.watched ? { boxShadow: 'inset 0 0 0 2px #a855f7' } : {}}>
                      {/* 分组色标 */}
                      <td className="text-center">
                        <span className={`text-xs px-1.5 py-0.5 rounded text-white ${sColor}`}>{groupName}</span>
                      </td>
                      {/* 序号 */}
                      <td className="text-gray-500 text-xs">{idx + 1}</td>
                      {/* 安全系数 */}
                      <td className={`formula-cell font-semibold ${s.currentPrice && sHasEps ? getSafetyBg(c.safetyFactor) : ''} ${
                        c.safetyFactor >= 1 ? 'text-red-700' : c.safetyFactor >= 0.7 ? 'text-yellow-700' : 'text-green-700'
                      }`}>{s.currentPrice && sHasEps ? (c.safetyFactor * 100).toFixed(1) + '%' : '-'}</td>
                      {/* 建议 */}
                      <td className={`text-xs whitespace-nowrap ${s.currentPrice && sHasEps ? getAdvice(c.safetyFactor).className : ''}`}>
                        {s.currentPrice && sHasEps ? getAdvice(c.safetyFactor).text : '-'}
                      </td>
                      {/* 反弹信号 */}
                      <td>
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${getEntrySignal(s).className}`}>
                          {getEntrySignal(s).text}
                        </span>
                      </td>
                      {/* 操作建议 */}
                      <td className="text-center whitespace-nowrap">
                        {(() => {
                          const sig = getActionSignal(s, c.safetyFactor);
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
                      {/* 基本面评分 */}
                      <FundamentalCell
                        stock={s}
                        rowKey={`industry-${groupName}-${s.id}`}
                        expandedRow={expandedFundamentalRow}
                        onToggle={toggleFundamental}
                      />
                      {/* 国家队持仓 */}
                      <NationalTeamCell stock={s} rowKey={`industry-${groupName}-${s.id}`} expandedRow={expandedHolderRow} onToggle={toggleHolder} />
                      {/* 外资持仓 */}
                      <ForeignCell stock={s} rowKey={`industry-${groupName}-${s.id}`} expandedRow={expandedHolderRow} onToggle={toggleHolder} />
                      {/* 游资持仓 */}
                      <HotMoneyCell stock={s} rowKey={`industry-${groupName}-${s.id}`} expandedRow={expandedHolderRow} onToggle={toggleHolder} />
                      {/* 公司 */}
                      <td className="text-left font-medium text-xs">{s.company}</td>
                      {/* 板块 */}
                      <td className="text-xs">{getStockBoard(s.stockCode)}</td>
                {/* 行业 */}
                <td className="text-xs">{s.highlight || '-'}<MethodTag industry={s.highlight || ''} /></td>
                      {/* 景气指数 */}
                      <td className="text-center text-xs">{s.prosperityIndex}</td>
                      {/* 当前股价 */}
                      <td className={s.yearChange >= 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                        {s.currentPrice ? formatNumber(s.currentPrice) : '-'}
                      </td>
                      {/* 公式列 */}
                      <td className="formula-cell">{s.currentPrice ? formatNumber(c.fairValue) : '-'}</td>
                      <td className="formula-cell text-blue-700">{s.currentPrice ? formatNumber(c.idealBuyPoint) : '-'}</td>
                      <td className="formula-cell">{s.currentPrice ? formatNumber(c.reducePosition) : '-'}</td>
                      <td className="formula-cell text-red-600">{s.currentPrice ? formatNumber(c.oneYearSellPoint) : '-'}</td>
                      <td>{s.marketCap ? formatNumber(s.marketCap, 0) : '-'}</td>
                      <td className="formula-cell">{s.marketCap ? formatNumber(c.threeYearValuation, 0) : '-'}</td>
                      <td className={getChangeColor(s.yearChange)}>{s.yearChange ? formatNumber(s.yearChange) + '%' : '-'}</td>
                      <td className={`formula-cell text-xs font-semibold ${
                        s.pegCar && s.pegCar < 1 ? 'text-green-600'
                        : s.pegCar && s.pegCar <= 1.5 ? 'text-yellow-600'
                        : s.pegCar && s.pegCar > 1.5 ? 'text-red-600'
                        : 'text-gray-400'
                      }`}>{s.pegCar && s.pegCar > 0 ? formatNumber(s.pegCar, 4) : '-'}</td>
                      <td className="text-xs text-gray-500">{s.updateDate || '-'}</td>
                      <td className="text-center text-xs">{getDisplayCAGR(s) ? formatNumber(getDisplayCAGR(s), 4) : '-'}</td>
                      <ReliabilityCell stock={s} />
                      <td className="formula-cell text-blue-700 text-xs">{s.eps2026 ? formatNumber(s.eps2026, 2) : '-'}</td>
                      <td className="formula-cell text-blue-700 text-xs">{s.eps2027 ? formatNumber(s.eps2027, 2) : '-'}</td>
                      <td className="formula-cell text-blue-700 text-xs">{s.eps2028 ? formatNumber(s.eps2028, 2) : '-'}</td>
                      <td className="text-center text-xs">{hasEpsData(s) ? (s.pe || '-') : '-'}</td>
                      <td className={`formula-cell font-semibold ${
                        hasEpsData(s) && c.peg < 1 ? 'text-green-600'
                        : hasEpsData(s) && c.peg <= 1.5 ? 'text-yellow-600'
                        : hasEpsData(s) && c.peg > 1.5 ? 'text-red-600'
                        : 'text-gray-400'
                      }`}>{hasEpsData(s) && c.peg ? formatNumber(c.peg, 4) : '-'}</td>
                      {/* 自选按钮 */}
                      <td className="text-center">
                        <button
                          onClick={() => onToggleIndustryWatched?.(s.stockCode)}
                          className={`text-lg leading-none transition-colors ${
                            s.watched ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-300 hover:text-yellow-400'
                          }`}
                          title={s.watched ? '取消自选' : '加入自选'}
                        >★</button>
                      </td>
                    </tr>
                      {expandedFundamentalRow === `industry-${groupName}-${s.id}` && (
                        <FundamentalDetailRow stock={s} colSpan={31} />
                      )}
                      {expandedHolderRow === `industry-${groupName}-${s.id}` && (
                        <HolderDetailRow stock={s} colSpan={31} />
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
          {/* 行业搜索模式下的底部信息栏 */}
          <div className="p-3 border-t bg-gray-50">
            <span className="text-xs text-gray-500">
              行业搜索结果：共 <strong>{industrySearchResults.length}</strong> 只股票匹配「{industryKeyword}」 | 点击“退出行业搜索”返回分组视图
            </span>
          </div>
        </div>
        </>
      ) : (
        <>
          {/* 顶部同步滚动条 */}
          <div className="px-4 pt-2">
            <div ref={mainTopBarRef} className="scrollbar-top" onScroll={(e) => syncScroll(e.currentTarget, mainTableRef.current)}>
              <div className="scrollbar-top-inner" style={{ width: tableWidth }} />
            </div>
            <span className="scroll-hint">⇆ Shift + 鼠标滚轮 横向滚动</span>
          </div>
      <div ref={mainTableRef} className="table-container" onScroll={(e) => syncScroll(e.currentTarget, mainTopBarRef.current)}>
      <table className="stock-table">
        <thead>
          <tr>
            <th>序号</th>
            <th className="cursor-pointer select-none" onClick={() => toggleSort('safety')} title="点击排序：升序→降序→默认">
              安全系数{arrow('safety') && <span className="text-blue-500">{arrow('safety')}</span>}
            </th>
            <th>建议</th>
            <th>反弹信号</th>
            <th>操作建议</th>
            <th title="判断是否处于主升浪起点：均线多头刚形成+放量突破盘整+量能持续">主升浪</th>
            <th className="cursor-pointer select-none" onClick={() => toggleSort('fundamental')} title="点击排序：基本面评分（满分100）">
              基本面{arrow('fundamental') && <span className="text-blue-500">{arrow('fundamental')}</span>}
            </th>
            <th title="国家队持仓（社保/汇金/证金/大基金等）">国家队</th>
            <th title="北向资金持仓（香港中央结算）">外资</th>
            <th title="游资持仓（章建平/葛卫东/知名私募等）">游资</th>
            <th>公司</th>
            <th>板块</th>
            <th style={{ position: 'sticky', top: 0, zIndex: 200, overflow: 'visible' }}>
              <div style={{ display: 'inline-block', position: 'relative' }}>
                <button
                  ref={industryBtnRef}
                  onClick={() => {
                    if (showIndustryDropdown) {
                      setShowIndustryDropdown(false);
                      return;
                    }
                    const rect = industryBtnRef.current?.getBoundingClientRect();
                    if (rect) setDropdownPos({ top: rect.bottom + 4, left: rect.left });
                    setShowIndustryDropdown(true);
                    setIndustrySearch('');
                  }}
                  className={`flex items-center gap-1 cursor-pointer select-none hover:text-blue-600 transition-colors ${
                    industryFilter.size > 0 ? 'text-blue-600 font-bold' : ''
                  }`}
                  title="点击筛选行业"
                >
                  行业
                  {industryFilter.size > 0 && (
                    <span className="text-xs bg-blue-500 text-white rounded-full px-1 leading-tight">{industryFilter.size}</span>
                  )}
                  <span className="text-xs opacity-60">{showIndustryDropdown ? '▲' : '▼'}</span>
                </button>
                {showIndustryDropdown && (
                  <div
                    ref={industryDropdownRef}
                    style={{
                      position: 'fixed',
                      top: dropdownPos.top,
                      left: dropdownPos.left,
                      zIndex: 99999,
                      background: 'white', border: '1px solid #e5e7eb',
                      borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                      minWidth: 180, maxHeight: 320, overflowY: 'auto', padding: '6px 0',
                      color: '#1f2937'
                    }}
                  >
                    {/* 搜索框 */}
                    <div className="px-3 py-2 border-b">
                      <input
                        autoFocus
                        type="text"
                        value={industrySearch}
                        onChange={e => setIndustrySearch(e.target.value)}
                        placeholder="搜索行业..."
                        style={{ width: '100%', padding: '3px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, outline: 'none', color: '#1f2937' }}
                        onMouseDown={e => e.stopPropagation()}
                      />
                    </div>
                    <div className="flex gap-2 px-3 py-1.5 border-b">
                      <button
                        onClick={() => { setIndustryFilter(new Set()); setCurrentPage(1); }}
                        className="text-xs text-gray-500 hover:text-blue-600"
                      >全选</button>
                      <button
                        onClick={() => { setIndustryFilter(new Set(allIndustries)); setCurrentPage(1); }}
                        className="text-xs text-gray-500 hover:text-blue-600"
                      >全不选</button>
                    </div>
                    {allIndustries.filter(ind => ind.includes(industrySearch.trim())).map(ind => (
                      <label key={ind} className="flex items-center gap-2 px-3 py-1 hover:bg-blue-50 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={industryFilter.size === 0 || industryFilter.has(ind)}
                          onChange={e => {
                            setIndustryFilter(prev => {
                              const next = new Set(prev.size === 0 ? allIndustries : prev);
                              if (e.target.checked) next.add(ind);
                              else next.delete(ind);
                              // 全选时清空（表示无过滤）
                              if (next.size === allIndustries.length) return new Set();
                              return next;
                            });
                            setCurrentPage(1);
                          }}
                          className="accent-blue-500"
                        />
                        {ind}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </th>
            <th>景气指数<br/><span className="text-xs font-normal opacity-75">(0-200)</span></th>
            <th>当前<br/>股价</th>
            <th>合理<br/>价位</th>
            <th>理想<br/>买点</th>
            <th>减仓<br/>价位</th>
            <th>1年内<br/>卖点</th>
            <th>当前市值<br/>(亿)</th>
            <th>3年后理想<br/>估值(亿)</th>
            <th>年内<br/>涨幅%</th>
            <th>机构预期<br/><span className="text-xs font-normal opacity-75">PEG</span></th>
            <th>更新<br/>日期</th>
            <th className="cursor-pointer select-none" onClick={() => toggleSort('cagr')} title="点击排序：升序→降序→默认">
              CAGR<br/>(E){arrow('cagr') && <span className="text-blue-500">{arrow('cagr')}</span>}
            </th>
            <th title="1-5分：5分最可信，1分最不可信">预测<br/>可信度</th>
            <th className="text-blue-700">2026E<br/><span className="text-xs font-normal opacity-75">EPS</span></th>
            <th className="text-blue-700">2027E<br/><span className="text-xs font-normal opacity-75">EPS</span></th>
            <th className="text-blue-700">2028E<br/><span className="text-xs font-normal opacity-75">EPS</span></th>
            <th>前瞻PE<br/><span className="text-xs font-normal opacity-75">(E)</span></th>
            <th>PEG<br/>(E)</th>
            <th>自选</th>
          </tr>
        </thead>
        <tbody>
          {/* 搜索高亮行：显示搜索结果中选定的股票 */}
          {highlightStock && (() => {
            const s = highlightStock.stock;
            const c = calcPEGStock(s);
            const sColor =
              highlightStock.groupName === '沪深300' ? 'bg-orange-500'
              : highlightStock.groupName === '中证500' ? 'bg-amber-500'
              : 'bg-rose-500';
            return (
              <>
                <tr className="bg-blue-50 border-b-2 border-blue-300">
                {/* 序号列：显示分组标签+关闭按钮 */}
                <td className="text-center">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className={`text-xs px-1 py-0.5 rounded text-white leading-none ${sColor}`}>
                      {highlightStock.groupName}
                    </span>
                    <button onClick={onClearHighlight} className="text-gray-400 hover:text-red-500 text-xs leading-none" title="关闭">×</button>
                  </div>
                </td>
                <td className={`formula-cell font-semibold ${getSafetyBg(c.safetyFactor)} ${
                  c.safetyFactor >= 1 ? 'text-red-700' : c.safetyFactor >= 0.7 ? 'text-yellow-700' : 'text-green-700'
                }`}>{s.currentPrice && hasEpsData(s) ? (c.safetyFactor * 100).toFixed(1) + '%' : '-'}</td>
                <td className={`text-xs whitespace-nowrap ${s.currentPrice && hasEpsData(s) ? getAdvice(c.safetyFactor).className : ''}`}>
                  {s.currentPrice && hasEpsData(s) ? getAdvice(c.safetyFactor).text : '-'}
                </td>
                {/* 反弹信号 */}
                <td>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${getEntrySignal(s).className}`}>
                    {getEntrySignal(s).text}
                  </span>
                </td>
                {/* 操作建议 */}
                <td className="text-center whitespace-nowrap">
                  {(() => {
                    const sig = getActionSignal(s, c.safetyFactor);
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
                {/* 基本面评分 */}
                <FundamentalCell
                  stock={s}
                  rowKey={`highlight-${highlightStock.groupName}-${s.id}`}
                  expandedRow={expandedFundamentalRow}
                  onToggle={toggleFundamental}
                />
                {/* 国家队持仓 */}
                <NationalTeamCell stock={s} rowKey={`highlight-${highlightStock.groupName}-${s.id}`} expandedRow={expandedHolderRow} onToggle={toggleHolder} />
                {/* 外资持仓 */}
                <ForeignCell stock={s} rowKey={`highlight-${highlightStock.groupName}-${s.id}`} expandedRow={expandedHolderRow} onToggle={toggleHolder} />
                {/* 游资持仓 */}
                <HotMoneyCell stock={s} rowKey={`highlight-${highlightStock.groupName}-${s.id}`} expandedRow={expandedHolderRow} onToggle={toggleHolder} />
                <td className="text-left font-medium text-xs">{s.company}</td>
                <td className="text-xs">{getStockBoard(s.stockCode)}</td>
                <td className="text-xs">{s.highlight || '-'}<MethodTag industry={s.highlight || ''} /></td>
                <td className="text-center text-xs">{s.prosperityIndex}</td>
                <td className={s.yearChange >= 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                  {s.currentPrice ? formatNumber(s.currentPrice) : '-'}
                </td>
                <td className="formula-cell">{s.currentPrice ? formatNumber(c.fairValue) : '-'}</td>
                <td className="formula-cell text-blue-700">{s.currentPrice ? formatNumber(c.idealBuyPoint) : '-'}</td>
                <td className="formula-cell">{s.currentPrice ? formatNumber(c.reducePosition) : '-'}</td>
                <td className="formula-cell text-red-600">{s.currentPrice ? formatNumber(c.oneYearSellPoint) : '-'}</td>
                <td>{s.marketCap ? formatNumber(s.marketCap, 0) : '-'}</td>
                <td className="formula-cell">{s.marketCap ? formatNumber(c.threeYearValuation, 0) : '-'}</td>
                <td className={getChangeColor(s.yearChange)}>{s.yearChange ? formatNumber(s.yearChange) + '%' : '-'}</td>
                <td className={`formula-cell text-xs font-semibold ${
                  s.pegCar && s.pegCar < 1 ? 'text-green-600'
                  : s.pegCar && s.pegCar <= 1.5 ? 'text-yellow-600'
                  : s.pegCar && s.pegCar > 1.5 ? 'text-red-600'
                  : 'text-gray-400'
                }`}>{s.pegCar && s.pegCar > 0 ? formatNumber(s.pegCar, 4) : '-'}</td>
                <td className="text-xs text-gray-500">{s.updateDate || '-'}</td>
                <td className="text-center text-xs">{getDisplayCAGR(s) ? formatNumber(getDisplayCAGR(s), 4) : '-'}</td>
                <ReliabilityCell stock={s} />
                <td className="formula-cell text-blue-700 text-xs">{s.eps2026 ? formatNumber(s.eps2026, 2) : '-'}</td>
                <td className="formula-cell text-blue-700 text-xs">{s.eps2027 ? formatNumber(s.eps2027, 2) : '-'}</td>
                <td className="formula-cell text-blue-700 text-xs">{s.eps2028 ? formatNumber(s.eps2028, 2) : '-'}</td>
                <td className="text-center text-xs">{hasEpsData(s) ? (s.pe || '-') : '-'}</td>
                <td className={`formula-cell font-semibold ${
                  hasEpsData(s) && c.peg < 1 ? 'text-green-600'
                  : hasEpsData(s) && c.peg <= 1.5 ? 'text-yellow-600'
                  : hasEpsData(s) && c.peg > 1.5 ? 'text-red-600'
                  : 'text-gray-400'
                }`}>{hasEpsData(s) && c.peg ? formatNumber(c.peg, 4) : '-'}</td>
                <td className="text-center">
                  <button
                    onClick={() => onToggleHighlightWatched?.(s.stockCode)}
                    className={`text-lg leading-none transition-colors ${
                      s.watched ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-300 hover:text-yellow-400'
                    }`}
                    title={s.watched ? '取消自选' : '加入自选'}
                  >★</button>
                </td>
              </tr>
                {expandedFundamentalRow === `highlight-${highlightStock.groupName}-${s.id}` && (
                  <FundamentalDetailRow stock={s} colSpan={26} />
                )}
                {expandedHolderRow === `highlight-${highlightStock.groupName}-${s.id}` && (
                  <HolderDetailRow stock={s} colSpan={26} />
                )}
              </>
            );
          })()}

          {/* 有高亮行时隐藏其他行，否则正常显示 */}
          {!highlightStock && pageStocks.map((stock, idx) => {
            const calc = calcPEGStock(stock);
            const globalIndex = startIdx + idx;
            const stockHasEps = hasEpsData(stock);
            const safetyBg = stock.currentPrice && stockHasEps ? getSafetyBg(calc.safetyFactor) : '';
            return (
              <Fragment key={stock.id}>
                <tr className={(!isWatchedGroup && stock.watched) ? 'bg-purple-50' : ''} style={(!isWatchedGroup && stock.watched) ? { boxShadow: 'inset 0 0 0 2px #a855f7' } : {}}>
                {/* 序号 */}
                <td className="text-gray-500 text-xs">{globalIndex + 1}</td>
                {/* B: 安全系数 = H/F */}
                <td className={`formula-cell font-semibold ${safetyBg} ${
                  calc.safetyFactor >= 1 ? 'text-red-700' : calc.safetyFactor >= 0.7 ? 'text-yellow-700' : 'text-green-700'
                }`}>
                  {stock.currentPrice && stockHasEps ? (calc.safetyFactor * 100).toFixed(1) + '%' : '-'}
                </td>
                {/* 建议 */}
                <td className={`text-xs whitespace-nowrap ${
                  stock.currentPrice && stockHasEps ? getAdvice(calc.safetyFactor).className : ''
                }`}>
                  {stock.currentPrice && stockHasEps ? getAdvice(calc.safetyFactor).text : '-'}
                </td>
                {/* 反弹信号 */}
                <td>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${getEntrySignal(stock).className}`}>
                    {getEntrySignal(stock).text}
                  </span>
                </td>
                {/* 操作建议 */}
                <td className="text-center whitespace-nowrap">
                  {(() => {
                    const sig = getActionSignal(stock, calc.safetyFactor);
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
                {/* 主升浪信号 */}
                <td className="text-center whitespace-nowrap">
                  {(() => {
                    const mt = getMainTrendSignal(stock);
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
                {/* 基本面评分 */}
                <FundamentalCell
                  stock={stock}
                  rowKey={`normal-${stock.id}`}
                  expandedRow={expandedFundamentalRow}
                  onToggle={toggleFundamental}
                />
                {/* 国家队持仓 */}
                <NationalTeamCell stock={stock} rowKey={`normal-${stock.id}`} expandedRow={expandedHolderRow} onToggle={toggleHolder} />
                {/* 外资持仓 */}
                <ForeignCell stock={stock} rowKey={`normal-${stock.id}`} expandedRow={expandedHolderRow} onToggle={toggleHolder} />
                {/* 游资持仓 */}
                <HotMoneyCell stock={stock} rowKey={`normal-${stock.id}`} expandedRow={expandedHolderRow} onToggle={toggleHolder} />
                {/* C: 公司 */}
                {isWatchedGroup ? (
                  <td className="text-left font-medium px-2 py-1 text-xs">{stock.company || '-'}</td>
                ) : (
                  <EditableCell
                    value={stock.company}
                    onChange={v => onUpdate(stock.id, 'company', v)}
                    className="text-left font-medium"
                  />
                )}
                <td className="text-xs">{getStockBoard(stock.stockCode)}</td>
                {/* D: 行业 */}
                <td className="text-xs max-w-32 truncate" title={stock.highlight}>
                  {stock.highlight || '-'}<MethodTag industry={stock.highlight || ''} />
                </td>
                {/* E: 景气指数 */}
                {isWatchedGroup ? (
                  <td className="text-center px-2 py-1 text-xs">{stock.prosperityIndex || '-'}</td>
                ) : (
                  <EditableCell
                    value={stock.prosperityIndex || ''}
                    onChange={v => onUpdate(stock.id, 'prosperityIndex', v)}
                    type="number"
                  />
                )}
                {/* F: 当前股价 */}
                <td className={stock.yearChange >= 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                  {stock.currentPrice ? formatNumber(stock.currentPrice) : '-'}
                </td>
                {/* G: 合理价位 = H/0.75 */}
                <td className="formula-cell">
                  {stock.currentPrice ? formatNumber(calc.fairValue) : '-'}
                </td>
                {/* H: 理想买点 */}
                <td className="formula-cell text-blue-700">
                  {stock.currentPrice ? formatNumber(calc.idealBuyPoint) : '-'}
                </td>
                {/* I: 减仓价位 = G*1.5 */}
                <td className="formula-cell">
                  {stock.currentPrice ? formatNumber(calc.reducePosition) : '-'}
                </td>
                {/* J: 1年内卖点 */}
                <td className="formula-cell text-red-600">
                  {stock.currentPrice ? formatNumber(calc.oneYearSellPoint) : '-'}
                </td>
                {/* K: 当前市值 */}
                <td>{stock.marketCap ? formatNumber(stock.marketCap, 0) : '-'}</td>
                {/* L: 3年后理想估值 */}
                <td className="formula-cell">
                  {stock.marketCap ? formatNumber(calc.threeYearValuation, 0) : '-'}
                </td>
                {/* M: 年内涨幅 */}
                <td className={getChangeColor(stock.yearChange)}>
                  {stock.yearChange ? formatNumber(stock.yearChange) + '%' : '-'}
                </td>
                {/* N: 机构预期PEG（原风险追踪列） */}
                <td
                  className={`formula-cell text-xs font-semibold ${
                    stock.pegCar && stock.pegCar < 1 ? 'text-green-600'
                    : stock.pegCar && stock.pegCar <= 1.5 ? 'text-yellow-600'
                    : stock.pegCar && stock.pegCar > 1.5 ? 'text-red-600'
                    : 'text-gray-400'
                  }`}
                  title="来自东方财富机构一致预期PEG"
                >
                  {stock.pegCar && stock.pegCar > 0 ? formatNumber(stock.pegCar, 4) : '-'}
                </td>
                {/* O: 更新日期 */}
                <td className="text-xs text-gray-500">{stock.updateDate || '-'}</td>
                {/* P: CAGR */}
                {isWatchedGroup ? (
                  <td className="text-center px-2 py-1 text-xs">{getDisplayCAGR(stock) ? formatNumber(getDisplayCAGR(stock), 4) : '-'}</td>
                ) : (
                  <EditableCell
                    value={hasEpsData(stock) ? stock.cagr || '' : ''}
                    onChange={v => onUpdate(stock.id, 'cagr', v)}
                    type="number"
                    title="预期复合增长率 (公0.13表示13%)"
                  />
                )}
                <ReliabilityCell stock={stock} />
                {/* 2026E EPS */}
                <td className="formula-cell text-blue-700 text-xs">
                  {stock.eps2026 ? formatNumber(stock.eps2026, 2) : '-'}
                </td>
                {/* 2027E EPS */}
                <td className="formula-cell text-blue-700 text-xs">
                  {stock.eps2027 ? formatNumber(stock.eps2027, 2) : '-'}
                </td>
                {/* 2028E EPS */}
                <td className="formula-cell text-blue-700 text-xs">
                  {stock.eps2028 ? formatNumber(stock.eps2028, 2) : '-'}
                </td>
                {/* Q: PE */}
                {isWatchedGroup ? (
                  <td className="text-center px-2 py-1 text-xs">{hasEpsData(stock) ? (stock.pe || '-') : '-'}</td>
                ) : (
                  <EditableCell
                    value={hasEpsData(stock) ? stock.pe || '' : ''}
                    onChange={v => onUpdate(stock.id, 'pe', v)}
                    type="number"
                  />
                )}
                {/* R: PEG = Q/(P*100) 公式计算，只有有 EPS 数据时才显示 */}
                <td
                  className={`formula-cell font-semibold ${
                    hasEpsData(stock) && calc.peg < 1 ? 'text-green-600'
                    : hasEpsData(stock) && calc.peg <= 1.5 ? 'text-yellow-600'
                    : hasEpsData(stock) && calc.peg > 1.5 ? 'text-red-600'
                    : 'text-gray-400'
                  }`}
                  title="前瞻PE ÷ (CAGR × 100)，公式计算"
                >
                  {hasEpsData(stock) && calc.peg ? formatNumber(calc.peg, 4) : '-'}
                </td>
                {/* 自选 */}
                <td>
                  {isWatchedGroup ? (
                    <button
                      onClick={() => onToggleWatched(stock.id)}
                      className="text-base leading-none text-gray-300 hover:text-red-500 transition-colors"
                      title="移出自选"
                    >
                      ✕
                    </button>
                  ) : (
                    <button
                      onClick={() => onToggleWatched(stock.id)}
                      className={`text-lg leading-none transition-colors ${
                        stock.watched ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-300 hover:text-yellow-400'
                      }`}
                      title={stock.watched ? '取消自选' : '加入自选'}
                    >
                      ★
                    </button>
                  )}
                </td>
              </tr>
                {expandedFundamentalRow === `normal-${stock.id}` && (
                  <FundamentalDetailRow stock={stock} colSpan={26} />
                )}
                {expandedHolderRow === `normal-${stock.id}` && (
                  <HolderDetailRow stock={stock} colSpan={26} />
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {/* 底部分页 + 操作栏 */}
      <div className="p-3 border-t bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!isWatchedGroup && (
            <button
              onClick={onAdd}
              className="px-4 py-1.5 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
            >
              + 添加股票
            </button>
          )}
          <span className="text-xs text-gray-500">
            共 <strong>{filteredByIndustry.length}</strong>{industryFilter.size > 0 ? ` / ${stocks.length}` : ''} 只 | 点击安全系数/CAGR表头可排序 | 白色单元格可编辑，灰色单元格为公式自动计算
          </span>
        </div>
        {/* 分页控件 */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={safeCurrentPage === 1}
              className="px-2 py-1 text-xs rounded border hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              首页
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
              className="px-2 py-1 text-xs rounded border hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            {/* 页码按钮 */}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                  page === safeCurrentPage
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'hover:bg-gray-100'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage === totalPages}
              className="px-2 py-1 text-xs rounded border hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              下一页
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={safeCurrentPage === totalPages}
              className="px-2 py-1 text-xs rounded border hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              末页
            </button>
            <span className="text-xs text-gray-500 ml-2">
              第 {startIdx + 1}-{Math.min(startIdx + PAGE_SIZE, stocks.length)} / {stocks.length}
            </span>
          </div>
        )}
      </div>
      </div>
        </>
      )}
    </>
  );
}
