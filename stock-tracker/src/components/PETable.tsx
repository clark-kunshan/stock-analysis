import type { PEStock } from '../types/pe.ts';
import { calcPEStock, formatNumber, getValuationColor } from '../utils/formulas.ts';
import { EditableCell } from './EditableCell.tsx';

interface PETableProps {
  stocks: PEStock[];
  onUpdate: (id: string, field: keyof PEStock, value: any) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

export function PETable({ stocks, onUpdate, onAdd, onRemove }: PETableProps) {
  return (
    <div className="table-container">
      <table className="stock-table">
        <thead>
          <tr>
            <th>分类</th>
            <th>股票代码</th>
            <th>股票名称</th>
            <th>核心竞争力</th>
            <th>预估未来3年<br/>每股平均收益</th>
            <th>PE估值<br/>区间(低)</th>
            <th>PE估值<br/>区间(高)</th>
            <th>加仓点</th>
            <th>减仓点</th>
            <th>竞争力<br/>评分</th>
            <th>总股本<br/>(亿)</th>
            <th>收盘价</th>
            <th>当前评级</th>
            <th>更新时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map(stock => {
            const calc = calcPEStock(stock);
            return (
              <tr key={stock.id}>
                {/* A: 分类 */}
                <EditableCell
                  value={stock.category}
                  onChange={v => onUpdate(stock.id, 'category', v)}
                />
                {/* B: 股票代码 */}
                <EditableCell
                  value={stock.stockCode}
                  onChange={v => onUpdate(stock.id, 'stockCode', v)}
                />
                {/* C: 股票名称 */}
                <EditableCell
                  value={stock.stockName}
                  onChange={v => onUpdate(stock.id, 'stockName', v)}
                  className="font-medium"
                />
                {/* D: 核心竞争力 */}
                <EditableCell
                  value={stock.coreCompetitiveness}
                  onChange={v => onUpdate(stock.id, 'coreCompetitiveness', v)}
                  className="text-left text-xs max-w-48 truncate"
                />
                {/* E: 预估EPS */}
                <EditableCell
                  value={stock.avgEPS || ''}
                  onChange={v => onUpdate(stock.id, 'avgEPS', v)}
                  type="number"
                />
                {/* F: PE(低) */}
                <EditableCell
                  value={stock.peLow || ''}
                  onChange={v => onUpdate(stock.id, 'peLow', v)}
                  type="number"
                />
                {/* G: PE(高) */}
                <EditableCell
                  value={stock.peHigh || ''}
                  onChange={v => onUpdate(stock.id, 'peHigh', v)}
                  type="number"
                />
                {/* H: 加仓点 = E*F */}
                <td className="formula-cell text-blue-700">
                  {calc.buyPoint ? formatNumber(calc.buyPoint) : '-'}
                </td>
                {/* I: 减仓点 = E*G */}
                <td className="formula-cell text-red-600">
                  {calc.sellPoint ? formatNumber(calc.sellPoint) : '-'}
                </td>
                {/* J: 竞争力评分 */}
                <EditableCell
                  value={stock.competitivenessScore || ''}
                  onChange={v => onUpdate(stock.id, 'competitivenessScore', v)}
                  type="number"
                />
                {/* K: 总股本 */}
                <EditableCell
                  value={stock.totalShares || ''}
                  onChange={v => onUpdate(stock.id, 'totalShares', v)}
                  type="number"
                />
                {/* L: 收盘价 */}
                <td className="font-medium">
                  {stock.closingPrice ? formatNumber(stock.closingPrice) : '-'}
                </td>
                {/* M: 当前评级 */}
                <td className={`font-semibold ${getValuationColor(
                  calc.rating === '严重低估' ? '低估' : calc.rating === '严重高估' ? '高估' : calc.rating
                )}`}>
                  <span className={`${getValuationColor(
                    calc.rating === '严重低估' ? '低估' : calc.rating === '严重高估' ? '高估' : calc.rating
                  ).replace('valuation-', 'text-').replace('fair', 'green-600').replace('low', 'blue-600').replace('high', 'orange-600').replace('severe-high', 'red-600').replace('severe-low', 'indigo-600')}`}>
                    {stock.closingPrice ? calc.rating : '-'}
                  </span>
                </td>
                {/* N: 更新时间 */}
                <td className="text-xs text-gray-500">{stock.updateTime || '-'}</td>
                {/* 操作 */}
                <td>
                  <button
                    onClick={() => onRemove(stock.id)}
                    className="text-red-400 hover:text-red-600 text-xs"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="p-3 border-t bg-gray-50">
        <button
          onClick={onAdd}
          className="px-4 py-1.5 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
        >
          + 添加股票
        </button>
        <span className="ml-4 text-xs text-gray-500">
          评级规则：收盘价 ≤ 加仓点 → 低估，≥ 减仓点 → 高估，中间 → 合理
        </span>
      </div>
    </div>
  );
}
