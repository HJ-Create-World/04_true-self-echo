<script setup lang="ts">
/**
 * 手动微调编辑器 —— SPEC §六 的第二种操作模式。
 *
 * ⚠️ 界面上的**每一条都可以改**，这是刻意的：
 * 提取是「一次不可靠的猜测」，微调是「人把它校正到可用」。
 * 这个「看见 AI 提取了什么、并且能改」的过程本身就是产品价值
 * （`SPEC.md` §六：「手动微调模式是核心体验之一」）。
 *
 * 只做提示、不做阻断 —— 用户要删光某一节也随他，那是他的档案。
 * 完整性告警由 `ExtractPanel` 统一显示（黑盒模式也要看到），这里不重复。
 */
import { computed } from 'vue'

import ObjectListEditor from '@/components/feed/ObjectListEditor.vue'
import {
  BLANKS,
  BLOCK_FIELDS,
  CONSTRAINT_FIELDS,
  SOCIAL_FIELDS,
  TENSION_FIELDS,
  TRAIT_FIELDS,
} from '@/feed/editFields'
import { useFeedStore } from '@/feed/store'
import type { Block, Constraint, Rule, Tension, Trait } from '@/persona/schema'

const feed = useFeedStore()

/**
 * ⚠️ 这里有一次显式断言，原因值得记下来：
 * `Trait` / `Tension` 这些是 **interface**，而 TS 的 interface **不获得隐式索引签名**
 * —— 它们无法直接赋给 `Record<string, unknown>[]`，即使字段全都是 string。
 * 所以通用编辑器（按字段名读写）与结构化类型之间必须有人接一下。
 * **字段名的一致性由 `feed/editFields.ts` 与 `persona/schema.ts` 对齐来保证**，
 * 不是靠这个断言。
 */
type AnyRow = Record<string, unknown>

function setTraits(rows: AnyRow[]) {
  if (feed.draft) feed.draft.frozen.coreTraits = rows as unknown as Trait[]
}
function setBlocks(rows: AnyRow[]) {
  if (feed.draft) feed.draft.frozen.expressionDNA = rows as unknown as Block[]
}
function setSocial(rows: AnyRow[]) {
  if (feed.draft) feed.draft.frozen.socialBehavior = rows as unknown as Rule[]
}
function setTensions(rows: AnyRow[]) {
  if (feed.draft) feed.draft.frozen.tensions = rows as unknown as Tension[]
}
function setConstraints(rows: AnyRow[]) {
  if (feed.draft) feed.draft.frozen.constraints = rows as unknown as Constraint[]
}

/** 绑定到 store 的可写计算属性 —— 比一堆 setter 函数短，且类型自动对 */
function bindString(get: () => string | undefined, set: (v: string) => void) {
  return computed({ get: () => get() ?? '', set })
}

const name = bindString(
  () => feed.draft?.name,
  (v) => {
    if (feed.draft) feed.draft.name = v
  },
)
const tagline = bindString(
  () => feed.draft?.tagline,
  (v) => {
    if (feed.draft) feed.draft.tagline = v
  },
)
const mechanism = bindString(
  () => feed.draft?.frozen.mechanism,
  (v) => {
    if (feed.draft) feed.draft.frozen.mechanism = v
  },
)

/** 称呼与关系三个字段 —— key 与 `persona/schema.ts` 的 Identity 对齐 */
type IdentityKey = 'selfCall' | 'callUser' | 'relation'
const IDENTITY_FIELDS: { key: IdentityKey; label: string }[] = [
  { key: 'selfCall', label: '她如何称呼自己' },
  { key: 'callUser', label: '她怎么称呼对方' },
  { key: 'relation', label: '她如何定义与对方的关系' },
]

function identityValue(key: IdentityKey): string {
  return feed.draft?.frozen.identity[key] ?? ''
}
function setIdentity(key: IdentityKey, v: string) {
  if (feed.draft) feed.draft.frozen.identity[key] = v
}

/** 负面清单在 UI 上是多行文本 */
const boundaries = computed({
  get: () => feed.draft?.frozen.boundaries.join('\n') ?? '',
  set: (v: string) => {
    if (!feed.draft) return
    feed.draft.frozen.boundaries = v
      .split('\n')
      .map((s) => s.replace(/^\s*\d+[.、)]\s*/, '').trim())
      .filter(Boolean)
  },
})

const INPUT_CLASS =
  'w-full rounded-xl bg-white/60 px-3 py-2 font-serif text-xs leading-relaxed tracking-wide text-[#3a3a3a] transition-all duration-500 ease-in-out focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30'
