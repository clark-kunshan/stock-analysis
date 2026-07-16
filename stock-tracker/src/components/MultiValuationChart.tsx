import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import type { PEGStock } from '../types/peg.ts';
import type { ValuationResult } from '../types/valuation.ts';

interface StockWithResult {
  stock: PEGStock;
  result: ValuationResult;
}

interface IndustryData {
  industry: string;
  avgSafety: number;
  count: number;
  minSafety: number;
  maxSafety: number;
}

interface MultiValuationChartProps {
  data: StockWithResult[];
}

function getColor(avgSafety: number): string {
  if (avgSafety >= 100) return '#ef4444';   // red - 高估
  if (avgSafety >= 70) return '#f59e0b';    // amber - 合理偏高
  return '#22c55e';                          // green - 低估/安全
}

export function MultiValuationChart({ data }: MultiValuationChartProps) {
  const chartData = useMemo<IndustryData[]>(() => {
    const industryMap = new Map<string, number[]>();

    for (const { stock, result } of data) {
      if (!stock.highlight || !stock.currentPrice || result.safetyFactor <= 0) continue;
      const industry = stock.highlight;
      const list = industryMap.get(industry) || [];
      list.push(result.safetyFactor * 100);
      industryMap.set(industry, list);
    }

    const items: IndustryData[] = [];
    industryMap.forEach((values, industry) => {
      if (values.length === 0) return;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      items.push({
        industry,
        avgSafety: Math.round(avg * 10) / 10,
        count: values.length,
        minSafety: Math.round(Math.min(...values) * 10) / 10,
        maxSafety: Math.round(Math.max(...values) * 10) / 10,
      });
    });

    // 按平均安全系数从高到低排序
    items.sort((a, b) => b.avgSafety - a.avgSafety);
    return items;
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 mt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          行业 vs 平均安全系数
        </h3>
        <p className="text-gray-400 text-sm text-center py-8">
          暂无行业数据，请先导入股票并获取行情/财报数据
        </p>
      </div>
    );
  }

  const validCount = data.filter(d => d.result.safetyFactor > 0).length;

  return (
    <div className="bg-white rounded-lg shadow p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          行业 vs 平均安全系数
          <span className="text-xs font-normal text-gray-400 ml-2">
            （共 {chartData.length} 个行业，{validCount} 只股票）
          </span>
        </h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: '#22c55e' }} />
            低估(&lt;70%)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: '#f59e0b' }} />
            合理(70-100%)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: '#ef4444' }} />
            高估(&ge;100%)
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={460}>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 20, left: 10, bottom: 120 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="industry"
            fontSize={10}
            angle={-90}
            textAnchor="end"
            height={120}
            tickLine={false}
            interval={0}
          />
          <YAxis
            domain={[0, 'auto']}
            tickFormatter={v => `${v}%`}
            fontSize={11}
            width={45}
          />
          <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '安全线100%', position: 'right', fontSize: 10 }} />
          <Tooltip
            formatter={(value: any, _name: any, props: any) => {
              const d: IndustryData = props.payload;
              return [
                `平均: ${value}%  (${d.count}只) | 最低: ${d.minSafety}%  最高: ${d.maxSafety}%`,
                d.industry
              ];
            }}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="avgSafety" radius={[4, 4, 0, 0]} barSize={24}>
            {chartData.map((entry, index) => (
              <Cell key={index} fill={getColor(entry.avgSafety)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
