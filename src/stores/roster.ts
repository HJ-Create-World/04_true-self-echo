/**
 * 人格花名册 —— Phase 4 的列表/创建/删除/导出导入
 *
 * 与 chat store 的分工：**chat 管「当前正在聊的这一个」**，
 * 这里管「全部名单与增删」。切换这个动作由 chat.usePersona() 完成，
 * 本 store 只负责把名单刷新到位。
 *
 * 导出/导入的纯逻辑在 `storage/transfer.ts`，这里只做编排（调它 + 刷新名单）。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

import { emptyEvolving } from '@/persona/evolving'
import { emptyFrozen, emptySource } from '@/persona/schema'
import type { PersonaProfile } from '@/persona/schema'
import {
  deletePersonaCascade,
  getPersona,
  listPersonaSummaries,
  putPersona,
  type PersonaSummary,
} from '@/storage/personaRepo'
import { downloadExport, exportPersona, importFromFile } from '@/storage/transfer'

export interface RosterItem extends PersonaSummary {}

/** 空白人格的 id 生成 —— 与投料共用一套规则 */
function newId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export const useRosterStore = defineStore('roster', () => {
  const items = ref<RosterItem[]>([])
  const busy = ref(false)
  const notice = ref<string | null>(null)
  const error = ref<string | null>(null)

  async function refresh(): Promise<void> {
    try {
      items.value = await listPersonaSummaries()
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  /**
   * 新建空白人格。
   *
   * ⚠️ 只有名字，冻结层是空的 —— 它没法好好聊天（没有人设可演），
   * 要么走投料、要么等档案编辑器。但把它建出来是有意义的：
   * 先占位、先能切换，人设后面再填。
   */
  async function createBlank(name: string): Promise<string> {
    const now = new Date().toISOString()
    const profile: PersonaProfile = {
      id: newId(),
      name: name.trim() || '未命名',
      tagline: '',
      kind: 'virtual',
      version: '0.1.0',
      createdAt: now,
      updatedAt: now,
      source: emptySource(),
      frozen: emptyFrozen(),
      evolving: emptyEvolving(),
      correctionLog: [],
    }
    busy.value = true
    try {
      await putPersona(profile)
      await refresh()
      return profile.id
    } finally {
      busy.value = false
    }
  }

  /** 级联删除（档案 + 会话 + 消息 + 快照）。确认框由 UI 负责 */
  async function remove(id: string): Promise<void> {
    busy.value = true
    try {
      await deletePersonaCascade(id)
      await refresh()
    } finally {
      busy.value = false
    }
  }

  async function exportById(id: string): Promise<string> {
    busy.value = true
    try {
      // 导出前重新从库里读一份 —— 保证导出的是**落库状态**，不是内存里的中间态
      const profile = await getPersona(id)
      if (!profile) throw new Error('人格不存在（可能已被删除）')
      const file = await exportPersona(profile)
      return downloadExport(file)
    } finally {
      busy.value = false
    }
  }

  async function importFromText(json: string): Promise<{ personaId: string; name: string }> {
    busy.value = true
    try {
      const res = await importFromFile(json)
      await refresh()
      return res
    } finally {
      busy.value = false
    }
  }

  return {
    items,
    busy,
    notice,
    error,
    refresh,
    createBlank,
    remove,
    exportById,
    importFromText,
  }
})
