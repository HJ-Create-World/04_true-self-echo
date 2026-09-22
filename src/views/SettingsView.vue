<script setup lang="ts">
/**
 * 设置页（2026-09-22 · 路线二核心能力：前端配置模型服务）
 *
 * 之前换 key/模型要打开 .env 改环境变量 —— 现在在产品里配：
 * 每个模型服务一行（模型名 / API Key / 接口地址），存浏览器 localStorage，
 * 请求时随 /api/chat 带给本机后端**内存转发**（不直连、不落盘、不回显）。
 * 不配置 = 继续用 .env 默认，两者可混用。
 *
 * 🔴 已配置的 key 不回显 —— 防旁人瞄屏幕；placeholder 只提示「已配置」。
 */
import { onMounted, ref } from 'vue'

import { fetchProviders, type ChatRequest } from '@/api/chat'
import type { ProviderInfo } from '@/api/provider'
import {
  hasOverride,
  loadApiConfig,
  saveApiConfig,
  type ApiConfigMap,
} from '@/api/apiConfig'

const providers = ref<ProviderInfo[]>([])
const loaded = ref(false)

/** 每行可编辑的草稿（空字符串 = 不覆盖） */
const drafts = ref<Record<string, { model: string; apiKey: string; baseUrl: string }>>({})
const notice = ref<string | null>(null)

onMounted(async () => {
  try {
    providers.value = await fetchProviders()
  } catch {
    providers.value = []
  }
  const map = loadApiConfig()
  const draftsObj: Record<string, { model: string; apiKey: string; baseUrl: string }> = {}
  for (const p of providers.value) {
    const o = map[p.name] ?? {}
    draftsObj[p.name] = { model: o.model ?? '', apiKey: '', baseUrl: o.baseUrl ?? '' }
  }
  drafts.value = draftsObj
  loaded.value = true
})

function save(name: string) {
  const map: ApiConfigMap = loadApiConfig()
  const d = drafts.value[name]
  const clean: Record<string, string> = {}
  if (d.apiKey.trim()) clean.apiKey = d.apiKey.trim()
  if (d.model.trim()) clean.model = d.model.trim()
  if (d.baseUrl.trim()) clean.baseUrl = d.baseUrl.trim()
  if (Object.keys(clean).length) map[name] = clean
  else delete map[name] // 全空 = 清除覆盖，回落 .env
  saveApiConfig(map)
  notice.value = `已保存「${name}」的配置${Object.keys(clean).length ? '' : '（已清除覆盖，回落 .env 默认）'}`
  drafts.value[name].apiKey = ''
}

function reset(name: string) {
  const map = loadApiConfig()
  delete map[name]
  saveApiConfig(map)
  drafts.value[name] = { model: '', apiKey: '', baseUrl: '' }
  notice.value = `「${name}」已恢复 .env 默认`
}

