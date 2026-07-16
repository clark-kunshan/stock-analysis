import { useMemo, useState, useRef, useEffect, memo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { PEGStock } from '../types/peg.ts';
import type { ValuationParams } from '../types/valuation.ts';
import { getFundamentalScore } from '../utils/formulas.ts';
import { calcMultiValuation } from '../utils/multiValuation.ts';
import { detectValuationMethod, getDefaultParams, getIndustryDefaultParams } from '../utils/industryValuation.ts';

interface HolderIndustryChartProps { stocks: PEGStock[]; loading?: boolean; onRefresh?: () => void; }

interface StockEntry {
  company: string;
  stockCode: string;
  ratio?: number;
  holdNum?: number;
  amount?: number;
  pe?: number;
  peg?: number;
  pegCar?: number;
  safetyFactor?: number;
  rating?: string;
  prosperityIndex?: number;
  cagr?: number;
  marketBoard?: string;
  // 基本面关键指标
  roe?: number;
  grossMargin?: number;
  debtRatio?: number;
  divYield?: number;
  pb?: number;
  fundamentalScore?: number;  // 综合基本面评分 0-100
  fundamentalGrade?: string;  // 评级：A+ / A / B / C / D
  // 持仓变动
  change?: string;            // 新进/加仓/减仓/不变
  holdNumChange?: number;     // 变动数量(股)
}

interface ChartItem {
  industry: string;
  count: number;
  amount: number;
  stocks: StockEntry[];
}

const HOLDER_TYPES: string[] = ['社保', '养老金', '北向资金', 'QFII', '汇金', '证金'];
const COLORS: Record<string, string> = {
  '社保': '#3b82f6',
  '养老金': '#22c55e',
  '北向资金': '#a855f7',
  'QFII': '#f97316',
  '汇金': '#ef4444',
  '证金': '#dc2626',
};

const BOARD_COLORS: Record<string, { color: string; bg: string; short: string }> = {
  '沪市主板':  { color: '#1f2937', bg: '#e5e7eb', short: '沪主' },
  '深市主板':  { color: '#1e40af', bg: '#dbeafe', short: '深主' },
  '主板':      { color: '#374151', bg: '#f3f4f6', short: '主板' },
  '创业板':    { color: '#047857', bg: '#d1fae5', short: '创业' },
  '科创板':    { color: '#9a3412', bg: '#fed7aa', short: '科创' },
  '北交所':    { color: '#6b21a8', bg: '#ede9fe', short: '北交' },
  'B股':       { color: '#64748b', bg: '#f1f5f9', short: 'B股' },
};

function getMarketBoard(stockCode: string): string {
  if (!stockCode) return '';
  const code = stockCode.replace(/\D/g, '').padStart(6, '0');
  if (code.startsWith('688')) return '科创板';
  if (code.startsWith('300')) return '创业板';
  if (code.startsWith('600') || code.startsWith('601') || code.startsWith('603') || code.startsWith('605') || code.startsWith('60')) return '沪市主板';
  if (code.startsWith('000') || code.startsWith('001') || code.startsWith('003') || code.startsWith('002')) return '深市主板';
  if (code.startsWith('8') || code.startsWith('920') || code.startsWith('4')) return '北交所';
  if (code.startsWith('900') || code.startsWith('200')) return 'B股';
  return '主板';
}

function formatMoney(amount: number): string {
  if (amount == null || !isFinite(amount) || amount === 0) return '-';
  if (amount >= 100000000) return (amount / 100000000).toFixed(2) + ' 亿';
  if (amount >= 10000) return (amount / 10000).toFixed(2) + ' 万';
  return amount.toFixed(0) + ' 元';
}

function computeStockMetrics(s: PEGStock): {
  pe?: number; peg?: number; pegCar?: number; safetyFactor?: number; rating?: string;
  prosperityIndex?: number; cagr?: number;
  roe?: number; grossMargin?: number; debtRatio?: number; divYield?: number; pb?: number;
  fundamentalScore?: number; fundamentalGrade?: string;
} {
  const base = {
    pe: s.pe, pegCar: s.pegCar, prosperityIndex: s.prosperityIndex, cagr: s.cagr,
    roe: s.roe, grossMargin: s.grossMargin, debtRatio: s.debtRatio,
    divYield: s.divYield, pb: s.pb,
  };

  // ===== 安全系数 / 评级：复用与主表（行业对比法估值）完全一致的口径 =====
  // 原逻辑用文件内私有简化 PEG 公式（idealBuyPoint = 现价/PEG×0.75×景气指数），
  // 与 calcMultiValuation 算法不同，导致悬浮窗安全系数和主表不一致、不随主表更新。
  // 现改为：detectValuationMethod → 默认参数 → calcMultiValuation，与主表同一函数路径。
  const method = detectValuationMethod(s.highlight || '');
  const params: ValuationParams = {
    ...getDefaultParams(method),
    ...getIndustryDefaultParams(s, method),
    stockCode: s.stockCode,
    method,
  };
  const v = calcMultiValuation(s, params);
  const safetyFactor = v.safetyFactor > 0 ? v.safetyFactor : undefined;
  const rating = (v.rating && v.rating !== '-') ? v.rating : undefined;

  // PEG 显示列（简化口径，仅用于表格展示）
  let peg: number | undefined;
  if (s.cagr && s.cagr > 0 && s.pe) {
    peg = s.pe / (s.cagr * 100);
  }

  // ========== 综合基本面评分（0-100，与 formulas.ts 统一） ==========
  const fs = getFundamentalScore(s);
  const totalScore = fs.total > 0 ? fs.total : undefined;
  let grade: string | undefined;
  if (totalScore != null) {
    if (totalScore >= 90) grade = 'A+';
    else if (totalScore >= 75) grade = 'A';
    else if (totalScore >= 60) grade = 'B';
    else if (totalScore >= 40) grade = 'C';
    else grade = 'D';
  }

  return {
    ...base,
    peg, safetyFactor, rating,
    fundamentalScore: totalScore,
    fundamentalGrade: grade,
  };
}

function getRatingStyle(rating?: string): { color: string; bg: string; fontWeight: string } {
  switch (rating) {
    case '重点关注': return { color: '#15803d', bg: '#bbf7d0', fontWeight: '700' };
    case '分批建仓': return { color: '#16a34a', bg: '#dcfce7', fontWeight: '600' };
    case '持续跟踪': return { color: '#a16207', bg: '#fef9c3', fontWeight: '500' };
    case '短期忽略': return { color: '#c2410c', bg: '#ffedd5', fontWeight: '600' };
    case '高风险': return { color: '#b91c1c', bg: '#fee2e2', fontWeight: '700' };
    case '观望': return { color: '#64748b', bg: '#f1f5f9', fontWeight: '500' };
    default: return { color: '#94a3b8', bg: '#f1f5f9', fontWeight: '400' };
  }
}

function getGradeStyle(grade?: string): { color: string; bg: string; fontWeight: string } {
  switch (grade) {
    case 'A+': return { color: '#065f46', bg: '#a7f3d0', fontWeight: '800' };
    case 'A':  return { color: '#047857', bg: '#d1fae5', fontWeight: '700' };
    case 'B':  return { color: '#1d4ed8', bg: '#dbeafe', fontWeight: '600' };
    case 'C':  return { color: '#b45309', bg: '#fef3c7', fontWeight: '500' };
    case 'D':  return { color: '#b91c1c', bg: '#fee2e2', fontWeight: '600' };
    default:   return { color: '#94a3b8', bg: '#f1f5f9', fontWeight: '400' };
  }
}

function getChangePriority(change?: string): number {
  switch (change) {
    case '新进': return 4;
    case '加仓': return 3;
    case '减仓': return 2;
    case '不变': return 1;
    default: return 0;
  }
}

function getChangeStyle(change?: string): { color: string; bg: string; fontWeight: string } {
  switch (change) {
    case '新进': return { color: '#166534', bg: '#bbf7d0', fontWeight: '700' };
    case '加仓': return { color: '#15803d', bg: '#dcfce7', fontWeight: '600' };
    case '减仓': return { color: '#b91c1c', bg: '#fee2e2', fontWeight: '600' };
    case '不变': return { color: '#475569', bg: '#f1f5f9', fontWeight: '500' };
    default:   return { color: '#94a3b8', bg: '#f1f5f9', fontWeight: '400' };
  }
}

// 安全系数着色：>1 重点关注(绿) / 0.75-1 分批建仓(蓝) / 0-0.75 观望(灰) / 无数据(浅灰)
function getSafetyColor(sf?: number): string {
  if (sf == null || !isFinite(sf)) return '#94a3b8';
  if (sf > 1) return '#15803d';
  if (sf >= 0.75) return '#2563eb';
  if (sf > 0) return '#64748b';
  return '#94a3b8';
}

// ========== 单个机构图表组件（memo 化，避免父组件 re-render 时重复渲染） ==========
interface HolderCardProps {
  holderType: string;
  data: ChartItem[];
  dataKey: 'count' | 'amount';
  total: number;
  totalAmount: number;
  industries: number;
  onBarHover: (holderType: string, item: ChartItem, mouseX: number, mouseY: number) => void;
  onBarLeave: () => void;
}

const HolderCard = memo(function HolderCard({
  holderType, data, dataKey, total, totalAmount, industries, onBarHover, onBarLeave
}: HolderCardProps) {
  const displayData = data.slice(0, 15);
  const color = COLORS[holderType];
  const colorWithAlpha = color + '30';
  const chartRef = useRef<HTMLDivElement>(null);

  const CHART_MARGIN_TOP = 10;
  const CHART_MARGIN_BOTTOM = 30;
  const ROW_HEIGHT = 40;

  const handleChartMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartRef.current || displayData.length === 0) return;
    const rect = chartRef.current.getBoundingClientRect();
    const chartAreaHeight = rect.height - CHART_MARGIN_TOP - CHART_MARGIN_BOTTOM;
    const relativeY = e.clientY - rect.top - CHART_MARGIN_TOP;
    if (relativeY < 0 || relativeY > chartAreaHeight) return;

    const rowIdx = Math.floor(relativeY / ROW_HEIGHT);
    if (rowIdx >= 0 && rowIdx < displayData.length) {
      const item = displayData[rowIdx];
      if (item) onBarHover(holderType, item, e.clientX, e.clientY);
    }
  };

  return (
    <div
      style={{
        background: '#fff',
        padding: 12,
        borderRadius: 8,
        border: `1px solid ${colorWithAlpha}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
      onMouseLeave={onBarLeave}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '0 4px' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: color }}>{holderType}</span>
        <span style={{ fontSize: 11, color: '#64748b' }}>
          {total} 只 · {industries} 个行业
          {dataKey === 'amount' && totalAmount > 0 ? ` · ${formatMoney(totalAmount)}` : ''}
        </span>
      </div>

      <div
        ref={chartRef}
        style={{ width: '100%', height: 80 + displayData.length * 40 }}
        onMouseMove={handleChartMouseMove}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={displayData} layout="vertical" margin={{ top: CHART_MARGIN_TOP, right: 20, left: 0, bottom: CHART_MARGIN_BOTTOM }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
            <XAxis
              type="number"
              fontSize={10}
              tickLine={false}
              tickFormatter={(v: any) => {
                if (dataKey === 'amount') {
                  const n = Number(v);
                  if (!isFinite(n) || n === 0) return '0';
                  if (n >= 100000000) return (n / 100000000).toFixed(0) + '亿';
                  if (n >= 10000) return (n / 10000).toFixed(0) + '万';
                  return n.toFixed(0);
                }
                return String(v);
              }}
            />
            <YAxis
              type="category"
              dataKey="industry"
              width={110}
              fontSize={10}
              tickLine={false}
              interval={0}
            />
            <Tooltip
              trigger="hover"
              cursor={{ stroke: color, strokeWidth: 1, strokeOpacity: 0.3 }}
              content={() => null}
            />
            <Bar
              dataKey={dataKey}
              name={holderType}
              fill={color}
              radius={[0, 4, 4, 0]}
              barSize={22}
              onMouseEnter={(d: any) => {
                const item: ChartItem | undefined = d?.payload ?? d?.activePayload?.[0]?.payload;
                if (item) onBarHover(holderType, item, 0, 0);
              }}
              onMouseMove={(d: any) => {
                const item: ChartItem | undefined = d?.payload ?? d?.activePayload?.[0]?.payload;
                if (item) onBarHover(holderType, item, 0, 0);
              }}
              onMouseLeave={onBarLeave}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

// ========== 悬浮框组件 ==========
interface TooltipBoxProps {
  activeItem: { item: ChartItem; holderType: string } | null;
  mouseX: number;
  mouseY: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

function TooltipBox({ activeItem, mouseX, mouseY, onMouseEnter, onMouseLeave }: TooltipBoxProps) {
  if (!activeItem) return null;
  const color = COLORS[activeItem.holderType];
  const borderColor = color + '60';

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        zIndex: 99999,
        left: mouseX > window.innerWidth / 2
          ? Math.max(10, mouseX - 720 - 20) + 'px'
          : Math.min(mouseX + 20, window.innerWidth - 730) + 'px',
        top: Math.max(10, Math.min(mouseY - 40, window.innerHeight - 560)) + 'px',
        width: 720,
        background: '#ffffff',
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        padding: '12px 14px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        fontSize: 12,
      }}
    >
      <div style={{
        fontWeight: 700,
        fontSize: 13,
        marginBottom: 6,
        paddingBottom: 6,
        borderBottom: '1px solid #f1f5f9',
        color: color,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>{activeItem.holderType} · {activeItem.item.industry}</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: '#64748b' }}>
          {activeItem.item.count} 只 · {formatMoney(activeItem.item.amount)}
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 0.5fr 0.7fr 0.5fr 0.5fr 0.65fr 0.65fr 0.62fr 0.95fr',
        gap: 4,
        padding: '5px 6px',
        background: '#f8fafc',
        borderRadius: 4,
        fontSize: 10,
        color: '#475569',
        fontWeight: 600,
      }}>
        <span>股票</span>
        <span style={{ textAlign: 'right' }}>占比</span>
        <span style={{ textAlign: 'right' }}>市值</span>
        <span style={{ textAlign: 'right' }}>PE</span>
        <span style={{ textAlign: 'right' }}>PEG</span>
        <span style={{ textAlign: 'center' }}>变动</span>
        <span style={{ textAlign: 'center' }}>建议</span>
        <span style={{ textAlign: 'center' }}>安全系数</span>
        <span style={{ textAlign: 'center' }}>基本面分</span>
      </div>

      <div style={{ maxHeight: 380, overflowY: 'auto', marginTop: 4, paddingRight: 2 }}>
        {activeItem.item.stocks.map((s, idx) => {
          const rStyle = getRatingStyle(s.rating);
          const gStyle = getGradeStyle(s.fundamentalGrade);
          const cStyle = getChangeStyle(s.change);
          return (
            <div key={idx} style={{
              display: 'grid',
              gridTemplateColumns: '2fr 0.5fr 0.7fr 0.5fr 0.5fr 0.65fr 0.65fr 0.62fr 0.95fr',
              gap: 4,
              padding: '4px 6px',
              borderRadius: 4,
              background: idx % 2 === 0 ? 'transparent' : '#f8fafc',
              fontSize: 11,
              alignItems: 'center',
              lineHeight: 1.3,
            }}>
              <span style={{ color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.company}</span>
                {s.marketBoard && BOARD_COLORS[s.marketBoard] && (
                  <span style={{
                    fontSize: 9,
                    padding: '1px 3px',
                    borderRadius: 2,
                    flexShrink: 0,
                    color: BOARD_COLORS[s.marketBoard].color,
                    background: BOARD_COLORS[s.marketBoard].bg,
                  }}>{BOARD_COLORS[s.marketBoard].short}</span>
                )}
                {s.marketBoard && !BOARD_COLORS[s.marketBoard] && (
                  <span style={{ fontSize: 9, padding: '1px 3px', borderRadius: 2, flexShrink: 0, color: '#64748b', background: '#f1f5f9' }}>{s.marketBoard}</span>
                )}
              </span>
              <span style={{ textAlign: 'right', color: '#059669', fontSize: 11 }}>
                {typeof s.ratio === 'number' && !isNaN(s.ratio) ? s.ratio.toFixed(1) + '%' : '-'}
              </span>
              <span style={{ textAlign: 'right', color: '#b45309', fontSize: 11 }}>
                {s.amount != null && s.amount > 0 ? formatMoney(s.amount) : '-'}
              </span>
              <span style={{ textAlign: 'right', color: '#334155', fontSize: 11 }}>
                {s.pe != null && s.pe > 0 ? s.pe.toFixed(1) : '-'}
              </span>
              <span style={{ textAlign: 'right', color: s.peg != null && s.peg > 0 ? '#2563eb' : '#94a3b8', fontSize: 11 }}>
                {s.peg != null && s.peg > 0 ? s.peg.toFixed(2) : (s.pegCar != null ? s.pegCar.toFixed(2) : '-')}
              </span>
              <span style={{
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
              }}>
                {s.change ? (
                  <>
                    <span style={{
                      color: cStyle.color,
                      background: cStyle.bg,
                      padding: '1px 4px',
                      borderRadius: 3,
                      fontWeight: cStyle.fontWeight as any,
                      fontSize: 10,
                      lineHeight: 1.2,
                    }}>{s.change}</span>
                    {s.holdNumChange != null && s.holdNumChange !== 0 && (
                      <span style={{
                        fontSize: 9,
                        color: s.holdNumChange > 0 ? '#16a34a' : '#dc2626',
                        lineHeight: 1.2,
                      }}>
                        {s.holdNumChange > 0 ? '+' : ''}
                        {Math.abs(s.holdNumChange) >= 10000
                          ? (Math.abs(s.holdNumChange) / 10000).toFixed(0) + '万'
                          : Math.abs(s.holdNumChange).toFixed(0)}
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ color: '#cbd5e1', fontSize: 10 }}>-</span>
                )}
              </span>
              <span style={{
                textAlign: 'center',
                color: rStyle.color,
                background: rStyle.bg,
                padding: '1px 4px',
                borderRadius: 3,
                fontWeight: rStyle.fontWeight as any,
                fontSize: 10,
              }}>{s.rating || '-'}</span>
              <span style={{ textAlign: 'center', color: getSafetyColor(s.safetyFactor), fontWeight: 700, fontSize: 11 }}>
                {s.safetyFactor != null && isFinite(s.safetyFactor) ? s.safetyFactor.toFixed(2) : '-'}
              </span>
              <span style={{
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                flexWrap: 'nowrap',
              }}>
                <span style={{
                  color: gStyle.color,
                  background: gStyle.bg,
                  padding: '1px 5px',
                  borderRadius: 3,
                  fontWeight: gStyle.fontWeight as any,
                  fontSize: 10,
                }}>{s.fundamentalGrade || '-'}</span>
                <span style={{ color: '#475569', fontSize: 10, fontWeight: 600, minWidth: 24, textAlign: 'left' }}>
                  {s.fundamentalScore != null ? s.fundamentalScore : '-'}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 8,
        paddingTop: 6,
        borderTop: '1px solid #f1f5f9',
        fontSize: 10,
        color: '#94a3b8',
        lineHeight: 1.5,
      }}>
        PE：前瞻市盈率 · PEG：PE/(CAGR×100) · 安全系数：合理价/现价（&gt;1重点关注 / ≥0.75分批建仓 / ≥0.5持续跟踪 / ≥0.25短期忽略 / &lt;0.25高风险）· 建议基于安全系数 · 变动：新进/加仓/减仓/不变
        <br />
        基本面分（满分100）：ROE22 + 毛利率18 + CAGR18 + 资产负债率12 + 股息率10 + PEG10 + 商誉减值10，≥90A+/≥75A/≥60B/≥40C/＜40D
      </div>
    </div>
  );
}

// ========== 主组件 ==========
export function HolderIndustryChart({ stocks, loading = false, onRefresh }: HolderIndustryChartProps) {

  // ---------- 数据聚合（useMemo 已保证，stocks 没变就不重算） ----------
  const industryByHolderData = useMemo(() => {
    const map = new Map<string, Record<string, Map<string, StockEntry>>>();
    for (const s of stocks) {
      const industry = s.highlight || '未分类';
      const holders = s.holderDetails;
      if (!holders || holders.length === 0) continue;
      if (!map.has(industry)) map.set(industry, {});
      const entry = map.get(industry)!;
      const metrics = computeStockMetrics(s);
      for (const h of holders) {
        if (!HOLDER_TYPES.includes(h.type)) continue;
        if (!entry[h.type]) entry[h.type] = new Map<string, StockEntry>();
        const stockMap = entry[h.type];
        const existing = stockMap.get(s.stockCode);
        const price = s.currentPrice && s.currentPrice > 0 ? s.currentPrice : undefined;
        if (existing) {
          if (h.ratio != null && (existing.ratio == null || h.ratio > existing.ratio)) existing.ratio = h.ratio;
          if (h.holdNum != null && h.holdNum > 0) existing.holdNum = (existing.holdNum || 0) + h.holdNum;
          // 按优先级合并变动：新进 > 加仓 > 减仓 > 不变
          if (getChangePriority(h.change) > getChangePriority(existing.change)) {
            existing.change = h.change;
          }
          // 累加变动数量
          if (h.holdNumChange != null && isFinite(h.holdNumChange)) {
            existing.holdNumChange = (existing.holdNumChange || 0) + h.holdNumChange;
          }
        } else {
          const holdNum = h.holdNum && h.holdNum > 0 ? h.holdNum : undefined;
          stockMap.set(s.stockCode, {
            company: s.company, stockCode: s.stockCode, ratio: h.ratio, holdNum,
            amount: (holdNum && price) ? holdNum * price : undefined,
            pe: metrics.pe, peg: metrics.peg, pegCar: metrics.pegCar,
            safetyFactor: metrics.safetyFactor, rating: metrics.rating,
            prosperityIndex: metrics.prosperityIndex, cagr: metrics.cagr,
            marketBoard: getMarketBoard(s.stockCode),
            roe: metrics.roe, grossMargin: metrics.grossMargin,
            debtRatio: metrics.debtRatio, divYield: metrics.divYield, pb: metrics.pb,
            fundamentalScore: metrics.fundamentalScore,
            fundamentalGrade: metrics.fundamentalGrade,
            change: h.change,
            holdNumChange: h.holdNumChange,
          });
        }
      }
    }
    map.forEach((holderRec) => {
      HOLDER_TYPES.forEach((t) => {
        const sm = holderRec[t];
        if (!sm) return;
        sm.forEach((e) => {
          if (e.holdNum && e.holdNum > 0) {
            const price = stocks.find(s => s.stockCode === e.stockCode)?.currentPrice;
            if (price && price > 0) e.amount = e.holdNum * price;
          }
        });
      });
    });
    return map;
  }, [stocks]);

  const perHolderData = useMemo(() => {
    const result: Record<string, ChartItem[]> = {};
    for (const holderType of HOLDER_TYPES) {
      const arr: ChartItem[] = [];
      industryByHolderData.forEach((v, industry) => {
        const stockMap = v[holderType];
        if (stockMap && stockMap.size > 0) {
          const stocksArr = Array.from(stockMap.values());
          stocksArr.sort((a, b) => {
            const ra = a.amount ?? 0, rb = b.amount ?? 0;
            if (rb !== ra) return rb - ra;
            const rp = a.ratio ?? 0, rq = b.ratio ?? 0;
            if (rq !== rp) return rq - rp;
            return a.company.localeCompare(b.company, 'zh-CN');
          });
          const totalAmount = stocksArr.reduce((sum, s) => sum + (s.amount || 0), 0);
          arr.push({ industry, count: stocksArr.length, amount: totalAmount, stocks: stocksArr });
        }
      });
      arr.sort((a, b) => b.count - a.count);
      result[holderType] = arr;
    }
    return result;
  }, [industryByHolderData]);

  const perHolderDataByAmount = useMemo(() => {
    const result: Record<string, ChartItem[]> = {};
    for (const holderType of HOLDER_TYPES) {
      const arr = (perHolderData[holderType] || []).map(x => x);
      arr.sort((a, b) => b.amount - a.amount);
      result[holderType] = arr;
    }
    return result;
  }, [perHolderData]);

  const holderTotalsByCount = useMemo(() => {
    return HOLDER_TYPES.map(t => ({
      type: t,
      total: perHolderData[t]?.reduce((sum, item) => sum + item.count, 0) || 0,
      industries: perHolderData[t]?.length || 0,
      amount: perHolderData[t]?.reduce((sum, item) => sum + item.amount, 0) || 0,
    }));
  }, [perHolderData]);

  const holderTotalsByAmount = useMemo(() => {
    return HOLDER_TYPES.map(t => ({
      type: t,
      total: perHolderDataByAmount[t]?.reduce((sum, item) => sum + item.count, 0) || 0,
      industries: perHolderDataByAmount[t]?.length || 0,
      amount: perHolderDataByAmount[t]?.reduce((sum, item) => sum + item.amount, 0) || 0,
    }));
  }, [perHolderDataByAmount]);

  // ---------- 悬浮框状态（尽量少更新） ----------
  const [activeItem, setActiveItem] = useState<{ item: ChartItem; holderType: string } | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // 用 ref 存鼠标实时位置，避免频繁 setState → 避免整个图表组件 re-render
  const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  // 延迟隐藏：用 ref 存 setTimeout id，避免从柱子移到悬浮框途中悬浮框消失
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };
  const scheduleHide = () => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setActiveItem(null);
      hideTimerRef.current = null;
    }, 150);
  };
  // 组件卸载时清理
  useEffect(() => {
    return () => clearHideTimer();
  }, []);

  // 鼠标进入柱子（hover 时才调用一次）
  const handleBarHover = (holderType: string, item: ChartItem) => {
    clearHideTimer();
    const pos = mousePosRef.current;
    setActiveItem((prev) => {
      if (prev && prev.item.industry === item.industry && prev.holderType === holderType) return prev;
      setHoverPos({ x: pos.x, y: pos.y });
      return { item, holderType };
    });
  };

  // 鼠标离开柱子 / 卡片：延迟消失（给用户移动到悬浮框留缓冲时间）
  const handleBarLeave = () => {
    scheduleHide();
  };

  // 鼠标进入悬浮框：取消即将消失的定时器
  const handleTooltipEnter = () => {
    clearHideTimer();
  };

  // 鼠标离开悬浮框：延迟消失（给用户移回柱子留缓冲）
  const handleTooltipLeave = () => {
    scheduleHide();
  };

  const hasAnyData = holderTotalsByCount.some(h => h.total > 0);

  if (!hasAnyData) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#666" }}>
        {loading ? (
          <>
            <div style={{ fontSize: 16, marginBottom: 8 }}>正在加载机构持仓数据…</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>首次加载需拉取十大流通股东数据，请稍候</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 16, marginBottom: 8 }}>暂无机构持仓数据</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>点击下方按钮获取十大流通股东持仓数据</div>
            {onRefresh && (
              <button
                onClick={onRefresh}
                style={{
                  padding: '8px 16px', fontSize: 13, cursor: 'pointer',
                  background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6,
                }}
              >刷新持仓</button>
            )}
          </>
        )}
      </div>
    );
  }

  // 预计算卡片列表（避免 render 时 map 产生不必要的对象分配）
  const cardsByCount = useMemo(() =>
    holderTotalsByCount.filter(h => h.total > 0).map(h => ({
      type: h.type,
      total: h.total,
      amount: h.amount,
      industries: h.industries,
      data: perHolderData[h.type] || [],
    })), [holderTotalsByCount, perHolderData]);

  const cardsByAmount = useMemo(() =>
    holderTotalsByAmount.filter(h => h.amount > 0).map(h => ({
      type: h.type,
      total: h.total,
      amount: h.amount,
      industries: h.industries,
      data: perHolderDataByAmount[h.type] || [],
    })), [holderTotalsByAmount, perHolderDataByAmount]);

  const hasAmountData = cardsByAmount.length > 0;

  return (
    <div
      style={{ margin: "0", background: "#f8fafc", minHeight: 'calc(100vh - 100px)', padding: 12 }}
      onMouseLeave={scheduleHide}
    >
      {/* 第一组：按持仓股票数量 */}
      <div style={{
        marginBottom: 16,
      }}>
        <div style={{
          fontSize: 13,
          color: '#475569',
          marginBottom: 8,
          paddingLeft: 4,
          fontWeight: 600,
        }}>一、按持仓股票数量（各机构独立）</div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: '12px',
        }}>
          {cardsByCount.map(card => (
            <HolderCard
              key={`count-${card.type}`}
              holderType={card.type}
              data={card.data}
              dataKey="count"
              total={card.total}
              totalAmount={card.amount}
              industries={card.industries}
              onBarHover={handleBarHover}
              onBarLeave={handleBarLeave}
            />
          ))}
        </div>
      </div>

      {/* 第二组：按持股市值 */}
      {hasAmountData && (
        <div style={{
          marginBottom: 16,
        }}>
          <div style={{
            fontSize: 13,
            color: '#475569',
            marginBottom: 8,
            paddingLeft: 4,
            fontWeight: 600,
          }}>二、按持股市值（资金金额）</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: '12px',
          }}>
            {cardsByAmount.map(card => (
              <HolderCard
                key={`amount-${card.type}`}
                holderType={card.type}
                data={card.data}
                dataKey="amount"
                total={card.total}
                totalAmount={card.amount}
                industries={card.industries}
                onBarHover={handleBarHover}
                onBarLeave={handleBarLeave}
              />
            ))}
          </div>
        </div>
      )}

      {/* 悬浮框 */}
      <TooltipBox
        activeItem={activeItem}
        mouseX={hoverPos.x}
        mouseY={hoverPos.y}
        onMouseEnter={handleTooltipEnter}
        onMouseLeave={handleTooltipLeave}
      />
    </div>
  );
}
