import { useState, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage.ts';
import type { PEStock } from '../types/pe.ts';
import { fetchStockQuote } from '../api/stock.ts';

const DEFAULT_PE_STOCKS: PEStock[] = [
  { id: '1', category: '酒', stockCode: '600519', stockName: '贵州茅台', coreCompetitiveness: '白酒龙头，酱香一哥、社交属性', avgEPS: 80, peLow: 15, peHigh: 35, competitivenessScore: 100, totalShares: 12.56, closingPrice: 0, updateTime: '' },
];

export function usePEStocks() {
  const [stocks, setStocks] = useLocalStorage<PEStock[]>('pe-stocks', DEFAULT_PE_STOCKS);
  const [loading, setLoading] = useState(false);

  const refreshQuotes = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const updated = [...stocks];
    
    for (let i = 0; i < updated.length; i++) {
      if (!updated[i].stockCode) continue;
      try {
        const quote = await fetchStockQuote(updated[i].stockCode);
        if (quote) {
          updated[i] = { ...updated[i], closingPrice: quote.price || updated[i].closingPrice, updateTime: today };
        }
      } catch (e) {
        console.error('刷新PE行情失败:', updated[i].stockCode, e);
      }
    }
    
    setStocks(updated);
    setLoading(false);
  }, [stocks, setStocks]);

  const updateStock = useCallback((id: string, field: keyof PEStock, value: any) => {
    setStocks(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }, [setStocks]);

  const addStock = useCallback(() => {
    const newId = String(Date.now());
    setStocks(prev => [...prev, {
      id: newId, category: '', stockCode: '', stockName: '', coreCompetitiveness: '',
      avgEPS: 0, peLow: 15, peHigh: 30, competitivenessScore: 50, totalShares: 0, closingPrice: 0, updateTime: '',
    }]);
  }, [setStocks]);

  const removeStock = useCallback((id: string) => {
    setStocks(prev => prev.filter(s => s.id !== id));
  }, [setStocks]);

  const importStocks = useCallback((data: Partial<PEStock>[]) => {
    const imported: PEStock[] = data.map((d, i) => ({
      id: String(Date.now() + i),
      category: d.category || '', stockCode: d.stockCode || '', stockName: d.stockName || '',
      coreCompetitiveness: d.coreCompetitiveness || '', avgEPS: d.avgEPS || 0,
      peLow: d.peLow || 15, peHigh: d.peHigh || 30, competitivenessScore: d.competitivenessScore || 50,
      totalShares: d.totalShares || 0, closingPrice: d.closingPrice || 0, updateTime: d.updateTime || '',
    }));
    setStocks(imported);
  }, [setStocks]);

  return { stocks, loading, refreshQuotes, updateStock, addStock, removeStock, importStocks };
}