/** 让用户确认配置真的生效 —— 打一条最小测试请求 */
const testing = ref<string | null>(null)
async function testProvider(name: string, model: string) {
  testing.value = name
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: name,
        system: '你是连通性测试器，只回复「pong」。',
        history: [],
        userInput: 'ping',
        maxTokens: 16,
        ...(model.trim() || hasOverride(name) ? { override: buildOverride(name, model) } : {}),
      } satisfies ChatRequest & { override?: Record<string, string> }),
    })
    const data = (await res.json()) as { content?: string; error?: string; model?: string }
    notice.value = res.ok
      ? `✅「${name}」连通（实际模型 ${data.model ?? '?'}，回复：${(data.content ?? '').slice(0, 20)}）`
      : `❌「${name}」失败：${data.error ?? res.status}`
  } catch (e) {
    notice.value = `❌「${name}」失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    testing.value = null
  }
}

function buildOverride(name: string, model: string): Record<string, string> {
  const d = drafts.value[name]
  const o: Record<string, string> = {}
  if (d.apiKey.trim()) o.apiKey = d.apiKey.trim()
  if (model.trim()) o.model = model.trim()
  if (d.baseUrl.trim()) o.baseUrl = d.baseUrl.trim()
  return o
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-baseline justify-between gap-4 pb-4">
      <p class="m-0 text-sm tracking-wide text-[#3a3a3a]/55">设置</p>
      <p class="m-0 text-xs tracking-wide text-[#3a3a3a]/45">模型服务 · 本机存储</p>
    </div>

    <main class="flex-1 space-y-4 overflow-y-auto pb-6">
      <section class="rounded-2xl bg-white/60 p-6">
        <header class="mb-4">
          <h2 class="m-0 text-base tracking-wide">模型服务</h2>
          <p class="mb-0 mt-1.5 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/50">
            在这里配置每个服务的模型名 / API Key / 接口地址，不用再打开 .env 文件。
            配置只保存在<b>这台设备的浏览器</b>里；请求时由本机后端内存转发（不落盘、不回显）。
            留空的字段继续用 .env 默认 —— 两边可以混用。
          </p>
        </header>

        <div v-if="loaded" class="space-y-3">
          <div
            v-for="p in providers"
            :key="p.name"
            class="rounded-2xl border border-[#4a6fa5]/15 bg-white/45 p-4"
          >
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <span class="text-sm font-bold tracking-wide text-[#3a3a3a]">{{ p.name }}</span>
              <span
                v-if="p.isDefault"
                class="rounded-full bg-[#4a6fa5]/10 px-2 py-0.5 text-xs text-[#4a6fa5]"
              >
                默认
              </span>
              <span
                v-if="hasOverride(p.name)"
                class="rounded-full bg-[#85cdca]/14 px-2 py-0.5 text-xs text-[#3a3a3a]/60"
              >
                已自定义
              </span>
              <span class="text-xs text-[#3a3a3a]/40">.env 默认模型：{{ p.model }}</span>
            </div>

            <div class="grid gap-2 md:grid-cols-3">
              <input
                v-model="drafts[p.name]!.model"
                :placeholder="`模型名（默认 ${p.model}）`"
                class="rounded-xl bg-white/70 px-3 py-2 text-xs tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
              />
              <input
                v-model="drafts[p.name]!.apiKey"
                type="password"
                :placeholder="hasOverride(p.name) ? 'API Key（已配置，不回显）' : 'API Key（本地服务留空）'"
                autocomplete="off"
                class="rounded-xl bg-white/70 px-3 py-2 text-xs tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
              />
              <input
                v-model="drafts[p.name]!.baseUrl"
                placeholder="接口地址（默认 .env 值）"
                class="rounded-xl bg-white/70 px-3 py-2 text-xs tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
              />
            </div>

            <div class="mt-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-full bg-[#4a6fa5] px-4 py-1.5 text-xs tracking-wide text-white transition-all duration-500 ease-in-out hover:opacity-90 active:scale-[0.98]"
                @click="save(p.name)"
              >
                保存
              </button>
              <button
                type="button"
                :disabled="testing === p.name"
                class="rounded-full bg-white/70 px-4 py-1.5 text-xs tracking-wide text-[#3a3a3a]/65 transition-all duration-500 ease-in-out hover:bg-white active:scale-[0.98] disabled:opacity-40"
                @click="testProvider(p.name, drafts[p.name]!.model)"
              >
                {{ testing === p.name ? '测试中…' : '测试连通' }}
              </button>
              <button
                type="button"
                class="rounded-full bg-white/60 px-4 py-1.5 text-xs tracking-wide text-[#3a3a3a]/45 transition-all duration-500 ease-in-out hover:bg-[#c38d94]/10 hover:text-[#c38d94] active:scale-[0.98]"
                @click="reset(p.name)"
              >
                恢复默认
              </button>
            </div>
          </div>
        </div>
        <p v-else class="m-0 text-xs tracking-wide text-[#3a3a3a]/40">
          读取后端清单失败 —— 先启动后端（npm run server）再进这页。
        </p>

        <p
          v-if="notice"
          class="mb-0 mt-3 rounded-xl bg-[#85cdca]/12 px-4 py-2 text-xs leading-relaxed tracking-wide text-[#85cdca]"
        >
          {{ notice }}
        </p>
      </section>
    </main>
  </div>
</template>
