<script setup lang="ts">
/**
 * 真人素材的**独立同意弹窗**（Phase 2.5 · R4 + R5 + SPEC §十 第 11 条）
 *
 * 三步，任一步不满足都到不了投料入口 —— 这是「功能上拦截」，
 * 不是靠用户自觉：
 *   1. 在世确认：已故 / 不确定 → 终止（第 11 条，拒绝页说明原因）
 *   2. 授权确认（R4）：勾选授权声明，模板可下载 / 复制留档
 *   3. 单独同意（R5）：目的 / 方式 / 期限 / 影响四要素，读完才可签
 *
 * 弹窗不直接写库 —— `granted` 事件交给调用方走 `grantConsent()`，
 * 组件保持无副作用。文案本体在 `@/consent/consent.ts`（同意书正文）。
 */
import { computed, ref, watch } from 'vue'

import {
  AUTHORIZATION_STATEMENT,
  AUTHORIZATION_TEMPLATE,
  R5_NOTICE,
  type LivingAnswer,
  refusalFor,
} from '@/consent/consent'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ granted: []; cancel: [] }>()

type Step = 'living' | 'refused' | 'auth' | 'notice'

const step = ref<Step>('living')
const answer = ref<LivingAnswer>('living')
const authChecked = ref(false)
const noticeChecked = ref(false)
const showTemplate = ref(false)
const copyState = ref<string | null>(null)

const refusal = computed(() => refusalFor(answer.value))

// 每次打开都从第一步重来 —— 同意不可沿用上次的中间状态
watch(
  () => props.open,
  (v) => {
    if (v) {
      step.value = 'living'
      answer.value = 'living'
      authChecked.value = false
      noticeChecked.value = false
      showTemplate.value = false
      copyState.value = null
    }
  },
)

function confirmLiving() {
  step.value = refusal.value ? 'refused' : 'auth'
}

async function copyTemplate() {
  try {
    await navigator.clipboard.writeText(AUTHORIZATION_TEMPLATE)
    copyState.value = '已复制，可粘贴发给当事人'
  } catch {
    copyState.value = '复制失败，请展开后手动选择复制'
  }
}

