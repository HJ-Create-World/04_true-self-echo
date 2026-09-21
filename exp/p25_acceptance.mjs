/**
 * P2.5 验收 · 真人素材投料（用完即删）
 *
 * PLAN.md Phase 2.5 完成标准：
 *   「真人档案可投料，且功能上不提供导出/分享入口」
 *
 * 覆盖的合规红线：
 *   R4  授权确认 + 授权书模板可下载/复制
 *   R5  独立同意弹窗（目的/方式/期限/影响），签一次落一条记录
 *   R6  真人素材默认本机模型；选云端需单独告知 + 勾选
 *   第11条  已故 / 不确定 → 直接终止
 *   §十 第12条  real 档案导出按钮不渲染（全链路原生 real，不是改库造的）
 *
 * 跑法：薄后端（8787）+ preview（4173）起着，脚本指向 4173。
 */

import { chromium } from 'playwright'

const EXE =
  'C:\\Users\\15056\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe'
const BASE = process.env.VERIFY_URL || 'http://localhost:4173'

const results = []
const check = (id, ok, detail = '') => results.push(`${ok ? '✅' : '❌'} ${id} ${detail}`)

const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text())
})

async function readAll() {
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
    const [persons, consents, msgs] = await Promise.all([
      getAll(db, 'personas'),
      getAll(db, 'consents'),
      getAll(db, 'messages'),
    ])
    db.close()
    return {
      personas: persons.map((p) => ({ id: p.id, name: p.profile?.name, kind: p.kind })),
      consents: consents.map((c) => ({ scope: c.scope, version: c.version, revokedAt: c.revokedAt })),
      messageCount: msgs.length,
    }
  })
}

/** 虚构素材：朋友「小林」的聊天记录（有冲突有告别，信息量够提取） */
const MATERIAL = [
  '2024-03-02 14:11 我：周末爬山去不去',
  '小林：不去，上次回来膝盖废了三天。你们年轻人别劝我，我这把身体自己有数。',
  '2024-03-02 14:13 我：那钓鱼？',
  '小林：这个可以。不过说好了，中午那顿我请，你别跟我抢，抢就是看不起我。',
  '2024-04-15 21:40 我：项目黄了，这周白干。',
  '小林：过来喝酒。别在电话里丧着，我听着难受。记住一条：天塌下来先把饭吃了，我们这种人，饭桌上没有解决不了的事，解决不了的也先吃饱再说。',
  '2024-04-15 21:52 我：怕给我爸说。',
  '小林：怕什么。我爸当年下岗第二天照常出门跑步，回来才说的。你爸要的是你这个人站着，不是那个项目站着。',
  '2024-09-30 08:03 小林：公司派我去成都，三年。行李今天收了一半，翻到你去年落我这的打火机，火石都换了两次了，还是还你。',
  '2024-09-30 08:05 我：非去不可？',
  '小林：非去不可。钱是一方面，人到中年，机会敲门就这一回，不开门它就去敲别人了。走了你少喝酒，少熬夜，别让我回来的时候看到一个更胖的你，我会伤心的。',
  '2024-09-30 08:07 我：三年很快。',
  '小林：嗯。三年后的今天，老地方，我带酒，你带人。',
].join('\n')

