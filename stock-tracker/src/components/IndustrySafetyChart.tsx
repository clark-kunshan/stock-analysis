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
import { calcPEGStock } from '../utils/formulas.ts';

interface IndustrySafetyChartProps {
  stocks: PEGStock[];
}

interface IndustryData {
  industry: string;
  avgSafety: number;       // 平均安全系数 (百分比)
  count: number;           // 股票数量
  minSafety: number;
  maxSafety: number;
}

function getColor(avgSafety: number): string {
  if (avgSafety >= 100) return '#ef4444';   // red - 高估
  if (avgSafety >= 70) return '#f59e0b';    // amber - 合理偏高
  return '#22c55e';                          // green - 低估/安全
}

// 排除的行业关键词（周期股、银行、地产、亏损等）
const EXCLUDED_INDUSTRY_KEYWORDS = [
  '煤炭', '焦煤', '贵铝', '白酒',
  '化工', '皮革', '纤维', '造纸', '橡胶',
  '航运', '运输', '港口',
  '银行', '信托', '保险Ⅱ', '证券Ⅱ', '期货',
  '房地产', '建筑', '房屋', '地产Ⅱ', '开发',
];

export function IndustrySafetyChart({ stocks }: IndustrySafetyChartProps) {
  const chartData = useMemo<IndustryData[]>(() => {
    // 过滤：1.有EPS数据（至少一个年度有数据）2.行业不属于排除关键词
    const validStocks = stocks.filter(s => {
      if (!s.highlight || !s.currentPrice) return false;
      const hasEPS = (s.eps2026 && s.eps2026 > 0) || (s.eps2027 && s.eps2027 > 0) || (s.eps2028 && s.eps2028 > 0);
      if (!hasEPS) return false;
      const isExcluded = EXCLUDED_INDUSTRY_KEYWORDS.some(kw => s.highlight.includes(kw));
      return !isExcluded;
    });

    // 按行业分组
    const industryMap = new Map<string, number[]>();
    validStocks.forEach(stock => {
      const industry = stock.highlight;
      if (!industry || !stock.currentPrice) return;
      const calc = calcPEGStock(stock);
      const safetyPct = calc.safetyFactor * 100;
      const list = industryMap.get(industry) || [];
      list.push(safetyPct);
      industryMap.set(industry, list);
    });

    // 计算每个行业的平均安全系数
    const data: IndustryData[] = [];
    industryMap.forEach((values, industry) => {
      if (values.length === 0) return;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      data.push({
        industry,
        avgSafety: Math.round(avg * 10) / 10,
        count: values.length,
        minSafety: Math.round(Math.min(...values) * 10) / 10,
        maxSafety: Math.round(Math.max(...values) * 10) / 10,
      });
    });

    // 按平均安全系数从高到低排序
    data.sort((a, b) => b.avgSafety - a.avgSafety);
    return data;
  }, [stocks]);

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 mt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          安全系数 vs 行业分布图
        </h3>
        <p className="text-gray-400 text-sm text-center py-8">
          暂无行业数据，请先导入股票并点击"更新行业"
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          安全系数 vs 行业分布图
          <span className="text-xs font-normal text-gray-400 ml-2">
            （共 {chartData.length} 个行业，{stocks.filter(s => s.highlight && ((s.eps2026 && s.eps2026 > 0) || (s.eps2027 && s.eps2027 > 0) || (s.eps2028 && s.eps2028 > 0)) && !EXCLUDED_INDUSTRY_KEYWORDS.some(kw => s.highlight.includes(kw))).length} 只股票）
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
