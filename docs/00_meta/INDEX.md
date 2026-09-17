---
title: INDEX · 文档登记表
type: index
status: active
updated: 2026-09-16
owner: HJ
---

# INDEX · 文档登记表

> **什么时候读这份文档**：你不知道某条信息在哪份文档里时；或新增/归档文档时（必须回来登记）。
>
> **它不是**：文档内容本身 —— 它只登记"有哪些文档、各自管什么"。也不登记 `notes/`（那里不算文档）。
>
> **它能回答**：某条信息归哪份文档？某份文档现在还有效吗？我要写的新文档是不是已经存在了？

> **找不到某份信息时，先查这里。不要靠猜文件名。**
>
> 新增文档必须在此登记，否则视为不存在。删除/归档文档必须在 `status` 列标注。

---

## 一、按目录浏览

### 📁 `00_meta/` — 元信息
| 文件 | status | 用途（什么时候读） |
|---|---|---|
| `AGENTS.md` | active | **AI 入口**。任何 AI 接手时第一个读 |
| `INDEX.md` | active | 本文档。找东西 |
| `STATUS.md` | active | **项目进度唯一信息源**。想知道"到哪一步了"读它 |
| `GLOSSARY.md` | active | 术语表。看到不认识的项目黑话读它 |
| `DOC_STANDARD.md` | active | 文档编写规范。**要写新文档时必读** |

### 📁 `01_product/` — 产品定义（回答"做什么"）
| 文件 | status | 用途 |
|---|---|---|
| `PRODUCT.md` | active | 产品全貌速览（原 PROJECT.md）。**接手项目先读它** |
| `SPEC.md` | active | **需求唯一信息源**。产品定位、范围、功能清单 |
| `PLAN.md` | active | 交付计划与里程碑、防烂尾检查点 |

### 📁 `02_decisions/` — 决策记录（回答"为什么这么做"）
| 文件 | status | 决策 |
|---|---|---|
| `D001-产品定位.md` | active | 定位为「透明的陪伴者」 |
| `D002-核心抽象-人格档案.md` | active | 三场景统一为唯一抽象「人格档案」 |
| `D003-架构选型.md` | active | 前端 + 本地薄后端（方案 B） |
| `D004-记忆方案.md` | active | 结构化记忆 + 关键词触发，不用向量 |
| `D005-不做模型微调.md` | active | 彻底不做 LoRA / 训练 |
| `D006-文档管理体系.md` | active | 分层目录 + 单一信息源 + 状态机 |
| `D007-Phase1转向执行侧.md` | active | 从"加码素材"转向"干预生成" |
| `D008-UI方案与视觉规范.md` | active | Tailwind CSS v4 + 水彩画风（**部分推翻** `05_research/前端风格与UI库选型.md`） |

### 📁 `03_specs/` — 技术规范（回答"怎么做"）
| 文件 | status | 用途 |
|---|---|---|
| `persona-schema.md` | draft | 人格档案数据结构定义（分层结构已决策：暂不升级） |
| `评分标准.md` | active | **三套实验评分标准的唯一实体出处**。看历史分数前必读（§四是第三套的事后重构，HJ 已于 2026-09-17 复核认可其推断锚点；§九为 Phase 1 冻结版） |
| `execution-control.md` | draft | **执行侧干预实现**（路线 1：三明治 + 重注入 + 成对示例 + temperature），含四轮对话验收法与对照设计 |

> 规划中（尚未创建，不要引用）：`memory-schema.md`（记忆卡片结构）、`prompt-assembly.md`（System Prompt 拼装规则 —— **注意与 `execution-control.md` §二 可能重叠，创建前先确认归属**）。

### 📁 `04_lab/` — 实验与实测
| 文件 | status | 用途 |
|---|---|---|
| `README.md` | active | **实验索引**。看进行过哪些验证 |
| `phase0/三方对照结论.md` | active | ⭐ **第二轮总纲**（elysia 素材三方对照）—— 当前有效结论看这份 |

### 📁 `_archive/` — 归档区
| 文件 | status | 说明 |
|---|---|---|
| `phase0/README.md` | active | ⭐ **Phase 0 归档目录的登记页**。16 份文件的清单、性质分类、引用规则都在那里，本表**不再逐个登记**（单一信息源） |
| `PHASE0_人格提取验证.md` | archived | 内容已拆分到 `04_lab/` + `STATUS.md` |
| `模型实测说明.md` | archived | **Phase 0 的执行前计划书**（含第一套红线、第二套标准摘要、双维合并判定表）；测试已跑完。取代者：`03_specs/评分标准.md` §2.1 + §3.1 + §2.3 |

> ⚠️ **`_archive/` 里的文件不都是失效的** —— 其中「归档资产」（评测素材、Prompt 原文、方法论）`status` 仍是 `active`，
> 是**唯一出处，必须引用**。详见 [`_archive/phase0/README.md`](../_archive/phase0/README.md)
> 与 [`DOC_STANDARD.md` §7.5](./DOC_STANDARD.md)。
>
> ⚠️ **`_archive/` 下没有「日常依据」** —— 过程记录（`archived` / `superseded`）只作历史数据追溯。

