/**
 * 人格档案持久化
 *
 * 与 storage/db.ts 的分工：那边管 Dexie 实例、会话与消息；
 * 这边只管「人格档案」这一种记录。**不要把两边合成一个文件** ——
 * persona 记录是整块 JSON，字段级索引一个都不需要，与消息表不是一类东西。
 *
 * Phase 2 只读写 frozen 层（evolving 归 Phase 3）。
 */

import db from './db'
import type { PersonaProfile } from '@/persona/schema'

export interface PersonaRow {
  /** 主键。用 profile.id，不做自增——投料生成的就是稳定 id */
  id: string
  name: string
  kind: PersonaProfile['kind']
  createdAt: number
  updatedAt: number
  /**
   * 整块档案。
   * ⚠️ 刻意不做字段级索引：Phase 2 的读法全是「按 id 取整条」，
   * 拆列只会让 schema 迁移变痛。
   */
  profile: PersonaProfile
}

/** 按最近更新倒序列出全部人格（不含档案正文，列表页够用） */
export async function listPersonas(): Promise<
  Pick<PersonaRow, 'id' | 'name' | 'kind' | 'updatedAt'>[]
> {
  const rows = await db.personas.orderBy('updatedAt').reverse().toArray()
  return rows.map(({ id, name, kind, updatedAt }) => ({ id, name, kind, updatedAt }))
}

export async function getPersona(id: string): Promise<PersonaProfile | null> {
  const row = await db.personas.get(id)
  return row?.profile ?? null
}

/**
 * 取最近更新过的那一份档案。
 *
 * 对话页用它决定「现在跟谁聊」—— Phase 2 还没有人格列表（那是 Phase 4），
 * 先约定「刚投料出来的那个人格就是当前的」。
 */
export async function latestPersona(): Promise<PersonaProfile | null> {
  const row = await db.personas.orderBy('updatedAt').last()
  return row?.profile ?? null
}

/**
 * 写库前把对象转成「纯对象」。
 *
 * 🔴 **这一步不能省**（2026-09-20 实测踩坑）：
 * Vue 的 `ref` / `reactive` 会给对象套一层 **Proxy**，而 IndexedDB 用
 * 结构化克隆（structured clone）序列化，**Proxy 不可克隆** →
 * `DataCloneError: Failed to execute 'put' on 'IDBObjectStore': #<Object> could not be cloned`。
 *
 * 投料流程里 `draft` 是 `ref`，所以从它拼出来的档案一定带 Proxy。
 * `toRaw()` 只解一层（嵌套的数组/对象仍是 Proxy），所以这里用 JSON 往返做**深**拷贝。
 * 档案是纯数据（字符串 / 数字 / 数组 / 普通对象），没有 Date、Map、undefined 函数，
 * JSON 往返不会丢东西。
 *
 * 放在存储层而不是调用方：这是**存储的边界**，不该让每个调用方都记得去 Proxy 化。
 */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** 新增或覆盖。调用方负责更新 `profile.updatedAt`。 */
export async function putPersona(profile: PersonaProfile): Promise<void> {
  const now = Date.now()
  const existing = await db.personas.get(profile.id)
  await db.personas.put({
    id: profile.id,
    name: profile.name,
    kind: profile.kind,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    profile: plain(profile),
  })
}

export async function deletePersona(id: string): Promise<void> {
  await db.personas.delete(id)
}

export async function countPersonas(): Promise<number> {
  return db.personas.count()
}

/**
 * 冷启动：库里一个人格都没有时，把内置人格写进去。
 *
 * ⚠️ 只在**空库**时播种。用户删掉了内置人格就不再补 ——
 * 删了又自己冒出来，是数据主权问题（`SPEC.md` §五 数据）。
 */
export async function seedIfEmpty(profile: PersonaProfile): Promise<PersonaProfile> {
  if ((await countPersonas()) === 0) await putPersona(profile)
  const existing = await getPersona(profile.id)
  return existing ?? profile
}