function downloadTemplate() {
  const blob = new Blob([AUTHORIZATION_TEMPLATE], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '素材使用授权书.txt'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-[#3a3a3a]/35 p-4"
    >
      <section class="max-h-[86vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-[#faf7f2] p-7 shadow-[0_24px_80px_rgba(58,58,58,0.28)]">
        <!-- 步骤 1 · 在世确认（第 11 条） -->
        <template v-if="step === 'living'">
          <h2 class="m-0 text-base tracking-wide">开始之前 · 素材指向谁</h2>
          <p class="mt-2 mb-4 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/55">
            真人素材涉及他人的个人信息，流程与虚拟角色不同 —— 先回答一个问题。
          </p>
          <div class="space-y-2">
            <button
              v-for="opt in [
                { key: 'living', label: '在世的人物（朋友 / 亲人 / 熟人）' },
                { key: 'deceased', label: '已经离世的人物' },
                { key: 'unsure', label: '不确定 / 不愿说明' },
              ]"
              :key="opt.key"
              type="button"
              class="w-full rounded-2xl px-4 py-3 text-left text-sm tracking-wide transition-all duration-500 ease-in-out active:scale-[0.98]"
              :class="answer === opt.key ? 'bg-[#e8a87c]/14' : 'bg-white/60 hover:bg-white/90'"
              @click="answer = opt.key as LivingAnswer"
            >
              {{ opt.label }}
            </button>
          </div>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" class="rounded-2xl px-4 py-2 text-xs tracking-wide text-[#3a3a3a]/60 hover:bg-white/70" @click="emit('cancel')">取消</button>
            <button type="button" class="rounded-2xl bg-[#4a6fa5] px-5 py-2 text-xs tracking-wide text-white hover:opacity-90" @click="confirmLiving">下一步</button>
          </div>
        </template>

        <!-- 拒绝页（第 11 条 · 默认不做） -->
        <template v-else-if="step === 'refused'">
          <h2 class="m-0 text-base tracking-wide text-[#c38d94]">这个流程到此为止</h2>
          <p class="mt-3 mb-5 text-sm leading-relaxed tracking-wide text-[#3a3a3a]/75">{{ refusal }}</p>
          <button type="button" class="rounded-2xl bg-white/70 px-5 py-2 text-xs tracking-wide text-[#3a3a3a]/70 hover:bg-white" @click="emit('cancel')">我知道了</button>
        </template>

        <!-- 步骤 2 · 授权确认（R4） -->
        <template v-else-if="step === 'auth'">
          <h2 class="m-0 text-base tracking-wide">素材授权确认</h2>
          <p class="mt-2 mb-4 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/55">
            上传他人的聊天记录前，先确认你有使用权。建议把授权书发给当事人签署留档。
          </p>
          <div class="rounded-2xl bg-white/60 p-4">
            <button type="button" class="text-xs tracking-wide text-[#4a6fa5] hover:underline" @click="showTemplate = !showTemplate">
              {{ showTemplate ? '收起授权书模板' : '查看授权书模板' }}
            </button>
            <div v-if="showTemplate" class="mt-3">
              <pre class="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white/80 p-3 text-[11px] leading-relaxed tracking-wide text-[#3a3a3a]/70">{{ AUTHORIZATION_TEMPLATE }}</pre>
              <div class="mt-2 flex items-center gap-3">
                <button type="button" class="rounded-xl bg-white/80 px-3 py-1.5 text-xs tracking-wide text-[#3a3a3a]/70 hover:bg-white" @click="downloadTemplate">下载 txt</button>
                <button type="button" class="rounded-xl bg-white/80 px-3 py-1.5 text-xs tracking-wide text-[#3a3a3a]/70 hover:bg-white" @click="copyTemplate">复制全文</button>
                <span v-if="copyState" class="text-xs tracking-wide text-[#85cdca]">{{ copyState }}</span>
              </div>
            </div>
          </div>
          <label class="mt-4 flex cursor-pointer items-start gap-2 text-sm leading-relaxed tracking-wide text-[#3a3a3a]/80">
            <input v-model="authChecked" type="checkbox" class="mt-1 accent-[#4a6fa5]" />
            <span>{{ AUTHORIZATION_STATEMENT }}</span>
          </label>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" class="rounded-2xl px-4 py-2 text-xs tracking-wide text-[#3a3a3a]/60 hover:bg-white/70" @click="step = 'living'">上一步</button>
            <button type="button" :disabled="!authChecked" class="rounded-2xl px-5 py-2 text-xs tracking-wide transition-all" :class="authChecked ? 'bg-[#4a6fa5] text-white hover:opacity-90' : 'cursor-not-allowed bg-white/60 text-[#3a3a3a]/35'" @click="step = 'notice'">下一步</button>
          </div>
        </template>

        <!-- 步骤 3 · 单独同意（R5 四要素） -->
        <template v-else-if="step === 'notice'">
          <h2 class="m-0 text-base tracking-wide">单独同意 · 敏感个人信息处理告知</h2>
          <p class="mt-2 mb-4 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/55">
            这是一份独立的告知，不属于任何用户协议 —— 四个方面都写清楚。
          </p>
          <dl class="m-0 space-y-3">
            <div v-for="(text, key) in R5_NOTICE" :key="key" class="rounded-2xl bg-white/60 p-4">
              <dt class="m-0 text-xs font-medium tracking-wide text-[#4a6fa5]">
                {{ { purpose: '目的（为什么收）', method: '方式（怎么处理）', retention: '期限（留多久）', impact: '影响（有什么风险）' }[key] }}
              </dt>
              <dd class="m-0 mt-1 text-sm leading-relaxed tracking-wide text-[#3a3a3a]/80">{{ text }}</dd>
            </div>
          </dl>
          <label class="mt-4 flex cursor-pointer items-start gap-2 text-sm leading-relaxed tracking-wide text-[#3a3a3a]/80">
            <input v-model="noticeChecked" type="checkbox" class="mt-1 accent-[#4a6fa5]" />
            <span>我已逐条阅读并理解上述内容，同意按所述方式处理素材。</span>
          </label>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" class="rounded-2xl px-4 py-2 text-xs tracking-wide text-[#3a3a3a]/60 hover:bg-white/70" @click="step = 'auth'">上一步</button>
            <button type="button" :disabled="!noticeChecked" class="rounded-2xl px-5 py-2 text-xs tracking-wide transition-all" :class="noticeChecked ? 'bg-[#4a6fa5] text-white hover:opacity-90' : 'cursor-not-allowed bg-white/60 text-[#3a3a3a]/35'" @click="emit('granted')">同意并继续</button>
          </div>
        </template>
      </section>
    </div>
  </Teleport>
</template>
