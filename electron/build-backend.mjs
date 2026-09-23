/**
 * 桌面端构建：esbuild 把薄后端依赖链（含 .ts 源文件）打成一个纯 JS bundle。
 *
 * 为什么需要：server/index.mjs 直接 import ../src/api/*.ts（本机 Node 22.18+
 * 可以 strip-types 直跑），但 **Electron 内置 Node 是 22.14，不支持** ——
 * 打包后的应用必须拿到纯 JS。esbuild 顺带 ESM→CJS（主进程 cjs 动态 import 友好）。
 *
 * 跑法：node electron/build-backend.mjs（electron:dev / electron:build 的第一步）
 */
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'

mkdirSync('dist-server', { recursive: true })

await build({
  entryPoints: ['server/index.mjs'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist-server/server.cjs',
  // 运行时依赖（http/os/fs/path/url）都是 Node 内置，全部外部化由 Electron 提供
  packages: 'external',
  target: 'node20',
  sourcemap: false,
  logLevel: 'silent',
})

console.log('dist-server/server.cjs ✓')
