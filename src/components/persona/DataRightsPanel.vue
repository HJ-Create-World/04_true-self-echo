<script setup lang="ts">
/**
 * 数据与权利区（R8：删除全部数据 + 撤回同意）
 *
 * 法规要求这两件事必须有**用户主动可及的入口**，不能只藏在说明书里。
 * 放档案页底部（HJ 确认的管理区方案延伸）。
 *
 * ⚠️ 删除是全表清空（含同意记录），**不可恢复** —— 确认文案要写清后果。
 * 删完刷新页面：应用启动时的 seedIfEmpty 会写回内置人格（唯一会「复活」的，
 * 用户已在确认弹窗知情）。
 */
import { ref } from 'vue'

import {
  hasValidConsent,
  revokeConsent,
} from '@/storage/consentRepo'
import { deleteAllData } from '@/storage/personaRepo'

const consentLive = ref<boolean | null>(null)
const notice = ref<string | null>(null)

async function refresh() {
  consentLive.value = await hasValidConsent('realMaterial')
}
void refresh()

/** 撤回真人素材相关的两道同意 —— 下次投真人素材要重新走整个同意流程 */
async function revoke() {
  if (!confirm('撤回真人素材的同意记录？\n已有的真人档案不会被删除，但下次投真人素材需要重新签署全部同意。')) return
  await revokeConsent('realMaterial')
  await revokeConsent('cloudTransfer')
  await refresh()
  notice.value = '已撤回 —— 下次投真人素材将重新征求同意。'
}

async function wipeAll() {
  if (
    !confirm(
      '⚠️ 删除我的全部数据？\n\n所有人格、对话、记忆、快照、同意记录将被永久清除，无法恢复。\n（内置的「爱莉希雅」会在删除后重新出现，因为它属于应用本身。）',
    )
  )
    return
  if (!confirm('最后确认一次 —— 真的没有想保留的对话吗？此操作不可恢复。')) return
  await deleteAllData()
  notice.value = '已清除全部数据，页面即将刷新……'
  setTimeout(() => location.reload(), 800)
}
</script>

<template>
  <section class="rounded-2xl border border-[#c38d94]/20 bg-white/45 p-5">
    <header class="mb-3">
      <h2 class="m-0 text-base tracking-wide">数据与权利</h2>
      <p class="mb-0 mt-1 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/45">
        数据都在你自己电脑上。这里提供两个只有你该碰的开关。
      </p>
    </header>

    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="rounded-2xl bg-white/70 px-4 py-2 text-xs tracking-wide text-[#3a3a3a]/70 transition-all duration-500 ease-in-out hover:bg-[#d4a373]/12 active:scale-[0.98]"
        @click="revoke"
      >
        撤回真人素材同意
      </button>
      <span class="text-xs tracking-wide" :class="consentLive ? 'text-[#3a3a3a]/45' : 'text-[#85cdca]'">
        {{ consentLive === null ? '' : consentLive ? '当前：已有有效同意' : '当前：无有效同意' }}
      </span>
    </div>

    <div class="mt-4 border-t border-[#c38d94]/15 pt-4">
      <button
        type="button"
        class="rounded-2xl bg-[#c38d94]/12 px-4 py-2 text-xs tracking-wide text-[#c38d94] transition-all duration-500 ease-in-out hover:bg-[#c38d94]/20 active:scale-[0.98]"
        @click="wipeAll"
      >
        删除我的全部数据
      </button>
      <p class="mb-0 mt-2 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/40">
        人格、对话、记忆、快照、同意记录 —— 全部永久清除，不可恢复。
      </p>
    </div>

    <p
      v-if="notice"
      class="mb-0 mt-3 rounded-xl bg-[#85cdca]/12 px-4 py-2 text-xs tracking-wide text-[#85cdca]"
    >
      {{ notice }}
    </p>
  </section>
</template>
