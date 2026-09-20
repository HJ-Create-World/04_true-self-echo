---
title: persona-schema · 人格档案数据结构
type: spec
status: active
updated: 2026-09-20
owner: HJ
related: [SPEC, D002-核心抽象-人格档案, D007-Phase1转向执行侧, execution-control, 评分标准]
---

# persona-schema · 人格档案数据结构

> **什么时候读这份文档**：写人格档案相关的代码前必读。
>
> **它不是**：产品需求（那是 `01_product/SPEC.md`）。
>
> **它能回答**：档案有哪些层？字段是什么？约束是什么？prompt 怎么拼？

---

## 一、职责范围

**管**：人格档案的数据结构、字段约束、System Prompt 拼装规则。

**不管**：投料解析（素材 → 档案的提取过程）、对话循环、记忆检索。

---

## 二、分层结构

### 2.1 已决策：暂不升级为多层，仅吸收两点（2026-09-16）

**HJ 决策：保持当前结构，不引入 Distilly 式的 Layer 0-7 分层。**

**吸收的两点**（下表标注 ⭐）：

| 来源 | 吸收什么 | 落点 |
|---|---|---|
| Distilly Layer 0 | **「硬覆盖」语义** —— 最高优先级、不可被对话内容改写 | `FrozenLayer.coreTraits` 已隐含此语义，**本次补明确标注** |
| Distilly Correction Log | **Correction Log 格式**（只增不删的更正记录） | `PersonaProfile.correctionLog` 已在 §四 草案中，**本次确认保留** |

**不吸收的部分**：Layer 1-7 的完整分层。

**为什么暂不升级**：

| 理由 | 说明 |
|---|---|
| **现在是设计阶段，没有真实数据** | 分 8 层需要真实档案来验证"这层到底存不存在"。凭空分，分出来的是想象 |
| **`_archive/` 里的实测说明：现有二分已够用** | Phase 0 两轮实验都跑在二分结构上，六维最高 23/30 —— 说明**瓶颈不在这里**（D007 已证） |
| **维护成本线性上升** | 8 层 × 每层都要提取规则、示例、校验 → 单文件极易超过 200 行（`DEV_STANDARD.md` 原则 3） |
| **触发不了"只学一样新东西"的保护** | 分层的复杂度会挤占"人格建模"的学习额度 |

**什么情况下重审**：

| 触发条件 | 说明 |
|---|---|
| Phase 2 投料模块完成后，发现某类素材**稳定地塞不进 4 个字段** | 说明确实缺层，且此时有真实数据 |
| 多人格（Phase 4）需要**层间继承** | 分层可能是复用的前提 |
| 实测显示"内部张力"和"约束型"经常混淆 | 说明表现型/约束型二分不够，需要更细的表达层 |

> ⚠️ **重审时必须新建 ADR**，不能直接改本文件（同 `DOC_STANDARD.md` §六 模板 1 的 ADR「只增不改」原则）。

### 2.2 现状（v1 设计，仍然有效）

```
冻结层 Frozen  —— 核心性格 / 价值观 / 说话基调，AI 不可修改
演化层 Evolving —— 对用户的认知 / 关系状态 / 共同记忆，自动累积但可见可回滚
```

边界规则：**冻结层管「怎么说」，演化层管「知道什么」**。

> 📌 **`coreTraits` 的「硬覆盖」语义**（本次吸收）：冻结层内的特征
> **优先级高于演化层与任何对话中出现的用户要求**。
> 实现上意味着拼 prompt 时它不能被后文覆盖 —— 与 `execution-control.md` §八
> 的「约束优先级」表一致（红线 > 语言风格 > 内容倾向）。

### 2.3 参考：Distilly 的分层（未采纳，仅存档备查）

| 层 | 内容 | 本项目对应 |
|---|---|---|
| **Layer 0** | 核心性格 | ✅ `coreTraits`（吸收「硬覆盖」语义） |
| Layer 1 | 身份 | ✅ `identity` |
| Layer 2 | 表达 DNA | ✅ `expressionDNA` |
| Layer 3 | 决策判断 | ✅ `decisionRules` |
| Layer 4 | 人际行为 | ✅ `socialBehavior` |
| Layer 5 | 边界雷区 | ✅ `boundaries` |
| Layer 6 | **内部张力** | ✅ `tensions` |
| Layer 7 | 思维方式 | ⚠️ **未独立成层** —— 暂并入 `coreTraits` |
| 演化层 | Correction Log + 快照 | ✅ `correctionLog`（吸收格式） |

