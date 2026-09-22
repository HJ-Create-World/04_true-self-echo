<script setup lang="ts">
/**
 * 使用健康度横幅（R2 依赖预警 + R3 时长提醒的 UI）
 *
 * 设计纪律：可关、不阻断、低频 —— 防沉迷机制做成骚扰就成了被关掉的功能。
 * 同一时刻只显示一条（最新触发的），点掉后等下一次触发。
 */
import { useWellbeingStore } from '@/stores/wellbeing'

const wb = useWellbeingStore()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="wb.active"
      class="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
      role="status"
    >
      <div class="flex max-w-xl items-start gap-3 rounded-2xl bg-[#faf7f2]/95 px-5 py-4 shadow-[0_16px_60px_rgba(58,58,58,0.25)] backdrop-blur">
        <span class="mt-0.5 text-lg">🌅</span>
        <p class="m-0 text-sm leading-relaxed tracking-wide text-[#3a3a3a]/85">
          {{ wb.active.text }}
        </p>
        <button
          type="button"
          class="shrink-0 rounded-full bg-white/70 px-3 py-1 text-xs tracking-wide text-[#3a3a3a]/60 transition-all duration-500 ease-in-out hover:bg-white active:scale-[0.98]"
          @click="wb.dismiss()"
        >
          知道了
        </button>
      </div>
    </div>
  </Teleport>
</template>
