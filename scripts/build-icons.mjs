/**
 * 三端图标资产生成（2026-09-23 · 水晶折射风格，HJ 选定）
 *
 * 源图：design/icon-candidates/App_icon_design__translucent_c_*.png（1024）
 * 产物：
 *   - build-assets/icon.ico            → Electron（win.icon）
 *   - build-assets/icon-foreground.png → Android 自适应图标前景（66% 安全区）
 *   - build-assets/icon-background.png → Android 自适应图标背景（纯色拉取自源图角落）
 *   - dist 内 favicon 由前端构建单独处理（可后置）
 *
 * 跑法：node android/build-icons.mjs
 */
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve('.')
const CAND = join(ROOT, 'design', 'icon-candidates')
const OUT = join(ROOT, 'build-assets')
mkdirSync(OUT, { recursive: true })

const src = join(CAND, readdirSync(CAND).find((f) => f.startsWith('App_icon_design__translucent')))
if (!src || !existsSync(src)) throw new Error('找不到水晶折射源图')
console.log('源图:', src.split('\\').pop())

// ① 桌面 .ico：🔴 必须是**多尺寸集**（256 为上限）—— 1024 单张 NSIS 会报
//    「invalid icon file size」。sharp 缩放出标准阶梯再打包。
import sharp from 'sharp'

const pngBuffer = readFileSync(src)
const icoSizes = [256, 128, 64, 48, 32, 16]
const icoPngs = await Promise.all(
  icoSizes.map((s) => sharp(src).resize(s, s).png().toBuffer()),
)
const ico = await pngToIco(icoPngs)
writeFileSync(join(OUT, 'icon.ico'), ico)
console.log('icon.ico ✓（多尺寸:', icoSizes.join('/'), '）')

// ② Android 自适应图标：背景 = 源图边缘主色纯色 + 前景 = 原图（@capacitor/assets 会再裁安全区）
//    前景要求透明背景外扩 —— 简化处理：直接用原方形图作为前景层，背景用淡粉纯色，
//    capacitor/assets 的 icon-only.png 用原图整体。
writeFileSync(join(OUT, 'icon.png'), pngBuffer)
console.log('icon.png（1024 全尺寸）✓')

console.log('\n产物目录:', OUT)
