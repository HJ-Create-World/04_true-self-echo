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
  deleteConnection,
  hasOverride,
  listCustomConnections,
  loadApiConfig,
  saveApiConfig,
  saveCustomConnection,
  type ApiConfigMap,
  type CustomConnection,
} from '@/api/apiConfig'
import { useChatStore } from '@/stores/chat'

const chat = useChatStore()

const providers = ref<ProviderInfo[]>([])
const loaded = ref(false)

/** 每行可编辑的草稿（空字符串 = 不覆盖） */
const drafts = ref<Record<string, { model: string; apiKey: string; baseUrl: string }>>({})
const notice = ref<string | null>(null)

/* ---------- 自定义连接（增删改） ---------- */
const customs = ref<CustomConnection[]>([])
/** null = 收起；'' = 新增；非空 = 编辑该名称（名称即主键） */
const editingName = ref<string | null>(null)
const customDraft = ref<CustomConnection>({ name: '', baseUrl: '', model: '', apiKey: '' })

function refreshCustoms() {
  customs.value = listCustomConnections()
}

function startAddCustom() {
  editingName.value = ''
  customDraft.value = { name: '', baseUrl: '', model: '', apiKey: '' }
}

function startEditCustom(c: CustomConnection) {
  editingName.value = c.name
  customDraft.value = { ...c }
}

function cancelCustom() {
  editingName.value = null
}

function saveNewCustom() {
  const d = customDraft.value
  if (!d.name.trim() || !d.baseUrl.trim() || !d.model.trim()) {
    notice.value = '名称、接口地址、模型名都要填'
    return
  }
  const isNew = editingName.value === ''
  if (isNew && (providers.value.some((p) => p.name === d.name.trim()) || customs.value.some((c) => c.name === d.name.trim()))) {
    notice.value = `「${d.name.trim()}」已经存在`
    return
  }
  saveCustomConnection({
    name: d.name.trim(),
    baseUrl: d.baseUrl.trim(),
    model: d.model.trim(),
    apiKey: d.apiKey?.trim() || undefined,
  })
  refreshCustoms()
  chat.reloadProviders()
  notice.value = `已保存自定义连接「${d.name.trim()}」—— 对话页下拉里现在可以选它`
  editingName.value = null
}

function removeCustom(name: string) {
  if (!confirm(`删除自定义连接「${name}」？正在使用它的人格会回落到默认模型。`)) return
  deleteConnection(name)
  refreshCustoms()
  chat.reloadProviders()
  notice.value = `已删除「${name}」`
}

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
  refreshCustoms()
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

/* ---------- 获取模型列表（/api/models · 2026-09-23） ---------- */
/**
 * 用户的真实困境（HJ 实测反馈）：DeepSeek 官方文档只给 https://api.deepseek.com，
 * 不知道该不该加 /v1、模型名有哪些（要等 400 报错才透露）。
 * 「获取模型列表」一次解决两件事：后端探测 /v1 形态 + 拉模型 id 列表，
 * 拉到后模型名输入框自动变成下拉选择。
 */
const modelOptions = ref<Record<string, string[]>>({})
const fetchingModels = ref<string | null>(null)

