/**
 * 连发消息 E2E（Playwright · 生产构建 · mock 上游）
 *
 * 跑法：先 `npm run build && npm run server`（8787 托管 dist），再
 *   node exp/burst_e2e.mjs
 *
 * 验的是纯前端逻辑（不依赖真实模型）：
 *   1. AI 连发：mock 返回带空行的 content → UI 拆成 3 条气泡逐条出现
 *      （第一条先出现，第二条尚未出现 —— 打字节奏）
 *   2. 用户连发：AI 生成期间发送第二条 → 不丢失，AI 回完作为下一轮处理
 *   3. 消息形态：历史里 assistant 是 3 条独立消息（落库粒度正确）
 */

import { chromium } from 'playwright'

// 与既有 E2E（compliance_e2e 等）同款：本机已装的 chromium，不重新下载
const EXE = 'C:\\Users\\15056\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe'

const BASE = 'http://127.0.0.1:8787'
const results = []
const check = (id, ok, detail = '') => results.push(`${ok ? '✅' : '❌'} ${id} ${detail}`)

let turn = 0

const browser = await chromium.launch({ executablePath: EXE })
const context = await browser.newContext()
// 首访 AI 披露遮罩直接放行（E2E 关注的是连发，不是首访流程）
// 独白显示开关打开（默认关）—— 内联独白 E2E 依赖它
await context.addInitScript(() => {
  localStorage.setItem('tse_ai_disclosed', '1')
  localStorage.setItem(
    'tse_proactive_config',
    JSON.stringify({ silenceMinutes: 10, maxUnanswered: 2, greetingGapHours: 6, monologuePrefix: true }),
  )
})
const page = await context.newPage()

// mock /api/chat：第一轮回 3 条（空行分隔），第二轮回 1 条 + 内联独白
await page.route('**/api/chat', async (route) => {
  const reply =
    turn === 0
      ? 'A1 第一条\n\nA2 第二条\n\nA3 第三条'
      : '〔心想〕他连发两条，应该是有很多话想说\n\nB1 回应你刚才连发的话'
  turn += 1
  await new Promise((r) => setTimeout(r, 900)) // 模拟生成延迟（加大以稳定「逐条节奏」断言的窗口）
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      content: reply,
      usage: { prompt: 100, completion: 50, cacheHit: 0, reasoning: 0 },
      finishReason: 'stop',
      elapsedMs: 500,
      retries: 0,
      degraded: false,
      provider: 'mock',
      model: 'mock-model',
    }),
  })
})

await page.goto(BASE)

const input = page.locator('textarea')
const sendBtn = page.locator('button', { hasText: '发送' })

await input.waitFor({ state: 'visible', timeout: 15000 })

/* ---------- 1. 发第一条，AI 连发 3 条 ---------- */
await input.fill('你好呀')
await sendBtn.click()

// mock 500ms 后返回；第一条立即出现，第二条要等 burstDelay(A1)≈760ms
await page.waitForTimeout(1050)
const bubbleTexts = async () =>
  (await page.locator('main .space-y-6 > div, main').allTextContents()).join('\n')
const earlyText = await page.locator('main').innerText()
check('第一条已出现（含 A1）', earlyText.includes('A1 第一条'))
check('第二条尚未出现（逐条节奏）', !earlyText.includes('A2 第二条'))

// 等剩余两条出完（A2/A3 延迟 + 余量）
await page.waitForTimeout(5000)
const afterText = await page.locator('main').innerText()
check('三条全部出现', afterText.includes('A2 第二条') && afterText.includes('A3 第三条'))
check('生成结束（streaming 释放）', !(await page.locator('text=正在回响').isVisible().catch(() => false)))

/* ---------- 2. 生成期间用户连发 ---------- */
// 上一轮已结束，重新触发：发一条，立刻在生成窗口内再发一条
await input.fill('U2 第一发')
await sendBtn.click()
await page.waitForTimeout(150) // 落在 500ms mock 延迟窗口内 → 应入队
await input.fill('U2 第二发（生成中）')
await sendBtn.click()

// 等两轮 mock 延迟 + 独白与 B1 显示
await page.waitForTimeout(5000)
const finalText = await page.locator('main').innerText()
check('排队消息没有丢（U2 第二发可见）', finalText.includes('U2 第二发（生成中）'))
check('第二轮回复出现（B1）', finalText.includes('B1 回应你刚才连发的话'))
check('两条用户消息独立落库（文本都在）', finalText.includes('U2 第一发') && finalText.includes('U2 第二发（生成中）'))

/* ---------- 2b. 内联独白（〔心想〕→ 「她心想」小字，正文剥离） ---------- */
check('独白显示（她心想）', finalText.includes('她心想：他连发两条，应该是有很多话想说'))
check('独白从正文剥离（正文只有 B1）', !finalText.includes('〔心想〕'))

/* ---------- 3. 刷新后历史形态（落库粒度） ---------- */
await page.reload()
await page.waitForTimeout(1500)
const reloaded = await page.locator('main').innerText()
check(
  '刷新后连发仍是 3 条独立消息',
  reloaded.includes('A1 第一条') && reloaded.includes('A2 第二条') && reloaded.includes('A3 第三条'),
)

await browser.close()

const failed = results.filter((r) => r.startsWith('❌'))
console.log(results.join('\n'))
console.log(`\n${failed.length === 0 ? '✅ E2E 全部通过' : `❌ ${failed.length} 项失败`}（共 ${results.length} 项）`)
process.exit(failed.length === 0 ? 0 : 1)
