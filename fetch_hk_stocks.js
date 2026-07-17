/**
 * 从东方财富API获取全部港股股票信息
 * 通过本地代理(127.0.0.1:7897)连接
 *
 * 用法: node fetch_hk_stocks.js [输出文件]
 * 默认输出: hk_stocks.json
 */
const https = require('https');
const http = require('http');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const path = require('path');

const PROXY_URL = 'http://127.0.0.1:7897';
const agent = new HttpsProxyAgent(PROXY_URL);

const MARKET_FILTERS = [
  { fs: 'm:128+t:3',  label: '港股主板' },
  { fs: 'm:128+t:4',  label: '港股创业板' },
  { fs: 'm:128+t:13', label: '港股科创板' },
  { fs: 'm:128+t:5',  label: '港股主板ETF' },
  { fs: 'm:128+t:6',  label: '港股创业板ETF' },
  { fs: 'm:128+t:7',  label: '港股主板基金' },
  { fs: 'm:128+t:8',  label: '港股创业板基金' },
  { fs: 'm:128+t:10', label: '港股主板债券' },
];

const PAGE_SIZE = 500;
const MAX_PAGES = 30;
const RETRY_COUNT = 3;
const RETRY_DELAY = 2000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchPage(fs, pn) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      pn: String(pn),
      pz: String(PAGE_SIZE),
      po: '1',
      np: '1',
      fltt: '2',
      invt: '2',
      fid: 'f20',
      fs: fs,
      fields: 'f12,f14,f20,f170',
      _: String(Date.now()),
    });
    const url = `https://push2.eastmoney.com/api/qt/clist/get?${params}`;

    const req = https.get(url, {
      agent,
      headers: {
        'Referer': 'https://quote.eastmoney.com/center/gridlist.html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      },
    }, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf8');
          const data = JSON.parse(text);
          resolve(data);
        } catch (e) {
          reject(new Error(`JSON解析失败: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('请求超时'));
    });
  });
}

async function fetchWithRetry(fs, pn) {
  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    try {
      const data = await fetchPage(fs, pn);
      return data;
    } catch (e) {
      console.log(`  [重试 ${attempt}/${RETRY_COUNT}] ${fs} page ${pn} 失败: ${e.message}`);
      if (attempt < RETRY_COUNT) {
        await sleep(RETRY_DELAY * attempt);
      } else {
        throw e;
      }
    }
  }
}

function normalizeCode(raw) {
  const num = String(raw).replace(/\D/g, '');
  return num.padStart(5, '0');
}

async function main() {
  const outputFile = process.argv[2] || 'hk_stocks.json';
  const allStocks = [];
  const seenCodes = new Set();

  console.log('=== 东方财富港股全市场数据获取 ===');
  console.log(`代理: ${PROXY_URL}`);
  console.log('');

  for (const { fs, label } of MARKET_FILTERS) {
    console.log(`\n--- ${label} (${fs}) ---`);
    let categoryCount = 0;

    for (let pn = 1; pn <= MAX_PAGES; pn++) {
      try {
        const data = await fetchWithRetry(fs, pn);

        if (data?.data?.diff && Array.isArray(data.data.diff) && data.data.diff.length > 0) {
          const diff = data.data.diff;
          for (const item of diff) {
            const code = normalizeCode(item.f12 || '');
            if (!code || seenCodes.has(code)) continue;
            seenCodes.add(code);

            allStocks.push({
              code,
              name: item.f14 || '',
              marketCap: (item.f20 || 0) / 1e8, // 转为亿元
              changePercent: (item.f170 || 0) / 100,
              category: label,
            });
          }

          categoryCount += diff.length;
          console.log(`  page ${pn}: ${diff.length} 只 (累计 ${categoryCount}, 去重后 ${allStocks.length})`);

          if (diff.length < PAGE_SIZE) {
            console.log(`  ${label} 获取完成`);
            break;
          }
        } else {
          console.log(`  page ${pn}: 无数据，${label} 获取完成`);
          break;
        }

        // 请求间隔，避免被限流
        await sleep(500);
      } catch (e) {
        console.log(`  page ${pn} 获取失败(已重试): ${e.message}`);
        break;
      }
    }
  }

  // 按市值排序
  allStocks.sort((a, b) => b.marketCap - a.marketCap);

  console.log('\n========================');
  console.log(`总计: ${allStocks.length} 只港股（去重后）`);

  // 统计各分类数量
  const stats = {};
  for (const s of allStocks) {
    stats[s.category] = (stats[s.category] || 0) + 1;
  }
  console.log('分类统计:');
  for (const [cat, count] of Object.entries(stats)) {
    console.log(`  ${cat}: ${count} 只`);
  }

  // 前20只
  console.log('\n市值前20:');
  for (let i = 0; i < Math.min(20, allStocks.length); i++) {
    const s = allStocks[i];
    console.log(`  ${String(i + 1).padStart(2)}. ${s.code} ${s.name} 市值:${s.marketCap.toFixed(1)}亿`);
  }

  // 保存到文件
  const outputPath = path.resolve(outputFile);
  fs.writeFileSync(outputPath, JSON.stringify(allStocks, null, 2), 'utf8');
  console.log(`\n数据已保存到: ${outputPath}`);
  console.log(`文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
}

main().catch(e => {
  console.error('执行失败:', e);
  process.exit(1);
});
