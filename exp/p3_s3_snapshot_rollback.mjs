/**
 * 临时：P3-3 验收（用完即删）
 *
 * 核心是完成标准③：「能回滚到**任意**历史快照」。
 *
 * 判据同样不能只看「点了按钮没报错」—— 必须验证四件事：
 *   R1 快照在「真实变化」后才生成（无变化的一轮不该有快照）
 *   R2 回滚后，库里的人格状态**等于**目标快照的状态
 *   R3 回滚本身会留一条快照（否则回滚不可逆，等于删历史）
 *   R4 frozenHash 全程恒定（AI 没改冻结层）
 *   R5 回滚后，对话 store 的内存副本也同步了 ——
 *      不然下一轮还会用回滚前的记忆（跨 store 不同步是最隐蔽的 bug）
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

const FACT_A = '我最近在学做面包，已经失败四次了'
const FACT_B = '我养了一只猫，叫馒头'

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

async function readState() {
  return page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('true-self-echo')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const persons = await new Promise((res) => {
      const rq = db.transaction('personas', 'readonly').objectStore('personas').getAll()
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => res([])
    })
    const snaps = await new Promise((res) => {
      const rq = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll()
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => res([])
    })
    db.close()
    const withMem = persons.map((p) => ({
      id: p.id,
      evolving: p.profile?.evolving,
      frozen: p.profile?.frozen,
    }))
    withMem.sort(
      (a, b) => (b.evolving?.memories?.length ?? 0) - (a.evolving?.memories?.length ?? 0),
    )
    const sorted = snaps.sort((a, b) => String(a.at).localeCompare(String(b.at)))
    return {
      personaId: withMem[0]?.id ?? null,
      memories: (withMem[0]?.evolving?.memories ?? []).map((m) => m.content),
      snapshotCount: sorted.length,
      /** 每个快照里「面包/馒头」在不在，用来比对回滚目标 */
      snapMem: sorted.map((s) => ({
        at: s.at,
        id: s.id,
        frozenHash: s.frozenHash,
        summary: s.triggerSummary,
        hasBread: JSON.stringify(s.evolving).includes('面包'),
        hasCat: JSON.stringify(s.evolving).includes('馒头'),
      })),
    }
  })
}

/**
 * 等一轮彻底结束（回复 + 抽取 + 快照都落定）。
 *
 * 🔴 **两次踩同一个坑（2026-09-20）**：状态栏会先出现「记忆 1+0 条」——
 * 那是**注入计数**（发送前写的），不是抽取结果。等它出现就去读库，
 * 读到的是**上一轮**的状态，每条断言都会错位一轮。
 *
 * 可靠信号：抽取完成后状态栏必然变成这几种之一 ——
 *   `记忆 +N（抽到 M，共 K）` / `记忆 +0（没有值得记的）` /
 *   `（本条太短，未抽取记忆）` / `⚠️ 记忆抽取失败`
 * 它们的共同点：**都不含「N+M 条」这个注入计数形态**。
 * 所以「注入计数消失」= 抽取已完成。
 */
async function waitTurnDone(minDomChildren) {
  await page.waitForFunction(
    (n) => document.querySelectorAll('main > div').length >= n,
    minDomChildren,
    { timeout: 150_000 },
  )
  await page.waitForFunction(
    () => {
      const t = document.querySelector('p.h-4')?.innerText ?? ''
      return t.length > 0 && !/记忆 \d+\+\d+ 条/.test(t)
    },
    { timeout: 150_000 },
  )
  await page.waitForTimeout(800)
}

async function send(text) {
  await page.fill('textarea', text)
  await page.click('button:has-text("发送")')
}

