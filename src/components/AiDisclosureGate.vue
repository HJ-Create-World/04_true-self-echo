<script setup lang="ts">
/**
 * AI 身份告知遮罩（R1 / A1）
 *
 * 法规原文要求「进入时显著提示 + 对话页常驻标识，不得藏在协议里」——
 * 所以这是全屏遮罩而不是页脚条款，且首次确认真人不会再被重复打扰
 * （localStorage 记忆）。对话页的常驻徽章由 ChatView 承担，两者缺一不可。
 */
import { ref } from 'vue'

const KEY = 'tse_ai_disclosed'
const open = ref(false)
try {
  open.value = localStorage.getItem(KEY) !== '1'
} catch {
  open.value = false
}

function ack() {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* 隐私模式下记不住 —— 那就每次都提示，方向是安全的 */
  }
  open.value = false
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[60] flex items-center justify-center bg-[#3a3a3a]/45 p-4">
      <section class="max-w-lg rounded-2xl bg-[#faf7f2] p-8 shadow-[0_24px_80px_rgba(58,58,58,0.3)]">
        <p class="m-0 text-xs tracking-[0.2em] text-[#c38d94]">在开始之前 · 请知悉</p>
        <h2 class="mb-3 mt-2 text-lg tracking-wide text-[#3a3a3a]">这里的一切由 AI 生成</h2>
        <p class="mb-0 text-sm leading-relaxed tracking-wide text-[#3a3a3a]/75">
          你将要对话的「人」不存在 —— 它由一段人格档案驱动，说的每句话都是模型生成的。
          它有记忆、会变化，但它<b>不是真人，也不能替代真实的关系</b>。
          如果它说的话让你难过，请直接关掉页面 —— 数据都在你自己电脑上，没有服务器。
        </p>
        <button
          type="button"
          class="mt-5 w-full rounded-2xl bg-[#4a6fa5] px-6 py-3 text-sm tracking-wide text-white transition-all duration-500 ease-in-out hover:opacity-90 active:scale-[0.98]"
          @click="ack"
        >
          我知道这是 AI，开始使用
        </button>
      </section>
    </div>
  </Teleport>
</template>
