import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useLocalStorageWithFilter } from './useLocalStorage.ts';
import type { PEGStock } from '../types/peg.ts';
import { fetchBatchQuotes, fetchRecentKlines, fetchBatchPBPercentile, fetchBatchIndustry } from '../api/stock.ts';
import { fetchBatchFinancials } from '../api/financials.ts';
import { fetchBatchHolders } from '../api/holders.ts';
import { normalizeCAGR } from '../utils/formulas.ts';

export interface PEGGroup {
  name: string;
  stocks: PEGStock[];
}

const WATCHED_GROUP_NAME = '自选';

const DEFAULT_GROUP: PEGGroup = {
  name: WATCHED_GROUP_NAME,
  stocks: [
    { id: '1', company: '美的集团000333', stockCode: '000333', highlight: '', prosperityIndex: 110, currentPrice: 0, marketCap: 0, yearChange: 0, riskTracking: '', updateDate: '', cagr: 0.13, pe: 16 },
    { id: '2', company: '海尔智家600690', stockCode: '600690', highlight: '', prosperityIndex: 110, currentPrice: 0, marketCap: 0, yearChange: 0, riskTracking: '', updateDate: '', cagr: 0.15, pe: 14 },
    { id: '3', company: '中国平安601318', stockCode: '601318', highlight: '', prosperityIndex: 110, currentPrice: 0, marketCap: 0, yearChange: 0, riskTracking: '', updateDate: '', cagr: 0.10, pe: 10 },
    { id: '4', company: '长江电力600900', stockCode: '600900', highlight: '电力', prosperityIndex: 100, currentPrice: 27.05, marketCap: 6619, yearChange: 1.56, riskTracking: '', updateDate: '2026-07-06', cagr: 0.20, pe: 25, dps: 0.733, divYield: 2.71 },
    { id: '5', company: '牧原股份002714', stockCode: '002714', highlight: '', prosperityIndex: 110, currentPrice: 0, marketCap: 0, yearChange: 0, riskTracking: '', updateDate: '', cagr: 0.10, pe: 12 },
  ],
};

