/**
 * 自定义模型连接全链路验证
 *
 * ① 设置页新增「测试自定义」（baseUrl 指向一个必然拒绝连接的地址）
 * ② 对话页模型下拉出现它 → 选中 → 发消息 → 应报「连接失败」类错误
 *    （证明请求发往了自定义地址，而不是 .env 的 deepseek —— 那会返回 401 或正常回复）
 * ③ 设置页删除 → 下拉消失
 */
import { chromium } from 'playwright'

const EXE =
  'C:\\Users\\15056\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe'
const BASE = process.env.VERIFY_URL || 'http://localhost:4173'

const results = []
const check = (id, ok, detail = '') => results.push(`${ok ? '✅' : '❌'} ${id} ${detail}`)

const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } })

/** 网络证据：/api/chat 的请求体与响应 */
const chatCalls = []
page.on('request', (r) => {
  if (r.url().includes('/api/chat') && r.method() === 'POST') {
    let provider = '?'
    let hasOverride = false
    try {
      const b = JSON.parse(r.postData() ?? '{}')
      provider = b.provider
      hasOverride = Boolean(b.override)
    } catch { /* ignore */ }
    chatCalls.push({ provider, hasOverride, resp: '' })
  }
})
page.on('response', async (r) => {
  if (r.url().includes('/api/chat') && r.request().method() === 'POST') {
    const last = chatCalls[chatCalls.length - 1]
    if (last) {
      try {
        const j = await r.json()
        last.resp = `${r.status()} ${String(j.error ?? j.content ?? '').slice(0, 60)}`
      } catch {
        last.resp = String(r.status())
      }
    }
  }
})
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))

try {
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    localStorage.setItem('tse_ai_disclosed', '1')
    localStorage.removeItem('tse.apiConfig')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)

  /* ---------- C1 新增自定义连接 ---------- */
  await page.click('button:has-text("+ 新增连接")')
  await page.fill('input[placeholder*="名称（如"]', '测试自定义')
  await page.fill('input[placeholder*="模型名（如"]', 'test-model')
  await page.fill('input[placeholder*="接口地址（到"]', 'http://127.0.0.1:9/v1')
  await page.click('button:has-text("添加")')
  await page.waitForTimeout(500)
  const inList = await page.locator('li', { hasText: '测试自定义' }).count()
  check('C1 自定义连接出现在列表', inList >= 1)

  /* ---------- C2 编辑（改模型名） ---------- */
  await page.locator('li', { hasText: '测试自定义' }).locator('button:has-text("编辑")').click()
  await page.fill('input[placeholder*="模型名（如"]', 'test-model-v2')
  await page.click('button:has-text("保存修改")')
  await page.waitForTimeout(400)
  const edited = await page.locator('li', { hasText: 'test-model-v2' }).count()
  check('C2 编辑连接生效（模型名更新）', edited >= 1)

  /* ---------- C3 对话页下拉出现 + 选中后走自定义地址 ---------- */
  await page.click('a:has-text("对话")')
  await page.waitForTimeout(1000)
  const opt = page.locator('select[aria-label="切换模型服务"] option', { hasText: '测试自定义' })
  check('C3a 对话页模型下拉出现自定义连接', (await opt.count()) === 1)
  await page.selectOption('select[aria-label="切换模型服务"]', { label: (await opt.innerText()).trim() })
  await page.fill('textarea', '连通测试。')
  await page.click('button:has-text("发送")')
  let errText = ''
  try {
    const errLoc = page.locator('p', { hasText: /失败|ECONNREFUSED|fetch|500|502/i }).first()
    await errLoc.waitFor({ timeout: 30_000 })
    errText = await errLoc.innerText()
  } catch {
    /* 无错误 = 失败 */
  }
  if (!/失败|ECONNREFUSED|fetch|500|502/i.test(errText) || /401/.test(errText)) {
    const dump = await page.evaluate(() => {
      const sel = document.querySelector('select[aria-label="切换模型服务"]')
      const opts = sel
        ? Array.from(sel.options).map((o) => `${o.value}|${o.textContent?.trim()}|sel=${o.selected}`)
        : []
      const status = document.querySelector('footer p.h-4')?.textContent ?? ''
      return { selected: sel?.value ?? '', opts, status }
    })
    console.log('DUMP:', JSON.stringify(dump, null, 2))
    console.log('CHAT CALLS:', JSON.stringify(chatCalls, null, 2))
  }
  check(
    'C3b 请求真的发往自定义 baseUrl（连接被拒而非 401）',
    /失败|ECONNREFUSED|fetch|500|502|网络/i.test(errText) && !/401/.test(errText),
    errText.slice(0, 90),
  )

  /* ---------- C4 删除 → 下拉消失 ---------- */
  await page.click('a:has-text("设置")')
  await page.waitForTimeout(1000)
  page.once('dialog', (d) => d.accept())
  await page.locator('li', { hasText: '测试自定义' }).locator('button:has-text("删除")').click()
  await page.waitForTimeout(500)
  const gone = await page.locator('li', { hasText: '测试自定义' }).count()
  await page.click('a:has-text("对话")')
  await page.waitForTimeout(800)
  const optGone = await page
    .locator('select[aria-label="切换模型服务"] option', { hasText: '测试自定义' })
    .count()
  check('C4 删除后列表与下拉都消失', gone === 0 && optGone === 0)
} catch (e) {
  check('FATAL', false, e instanceof Error ? `${e.name}: ${e.message}` : String(e))
} finally {
  console.log('\n===== 自定义模型连接 · 验证 =====')
  for (const r of results) console.log(r)
  const failed = results.filter((r) => r.startsWith('❌')).length
  console.log(`\n${failed === 0 ? '🎉 全部通过' : `💥 ${failed} 项失败`}`)
  await browser.close()
  process.exit(failed === 0 ? 0 : 1)
}
