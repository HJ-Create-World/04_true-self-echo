---
title: 竞品 · Distilly（titanwings/distilly）
type: research
status: active
updated: 2026-09-17
owner: HJ
related: [开源生态盘点, 竞品-elysia.skill, D007-Phase1转向执行侧]
---

# 竞品 · Distilly（titanwings/distilly）

> **什么时候读这份文档**：设计投料流水线、人格档案结构、版本管理时。
>
> **它不是**：我们的方案（那是 `01_product/SPEC.md` / `03_specs/`）。
>
> **它能回答**：这个 24804★ 项目怎么做人格蒸馏？产物结构是什么？版本管理做到什么程度？哪些值得抄？

---

## 一、结论先行

**这是目前找到的、与我们路线完全一致的唯一高星项目。**

| # | 结论 |
|---|---|
| 1 | **走"不做微调、纯 Prompt/Skill"路线** —— 产物全是 Markdown + JSON，无一行训练代码。与我们 D005 一致 |
| 2 | **人格档案是 7 层结构**，比我们的"冻结层/演化层"二分细得多 |
| 3 | **它的"版本管理"是文件备份器，不是 Git** —— 有备份有回滚，**但完全没有 diff** |
| 4 | **它没做「人格演化可视化」** —— ROADMAP 里完全没有这个规划。**我们的差异化位置是空的** |
| 5 | 它有**三条产品线**（colleague / celebrity / relationship），复杂度差 5-10 倍 |

---

## 二、仓库元信息

| 项 | 值 |
|---|---|
| 全名 | `titanwings/distilly` |
| 星数 | **24,804** |
| Fork | 2,148 |
| 语言 | Python |
| 协议 | **MIT** |
| 创建 | 2026-03-30 |
| 最后推送 | 2026-09-16（**活跃**） |
| 默认分支 | `dot-skill`（注意不是 `main`） |
| 体积 | 18.6 MB / 163 个文件 |
| 描述 | "Distilly — Distill how they think into reusable Skills for any Agent or Bot. Formerly Colleague Skill" |
| topics | `agent-skills` / `ai-persona` / `digital-human` / `knowledge-distillation` / `claude-skills` |

**命名沿革**：原名 `ex-skill`（"前任 Skill"）→ "Colleague Skill"（同事）→ 现名 **Distilly**。

> 本地克隆位置：`D:\01_HJ_Work\00_Person\03_Github\06_distilly`

---

## 三、核心方法论

### 3.1 完整流程

`SKILL.md`（67.6KB）**本身就是 orchestrator**（不是独立进程），由宿主 Agent 按 Step 0-5 执行 `tools/` 下的脚本。

```
Step 1  intake        投料入口（引导用户提供素材）
Step 2  research      材料研究（仅 celebrity 线需要，含联网检索）
Step 3  双线并行 ─┬─ 线路 A：work_analyzer  → work_builder
                  └─ 线路 B：persona_analyzer → persona_builder
Step 4  merger        合并产出（含 Correction Log）
Step 5  validation    质量校验
```

### 3.2 产物结构：7 层人格档案

`skills/colleague/example_*/` 下的产物是 `meta.json` + `persona.md` + `work.md` 三件套。

`persona.md` 的分层：

| 层 | 内容 | 特性 |
|---|---|---|
| **Layer 0** | 核心性格 | **硬覆盖**，优先级最高，任何情况不得违背 |
| Layer 1 | 身份 | 是谁、从哪来、什么关系 |
| Layer 2 | **表达 DNA** | 怎么说话 —— 句法、节奏、口头禅 |
| Layer 3 | 决策判断 | 遇到 X 会怎么选 |
| Layer 4 | 人际行为 | 对不同的人不同的态度 |
| Layer 5 | 边界雷区 | 碰了会翻脸的话题 |
| Layer 6 | **内部张力** | 矛盾 —— 嘴上说 A 实际做 B |
| Layer 7 | 智识谱系 + Agentic Protocol | 思维方式 |
| — | **Correction Log** | **滚动追加，规定「永不删除」** |

> **与我们对照**：它的 **Layer 0 = 我们的「冻结层」**，但明确了"硬覆盖"语义；
> 它的 **Layer 6 = 我们的「内在反差」**；
> 它的 **Correction Log + 演化层 = 我们的「演化层」**，但我们用快照，它用日志。

### 3.3 ⭐ Correction Log 格式（可直接抄）

`prompts/celebrity/merger.md:148-154` 定义了格式：

```
[日期] 用户原话 / Affected layer / Change made / Evidence for change
```

并明文规定：**`Never delete correction-log entries`（永不删除条目）**。

> **这就是最朴素的「人格 commit message」。** 可直接升级成我们的 commit 结构：
> ```
> [2026-09-17] type: 演化 | layer: Layer6 | 改了什么 | 依据：哪次对话
> ```

---

## 四、⭐ 版本管理（我们最关心的部分）

`tools/version_manager.py`（7.8KB）实测：

### ✅ 做了什么

| 能力 | 实现 |
|---|---|
| 备份 | `shutil.copy2` 全量拷贝到 `versions/{version}/` |
| 回滚 | 覆盖当前文件 + 自动存 `_before_rollback` + 记 `rollback_from` |
| 保留策略 | `MAX_VERSIONS` 限制最近 10 版 |

### ❌ 没做什么

| 缺失 | 说明 |
|---|---|
| **没有任何 diff** | 无法知道"这次改了什么" |
| **无分支 / 标签** | 不能做人设 A/B 试演 |
| **版本号靠手填字符串** | `meta.get("version", "v1")` —— 无语义化递增 |
| **无变更理由 / 触发源** | 不知道为什么改了 |