export function usePEGStocks() {
  const filterGroupsForStorage = useCallback((groups: PEGGroup[]): PEGGroup[] => {
    return groups.map(g => ({
      ...g,
      stocks: g.stocks.map(s => {
        const { recentKlines, ...rest } = s;
        return rest as PEGStock;
      }),
    }));
  }, []);

  const [groups, setGroups] = useLocalStorageWithFilter<PEGGroup[]>('peg-groups', [DEFAULT_GROUP], filterGroupsForStorage);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  // 迁移：首次加载时自动修正 CAGR 格式（>1 的百分比转为小数）
  useEffect(() => {
    setGroups(prev => {
      let changed = false;
      const next = prev.map(g => ({
        ...g,
        stocks: g.stocks.map(s => {
          const normalized = normalizeCAGR(s.cagr);
          if (normalized !== s.cagr) {
            changed = true;
            return { ...s, cagr: normalized };
          }
          return s;
        }),
      }));
      return changed ? next : prev;
    });
  }, []); // 仅首次加载执行

  // 迁移：自动补齐默认股票中缺失的默认值（解决 localStorage 旧数据缺少 dps/divYield 等问题）
  const DEFAULT_STOCK_MAP = new Map(DEFAULT_GROUP.stocks.map(s => [s.stockCode, s]));
  useEffect(() => {
    setGroups(prev => {
      let changed = false;
      const next = prev.map(g => ({
        ...g,
        stocks: g.stocks.map(s => {
          const defaults = DEFAULT_STOCK_MAP.get(s.stockCode);
          if (!defaults) return s;
          let patched = false;
          const merged = { ...s };
          for (const [key, val] of Object.entries(defaults)) {
            const k = key as keyof PEGStock;
            if (merged[k] === 0 || merged[k] === '' || merged[k] === undefined) {
              if (val !== 0 && val !== '' && val !== undefined) {
                (merged as any)[k] = val;
                patched = true;
              }
            }
          }
          if (patched) {
            changed = true;
            return merged as PEGStock;
          }
          return s;
        }),
      }));
      return changed ? next : prev;
    });
  }, []); // 仅首次加载执行

  // 确保 activeIdx 有效
  const safeIdx = Math.min(activeIdx, groups.length - 1);
  if (safeIdx !== activeIdx) {
    setTimeout(() => setActiveIdx(safeIdx), 0);
  }

  const activeGroup = groups[safeIdx];
  const stocks = activeGroup?.stocks ?? [];

  // 切换分组
  const setActiveGroup = useCallback((idx: number) => {
    setActiveIdx(Math.max(0, Math.min(idx, groups.length - 1)));
  }, [groups.length]);

  // 更新当前分组中的股票，同步到自选分组
  const updateStock = useCallback((id: string, field: keyof PEGStock, value: any) => {
    setGroups(prev => {
      const watchedIdx = prev.findIndex(g => g.name === WATCHED_GROUP_NAME);
      // 找到被更新股票的 stockCode（从当前分组查找）
      const sourceStock = prev[safeIdx]?.stocks.find(s => s.id === id);
      return prev.map((g, i) => {
        if (i === safeIdx) {
          return { ...g, stocks: g.stocks.map(s => s.id === id ? { ...s, [field]: value } : s) };
        }
        // 同步到自选分组（当前分组不是自选时才同步）
        if (i === watchedIdx && sourceStock && safeIdx !== watchedIdx) {
          return { ...g, stocks: g.stocks.map(s =>
            s.stockCode === sourceStock.stockCode ? { ...s, [field]: value } : s
          )};
        }
        return g;
      });
    });
  }, [safeIdx, setGroups]);

  const updatePosition = useCallback((stockCode: string, position: { positionQty: number; positionCost: number; positionDate: string }) => {
    setGroups(prev => prev.map(g => ({
      ...g,
      stocks: g.stocks.map(s =>
        s.stockCode === stockCode ? { ...s, ...position } : s
      ),
    })));
  }, [setGroups]);

  // 更新SWOT分析，跨所有分组同步
  const updateSwot = useCallback((stockCode: string, swot: NonNullable<PEGStock['swot']>) => {
    setGroups(prev => prev.map(g => ({
      ...g,
      stocks: g.stocks.map(s =>
        s.stockCode === stockCode ? { ...s, swot } : s
      ),
    })));
  }, [setGroups]);

  // 批量更新SWOT分析，只触发一次状态更新（避免循环调用导致的性能问题）
  const batchUpdateSwot = useCallback((updates: { stockCode: string; swot: NonNullable<PEGStock['swot']> }[]) => {
    if (updates.length === 0) return;
    const swotMap = new Map(updates.map(u => [u.stockCode, u.swot]));
    setGroups(prev => prev.map(g => ({
      ...g,
      stocks: g.stocks.map(s => {
        const swot = swotMap.get(s.stockCode);
        return swot ? { ...s, swot } : s;
      }),
    })));
  }, [setGroups]);

  // 一次性批量更新一只股票的多个字段，同步到自选分组
  const batchUpdateStock = useCallback((id: string, fields: Partial<PEGStock>) => {
    setGroups(prev => {
      const watchedIdx = prev.findIndex(g => g.name === WATCHED_GROUP_NAME);
      const sourceStock = prev[safeIdx]?.stocks.find(s => s.id === id);
      return prev.map((g, i) => {
        if (i === safeIdx) {
          return { ...g, stocks: g.stocks.map(s => s.id === id ? { ...s, ...fields } : s) };
        }
        // 同步到自选分组（当前分组不是自选时才同步）
        if (i === watchedIdx && sourceStock && safeIdx !== watchedIdx) {
          return { ...g, stocks: g.stocks.map(s =>
            s.stockCode === sourceStock.stockCode ? { ...s, ...fields } : s
          )};
        }
        return g;
      });
    });
  }, [safeIdx, setGroups]);

  // 添加股票到当前分组
  const addStock = useCallback(() => {
    const newId = String(Date.now());
    setGroups(prev => prev.map((g, i) =>
      i === safeIdx
        ? {
            ...g,
            stocks: [...g.stocks, {
              id: newId, company: '', stockCode: '', highlight: '', prosperityIndex: 100,
              currentPrice: 0, marketCap: 0, yearChange: 0, riskTracking: '', updateDate: '', cagr: 0.10, pe: 15,
            }]
          }
        : g
    ));
  }, [safeIdx, setGroups]);

  // 从当前分组移除股票
  const removeStock = useCallback((id: string) => {
    setGroups(prev => prev.map((g, i) =>
      i === safeIdx
        ? { ...g, stocks: g.stocks.filter(s => s.id !== id) }
        : g
    ));
  }, [safeIdx, setGroups]);

  // 切换自选状态：同步到"自选"分组
  const toggleWatched = useCallback((stockId: string) => {
    setGroups(prev => {
      const currentGroup = prev[safeIdx];
      if (!currentGroup) return prev;
      const stock = currentGroup.stocks.find(s => s.id === stockId);
      if (!stock) return prev;

      const isInWatchedGroup = currentGroup.name === WATCHED_GROUP_NAME;
      const watchedIdx = prev.findIndex(g => g.name === WATCHED_GROUP_NAME);

      if (isInWatchedGroup) {
        // 在自选分组内操作：直接移除，并同步取消其他分组中该股票的watched
        return prev.map((g, i) => {
          if (i === watchedIdx) {
            return { ...g, stocks: g.stocks.filter(s => s.id !== stockId) };
          }
          // 同步取消其他分组中相同股票代码的watched
          return { ...g, stocks: g.stocks.map(s =>
            s.stockCode === stock.stockCode ? { ...s, watched: false } : s
          )};
        });
      }

      // 在其他分组操作：切换watched状态
      const newWatched = !stock.watched;

      // 先更新当前分组中的watched字段
      const updatedGroups = prev.map((g, i) =>
        i === safeIdx
          ? { ...g, stocks: g.stocks.map(s => s.id === stockId ? { ...s, watched: newWatched } : s) }
          : g
      );

      // 再同步到"自选"分组
      if (watchedIdx < 0) return updatedGroups;

      const updatedStock = { ...stock, watched: newWatched };
      const watchedGroup = updatedGroups[watchedIdx];
      const existsInWatched = watchedGroup.stocks.some(s => s.stockCode === stock.stockCode);

      let newWatchedStocks: typeof watchedGroup.stocks;
      if (newWatched) {
        newWatchedStocks = existsInWatched
          ? watchedGroup.stocks.map(s => s.stockCode === stock.stockCode ? { ...updatedStock, id: s.id } : s)
          : [...watchedGroup.stocks, { ...updatedStock, id: `watched_${Date.now()}` }];
      } else {
        newWatchedStocks = watchedGroup.stocks.filter(s => s.stockCode !== stock.stockCode);
      }

      return updatedGroups.map((g, i) =>
        i === watchedIdx ? { ...g, stocks: newWatchedStocks } : g
      );
    });
  }, [safeIdx, setGroups]);

  // 通过股票代码跨分组切换自选（高亮行使用，不依赖safeIdx）
  const toggleWatchedByCode = useCallback((stockCode: string) => {
    setGroups(prev => {
      const watchedIdx = prev.findIndex(g => g.name === WATCHED_GROUP_NAME);
      // 找到该股票在非自选分组中的数据
      let stockRef: typeof prev[0]['stocks'][0] | undefined;
      for (const g of prev) {
        if (g.name !== WATCHED_GROUP_NAME) {
          stockRef = g.stocks.find(s => s.stockCode === stockCode);
          if (stockRef) break;
        }
      }
      if (!stockRef) return prev;
      const newWatched = !stockRef.watched;
      // 更新所有分组中该股票的watched字段
      const updatedGroups = prev.map(g =>
        g.name !== WATCHED_GROUP_NAME
          ? { ...g, stocks: g.stocks.map(s => s.stockCode === stockCode ? { ...s, watched: newWatched } : s) }
          : g
      );
      if (watchedIdx < 0) return updatedGroups;
      const updatedStock = { ...stockRef, watched: newWatched };
      const watchedGroup = updatedGroups[watchedIdx];
      const existsInWatched = watchedGroup.stocks.some(s => s.stockCode === stockCode);
      let newWatchedStocks: typeof watchedGroup.stocks;
      if (newWatched) {
        newWatchedStocks = existsInWatched
          ? watchedGroup.stocks.map(s => s.stockCode === stockCode ? { ...updatedStock, id: s.id } : s)
          : [...watchedGroup.stocks, { ...updatedStock, id: `watched_${Date.now()}` }];
      } else {
        newWatchedStocks = watchedGroup.stocks.filter(s => s.stockCode !== stockCode);
      }
      return updatedGroups.map((g, i) => i === watchedIdx ? { ...g, stocks: newWatchedStocks } : g);
    });
  }, [setGroups]);

  // 导入数据到指定分组（覆盖该分组）并同步自选分组
  // 注意：重新导入时必须保留已有持仓数据（positionQty/positionCost/positionDate）和自选状态
  const importToGroup = useCallback((groupName: string, data: Partial<PEGStock>[]) => {
    const importedCodeSet = new Set(data.map(s => s.stockCode).filter(Boolean));

    setGroups(prev => {
      const existIdx = prev.findIndex(g => g.name === groupName);
      const watchedIdx = prev.findIndex(g => g.name === WATCHED_GROUP_NAME);

      // 获取旧分组中的股票映射，用于保留持仓数据和自选状态
      const oldStockMap = new Map<string, PEGStock>();
      if (existIdx >= 0) {
        for (const s of prev[existIdx].stocks) {
          if (s.stockCode) oldStockMap.set(s.stockCode, s);
        }
      }

      const imported: PEGStock[] = data.map((d, i) => {
        const old = oldStockMap.get(d.stockCode || '');
        // 以旧数据为基底，叠加新导入的行情数据，保留所有已获取的财务/EPS/持仓等字段
        const base: PEGStock = old ? { ...old } : {} as PEGStock;
        return {
          ...base,
          id: `${groupName}_${Date.now()}_${i}`,
          company: d.company || base.company || '',
          stockCode: d.stockCode || base.stockCode || '',
          highlight: d.highlight || base.highlight || '',
          prosperityIndex: d.prosperityIndex ?? base.prosperityIndex ?? 100,
          // 行情数据：优先用新导入的（实时刷新），回退到旧数据
          currentPrice: d.currentPrice || base.currentPrice || 0,
          marketCap: d.marketCap || base.marketCap || 0,
          yearChange: d.yearChange ?? base.yearChange ?? 0,
          riskTracking: d.riskTracking || base.riskTracking || '',
          updateDate: d.updateDate || base.updateDate || '',
          cagr: d.cagr || base.cagr || 0,
          pe: d.pe || base.pe || 0,
          // 以下字段全部从旧数据保留（新导入数据通常不含这些）
          // eps2026/2027/2028, pegCar, pb, roe, bvps, dps, ps, divYield,
          // grossMargin, debtRatio, goodwillRatio, pbHistLow/High,
          // nationalTeam*, foreign*, qfii*, hotMoney*,
          // holderDetails, recentKlines, swot,
          // changePercent, volumeRatio, turnoverRate,
          // positionQty, positionCost, positionDate, watched
        };
      });

      // 更新或新增目标分组
      let next = [...prev];
      if (existIdx >= 0) {
        next[existIdx] = { name: groupName, stocks: imported };
        setActiveIdx(existIdx);
      } else {
        setActiveIdx(prev.length);
        next = [...prev, { name: groupName, stocks: imported }];
      }

      // 同步自选分组：更新行情 + 清除属于本分组但已不在成分股名单的孤儿栏目
      if (watchedIdx >= 0) {
        const importedMap = new Map(imported.map(s => [s.stockCode, s]));

        // 取得当前分组在导入前的股票代码集（即“属于本分组”的判断基准）
        const oldGroupCodes = new Set(
          (prev[existIdx >= 0 ? existIdx : -1]?.stocks ?? []).map(s => s.stockCode)
        );

        next[watchedIdx] = {
          ...next[watchedIdx],
          stocks: next[watchedIdx].stocks
            // 清除：属于旧分组但已不在新成分股名单，且用户没有手动添加持仓或自选的股票
            .filter(s => !oldGroupCodes.has(s.stockCode) || importedCodeSet.has(s.stockCode) || (s.positionQty && s.positionQty > 0) || s.watched)
            // 更新：同步新成分股的行情数据
            .map(s => {
              const src = importedMap.get(s.stockCode);
              if (!src) return s;
              return {
                ...s,
                currentPrice: src.currentPrice > 0 ? src.currentPrice : s.currentPrice,
                marketCap: src.marketCap > 0 ? src.marketCap : s.marketCap,
                yearChange: src.yearChange !== 0 ? src.yearChange : s.yearChange,
                updateDate: src.updateDate || s.updateDate,
              };
            }),
        };
      }

      return next;
    });
  }, [setGroups]);

  // Excel 全量导入（替换当前分组）
  // 注意：保留已有持仓数据和自选状态
  const importStocks = useCallback((data: Partial<PEGStock>[]) => {
    setGroups(prev => prev.map((g, i) => {
      if (i !== safeIdx) return g;
      // 获取旧分组中的股票映射，用于保留持仓数据
      const oldStockMap = new Map<string, PEGStock>();
      for (const s of g.stocks) {
        if (s.stockCode) oldStockMap.set(s.stockCode, s);
      }
      const imported: PEGStock[] = data.map((d, j) => {
        const old = oldStockMap.get(d.stockCode || '');
        return {
          id: String(Date.now() + j),
          company: d.company || '',
          stockCode: d.stockCode || '',
          highlight: d.highlight || '',
          prosperityIndex: d.prosperityIndex || 100,
          currentPrice: d.currentPrice || 0,
          marketCap: d.marketCap || 0,
          yearChange: d.yearChange || 0,
          riskTracking: d.riskTracking || '',
          updateDate: d.updateDate || '',
          cagr: d.cagr || 0,
          pe: d.pe || 0,
          // 保留已有持仓数据
          positionQty: old?.positionQty,
          positionCost: old?.positionCost,
          positionDate: old?.positionDate,
          watched: old?.watched,
        };
      });
      return { ...g, stocks: imported };
    }));
  }, [safeIdx, setGroups]);

  // 将自选分组中每只股票的行情字段全量从源分组同步
  // 源分组内的所有非行情字段（cagr/pe/highlight等）也一并同步
  const syncWatchedFromSources = useCallback(() => {
    setGroups(prev => {
      const watchedIdx = prev.findIndex(g => g.name === WATCHED_GROUP_NAME);
      if (watchedIdx < 0) return prev;

      // 构建所有源分组的 stockCode 映射（非自选分组）
      const sourceMap = new Map<string, PEGStock>();
      for (const g of prev) {
        if (g.name === WATCHED_GROUP_NAME) continue;
        for (const s of g.stocks) {
          if (s.stockCode) sourceMap.set(s.stockCode, s);
        }
      }

      const newWatchedStocks = prev[watchedIdx].stocks.map(s => {
        const src = sourceMap.get(s.stockCode);
        if (!src) return s; // 源分组已无此股票，保留
        // 同步所有字段，但保留自选分组的 id、watched 状态和持仓数据
        return {
          ...src, id: s.id, watched: s.watched,
          positionQty: s.positionQty ?? src.positionQty,
          positionCost: s.positionCost ?? src.positionCost,
          positionDate: s.positionDate ?? src.positionDate,
        };
      });

      if (newWatchedStocks === prev[watchedIdx].stocks) return prev;
      const next = [...prev];
      next[watchedIdx] = { ...next[watchedIdx], stocks: newWatchedStocks };
      return next;
    });
  }, [setGroups]);

  // 刷新所有分组行情（腾讯证券接口：价格+市值+年内涨幅 一次完成），并同步到自选
  // 解决自选表格和源分组（沪深300/中证500/中证1000）股价不一致的问题：
  // 收集所有分组的唯一股票代码，一次性拉取行情，同时更新所有分组
  const refreshQuotes = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);

    // 直接从 groups 读取所有唯一股票代码（避免 setState 批处理导致读取不到）
    const allCodes = [...new Set(
      groups.flatMap(g => g.stocks.map(s => s.stockCode).filter(Boolean))
    )];

    if (allCodes.length === 0) {
      setLoading(false);
      return;
    }

    let quoteMap: Awaited<ReturnType<typeof fetchBatchQuotes>>;
    try {
      quoteMap = await fetchBatchQuotes(allCodes);
    } catch (e) {
      console.warn('刷新行情失败:', e);
      setLoading(false);
      return;
    }

    // 并行获取K线数据（限制并发15只，避免被封）
    const klineMap = new Map<string, { date: string; open: number; close: number; high: number; low: number; volume: number }[]>();
    const codesWithPrice = allCodes.filter(c => quoteMap.has(c));
    const CONCURRENCY = 15;
    for (let i = 0; i < codesWithPrice.length; i += CONCURRENCY) {
      const batch = codesWithPrice.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(code => fetchRecentKlines(code, 60)));
      for (let j = 0; j < batch.length; j++) {
        if (results[j].length > 0) {
          klineMap.set(batch[j], results[j]);
        }
      }
    }

    // 将行情和K线数据写入所有分组（包括当前分组和其他分组），并同步自选
    setGroups(prev => {
      const next = prev.map(g => ({
        ...g,
        stocks: g.stocks.map(s => {
          if (!s.stockCode) return s;
          const q = quoteMap.get(s.stockCode);
          if (!q) return s;
          const klines = klineMap.get(s.stockCode);
          return {
            ...s,
            currentPrice: q.price > 0 ? q.price : s.currentPrice,
            marketCap: q.marketCap > 0 ? q.marketCap : s.marketCap,
            yearChange: q.yearChange !== 0 ? q.yearChange : s.yearChange,
            changePercent: q.changePercent !== 0 ? q.changePercent : s.changePercent,
            volumeRatio: q.volumeRatio > 0 ? q.volumeRatio : s.volumeRatio,
            turnoverRate: q.turnoverRate > 0 ? q.turnoverRate : s.turnoverRate,
            pb: q.pb > 0 ? q.pb : s.pb,
            recentKlines: klines || s.recentKlines,
            updateDate: today,
          };
        }),
      }));

      // 全量同步自选分组（所有源分组已是最新行情）
      const watchedIdx = next.findIndex(g => g.name === WATCHED_GROUP_NAME);
      if (watchedIdx >= 0) {
        const sourceMap = new Map<string, PEGStock>();
        for (const g of next) {
          if (g.name === WATCHED_GROUP_NAME) continue;
          for (const s of g.stocks) {
            if (s.stockCode) sourceMap.set(s.stockCode, s);
          }
        }
        const newWatchedStocks = next[watchedIdx].stocks.map(s => {
          const src = sourceMap.get(s.stockCode);
          if (!src) return s;
          // 同步源分组数据，但保留自选分组的持仓数据
          return {
            ...src, id: s.id, watched: s.watched,
            positionQty: s.positionQty ?? src.positionQty,
            positionCost: s.positionCost ?? src.positionCost,
            positionDate: s.positionDate ?? src.positionDate,
          };
        });
        next[watchedIdx] = { ...next[watchedIdx], stocks: newWatchedStocks };
      }

      return next;
    });

    setLoading(false);
  }, [groups, setGroups]);

  // 首次加载时自动获取行情和K线数据，确保入场信号能正常显示
  // 使用 ref 避免无限循环：refreshQuotes 依赖 groups，更新 groups 后会重建 callback
  const refreshQuotesRef = useRef(refreshQuotes);
  refreshQuotesRef.current = refreshQuotes;
  useEffect(() => {
    const timer = setTimeout(() => {
      refreshQuotesRef.current();
    }, 1000);
    return () => clearTimeout(timer);
  }, []); // 仅首次挂载执行

  // 刷新所有分组财务数据（从东方财富API获取PB、ROE、BPS、DPS等）
  const refreshFinancials = useCallback(async (onProgress?: (current: number, total: number) => void) => {
    setLoading(true);
    try {
      // 收集所有分组中所有有代码的股票（包括自选分组）
      const allCodes = [...new Set(
        groups.flatMap(g => g.stocks.map(s => s.stockCode).filter(Boolean))
      )];

      if (allCodes.length === 0) {
        console.warn('没有可获取财报数据的股票');
        setLoading(false);
        return;
      }

      // 构建行业映射，为港股提供更准确的财务 fallback
      const industryMap = new Map<string, string>();
      groups.flatMap(g => g.stocks).forEach(s => {
        if (s.stockCode && s.highlight) {
          industryMap.set(s.stockCode, s.highlight);
        }
      });

      console.log(`开始获取 ${allCodes.length} 只股票的财务数据...`);

      // 部分结果回调：每完成一个阶段就立即更新状态
      const handlePartialResult = (partialResult: Map<string, any>) => {
        if (partialResult.size === 0) return;
        setGroups(prev => prev.map(g => ({
          ...g,
          stocks: g.stocks.map(s => {
            const fd = partialResult.get(s.stockCode);
            if (!fd) return s;
            let dps = (fd.dps !== undefined ? fd.dps : s.dps) ?? 0;
            let divYield = (fd.divYield !== undefined ? fd.divYield : s.divYield) ?? 0;
            // 优先用 TTM 每股股息 / 当前价 计算正确股息率（修正ZXGXL历史价口径 bug）
            if (fd.dpsTtm != null && s.currentPrice > 0) {
              divYield = fd.dpsTtm / s.currentPrice * 100;
            }
            // 交叉反推：若只有一个字段有效，用当前股价反推另一个
            if (s.currentPrice > 0) {
              if (dps <= 0 && divYield > 0) {
                dps = s.currentPrice * divYield / 100;
              } else if (divYield <= 0 && dps > 0) {
                divYield = dps / s.currentPrice * 100;
              }
            }
            return {
              ...s,
              pb: fd.pb !== undefined ? fd.pb : s.pb,
              roe: fd.roe !== undefined ? fd.roe : s.roe,
              bvps: fd.bvps !== undefined ? fd.bvps : s.bvps,
              dps,
              ps: fd.ps !== undefined ? fd.ps : s.ps,
              divYield,
              grossMargin: fd.grossMargin !== undefined ? fd.grossMargin : s.grossMargin,
              debtRatio: fd.debtRatio !== undefined ? fd.debtRatio : s.debtRatio,
              goodwillRatio: fd.goodwillRatio !== undefined ? fd.goodwillRatio : s.goodwillRatio,
            };
          }),
        })));
      };

      const financialMap = await fetchBatchFinancials(allCodes, onProgress, industryMap, handlePartialResult);

      if (financialMap.size > 0) {
        console.log(`成功更新 ${financialMap.size} 只股票的财务数据`);
      } else {
        console.warn('未获取到任何财务数据，请检查API字段名是否正确');
      }

      // 获取行业信息（用于强周期股识别和估值方法自动判断）
      const industryResult = await fetchBatchIndustry(allCodes);
      if (industryResult.size > 0) {
        console.log(`成功获取 ${industryResult.size} 只股票的行业信息`);
        // 更新所有分组中股票的 highlight 字段
        setGroups(prev => prev.map(g => ({
          ...g,
          stocks: g.stocks.map(s => {
            const industry = industryResult.get(s.stockCode);
            if (!industry) return s;
            // 只在 highlight 为空或已有值时更新（保持用户自定义的 highlight）
            if (!s.highlight) {
              return { ...s, highlight: industry };
            }
            return s;
          }),
        })));
      }

      // ── 获取强周期股的历史PB分位数据（用于PB分位法估值）──
      const CYCLICAL_KEYWORDS = ['钢铁', '煤炭', '有色', '金属', '采矿', '化工', '化学', '航运', '海运',
        '石油', '石化', '海油', '油气', '开采', '能源', '天然气',
        '水泥', '建材', '玻璃', '铝', '铜', '锂', '稀土',
        '化肥', '农药', '钛白', '聚氨酯', '纤维', '涂料', '航空'];

      // 使用行业信息和 highlight 字段共同识别强周期股
      // 优先使用刚刚获取的 industryResult，其次使用已有的 highlight 字段
      const getIndustryForStock = (stock: PEGStock): string => {
        return industryResult.get(stock.stockCode) || stock.highlight || '';
      };

      // 收集所有股票的行业分布（调试用）
      const allStocksList = groups.flatMap(g => g.stocks);
      const industrySet = new Map<string, number>();
      for (const s of allStocksList) {
        const industry = getIndustryForStock(s);
        if (industry) {
          industrySet.set(industry, (industrySet.get(industry) || 0) + 1);
        }
      }
      console.log('[PB分位] 所有行业分布:', Object.fromEntries(industrySet));
      console.log('[PB分位] 总股票数:', allStocksList.length, '有行业信息的:', allStocksList.filter(s => getIndustryForStock(s)).length);

      const cyclicalStocks = allStocksList
        .filter(s => s.stockCode && CYCLICAL_KEYWORDS.some(kw => getIndustryForStock(s).includes(kw)));
      const cyclicalCodes = [...new Set(cyclicalStocks.map(s => s.stockCode))];

      console.log('[PB分位] 匹配到强周期股:', cyclicalStocks.length, '只, 去重后', cyclicalCodes.length, '只');
      if (cyclicalStocks.length > 0) {
        console.log('[PB分位] 匹配的股票:', cyclicalStocks.slice(0, 10).map(s => `${s.stockCode}(${getIndustryForStock(s)})`));
      }

      if (allCodes.length > 0) {
        console.log(`[PB分位] 开始获取 ${allCodes.length} 只股票的历史PB分位数据...`);
        try {
          const pbHistMap = await fetchBatchPBPercentile(allCodes);
          console.log('[PB分位] API返回结果:', pbHistMap.size, '只有数据');
          if (pbHistMap.size > 0) {
            // 打印前5只股票的分位数据
            let i = 0;
            for (const [code, pct] of pbHistMap) {
              if (i++ < 5) console.log(`[PB分位] ${code}: low=${pct.pbHistLow}, high=${pct.pbHistHigh}, samples=${pct.sampleCount}`);
            }
            setGroups(prev => prev.map(g => ({
              ...g,
              stocks: g.stocks.map(s => {
                const hist = pbHistMap.get(s.stockCode);
                if (!hist) return s;
                return {
                  ...s,
                  pbHistLow: hist.pbHistLow,
                  pbHistHigh: hist.pbHistHigh,
                };
              }),
            })));
            console.log(`[PB分位] 成功更新 ${pbHistMap.size} 只股票的历史PB分位数据`);
          } else {
            console.warn('[PB分位] API返回空结果，所有股票将使用行业默认值');
          }
        } catch (e) {
          console.error('[PB分位] 获取历史PB分位数据失败:', e);
        }
      } else {
        console.warn('[PB分位] 没有可获取PB分位数据的股票');
      }
    } catch (e) {
      console.error('获取财务数据失败:', e);
    } finally {
      setLoading(false);
    }
  }, [groups, setGroups]);

  // 刷新所有分组的持仓数据（国家队+外资，来自东方财富十大流通股东）
  const refreshHolders = useCallback(async (onProgress?: (current: number, total: number) => void) => {
    setLoading(true);
    try {
      // 收集所有分组中所有有代码的股票
      const allCodes = [...new Set(
        groups.flatMap(g => g.stocks.map(s => s.stockCode).filter(Boolean))
      )];

      if (allCodes.length === 0) {
        console.warn('没有可获取持仓数据的股票');
        setLoading(false);
        return;
      }

      console.log(`开始获取 ${allCodes.length} 只股票的持仓数据...`);
      const holderMap = await fetchBatchHolders(allCodes, onProgress);

      if (holderMap.size > 0) {
        setGroups(prev => prev.map(g => ({
          ...g,
          stocks: g.stocks.map(s => {
            const hd = holderMap.get(s.stockCode);
            if (!hd) return s;
            return {
              ...s,
              nationalTeamName: hd.nationalTeamName,
              nationalTeamRatio: hd.nationalTeamRatio,
              nationalTeamChange: hd.nationalTeamChange,
              nationalTeamCount: hd.nationalTeamCount,
              foreignRatio: hd.foreignRatio,
              foreignChange: hd.foreignChange,
              foreignCount: hd.foreignCount,
              foreignName: hd.foreignName,
              qfiiName: hd.qfiiName,
              qfiiRatio: hd.qfiiRatio,
              qfiiChange: hd.qfiiChange,
              qfiiCount: hd.qfiiCount,
              hotMoneyName: hd.hotMoneyName,
              hotMoneyRatio: hd.hotMoneyRatio,
              hotMoneyChange: hd.hotMoneyChange,
              hotMoneyCount: hd.hotMoneyCount,
              holderDetails: hd.holderDetails,
            };
          }),
        })));
        console.log(`成功更新 ${holderMap.size} 只股票的持仓数据`);
      } else {
        console.warn('未获取到任何持仓数据');
      }
    } catch (e) {
      console.error('获取持仓数据失败:', e);
    } finally {
      setLoading(false);
    }
  }, [groups, setGroups]);

  return {
    groups,
    activeGroup,
    activeGroupIdx: safeIdx,
    stocks,
    loading,
    setActiveGroup,
    refreshQuotes,
    refreshFinancials,
    refreshHolders,
    syncWatchedFromSources,
    updateStock,
    batchUpdateStock,
    updatePosition,
    updateSwot,
    batchUpdateSwot,
    toggleWatched,
    toggleWatchedByCode,
    addStock,
    removeStock,
    importStocks,
    importToGroup,
  };
}
