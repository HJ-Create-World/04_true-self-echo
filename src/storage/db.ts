/**
 * 对话持久化 —— IndexedDB（Dexie.js）
 * PLAN.md Phase 1 验收：「关掉浏览器再打开，历史还在」
 *
 * 只存两条数据：会话元信息 + 消息列表。
 * Phase 1 不做记忆压缩、不做多角色，所以 schema 刻意保持扁平。
 */

import Dexie, { type EntityTable } from 'dexie'

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
}

db.version(1).stores({
  conversations: '++id, personaId, updatedAt',
  messages: '++id, conversationId, createdAt',
})

/** 取最近一条会话；没有就新建一条。 */
export async function ensureConversation(
  personaId: string,
  title = '新的对话',
): Promise<ConversationRow> {
  const last = await db.conversations.orderBy('updatedAt').last()
  if (last && last.personaId === personaId) return last

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
