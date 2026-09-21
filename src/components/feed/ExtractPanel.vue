<script setup lang="ts">
/**
 * 提取面板 —— 两种操作模式（`SPEC.md` §六）的入口。
 *
 * · 手动微调：提取 → 逐字段过一遍 → 存 → 开聊（默认）
 * · 一键黑盒：提取 → 直接存 → 直接开聊
 *
 * 两者**底层是同一次提取、同一份 save()**，区别只在「给不给用户看和改」。
 */
import { computed, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'

import DraftEditor from '@/components/feed/DraftEditor.vue'
import CloudTransferGuard from '@/components/feed/CloudTransferGuard.vue'
import { isLocalProvider } from '@/api/provider'
import { MODES, useFeedStore } from '@/feed/store'
import { useRealGate } from '@/feed/realGate'
import { checkCompleteness, checkSoftWarnings } from '@/persona/schema'
import { useChatStore } from '@/stores/chat'

const feed = useFeedStore()
const chat = useChatStore()
const router = useRouter()
const gate = useRealGate()

/**
 * 用哪个后端跑提取。
 *
 * ⚠️ 不能在 setup 里直接 `chat.providers.find(...)` —— 那时 init() 还没跑完，
 * providers 是空数组，`?? ''` 会让 `<select>` 落到第一个选项上显示，
 * 而实际提交的是空字符串（后端自行解析默认值）—— **显示与实际不一致**。
 * 2026-09-20 实测踩过。改成等 providers 到位后再补默认值。
 */
const provider = ref('')
watchEffect(() => {
  if (provider.value || chat.providers.length === 0) return
  provider.value = (chat.providers.find((p) => p.isDefault) ?? chat.providers[0]).name
})

const preview = computed(() => {
  const f = feed.draft?.frozen
  if (!f) return null
  return {
    traits: f.coreTraits.length,
    style: f.expressionDNA.length,
    tensions: f.tensions.length,
    social: f.socialBehavior.length,
    boundaries: f.boundaries.length,
    constraints: f.constraints.length,
  }
})

const missing = computed(() => (feed.draft ? checkCompleteness(feed.draft.frozen) : []))
const warns = computed(() => (feed.draft ? checkSoftWarnings(feed.draft.frozen) : []))

/**
 * 真人素材的两道闸（R5 / R6）—— 提取按钮的硬性前置：
 * ① 同意流程没走完 → 不给提取
 * ② 选了云端 provider 但没确认传输告知 → 不给提取
 * 本地 provider 不受 ② 限制（素材不出设备，R6 的本意）。
 */
const providerIsCloud = computed(
  () => provider.value !== '' && !isLocalProvider(provider.value),
)
const extractBlocked = computed(() => {
  if (feed.kind !== 'real') return false
  if (!gate.realMaterialConsented.value) return true
  return providerIsCloud.value && !gate.cloudTransferConsented.value
})

/**
 * 保存失败必须看得见。
 * ⚠️ 2026-09-20 实测教训：第一版写成 `const p = await feed.save(); if (!p) return`，
 * 出错时**静默什么都不发生** —— 用户只会觉得按钮坏了。
 * 就是这一行让一个 `DataCloneError` 藏了两轮才被发现。
 */
const saveError = ref<string | null>(null)

async function onExtract() {
  saveError.value = null
  if (feed.mode === 'blackbox') {
    const profile = await feed.extractAndSave(provider.value)
    if (profile) {
      await chat.usePersona(profile)
      await router.push('/')
    } else if (!feed.extractError) {
      saveError.value = '提取没有产出结果'
    }
    return
  }
  await feed.extract(provider.value)
  if (chat.providers.length === 0) await chat.init()
}

async function onSave() {
  saveError.value = null
  try {
    const profile = await feed.save()
    if (!profile) {
      saveError.value = '没有可保存的草稿'
      return
    }
    await chat.usePersona(profile)
    await router.push('/')
  } catch (e) {
    saveError.value = `保存失败 —— ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`
    console.error('[feed] save failed', e)
  }
}

const BTN_PRIMARY =
  'rounded-2xl bg-[#4a6fa5] px-8 py-3 text-base text-white shadow-[0_4px_20px_rgba(74,111,165,0.12)] transition-all duration-500 ease-in-out hover:bg-[#4a6fa5]/90 hover:shadow-[0_10px_40px_rgba(74,111,165,0.35)] hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100'
const BTN_GHOST =
  'rounded-2xl bg-white/60 px-6 py-3 text-sm tracking-wide text-[#3a3a3a]/70 transition-all duration-500 ease-in-out hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]'
</script>

<template>
  <section class="rounded-2xl bg-white/60 p-6">
    <header class="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 class="m-0 text-base tracking-wide">提取</h2>
      <p v-if="feed.extractMeta" class="m-0 text-xs tracking-wide text-[#3a3a3a]/45">
        {{ feed.extractMeta }}
      </p>
    </header>

    <!-- 模式选择：提取前才可选（提取后切换没有语义） -->
    <div v-if="!feed.draft" class="mb-4 grid gap-2 md:grid-cols-2">
      <button
        v-for="m in MODES"
        :key="m.key"
        type="button"
        class="rounded-2xl px-4 py-3 text-left transition-all duration-500 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
        :class="
          feed.mode === m.key
            ? 'bg-[#e8a87c]/14 shadow-[0_4px_20px_rgba(74,111,165,0.12)]'
            : 'bg-white/50 hover:bg-white/80 hover:shadow-[0_10px_40px_rgba(74,111,165,0.35)]'
        "
        @click="feed.mode = m.key"
      >
        <span class="block text-sm tracking-wide text-[#3a3a3a]">{{ m.label }}</span>
        <span class="mt-1 block text-xs leading-relaxed tracking-wide text-[#3a3a3a]/50">
          {{ m.hint }}
        </span>
      </button>
    </div>

    <!-- 未提取 -->
    <div v-if="!feed.draft && !feed.extracting" class="flex flex-wrap items-center gap-4">
      <button type="button" :disabled="!feed.canProceed || extractBlocked" :class="BTN_PRIMARY" @click="onExtract">
        开始提取
      </button>

      <p v-if="extractBlocked" class="m-0 text-xs tracking-wide text-[#d4a373]">
        {{ !gate.realMaterialConsented.value ? '先完成上方的同意流程' : '先确认云端传输告知' }}
      </p>

      <label
        v-if="chat.providers.length"
        class="flex items-center gap-2 text-xs tracking-wide text-[#3a3a3a]/55"
      >
        用
        <select
          v-model="provider"
          class="rounded-xl bg-white/60 px-3 py-1.5 font-serif text-xs tracking-wide text-[#3a3a3a] transition-all duration-500 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
        >
          <option v-for="p in chat.providers" :key="p.name" :value="p.name">
            {{ p.name }} · {{ p.model }}
          </option>
        </select>
      </label>

      <p v-else class="m-0 text-xs tracking-wide text-[#c38d94]">
        连不上薄后端 —— 先运行 <code>npm run server</code> 再回来。
      </p>
    </div>

    <!-- R6 · 云端传输关卡（仅真人素材 + 云端 provider 时出现） -->
    <CloudTransferGuard
      class="mt-4"
      :active="feed.kind === 'real'"
      :provider-name="provider"
      :ready="chat.providers.length > 0"
    />

    <p v-if="feed.extracting" class="m-0 text-sm tracking-wide text-[#3a3a3a]/65">
      正在提取……（关掉思维链后会快很多，通常几秒到几十秒）
    </p>

    <p
      v-if="feed.extractError"
      class="mt-4 mb-0 rounded-xl bg-[#c38d94]/12 px-4 py-3 text-xs leading-relaxed tracking-wide text-[#c38d94]"
    >
      {{ feed.extractError }}
    </p>

    <!-- 解析失败：把原始输出摆出来，这是用户唯一能自查的东西 -->
    <details
      v-if="feed.extractError && feed.extractRaw"
      class="mt-3 text-xs tracking-wide text-[#3a3a3a]/50"
      open
    >
      <summary class="cursor-pointer transition-all duration-500 ease-in-out hover:text-[#3a3a3a]">
        模型原始输出（{{ feed.extractRaw.length }} 字）—— 可以复制出来排查
      </summary>
      <pre class="mt-2 mb-0 max-h-72 overflow-auto rounded-xl bg-white/60 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-[#3a3a3a]/60">{{ feed.extractRaw.slice(0, 8000) }}</pre>
    </details>

    <template v-if="feed.draft">
      <div class="rounded-2xl bg-white/50 px-5 py-4">
        <p class="m-0 text-base tracking-wide">
          {{ feed.draft.name || '（模型没给出名字）' }}
          <span class="text-sm text-[#3a3a3a]/50">{{ feed.draft.tagline }}</span>
        </p>
        <p
          v-if="feed.draft.frozen.mechanism"
          class="mt-1 mb-0 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/60"
        >
          {{ feed.draft.frozen.mechanism.split('\n').join(' ') }}
        </p>

        <ul
          v-if="preview"
          class="mt-3 mb-0 grid list-none grid-cols-2 gap-x-6 gap-y-1 p-0 text-xs tracking-wide text-[#3a3a3a]/60 md:grid-cols-3"
        >
          <li>核心特质 {{ preview.traits }} 条</li>
          <li>说话风格 {{ preview.style }} 节</li>
          <li>内在矛盾 {{ preview.tensions }} 组</li>
          <li>情境反应 {{ preview.social }} 条</li>
          <li>负面清单 {{ preview.boundaries }} 条</li>
          <li>约束条件 {{ preview.constraints }} 条</li>
        </ul>
      </div>

      <!-- 覆盖度自检（Prompt 修正 1f） -->
      <div
        v-if="feed.draft.coverage.missing.length || feed.draft.coverage.covered.length"
        class="mt-3 rounded-xl bg-white/50 px-4 py-3"
      >
        <p class="m-0 text-xs tracking-wide text-[#3a3a3a]/55">覆盖度自检</p>
        <p class="mt-1 mb-0 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/60">
          <span class="text-[#85cdca]">抓到</span> {{ feed.draft.coverage.covered.join('、') || '—' }}
        </p>
        <p class="mt-0.5 mb-0 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/60">
          <span class="text-[#d4a373]">素材里没有</span>
          {{ feed.draft.coverage.missing.join('、') || '—' }}
        </p>
        <p class="mt-1 mb-0 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/45">
          缺的这些，扮演时它只能靠猜 —— 这是这份档案的天花板。
        </p>
      </div>

      <!-- 完整性提示：两种模式都显示（黑盒用户也有权知道提取出来是残缺的） -->
      <p
        v-if="missing.length"
        class="mt-3 mb-0 rounded-xl bg-[#c38d94]/12 px-4 py-2 text-xs leading-relaxed tracking-wide text-[#c38d94]"
      >
        ⚠️ 结构不完整，缺：{{ missing.join(' / ') }}
        —— 这几节空着，扮演时会没有依据。
        <span v-if="feed.mode === 'manual'">下面可以手动补。</span>
      </p>
      <p
        v-else-if="warns.length"
        class="mt-3 mb-0 rounded-xl bg-[#d4a373]/14 px-4 py-2 text-xs leading-relaxed tracking-wide text-[#d4a373]"
      >
        {{ warns.join('；') }}
      </p>
      <p
        v-else
        class="mt-3 mb-0 rounded-xl bg-[#85cdca]/12 px-4 py-2 text-xs tracking-wide text-[#85cdca]"
      >
        ✅ 结构完整{{ feed.mode === 'manual' ? ' —— 下面每一格都可以改。' : '' }}
      </p>

      <!-- 手动微调：整份档案逐字段可编辑 -->
      <div v-if="feed.mode === 'manual'" class="mt-4">
        <p class="mb-3 mt-0 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/50">
          下面是提取出来的全部内容，改到你觉得对为止。
          <span class="text-[#d4a373]">留空的字段不会进 System Prompt。</span>
        </p>
        <DraftEditor />
      </div>

      <details class="mt-3 text-xs tracking-wide text-[#3a3a3a]/50">
        <summary class="cursor-pointer transition-all duration-500 ease-in-out hover:text-[#3a3a3a]">
          看模型原始输出
        </summary>
        <pre class="mt-2 mb-0 max-h-64 overflow-auto rounded-xl bg-white/60 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-[#3a3a3a]/60">{{ feed.draft.raw.slice(0, 6000) }}</pre>
      </details>

      <div class="mt-5 flex flex-wrap items-center gap-4">
        <button type="button" :class="BTN_PRIMARY" @click="onSave">
          存下来，去和它聊
        </button>
        <button type="button" :class="BTN_GHOST" @click="onExtract">重跑一次</button>
      </div>

      <p
        v-if="saveError"
        class="mt-3 mb-0 rounded-xl bg-[#c38d94]/12 px-4 py-3 text-xs leading-relaxed tracking-wide text-[#c38d94]"
      >
        {{ saveError }}
      </p>
    </template>
  </section>
</template>
