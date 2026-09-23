/**
 * .env 读取 —— 只做「读文件」，不引 dotenv。
 * 从 server/index.mjs 拆出来，是为了让路由文件守住 D003 的 200 行硬约束。
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 🔴 项目根不要用 fileURLToPath(import.meta.url) 推导：
 * esbuild 打成 CJS bundle 后 import.meta.url 是 undefined（桌面端必炸）。
 * 优先读调用方注入的 APP_ROOT（Electron 主进程设置），命令行回落 cwd。
 */
const ROOT = process.env.APP_ROOT ? resolve(process.env.APP_ROOT) : resolve(process.cwd())

/** 解析一份 .env，返回键值对。支持 # 注释、引号包裹、空行。 */
export function loadEnvFile(path) {
  const out = {}
  if (!existsSync(path)) return out

  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq < 0) continue

    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()

    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

/**
 * 合并三层来源，优先级从低到高：
 *   .env.example（占位值） → .env（真实密钥） → process.env（部署时注入）
 */
export function loadEnv() {
  return {
    ...loadEnvFile(resolve(ROOT, '.env.example')),
    ...loadEnvFile(resolve(ROOT, '.env')),
    ...process.env,
  }
}
