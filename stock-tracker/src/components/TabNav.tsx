import { useRef } from 'react';
import type { TabType } from '../types/index.ts';

interface TabNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onRefresh: () => void;
  onImport: () => void;
  onExport: () => void;
  onImportIndex: (indexName: string) => void;
  onImportHK: () => void;
  onUpdateIndustry: () => void;
  onUpdateCAGR: () => void;
  onUpdatePE: () => void;
  onUpdateProsperity: () => void;
  onUpdateHolders: () => void;
  updatingProsperity: boolean;
  updatingHolders: boolean;
  holderProgress: string;
  loading: boolean;
  importingIndex: string;
  importingHK: boolean;
  updatingIndustry: boolean;
  industryProgress: string;
  updatingCAGR: boolean;
  cagrProgress: string;
  updatingPE: boolean;
  peProgress: string;
  // 搜索相关
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchResults: Array<{ stock: any; groupName: string }>;
  onSearchSelect: (groupName: string, stockId: string) => void;
  // 行业搜索（回车触发）
  onIndustrySearch: (keyword: string) => void;
  industryKeyword: string;
  onClearIndustrySearch: () => void;
}

const TABS: { key: TabType; label: string }[] = [
  { key: 'peg', label: 'PEG估值法' },
  { key: 'pe', label: 'PE区间估值法' },
  { key: 'index', label: '指数估值' },
  { key: 'multival', label: '行业多方法估值' },
  { key: 'holders', label: '机构持仓统计' },
  { key: 'hotmoney', label: '游资持仓分布' },
];

const INDEX_LIST = [
  { name: '沪深300', color: 'bg-orange-500 hover:bg-orange-600' },
  { name: '中证500', color: 'bg-amber-500 hover:bg-amber-600' },
  { name: '中证1000', color: 'bg-rose-500 hover:bg-rose-600' },
];

