/**
 * 模型列表自动识别 · 端到端验证
 *
 * 本地 mock 一个 OpenAI 兼容服务（8796）：
 *   GET  /v1/models          → 两个模型
 *   POST /v1/chat/completions → pong
 * 用户流：设置页新增连接（baseUrl 故意不带 /v1）→ 获取模型（应自动补 /v1
 * 并回填）→ 下拉选模型 → 添加 → 测试连通 → 对话页选中发消息 → 正常回复。
 *
 * 前端页面用 dist-server 的静态托管（8788 单进程）—— 顺带验证新托管能力。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium } from 'playwright'

const EXE =
  'C:\\Users\\15056\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe'
const BASE = 'http://localhost:8788'
const MOCK_PORT = 8796

/* ---------- mock OpenAI 兼容服务 ---------- */
const hits = { modelsPaths: [], chatBody: null }
const mock = createServer((req, res) => {
  const body = []
  req.on('data', (d) => body.push(d))
  req.on('end', () => {
    const raw = Buffer.concat(body).toString()
    if (req.method === 'GET' && req.url.endsWith('/models')) {
      hits.modelsPaths.push(req.url)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ data: [{ id: 'mock-alpha' }, { id: 'mock-beta' }] }))
      return
    }
    if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
      hits.chatBody = JSON.parse(raw)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          choices: [{ message: { content: 'pong' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 1 },
        }),
      )
      return
    }
    res.writeHead(404)
    res.end('{}')
  })
})
await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r))

/* ---------- 被测应用（单进程：API + 静态页） ---------- */
const app = spawn(process.execPath, ['dist-server/server.cjs'], {
  env: {
    ...process.env,
    PORT: '8788',
    DIST_ROOT: path.resolve('dist'),
    APP_ROOT: process.cwd(),
  },
  stdio: 'pipe',
})
await new Promise((r) => setTimeout(r, 1800))

const results = []
const check = (id, ok, detail = '') => results.push(`${ok ? '✅' : '❌'} ${id} ${detail}`)

const browser = await chromium.launch({
  executablePath:
    'C:\\Users\\15056\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } })

try {
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.setItem('tse_ai_disclosed', '1'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)

  /* ---------- M1 新增连接（baseUrl 不带 /v1）→ 获取模型 → 自动补 /v1 ---------- */
  await page.click('button:has-text("+ 新增连接")')
  const customForm = page.locator('div:has(input[placeholder*="接口地址（粘贴"])').last()
  await page.fill('input[placeholder*="名称（如"]', 'Mock服务')
  await customForm.locator('input[placeholder*="接口地址（粘贴"]').fill(`http://127.0.0.1:${MOCK_PORT}`)
  // 🔴 必须在 custom 表单容器内点按钮 —— 页面上 .env 行也有同名按钮，裸 hasText 会点错
  await customForm.locator('button:has-text("获取模型")').click()
  await page.waitForTimeout(1500)
  const hasOptions = await page.locator('select option', { hasText: 'mock-alpha' }).count()
  const filledBase = await customForm.locator('input[placeholder*="接口地址（粘贴"]').inputValue()
  check(
    'M1 获取模型：列表出现 + baseUrl 自动补 /v1',
    hasOptions >= 1 && filledBase.endsWith('/v1'),
    `baseUrl=${filledBase}`,
  )

  /* ---------- M2 选模型 → 添加 → 测试连通 ---------- */
  await customForm.locator('select:has(option[value="mock-alpha"])').selectOption('mock-alpha')
  await page.fill('input[placeholder*="API Key（本地推理服务可留空）"]', 'sk-mock')
  await page.locator('button:text-is("添加")').click()
  await page.waitForTimeout(500)
  const inList = await page.locator('li', { hasText: 'Mock服务' }).count()
  check('M2 自定义连接已保存', inList >= 1)

  // 测试连通：列表行的操作区没有测试按钮，走「编辑」表单里的测试
  await page.locator('li', { hasText: 'Mock服务' }).locator('button:has-text("编辑")').click()
  await page.waitForTimeout(300)
  await page.locator('button:text-is("测试连通")').last().click()
  await page.waitForTimeout(2000)
  const okNotice = await page.locator('text=连通（实际模型').count()
  check('M3 测试连通成功（走 mock chat）', okNotice >= 1, JSON.stringify(hits.chatBody)?.slice(0, 80))

  /* ---------- M4 对话页选中 mock 模型发消息 ---------- */
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  // 模型选择是自定义 Dropdown（footer 里 compact 按钮）→ 点开面板 → 面板内选 Mock服务
  const ddButton = page.locator('footer .relative > button').first()
  await ddButton.click()
  await page.waitForTimeout(400)
  const opt = page.locator('[role="listbox"] button', { hasText: 'Mock服务' })
  if ((await opt.count()) === 0) {
    const dump = await page.evaluate(() => ({
      listbox: document.querySelector('[role="listbox"]')?.innerText ?? '(无面板)',
    }))
    console.log('DUMP:', JSON.stringify(dump))
  }
  check('M4a 对话页模型面板出现 Mock服务', (await opt.count()) === 1)
  await opt.click()
  await page.waitForTimeout(400)
  await page.fill('textarea', 'ping')
  await page.click('button:has-text("发送")')
  await page.waitForTimeout(4000)
  const chatHit = hits.chatBody && hits.chatBody.model === 'mock-alpha'
  check('M4b 对话请求走 mock（model=mock-alpha）', chatHit === true)
} catch (e) {
  check('FATAL', false, e instanceof Error ? `${e.name}: ${e.message}` : String(e))
} finally {
  console.log('\n===== 模型列表自动识别 · 验证 =====')
  for (const r of results) console.log(r)
  console.log('models 探测路径:', hits.modelsPaths.join(' , ') || '(未命中)')
  const failed = results.filter((r) => r.startsWith('❌')).length
  console.log(`\n${failed === 0 ? '🎉 全部通过' : `💥 ${failed} 项失败`}`)
  await browser.close()
  mock.close()
  app.kill()
  process.exit(failed === 0 ? 0 : 1)
}
