<script setup lang="ts">
/**
 * 称呼与关系 · 事后微调卡（2026-10-08）
 *
 * 背景（希儿案例，D013）：投料提取的 identity 带剧情语义
 * （「她怎么称呼对方：姐姐」），老档案没有编辑入口，只能重新投料。
 * 本卡补上这个 gap —— 只暴露最容易踩坑的三个字段，不搬整个编辑器。
 *
 * 🔴 改 frozen 层是**用户的人为编辑**，不是 AI 改写 —— SPEC §四 允许；
 * frozenHash 变化会被曲线标注为「人改了档案」（机制本来就在）。
 */
import { computed, ref, watch } from 'vue'

import { putPersona } from '@/storage/personaRepo'
import type { PersonaProfile } from '@/persona/schema'

const props = defineProps<{ persona: PersonaProfile }>()
const emit = defineEmits<{ saved: [persona: PersonaProfile] }>()

const selfCall = ref('')
const callUser = ref('')
const relation = ref('')
const saving = ref(false)
const notice = ref('')

watch(
  () => props.persona.id,
  () => {
    const id = props.persona.frozen.identity
    selfCall.value = id.selfCall
    callUser.value = id.callUser
    relation.value = id.relation
    notice.value = ''
  },
  { immediate: true },
)

const dirty = computed(
  () =>
    selfCall.value !== props.persona.frozen.identity.selfCall ||
    callUser.value !== props.persona.frozen.identity.callUser ||
    relation.value !== props.persona.frozen.identity.relation,
)

async function save() {
  if (saving.value) return
  saving.value = true
  notice.value = ''
  try {
    const next: PersonaProfile = {
      ...props.persona,
      frozen: {
        ...props.persona.frozen,
        identity: {
          selfCall: selfCall.value.trim(),
          callUser: callUser.value.trim(),
          relation: relation.value.trim(),
        },
      },
      updatedAt: new Date().toISOString(),
    }
    await putPersona(next)
    notice.value = '已保存 —— 她接下来会按新的称呼方式说话'
    emit('saved', next)
  } catch (e) {
    notice.value = `保存失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="rounded-2xl bg-white/60 p-5">
    <header class="mb-3">
      <h2 class="m-0 text-base tracking-wide">称呼与关系（她说的话里怎么称呼人）</h2>
      <p class="m-0 mt-1.5 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/50">
        这里是<b>她对「亲近之人」的说话习惯</b>，来自投料素材 —— 不是对眼前聊天对象的设定。
        如果投料把剧情关系带了进来（比如「称呼对方：姐姐」），在这里改成风格描述即可，
        例如「对亲近的人会撒娇」。聊不聊得熟、怎么称呼 TA，由对话本身决定（见记忆区）。
      </p>
    </header>

    <div class="space-y-2">
      <input
        v-model="selfCall"
        placeholder="她如何称呼自己（如：本小姐 / 我）"
        class="w-full rounded-xl bg-white/75 px-3 py-2 text-sm tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
      />
      <input
        v-model="callUser"
        placeholder="她对亲近之人的称呼习惯（如：喜欢叫对方全名 / 爱用昵称；不是对聊天对象的设定）"
        class="w-full rounded-xl bg-white/75 px-3 py-2 text-sm tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
      />
      <input
        v-model="relation"
        placeholder="她与亲近之人的关系风格（如：对认可的人会格外依赖；不是对聊天对象的设定）"
        class="w-full rounded-xl bg-white/75 px-3 py-2 text-sm tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
      />
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        :disabled="!dirty || saving"
        class="rounded-full bg-[#4a6fa5] px-5 py-1.5 text-sm text-white shadow-[0_4px_20px_rgba(74,111,165,0.12)] transition-all duration-500 ease-in-out hover:bg-[#4a6fa5]/90 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        @click="save"
      >
        {{ saving ? '保存中…' : '保存' }}
      </button>
      <p v-if="notice" class="m-0 text-xs tracking-wide text-[#3a3a3a]/55">{{ notice }}</p>
    </div>
  </section>
</template>
