/**
 * 导出与导入（Phase 4 · 数据主权）
 *
 * 依据：`SPEC.md` §五（数据能带走）+ §十 第 12 条（真实人物不提供导出）
 *       + 2026-09-20 HJ 确认的方案：**导「档案 + 对话 + 快照」完整备份**
 *
 * ## 文件格式
 *
 * ```json
 * { "app": "true-self-echo", "schema": 1, "exportedAt": "…",
 *   "persona": {…}, "conversations": [{…, "messages": […]}], "snapshots": […] }
 * ```
 *
 * ## 导入的 id 策略：全部重新生成
 *
 * 会话/消息/快照的 id 是自增的，直接塞旧 id 可能与库里已有的冲突。
 * 所以导入时**一律剥掉 id 让 Dexie 重新分配**。
 * **两次导入同一份文件会得到两个独立副本**，而不是互相覆盖 ——
 * 这是刻意行为：导入是「加一份」，不是「恢复到某个时点」。
 */

import { emptyEvolving, type EvolvingLayer } from '@/persona/evolving'
import type { PersonaProfile } from '@/persona/schema'
import db from './db'
import { plain } from './plain'

const APP_TAG = 'true-self-echo'
const SCHEMA = 1

export class ExportForbiddenError extends Error {
  constructor() {
    super('真实人物的档案不提供导出（SPEC §十 第 12 条）')
    this.name = 'ExportForbiddenError'
  }
}

export interface ExportConversation {
  /** 导入时会剥掉旧 id 重新分配 */
  id?: number
  title: string
  createdAt: number
  updatedAt: number
  messages: unknown[]
}

export interface ExportFile {
  app: typeof APP_TAG
  schema: typeof SCHEMA
  exportedAt: string
  persona: PersonaProfile
  /** 每个会话内嵌它自己的消息 */
  conversations: ExportConversation[]
  snapshots: unknown[]
}

/**
 * 导出一个人格的完整数据（档案 + 会话[含消息] + 快照），返回待下载的对象。
 *
 * 🔴 **kind === 'real' 直接拒绝**，双保险：
 * UI 不渲染按钮是第一道门，这里是第二道 —— 将来任何人改 UI 都绕不过函数。
 */
export async function exportPersona(profile: PersonaProfile): Promise<ExportFile> {
  if (profile.kind === 'real') throw new ExportForbiddenError()

  const pid = profile.id
  const convs = await db.conversations.where('personaId').equals(pid).sortBy('createdAt')
  const conversations = []
  for (const c of convs) {
    const msgs = await db.messages
      .where('conversationId')
      .equals(c.id as number)
      .sortBy('createdAt')
    conversations.push({ ...c, messages: plain(msgs) })
  }
  const snaps = await db.snapshots.where('personaId').equals(pid).sortBy('at')

  return plain({
    app: APP_TAG,
    schema: SCHEMA,
    exportedAt: new Date().toISOString(),
    persona: profile,
    conversations,
    snapshots: snaps,
  })
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
}

/**
 * 从导出文件恢复一份人格（**生成全新 id**，不覆盖已有数据）。
 * 返回新人格的 id 与名字，调用方据此切换过去。
 */
export async function importFromFile(json: string): Promise<{ personaId: string; name: string }> {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(json) as Record<string, unknown>
  } catch (e) {
    throw new Error(`不是合法的 JSON 文件：${e instanceof Error ? e.message : String(e)}`)
  }

  if (data.app !== APP_TAG) throw new Error('这不是真我回响的导出文件（app 标识不符）')
  if (Number(data.schema) > SCHEMA) throw new Error('文件版本比当前应用新，请先升级应用')

  const personaRaw = asRecord(data.persona)
  if (!personaRaw) throw new Error('文件里没有人格数据')

  // 两种兼容：新格式 persona 是完整档案；旧格式把档案字段直接摊在顶层
  const profileRaw = (asRecord(personaRaw.profile) ?? personaRaw) as unknown as PersonaProfile
  const newId = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

  const evolving =
    (profileRaw as { evolving?: EvolvingLayer | undefined }).evolving ?? emptyEvolving()
  const profile = plain({
    ...profileRaw,
    id: newId,
    evolving,
  }) as PersonaProfile
  await db.personas.put({
    id: newId,
    name: profile.name,
    kind: profile.kind,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    profile,
  })

  const convs = Array.isArray(data.conversations) ? data.conversations : []
  for (const raw of convs) {
    const c = asRecord(raw)
    if (!c) continue
    const newConvId = (await db.conversations.add({
      personaId: newId,
      title: String(c.title ?? '导入的对话'),
      createdAt: Number(c.createdAt ?? Date.now()),
      updatedAt: Number(c.updatedAt ?? Date.now()),
    })) as number

    const msgs = Array.isArray(c.messages) ? c.messages : []
    for (const m of msgs) {
      const mm = asRecord(m)
      if (!mm) continue
      await db.messages.add({
        conversationId: newConvId,
        role: mm.role === 'assistant' ? 'assistant' : 'user',
        content: String(mm.content ?? ''),
        createdAt: Number(mm.createdAt ?? Date.now()),
      })
    }
  }

  const snaps = Array.isArray(data.snapshots) ? data.snapshots : []
  for (const raw of snaps) {
    const s = asRecord(raw)
    if (!s) continue
    const ev = asRecord(s.evolving)
    await db.snapshots.add({
      personaId: newId,
      at: String(s.at ?? new Date().toISOString()),
      frozenHash: String(s.frozenHash ?? ''),
      evolving: (ev ?? { userModel: [], relation: {}, memories: [] }) as never,
      triggerSummary: String(s.triggerSummary ?? '（导入的快照）'),
    })
  }

  return { personaId: newId, name: String(profile.name ?? '导入的人格') }
}

/** 生成下载。返回文件名，UI 据此提示 */
export function downloadExport(file: ExportFile): string {
  const safe = (file.persona.name || '未命名').replace(/[\\/:*?"<>|\s]+/g, '-')
  const name = `真我回响-${safe}-${new Date().toISOString().slice(0, 10)}.json`
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
  return name
}
