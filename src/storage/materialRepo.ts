/**
 * 素材库（A3 · 预处理产物的存 / 删 / 导出 / 复用）
 *
 * 定位纪律：这是**薄的一层** —— 不是素材管理后台，就四件事：
 * 保存、删除、导出、载入。存的是拼装后的最终素材（可直接投料），
 * 不存原始语料（19MB 文件在用户手里，重预处理是零成本本地操作）。
 *
 * 导出格式自带 app 标识 + schema —— 与 `transfer.ts` 的导出哲学一致：
 * 导入时校验身份，版本比当前新则提示升级。
 */

import db from './db'

export interface MaterialRow {
  id?: number
  name: string
  /** 目标角色（语料拼装必填；纯文本素材可为空） */
  protagonist: string
  /** 来源描述，如「JSONL 语料 · 5 章」/「粘贴文本」 */
  source: string
  content: string
  chars: number
  createdAt: number
}

const APP_TAG = 'true-self-echo'
const MATERIAL_SCHEMA = 1

export async function saveMaterial(
  m: Omit<MaterialRow, 'id' | 'createdAt' | 'chars'>,
): Promise<MaterialRow> {
  const row: MaterialRow = { ...m, chars: m.content.replace(/\s/g, '').length, createdAt: Date.now() }
  row.id = (await db.materials.add(row)) as number
  return row
}

export async function listMaterials(): Promise<MaterialRow[]> {
  const rows = await db.materials.orderBy('createdAt').reverse().toArray()
  return rows
}

export async function deleteMaterial(id: number): Promise<void> {
  await db.materials.delete(id)
}

/** 导出下载。返回文件名供 UI 提示 */
export function downloadMaterial(m: MaterialRow): string {
  const safe = m.name.replace(/[\\/:*?"<>|\s]+/g, '-')
  const name = `真我回响-素材-${safe}.json`
  const file = {
    app: APP_TAG,
    schema: MATERIAL_SCHEMA,
    kind: 'material',
    name: m.name,
    protagonist: m.protagonist,
    source: m.source,
    content: m.content,
  }
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
  return name
}

/** 从导出的 JSON 文本恢复一份素材记录（不覆盖已有，纯新增） */
export async function importMaterial(json: string): Promise<MaterialRow> {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(json) as Record<string, unknown>
  } catch (e) {
    throw new Error(`不是合法的 JSON 文件：${e instanceof Error ? e.message : String(e)}`)
  }
  if (data.app !== APP_TAG || data.kind !== 'material') {
    throw new Error('这不是真我回响的素材导出文件')
  }
  if (Number(data.schema) > MATERIAL_SCHEMA) throw new Error('文件版本比当前应用新，请先升级应用')
  const content = String(data.content ?? '')
  if (!content.trim()) throw new Error('文件里没有素材内容')
  return saveMaterial({
    name: String(data.name ?? '导入的素材'),
    protagonist: String(data.protagonist ?? ''),
    source: `${String(data.source ?? '导入')}（导入）`,
    content,
  })
}
