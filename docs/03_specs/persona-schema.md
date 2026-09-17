---
title: persona-schema · 人格档案数据结构
type: spec
status: draft
updated: 2026-09-17
owner: HJ
related: [SPEC, D002-核心抽象-人格档案, D007-Phase1转向执行侧]
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

**⚠️ 本节正在修订（D007 之后）。** 当前是二分结构，规划升级为 Distilly 式的多层。

### 现状（v1 设计）

```
冻结层 Frozen  —— 核心性格 / 价值观 / 说话基调，AI 不可修改
演化层 Evolving —— 对用户的认知 / 关系状态 / 共同记忆，自动累积但可见可回滚
```

边界规则：**冻结层管「怎么说」，演化层管「知道什么」**。

### 规划中（参照 Distilly Layer 0-7）

| 层 | 内容 | 特性 |
|---|---|---|
| **Layer 0** | 核心性格 | **硬覆盖**，优先级最高 |
| Layer 1 | 身份 | 是谁、什么关系 |
| Layer 2 | 表达 DNA | 句法、节奏、口头禅 |
| Layer 3 | 决策判断 | 遇到 X 会怎么选 |
| Layer 4 | 人际行为 | 对不同的人不同态度 |
| Layer 5 | 边界雷区 | 碰了会翻脸的话题 |
| Layer 6 | **内部张力** | 矛盾 —— 嘴上说 A 实际做 B |
| Layer 7 | 思维方式 | |
| 演化层 | Correction Log + 快照 | 滚动追加，可回滚 |

> **待决**：是否升级为多层。理由见 `05_research/竞品-Distilly.md` §3.2。
> **约束**：升级需新建 ADR，不能直接改本文件。

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

*状态：draft。升级为多层结构需先出 ADR。最后更新：2026-09-17*
