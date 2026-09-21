/**
 * 真人素材的两道同意关卡（Phase 2.5 · R5 / R6）
 *
 * 状态放 module 级单例（不放 Pinia）：只有真人投料流程用到，
 * 独立成模块让 feed store 的职责不被稀释 —— store 管「素材→清洗」，
 * 这里管「同意签了没有」。
 *
 * 两道关卡对应两个 scope：
 * - `realMaterial`（R5 + R4）：真人素材投料的入口关 —— 弹窗三步走完才放行
 * - `cloudTransfer`（R6）：素材发送云端 API 的传输关 —— 真人素材**默认本机**，
 *   用户明确勾选「我知道素材会发到 XX 云端」才放行，且记录独立落库
 */

import { ref } from 'vue'

import { grantConsent, hasValidConsent } from '@/storage/consentRepo'

const realMaterialConsented = ref(false)
const cloudTransferConsented = ref(false)

async function refresh(): Promise<void> {
  realMaterialConsented.value = await hasValidConsent('realMaterial')
  cloudTransferConsented.value = await hasValidConsent('cloudTransfer')
}

export function useRealGate() {
  return {
    realMaterialConsented,
    cloudTransferConsented,
    refresh,
    /** R5 弹窗走完后的落库 + 刷新（组件只 emit，不直接碰存储） */
    async grantRealMaterial() {
      await grantConsent('realMaterial')
      realMaterialConsented.value = true
    },
    /** R6 勾选「素材发往云端」后的落库 + 刷新 */
    async grantCloudTransfer() {
      await grantConsent('cloudTransfer')
      cloudTransferConsented.value = true
    },
  }
}
