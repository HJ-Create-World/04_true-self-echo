<script setup lang="ts">
/**
 * 来源标注 + 层级检测。
 *
 * 来源档位（`SPEC.md` §六「素材来源标注」）：`artifact` / `impression` 档是
 * **编造的主要入口** —— 把「素材明示 / 素材暗示 / 我的外推」分开标，
 * 用户一眼能看出哪些结论可靠、哪些是 AI 在猜。
 *
 * ⚠️ 本期是**整份素材选一档**，不是逐条标。逐条标要等有了真实数据
 * （与 `persona-schema.md` §2.1「没有真实数据不凭空设计」同一条纪律）。
 */
import { TIERS, useFeedStore } from '@/feed/store'

const feed = useFeedStore()
</script>

<template>
  <section class="rounded-2xl bg-white/60 p-6">
    <header class="mb-4">
      <h2 class="m-0 text-base tracking-wide">来源标注</h2>
      <p class="m-0 mt-1 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/45">
        这份素材是从哪儿来的？诚实标 —— 后两档会明显拉低提取质量。
      </p>
    </header>

    <div class="grid gap-2 md:grid-cols-3">
      <button
        v-for="t in TIERS"
        :key="t.key"
        type="button"
        class="rounded-2xl px-4 py-3 text-left transition-all duration-500 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
        :class="
          feed.tier === t.key
            ? 'bg-[#e8a87c]/14 shadow-[0_4px_20px_rgba(74,111,165,0.12)]'
            : 'bg-white/50 hover:bg-white/80 hover:shadow-[0_10px_40px_rgba(74,111,165,0.35)]'
        "
        @click="feed.tier = t.key"
      >
        <span
          class="block text-sm tracking-wide"
          :class="feed.tier === t.key ? 'text-[#3a3a3a]' : 'text-[#3a3a3a]/70'"
        >
          {{ t.label }}
        </span>
        <span class="mt-1 block text-xs leading-relaxed tracking-wide text-[#3a3a3a]/50">
          {{ t.hint }}
        </span>
      </button>
    </div>

    <p
      v-if="feed.currentTier.risky && feed.rawChars > 0"
      class="mt-3 mb-0 rounded-xl bg-[#c38d94]/12 px-4 py-2 text-xs leading-relaxed tracking-wide text-[#c38d94]"
    >
      选了「{{ feed.currentTier.label }}」—— 这类素材提取出的东西
      <span class="text-[#3a3a3a]">本来就带推断成分</span>，后面出的档案请当成
      「我写的人设」而不是「从素材里读出来的事实」。
    </p>

    <div class="mt-5 border-t border-[#4a6fa5]/15 pt-4">
      <h3 class="m-0 mb-2 text-sm tracking-wide">材料层级</h3>
      <p
        class="m-0 text-xs leading-relaxed tracking-wide"
        :class="feed.layer.hasSecondLayer ? 'text-[#85cdca]' : 'text-[#d4a373]'"
      >
        {{ feed.layer.hasSecondLayer ? '✅ 检测到第二层' : '⚠️ 只检测到单层' }} ——
        <span class="text-[#3a3a3a]/65">{{ feed.layer.advice }}</span>
      </p>

      <ul v-if="feed.layer.samples.length" class="mt-2 mb-0 list-none space-y-1 p-0">
        <li
          v-for="s in feed.layer.samples"
          :key="s"
          class="rounded-xl bg-white/50 px-3 py-1.5 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/55"
        >
          {{ s }}
        </li>
      </ul>
    </div>
  </section>
</template>
