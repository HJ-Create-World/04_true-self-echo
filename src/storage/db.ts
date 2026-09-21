/**
 * 对话持久化 —— IndexedDB（Dexie.js）
 * PLAN.md Phase 1 验收：「关掉浏览器再打开，历史还在」
 *
 * 只存两条数据：会话元信息 + 消息列表。
 * Phase 1 不做记忆压缩、不做多角色，所以 schema 刻意保持扁平。
 */

import Dexie, { type EntityTable } from 'dexie'

import type { ConsentRow } from './consentRepo'
import type { PersonaRow } from './personaRepo'
import type { SnapshotRow } from './snapshotRepo'

export interface MessageRow {
  id?: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  /** 服务端标注：本次生成经过重试仍退化 */
  degraded?: boolean
  /** 生成该条消息所用的后端与模型，便于跨模型对比 */
  provider?: string
  model?: string
  /** 从发起到收完的毫秒数 */
  elapsedMs?: number
  /** 上游 finish_reason，排障用 */
  finishReason?: string
}

export interface ConversationRow {
  id?: number
  personaId: string
  title: string
  createdAt: number
  updatedAt: number
}

const db = new Dexie('true-self-echo') as Dexie & {
  conversations: EntityTable<ConversationRow, 'id'>
  messages: EntityTable<MessageRow, 'id'>
  personas: EntityTable<PersonaRow, 'id'>
  snapshots: EntityTable<SnapshotRow, 'id'>
  consents: EntityTable<ConsentRow, 'id'>
}

db.version(1).stores({
  conversations: '++id, personaId, updatedAt',
  messages: '++id, conversationId, createdAt',
})

// v2（2026-09-20，Phase 2）：新增 personas 表。
// 主键是字符串 id（投料生成的稳定 id），不是自增——见 personaRepo.ts 的注释。
// 已有的 conversations / messages 不动，Dexie 会自动补建新表。
db.version(2).stores({
  conversations: '++id, personaId, updatedAt',
  messages: '++id, conversationId, createdAt',
  personas: 'id, name, updatedAt',
})

// v3（2026-09-20，Phase 3）：新增 snapshots 表 + 给已有档案补 evolving 字段。
// ⚠️ 演化层（memories / userModel / relation）**不单独立表** ——
// 它整块存在 personas.profile.evolving 里。理由：
//   ① 检索用的是关键词匹配，几十张卡片在 JS 里过一遍就够，不需要索引
//   ② 演化层必须和人格一起原子读写，拆表反而要处理两处不一致
// 只有快照要独立成表 —— 它是一串只增不改的历史记录，量级和读法都不同。
db.version(3)
  .stores({
    conversations: '++id, personaId, updatedAt',
    messages: '++id, conversationId, createdAt',
    personas: 'id, name, updatedAt',
    snapshots: '++id, personaId, at',
  })
  // 🔴 **只加表是不够的**：v2 时期存下的档案里根本没有 evolving 字段，
  // 而 Phase 3 的代码会直接读 `profile.evolving.memories` → 未定义就崩。
  // 所以必须有一次**数据回填**。这是 Dexie 的 upgrade 回调存在的意义：
  // 光改 schema 不改数据，老库会以一种很难排查的方式坏掉。
  .upgrade(async (tx) => {
    await tx
      .table('personas')
      .toCollection()
      .modify((row: { profile?: { evolving?: unknown } }) => {
        if (row.profile && !row.profile.evolving) {
          row.profile.evolving = {
            userModel: [],
            relation: { stage: '初识', intimacy: 0, sharedEvents: [] },
            memories: [],
          }
        }
      })
  })

// v4（2026-09-20，Phase 2.5）：新增 consents 表。
// 同意是**事件记录**不是档案字段 —— 独立成表，将来 R8 的「撤回同意入口」
// 才能按 scope 精确撤回，且审计时能看到「何时同意的哪一版文案」。
// 只有真人素材流程会写这张表；虚拟角色投料不产生任何同意记录。
db.version(4).stores({
  conversations: '++id, personaId, updatedAt',
  messages: '++id, conversationId, createdAt',
  personas: 'id, name, updatedAt',
  snapshots: '++id, personaId, at',
  consents: '++id, scope, grantedAt',
})

/** 取该人格最近一条会话；没有就新建一条。 */
export async function ensureConversation(
  personaId: string,
  title = '新的对话',
): Promise<ConversationRow> {
  const rows = await db.conversations.where('personaId').equals(personaId).toArray()
  const last = rows.sort((a, b) => a.updatedAt - b.updatedAt).pop()
  if (last) return last

  const now = Date.now()
  const id = await db.conversations.add({
    personaId,
    title,
    createdAt: now,
    updatedAt: now,
  })
  return { id: id as number, personaId, title, createdAt: now, updatedAt: now }
}

export async function loadMessages(conversationId: number): Promise<MessageRow[]> {
  return db.messages.where('conversationId').equals(conversationId).sortBy('createdAt')
}

export async function appendMessage(row: MessageRow): Promise<number> {
  const id = (await db.messages.add(row)) as number
  await db.conversations.update(row.conversationId, { updatedAt: row.createdAt })
  return id
}

/** 用会话第一条用户消息当标题，比「新的对话」有用得多 */
export async function retitleFromFirst(conversationId: number, text: string): Promise<void> {
  const title = text.trim().replace(/\s+/g, ' ').slice(0, 18) || '新的对话'
  await db.conversations.update(conversationId, { title })
}

export async function countMessages(conversationId: number): Promise<number> {
  return db.messages.where('conversationId').equals(conversationId).count()
}

export async function clearConversation(conversationId: number): Promise<void> {
  await db.messages.where('conversationId').equals(conversationId).delete()
}

export default db