export function TabNav({ activeTab, onTabChange, onRefresh, onImport, onExport, onImportIndex, onImportHK, onUpdateIndustry, onUpdateCAGR, onUpdatePE, onUpdateProsperity, onUpdateHolders, loading, importingIndex, importingHK, updatingIndustry, industryProgress, updatingCAGR, cagrProgress, updatingPE, peProgress, updatingProsperity, updatingHolders, holderProgress, searchQuery, onSearchChange, searchResults, onSearchSelect, onIndustrySearch, industryKeyword, onClearIndustrySearch }: TabNavProps) {
  const searchRef = useRef<HTMLDivElement>(null);
  return (
    <div className="bg-white border-b shadow-sm sticky top-0 z-20">
      <div className="max-w-full mx-auto px-4">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-1">
            {TABS.map(tab => (
              <button
                key={tab.key}
                className={`px-4 py-2 text-sm font-medium transition-colors rounded-t ${
                  activeTab === tab.key
                    ? 'tab-active bg-blue-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
                onClick={() => onTabChange(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'peg' && (
              <>
                {INDEX_LIST.map(idx => (
                  <button
                    key={idx.name}
                    onClick={() => onImportIndex(idx.name)}
                    disabled={!!importingIndex || importingHK}
                    className={`px-3 py-1.5 text-xs text-white rounded disabled:opacity-50 transition-colors ${idx.color}`}
                  >
                    {importingIndex === idx.name ? '导入中...' : `导入${idx.name}`}
                  </button>
                ))}
                <button
                  onClick={onImportHK}
                  disabled={importingHK || !!importingIndex}
                  className="px-3 py-1.5 text-xs text-white rounded disabled:opacity-50 transition-colors bg-pink-600 hover:bg-pink-700"
                >
                  {importingHK ? '导入港股中...' : '导入港股'}
                </button>
              <button
                onClick={onUpdateCAGR}
                disabled={updatingCAGR}
                className="px-3 py-1.5 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 transition-colors"
              >
                {updatingCAGR ? `更新机构预期PEG (${cagrProgress})` : '更新机构预期PEG'}
              </button>
              <button
                onClick={onUpdatePE}
                disabled={updatingPE}
                className="px-3 py-1.5 text-xs bg-teal-500 text-white rounded hover:bg-teal-600 disabled:opacity-50 transition-colors"
              >
                {updatingPE ? `更新前瞻PE (${peProgress})` : '更新前瞻PE'}
              </button>
              <button
                onClick={onUpdateProsperity}
                disabled={updatingProsperity}
                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                title="\u6839\u636e\u884c\u4e1a\u81ea\u52a8\u586b\u5145\u666f\u6c14\u6307\u6570"
              >
                {updatingProsperity ? '\u66f4\u65b0\u4e2d...' : '\u66f4\u65b0\u666f\u6c14\u6307\u6570'}
              </button>
              <button
                onClick={onUpdateIndustry}
                disabled={updatingIndustry}
                className="px-3 py-1.5 text-xs bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50 transition-colors"
              >
                {updatingIndustry ? `更新行业 (${industryProgress})` : '更新行业'}
              </button>
              <button
                onClick={onUpdateHolders}
                disabled={updatingHolders}
                className="px-3 py-1.5 text-xs bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:opacity-50 transition-colors"
                title="获取国家队（社保/汇金/证金/大基金）和北向资金持仓数据"
              >
                {updatingHolders ? `刷新持仓 (${holderProgress})` : '刷新持仓'}
              </button>
              {/* 搜索框 */}
              <div ref={searchRef} className="relative">
                {/* 行业搜索激活状态：显示当前关键词 + 清除按钮 */}
                {industryKeyword ? (
                  <div className="flex items-center gap-1 bg-blue-50 border border-blue-300 rounded px-2 py-1">
                    <svg className="w-3 h-3 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <span className="text-xs text-blue-700 font-medium">{industryKeyword}</span>
                    <button onClick={onClearIndustrySearch} className="text-blue-400 hover:text-red-500 leading-none ml-1" title="清除行业搜索">×</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1">
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="搜索股票/行业..."
                      value={searchQuery}
                      onChange={e => onSearchChange(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && searchQuery.trim()) {
                          onIndustrySearch(searchQuery.trim());
                        }
                      }}
                      className="bg-transparent text-xs outline-none w-28 placeholder-gray-400"
                    />
                    {searchQuery && (
                      <button onClick={() => onSearchChange('')} className="text-gray-400 hover:text-gray-600 leading-none">×</button>
                    )}
                  </div>
                )}
                {/* 搜索结果下拉（仅在非行业搜索激活时显示） */}
                {!industryKeyword && searchQuery && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 min-w-72 max-h-80 overflow-y-auto">
                    {searchResults.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-gray-400 text-center">未找到匹配股票</div>
                    ) : (
                      <>
                        <div className="px-3 py-1.5 text-xs text-gray-400 border-b bg-gray-50">共 {searchResults.length} 个结果</div>
                        {searchResults.map(({ stock, groupName }) => (
                          <button
                            key={`${groupName}-${stock.id}`}
                            onClick={() => { onSearchSelect(groupName, stock.id); onSearchChange(''); }}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-gray-800 truncate">{stock.company}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded text-white flex-shrink-0 ${
                                groupName === '沪深300' ? 'bg-orange-500'
                                : groupName === '中证500' ? 'bg-amber-500'
                                : 'bg-rose-500'
                              }`}>{groupName}</span>
                            </div>
                            {stock.highlight && (
                              <div className="text-xs text-gray-400 mt-0.5">{stock.highlight}</div>
                            )}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
              </>
            )}
            <button
              onClick={onRefresh}
              disabled={loading}
              className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {loading ? '刷新中...' : '刷新行情'}
            </button>
            <button
              onClick={onImport}
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
            >
              导入Excel
            </button>
            <button
              onClick={onExport}
              className="px-3 py-1.5 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
            >
              导出Excel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