> 📌 **注意上表**：本项目的 `FrozenLayer` 字段名**其实已经覆盖了 Layer 0-6**
> —— 也就是说「不升级」不是"信息少了"，而是**不额外引入 8 层的提取流程与校验规则**。
> 数据结构上的差距只有 Layer 7 一项。这也是"不值得升级"判断的一部分。
>
> 完整对比见 `05_research/竞品-Distilly.md` §3.2。

---

## 三、⭐ 特征的两个子类（Phase 0 实测新增）

**这是本项目最关键的设计约束。**

| 子类 | 定义 | prompt 写法 | 例子 |
|---|---|---|---|
| **表现型** | 要**演出来**的特征 | 正向描述 | 句子短；用破折号；情绪冷时反而句子更短 |
| **约束型** | 要**禁止说出来**的特征 | **反向禁令** | 禁止直接陈述自己的情感状态；禁止解释自己为什么冷 |

### 为什么必须分开

**AI 味的根因：模型天然倾向于把内心戏讲出来。**

Phase 0 实测中，扮演代理自诊断：

> 我把"核心矛盾"写成了一个**需要被表达的特征**（"必须体现"），
> 而它应该是一个**约束条件**——"禁止直接说出情感状态，只能通过物件/动作/玩笑漏出"。
> **写成"要体现"，就会演成自我剖析。**

**影响**：表现型直接导致"内在矛盾 3/5、出戏 2/5"这两项卡在低分。

### 实现要求

1. 约束型特征**单独成组**存储
2. 拼装 System Prompt 时放入**"绝对禁止"区块**
3. ⚠️ **但注意**：第二轮实验证明，"写进 Prompt"不等于"生成时生效"（见 `04_lab/phase0/三方对照结论.md` 结论 3）

---

## 四、数据结构（草案）

```typescript
interface PersonaProfile {
  id: string;
  name: string;
  version: string;              // 语义化版本（待实现）
  createdAt: string;
  updatedAt: string;

  frozen: FrozenLayer;
  evolving: EvolvingLayer;
  correctionLog: CorrectionEntry[];   // 参照 Distilly，只增不删
}

interface FrozenLayer {
  coreTraits: Trait[];          // Layer 0
  identity: Identity;           // Layer 1
  expressionDNA: Expression;    // Layer 2 —— 表现型特征
  decisionRules: Rule[];        // Layer 3
  socialBehavior: SocialRule[]; // Layer 4
  boundaries: string[];         // Layer 5 —— 边界雷区
  tensions: Tension[];          // Layer 6 —— 内在矛盾
  constraints: Constraint[];    // ⭐ 约束型特征，单独一组
}

interface Trait {
  text: string;                 // 特征描述
  evidenceLevel: 'explicit' | 'implied' | 'extrapolated';  // 证据等级
  evidence: string;             // 原文证据
  executable: string;           // ⭐ 可执行化描述
}

interface Tension {
  surface: string;              // 表面表现
  inner: string;                // 内里实情
  unifier: string;              // ⭐ 统一点（必须有）
  evidenceLevel: string;
}

interface Constraint {
  forbidden: string;            // 禁止做什么
  alternative: string;          // 改为怎么做
}
```

### 字段约束

| 字段 | 约束 |
|---|---|
| `executable` | **必须是"可被第三人照着执行的动作描述"**。禁止"有韵律感""很温柔"这类无法验证的形容词 |
| `evidenceLevel` | 三档必填，与 Distilly 的 `verbatim`/`artifact`/`impression` 对应 |
| `unifier` | 每组矛盾**必须**有统一点，否则矛盾会变成随机行为抖动 |
| `correctionLog` | **永不删除条目** |
| `coreTraits` | ⭐ **「硬覆盖」语义**：优先级高于演化层与对话中的用户要求，拼 prompt 时不可被后文覆盖（见 §2.2） |

---

## 四之二、✅ Phase 2 实现口径（2026-09-20，frozen 层已落地）

> **代码位置**：类型在 [`src/persona/schema.ts`](../../src/persona/schema.ts)，
> 渲染在 [`src/persona/render.ts`](../../src/persona/render.ts)，
> 存储层在 [`src/storage/personaRepo.ts`](../../src/storage/personaRepo.ts)。
>
> ⚠️ **本节记录「草案字段」与「实际实现字段」的差异。** 这些差异不是随手改的，
> 每一条都有实现上的硬理由，逐条列在下面。**改本节需要同步改代码，反之亦然。**

