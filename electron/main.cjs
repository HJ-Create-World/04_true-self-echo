/**
 * Electron 主进程（2026-09-23 · 路线二桌面端）
 *
 * 架构：主进程 = Node 运行时 → 直接 import 薄后端（含 dist 静态托管）→
 * 窗口加载 http://127.0.0.1:8787。**零架构改动**：网页版/局域网版/Electron 版
 * 跑的是同一份代码，区别只是「谁托管谁」。
 *
 * ⚠️ Electron 主进程是 CJS/ESM 混用敏感区：package.json type=module，
 * 本文件用 .cjs 保稳定（Electron 28+ 主进程 ESM 也可，但不值得为此折腾）。
 */
const { app, BrowserWindow, shell } = require('electron')
const { join } = require('path')

/** 窗口引用（防 GC 关窗） */
let win = null

/** 后端端口 —— 与 server/index.mjs 的 PORT 环境变量对齐 */
const PORT = process.env.PORT || '8787'
const URL = `http://127.0.0.1:${PORT}`

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 380,
    minHeight: 600,
    autoHideMenuBar: true,
    title: '真我回响',
    webPreferences: {
      // 🔴 安全基线：渲染进程不持 Node 能力 —— 前端代码与网页版完全同权
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  // 外部链接（GitHub 等）交给系统浏览器，不在应用内开新窗
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(URL)) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.loadURL(URL)
}

/** 启动内置后端（server/index.mjs 是 ESM —— cjs 里只能动态 import） */
async function startBackend() {
  await import(join(__dirname, 'server', 'index.mjs'))
}

app.whenReady().then(async () => {
  await startBackend()
  // 后端 listen 是同步注册的，给一小段启动时间再开窗
  setTimeout(createWindow, 600)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