### 📁 `05_research/` — 外部调研
| 文件 | status | 用途 |
|---|---|---|
| `竞品-Distilly.md` | active | 24804★ 高星蒸馏项目分析 |
| `竞品-elysia.skill.md` | active | 43★ 角色扮演项目实测 |
| `AI陪伴市场调研.md` | active | 市场产品、付费、合规 |
| `开源生态盘点.md` | active | 5 类开源项目横向对比 |
| `执行侧干预_调研报告.md` | active | **Phase 1 技术路线的业界依据**。sycophancy / lost-in-the-middle / 三条干预路线对比（回答「为什么 System Prompt 规则不生效」） |
| `前端风格与UI库选型.md` | active | 找风格的网站清单 + Vue3 组件库对比。⚠️ §〇 第 5 条与 §四的「不推荐 Tailwind」**已于 2026-09-16 被推翻**（原因见该文修订块） |

### 📁 `06_ops/` — 操作手册
| 文件 | status | 用途 |
|---|---|---|
| `DEV_STANDARD.md` | active | 开发规范（含防烂尾约束） |
| `DESIGN_STANDARD.md` | active | **视觉规范（水彩画风）**：Token 字典、禁止项正则、动效四规则、自检清单（回答「背景用什么色」「哪些 class 不能用」） |
| `RUNBOOK.md` | active | 常见操作：git、构建、部署 |
| `TOOLING.md` | active | Skill / MCP 清单 |

---

## 二、按问题检索（用途视角）

| 我想知道… | 去读 |
|---|---|
| 这个项目是干什么的 | `01_product/PRODUCT.md` |
| 现在做到哪一步了 | `00_meta/STATUS.md` |
| 为什么不用向量库 | `02_decisions/D004-记忆方案.md` |
| 为什么不做微调 | `02_decisions/D005-不做模型微调.md` |
| 人格档案有哪些字段 | `03_specs/persona-schema.md` |
| 历史分数（14/30 等）是怎么评的 | `03_specs/评分标准.md` |
| 投料要多少字、什么场景 | `01_product/SPEC.md` 六（归档数据出处：`_archive/phase0/测试结果-投料量对照.md`） |
| 提取 Prompt 该怎么写 | `03_specs/评分标准.md` §六（Prompt 七条修正）；**Prompt 原文**在 [`_archive/phase0/Prompt-提取.md`](../_archive/phase0/Prompt-提取.md)（`active`，唯一出处） |
| 扮演评测用什么素材 | [`_archive/phase0/A-角色台词.md`](../_archive/phase0/A-角色台词.md)（推荐用同目录 `A2-纯台词版.md`）—— 两文件均 `active`，是唯一出处 |
| 扮演闭环怎么跑、四轮问什么 | `03_specs/评分标准.md` §二（转录版）；原文在 [`_archive/phase0/B-闭环验证.md`](../_archive/phase0/B-闭环验证.md)（`active`） |
| 扮演要跑哪几轮、怎么打分 | `03_specs/评分标准.md` §二（含四轮测试话术与扮演指令原文） |
| 验证过什么、结论是什么 | `04_lab/README.md` |
| GitHub 上有什么同类项目 | `05_research/开源生态盘点.md` |
| 怎么提交代码 | `06_ops/DEV_STANDARD.md` |
| git 推送报错了 | `06_ops/RUNBOOK.md` |
| 某个黑话是什么意思 | `00_meta/GLOSSARY.md` |
| 写新文档要怎么起头 | `00_meta/DOC_STANDARD.md` |
| **去哪找前端 UI 风格参考** | `05_research/前端风格与UI库选型.md` §一 |
| **UI 库 / 样式方案选哪个** | ✅ **已决策**：`02_decisions/D008-UI方案与视觉规范.md`（Tailwind CSS v4 + 水彩画风） |
| **某个颜色/圆角/阴影该用什么值** | `06_ops/DESIGN_STANDARD.md` §一（**取值唯一信息源**） |
| **哪些 Tailwind class 不能用** | `06_ops/DESIGN_STANDARD.md` §三（可执行正则） |
| **为什么 System Prompt 里的规则不生效** | `05_research/执行侧干预_调研报告.md` §问题 2 |
| **Phase 1 干预方案有哪几条路** | `05_research/执行侧干预_调研报告.md` §问题 3 |
| **执行侧干预具体怎么实现** | `03_specs/execution-control.md`（路线 1 四步方案，含验收方法） |
| **分享 / 导出功能做到什么程度** | `01_product/SPEC.md` §十 第 8·12 条（单体分享要做，社区不做；真实人物不提供） |
| **上线公开链接前要做什么** | `01_product/SPEC.md` §12.4（6 项清单，**未完成不得上线**） |
| **哪些人格场景是红线** | `01_product/SPEC.md` §十 第 11·12 条（不做逝者复刻；真实人物不可分享） |

---

## 三、信息归属速查（防重复）

**每个事实只有一个家。要写这些信息时，去改对应文件，不要在别处复制。**

| 事实 | 唯一归属 |
|---|---|
| 产品定位、功能范围 | `01_product/SPEC.md` |
| 项目进度、里程碑状态 | `00_meta/STATUS.md` |
| 决策结论与理由 | `02_decisions/Dxxx-*.md` |
| 数据结构与字段 | `03_specs/*.md` |
| **实验评分标准（三套）** | `03_specs/评分标准.md` |
| 实验数据与结论 | `04_lab/` 对应文件 |
| 外部项目信息 | `05_research/` |
| 开发流程与规范 | `06_ops/DEV_STANDARD.md` |
| **视觉取值（色值/圆角/阴影/动效参数）** | `06_ops/DESIGN_STANDARD.md` §一 |
| 术语定义 | `00_meta/GLOSSARY.md` |

---

*新增/归档文档时请同步更新本表。最后更新：2026-09-17*
