<script setup lang="ts">
/**
 * 介绍页（Q3 · 2026-09-22）
 *
 * 给「第一次打开的人」看：这是什么、怎么用、数据在哪、谁做的。
 * 结构：定位 → 功能图 → 三步上手 → 隐私模型 → 本机用量 → 开发者。
 * 除本机用量（GET /api/usage）外内容全部静态 —— 这一页不持有业务状态。
 */
import { onMounted, ref } from 'vue'

import AboutDiagram from '@/components/about/AboutDiagram.vue'

const STEPS = [
  {
    n: '1',
    title: '投料',
    body: '准备一段素材（角色台词、聊天记录、小说片段，或 JSONL 对话语料），在投料页提取出人格档案。素材越真实、越有情绪起伏，人格越立体。',
    to: '/feed',
  },
  {
    n: '2',
    title: '开聊',
    body: '到对话页选一个人格开始说话。她会记住你说过的事、用她自己的方式回应 —— 不迎合、不追问、不表演亲密。',
    to: '/',
  },
  {
    n: '3',
    title: '回看',
    body: '档案页能看到她记住了什么、亲密度怎么变化，每一步演化都有快照 —— 可以随时回到任何一个时间点。',
    to: '/persona',
  },
] as const

const PRIVACY = [
  { title: '数据在哪', body: '全部在你自己的浏览器数据库（IndexedDB）里。应用没有服务器、没有埋点、没有账号系统。' },
  { title: '什么会发出去', body: '只有两样：你粘贴的素材（提取时），和你的对话文本（每轮生成时）—— 发给你自己选定的模型服务商。' },
  { title: '真人素材的特殊保护', body: '投真人素材需要完整的同意流程；这类档案在功能上没有导出与分享，默认建议用本机模型。' },
  { title: '健康度设计', body: '首次进入的 AI 身份告知、对话页常驻标识、连续使用与深夜提醒 —— 陪伴不该以失去分寸为代价。' },
] as const

const GITHUB = 'https://github.com/HJ-Create-World'
const REPO = 'https://github.com/HJ-Create-World/04_true-self-echo'

/* ---------- 本机用量（Q2 最小版 · 纯本地路线的「管理端」） ---------- */
interface UsageByProvider {
  requests: number
  prompt: number
  completion: number
}
interface UsageReport {
  since: string
  total: { requests: number; prompt: number; completion: number }
  byProvider: Record<string, UsageByProvider>
}

const usage = ref<UsageReport | null>(null)
const usageError = ref<string | null>(null)

