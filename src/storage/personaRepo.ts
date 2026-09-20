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
import { plain } from './plain'
import { emptyEvolving, type EvolvingLayer } from '@/persona/evolving'
import type { PersonaProfile } from '@/persona/schema'

/**
 * 兜底补齐 `evolving`。
 *
 * db.ts 的 v3 upgrade 已经回填过一次，这里是**第二道防线**：
 * 万一有档案从别的路径进来（导入的 JSON、旧备份、手工造的测试数据），
 * 缺这一个字段就会让 Phase 3 的所有读取处崩掉。
 * 代价是一次浅检查，值得。
 */
function withEvolving(p: PersonaProfile): PersonaProfile {
  return p.evolving ? p : { ...p, evolving: emptyEvolving() }
}

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

/** 管理列表用的摘要 —— 比上面多两个计数，面板上要显示「几条记忆 / 几个会话」 */
export interface PersonaSummary {
  id: string
  name: string
  kind: PersonaProfile['kind']
  updatedAt: number
  memoryCount: number
  conversationCount: number
}

export async function listPersonaSummaries(): Promise<PersonaSummary[]> {
  const rows = await db.personas.orderBy('updatedAt').reverse().toArray()
  const out: PersonaSummary[] = []
  for (const row of rows) {
    const conversationCount = await db.conversations
      .where('personaId')
      .equals(row.id)
      .count()
    out.push({
      id: row.id,
      name: row.profile?.name ?? row.name,
      kind: row.kind,
      updatedAt: row.updatedAt,
      memoryCount: row.profile?.evolving?.memories?.length ?? 0,
      conversationCount,
    })
  }
  return out
}

export async function getPersona(id: string): Promise<PersonaProfile | null> {
  const row = await db.personas.get(id)
  return row ? withEvolving(row.profile) : null
}

/**
 * 取最近更新过的那一份档案。
 *
 * 对话页用它决定「现在跟谁聊」—— Phase 3 还没有人格列表（那是 Phase 4），
 * 先约定「刚投料出来的那个人格就是当前的」。
 */
export async function latestPersona(): Promise<PersonaProfile | null> {
  const row = await db.personas.orderBy('updatedAt').last()
  return row ? withEvolving(row.profile) : null
}

/**
 * 新增或覆盖。调用方负责更新 `profile.updatedAt`。
 *
 * ⚠️ 写库前必须 `plain()` —— 见 `./plain.ts` 的说明（Proxy 不可克隆）。
 */
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

/**
 * 只更新演化层（Phase 3 每轮对话后调用）。
 *
 * 单独开一个函数而不是让调用方 `get → 改 → put`：那样容易把整份 profile
 * （含冻结层）一起写回去，而**冻结层是不该被对话流程碰的**。
 * 这里刻意只碰 `evolving` 一个字段。
 */
export async function saveEvolving(personaId: string, evolving: EvolvingLayer): Promise<void> {
  await db.personas.where('id').equals(personaId).modify(
    (row: { profile?: { evolving?: EvolvingLayer }; updatedAt?: number }) => {
      if (row.profile) row.profile.evolving = plain(evolving)
      row.updatedAt = Date.now()
    },
  )
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

/**
 * 级联删除一个人格：档案 + 它的会话 + 消息 + 快照一起删。
 *
 * **级联是 HJ 拍板的方案**（2026-09-20）：残留孤儿数据（人格没了但快照还在）
 * 会在导出/统计时制造麻烦，且这些数据离开人格没有意义；
 * 更重要的是 SPEC §十二 的「删除我的数据」这条隐私要求，只有级联删才做得到。
 *
 * 调用方负责先弹确认框 —— 这里不做任何确认。
 *
 * ⚠️ 用一个事务包起来：删到一半失败会比「完全没删」更难排查。
 */
export async function deletePersonaCascade(personaId: string): Promise<void> {
  await db.transaction(
    'rw',
    db.personas,
    db.conversations,
    db.messages,
    db.snapshots,
    async () => {
      const convs = await db.conversations.where('personaId').equals(personaId).toArray()
      for (const c of convs) {
        await db.messages.where('conversationId').equals(c.id as number).delete()
      }
      await db.conversations.where('personaId').equals(personaId).delete()
      await db.snapshots.where('personaId').equals(personaId).delete()
      await db.personas.delete(personaId)
    },
  )
}