> **结论：它是「带保留上限的文件备份器」，不是 Git。**
>
> **我们要补的四项它一项没做**：
> 1. Layer 粒度的结构化 diff
> 2. 版本语义化递增
> 3. 变更理由 / 触发源
> 4. 时间轴可视化 + 分支（人格 A/B 试演）

---

## 五、三条产品线的设计差异（重要）

| 线 | Prompt 规模 | 为什么 |
|---|---|---|
| `colleague/`（同事） | **1-2KB** | 输入源是**用户自己的 ground truth**（Slack/Teams/GitHub 记录） |
| `relationship/`（关系） | **1-2KB** | 同上，用户自己的聊天记录 |
| `celebrity/`（名人） | **5-13KB** | 输入源是**公开网络**，需防幻觉 + 信源质量把控 + 版权 |

**差值根源 = 输入源可控性。**

celebrity 线多了 `research`（12.3KB）+ 4 道关卡（`audit.md` / `validation.md` / `synthesis.md` / `merger.md`）。

> **对我们的启示**：
> - 我们的场景 A（模仿亲人朋友）≈ 它的 relationship 线 —— **简单**
> - 我们的场景 B（二次元角色，素材来自网络）≈ 它的 celebrity 线 —— **复杂**
> - **两条线的复杂度差 5-10 倍，我们的 SPEC 目前没区分**。这可能是个需要补的设计

### ⚠️ `budget_unfriendly` 不是成本分级

名字有误导。它是**深度分级** —— "更慢更贵更深"的**加强档**：
- 6 track（vs 3 track）
- URL ≥ 8（vs ≥ 2）
- 矛盾 ≥ 6 组
- 4 道审核（vs 2 道）

---

## 六、质量校验机制

### `tools/research/quality_check.py`（10.2KB）

跑 **13 项 checks**，`all()` 全过才算 PASS。

**反刷分设计很妙**（值得抄）：

| 检测 | 规则 |
|---|---|
| 泛化 URL 黑名单 | `/topic`、`/search`、`/video` 这类页面判为无效信源 |
| **时间戳检测** | 正则 `\d{2}:\d{2}:\d{2}` 出现即判**版权 FAIL**（说明抄了视频字幕） |

### 两道审核

| 文件 | 审查对象 |
|---|---|
| `prompts/celebrity/audit.md`（3.9KB） | 审**研究材料** |
| `prompts/celebrity/validation.md`（1.3KB） | 审**成品** |

### `tools/version_manager.py` 之外的工具

| 文件 | 作用 |
|---|---|
| `tools/skill_schema.py`（15.7KB） | 数据 schema 定义 |
| `tools/skill_writer.py`（24.6KB） | 产物写入 |
| `tools/skill_presets.py`（10.9KB） | 预设模板 |

---

## 七、投料渠道（比我们宽）

| 工具 | 解决什么 |
|---|---|
| `tools/dingtalk_auto_collector.py`（27KB） | 钉钉自动采集 |
| `tools/feishu_auto_collector.py`（34.7KB） | 飞书自动采集 |
| `tools/slack_auto_collector.py`（24.7KB） | Slack 自动采集 |
| `tools/email_parser.py`（9.8KB） | 邮件解析 |
| `tools/research/transcribe_audio.py`（10KB） | **音频转文字** |
| `tools/research/srt_to_transcript.py` | 字幕转文本 |
| `tools/research/download_subtitles.sh` | 下载字幕 |
| `tools/research/xquik_public_posts.py`（14.3KB） | 公开社交帖子采集 |

> 它支持 **12+ 平台**，且有**自动采集**能力（不只是手动粘贴）。
> 我们的 SPEC 目前只有"纯文本 / 结构化 / 文档"三种，**没有平台自动采集**。

---

## 八、借鉴清单

| # | 借鉴项 | 理由 | 优先级 |
|---|---|---|---|
| 1 | **Layer 0-7 分层结构** | 比我们的二分细，且 Layer 0 明确"硬覆盖"语义 | **P0** |
| 2 | **Correction Log 格式** | 最朴素的 commit message，可直接升级 | **P0** |
| 3 | **补 version_manager 缺的四项**（diff / 语义化 / 理由 / 可视化） | 这正是我们的差异化 | **P0** |
| 4 | **三条线按"输入源可控性"分级** | 亲人场景简单、网络素材场景复杂，复杂度差 5-10 倍 | P1 |
| 5 | **泛化 URL 黑名单 + 时间戳检测** | 反刷分设计，防"虚假研究" | P1 |
| 6 | **两道审核分离**（审材料 / 审成品） | 比一次性校验更可靠 | P1 |
| 7 | **平台自动采集** | 降低投料门槛 | P2 |
| 8 | **`budget_unfriendly` 深度分级** | 给用户"快速版 / 深度版"的选择 | P2 |

### 明确不抄

| 项 | 为什么不抄 |
|---|---|
| 它的 `nav.py` 类导航工具 | 对 LLM 是负优化（见 `竞品-elysia.skill.md`） |
| 全自动采集器的复杂度 | 我们 v1 不做平台对接（Non-Goal） |

---

## 九、数据来源

| 来源 | 说明 |
|---|---|
| GitHub REST API | 仓库元信息（星数/fork/推送时间），2026-09-17 实测 |
| 本地克隆 `06_distilly` | 文件树、`SKILL.md`、`prompts/`、`tools/` 源码 |
| **未获取** | `skill_writer.py` 全文（24.6KB，仅抓结构）、`merge_research.py`、`celebrity` 线的 `research/audit/synthesis` 细节 |

> ⚠️ 星数、时间等均为 API 实测值。`quality` 类自评分数未采信。

---

*创建时间：2026-09-17*
*分析深度：文件树全量 + 核心 Prompt 精读 + 版本管理源码实测*
