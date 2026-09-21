/**
 * 同意记录（Phase 2.5 · R5 单独同意的落库侧）
 *
 * 设计要点：
 * - **同意是事件，不是档案字段**：独立表，一条 = 某个 scope 在某时点对某版文案的同意。
 *   将来 R8「撤回同意入口」按 scope 撤回，审计能看到「何时同意了哪一版」。
 * - **version 作废机制**：文案任何实质修改都必须 bump `CONSENT_VERSION`
 *   （`@/consent/consent.ts`），旧版本记录视为失效、要重新弹窗签署。
 *   这是 R5 的隐含要求 —— 用户同意的是他**读到的那段话**，不是一段可被悄悄替换的话。
 * - `revokedAt` 字段现在就留（撤回是置值不是删行，保留历史），撤回入口本身是
 *   R8 设置页的事，本阶段不实现。
 */

import type { ConsentScope } from '@/consent/consent'

import { CONSENT_VERSION } from '@/consent/consent'
import db from './db'

export interface ConsentRow {
  id?: number
  scope: ConsentScope
  /** 签署时读到的文案版本（`CONSENT_VERSION`） */
  version: string
  grantedAt: string
  /** 撤回时间；null = 仍然有效 */
  revokedAt: string | null
}

/** 当前是否有有效同意：已签 + 版本匹配 + 未撤回 */
export async function hasValidConsent(scope: ConsentScope): Promise<boolean> {
  const rows = await db.consents.where('scope').equals(scope).toArray()
  return rows.some((r) => !r.revokedAt && r.version === CONSENT_VERSION)
}

/** 记录一次同意。同 scope 重复签不覆盖 —— 多条历史都保留 */
export async function grantConsent(scope: ConsentScope): Promise<void> {
  await db.consents.add({
    scope,
    version: CONSENT_VERSION,
    grantedAt: new Date().toISOString(),
    revokedAt: null,
  })
}
