/**
 * P3 遗留验收 · 亲密度推进（E2E）
 *
 * HJ 拍板的方案：LLM 顺带评估（搭记忆抽取的车）+ 不衰减 + stage 代码推导。
 *
 * 完成标准：
 *   1. 走心对话能推进亲密度，且推进有上限（限幅由单元断言覆盖）
 *   2. stage 与 intimacy 恒一致（派生关系不被破坏）
 *   3. 变化进快照（triggerSummary 可读），曲线图在画
 *
 * 跑法：薄后端（8787）+ preview（4173）起着，脚本指向 4173。
 */

import { chromium } from 'playwright'

const EXE =
  'C:\\Users\\15056\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe'
const BASE = process.env.VERIFY_URL || 'http://localhost:4173'

const results = []
const check = (id, ok, detail = '') => results.push(`${ok ? '✅' : '❌'} ${id} ${detail}`)

/** 与 src/persona/relation.ts 保持一致的阶段阶梯（独立写死，防实现自我循环） */
const STAGES = [
  { name: '初识', floor: 0 },
  { name: '熟络', floor: 20 },
  { name: '常聊', floor: 40 },
  { name: '亲近', floor: 65 },
  { name: '知己', floor: 90 },
]
function stageOf(v) {
  let n = STAGES[0].name
  for (const s of STAGES) if (v >= s.floor) n = s.name
  return n
}

const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text())
})

/** 读当前人格的关系状态 + 快照摘要 + 最新曲线 path 的点数 */
async function readState() {
  return page.evaluate(async () => {
    const open = () =>
      new Promise((res, rej) => {
        const r = indexedDB.open('true-self-echo')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
    const getAll = (db, store) =>
      new Promise((res) => {
        const rq = db.transaction(store, 'readonly').objectStore(store).getAll()
        rq.onsuccess = () => res(rq.result)
        rq.onerror = () => res([])
      })
    const db = await open()
    const [persons, snaps] = await Promise.all([getAll(db, 'personas'), getAll(db, 'snapshots')])
    db.close()
    const p = persons.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0]
    return {
      name: p?.profile?.name ?? '',
      intimacy: p?.profile?.evolving?.relation?.intimacy ?? -1,
      stage: p?.profile?.evolving?.relation?.stage ?? '',
      memoryCount: p?.profile?.evolving?.memories?.length ?? 0,
      snapshotSummaries: snaps
        .filter((s) => s.personaId === p?.id)
        .map((s) => String(s.triggerSummary ?? '')),
    }
  })
}

/** 等抽取与快照落库：轮询到 (intimacy, memoryCount) 连续 3 秒不变 */
async function waitForQuiet() {
  let last = ''
  let stable = 0
  const t0 = Date.now()
  for (;;) {
    const s = await readState()
    const key = `${s.intimacy}|${s.memoryCount}`
    if (key === last) {
      stable += 1
      if (stable >= 3) return s
    } else {
      stable = 0
      last = key
    }
    if (Date.now() - t0 > 120_000) return s
    await page.waitForTimeout(1000)
  }
}

/** 发一条消息并等本轮「扮演 + 抽取」都落定 */
async function send(text) {
  await page.fill('textarea', text)
  await page.click('button:has-text("发送")')
  await page.waitForTimeout(1500)
}

try {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.deleteDatabase('true-self-echo')
        r.onsuccess = r.onerror = r.onblocked = () => res(null)
      }),
  )
  // 清库后重进 —— 空库会自动播种内置人格（personaRepo.seedIfEmpty）
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  const s0 = await readState()
  check(
    'S0 清库后播种完成，亲密度起点 0',
    s0.name !== '' && s0.intimacy === 0 && s0.stage === '初识',
    `${s0.name} · intimacy=${s0.intimacy} · stage=${s0.stage}`,
  )

  /* ---------- 第一轮：明显走心 ---------- */
  await send('今天面试挂了，心里挺难受的。准备了一个多月，还是砸了。跟你说说，别安慰得太客套，我只想有人听我讲完。')
  const s1 = await waitForQuiet()
  check(
    'S1 走心轮推进亲密度（>0）',
    s1.intimacy > 0,
    `intimacy=${s1.intimacy} · stage=${s1.stage} · 记忆=${s1.memoryCount}`,
  )

  /* ---------- 第二轮：继续走心 ---------- */
  await send('谢谢你听我说完。其实最怕的是我爸失望，他嘴上不说，但什么都写在脸上。这种事我只跟你讲。')
  const s2 = await waitForQuiet()
  check(
    'S2 亲密度单调不回退，且仍在 0–100',
    s2.intimacy >= s1.intimacy && s2.intimacy >= 0 && s2.intimacy <= 100,
    `intimacy=${s1.intimacy} → ${s2.intimacy}`,
  )
  check(
    'S3 stage 与 intimacy 恒一致（派生关系未被破坏）',
    s2.stage === stageOf(s2.intimacy),
    `${s2.intimacy} → ${s2.stage}`,
  )

  /* ---------- 快照 ---------- */
  const hasRelSnap = s2.snapshotSummaries.some((t) => t.includes('亲密度'))
  check('S4 快照记录了亲密度变化', hasRelSnap, s2.snapshotSummaries.slice(-2).join(' / '))

  /* ---------- 曲线在画 ---------- */
  await page.click('a:has-text("档案")')
  await page.waitForTimeout(1200)
  const paths = await page.locator('svg[aria-label="演化曲线"] path[d]').count()
  check('S5 演化曲线渲染出路径', paths >= 2, `path 数=${paths}（两条线）`)

  /* ---------- 闲聊不灌水（第三轮：纯事实问答） ---------- */
  await page.click('a:has-text("对话")')
  await page.waitForTimeout(800)
  await send('顺便问下，明天几点提醒我吃药比较合适？')
  const s3 = await waitForQuiet()
  check(
    'S6 闲聊轮不推进（delta=0，防灌水）',
    s3.intimacy === s2.intimacy,
    `intimacy=${s2.intimacy} → ${s3.intimacy}`,
  )
} catch (e) {
  check('FATAL', false, e instanceof Error ? `${e.name}: ${e.message}` : String(e))
} finally {
  console.log('\n===== 亲密度推进 · E2E 验收 =====')
  for (const r of results) console.log(r)
  if (errors.length) {
    console.log('\n===== 页面错误 =====')
    for (const e of errors) console.log(' -', e)
  }
  const failed = results.filter((r) => r.startsWith('❌')).length
  console.log(`\n${failed === 0 && errors.length === 0 ? '🎉 全部通过' : `💥 ${failed} 项失败 / ${errors.length} 页面错误`}`)
  await browser.close()
  process.exit(failed === 0 && errors.length === 0 ? 0 : 1)
}
