<script setup lang="ts">
/**
 * 单条消息 —— 水彩便笺样式。
 * 对话方走「纸白 + 左对齐」，爱莉走「水彩蓝灰 + 右对齐」。
 * DESIGN_STANDARD §1.1：不用纯黑、不用硬边框、不用直角、不用高饱和、不用 font-bold。
 */
import { computed } from 'vue'

const props = defineProps<{
  role: 'user' | 'assistant'
  content: string
  degraded?: boolean
}>()

const isBot = computed(() => props.role === 'assistant')
</script>

<template>
  <div :class="['flex w-full', isBot ? 'justify-start' : 'justify-end']">
    <div
      :class="[
        'max-w-[min(42rem,88%)] whitespace-pre-wrap break-words',
        'rounded-2xl md:rounded-3xl px-6 py-4 leading-relaxed',
        'text-[15px] transition-all duration-500 ease-in-out',
        isBot
          ? 'bg-white/70 text-[#3a3a3a] shadow-[0_4px_20px_rgba(74,111,165,0.12)]'
          : 'bg-[#4a6fa5]/12 text-[#3a3a3a]',
      ]"
    >
      <p class="m-0">{{ content }}</p>

      <p
        v-if="degraded"
        class="mt-3 mb-0 text-xs tracking-wide text-[#c38d94]"
      >
        这次说到一半绕回来了，先到这儿
      </p>
    </div>
  </div>
</template>
