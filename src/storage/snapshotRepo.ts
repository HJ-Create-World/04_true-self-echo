/**
 * 演化快照与回滚
 *
 * 依据：`SPEC.md` §九「变化曲线的实现基础」
 *
 * ```
 * evolutionLog = [{ time, frozenHash, evolvingSnapshot, triggerSummary }, ...]
 * ```
 *
 * 三个作用（SPEC 原文）：
 *   1. 变化曲线 = 把这个数组画成折线图
 *   2. 天然支持**回滚**（每一帧都存着）
 *   3. 可以直接算学术界的**人格漂移**公式 `Drift = (1/T)·Σ‖v_t − v_0‖₂`
 *
 * ## 一个刻意的设计选择：存**完整**演化层，不做差分
 *
 * 直觉上「每轮存一份完整状态」很浪费。但算一下就清楚了：
 * 演化层的全部内容是几十张卡片 + 几十个事实条目，单份约几 KB。
 * 存 200 份也才 1 MB 量级 —— 而差分方案的复杂度（回滚要重放、
 * 快照顺序不能乱、中间丢一份就全废）远不止这个代价。
 *
 * **一个项目只学一样新东西**：这里不引入任何版本控制机制。
 */

import type { EvolvingLayer } from '@/persona/evolving'
import db from './db'
import { plain } from './plain'

export interface SnapshotRow {
  id?: number
  personaId: string
  /** ISO 时间 */
  at: string
  /**
   * 冻结层的指纹 —— **本该恒定不变**（冻结层 AI 不可修改）。
   * 变了说明有人在编辑器里改了档案，曲线会把它标出来，
   * 免得「人格漂移」和「我改了人设」被混为一谈。
   */
  frozenHash: string
  /** 完整演化层。回滚就是把某一份拷回去 */
  evolving: EvolvingLayer
  /** 这一轮发生了什么（人话），给曲线当标注 */
  triggerSummary: string
  /** 触发这次快照的消息 id —— 从曲线能跳回那一轮对话 */
  messageId?: number
}

/**
 * 快照上限。超了丢最旧的。
 *
 * ⚠️ 这与「能回滚到**任意**历史快照」有张力 —— 是刻意的取舍：
 * 200 轮对话对一个私人陪伴应用已经是极长的历史，
 * 而无限增长迟早会把 IndexedDB 写爆。触发上限时会在 UI 上说明。
 */
export const SNAPSHOT_LIMIT = 200

export async function appendSnapshot(row: SnapshotRow): Promise<number> {
  const id = (await db.snapshots.add(plain(row))) as number
  const count = await db.snapshots.where('personaId').equals(row.personaId).count()
  if (count > SNAPSHOT_LIMIT) {
    const all = await db.snapshots.where('personaId').equals(row.personaId).sortBy('at')
    const excess = all.slice(0, count - SNAPSHOT_LIMIT)
    await db.snapshots.bulkDelete(excess.map((r) => r.id as number))
  }
  return id
}

/** 该人格的全部快照，按时间正序（画曲线直接用） */
export async function listSnapshots(personaId: string): Promise<SnapshotRow[]> {
  return db.snapshots.where('personaId').equals(personaId).sortBy('at')
}

export async function latestSnapshot(personaId: string): Promise<SnapshotRow | null> {
  const all = await db.snapshots.where('personaId').equals(personaId).sortBy('at')
  return all.length ? all[all.length - 1] : null
}

export async function getSnapshot(id: number): Promise<SnapshotRow | null> {
  return (await db.snapshots.get(id)) ?? null
}

export async function countSnapshots(personaId: string): Promise<number> {
  return db.snapshots.where('personaId').equals(personaId).count()
}

/**
 * 回滚到某个快照：把那一份的演化层拷回人格档案。
 *
 * ⚠️ **回滚本身也要留一条快照**，否则曲线上看不出「这里发生过回滚」，
 * 而且回滚后再想回到回滚前就做不到了（那等于把历史删了）。
 * 所以这里是「读旧快照 → 写回 → 追加快照标记这次回滚」。
 *
 * @returns 拷回去的演化层（深拷贝）；快照不存在时返回 null
 */
export async function rollbackTo(
  personaId: string,
  snapshotId: number,
  frozenHashNow: string,
): Promise<EvolvingLayer | null> {
  const snap = await getSnapshot(snapshotId)
  if (!snap) return null

  const restored = plain(snap.evolving)

  await db.personas
    .where('id')
    .equals(personaId)
    .modify((row: { profile?: { evolving?: EvolvingLayer } }) => {
      if (row.profile) row.profile.evolving = plain(restored)
    })

  await appendSnapshot({
    personaId,
    at: new Date().toISOString(),
    frozenHash: frozenHashNow,
    evolving: restored,
    triggerSummary: `回滚到 ${snap.at.slice(0, 16).replace('T', ' ')} 的状态`,
  })

  return restored
}

export async function clearSnapshots(personaId: string): Promise<void> {
  await db.snapshots.where('personaId').equals(personaId).delete()
}