try {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  /* ---------- 两轮，各说一件可记忆的事 ---------- */
  await send(FACT_A)
  await waitTurnDone(2)
  await send(FACT_B)
  await waitTurnDone(4)
  // P0 之前先确认「无变化的一轮不产生快照」
  await send('谢谢你听我说这些。')          // 3 轮：没有新事实
  await waitTurnDone(6)
  const s0 = await readState()

  const s2 = await readState()
  // ⚠️ Array.includes 是**精确匹配**不是子串 —— 卡片内容是完整句子，
  //    includes('面包') 永远是 false。要用 .some(m => m.includes(word))。
  const hasMem = (arr, word) => arr.some((m) => m.includes(word))
  check(
    'R1 快照在真实变化后生成（且无变化的一轮不产生快照）',
    s2.snapshotCount === 2,
    `快照 ${s2.snapshotCount} 个（3 轮对话）：[${s2.snapMem.map((s) => s.summary).join(' / ')}]`,
  )
  check(
    'R1b 两份快照的内容确实不同（面包/馒头先后出现）',
    s2.snapMem.some((s) => s.hasBread && !s.hasCat) && s2.snapMem.some((s) => s.hasCat),
    JSON.stringify(s2.snapMem.map((s) => ({ bread: s.hasBread, cat: s.hasCat }))),
  )
  const hashes = new Set(s2.snapMem.map((s) => s.frozenHash))
  check('R4 frozenHash 全程恒定（AI 没改冻结层）', hashes.size === 1, `${hashes.size} 个指纹`)

  const memBefore = s2.memories.join('|')
  check(
    'P0 回滚前两条记忆都在',
    hasMem(s2.memories, '面包') && hasMem(s2.memories, '馒头'),
    memBefore,
  )

  /* ---------- 进入档案页，回滚到第 1 个快照 ---------- */
  await page.click('a:has-text("档案")')
  await page.waitForTimeout(800)

  const snapshotItems = await page.locator('section:has(h2:has-text("演化时间线")) li').count()
  check('R2 时间线上能看到全部快照', snapshotItems === s2.snapshotCount,
    `页面 ${snapshotItems} / 库里 ${s2.snapshotCount}`)

  // 回滚到**最早**的那个（列表第一项）
  page.once('dialog', (d) => d.accept())
  await page.locator('section:has(h2:has-text("演化时间线")) li button').first().click()
  await page.waitForFunction(
    () => (document.querySelector('main')?.innerText ?? '').includes('已回滚'),
    { timeout: 30_000 },
  )

  const s3 = await readState()
  check('R3 回滚后记忆回到目标状态',
    hasMem(s3.memories, '面包') && !hasMem(s3.memories, '馒头'), s3.memories.join('|'))
  check(
    'R3b 回滚本身留了一条快照（可逆）',
    s3.snapshotCount === s0.snapshotCount + 1,
    `${s0.snapshotCount} → ${s3.snapshotCount}`,
  )
  const hashes3 = new Set(s3.snapMem.map((s) => s.frozenHash))
  check('R3c 回滚后 frozenHash 仍恒定', hashes3.size === 1)

  /* ---------- R5：跨 store 同步 —— 回滚后下一轮不能「复活」被回滚掉的记忆 ---------- */
  await page.click('a:has-text("对话")')
  await page.waitForTimeout(800)
  await page.fill('textarea', '谢谢你记得这些。')
  await page.click('button:has-text("发送")')
  // 第四轮 = 8 条消息
  await page.waitForFunction(() => document.querySelectorAll('main > div').length >= 8, {
    timeout: 150_000,
  })
  await page.waitForTimeout(2000)

  const lastSystem = chatReqs[chatReqs.length - 1]?.system ?? ''
  check('R5 回滚后下一轮的 system 里没有已回滚掉的记忆', !lastSystem.includes('馒头'),
    lastSystem.includes('馒头') ? '—— 跨 store 没同步，是最隐蔽的那种 bug' : '')
  check('R5b 保留下的记忆仍在 system 里', lastSystem.includes('面包'))

  check('D1 无 JS 报错', errors.length === 0, errors.slice(0, 2).join(' | '))

  await page.screenshot({ path: join(SCRATCH, 'p3_s3.png'), fullPage: true })
} catch (err) {
  check('!! 执行中断', false, String(err).split('\n')[0])
  try {
    await page.screenshot({ path: join(SCRATCH, 'p3_s3_fail.png'), fullPage: true })
    results.push(await page.locator('body').innerText())
  } catch {
    /* ignore */
  }
}

const report = ['# P3-3 验收 · 快照与回滚', `BASE=${BASE}`, '', ...results].join('\n')
writeFileSync(join(SCRATCH, 'p3_s3.out.txt'), report, 'utf8')
console.log(report)
await browser.close()
