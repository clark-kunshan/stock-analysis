import { useMemo } from 'react';
import type { PEGStock } from '../types/peg.ts';
import { getIndustryInsights, type IndustryInsight } from '../utils/formulas.ts';

interface IndustryInsightPanelProps {
  stocks: PEGStock[];
}

function IndustryCard({ insight }: { insight: IndustryInsight }) {
  const isBoom = insight.status === 'boom';
  const isRecession = insight.status === 'recession';

  return (
    <div className={`rounded-xl p-4 border-2 ${
      isBoom ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white' :
      isRecession ? 'border-red-200 bg-gradient-to-br from-red-50 to-white' :
      'border-blue-200 bg-gradient-to-br from-blue-50 to-white'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-lg font-bold ${
          isBoom ? 'text-emerald-800' :
          isRecession ? 'text-red-800' : 'text-blue-800'
        }`}>
          {insight.industry}
          <span className="ml-2 text-xs font-normal text-gray-500">({insight.stockCount}只)</span>
        </h3>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${insight.statusColor}`}>
          {insight.statusText}
        </span>
      </div>

      <div className="flex items-end gap-2 mb-3">
        <span className={`text-3xl font-bold ${
          isBoom ? 'text-emerald-600' :
          isRecession ? 'text-red-600' : 'text-blue-600'
        }`}>
          {insight.compositeScore}
        </span>
        <span className="text-gray-500 text-sm pb-1">综合评分</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm mb-3">
        <div className="bg-white/60 rounded-lg p-2">
          <div className="text-gray-500 text-xs">景气指数</div>
          <div className="font-semibold text-gray-800">{insight.avgProsperityIndex}</div>
        </div>
        <div className="bg-white/60 rounded-lg p-2">
          <div className="text-gray-500 text-xs">安全系数</div>
          <div className={`font-semibold ${insight.avgSafetyFactor > 0.5 ? 'text-emerald-600' : 'text-amber-600'}`}>
            {insight.avgSafetyFactor.toFixed(2)}
          </div>
        </div>
        <div className="bg-white/60 rounded-lg p-2">
          <div className="text-gray-500 text-xs">基本面</div>
          <div className={`font-semibold ${insight.avgFundamentalScore > 60 ? 'text-emerald-600' : 'text-amber-600'}`}>
            {insight.avgFundamentalScore}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm mb-3">
        <div className="bg-white/60 rounded-lg p-2">
          <div className="text-gray-500 text-xs">技术面</div>
          <div className={`font-semibold ${insight.avgTechStrength > 60 ? 'text-emerald-600' : 'text-amber-600'}`}>
            {insight.avgTechStrength}
          </div>
        </div>
        <div className="bg-white/60 rounded-lg p-2">
          <div className="text-gray-500 text-xs">年内涨幅</div>
          <div className={`font-semibold ${insight.avgYearChange > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {insight.avgYearChange > 0 ? '+' : ''}{insight.avgYearChange}%
          </div>
        </div>
        <div className="bg-white/60 rounded-lg p-2">
          <div className="text-gray-500 text-xs">买入占比</div>
          <div className="font-semibold text-red-600">{insight.buyRatio}%</div>
        </div>
      </div>

      {insight.topStocks.length > 0 && (
        <div className="border-t pt-3">
          <div className="text-gray-500 text-xs mb-2">代表性股票（按安全系数）</div>
          <div className="space-y-1">
            {insight.topStocks.map(stock => (
              <div key={stock.stockCode} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 truncate max-w-[120px]">{stock.company}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  stock.actionSignal === '买入' ? 'bg-red-100 text-red-700' :
                  stock.actionSignal === '卖出' ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {stock.actionSignal}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function IndustryInsightPanel({ stocks }: IndustryInsightPanelProps) {
  const insights = useMemo(() => getIndustryInsights(stocks), [stocks]);

  const boomInsights = insights.filter(i => i.status === 'boom');
  const neutralInsights = insights.filter(i => i.status === 'neutral');
  const recessionInsights = insights.filter(i => i.status === 'recession');

  return (
    <div className="bg-white rounded-lg shadow p-6 mt-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">📊 行业洞察</h2>
          <p className="text-gray-500 text-sm mt-1">
            基于表格数据自动分析各行业景气周期，帮助您把握投资方向
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>景气
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-blue-500"></span>中性
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-red-500"></span>衰退
          </span>
        </div>
      </div>

      {insights.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-2">📈</div>
          <div>暂无股票数据进行行业分析</div>
          <div className="text-sm mt-1">请在上方表格中添加股票，并在「看点」列填写行业名称（如：电力、互联网、医药等）</div>
        </div>
      ) : (
        <>
          {boomInsights.length > 0 && (
            <div className="mb-6">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-emerald-800 mb-3">
                <span>🚀</span> 景气行业（建议关注）
              </h3>
              <p className="text-emerald-600 text-sm mb-3">
                综合评分≥65分，具备较好投资价值
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {boomInsights.map(insight => (
                  <IndustryCard key={insight.industry} insight={insight} />
                ))}
              </div>
            </div>
          )}

          {neutralInsights.length > 0 && (
            <div className="mb-6">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-blue-800 mb-3">
                <span>⚖️</span> 中性行业（谨慎观望）
              </h3>
              <p className="text-blue-600 text-sm mb-3">
                综合评分45-64分，需进一步观察基本面和技术面
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {neutralInsights.map(insight => (
                  <IndustryCard key={insight.industry} insight={insight} />
                ))}
              </div>
            </div>
          )}

          {recessionInsights.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold text-red-800 mb-3">
                <span>⚠️</span> 衰退行业（规避风险）
              </h3>
              <p className="text-red-600 text-sm mb-3">
                综合评分低于45分，建议暂时避开或减仓
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recessionInsights.map(insight => (
                  <IndustryCard key={insight.industry} insight={insight} />
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
            <h4 className="font-semibold text-gray-800 mb-2">💡 评分说明</h4>
            <ul className="space-y-1">
              <li>• <strong>景气指数(25%)</strong>：行业整体景气度预期</li>
              <li>• <strong>安全系数(20%)</strong>：估值安全边际，越高越安全</li>
              <li>• <strong>基本面(25%)</strong>：ROE、毛利率、负债率、商誉减值等综合评分</li>
              <li>• <strong>技术面(15%)</strong>：K线图入场信号强度</li>
              <li>• <strong>年内涨幅(15%)</strong>：股价动量表现</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
