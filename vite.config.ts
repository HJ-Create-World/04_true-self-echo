import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// 开发阶段：前端与薄后端分离运行（D003「开发阶段用 Vite 代理可合并」）
// /api/* 一律转发到 server/index.mjs，API Key 只留在 Node 进程里，不进浏览器。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.BACKEND_ORIGIN || 'http://127.0.0.1:8787'

  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
        },
      },
    },
    // `vite preview` 跑的是构建产物。**同样要挂代理** ——
    // 否则预览时 /api 全 404，验收只能对着 dev server 做，
    // 而 dev server 的 HMR 会在验收过程中重载页面、清空应用状态
    // （2026-09-20 实测：一次验收里页面自己重载了 5 次）。
    // 用构建产物验收还有个额外好处：验的就是真要发布的那份代码。
    preview: {
      port: 4173,
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      // 构建产物里绝不出现密钥：后端只以反向代理形式参与，不打包进前端
      sourcemap: false,
    },
  }
})
