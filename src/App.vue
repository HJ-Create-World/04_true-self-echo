<script setup lang="ts">
/**
 * 应用外壳：只负责顶栏 + 路由出口。
 *
 * ⚠️ 这里**不放任何业务状态**。人格名、会话、投料进度都由各 view 自己取，
 * 外壳一旦开始持有状态，两个页面就会互相牵扯。
 *
 * 全局挂两件合规设施（R1/R2/R3，2026-09-22）：
 * AiDisclosureGate —— 首访 AI 身份告知遮罩；
 * WellbeingNotice —— 时长/依赖提醒横幅（心跳由 wellbeing store 驱动）。
 */
import { onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

import AiDisclosureGate from '@/components/AiDisclosureGate.vue'
import MoodSwitcher from '@/components/MoodSwitcher.vue'
import WellbeingNotice from '@/components/WellbeingNotice.vue'
import { useWellbeingStore } from '@/stores/wellbeing'

const NAV = [
  { to: '/', label: '对话' },
  { to: '/feed', label: '投料' },
  { to: '/persona', label: '档案' },
] as const

const wellbeing = useWellbeingStore()
onMounted(() => wellbeing.start())
</script>

<template>
  <div class="mx-auto flex h-screen w-full max-w-4xl flex-col px-6">
    <header class="flex items-center justify-between gap-4 py-6">
      <h1 class="m-0 text-3xl tracking-wide md:text-4xl">真我回响</h1>

      <nav class="flex items-center gap-1 rounded-full bg-white/50 p-1">
        <RouterLink
          v-for="item in NAV"
          :key="item.to"
          :to="item.to"
          class="rounded-full px-4 py-1.5 text-sm tracking-wide text-[#3a3a3a]/60 no-underline transition-all duration-500 ease-in-out hover:text-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
          active-class="bg-white/80 text-[#3a3a3a] shadow-[0_4px_20px_rgba(74,111,165,0.12)]"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <MoodSwitcher />
    </header>

    <RouterView />

    <AiDisclosureGate />
    <WellbeingNotice />
  </div>
</template>
