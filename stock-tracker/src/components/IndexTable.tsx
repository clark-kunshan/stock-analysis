import type { IndexValuation } from '../types/index.ts';
import { calcIndexValuation, formatNumber, getValuationColor } from '../utils/formulas.ts';
import { EditableCell } from './EditableCell.tsx';

interface IndexTableProps {
  indices: IndexValuation[];
  onUpdate: (id: string, field: keyof IndexValuation, value: any) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

export function IndexTable({ indices, onUpdate, onAdd, onRemove }: IndexTableProps) {
  return (
    <div className="table-container">
      <div className="p-4 max-w-5xl mx-auto">
        <h2 className="text-lg font-bold text-gray-800 mb-1">
          主要指数及ETF估值 ( 统计日期：{new Date().toISOString().slice(0, 10)}）
        </h2>
        <table className="stock-table mt-3">
          <thead>
            <tr>
              <th>主要指数</th>
              <th>指数代码</th>
              <th>点位</th>
              <th>年内涨幅<br/>(%)</th>
              <th>当前(TTM)<br/>市盈率</th>
              <th>10年平均<br/>市盈率</th>
              <th>10年分位点<br/>(%)</th>
              <th>修正后<br/>分位点</th>
              <th>估值</th>
              <th>加权</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {indices.map(idx => {
              const calc = calcIndexValuation(idx);
              return (
                <tr key={idx.id}>
                  {/* A: 指数名称 */}
                  <EditableCell
                    value={idx.indexName || ''}
                    onChange={v => onUpdate(idx.id, 'indexName', v)}
                    type="text"
                    className="font-medium text-left pl-4"
                    title="指数名称"
                  />
                  {/* A2: 指数代码 */}
                  <EditableCell
                    value={idx.indexCode || ''}
                    onChange={v => onUpdate(idx.id, 'indexCode', v)}
                    type="text"
                    className="text-gray-500 text-xs"
                    title="指数代码，用于自动获取行情"
                  />
                  {/* B: 点位 */}
                  <EditableCell
                    value={idx.points || ''}
                    onChange={v => onUpdate(idx.id, 'points', v)}
                    type="number"
                    title="点击可手动输入"
                  />
                  {/* C: 年内涨幅 */}
                  <EditableCell
                    value={idx.yearChange || ''}
                    onChange={v => onUpdate(idx.id, 'yearChange', v)}
                    type="number"
                    title="点击可手动输入"
                    className={idx.yearChange >= 0 ? 'text-red-600' : 'text-green-600'}
                  />
                  {/* D: 当前PE */}
                  <EditableCell
                    value={idx.currentPE || ''}
                    onChange={v => onUpdate(idx.id, 'currentPE', v)}
                    type="number"
                  />
                  {/* E: 10年平均PE */}
                  <EditableCell
                    value={idx.avgPE10Y || ''}
                    onChange={v => onUpdate(idx.id, 'avgPE10Y', v)}
                    type="number"
                  />
                  {/* F: 10年分位点 */}
                  <EditableCell
                    value={idx.percentile10Y || ''}
                    onChange={v => onUpdate(idx.id, 'percentile10Y', v)}
                    type="number"
                  />
                  {/* G: 修正后分位点 = F*I */}
                  <td className="formula-cell font-medium">
                    {idx.percentile10Y ? formatNumber(calc.adjustedPercentile) : '-'}
                  </td>
                  {/* H: 估值 */}
                  <td className={`font-bold ${getValuationColor(calc.valuation)}`}>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${getValuationColor(calc.valuation)}`}>
                      {idx.percentile10Y ? calc.valuation : '-'}
                    </span>
                  </td>
                  {/* I: 加权 */}
                  <EditableCell
                    value={idx.weight || ''}
                    onChange={v => onUpdate(idx.id, 'weight', v)}
                    type="number"
                    title="修正系数：上证*90%，深证*125%，沪深300*85%，中证A50*85%"
                  />
                  {/* 操作 */}
                  <td className="text-center">
                    <button
                      onClick={() => onRemove(idx.id)}
                      className="text-red-400 hover:text-red-600 text-xs px-2 py-0.5 rounded hover:bg-red-50 transition-colors"
                      title="删除"
                    >
                      ×
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
            + 添加指数
          </button>
          <span className="ml-4 text-xs text-gray-500">
            添加后可填入指数代码，点击"刷新行情"获取实时数据
          </span>
        </div>

        {/* 说明 */}
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded text-xs text-gray-600 leading-relaxed">
          <p className="font-semibold text-gray-700 mb-1">※ 说明（十年分位点%）：</p>
          <p>≥90（严重高估），75-90（高估），25-75（合理），10-25（低估），≤10（严重低估）</p>
          <p className="mt-2 font-semibold text-gray-700">修正规则：</p>
          <p>① 上证指数分位×90%；② 深证成指分位×125%；③ 沪深300指数分位×85%；④ 中证A50指数分位×85%；其他保持不变。</p>
          <p className="mt-2 font-semibold text-gray-700">※ ETF定投建议：</p>
          <p>严重高估：无定投，保存现金 | 高估：定投25% | 合理：定投50% | 低估：定投75% | 严重低估：全仓买入</p>
        </div>
      </div>
    </div>
  );
}