### 实现里多出来的字段（5 处）

| # | 字段 | 为什么草案里放不下 |
|---|---|---|
| 1 | `Trait.title` / `Tension.title` | 实测提取输出是**「标题 + 内容」两段式**（如「矛盾 1：理想主义 vs 现实认知」）。草案只有内容容器，缺标题 → 渲染回 markdown 时会丢层级 |
| 2 | `Trait.detail` | 原文特质是**三段**：标题 / 展开说明 / 可执行。草案只有 `text` + `executable` 两个容器 |
| 3 | `FrozenLayer.mechanism` | 收束全篇的「核心机制」一句话（原文以结尾引用块形式出现），不属于任何现有字段 |
| 4 | `PersonaProfile.kind` | 决定能否分享/导出（`SPEC.md` §十 第 12 条）。Phase 2 只投虚拟角色，但字段现在留，**免得 Phase 2.5 改数据模型** |
| 5 | `PersonaProfile.source` | 对应 `SPEC.md` §六「素材来源标注」的三档可信度 + 层级描述 |

### 实现里改掉的形状（1 处）

| 草案 | 实现 | 理由 |
|---|---|---|
| `expressionDNA: Expression`（固定字段） | `expressionDNA: Block[]`（小标题 + 若干行） | 说话风格天然是松散的（句长表 / 标点 / 替换表 / 语气特征，形态各不相同）。强行结构化只会**逼模型注水** —— 诊断文档已实测过这个失效模式（`_archive/phase0/测试结果-诊断.md` §四 1b） |

### 实现里暂不做的（1 处）

| 草案字段 | 处置 | 理由 |
|---|---|---|
| `decisionRules: Rule[]` | **本期不实现** | 实测素材里它稳定地与 `socialBehavior` 重合。引入两个容器抢同一份内容，只会让提取器随机往一边塞。**§2.1 的「重审触发条件」已覆盖这种情况** —— 等 Phase 2 跑完真实素材再看要不要补 |

> 📌 **未实现的不止 `evolving` 层**：`FrozenLayer` 的 `identity` 字段实现了但
> Phase 2 的提取 Prompt 暂不产出（实测 A 类剧情素材里称呼信息常常缺失，
> 强制产出会编造）。字段留着，UI 上可手填。

### ⭐ 渲染保真度（Phase 2 验收标准④的地基）

`renderPersonaBody()` 的输出**逐字等于** `exp/persona/elysia.md` 的五节正文
（137 行 vs 137 行，0 处差异，2026-09-20 实测）。

**为什么这条很重要**：E5 的 23/30 是在那段 markdown 的**确切形状**上拿到的
（含 `---` 分隔符与替换表的代码块围栏）。结构化 → 重渲染只要多一个空行、
少一个标题层级，输入就变了，**分数不再可比**，验收标准④也就失去参照。

**刻意丢掉的只有两处**，都不是人格内容：

| 丢掉什么 | 为什么 |
|---|---|
| 文件头 `# 人格档案 · 爱莉希雅` + `> 用途/来源/为什么用这份` 引用块 | 那是**实验脚手架**，里面写着「扮演得分 23/30」—— 等于告诉模型它正在被打分。Phase 1 的 `elysia.ts` 已经丢掉了，保持一致 |
| 末尾那个 `---` | 它是「六、已知空缺」之前的分隔符，E5 的切片方式把它带了进去，属切分副产物 |

---

## 五、边界条件

| 情况 | 处理 |
|---|---|
| 某项证据不足 | 存 `evidenceLevel: 'extrapolated'` + `evidence: ''`，**不编造** |
| 素材是单层 | 只提取 Layer 2 + 部分 Layer 1；**明确告知用户上限** |
| 矛盾找不到统一点 | 标记为"待确认"，**不硬凑** |

---

## 六、不做的事情

- ❌ 不做向量检索（D004）
- ❌ 不做微调（D005）
- ❌ 不做跨用户的档案共享格式（Non-Goal）

---

*状态：**frozen 层已实现**（2026-09-20，见 §四之二）。*
*分层结构已决策：暂不升级，仅吸收「Layer 0 硬覆盖语义」与「Correction Log 格式」*（§2.1）。
*重审分层需新建 ADR；字段级调整只需同步 §四 与 §四之二。最后更新：2026-09-20*