async function fetchModelList(kind: 'env' | 'custom', name: string) {
  fetchingModels.value = kind + name
  try {
    const payload =
      kind === 'env'
        ? { provider: name, apiKey: drafts.value[name]!.apiKey.trim() || undefined, baseUrl: drafts.value[name]!.baseUrl.trim() || undefined }
        : { baseUrl: customDraft.value.baseUrl, apiKey: customDraft.value.apiKey || undefined }
    const res = await fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = (await res.json()) as { baseUrl?: string; models?: string[]; error?: string }
    if (!res.ok || !data.models?.length) {
      notice.value = `❌ 拉取失败：${data.error ?? res.status}`
      return
    }
    modelOptions.value = { ...modelOptions.value, [name]: data.models }
    // 🔴 把探测出的规范化 baseUrl 回填（用户不用纠结 /v1）
    if (kind === 'env' && data.baseUrl) drafts.value[name]!.baseUrl = data.baseUrl
    if (kind === 'custom' && data.baseUrl) customDraft.value.baseUrl = data.baseUrl
    notice.value = `✅ 发现 ${data.models.length} 个模型，已可下拉选择`
  } catch (e) {
    notice.value = `❌ 拉取失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    fetchingModels.value = null
  }
}

/** 自定义连接的连通测试（直接用表单里的值，不依赖已保存状态） */
async function testCustom() {
  const d = customDraft.value
  if (!d.baseUrl.trim() || !d.model.trim()) {
    notice.value = '测试前先填接口地址和模型名'
    return
  }
  testing.value = d.name || 'custom'
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: d.name || 'custom-test',
        system: '你是连通性测试器，只回复「pong」。',
        history: [],
        userInput: 'ping',
        maxTokens: 16,
        override: {
          baseUrl: d.baseUrl.trim(),
          model: d.model.trim(),
          ...(d.apiKey?.trim() ? { apiKey: d.apiKey.trim() } : {}),
        },
      } satisfies ChatRequest & { override?: Record<string, string> }),
    })
    const data = (await res.json()) as { content?: string; error?: string; model?: string }
    notice.value = res.ok
      ? `✅ 连通（实际模型 ${data.model ?? '?'}，回复：${(data.content ?? '').slice(0, 20)}）`
      : `❌ 失败：${data.error ?? res.status}`
  } catch (e) {
    notice.value = `❌ 失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    testing.value = null
  }
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
              <div class="flex items-center gap-1.5">
                <input
                  v-if="!modelOptions[p.name]?.length"
                  v-model="drafts[p.name]!.model"
                  :placeholder="`模型名（默认 ${p.model}）`"
                  class="min-w-0 flex-1 rounded-xl bg-white/70 px-3 py-2 text-xs tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
                />
                <select
                  v-else
                  v-model="drafts[p.name]!.model"
                  class="min-w-0 flex-1 rounded-xl bg-white/70 px-2 py-2 text-xs tracking-wide text-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
                >
                  <option v-for="m in modelOptions[p.name]" :key="m" :value="m">{{ m }}</option>
                </select>
                <button
                  type="button"
                  :disabled="fetchingModels === 'env' + p.name"
                  class="shrink-0 rounded-xl bg-white/70 px-2.5 py-2 text-xs tracking-wide text-[#4a6fa5] transition-all duration-500 ease-in-out hover:bg-white active:scale-[0.98] disabled:opacity-40"
                  title="从接口拉取该服务支持的模型列表"
                  @click="fetchModelList('env', p.name)"
                >
                  {{ fetchingModels === 'env' + p.name ? '…' : '获取模型' }}
                </button>
              </div>
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

        <!-- 自定义连接：.env 之外，用户自己接的任何 OpenAI 兼容服务 -->
        <div class="mt-6 border-t border-[#4a6fa5]/12 pt-5">
          <header class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="m-0 text-sm tracking-wide text-[#3a3a3a]">自定义连接</h3>
              <p class="mb-0 mt-1 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/50">
                接任何 OpenAI 兼容服务（阿里云百炼 / OpenAI / 硅基流动 / 本地推理……）。
                配好后会出现在对话页的模型下拉里。
              </p>
            </div>
            <button
              v-if="editingName === null"
              type="button"
              class="rounded-full bg-[#e8a87c]/14 px-4 py-1.5 text-xs tracking-wide text-[#3a3a3a]/75 transition-all duration-500 ease-in-out hover:bg-[#e8a87c]/25 active:scale-[0.98]"
              @click="startAddCustom"
            >
              + 新增连接
            </button>
          </header>

          <!-- 已有连接列表 -->
          <ul v-if="customs.length" class="m-0 list-none space-y-1.5 p-0">
            <li
              v-for="c in customs"
              :key="c.name"
              class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[#4a6fa5]/12 bg-white/45 px-4 py-2"
            >
              <div class="min-w-0 flex-1">
                <p class="m-0 truncate text-xs tracking-wide text-[#3a3a3a]">
                  {{ c.name }} <span class="text-[#3a3a3a]/45">· {{ c.model }}</span>
                  <span v-if="!c.apiKey" class="text-[#85cdca]">· 本地</span>
                </p>
                <p class="mb-0 mt-0.5 truncate text-xs text-[#3a3a3a]/40">{{ c.baseUrl }}</p>
              </div>
              <button
                type="button"
                class="rounded-full bg-white/70 px-3 py-1 text-xs tracking-wide text-[#3a3a3a]/60 hover:bg-white"
                @click="startEditCustom(c)"
              >
                编辑
              </button>
              <button
                type="button"
                class="rounded-full bg-white/60 px-3 py-1 text-xs tracking-wide text-[#3a3a3a]/45 transition-all duration-500 ease-in-out hover:bg-[#c38d94]/12 hover:text-[#c38d94] active:scale-[0.98]"
                @click="removeCustom(c.name)"
              >
                删除
              </button>
            </li>
          </ul>
          <p v-else-if="editingName === null" class="m-0 text-xs tracking-wide text-[#3a3a3a]/40">
            还没有自定义连接 —— 上面三个是 .env 里配置的。
          </p>

          <!-- 新增 / 编辑表单 -->
          <div v-if="editingName !== null" class="mt-3 rounded-2xl bg-white/60 p-4">
            <div class="grid gap-2 md:grid-cols-2">
              <input
                v-model="customDraft.name"
                :placeholder="editingName === '' ? '名称（如：阿里云百炼）' : customDraft.name"
                :disabled="editingName !== ''"
                class="rounded-xl bg-white/75 px-3 py-2 text-xs tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 disabled:opacity-50"
              />
              <div class="flex items-center gap-1.5">
                <input
                  v-if="!modelOptions['custom']?.length"
                  v-model="customDraft.model"
                  placeholder="模型名（如：deepseek-flash / gpt-4o-mini）"
                  class="min-w-0 flex-1 rounded-xl bg-white/75 px-3 py-2 text-xs tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
                />
                <select
                  v-else
                  v-model="customDraft.model"
                  class="min-w-0 flex-1 rounded-xl bg-white/75 px-2 py-2 text-xs tracking-wide text-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
                >
                  <option v-for="m in modelOptions['custom']" :key="m" :value="m">{{ m }}</option>
                </select>
                <button
                  type="button"
                  :disabled="fetchingModels === 'customcustom'"
                  class="shrink-0 rounded-xl bg-white/80 px-2.5 py-2 text-xs tracking-wide text-[#4a6fa5] transition-all duration-500 ease-in-out hover:bg-white active:scale-[0.98] disabled:opacity-40"
                  title="从接口拉取该服务支持的模型列表"
                  @click="fetchModelList('custom', 'custom')"
                >
                  {{ fetchingModels === 'customcustom' ? '…' : '获取模型' }}
                </button>
              </div>
              <input
                v-model="customDraft.baseUrl"
                placeholder="接口地址（粘贴服务商给的即可，会自动识别 /v1）"
                class="rounded-xl bg-white/75 px-3 py-2 text-xs tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 md:col-span-2"
              />
              <input
                v-model="customDraft.apiKey"
                type="password"
                placeholder="API Key（本地推理服务可留空）"
                autocomplete="off"
                class="rounded-xl bg-white/75 px-3 py-2 text-xs tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 md:col-span-2"
              />
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-full bg-[#4a6fa5] px-4 py-1.5 text-xs tracking-wide text-white transition-all duration-500 ease-in-out hover:opacity-90 active:scale-[0.98]"
                @click="saveNewCustom"
              >
                {{ editingName === '' ? '添加' : '保存修改' }}
              </button>
              <button
                type="button"
                class="rounded-full bg-white/70 px-4 py-1.5 text-xs tracking-wide text-[#3a3a3a]/65 transition-all duration-500 ease-in-out hover:bg-white active:scale-[0.98]"
                @click="testCustom"
              >
                测试连通
              </button>
              <button
                type="button"
                class="rounded-full bg-white/60 px-4 py-1.5 text-xs tracking-wide text-[#3a3a3a]/55 hover:bg-white/85"
                @click="cancelCustom"
              >
                取消
              </button>
            </div>
          </div>
        </div>

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
