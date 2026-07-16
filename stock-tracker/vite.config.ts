import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

// 快照 API 插件：提供 GET/POST /api/snapshot 端点
// 自动化脚本在 headless 浏览器刷新数据后，POST 保存到 data/snapshot.json
// 用户打开页面时，GET 读取快照并加载到 localStorage
function snapshotPlugin() {
  const snapshotDir = path.resolve(__dirname, 'data')
  const snapshotPath = path.join(snapshotDir, 'snapshot.json')

  return {
    name: 'snapshot-api',
    configureServer(server: any) {
      server.middlewares.use('/api/snapshot', (req: any, res: any) => {
        if (req.method === 'GET') {
          try {
            const data = fs.readFileSync(snapshotPath, 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(data)
          } catch {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'No snapshot found' }))
          }
        } else if (req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: any) => { body += chunk })
          req.on('end', () => {
            try {
              fs.mkdirSync(snapshotDir, { recursive: true })
              fs.writeFileSync(snapshotPath, body)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            } catch (e: any) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: e.message }))
            }
          })
        } else {
          res.statusCode = 405
          res.end()
        }
      })
    },
  }
}

// SWOT 按需分析 API 插件
// data/swot-cache.json  — 已生成的 SWOT 缓存 { "000333": { strengths: [...], ... } }
// data/swot-pending.json — 待分析请求队列 [{ stockCode, stockName, requestedAt }]
function swotApiPlugin() {
  const dataDir = path.resolve(__dirname, 'data')
  const cachePath = path.join(dataDir, 'swot-cache.json')
  const pendingPath = path.join(dataDir, 'swot-pending.json')

  function readJson(filePath: string, fallback: any) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')) } catch { return fallback }
  }
  function writeJson(filePath: string, data: any) {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
  }

  return {
    name: 'swot-api',
    configureServer(server: any) {
      // 读取单个股票的 SWOT 缓存: GET /api/swot-cache/:stockCode
      server.middlewares.use('/api/swot-cache/', (req: any, res: any) => {
        const code = req.url.replace(/^\/+/, '').split('/')[0] // 提取 stockCode
        if (req.method === 'GET' && code) {
          const cache = readJson(cachePath, {})
          const data = cache[code]
          if (data) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true, data }))
          } else {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Not found' }))
          }
        } else if (req.method === 'POST' && code) {
          // AI 写入分析结果: POST /api/swot-cache/:stockCode
          let body = ''
          req.on('data', (chunk: any) => { body += chunk })
          req.on('end', () => {
            try {
              const swot = JSON.parse(body)
              const cache = readJson(cachePath, {})
              cache[code] = swot
              writeJson(cachePath, cache)
              // 从 pending 中移除
              const pending = readJson(pendingPath, [])
              const filtered = pending.filter((r: any) => r.stockCode !== code)
              writeJson(pendingPath, filtered)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            } catch (e: any) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: e.message }))
            }
          })
        } else {
          res.statusCode = 405
          res.end()
        }
      })

      // 提交分析请求: POST /api/swot-request
      // 查看待处理请求: GET /api/swot-requests
      server.middlewares.use('/api/swot-request', (req: any, res: any) => {
        if (req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: any) => { body += chunk })
          req.on('end', () => {
            try {
              const { stockCode, stockName } = JSON.parse(body)
              const pending = readJson(pendingPath, [])
              // 避免重复
              if (!pending.some((r: any) => r.stockCode === stockCode)) {
                pending.push({ stockCode, stockName, requestedAt: new Date().toISOString() })
                writeJson(pendingPath, pending)
              }
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            } catch (e: any) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: e.message }))
            }
          })
        } else {
          res.statusCode = 405
          res.end()
        }
      })

      // 查看待处理请求: GET /api/swot-requests
      server.middlewares.use('/api/swot-requests', (req: any, res: any) => {
        if (req.method === 'GET') {
          const pending = readJson(pendingPath, [])
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(pending))
        } else {
          res.statusCode = 405
          res.end()
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), snapshotPlugin(), swotApiPlugin()],
  base: '/stock-analysis/',
  server: {
    port: 5174,
    host: true,
    proxy: {
      '/api/danjuan': {
        target: 'https://danjuanfunds.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/danjuan/, '/djapi'),
      },
      '/api/csindex': {
        target: 'https://www.csindex.com.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/csindex/, '/csindex-home'),
      },
      '/api/push2his': {
        target: 'https://push2his.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/push2his/, ''),
        headers: {
          'Referer': 'https://quote.eastmoney.com/',
          'Origin': 'https://quote.eastmoney.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      },
      '/api/push2': {
        target: 'https://push2.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/push2/, ''),
        headers: {
          'Referer': 'https://quote.eastmoney.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
      '/api/datacenter': {
        target: 'https://datacenter-web.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/datacenter/, ''),
        headers: {
          'Referer': 'https://data.eastmoney.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      },
      '/api/emweb': {
        target: 'https://emweb.securities.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/emweb/, ''),
        headers: {
          'Referer': 'https://emweb.securities.eastmoney.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      },
      '/api/qt': {
        target: 'https://qt.gtimg.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/qt/, ''),
      },
      '/api/qkline': {
        target: 'https://proxy.finance.qq.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/qkline/, ''),
      },
    },
  },
})
