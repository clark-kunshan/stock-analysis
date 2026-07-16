/**
 * 批量获取前瞻PE + 3年预测EPS（分析师一致预期均值）
 * 数据源：东方财富 F10 盈利预测 PageAjax
 */

export interface ForwardPEResult {
  pe: number;         // 前瞻PE = 当前股价 / 最近未来年度EPS均值
  eps2026: number;    // 2026年预测EPS均值（无数据则为0）
  eps2027: number;    // 2027年预测EPS均值
  eps2028: number;    // 2028年预测EPS均值
}

/** 从 jgyc 数据中提取指定年份的EPS均值，无数据返回0 */
function extractAvgEPS(jgyc: any[], targetYear: number): number {
  const values: number[] = [];
  for (const item of jgyc) {
    for (const slot of ['2', '3', '4']) {
      const year = item[`YEAR${slot}`];
      const eps = item[`EPS${slot}`];
      if (year === targetYear && typeof eps === 'number' && eps !== 0) {
        values.push(eps);
      }
    }
  }
  if (values.length === 0) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(avg * 100) / 100;
}

export async function fetchBatchForwardPE(
  stocks: Array<{ stockCode: string; currentPrice: number }>,
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, ForwardPEResult>> {
  const result = new Map<string, ForwardPEResult>();
  const thisYear = new Date().getFullYear();

  // 分批并发：每批15只同时请求，大幅减少1000只股票的总耗时
  const CONCURRENCY = 15;
  const validStocks = stocks.filter(s => s.stockCode);
  let completed = 0;

  for (let i = 0; i < validStocks.length; i += CONCURRENCY) {
    const batch = validStocks.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.allSettled(batch.map(async ({ stockCode, currentPrice }) => {
      const market = stockCode.startsWith('6') ? 'SH' : 'SZ';
      const url = `/api/emweb/PC_HSF10/ProfitForecast/PageAjax?code=${market}${stockCode}`;
      const resp = await fetch(url);
      const data = await resp.json();

      const jgyc: any[] = data?.jgyc || [];
      const eps2026 = extractAvgEPS(jgyc, 2026);
      const eps2027 = extractAvgEPS(jgyc, 2027);
      const eps2028 = extractAvgEPS(jgyc, 2028);

      // 前瞻PE：优先用当前年/次年/再次年的EPS
      let forwardEPS = 0;
      for (const yearOffset of [0, 1, 2]) {
        const checkYear = thisYear + yearOffset;
        const eps = extractAvgEPS(jgyc, checkYear);
        if (eps > 0) { forwardEPS = eps; break; }
      }

      // PE计算需要currentPrice，但EPS不需要——即使价格为0也保存EPS数据
      const pe = (forwardEPS > 0 && currentPrice > 0)
        ? Math.round(currentPrice / forwardEPS * 10) / 10
        : 0;

      return { stockCode, pe, eps2026, eps2027, eps2028 };
    }));

    for (const r of batchResults) {
      completed++;
      if (r.status === 'fulfilled') {
        const { stockCode, ...rest } = r.value;
        result.set(stockCode, rest);
      }
      onProgress?.(completed + (stocks.length - validStocks.length), stocks.length);
    }
  }

  console.log(`成功获取 ${result.size} 只股票的前瞻PE和EPS数据`);
  return result;
}
