import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { checkAndLoadSnapshot } from './utils/snapshot.ts'
import './index.css'

// 启动时先尝试从服务器快照加载数据（若有比 localStorage 更新的快照）
// 加载完成后再渲染 React，确保 hooks 能读到最新数据
checkAndLoadSnapshot().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
