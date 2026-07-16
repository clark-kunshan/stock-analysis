import type { PEGStock, PEGCalcResult } from '../types/peg.ts';
import { calcPEGStock } from '../utils/formulas.ts';

interface StockDetailModalProps {
  stock: PEGStock;
  groupName: string;
  onClose: () => void;
}

function fmt(v: number | undefined, decimals = 2): string {
  if (v === undefined || v === null || isNaN(v) || v === 0) return '-';
  return v.toFixed(decimals);
}

function fmtPct(v: number | undefined): string {
  if (v === undefined || v === null || isNaN(v) || v === 0) return '-';
  return (v * 100).toFixed(2) + '%';
}

function safetyColor(pct: number): string {
  if (pct >= 100) return 'text-red-600';
  if (pct >= 70) return 'text-amber-600';
  return 'text-green-600';
}

function pegColor(peg: number): string {
  if (peg <= 0) return 'text-gray-400';
  if (peg < 1) return 'text-green-600';
  if (peg <= 1.5) return 'text-amber-600';
  return 'text-red-600';
}

export function StockDetailModal({ stock, groupName, onClose }: StockDetailModalProps) {
  const calc: PEGCalcResult = calcPEGStock(stock);
  const safetyPct = calc.safetyFactor * 100;

  const groupColor =
    groupName === '沪深300' ? 'bg-orange-500'
    : groupName === '中证500' ? 'bg-amber-500'
    : 'bg-rose-500';

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-gray-800">{stock.company}</span>
            <span className={`text-xs px-2 py-0.5 rounded text-white ${groupColor}`}>{groupName}</span>
            {stock.highlight && (
              <span className="text-xs text-gray-400">{stock.highlight}</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 行情数据 */}
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">行情数据</div>
            <div className="grid grid-cols-3 gap-3">
              <DataItem label="当前股价" value={fmt(stock.currentPrice)} unit="元"
                valueClass={stock.currentPrice > 0 ? 'text-red-600 font-bold' : ''} />
              <DataItem label="当前市值" value={fmt(stock.marketCap, 0)} unit="亿" />
              <DataItem label="年内涨幅" value={stock.yearChange ? stock.yearChange.toFixed(2) + '%' : '-'}
                valueClass={stock.yearChange > 0 ? 'text-red-500' : stock.yearChange < 0 ? 'text-green-600' : ''} />
            </div>
          </div>

          {/* EPS预测 */}
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">分析师一致预期 EPS</div>
            <div className="grid grid-cols-3 gap-3">
              <DataItem label="2026E" value={fmt(stock.eps2026)} unit="元" />
              <DataItem label="2027E" value={fmt(stock.eps2027)} unit="元" />
              <DataItem label="2028E" value={fmt(stock.eps2028)} unit="元" />
            </div>
          </div>

          {/* PEG核心指标 */}
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">PEG 核心指标</div>
            <div className="grid grid-cols-3 gap-3">
              <DataItem label="景气指数" value={String(stock.prosperityIndex)} />
              <DataItem label="CAGR(E)" value={fmtPct(stock.cagr)} />
              <DataItem label="前瞻PE" value={fmt(stock.pe, 1)} />
              <DataItem label="机构预期PEG" value={fmt(stock.pegCar, 4)}
                valueClass={stock.pegCar ? pegColor(stock.pegCar) : ''} />
              <DataItem label="PEG(E) 公式" value={fmt(calc.peg, 4)}
                valueClass={pegColor(calc.peg)} />
              <DataItem label="安全系数" value={fmt(safetyPct, 1) + '%'}
                valueClass={safetyColor(safetyPct)} />
            </div>
          </div>

          {/* 估值价格 */}
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">估值价格</div>
            <div className="grid grid-cols-2 gap-3">
              <DataItem label="理想买点" value={fmt(calc.idealBuyPoint)} unit="元"
                valueClass="text-green-700 font-semibold" />
              <DataItem label="合理价位" value={fmt(calc.fairValue)} unit="元" />
              <DataItem label="减仓价位" value={fmt(calc.reducePosition)} unit="元"
                valueClass="text-amber-600" />
              <DataItem label="1年内卖点" value={fmt(calc.oneYearSellPoint)} unit="元"
                valueClass="text-red-500" />
            </div>
          </div>

          {/* 3年后理想估值 */}
          <div className="bg-blue-50 rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-gray-600">3年后理想估值</span>
            <span className="text-lg font-bold text-blue-700">
              {fmt(calc.threeYearValuation, 0)} 亿
            </span>
          </div>
        </div>

        <div className="px-5 pb-4 text-right">
          <span className="text-xs text-gray-400">更新日期：{stock.updateDate || '-'}</span>
        </div>
      </div>
    </div>
  );
}

function DataItem({ label, value, unit, valueClass }: { label: string; value: string; unit?: string; valueClass?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <div className="text-xs text-gray-400 mb-0.5">{label}</div>
      <div className={`text-sm font-medium ${valueClass || 'text-gray-800'}`}>
        {value}{unit && value !== '-' ? <span className="text-xs text-gray-400 ml-0.5">{unit}</span> : ''}
      </div>
    </div>
  );
}