</script>

<template>
  <div v-if="feed.draft" class="space-y-3">
    <!-- 基本信息 -->
    <section class="rounded-2xl bg-white/50 p-4">
      <h3 class="m-0 mb-3 text-sm tracking-wide">基本信息</h3>
      <div class="space-y-2">
        <label class="block">
          <span class="mb-1 block text-xs tracking-wide text-[#3a3a3a]/55">
            名字
            <span class="text-[#3a3a3a]/40">
              · 只是界面上的标签，<span class="text-[#d4a373]">不会进 System Prompt</span>
            </span>
          </span>
          <input v-model="name" type="text" :class="INPUT_CLASS" />
        </label>
        <label class="block">
          <span class="mb-1 block text-xs tracking-wide text-[#3a3a3a]/55">
            一句话气质 <span class="text-[#3a3a3a]/40">· 会成为每轮重注入的前缀</span>
          </span>
          <input v-model="tagline" type="text" :class="INPUT_CLASS" />
        </label>
        <label class="block">
          <span class="mb-1 block text-xs tracking-wide text-[#3a3a3a]/55">核心机制</span>
          <textarea v-model="mechanism" rows="2" :class="INPUT_CLASS" class="resize-y" />
        </label>
      </div>

      <h4 class="m-0 mb-1 mt-4 text-xs tracking-wide text-[#3a3a3a]/55">称呼与关系</h4>
      <p class="mb-2 mt-0 text-xs leading-relaxed tracking-wide text-[#d4a373]">
        想让她<span class="text-[#c38d94]">自己说出名字</span>，要填这一节 ——
        上面那个「名字」只是给你看的标签。
      </p>
      <div class="space-y-2">
        <label v-for="f in IDENTITY_FIELDS" :key="f.key" class="block">
          <span class="mb-1 block text-xs tracking-wide text-[#3a3a3a]/45">{{ f.label }}</span>
          <input
            type="text"
            :value="identityValue(f.key)"
            :class="INPUT_CLASS"
            @input="setIdentity(f.key, ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </section>

    <ObjectListEditor
      title="一 · 核心特质"
      hint="每条都要能被一个不了解她的人照着执行。「内心其实很孤独」这种不算。"
      add-label="加一条特质"
      :items="feed.draft.frozen.coreTraits"
      :fields="TRAIT_FIELDS"
      :blank="BLANKS.trait"
      @update:items="setTraits"
    />

    <ObjectListEditor
      title="二 · 说话风格"
      hint="子节的顺序就是渲染进 System Prompt 的顺序 —— 与 Phase 0 验证过的形状一致。"
      add-label="加一节"
      :items="feed.draft.frozen.expressionDNA"
      :fields="BLOCK_FIELDS"
      :blank="BLANKS.block"
      @update:items="setBlocks"
    />

    <ObjectListEditor
      title="三 · 内在矛盾"
      hint="每组必须有统一点，否则矛盾会变成随机行为抖动；填不出来就删掉整组。"
      add-label="加一组"
      :items="feed.draft.frozen.tensions"
      :fields="TENSION_FIELDS"
      :blank="BLANKS.tension"
      @update:items="setTensions"
    />

    <ObjectListEditor
      title="四 · 情境反应模式"
      hint="「情境 → 行为」比性格形容词强，因为它是可执行的触发器。"
      add-label="加一条情境"
      :items="feed.draft.frozen.socialBehavior"
      :fields="SOCIAL_FIELDS"
      :blank="BLANKS.social"
      @update:items="setSocial"
    />

    <section class="rounded-2xl bg-white/50 p-4">
      <h3 class="m-0 mb-1 text-sm tracking-wide">
        她绝不会说什么
        <span class="text-xs text-[#3a3a3a]/45">（{{ feed.draft.frozen.boundaries.length }} 条）</span>
      </h3>
      <p class="m-0 mb-2 text-xs leading-relaxed tracking-wide text-[#d4a373]">
        负面清单 —— 比「她会说什么」约束力更强、也更难编造。一行一条。
      </p>
      <textarea v-model="boundaries" rows="6" :class="INPUT_CLASS" class="resize-y" />
    </section>

    <ObjectListEditor
      title="五 · 约束条件"
      hint="不能直接说什么 + 只能走哪条通道说。档案里最容易被忽略、但对「不出戏」最关键的一节。"
      add-label="加一条约束"
      :items="feed.draft.frozen.constraints"
      :fields="CONSTRAINT_FIELDS"
      :blank="BLANKS.constraint"
      @update:items="setConstraints"
    />
  </div>
</template>