try {
  await page.goto(`${BASE}/feed`, { waitUntil: 'domcontentloaded' })
  // 清库重跑 —— 验收脚本必须幂等，上一次跑到一半的同意记录不能影响断言
  await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.deleteDatabase('true-self-echo')
        r.onsuccess = r.onerror = r.onblocked = () => res(null)
      }),
  )
  await page.goto(`${BASE}/feed`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  /* ---------- C1 类型切换可见，默认虚拟 ---------- */
  const virtBtn = page.locator('button', { hasText: '虚拟角色' }).first()
  const realBtn = page.locator('button', { hasText: '真人素材' }).first()
  check('C1 类型切换可见', (await virtBtn.count()) === 1 && (await realBtn.count()) === 1)

  /* ---------- 投真人素材 ---------- */
  await page.fill('textarea', MATERIAL)
  await page.waitForTimeout(400)
  await realBtn.click()
  await page.waitForTimeout(500)

  /* ---------- C9 real 锁死：素材非空时不能切回 ---------- */
  const virtDisabled = await virtBtn.isDisabled()
  check('C9 real 锁死 —— 虚拟角色按钮已禁用', virtDisabled)

  /* ---------- C2 关卡出现，提取被拦 ---------- */
  const gateVisible = await page.locator('text=真人素材 · 同意流程').isVisible()
  const extractBtn = page.locator('button:has-text("开始提取")').first()
  check('C2 同意关卡出现 + 提取被拦', gateVisible && (await extractBtn.isDisabled()))

  /* ---------- C3 第11条：已故 → 终止 ---------- */
  await page.click('button:has-text("开始同意流程")')
  await page.waitForTimeout(400)
  await page.click('button:has-text("已经离世")')
  await page.click('button:has-text("下一步")')
  await page.waitForTimeout(300)
  const refusedVisible = await page.locator('text=这个流程到此为止').isVisible()
  check('C3a 已故 → 拒绝页（说明原因，无路可走）', refusedVisible)
  await page.click('button:has-text("我知道了")')
  await page.waitForTimeout(300)

  /* ---------- C4 完整走一遍同意流 ---------- */
  await page.click('button:has-text("开始同意流程")')
  await page.waitForTimeout(400)
  await page.click('button:has-text("在世的人物")')
  await page.click('button:has-text("下一步")')
  await page.waitForTimeout(300)
  // R4：授权书模板可用 + 未勾选时不能下一步
  const tplVisible = await page.locator('text=查看授权书模板').isVisible()
  await page.click('text=查看授权书模板')
  await page.waitForTimeout(200)
  const authNext = page.locator('button:has-text("下一步")').last()
  check('C4a R4 授权页：模板可见 + 未勾选拦住', tplVisible && (await authNext.isDisabled()))
  // 下载模板（验证下载事件发生）
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
    page.click('button:has-text("下载 txt")'),
  ])
  check('C4b R4 授权书模板可下载', dl !== null, dl ? dl.suggestedFilename() : '（无下载事件）')
  await page.locator('label', { hasText: '我确认：我拥有该素材' }).locator('input').check()
  await authNext.click()
  await page.waitForTimeout(300)
  // R5 四要素逐条在场
  const fourOk = await page.evaluate(() => {
    const t = document.body.innerText
    return ['目的（为什么收）', '方式（怎么处理）', '期限（留多久）', '影响（有什么风险）'].every((k) => t.includes(k))
  })
  const noticeNext = page.locator('button:has-text("同意并继续")')
  check('C4c R5 四要素齐 + 未勾选拦住', fourOk && (await noticeNext.isDisabled()))
  await page.locator('label', { hasText: '我已逐条阅读并理解' }).locator('input').check()
  await noticeNext.click()
  await page.waitForTimeout(600)

  /* ---------- C5 落库：realMaterial 记录在，关卡变绿灯 ---------- */
  const s1 = await readAll()
  const rm = s1.consents.find((c) => c.scope === 'realMaterial' && !c.revokedAt)
  const gateGreen = await page.locator('text=✅ 已完成同意流程').isVisible()
  check(
    'C5 R5 同意落库 + 关卡绿灯',
    !!rm && rm.version === '1' && gateGreen,
    rm ? `version=${rm.version}` : '（无记录）',
  )

  /* ---------- C6 R6：默认云端 → 拦；勾选后放行；本机 → 免签 ---------- */
  const cloudWarn = await page.locator('text=真人素材默认建议走本机模型').isVisible()
  const cloudCheck = page.locator('label', { hasText: '我知晓并同意' }).locator('input')
  const blockedByCloud = await extractBtn.isDisabled()
  check('C6a 默认云端 provider → 传输告知出现 + 提取仍拦', cloudWarn && (await cloudCheck.count()) === 1 && blockedByCloud)
  await cloudCheck.check()
  await page.waitForTimeout(600)
  const s2 = await readAll()
  const ct = s2.consents.find((c) => c.scope === 'cloudTransfer' && !c.revokedAt)
  check('C6b 云端传输同意落库 + 提取解禁', !!ct && !(await extractBtn.isDisabled()))

  // 本机路径：换 ollama，告知变「不出设备」，无需再签
  // 🔴 用 value 选，不用 hasText —— ollama 的模型名 deepseek-r1 会撞上 deepseek
  const ollamaOption = page.locator('select option[value="ollama"]')
  if (await ollamaOption.count()) {
    await page.selectOption('select', 'ollama')
    await page.waitForTimeout(400)
    const localOk = await page.locator('text=素材不离开这台设备').isVisible()
    check('C6c 本机模型 → 免签放行', localOk)
    // 换回云端做提取（与 C6b 状态一致）
    await page.selectOption('select', 'deepseek')
    await page.waitForTimeout(300)
  } else {
    check('C6c 本机模型 → 免签放行', false, '（环境无 ollama，跳过）')
  }

  /* ---------- C7 提取 + 落库：kind=real ---------- */
  await extractBtn.click()
  await page.locator('button:has-text("存下来，去和它聊")').waitFor({ timeout: 180_000 })
  await page.click('button:has-text("存下来，去和它聊")')
  await page.waitForURL(`${BASE}/`, { timeout: 30_000 })
  await page.waitForTimeout(1200)
  const s3 = await readAll()
  const realPersona = s3.personas.find((p) => p.kind === 'real')
  check('C7 真人档案落库 kind=real', !!realPersona, realPersona ? realPersona.name : '（无 real 档案）')

  /* ---------- C8 §十 第12条：导出按钮不渲染 ---------- */
  await page.click('a:has-text("档案")')
  await page.waitForTimeout(900)
  const realRow = page.locator('li', { hasText: realPersona.name }).first()
  const badgeOk = await realRow.locator('text=真实人物 · 不可导出').isVisible()
  const exportInRealRow = await realRow.locator('button:has-text("导出")').count()
  const virtualRowWithExport = await page
    .locator('li', { has: page.locator('button:has-text("导出")') })
    .count()
  check(
    'C8 real 档案无导出按钮（virtual 有，形成对照）',
    badgeOk && exportInRealRow === 0 && virtualRowWithExport >= 1,
    `real行导出按钮=${exportInRealRow}，含导出按钮的行=${virtualRowWithExport}`,
  )

  /* ---------- C10 真人档案可开聊 ---------- */
  await page.click('a:has-text("对话")')
  await page.waitForTimeout(800)
  await page.fill('textarea', '在吗？突然想起你说三年后的今天老地方见。')
  await page.click('button:has-text("发送")')
  await page.waitForFunction(
    () => {
      const msgs = document.querySelectorAll('[class*="space-y"] > div')
      return msgs.length >= 2
    },
    { timeout: 120_000 },
  )
  await page.waitForTimeout(1500)
  const s4 = await readAll()
  check('C10 真人档案能开聊（消息已落库）', s4.messageCount >= 2, `messages=${s4.messageCount}`)
} catch (e) {
  check('FATAL', false, e instanceof Error ? `${e.name}: ${e.message}` : String(e))
} finally {
  console.log('\n===== P2.5 验收结果 =====')
  for (const r of results) console.log(r)
  if (errors.length) {
    console.log('\n===== 页面错误 =====')
    for (const e of errors) console.log(' -', e)
  }
  const failed = results.filter((r) => r.startsWith('❌')).length
  console.log(`\n${failed === 0 ? '🎉 全部通过' : `💥 ${failed} 项失败`}`)
  await browser.close()
  process.exit(failed === 0 && errors.length === 0 ? 0 : 1)
}
