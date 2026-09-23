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
const { app, BrowserWindow, shell, dialog } = require('electron')
const { join } = require('path')
const { pathToFileURL } = require('url')
const net = require('net')

/** 窗口引用（防 GC 关窗） */
let win = null

const URL_BASE = { port: 8787 }

/**
 * 从 preferred 开始找一个空闲端口。
 * 🔴 探测必须与 server 同绑定面：server listen 0.0.0.0（全接口），
 * 探测若只测 127.0.0.1，会漏掉「局域网接口被占」的冲突 ——
 * 第一版就这么漏的：探测说空闲、listen 炸 EADDRINUSE（HJ 截图实证）。
 */
function findFreePort(preferred) {
  return new Promise((resolve) => {
    const tryPort = (port) => {
      const s = net.createServer()
      s.once('error', () => (port >= preferred + 20 ? resolve(preferred) : tryPort(port + 1)))
      s.once('listening', () => s.close(() => resolve(port)))
      s.listen(port) // 不指定 host = 全接口，与 server 行为一致
    }
    tryPort(preferred)
  })
}

/**
 * 🔴 单实例锁：重复双击 exe 不开第二个实例，而是唤起已有窗口 ——
 * 没有它，第二个实例的内置后端会撞第一个实例的端口，弹出 EADDRINUSE 报错
 * （HJ 双击打不开的第二个根因）。
 */
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // 已经有实例在跑：安静退出（requestSingleInstanceLock 让那个实例收到 second-instance）
  app.quit()
} else {
  // 🔴 禁用硬件加速：部分机器上 GPU 进程崩溃会连锁带走主进程
  // （STATUS_BREAKPOINT，窗口闪退）—— 表单类 UI 不需要 GPU
  app.disableHardwareAcceleration()
}

let actualPort = 8787

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
    if (url.startsWith(baseURL())) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.loadURL(baseURL())
}

function baseURL() {
  return `http://127.0.0.1:${actualPort}`
}

/** 启动内置后端 —— esbuild 预打的纯 JS CJS bundle。
 *  🔴 dist-server 与 dist 被 asarUnpack 到真实文件系统（app.asar.unpacked）——
 *  asar 内的 ESM/动态加载不可靠（实测窗口开了、后端静默没监听），
 *  unpack 后 require / readFileSync 全部走真实 fs，行为与命令行模式完全一致 */
function startBackend() {
  const unpackedRoot = join(__dirname, '..').replace('app.asar', 'app.asar.unpacked')
  process.env.APP_ROOT = unpackedRoot
  process.env.DIST_ROOT = join(unpackedRoot, 'dist')
  process.env.PORT = String(actualPort)
  require(join(unpackedRoot, 'dist-server', 'server.cjs'))
}

/** 兜底：任何未捕获异常/拒绝都弹窗告知，而不是无声闪退（分发后用户看不到控制台） */
process.on('uncaughtException', (err) => {
  dialog.showErrorBox('真我回响遇到了问题', String(err?.stack ?? err))
})
process.on('unhandledRejection', (err) => {
  dialog.showErrorBox('真我回响遇到了问题', String(err?.stack ?? err))
})

app.on('second-instance', () => {
  // 第二个实例双击时走到这里（在第一个实例内）：唤起已有窗口
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.whenReady().then(async () => {
  actualPort = await findFreePort(URL_BASE.port)
  startBackend()
  // 后端 listen 是同步注册的，给一小段启动时间再开窗
  setTimeout(createWindow, 600)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
