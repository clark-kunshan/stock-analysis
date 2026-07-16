/**
 * 数据快照工具：让自动化刷新的数据能在用户下次打开时自动加载
 *
 * 工作流程：
 * 1. 自动化（每晚8点）在 headless 浏览器中打开页面 → 点击刷新按钮 → 数据存入 localStorage
 * 2. 自动化执行 window.__saveSnapshot() → POST localStorage 数据到 /api/snapshot → 写入 data/snapshot.json
 * 3. 用户打开页面 → checkAndLoadSnapshot() 从 /api/snapshot 读取 → 若比上次更新则覆盖 localStorage
 * 4. React 渲染时，hooks 从 localStorage 读取 → 直接显示最新数据，无需手动刷新
 */

const SNAPSHOT_VERSION = 1
const STORAGE_KEYS = ['peg-groups', 'index-valuation', 'pe-stocks'] as const
const SNAPSHOT_TS_KEY = 'snapshot-timestamp'

interface Snapshot {
  version: number
  timestamp: string
  data: Record<string, unknown>
}

/**
 * 启动时调用：从服务器读取快照，若比 localStorage 中的上次快照更新，则覆盖 localStorage
 * 在 React 渲染前调用，确保 hooks 能读到最新数据
 */
export async function checkAndLoadSnapshot(): Promise<void> {
  try {
    const res = await fetch('/api/snapshot')
    if (!res.ok) return

    const snapshot: Snapshot = await res.json()
    if (!snapshot?.timestamp || !snapshot?.data) return

    // 若快照时间戳与上次加载的一致，说明已是最新，跳过
    const lastLoaded = localStorage.getItem(SNAPSHOT_TS_KEY)
    if (lastLoaded === snapshot.timestamp) {
      console.log('[Snapshot] Already up-to-date, skip')
      return
    }

    // 将快照数据写入 localStorage（仅覆盖快照中存在的 key）
    for (const key of STORAGE_KEYS) {
      if (snapshot.data[key] !== undefined) {
        localStorage.setItem(key, JSON.stringify(snapshot.data[key]))
      }
    }

    localStorage.setItem(SNAPSHOT_TS_KEY, snapshot.timestamp)
    console.log(`[Snapshot] Loaded data from snapshot @ ${snapshot.timestamp}`)
  } catch {
    // 静默失败：没有快照时正常使用 localStorage 中的旧数据
    console.log('[Snapshot] No snapshot available, using localStorage')
  }
}

/**
 * 保存快照：将当前 localStorage 数据 POST 到服务器
 * 可通过 window.__saveSnapshot() 调用（供自动化使用），也可在手动刷新后调用
 */
export async function saveSnapshot(): Promise<void> {
  try {
    const data: Record<string, unknown> = {}
    for (const key of STORAGE_KEYS) {
      const item = localStorage.getItem(key)
      if (item) {
        try {
          data[key] = JSON.parse(item)
        } catch {
          // 跳过无法解析的 key
        }
      }
    }

    const timestamp = new Date().toISOString()
    const snapshot: Snapshot = { version: SNAPSHOT_VERSION, timestamp, data }

    const res = await fetch('/api/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    })

    if (res.ok) {
      localStorage.setItem(SNAPSHOT_TS_KEY, timestamp)
      console.log(`[Snapshot] Saved @ ${timestamp}`)
    }
  } catch (e) {
    console.error('[Snapshot] Save failed:', e)
  }
}

// 暴露到 window，供自动化通过 JS 执行调用
declare global {
  interface Window {
    __saveSnapshot: () => Promise<void>
  }
}
window.__saveSnapshot = saveSnapshot
