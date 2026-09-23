---
title: 真我回响 · true-self-echo
type: product
status: active
updated: 2026-09-23
owner: HJ
related: [docs/01_product/PRODUCT, docs/00_meta/STATUS]
---

# 真我回响

`true-self-echo` ｜ 曾用名 `persona-forge`（人格工坊）· 2026-09-18 更名

> 一个既好用、又能让你看见它内心在发生什么的 AI 伙伴。

记录亲近的人、还原二次元角色、捏一个专属的虚拟伙伴 —— 投料素材，得到一个会成长的人格，
并且你能看见它「变了什么」，也能把它退回去。

---

## 当前状态

**一句话**：产品路线二（纯本地 + 自配 API）三端发行版全部可用 ——
网页 / 桌面 exe / 安卓 APK；模型配置全部 UI 化，发行包空配置分发、用户自配 key。

> ⚠️ **进度不要写在这里。唯一信息源是 [`docs/00_meta/STATUS.md`](docs/00_meta/STATUS.md)。**

### 发行物（`release/`，不入库）

| 端 | 文件 | 形态 |
|---|---|---|
| 网页 | 本机后端单进程 | `http://127.0.0.1:8787`（API + 页面同端口）|
| 桌面 | `TrueSelfEcho-Setup-0.1.0.exe` / `-Portable.exe` | NSIS 一键安装 / 绿色免安装（内置后端 + 静态托管） |
| 安卓 | `TrueSelfEcho-debug.apk`（7.6 MB） | Capacitor 壳，**直连模式**：请求从手机直达你配置的模型 API |

三端均为**空配置分发**——使用者自己在设置页添加模型连接（接口地址 + 模型名 + API Key），
开发者/作者本人的 key 不在任何包里。桌面与安卓的模型配置互不相通（各存各的设备）。

---

## 从哪开始读

| 你是               | 先读                                                                         |
| ---------------- | -------------------------------------------------------------------------- |
| **AI / 第一次接手项目** | [`docs/00_meta/AGENTS.md`](docs/00_meta/AGENTS.md) ← **AI 入口**             |
| **第一次接触这个项目**    | [`docs/01_product/PRODUCT.md`](docs/01_product/PRODUCT.md) ← **产品全貌，先读这个** |
| 想知道现在到哪一步了       | [`docs/00_meta/STATUS.md`](docs/00_meta/STATUS.md)                         |
| 想知道要做什么、不做什么     | [`docs/01_product/SPEC.md`](docs/01_product/SPEC.md)                       |
| 想知道为什么这么定        | [`docs/02_decisions/`](docs/02_decisions/)                                 |
| 要动手写代码了          | [`docs/06_ops/DEV_STANDARD.md`](docs/06_ops/DEV_STANDARD.md)               |
| 要验收 / 手动测试       | [`docs/06_ops/MANUAL_TEST.md`](docs/06_ops/MANUAL_TEST.md)（三端验收清单）          |
| 找不到某份文档          | [`docs/00_meta/INDEX.md`](docs/00_meta/INDEX.md) ← **文档登记表**               |

---

## 技术栈

Vue 3 · TypeScript · Vite · Pinia · IndexedDB · Node.js 薄后端 ·
Electron（桌面壳）· Capacitor（安卓壳 · CapacitorHttp 原生层绕 CORS）

不接后端服务、不引 ML 框架、不做模型微调、不做账号体系。

---

## 怎么跑起来

### 网页（开发）

```bash
npm install

# 一条命令（推荐）：后端 + dist 静态托管单进程
npm run server          # → http://127.0.0.1:8787（API 与页面同端口）

# 或开发模式（热更新）
npm run server          # 终端 1：薄后端
npm run dev             # 终端 2：Vite dev（/api 代理到 8787）
```

### 桌面（Windows）

```bash
npm run electron:build  # → release/TrueSelfEcho-Setup-*.exe + -Portable.exe
npm run electron:dev    # 开发调试（弹窗口）
```

### 安卓

```bash
# 一次性环境（JDK21 + Android SDK 自动装配，工具包在 .android-tools/，已 gitignore）
node scripts/setup-android-sdk.mjs

# 构建
npm run build && node node_modules/@capacitor/cli/bin/capacitor sync
node android/build-apk.mjs   # → android/app/build/outputs/apk/debug/app-debug.apk
```

> 依赖走阿里云镜像（gradle init.d）+ 腾讯 gradle 镜像；Capacitor 7 要求 **JDK 21**。

### 模型配置（全部 UI 化，不再需要手改 .env）

「设置」页 → 添加连接：粘贴服务商给的地址（自动识别 `/v1` 形态）→
**获取模型**（从接口拉模型列表，下拉选择）→ 测试连通 → 保存。
一个连接下的所有模型会平铺到对话页下拉里直接切换。

`.env` 仍是可选的本地预设（`.env.example` 有说明），设置页的 UI 配置可覆盖它。

---

## 目录结构

```
src/           前端（api 模型接入层 / core 干预与退化检测 / stores / components 水彩 UI）
server/        薄后端（单文件 ≤200 行；含 dist 静态托管 —— 单进程 = API + 网页）
electron/      桌面壳（主进程直接跑后端 bundle；esbuild 预打包 dist-server/）
android/       Capacitor 安卓工程（build-apk.mjs 构建）
build-assets/  三端图标（水晶折射风格 · 水彩 UI 同源）
scripts/       环境与资产脚本（SDK 装配 / 图标生成）
docs/          文档体系（唯一信息源）
exp/           E2E 与实验脚本
```

---

## 一句话原则

> 所有规矩服务于同一件事：**提升审查能力，而不是提升生成速度。**

AI 写得比你看得快，项目就会崩。详见 [开发规范](docs/06_ops/DEV_STANDARD.md)。
