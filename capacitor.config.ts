import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 配置（安卓端 · 2026-09-23）
 *
 * 🔴 CapacitorHttp enabled：把 window.fetch patch 到**原生 HTTP 层** ——
 * WebView 里 fetch 直连模型 API 不受 CORS 限制（桌面浏览器不行，所以
 * 直连模式只在 APK 里启用，网页版继续走本机薄后端）。
 *
 * APK 内没有 Node 后端 —— 模型连接全部来自「设置」页的自定义连接
 * （baseUrl + 模型名 + 用户自己的 API Key），发送时由前端直连。
 */
const config: CapacitorConfig = {
  // 🔴 包名不能用 true（Java 关键字）—— trueself 连写
  appId: 'app.trueself.echo',
  appName: '真我回响',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
