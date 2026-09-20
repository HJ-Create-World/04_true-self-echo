/**
 * P3-2 验收 · 记忆的生成、检索与注入
 *
 * **完成标准①：「对话里说的信息下一轮被用上」**
 *
 * 判据不能是「数据库里有了卡片」—— 那只证明存了。
 * 必须抓**第 2 轮真正发出去的 system**，确认记忆已经在里面。
 *
 * ## 跑法
 *
 * ```
 * node_modules\@esbuild\win32-x64\esbuild.exe exp\p3_s2_memory_inject.mjs \
 *   --bundle --platform=node --format=esm --outfile=exp\_s2.mjs
 * node exp\_s2.mjs
 * ```
 * （需要薄后端与构建产物预览都起着，见 RUNBOOK）
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { chromium } from 'playwright'

const SCRATCH = join(tmpdir(), 'pf_scratch')
mkdirSync(SCRATCH, { recursive: true })

const EXE =
  'C:\\Users\\15056\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe'
const BASE = process.env.VERIFY_URL || 'http://localhost:4173'

/** 哨兵：第 1 轮说的事实，第 2 轮必须出现在 system 里 */
const FACT = '我妹妹叫小雨，她下个月要过生日了'

const results = []
const check = (id, ok, detail = '') => results.push(`${ok ? '✅' : '❌'} ${id} ${detail}`)

const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text())
})

const chatReqs = []
page.on('request', (r) => {
  if (r.method() !== 'POST' || !r.url().includes('/api/chat')) return
  try {
    const b = JSON.parse(r.postData() ?? '{}')
    if (String(b.system ?? '').startsWith('你在扮演一个人')) chatReqs.push(b)
  } catch {
    /* ignore */
  }
})

async function readPersonaRow() {
  return page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('true-self-echo')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const rows = await new Promise((res) => {
      const rq = db.transaction('personas', 'readonly').objectStore('personas').getAll()
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => res([])
    })
    db.close()
    const withMem = rows.map((r) => ({ id: r.id, mem: r.profile?.evolving?.memories ?? [] }))
    withMem.sort((a, b) => b.mem.length - a.mem.length)
    return withMem[0] ?? { id: null, mem: [] }
  })
}

/**
 * 等一轮彻底结束（回复 + 记忆抽取都落定）。
 *
 * 🔴 **不能只等请求发出**：`waitChatCount(2)` 只等到「抽取请求已发出」，
 * 此时响应还没回来、`saveEvolving` 还没执行，读库是 0 张 → 误判成「没生成记忆」。
 * （2026-09-20 实测踩过。）
 *
 * 可靠信号：抽取完成后状态栏必然变成 `记忆 +N…` / `+0（没有值得记的）` /
 * `（本条太短，未抽取记忆）` / `⚠️ 失败` 之一 —— **都不含「N+M 条」这个注入计数形态**。
 * 所以「注入计数消失」= 抽取已完成。
 */
async function waitTurnDone(minDomChildren) {
  await page.waitForFunction(
    (n) => document.querySelectorAll('main > div').length >= n,
    minDomChildren,
    { timeout: 120_000 },
  )
  await page.waitForFunction(
    () => {
      const t = document.querySelector('p.h-4')?.innerText ?? ''
      return t.length > 0 && !/记忆 \d+\+\d+ 条/.test(t)
    },
    { timeout: 120_000 },
  )
  await page.waitForTimeout(300)
}

let system2 = ''

try {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  /* ---------- 第 1 轮：说出值得记的事实 ---------- */
  await page.fill('textarea', FACT)
  await page.click('button:has-text("发送")')
  await waitTurnDone(2)

  const mem1 = await readPersonaRow()
  check('P1 第 1 轮后生成了记忆卡片', mem1.mem.length > 0, `共 ${mem1.mem.length} 张`)
  const hit = mem1.mem.find(
    (m) => m.content.includes('小雨') || m.triggers.some((t) => t.includes('小雨')),
  )
  check(
    'P1b 卡片内容对得上',
    !!hit,
    hit ? `${hit.kind}：${hit.content} [${hit.triggers.join(',')}]` : '(未找到含小雨的卡片)',
  )

  /* ---------- 第 2 轮：换一句不含触发词的话 ---------- */
  await page.fill('textarea', '你在想什么呢？')
  await page.click('button:has-text("发送")')
  await waitTurnDone(4)

  system2 = chatReqs[chatReqs.length - 1]?.system ?? ''

  /* ---------- 核心断言：完成标准① ---------- */
  check(
    '① 第 2 轮的 system 里包含了第 1 轮说的事',
    system2.includes('小雨'),
    system2.includes('小雨') ? '' : '—— 完成标准① 不成立',
  )

  const blockStart = system2.indexOf('## 关于对方的事')
  const tailIdx = system2.lastIndexOf('不追问，不长篇安慰')
  check(
    '①b 记忆区在人格正文之后、尾约束之前（三明治保住）',
    blockStart > 0 && tailIdx > blockStart,
    `记忆区位置=${blockStart} · 尾约束位置=${tailIdx}`,
  )
  check('①c 尾约束仍在最末（E5 验证过的不变量）', system2.trimEnd().endsWith('对方不想说，就不说。'))

  /* ---------- 太短的输入跳过抽取 ---------- */
  const before = (await readPersonaRow()).mem.length
  await page.fill('textarea', '嗯')
  await page.click('button:has-text("发送")')
  await page.waitForFunction(() => document.querySelectorAll('main > div').length >= 6, {
    timeout: 120_000,
  })
  await page.waitForTimeout(2000)
  const after = (await readPersonaRow()).mem.length
  check('P2 太短的输入不跑抽取（卡片数不变）', after === before, `${before} → ${after}`)

  /* ---------- 去重：重复说同一件事 ---------- */
  await page.fill('textarea', '对了，再跟你讲一次，我妹妹叫小雨。')
  await page.click('button:has-text("发送")')
  await waitTurnDone(8)
  await page.waitForTimeout(300)

  const finalMem = (await readPersonaRow()).mem
  const dupes = finalMem.filter((m) => m.content.includes('小雨')).length
  check('P3 重复事实被去重（小雨相关卡片 ≤ 2）', dupes <= 2, `小雨相关卡片 ${dupes} 张`)

  check('D1 无 JS 报错', errors.length === 0, errors.slice(0, 2).join(' | '))

  await page.screenshot({ path: join(SCRATCH, 'p3_s2.png'), fullPage: true })
} catch (err) {
  check('!! 执行中断', false, String(err).split('\n')[0])
  try {
    await page.screenshot({ path: join(SCRATCH, 'p3_s2_fail.png'), fullPage: true })
  } catch {
    /* ignore */
  }
}

const report = [
  '# P3-2 验收 · 记忆的生成与注入（完成标准①）',
  `BASE=${BASE}`,
  `第 2 轮 system 长度：${system2.length}`,
  '',
  ...results,
].join('\n')
writeFileSync(join(SCRATCH, 'p3_s2.out.txt'), report, 'utf8')
console.log(report)
await browser.close()
