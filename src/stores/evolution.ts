/**
 * 演化面板的状态（Phase 3 · P3-3）
 *
 * 与 chat store 的分工：那边管「正在进行的对话」，这边管「已经沉淀下来的历史」。
 * 两者读的是同一份档案，但**互不持有对方的引用** ——
 * 面板刷新时重新从库里读，避免出现「两边各一份真相」。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { frozenHash, metricsOf } from '@/persona/evolving'
import type { PersonaProfile } from '@/persona/schema'
import {
  getPersona,
  saveEvolving,
} from '@/storage/personaRepo'
import {
  listSnapshots,
  rollbackTo,
  type SnapshotRow,
} from '@/storage/snapshotRepo'

export const useEvolutionStore = defineStore('evolution', () => {
  const persona = ref<PersonaProfile | null>(null)
  const snapshots = ref<SnapshotRow[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** 回滚后要提示的那条信息（成功 / 失败） */
  const notice = ref<string | null>(null)

  /** 曲线数据 —— 从快照现算，不另存 */
  const series = computed(() =>
    snapshots.value.map((s) => ({
      at: s.at,
      metrics: metricsOf(s.evolving),
      summary: s.triggerSummary,
      id: s.id as number,
    })),
  )

  /**
   * 冻结层有没有在历史上变过。
   *
   * 正常应该恒为 false（AI 不改冻结层）。一旦出现多个指纹，
   * 说明**人在编辑器里改过档案** —— 这是合法操作，但必须标出来，
   * 否则「人格漂移」和「我改了人设」会被混为一谈。
   */
  const frozenFingerprints = computed(() => {
    const set = new Map<string, number>()
    for (const s of snapshots.value) {
      set.set(s.frozenHash, (set.get(s.frozenHash) ?? 0) + 1)
    }
    return Array.from(set.entries()).map(([hash, count]) => ({ hash, count }))
  })

  const frozenDrifted = computed(() => frozenFingerprints.value.length > 1)

  async function load(personaId: string) {
    loading.value = true
    error.value = null
    try {
      persona.value = await getPersona(personaId)
      snapshots.value = await listSnapshots(personaId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  /**
   * 回滚到某个快照。
   *
   * ⚠️ 回滚**本身也会留一条快照**（`snapshotRepo.rollbackTo` 里做的）——
   * 否则曲线上看不出「这里发生过回滚」，而且回滚之后想再回到回滚前
   * 就做不到了（那等于把历史删了）。
   */
  async function rollback(snapshotId: number) {
    if (!persona.value) return null
    notice.value = null
    try {
      const hash = frozenHash(JSON.stringify(persona.value.frozen))
      const restored = await rollbackTo(persona.value.id, snapshotId, hash)
      if (!restored) {
        notice.value = '快照不存在（可能已被清理）'
        return null
      }
      persona.value = { ...persona.value, evolving: restored }
      snapshots.value = await listSnapshots(persona.value.id)
      notice.value = '已回滚'
      return restored
    } catch (e) {
      notice.value = `回滚失败 —— ${e instanceof Error ? e.message : String(e)}`
      return null
    }
  }

  /** 供别的 store 在改完演化层后同步 + 落库（避免两个 store 各持一份真相） */
  async function persistEvolving(next: PersonaProfile) {
    persona.value = next
    await saveEvolving(next.id, next.evolving)
    snapshots.value = await listSnapshots(next.id)
  }

  return {
    persona,
    snapshots,
    loading,
    error,
    notice,
    series,
    frozenFingerprints,
    frozenDrifted,
    load,
    rollback,
    persistEvolving,
  }
})
