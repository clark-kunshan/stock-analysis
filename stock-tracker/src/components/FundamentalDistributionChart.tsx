import { useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import type { PEGStock } from '../types/peg.ts';
import { getFundamentalScore } from '../utils/formulas.ts';

interface FundamentalDistributionChartProps {
  stocks: PEGStock[];
}

interface HistogramData {
  score: string;
  count: number;
  percent: number;
  stocks: PEGStock[];
}

interface NormalCurveData {
  score: number;
  value: number;
}

function getScoreColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

export function FundamentalDistributionChart({ stocks }: FundamentalDistributionChartProps) {
  const chartData = useMemo(() => {
    const scores = stocks
      .filter(s => s.currentPrice && s.stockCode)
      .map(s => getFundamentalScore(s).total)
      .filter(score => score > 0);

    if (scores.length === 0) return { histogram: [], normalCurve: [], mean: 0, stdDev: 0, count: 0 };

    const count = scores.length;
    const mean = scores.reduce((a, b) => a + b, 0) / count;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    const bins = 20;
    const minScore = Math.floor(Math.min(...scores) / 5) * 5;
    const maxScore = Math.ceil(Math.max(...scores) / 5) * 5;
    const binWidth = (maxScore - minScore) / bins;

    const stockScores = stocks
      .filter(s => s.currentPrice && s.stockCode)
      .map(s => ({ stock: s, score: getFundamentalScore(s).total }))
      .filter(s => s.score > 0);

    const histogram: HistogramData[] = [];
    for (let i = 0; i < bins; i++) {
      const start = minScore + i * binWidth;
      const end = start + binWidth;
      const binStocks = stockScores.filter(s => s.score >= start && s.score < end).map(s => s.stock);
      histogram.push({
        score: `${Math.round(start)}-${Math.round(end)}`,
        count: binStocks.length,
        percent: binStocks.length > 0 ? Math.round((binStocks.length / count) * 100) : 0,
        stocks: binStocks,
      });
    }

    const normalCurve: NormalCurveData[] = [];
    const curvePoints = 100;
    for (let i = 0; i <= curvePoints; i++) {
      const score = minScore + (i / curvePoints) * (maxScore - minScore);
      const exponent = -0.5 * Math.pow((score - mean) / stdDev, 2);
      const value = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(exponent);
      normalCurve.push({ score, value });
    }

    const maxCurveValue = Math.max(...normalCurve.map(c => c.value));
    const maxCount = Math.max(...histogram.map(h => h.count));
    normalCurve.forEach(c => {
      c.value = (c.value / maxCurveValue) * maxCount * 0.95;
    });

    return { histogram, normalCurve, mean, stdDev, count };
  }, [stocks]);

  const { histogram, normalCurve, mean, stdDev, count } = chartData;

  if (count === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 mt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          基本面评分正态分布图
        </h3>
        <p className="text-gray-400 text-sm text-center py-8">
          暂无数据，请先刷新行情获取财务数据
        </p>
      </div>
    );
  }

  const oneStdDevAbove = mean + stdDev;
  const oneStdDevBelow = mean - stdDev;
  const twoStdDevAbove = mean + 2 * stdDev;
  const twoStdDevBelow = mean - 2 * stdDev;

  return (
    <div className="bg-white rounded-lg shadow p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          基本面评分正态分布图
          <span className="text-xs font-normal text-gray-400 ml-2">
            （共 {count} 只股票）
          </span>
        </h3>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: '#22c55e' }} />
            优秀(&ge;70)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: '#f59e0b' }} />
            一般(50-70)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: '#ef4444' }} />
            较差(&lt;50)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">均值</div>
          <div className="text-lg font-bold text-blue-600">{mean.toFixed(1)}</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">标准差</div>
          <div className="text-lg font-bold text-purple-600">{stdDev.toFixed(1)}</div>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">优秀率</div>
          <div className="text-lg font-bold text-green-600">
            {Math.round((histogram.filter(h => parseInt(h.score) >= 70).reduce((a, b) => a + b.count, 0) / count) * 100)}%
          </div>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">较差率</div>
          <div className="text-lg font-bold text-red-600">
            {Math.round((histogram.filter(h => parseInt(h.score) < 50).reduce((a, b) => a + b.count, 0) / count) * 100)}%
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={histogram}
          margin={{ top: 10, right: 20, left: 10, bottom: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="score"
            fontSize={10}
            angle={-45}
            textAnchor="end"
            height={60}
            tickLine={false}
            interval={0}
          />
          <YAxis
            domain={[0, 'auto']}
            fontSize={11}
            width={40}
          />
          <ReferenceLine y={0} stroke="#e2e8f0" />
          <ReferenceLine x={mean} stroke="#8b5cf6" strokeDasharray="5 5" label={{ value: `均值 ${mean.toFixed(1)}`, position: 'top', fontSize: 10, fill: '#8b5cf6' }} />
          <ReferenceLine x={oneStdDevAbove} stroke="#f59e0b" strokeDasharray="3 3" />
          <ReferenceLine x={oneStdDevBelow} stroke="#f59e0b" strokeDasharray="3 3" />
          <Tooltip
            contentStyle={{ fontSize: 11, maxHeight: '300px', overflowY: 'auto', padding: '8px' }}
            content={({ payload }: any) => {
              const d: HistogramData = payload && payload[0] ? payload[0].payload : null;
              if (!d || d.count === 0) return null;
              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[250px]">
                  <div className="font-semibold text-gray-800 mb-2">
                    评分区间: {d.score}
                  </div>
                  <div className="text-sm text-gray-600 mb-3">
                    {d.count} 只股票 ({d.percent}%)
                  </div>
                  <div className="space-y-1">
                    {d.stocks.slice(0, 10).map((stock) => {
                      const score = getFundamentalScore(stock).total;
                      return (
                        <div key={stock.id} className="flex items-center justify-between text-xs py-1 border-b border-gray-100 last:border-0">
                          <span className="text-gray-700 truncate max-w-[180px]">{stock.company}</span>
                          <span className={`font-semibold ${getScoreColor(score) === '#22c55e' ? 'text-green-600' : getScoreColor(score) === '#f59e0b' ? 'text-amber-600' : 'text-red-600'}`}>
                            {score.toFixed(1)}
                          </span>
                        </div>
                      );
                    })}
                    {d.stocks.length > 10 && (
                      <div className="text-xs text-gray-400 text-center py-1">
                        ... 还有 {d.stocks.length - 10} 只股票
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          />
          <Bar dataKey="count" radius={[2, 2, 0, 0]} barSize={20}>
            {histogram.map((entry, index) => (
              <Cell key={index} fill={getScoreColor(parseInt(entry.score))} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 p-3 bg-slate-50 rounded-lg">
        <div className="flex items-center justify-center gap-6 text-xs text-gray-600">
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-purple-500 mr-1" />
            均值: {mean.toFixed(1)}
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />
            ±1σ: ({oneStdDevBelow.toFixed(1)}, {oneStdDevAbove.toFixed(1)})
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />
            ±2σ: ({twoStdDevBelow.toFixed(1)}, {twoStdDevAbove.toFixed(1)})
          </span>
        </div>
      </div>
    </div>
  );
}
