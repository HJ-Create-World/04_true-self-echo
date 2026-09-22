/**
 * 前端 API 配置（override 链路）验证
 *
 * 思路：没有真实的新 key 可用，但可以证明「请求里带的 key 真的到达了上游」——
 *   ① localStorage 配一个错误的 deepseek key → 发消息 → 应得到上游鉴权错误
 *   ② 清掉 override → 发消息 → 用 .env 的正确 key，恢复正常
 * 能错能对 = 覆盖链路真实生效（如果 override 没被转发，① 会静默成功）。
 */
import { chromium } from 'playwright'

const EXE =
  'C:\\Users\\15056\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe'
const BASE = process.env.VERIFY_URL || 'http://localhost:4173'

const results = []
const check = (id, ok, detail = '') => results.push(`${ok ? '✅' : '❌'} ${id} ${detail}`)

const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } })

/** assistant 气泡计数（直接数 DB，UI 结构变了也不影响） */
async function assistantCount() {
  return page.evaluate(async () => {
    const open = () =>
      new Promise((res, rej) => {
        const r = indexedDB.open('true-self-echo')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
    const db = await open()
    const rows = await new Promise((res) => {
      const rq = db.transaction('messages', 'readonly').objectStore('messages').getAll()
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => res([])
    })
    db.close()
    return rows.filter((m) => m.role === 'assistant').length
  })
}

async function send(text) {
  await page.fill('textarea', text)
  await page.click('button:has-text("发送")')
}

/** 错误条 = 恰好含错误语义的提示行（避开同色系的其他元素） */
const ERR_LOC = page.locator('p', { hasText: /401|无效|失效|Incorrect|Unauthorized|api key/i })

try {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  // 🔴 先确认 AI 遮罩（否则它挡住发送，且它的标题会污染同色系选择器）
  await page.evaluate(() => localStorage.setItem('tse_ai_disclosed', '1'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)

  /* ---------- O1 错误 key → 上游鉴权错误浮出 ---------- */
  await page.evaluate(() =>
    localStorage.setItem('tse.apiConfig', JSON.stringify({ deepseek: { apiKey: 'sk-invalid-override-test' } })),
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await send('链路测试，请忽略。')
  let errText = ''
  try {
    await ERR_LOC.first().waitFor({ timeout: 45_000 })
    errText = await ERR_LOC.first().innerText()
  } catch {
    /* 超时按失败处理 */
  }
  check('O1 override 生效：错误 key 触发上游报错', /401|invalid|密钥|key|api/i.test(errText), errText.slice(0, 100))

  /* ---------- O2 清掉 override → 恢复正常 ---------- */
  const before = await assistantCount()
  await page.evaluate(() => localStorage.removeItem('tse.apiConfig'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await send('连通了吗？回一个字就好。')
  await page.waitForTimeout(50_000) // 等扮演 + 抽取全部落库
  const after = await assistantCount()
  const errAfter = await ERR_LOC.count()
  check('O2 清除 override 后恢复正常对话', after > before && errAfter === 0, `assistant ${before}→${after}, err=${errAfter}`)

  /* ---------- O3 设置页可达 ---------- */
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  const panel = await page.locator('text=模型服务').first().isVisible()
  const testBtn = await page.locator('button:has-text("测试连通")').count()
  check('O3 设置页渲染（服务列表 + 测试连通按钮）', panel && testBtn >= 1, `providers 行按钮=${testBtn}`)
} catch (e) {
  check('FATAL', false, e instanceof Error ? `${e.name}: ${e.message}` : String(e))
} finally {
  console.log('\n===== 前端 API 配置 · 验证 =====')
  for (const r of results) console.log(r)
  const failed = results.filter((r) => r.startsWith('❌')).length
  console.log(`\n${failed === 0 ? '🎉 全部通过' : `💥 ${failed} 项失败`}`)
  await browser.close()
  process.exit(failed === 0 ? 0 : 1)
}
