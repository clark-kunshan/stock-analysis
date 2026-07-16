import { useState, useRef, useCallback } from 'react';
import type { TabType } from './types/index.ts';
import type { PEGStock } from './types/peg.ts';
import { usePEGStocks } from './hooks/usePEGStocks.ts';
import { usePEStocks } from './hooks/usePEStocks.ts';
import { useIndexValuation } from './hooks/useIndexValuation.ts';
import { calcPEGStock, calcPEStock, calcIndexValuation } from './utils/formulas.ts';
import { importPEGFromExcel, importPEFromExcel, importIndexFromExcel, exportToExcel } from './utils/excelIO.ts';
import { getProsperityScore } from './utils/prosperityRules.ts';
import { fetchCSI300Constituents, fetchCSI500Constituents, fetchCSI1000Constituents, fetchHKEXConstituents, fetchBatchCAGR, fetchBatchIndustryPE, fetchBatchIndustry } from './api/stock.ts';
import { fetchBatchForwardPE } from './api/forward_pe.ts';
import { TabNav } from './components/TabNav.tsx';
import { PEGTable } from './components/PEGTable.tsx';
import { IndustrySafetyChart } from './components/IndustrySafetyChart.tsx';
import { PETable } from './components/PETable.tsx';
import { IndexTable } from './components/IndexTable.tsx';
import { MultiValuationTable } from './components/MultiValuationTable.tsx';
import { FundamentalDistributionChart } from './components/FundamentalDistributionChart.tsx';
import { HolderIndustryChart } from './components/HolderIndustryChart.tsx';
import { HotMoneyPieChart } from './components/HotMoneyPieChart.tsx';
import { saveSnapshot } from './utils/snapshot.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('peg');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // 行业搜索关键词（回车触发）
  const [industryKeyword, setIndustryKeyword] = useState('');
  // 搜索结果详情弹窗
  const [selectedStock, setSelectedStock] = useState<{ stock: any; groupName: string } | null>(null);

  const pegHook = usePEGStocks();
  const peHook = usePEStocks();
  const indexHook = useIndexValuation();

  const isLoading = pegHook.loading || peHook.loading || indexHook.loading;

  // 跨分组搜索：在沪深300/中证500/中证1000中查找匹配股票（下拉建议）
  const SEARCH_GROUPS = ['沪深300', '中证500', '中证1000', '港股'];
  const searchResults = searchQuery.trim().length >= 1
    ? pegHook.groups
        .filter(g => SEARCH_GROUPS.includes(g.name))
        .flatMap(g => g.stocks
          .filter(s =>
            s.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.stockCode.includes(searchQuery) ||
            (s.highlight || '').toLowerCase().includes(searchQuery.toLowerCase())
          )
          .map(s => ({ stock: s, groupName: g.name }))
        )
    : [];

  // 行业搜索结果：回车后跨所有指数分组展示匹配行业的股票
  const industrySearchResults = industryKeyword.trim().length >= 1
    ? pegHook.groups
        .filter(g => SEARCH_GROUPS.includes(g.name))
        .flatMap(g => g.stocks
          .filter(s => (s.highlight || '').includes(industryKeyword.trim()))
          .map(s => ({ stock: s, groupName: g.name }))
        )
    : [];

  // 触发行业搜索（回车）
  const handleIndustrySearch = useCallback((keyword: string) => {
    setIndustryKeyword(keyword);
    setSearchQuery('');
    setSelectedStock(null);
  }, []);

  // 清除行业搜索
  const handleClearIndustrySearch = useCallback(() => {
    setIndustryKeyword('');
  }, []);

  // 点击搜索结果：显示详情弹窗
  const handleSearchSelect = useCallback((groupName: string, stockId: string) => {
    const group = pegHook.groups.find(g => g.name === groupName);
    const stock = group?.stocks.find(s => s.id === stockId);
    if (stock) setSelectedStock({ stock, groupName });
  }, [pegHook]);

  const handleRefresh = useCallback(async () => {
    if (activeTab === 'index') {
      await indexHook.refreshData();
    } else {
      // PEG、PE、多方法估值 统一刷新，确保相同股票价格一致
      await Promise.all([pegHook.refreshQuotes(), peHook.refreshQuotes()]);
    }
    // 刷新完成后保存快照，供下次打开时直接加载
    saveSnapshot();
  }, [activeTab, pegHook, peHook, indexHook]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (activeTab === 'peg' || activeTab === 'multival') {
        const data = await importPEGFromExcel(file);
        pegHook.importStocks(data);
        alert(`成功导入 ${data.length} 条PEG估值数据`);
      } else if (activeTab === 'pe') {
        const data = await importPEFromExcel(file);
        peHook.importStocks(data);
        alert(`成功导入 ${data.length} 条PE区间估值数据`);
      } else {
        const data = await importIndexFromExcel(file);
        indexHook.importIndices(data);
        alert(`成功导入 ${data.length} 条指数估值数据`);
      }
    } catch (err) {
      alert('导入失败: ' + (err as Error).message);
    }
    
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [activeTab, pegHook, peHook, indexHook]);

  const [importingIndex, setImportingIndex] = useState('');
  const [importingHK, setImportingHK] = useState(false);
  const [updatingCAGR, setUpdatingCAGR] = useState(false);
  const [cagrProgress, setCagrProgress] = useState('');
  const [updatingPE, setUpdatingPE] = useState(false);
  const [peProgress, setPeProgress] = useState('');
  const [updatingIndustry, setUpdatingIndustry] = useState(false);
  const [industryProgress, setIndustryProgress] = useState('');
  const [updatingProsperity, setUpdatingProsperity] = useState(false);
  const [updatingHolders, setUpdatingHolders] = useState(false);
  const [holderProgress, setHolderProgress] = useState('');

  const handleImportIndex = useCallback(async (indexName: string) => {
    const fetchers: Record<string, typeof fetchCSI300Constituents> = {
      '沪深300': fetchCSI300Constituents,
      '中证500': fetchCSI500Constituents,
      '中证1000': fetchCSI1000Constituents,
    };
    const fetcher = fetchers[indexName];
    if (!fetcher) return;

    if (!confirm(`将从东方财富API获取${indexName}全部成分股数据，导入为独立分组。是否继续？`)) return;
    setImportingIndex(indexName);
    try {
      const constituents = await fetcher();
      if (constituents.length === 0) {
        alert(`获取${indexName}成分股失败，请检查网络连接`);
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const stocks: PEGStock[] = constituents.map((c, i) => ({
        id: `idx_${indexName}_${i}`,
        company: `${c.name}${c.code}`,
        stockCode: c.code,
        highlight: c.industry || '',
        prosperityIndex: 100,
        currentPrice: c.price,
        marketCap: c.marketCap,
        yearChange: c.yearChange,
        riskTracking: '',
        updateDate: today,
        cagr: 0.10,
        pe: 15,
      }));
      pegHook.importToGroup(indexName, stocks);
      alert(`成功导入 ${stocks.length} 只${indexName}成分股`);
    } catch (e) {
      alert(`导入${indexName}数据失败: ` + (e as Error).message);
    } finally {
      setImportingIndex('');
    }
  }, [pegHook]);

  const handleImportHK = useCallback(async () => {
    if (!confirm('将从东方财富API获取港股（恒生指数/港股通）成分股数据，导入为「港股」独立分组。是否继续？')) return;
    setImportingHK(true);
    try {
      const constituents = await fetchHKEXConstituents();
      if (constituents.length === 0) {
        alert('获取港股数据失败，请检查网络连接');
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const stocks: PEGStock[] = constituents.map((c, i) => ({
        id: `hk_${Date.now()}_${i}`,
        company: `${c.name}${c.code}`,
        stockCode: c.code,
        highlight: c.industry || '港股',
        prosperityIndex: 100,
        currentPrice: c.price,
        marketCap: c.marketCap,
        yearChange: c.yearChange,
        riskTracking: '',
        updateDate: today,
        cagr: 0.10,
        pe: 15,
      }));
      pegHook.importToGroup('港股', stocks);
      alert(`成功导入 ${stocks.length} 只港股`);
    } catch (e) {
      alert('导入港股数据失败: ' + (e as Error).message);
    } finally {
      setImportingHK(false);
    }
  }, [pegHook]);

  const handleUpdateCAGR = useCallback(async () => {
    const stocks = pegHook.stocks;
    const codes = stocks.map(s => s.stockCode).filter(Boolean);
    if (codes.length === 0) {
      alert('没有股票代码，无法更新机构预期PEG');
      return;
    }
    setUpdatingCAGR(true);
    setCagrProgress('0/' + codes.length);
    try {
      const cagrMap = await fetchBatchCAGR(codes, (current, total) => {
        setCagrProgress(current + '/' + total);
      });
      // 只更新 pegCar 字段，不动其他列
      let updatedCount = 0;
      stocks.forEach(s => {
        if (s.stockCode && cagrMap.has(s.stockCode)) {
          const r = cagrMap.get(s.stockCode)!;
          pegHook.batchUpdateStock(s.id, { pegCar: r.pegCar });
          updatedCount++;
        }
      });
      alert(`机构预期PEG更新完成！成功更新 ${updatedCount} / ${codes.length} 只股票`);
    } catch (e) {
      alert('更新机构预期PEG失败: ' + (e as Error).message);
    } finally {
      setUpdatingCAGR(false);
      setCagrProgress('');
      pegHook.syncWatchedFromSources();
    }
  }, [pegHook]);

  const handleUpdatePE = useCallback(async () => {
    const stocks = pegHook.stocks;
    // 只要有股票代码就获取EPS，不要求currentPrice>0（EPS本身不依赖股价）
    const targets = stocks
      .filter(s => s.stockCode)
      .map(s => ({ stockCode: s.stockCode, currentPrice: s.currentPrice }));
    if (targets.length === 0) {
      alert('没有有效的股票数据，无法更新前瞻PE');
      return;
    }
    setUpdatingPE(true);
    setPeProgress('0/' + targets.length);
    try {
      const peMap = await fetchBatchForwardPE(targets, (current, total) => {
        setPeProgress(current + '/' + total);
      });
      let updatedCount = 0;
      stocks.forEach(s => {
        if (s.stockCode && peMap.has(s.stockCode)) {
          const r = peMap.get(s.stockCode)!;
          // 计算CAGR：基于EPS复合增长率
          // 优先用 2026→2028（2年），其次 2026→2027（1年）
          let newCagr: number | null = null;
          if (r.eps2026 !== 0 && r.eps2028 !== 0) {
            newCagr = Math.pow(r.eps2028 / r.eps2026, 1 / 2) - 1;
          } else if (r.eps2026 !== 0 && r.eps2027 !== 0) {
            newCagr = r.eps2027 / r.eps2026 - 1;
          }
          // 一次性写入所有字段，避免多次 setState 相互覆盖
          // 没有EPS数据时，pe/eps也写0，避免保留旧的错误值
          const fields: Record<string, any> = {};
          fields.pe = r.pe;
          fields.eps2026 = r.eps2026;
          fields.eps2027 = r.eps2027;
          fields.eps2028 = r.eps2028;
          if (newCagr !== null) {
            fields.cagr = Math.round(newCagr * 10000) / 10000;
          } else {
            // 没有未来EPS数据时，清除旧的CAGR避免显示错误值
            fields.cagr = 0;
          }
          pegHook.batchUpdateStock(s.id, fields);
          updatedCount++;
        }
      });
      alert(`前瞻PE更新完成！成功更新 ${updatedCount} / ${targets.length} 只股票（基于分析师一致预期EPS）`);
    } catch (e) {
      alert('更新前瞻PE失败: ' + (e as Error).message);
    } finally {
      setUpdatingPE(false);
      setPeProgress('');
      pegHook.syncWatchedFromSources();
    }
  }, [pegHook]);

  const handleUpdateIndustry = useCallback(async () => {
    const stocks = pegHook.stocks;
    const codes = stocks.map(s => s.stockCode).filter(Boolean);
    if (codes.length === 0) {
      alert('没有股票代码，无法更新行业信息');
      return;
    }
    setUpdatingIndustry(true);
    setIndustryProgress('0/' + codes.length);
    try {
      const industryMap = await fetchBatchIndustry(codes, (current, total) => {
        setIndustryProgress(current + '/' + total);
      });
      let updatedCount = 0;
      stocks.forEach(s => {
        if (s.stockCode && industryMap.has(s.stockCode)) {
          const industry = industryMap.get(s.stockCode)!;
          pegHook.updateStock(s.id, 'highlight', industry);
          updatedCount++;
        }
      });
      alert(`行业更新完成！成功更新 ${updatedCount} / ${codes.length} 只股票`);
    } catch (e) {
      alert('更新行业失败: ' + (e as Error).message);
    } finally {
      setUpdatingIndustry(false);
      setIndustryProgress('');
      pegHook.syncWatchedFromSources();
    }
  }, [pegHook]);

  const handleUpdateProsperity = useCallback(() => {
    const stocks = pegHook.stocks;
    if (stocks.length === 0) { alert('当前分组没有股票数据'); return; }
    setUpdatingProsperity(true);
    let updated = 0;
    stocks.forEach(s => {
      const score = getProsperityScore(s.highlight || '');
      if (score !== null) {
        pegHook.updateStock(s.id, 'prosperityIndex', score);
        updated++;
      }
    });
    setUpdatingProsperity(false);
    alert(`景气指数更新完成！成功匹配 ${updated} / ${stocks.length} 只股票，未匹配的保持原值`);
    pegHook.syncWatchedFromSources();
  }, [pegHook]);

  const handleUpdateHolders = useCallback(async () => {
    setUpdatingHolders(true);
    setHolderProgress('0/0');
    try {
      await pegHook.refreshHolders((current, total) => {
        setHolderProgress(current + '/' + total);
      });
      // 持仓刷新完成后保存快照
      saveSnapshot();
    } catch (e) {
      alert('更新持仓数据失败: ' + (e as Error).message);
    } finally {
      setUpdatingHolders(false);
      setHolderProgress('');
    }
  }, [pegHook]);

  const handleExport = useCallback(() => {
    exportToExcel(
      pegHook.stocks,
      peHook.stocks,
      indexHook.indices,
      calcPEGStock,
      calcPEStock,
      calcIndexValuation
    );
  }, [pegHook.stocks, peHook.stocks, indexHook.indices]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-800 text-white px-4 py-3">
        <h1 className="text-lg font-bold">
          【股票估值计算方法】
          <span className="text-sm font-normal ml-4 text-slate-300">
            数据更新时间：{new Date().toISOString().slice(0, 10)}
          </span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          ※ 重点提示：以下内容全部为个人日记总结记录，仅限交流使用，不构成任何投资建议，请大家谨慎投资。
        </p>
      </div>

      {/* Tab Navigation */}
      <TabNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRefresh={handleRefresh}
        onImport={handleImport}
        onExport={handleExport}
        onImportIndex={handleImportIndex}
        onImportHK={handleImportHK}
        onUpdateIndustry={handleUpdateIndustry}
        onUpdateCAGR={handleUpdateCAGR}
        onUpdatePE={handleUpdatePE}
        onUpdateProsperity={handleUpdateProsperity}
        onUpdateHolders={handleUpdateHolders}
        loading={isLoading}
        importingIndex={importingIndex}
        importingHK={importingHK}
        updatingIndustry={updatingIndustry}
        industryProgress={industryProgress}
        updatingCAGR={updatingCAGR}
        cagrProgress={cagrProgress}
        updatingPE={updatingPE}
        peProgress={peProgress}
        updatingProsperity={updatingProsperity}
        updatingHolders={updatingHolders}
        holderProgress={holderProgress}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchResults={searchResults}
        onSearchSelect={handleSearchSelect}
        onIndustrySearch={handleIndustrySearch}
        industryKeyword={industryKeyword}
        onClearIndustrySearch={handleClearIndustrySearch}
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Tab Content */}
      {activeTab === 'peg' && (
        <>
          <PEGTable
            stocks={pegHook.stocks}
            groups={pegHook.groups}
            activeGroupIdx={pegHook.activeGroupIdx}
            onGroupChange={pegHook.setActiveGroup}
            onUpdate={pegHook.updateStock}
            onToggleWatched={pegHook.toggleWatched}
            onAdd={pegHook.addStock}
            onRemove={pegHook.removeStock}
            highlightStock={selectedStock}
            onClearHighlight={() => setSelectedStock(null)}
            onToggleHighlightWatched={(stockCode) => {
              pegHook.toggleWatchedByCode(stockCode);
              setSelectedStock(null);
            }}
            industrySearchResults={industryKeyword ? industrySearchResults : null}
            industryKeyword={industryKeyword}
            onClearIndustrySearch={handleClearIndustrySearch}
            onToggleIndustryWatched={(stockCode) => pegHook.toggleWatchedByCode(stockCode)}
          />
          <IndustrySafetyChart stocks={pegHook.stocks} />
          <FundamentalDistributionChart stocks={pegHook.stocks} />
        </>
      )}
      {activeTab === 'pe' && (
        <PETable
          stocks={peHook.stocks}
          onUpdate={peHook.updateStock}
          onAdd={peHook.addStock}
          onRemove={peHook.removeStock}
        />
      )}
      {activeTab === 'index' && (
        <IndexTable
          indices={indexHook.indices}
          onUpdate={indexHook.updateIndex}
          onAdd={indexHook.addIndex}
          onRemove={indexHook.removeIndex}
        />
      )}
      {activeTab === 'multival' && (
        <MultiValuationTable
          groups={pegHook.groups}
          onUpdatePEG={pegHook.updateStock}
          onToggleWatched={pegHook.toggleWatchedByCode}
          onRefreshFinancials={pegHook.refreshFinancials}
          onRefreshHolders={pegHook.refreshHolders}
          onUpdatePosition={pegHook.updatePosition}
          onUpdateSwot={pegHook.updateSwot}
          onBatchUpdateSwot={pegHook.batchUpdateSwot}
        />
      )}
      {activeTab === 'holders' && (
        <HolderIndustryChart
          stocks={pegHook.groups.flatMap(g => g.stocks)}
          loading={updatingHolders}
          onRefresh={handleUpdateHolders}
        />
      )}
      {activeTab === 'hotmoney' && (
        <HotMoneyPieChart
          stocks={pegHook.groups.flatMap(g => g.stocks)}
          onRefreshHolders={handleUpdateHolders}
          updatingHolders={updatingHolders}
        />
      )}
    </div>
  );
}
