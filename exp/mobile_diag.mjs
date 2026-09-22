/**
 * 移动端诊断截图（390×844 基准）—— 四页各截一张，先看清问题再修
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { chromium } from 'playwright'

const EXE =
  'C:\\Users\\15056\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe'
const BASE = process.env.VERIFY_URL || 'http://localhost:4173'
const OUT = join(tmpdir(), 'pf_mobile')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

for (const [path, name] of [
  ['/', 'chat'],
  ['/feed', 'feed'],
  ['/persona', 'persona'],
  ['/about', 'about'],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1400)
  // 页面级横向溢出检测
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  console.log(`${name}: 横向溢出 ${overflow}px`)
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true })
}

await browser.close()
console.log(`截图目录：${OUT}`)
