/** 临时：P3-4 验收（用完即删）—— 两张图 + 内心独白 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { chromium } from 'playwright'

const SCRATCH = join(tmpdir(), 'pf_scratch')
mkdirSync(SCRATCH, { recursive: true })
const EXE =
  'C:\\Users\\15056\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe'
const BASE = process.env.VERIFY_URL || 'http://localhost:4173'

const results = []
const check = (id, ok, detail = '') => results.push(`${ok ? '✅' : '❌'} ${id} ${detail}`)

const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text())
})

const turns = [
  '我最近在学做面包，已经失败四次了',
  '我养了一只猫，叫馒头',
  '我妹妹叫小雨，她下个月要过生日了',
  '我在想，人为什么总要跟别人比来比去',
]

try {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  // 三轮，制造 3 个快照点
  for (let i = 0; i < turns.length; i++) {
    await page.fill('textarea', turns[i])
    await page.click('button:has-text("发送")')
    await page.waitForFunction(
      (n) => document.querySelectorAll('main > div').length >= n,
      2 * (i + 1),
      { timeout: 150_000 },
    )
    // 等抽取完成（状态栏不再处于「注入计数」形态）
    await page.waitForFunction(
      () => {
        const t = document.querySelector('p.h-4')?.innerText ?? ''
        return t.length > 0 && !/记忆 \d+\+\d+ 条/.test(t)
      },
      { timeout: 150_000 },
    )
    await page.waitForTimeout(600)
  }

  /* ---------- 进入档案页 ---------- */
  await page.click('a:has-text("档案")')
  await page.waitForTimeout(1000)

  /* 图 1：人设结构（不变） */
  const structSvg = page.locator('svg[aria-label="人设结构图"]')
  check('G1 人设结构图渲染', (await structSvg.count()) === 1)
  const barCount = await structSvg.locator('rect').count()
  check('G1b 六个条目都在', barCount >= 12, `rect ${barCount} 个（6 条 × 2：底轨 + 实际条）`)

  /* 图 2：演化曲线（变化） */
  const curveSvg = page.locator('svg[aria-label="演化曲线"]')
  check('G2 演化曲线渲染', (await curveSvg.count()) === 1)
  const pointCount = await curveSvg.locator('circle').count()
  // ⚠️ 快照数取决于「模型这一轮抽没抽出东西」—— 不能假设每轮都加一条。
  //    每个快照点画两条线（记忆/亲密度），所以 circle 数必为偶数且 ≥ 6（至少 3 点）。
  check('G2b 曲线点数正确（偶数且至少 3 点）', pointCount >= 6 && pointCount % 2 === 0,
    `circle ${pointCount} 个 = ${pointCount / 2} 个快照点`)

  /* 内心独白 */
  const monoBtn = page.locator('button:has-text("她在想什么")')
  check('M1 独白按钮存在', (await monoBtn.count()) === 1)

  await monoBtn.click()
  await page.waitForSelector('blockquote', { timeout: 120_000 })
  const mono = (await page.locator('blockquote').innerText()).trim()
  check('M2 独白生成了', mono.length > 0, `${mono.length} 字`)
  // 判据：**不是第三人称的描述**。开头是否「我」不重要（她可以以任何词起句），
  // 关键是别写成「她是一个…」这种角色介绍。
  const thirdPerson = /^(她是|这个角色|作为一个)/.test(mono)
  check('M3 独白是她的内心话（不是第三人称描述）', !thirdPerson, mono.slice(0, 60))

  /* ---------- 截图 ---------- */
  await page.screenshot({ path: join(SCRATCH, 'p3_s4.png'), fullPage: true })

  check('D1 无 JS 报错', errors.length === 0, errors.slice(0, 2).join(' | '))
} catch (err) {
  check('!! 执行中断', false, String(err).split('\n')[0])
  try {
    await page.screenshot({ path: join(SCRATCH, 'p3_s4_fail.png'), fullPage: true })
    results.push((await page.locator('body').innerText()).slice(0, 600))
  } catch {
    /* ignore */
  }
}

const report = ['# P3-4 验收 · 两张图 + 内心独白', `BASE=${BASE}`, '', ...results].join('\n')
writeFileSync(join(SCRATCH, 'p3_s4.out.txt'), report, 'utf8')
console.log(report)
await browser.close()
