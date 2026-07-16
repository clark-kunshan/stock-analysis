import { useState, useCallback, useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage.ts';
import type { IndexValuation } from '../types/index.ts';
import { fetchIndexValuations, fetchCSIIndexQuote, fetchPush2HisQuote, fetchStockQuote, fetchYearChangeByKline, fetchIndexData } from '../api/stock.ts';

// 各指数历史10年平均PE（静态基准数据）
const AVG_PE_MAP: Record<string, { avgPE10Y: number; weight?: number }> = {
  '000001': { avgPE10Y: 14.13, weight: 0.9 },   // 上证指数
  '399001': { avgPE10Y: 26.83, weight: 1.25 },  // 深证成指
  '399006': { avgPE10Y: 49.61, weight: 1 },     // 创业板指
  'HSI':    { avgPE10Y: 10.53, weight: 1 },     // 恒生指数
  '000300': { avgPE10Y: 12.83, weight: 0.85 },  // 沪深300
  '000688': { avgPE10Y: 56.93, weight: 1 },     // 科创50
  '930050': { avgPE10Y: 16.26, weight: 0.85 },  // 中证A50
  '881001': { avgPE10Y: 18.9,  weight: 1 },     // wind全A
  '000905': { avgPE10Y: 22.15, weight: 1 },     // 中证500
  '000852': { avgPE10Y: 28.40, weight: 1 },     // 中证1000
  '513040': { avgPE10Y: 0,     weight: 1 },     // 港股通互联网ETF（PE需手动填写）
};

const DEFAULT_INDICES: IndexValuation[] = [
  { id: '1', indexName: '上证指数', indexCode: '000001', points: 0, yearChange: 0, currentPE: 0, avgPE10Y: 14.13, percentile10Y: 0, weight: 0.9 },
  { id: '2', indexName: '深证成指', indexCode: '399001', points: 0, yearChange: 0, currentPE: 0, avgPE10Y: 26.83, percentile10Y: 0, weight: 1.25 },
  { id: '3', indexName: '创业板指', indexCode: '399006', points: 0, yearChange: 0, currentPE: 0, avgPE10Y: 49.61, percentile10Y: 0, weight: 1 },
  { id: '4', indexName: '恒生指数', indexCode: 'HSI', points: 0, yearChange: 0, currentPE: 0, avgPE10Y: 10.53, percentile10Y: 0, weight: 1 },
  { id: '5', indexName: '沪深300', indexCode: '000300', points: 0, yearChange: 0, currentPE: 0, avgPE10Y: 12.83, percentile10Y: 0, weight: 0.85 },
  { id: '6', indexName: '科创50', indexCode: '000688', points: 0, yearChange: 0, currentPE: 0, avgPE10Y: 56.93, percentile10Y: 0, weight: 1 },
  { id: '7', indexName: '中证A50', indexCode: '930050', points: 0, yearChange: 0, currentPE: 0, avgPE10Y: 16.26, percentile10Y: 0, weight: 0.85 },
  { id: '8', indexName: 'wind全A', indexCode: '881001', points: 0, yearChange: 0, currentPE: 0, avgPE10Y: 18.9, percentile10Y: 0, weight: 1 },
  { id: '9', indexName: '中证500', indexCode: '000905', points: 0, yearChange: 0, currentPE: 0, avgPE10Y: 22.15, percentile10Y: 0, weight: 1 },
  { id: '10', indexName: '中证1000', indexCode: '000852', points: 0, yearChange: 0, currentPE: 0, avgPE10Y: 28.40, percentile10Y: 0, weight: 1 },
  { id: '11', indexName: '港股通互联网ETF', indexCode: '513040', points: 0, yearChange: 0, currentPE: 0, avgPE10Y: 0, percentile10Y: 0, weight: 1 },
  { id: '12', indexName: '港股创新药', indexCode: '513120', points: 0, yearChange: 0, currentPE: 0, avgPE10Y: 0, percentile10Y: 0, weight: 1 },
];

export function useIndexValuation() {
  const [indices, setIndices] = useLocalStorage<IndexValuation[]>('index-valuation', DEFAULT_INDICES);
  const [loading, setLoading] = useState(false);

  // 初始化时自动修正本地存储中的错误代码和数据
  useEffect(() => {
    setIndices(prev => {
      const updated = prev.map(idx => {
        let code = idx.indexCode?.trim() || '';
        // 所有非字母开头的数字指数代码应为6位数字
        if (code && /^[^A-Za-z]/.test(code) && code.length < 6) {
          code = code.replace(/[^0-9]/g, '').padStart(6, '0');
        }
        // 修复常见前缀错误：如 180905 应为 000905，180852 应为 000852
        const knownFix: Record<string, string> = { '180905': '000905', '180852': '000852' };
        if (knownFix[code]) code = knownFix[code];
        // 按代码自动补填 avgPE10Y、weight
        const ref = AVG_PE_MAP[code];
        return {
          ...idx,
          indexCode: code || idx.indexCode,
          avgPE10Y: idx.avgPE10Y || (ref?.avgPE10Y ?? 0),
          weight: idx.weight || (ref?.weight ?? 1),
        };
      });
      // 只有当数据真正发生变化时才更新，避免无限循环
      const changed = updated.some((u, i) =>
        u.indexCode !== prev[i]?.indexCode ||
        u.avgPE10Y !== prev[i]?.avgPE10Y ||
        u.weight !== prev[i]?.weight
      );
      return changed ? updated : prev;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshData = useCallback(async () => {
    setLoading(true);
    let updated = [...indices];

    // 自动修正常见录入错误
    updated = updated.map(idx => {
      let code = idx.indexCode?.trim() || '';
      // 所有非字母开头的数字指数代码应为6位数字
      if (code && /^[^A-Za-z]/.test(code) && code.length < 6) {
        code = code.replace(/[^0-9]/g, '').padStart(6, '0');
      }
      // 修复常见前缀错误：如 180905 应为 000905，180852 应为 000852
      const knownFix: Record<string, string> = { '180905': '000905', '180852': '000852' };
      if (knownFix[code]) code = knownFix[code];
      // 按代码自动补填 avgPE10Y、weight
      const ref = AVG_PE_MAP[code];
      return {
        ...idx,
        indexCode: code || idx.indexCode,
        avgPE10Y: idx.avgPE10Y || (ref?.avgPE10Y ?? 0),
        weight: idx.weight || (ref?.weight ?? 1),
      };
    });
  
    try {
      // 并行获取蛋卷估值数据（PE + 百分位）
      const danjuanData = await fetchIndexValuations();
  
      // 并行获取各指数行情（点位、涨幅、PE）
      const quotePromises = updated.map(async (idx) => {
        const code = idx.indexCode;
        if (!code) return { csi: null, push2his: null, em: null, etf: null };
  
        // 并行调用所有可能的数据源
        const [csi, push2his, em] = await Promise.all([
          fetchCSIIndexQuote(code),
          fetchPush2HisQuote(code),
          fetchIndexData(code),
        ]);

        // 为 ETF（5 开头 6 位代码）单独获取行情
        let etf = null;
        const isETF = /^5\d{5}$/.test(code);
        if (isETF) {
          try {
            const quote = await fetchStockQuote(code);
            if (quote && quote.price > 0) {
              const yearChange = await fetchYearChangeByKline(code, quote.price);
              etf = { points: quote.price, yearChange };
            }
          } catch (e) {
            console.error('获取ETF行情失败:', code, e);
          }
        }
  
        return { csi, push2his, em, etf };
      });
      const quoteResults = await Promise.all(quotePromises);
  
      for (let i = 0; i < updated.length; i++) {
        const code = updated[i].indexCode;
        if (!code) continue;

        const { csi, push2his, em, etf } = quoteResults[i];

        // 点位优先级：csi > push2his > em > etf
        const points = csi?.points || push2his?.points || em?.points || etf?.points || updated[i].points;
        
        // 年内涨幅优先级：csi > push2his > em > etf
        // 注意：push2his 和 em 返回的 yearChange 实际是当日涨跌幅，优先用 csi 或 etf 的
        const yearChange = csi?.yearChange || etf?.yearChange || push2his?.yearChange || em?.yearChange || updated[i].yearChange;
        
        // PE 优先级：蛋卷 > csi > em（东方财富）
        const pe = csi?.pe || em?.pe || updated[i].currentPE;

        updated[i] = {
          ...updated[i],
          points,
          yearChange,
          currentPE: pe,
        };

        // 从蛋卷基金API更新PE和百分位（覆盖 CSI 的 PE，因为蛋卷更权威）
        const dj = danjuanData.get(code);
        if (dj) {
          updated[i] = {
            ...updated[i],
            currentPE: dj.pe || updated[i].currentPE,
            percentile10Y: dj.pePercentile || updated[i].percentile10Y,
          };
        }
      }
    } catch (e) {
      console.error('刷新指数数据失败:', e);
    }
  
    setIndices(updated);
    setLoading(false);
  }, [indices, setIndices]);

  const updateIndex = useCallback((id: string, field: keyof IndexValuation, value: any) => {
    setIndices(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }, [setIndices]);

  const importIndices = useCallback((data: Partial<IndexValuation>[]) => {
    const imported: IndexValuation[] = data.map((d, i) => ({
      id: String(Date.now() + i),
      indexName: d.indexName || '', indexCode: d.indexCode || '',
      points: d.points || 0, yearChange: d.yearChange || 0,
      currentPE: d.currentPE || 0, avgPE10Y: d.avgPE10Y || 0,
      percentile10Y: d.percentile10Y || 0, weight: d.weight || 1,
    }));
    setIndices(imported);
  }, [setIndices]);

  const addIndex = useCallback(() => {
    const newId = String(Date.now());
    setIndices(prev => [...prev, {
      id: newId, indexName: '', indexCode: '', points: 0, yearChange: 0,
      currentPE: 0, avgPE10Y: 0, percentile10Y: 0, weight: 1,
    }]);
  }, [setIndices]);

  const removeIndex = useCallback((id: string) => {
    setIndices(prev => prev.filter(s => s.id !== id));
  }, [setIndices]);

  return { indices, loading, refreshData, updateIndex, addIndex, removeIndex, importIndices };
}
