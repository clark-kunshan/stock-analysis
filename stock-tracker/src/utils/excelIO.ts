// Excel导入导出功能
import * as XLSX from 'xlsx';
import type { PEGStock } from '../types/peg.ts';
import type { PEStock } from '../types/pe.ts';
import type { IndexValuation } from '../types/index.ts';
import { normalizeCAGR } from './formulas.ts';

// 从Excel文件导入PEG数据
export function importPEGFromExcel(file: File): Promise<Partial<PEGStock>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames.find(n => n.includes('PEG')) || workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

        // 跳过前6行（标题和说明），从第7行开始是数据
        const stocks: Partial<PEGStock>[] = [];
        for (let i = 6; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[2]) continue; // C列：公司名不能为空

          const company = String(row[2] || '').trim();
          if (!company) continue;

          // 从公司名提取股票代码（最后6位数字）
          const codeMatch = company.match(/(\d{6})/);
          const stockCode = codeMatch ? codeMatch[1] : '';

          stocks.push({
            company,
            stockCode,
            highlight: String(row[3] || ''),
            prosperityIndex: Number(row[4]) || 0,
            currentPrice: Number(row[5]) || 0,
            marketCap: Number(row[10]) || 0,
            yearChange: Number(row[12]) || 0,
            riskTracking: String(row[13] || ''),
            cagr: normalizeCAGR(Number(row[15]) || 0),
            pe: Number(row[16]) || 0,
          });
        }
        resolve(stocks);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// 从Excel导入PE数据
export function importPEFromExcel(file: File): Promise<Partial<PEStock>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames.find(n => n.includes('PE')) || workbook.SheetNames[1] || workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

        const stocks: Partial<PEStock>[] = [];
        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[1]) continue;

          stocks.push({
            category: String(row[0] || ''),
            stockCode: String(row[1] || ''),
            stockName: String(row[2] || ''),
            coreCompetitiveness: String(row[3] || ''),
            avgEPS: Number(row[4]) || 0,
            peLow: Number(row[5]) || 0,
            peHigh: Number(row[6]) || 0,
            competitivenessScore: Number(row[9]) || 0,
            totalShares: Number(row[10]) || 0,
            closingPrice: Number(row[11]) || 0,
          });
        }
        resolve(stocks);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// 从Excel导入指数估值数据
export function importIndexFromExcel(file: File): Promise<Partial<IndexValuation>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames.find(n => n === '估值') || workbook.SheetNames[2] || workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

        const indices: Partial<IndexValuation>[] = [];
        for (let i = 3; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[0]) continue;
          const name = String(row[0] || '').trim();
          if (!name || name.startsWith('※')) continue;

          indices.push({
            indexName: name,
            points: Number(row[1]) || 0,
            yearChange: Number(row[2]) || 0,
            currentPE: Number(row[3]) || 0,
            avgPE10Y: Number(row[4]) || 0,
            percentile10Y: Number(row[5]) || 0,
            weight: Number(row[9]) || 1,
          });
        }
        resolve(indices);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// 导出数据为Excel
export function exportToExcel(
  pegStocks: PEGStock[],
  peStocks: PEStock[],
  indexData: IndexValuation[],
  calcPEGFn: (s: PEGStock) => any,
  calcPEFn: (s: PEStock) => any,
  calcIndexFn: (s: IndexValuation) => any
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: PEG估值
  const pegHeader = ['安全系数', '公司', '看点', '景气指数', '当前股价', '合理价位', '理想买点', '减仓价位', '1年内卖点', '当前市值(亿)', '3年后理想估值(亿)', '年内涨幅(%)', '风险追踪', '更新日期', 'CAGR(E)', 'PE(E)', 'PEG(E)'];
  const pegRows = pegStocks.map(s => {
    const c = calcPEGFn(s);
    return [c.safetyFactor, s.company, s.highlight, s.prosperityIndex, s.currentPrice, c.fairValue, c.idealBuyPoint, c.reducePosition, c.oneYearSellPoint, s.marketCap, c.threeYearValuation, s.yearChange, s.riskTracking, s.updateDate, s.cagr, s.pe, c.peg];
  });
  const ws1 = XLSX.utils.aoa_to_sheet([pegHeader, ...pegRows]);
  XLSX.utils.book_append_sheet(wb, ws1, '股票(PEG)估值计算方法');

  // Sheet 2: PE区间估值
  const peHeader = ['分类', '股票代码', '股票名称', '核心竞争力', '预估EPS', 'PE(低)', 'PE(高)', '加仓点', '减仓点', '竞争力评分', '总股本(亿)', '收盘价', '当前评级', '更新时间'];
  const peRows = peStocks.map(s => {
    const c = calcPEFn(s);
    return [s.category, s.stockCode, s.stockName, s.coreCompetitiveness, s.avgEPS, s.peLow, s.peHigh, c.buyPoint, c.sellPoint, s.competitivenessScore, s.totalShares, s.closingPrice, c.rating, s.updateTime];
  });
  const ws2 = XLSX.utils.aoa_to_sheet([peHeader, ...peRows]);
  XLSX.utils.book_append_sheet(wb, ws2, 'PE区间估值法原始表格');

  // Sheet 3: 指数估值
  const idxHeader = ['主要指数', '点位', '年内涨幅(%)', '当前PE(TTM)', '10年平均PE', '10年分位点(%)', '修正后分位点', '估值', '加权'];
  const idxRows = indexData.map(s => {
    const c = calcIndexFn(s);
    return [s.indexName, s.points, s.yearChange, s.currentPE, s.avgPE10Y, s.percentile10Y, c.adjustedPercentile, c.valuation, s.weight];
  });
  const ws3 = XLSX.utils.aoa_to_sheet([idxHeader, ...idxRows]);
  XLSX.utils.book_append_sheet(wb, ws3, '估值');

  XLSX.writeFile(wb, `股票估值计算方法_${new Date().toISOString().slice(0,10)}.xlsx`);
}
