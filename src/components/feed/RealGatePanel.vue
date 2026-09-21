<script setup lang="ts">
/**
 * 真人素材的**同意关卡面板**（Phase 2.5 · R5）
 *
 * kind = real 且有素材时插在流程最前面：
 * 未签 → 「开始同意流程」打开独立弹窗；已签 → 绿灯放行。
 * 提取面板（ExtractPanel）读同一份状态，未签时按钮是死的 ——
 * 关卡不是装饰，是功能上真的过不去。
 */
import { onMounted, ref, watch } from 'vue'

import RealConsentDialog from '@/components/feed/RealConsentDialog.vue'
import { useRealGate } from '@/feed/realGate'

const gate = useRealGate()
const dialogOpen = ref(false)

onMounted(() => void gate.refresh())
// 素材重投 / 类型切换时库里的同意状态可能变化，进入流程前同步一次
watch(dialogOpen, (open) => {
  if (open) void gate.refresh()
})

async function onGranted() {
  dialogOpen.value = false
  await gate.grantRealMaterial()
}
</script>

<template>
  <section class="rounded-2xl bg-white/60 p-6">
    <header class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 class="m-0 text-base tracking-wide">真人素材 · 同意流程</h2>
      <span
        class="text-xs tracking-wide"
        :class="gate.realMaterialConsented.value ? 'text-[#85cdca]' : 'text-[#d4a373]'"
      >
        {{ gate.realMaterialConsented.value ? '✅ 已完成同意流程' : '⏳ 未完成' }}
      </span>
    </header>

    <p class="m-0 text-sm leading-relaxed tracking-wide text-[#3a3a3a]/70">
      这份素材指向一个真实的人。开始前需要完成三步：确认人物在世 → 确认你有素材使用权
      → 阅读并签署一份关于敏感个人信息的独立告知。
    </p>
    <p class="mt-2 mb-0 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/50">
      同意只签一次（文案更新后会重新征求）；之后随时可以在设置中撤回。
      用这份档案做的事只发生在你本机 —— 它没有导出与分享功能。
    </p>

    <div class="mt-4 flex justify-end">
      <button
        v-if="!gate.realMaterialConsented.value"
        type="button"
        class="rounded-2xl bg-[#4a6fa5] px-6 py-2.5 text-sm text-white transition-all duration-500 ease-in-out hover:opacity-90 active:scale-[0.98]"
        @click="dialogOpen = true"
      >
        开始同意流程
      </button>
    </div>

    <RealConsentDialog :open="dialogOpen" @granted="onGranted" @cancel="dialogOpen = false" />
  </section>
</template>