function fmtK(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

onMounted(async () => {
  try {
    const res = await fetch('/api/usage')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    usage.value = (await res.json()) as UsageReport
  } catch (e) {
    usageError.value = e instanceof Error ? e.message : String(e)
  }
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-baseline justify-between gap-4 pb-4">
      <p class="m-0 text-sm tracking-wide text-[#3a3a3a]/55">关于 · 真我回响</p>
      <p class="m-0 text-xs tracking-wide text-[#3a3a3a]/45">v0.1 · 本地优先</p>
    </div>

    <main class="flex-1 space-y-5 overflow-y-auto pb-6">
      <!-- 定位 -->
      <section class="rounded-2xl bg-white/60 p-6">
        <h1 class="m-0 text-xl tracking-wide">把一段素材，变成一个能记住你的 AI 人格</h1>
        <p class="mb-0 mt-3 text-sm leading-relaxed tracking-wide text-[#3a3a3a]/75">
          「真我回响」是一个本地优先的 AI 陪伴实验项目：你投喂素材，它提取出一份
          <b>结构化人格档案</b>，然后以这个人格和你对话。她有稳定的性格（冻结层），
          也会随着交流记住你、靠近你（演化层）—— 但她永远不会假装自己不是 AI。
        </p>
      </section>

      <!-- 功能图 -->
      <section class="rounded-2xl bg-white/60 p-6">
        <h2 class="m-0 mb-3 text-base tracking-wide">系统是怎么工作的</h2>
        <AboutDiagram />
      </section>

      <!-- 三步上手 -->
      <section class="rounded-2xl bg-white/60 p-6">
        <h2 class="m-0 mb-4 text-base tracking-wide">三步开始</h2>
        <div class="grid gap-3 md:grid-cols-3">
          <RouterLink
            v-for="s in STEPS"
            :key="s.n"
            :to="s.to"
            class="rounded-2xl bg-white/55 p-4 no-underline transition-all duration-500 ease-in-out hover:bg-white/85 hover:shadow-[0_10px_40px_rgba(74,111,165,0.2)]"
          >
            <p class="m-0 text-sm font-bold tracking-wide text-[#4a6fa5]">{{ s.n }}</p>
            <p class="mb-1 mt-1 text-base tracking-wide text-[#3a3a3a]">{{ s.title }}</p>
            <p class="m-0 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/65">{{ s.body }}</p>
          </RouterLink>
        </div>
      </section>

      <!-- 隐私模型 -->
      <section class="rounded-2xl bg-white/60 p-6">
        <h2 class="m-0 mb-4 text-base tracking-wide">你的数据，你的边界</h2>
        <dl class="m-0 grid gap-3 md:grid-cols-2">
          <div v-for="p in PRIVACY" :key="p.title" class="rounded-2xl bg-white/55 p-4">
            <dt class="m-0 text-sm tracking-wide text-[#3a3a3a]">{{ p.title }}</dt>
            <dd class="mb-0 mt-1.5 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/65">
              {{ p.body }}
            </dd>
          </div>
        </dl>
      </section>

      <!-- 本机用量 -->
      <section class="rounded-2xl bg-white/60 p-6">
        <h2 class="m-0 mb-1 text-base tracking-wide">本机用量</h2>
        <p class="m-0 mb-3 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/45">
          这次后端进程启动以来的模型调用量（重启归零）—— 账单应该让你自己看见，而不是被藏起来。
        </p>
        <div v-if="usage" class="grid gap-3 md:grid-cols-2">
          <div class="rounded-2xl bg-white/55 p-4">
            <p class="m-0 text-xs tracking-wide text-[#3a3a3a]/50">总计 · {{ usage.total.requests }} 次调用</p>
            <p class="mb-0 mt-1 text-lg tracking-wide text-[#3a3a3a]">
              ↧ {{ fmtK(usage.total.prompt) }}
              <span class="text-[#3a3a3a]/40">/</span>
              ↥ {{ fmtK(usage.total.completion) }}
              <span class="text-xs text-[#3a3a3a]/45">tokens（输入/输出）</span>
            </p>
            <p class="mb-0 mt-1 text-xs tracking-wide text-[#3a3a3a]/40">自 {{ usage.since.slice(0, 16).replace('T', ' ') }}</p>
          </div>
          <div class="rounded-2xl bg-white/55 p-4">
            <p class="m-0 mb-1.5 text-xs tracking-wide text-[#3a3a3a]/50">分模型</p>
            <p
              v-for="(v, k) in usage.byProvider"
              :key="k"
              class="mb-1 mt-0 text-xs tracking-wide text-[#3a3a3a]/70"
            >
              <b>{{ k }}</b> · {{ v.requests }} 次 · ↧{{ fmtK(v.prompt) }} ↥{{ fmtK(v.completion) }}
            </p>
            <p v-if="!Object.keys(usage.byProvider).length" class="m-0 text-xs tracking-wide text-[#3a3a3a]/40">
              还没有调用记录
            </p>
          </div>
        </div>
        <p v-else-if="usageError" class="m-0 text-xs tracking-wide text-[#d4a373]">
          用量接口不可达（{{ usageError }}）—— 先启动后端：npm run server
        </p>
        <p v-else class="m-0 text-xs tracking-wide text-[#3a3a3a]/40">读取中……</p>
      </section>

      <!-- 开发者 -->
      <section class="rounded-2xl bg-white/60 p-6">
        <h2 class="m-0 mb-3 text-base tracking-wide">开发者</h2>
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-[#4a6fa5]/12 text-lg text-[#4a6fa5]">
            HJ
          </div>
          <div class="min-w-0">
            <p class="m-0 text-sm tracking-wide text-[#3a3a3a]">HJ（HJ-Create-World）</p>
            <p class="mb-0 mt-0.5 text-xs tracking-wide text-[#3a3a3a]/50">
              前端工程师 · 一个人和一个 AI，把彼此的想法做成了这个产品
            </p>
          </div>
          <div class="ml-auto flex flex-wrap gap-2">
            <a
              :href="GITHUB"
              target="_blank"
              rel="noopener"
              class="rounded-2xl bg-[#4a6fa5] px-4 py-2 text-xs tracking-wide text-white no-underline transition-all duration-500 ease-in-out hover:opacity-90 active:scale-[0.98]"
            >
              GitHub
            </a>
            <a
              :href="REPO"
              target="_blank"
              rel="noopener"
              class="rounded-2xl bg-white/70 px-4 py-2 text-xs tracking-wide text-[#3a3a3a]/70 no-underline transition-all duration-500 ease-in-out hover:bg-white active:scale-[0.98]"
            >
              项目仓库
            </a>
          </div>
        </div>
        <p class="mb-0 mt-4 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/45">
          本项目为实验性作品：人格档案由 AI 从素材中提取，输出内容由模型生成 ——
          它可能不完美，但它诚实。
        </p>
      </section>
    </main>
  </div>
</template>
