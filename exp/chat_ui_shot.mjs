/** 对话页 UI 重排视觉验证：顶栏统一字号 / 自定义下拉 / footer 模型按钮 */
import { chromium } from 'playwright'

const EXE =
  'C:\\Users\\15056\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe'
const BASE = process.env.VERIFY_URL || 'http://localhost:4173'
const OUT = 'C:/Users/15056/AppData/Local/Temp/pf_mobile'

const browser = await chromium.launch({ executablePath: EXE })

// 桌面
const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await desktop.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await desktop.evaluate(() => localStorage.setItem('tse_ai_disclosed', '1'))
await desktop.reload({ waitUntil: 'domcontentloaded' })
await desktop.waitForTimeout(1200)
// 打开模型下拉看风格
await desktop.locator('footer .relative button').first().click()
await desktop.waitForTimeout(400)
await desktop.screenshot({ path: `${OUT}/chat-desktop-dropdown.png` })
await desktop.keyboard.press('Escape')

// 溢出检测
const overflow = await desktop.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
)
console.log('桌面溢出:', overflow)

// 移动
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await mobile.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await mobile.waitForTimeout(1200)
const mOverflow = await mobile.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
)
console.log('移动溢出:', mOverflow)
await mobile.screenshot({ path: `${OUT}/chat-mobile.png` })

await browser.close()
