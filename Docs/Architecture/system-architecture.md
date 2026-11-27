# 系统架构（System Architecture）

> 本文档以**分层架构图**展示 WebGIS 项目的完整工程链路：源码 → CI/CD → 多平台部署 → 运行时 → 用户。
> 各层的详细分解见姊妹文档：[cicd-pipeline.md](cicd-pipeline.md) · [deployment-relationship.md](deployment-relationship.md)

---

## 架构全景

```mermaid
flowchart TB
    %% ============================================================
    %% Layer 1: Source
    %% ============================================================
    subgraph SRC["📦 源码层（GitHub）"]
        direction LR
        REPO_DEV["WebGIS-Dev
前端 + 后端源码"]
        REPO_HOME["NEGIAO.github.io
个人主页仓库"]
    end

    %% ============================================================
    %% Layer 2: CI/CD
    %% ============================================================
    subgraph CI["⚙️ CI / CD（GitHub Actions · deploy.yml）"]
        direction LR
        JOB_BUILD["① build<br/>npm install + shaders:check + npm run build → dist<br/>上传 pages artifact 与 dist-files artifact"]
        JOB_SELF["② deploy-to-self<br/>actions/deploy-pages → 本仓库 GitHub Pages"]
        JOB_SYNC["③ sync-to-main-repo<br/>dist → 主页仓库 WebGIS/ 目录"]
        JOB_HF_STATIC["④ deploy-frontend-to-hf<br/>dist（LFS）→ HF Space NEGIAO/Web"]
        JOB_HF_FULL["⑤ sync-to-huggingface<br/>git archive 全栈 → HF Space NEGIAO/WebGIS"]
    end

    REPO_DEV --> JOB_BUILD
    JOB_BUILD --> JOB_SELF
    JOB_BUILD --> JOB_SYNC
    JOB_BUILD --> JOB_HF_STATIC
    JOB_BUILD --> JOB_HF_FULL
    JOB_SYNC --> REPO_HOME

    %% ============================================================
    %% Layer 3: Deployment Platforms
    %% ============================================================
    subgraph DPL["🚀 部署平台"]
        direction LR
        P_GH["GitHub Pages"]
        P_HF["Hugging Face"]
        P_CF["Cloudflare"]
        P_PC["Posit Connect"]
        P_VC["Vercel"]
    end

    JOB_SELF --> P_GH
    JOB_HF_STATIC --> P_HF
    JOB_HF_FULL --> P_HF
    REPO_HOME --> P_GH
    REPO_HOME --> P_CF
    REPO_HOME --> P_PC
    REPO_HOME --> P_VC

    %% ============================================================
    %% Layer 4: Runtime
    %% ============================================================
    subgraph RT["🌐 运行时"]
        direction LR
        FE_HOME["个人主页
6 个域名"]
        FE_WEBGIS["WebGIS 前端
8 个域名"]
        BE["Docker 后端 API
negiao-webgis.hf.space"]
        R2["瓦片存储
tiles.negiao.cc.cd"]
    end

    P_GH --> FE_HOME
    P_GH --> FE_WEBGIS
    P_HF --> FE_WEBGIS
    P_CF --> FE_HOME
    P_CF --> FE_WEBGIS
    P_PC --> FE_HOME
    P_PC --> FE_WEBGIS
    P_VC --> FE_HOME
    P_VC --> FE_WEBGIS
    P_HF --> BE

    FE_WEBGIS -->|"REST API"| BE
    FE_WEBGIS -->|"加载自定义瓦片"| R2

    %% ============================================================
    %% Layer 5: Users
    %% ============================================================
    subgraph USR["👤 用户"]
        USER["全球用户
任意域名访问"]
    end

    FE_HOME --> USER
    FE_WEBGIS --> USER
```

---

## 五层职责说明

### 第一层：源码层

| 仓库 | 角色 | 说明 |
|------|------|------|
| `NEGIAO/WebGIS-Dev` | 主仓库 | 前端（Vue 3 + Vite）+ 后端（FastAPI + Docker）源码 |
| `NEGIAO/NEGIAO.github.io` | 个人主页仓库 | 接收 WebGIS 前端 dist 同步到 `WebGIS/` 子目录，并作为多平台分发的中转站 |

**关键机制**：WebGIS-Dev 的 GitHub Actions 将构建产物 dist 推送到主页仓库后，**主页仓库自身触发** Cloudflare / Posit / Vercel 的部署，形成两级分发架构。

### 第二层：CI/CD 层

**主部署工作流**：[.github/workflows/deploy.yml](../../.github/workflows/deploy.yml)；另有 4 个辅助工作流：`codeql.yml`（CodeQL 安全扫描）、`pre-check.yml`（PR Check）、`dependabot-automerge.yml`（Dependabot 自动合并）、`traffic-counter.yml`（访问统计更新）。

触发条件：`main` 分支 push 或手动触发（`workflow_dispatch`）

`deploy.yml` 共 5 个 job：`build` 完成后并行触发其余 4 路（均 `needs: build`）：

1. **build** — `setup-node` 固定 Node.js 22，依次执行 `npm install` → `npm run shaders:check` → `npm run build`，产出 `frontend/dist`，并上传 pages artifact 与普通 `dist-files` artifact。
2. **deploy-to-self** — `actions/deploy-pages@v5` 把 pages artifact 部署到本仓库 GitHub Pages。
3. **sync-to-main-repo** — 把 `dist-files` 同步到 `NEGIAO.github.io` 仓库的 `WebGIS/` 目录（触发主页仓库的下游部署）。
4. **deploy-frontend-to-hf** — 把 dist（二进制走 Git LFS）推送到 Hugging Face Static Space `NEGIAO/Web`。
5. **sync-to-huggingface** — `git archive deploy backend frontend` 组装全栈上下文，推送到 Hugging Face Docker Space `NEGIAO/WebGIS`（nginx 前端 + FastAPI）。

> **Actions 运行时强制 Node 24**：`deploy.yml` 顶层 `env` 设置 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`，GitHub Actions 内置 JS Action 以 Node 24 运行时执行；这与 `build` job 中 `setup-node` 指定的 Node.js 22（项目构建所用版本）是两个不同层面。

> 详细流水线分析见 [cicd-pipeline.md](cicd-pipeline.md)

### 第三层：部署平台

| 平台 | 部署内容 | 部署来源 | 部署方式 |
|------|----------|----------|----------|
| **GitHub Pages** | 个人主页 + WebGIS 前端 | 双仓库均触发 | `actions/deploy-pages` 直接部署 |
| **Cloudflare Pages** | 个人主页 + WebGIS 主页仓库子目录 | 主页仓库触发 | CDN + DNS + R2 |
| **Hugging Face Static** | WebGIS 前端（LFS） | WebGIS-Dev 直接推送 | `git push --force` 到 `NEGIAO/Web` |
| **Hugging Face Docker** | 全栈单容器（nginx 前端 + FastAPI） | WebGIS-Dev 直接推送 | `git archive` 组装 Space 推送 `NEGIAO/WebGIS` |
| **Posit Connect Cloud** | 个人主页 + WebGIS | 主页仓库触发 | 静态托管 |
| **Vercel** | 个人主页 + WebGIS | 主页仓库触发 | 快速部署 |

#### 平台能力对比

| 能力 | GitHub Pages | Cloudflare | Hugging Face | Posit Connect | Vercel |
|------|:------------:|:----------:|:------------:|:-------------:|:------:|
| 静态托管 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Docker 后端 | ❌ | ❌ | ✅ | ❌ | ❌ |
| 全球 CDN | ✅ | ✅ | ✅ | ✅ | ✅ |
| 自定义域名 | ✅ | ✅ | ❌ | ❌ | ❌ |
| DNS 托管 | ❌ | ✅ | ❌ | ❌ | ❌ |
| 对象存储 | ❌ | R2 | ❌ | ❌ | ❌ |
| 国内可访问 | ⚠️ 不稳定 | ✅ 速度快 | ✅ 慢 | ✅ 可访问 | ❌ 不可访问 |
| 免费额度 | 1 GB | 无限 | 有限（旧用户免费） | 有限 | 100 GB |

#### 平台优缺点

| 平台 | 优点 | 缺点 |
|------|------|------|
| **GitHub Pages** | 全球知名、零配置、与 GitHub 深度集成 | 只能部署静态页面；国内访问不稳定 |
| **Cloudflare** | 功能丰富（DNS + CDN + R2）、国内访问速度快 | 部分域名（.cc.cd）在国内被屏蔽 |
| **Hugging Face** | 免费 Docker 部署后端（旧用户）、国内可访问 | 资源有限；长时间无人访问自动休眠，访问时按需唤醒 |
| **Posit Connect** | 国内可访问、支持静态 + 轻量 Python | 功能受限，只能部署静态或轻量架构 |
| **Vercel** | 部署极快、全球 CDN | 国内无法访问 |

### 第四层：运行时

| 组件 | 入口数量 | 说明 |
|------|----------|------|
| **个人主页前端** | 6 个域名 | 静态个人主页，托管在多个平台 |
| **WebGIS 前端** | 8 个域名 | Vue 3 SPA，静态资源 |
| **Docker 后端 API** | 1 个域名 | FastAPI + SQLite + 空间分析 |
| **瓦片存储** | 1 个域名 | Cloudflare R2 对象存储的 XYZ 自定义瓦片服务 |

**前后端通信**：
- 前端通过 `VITE_BACKEND_URL`（构建期注入）调用后端 API（Hugging Face Space）——**仅业务 API，无瓦片中转**
- 瓦片纠偏/直通通过 `VITE_TILE_PROXY_BASE_URL` 访问 **VPS** `https://vpn.negiao.cn/proxy/*`（实现见独立仓 `tile-proxy`；架构说明 [tile-rectify-system.md](tile-rectify-system.md)）
- 前端拼接入口：[frontend/src/config/publicRuntime.ts](../../frontend/src/config/publicRuntime.ts)

### 第五层：用户层

无论用户通过哪个域名访问，最终都到达同一个前端；业务 API 在 HF Space，瓦片中转在 VPS `vpn.negiao.cn`。

---

## 域名全景

> 完整域名映射、部署来源矩阵见 [deployment-relationship.md](deployment-relationship.md)

### 个人主页域名（6 个）

| 域名 | 平台 | CDN | 国内访问 | 来源 |
|------|------|-----|----------|------|
| `negiao.github.io` | GitHub Pages 默认 | ❌ | ⚠️ 不稳定 | 主页仓库 |
| `negiao.cloud-ip.cc` | GitHub Pages + 自定义域 | ✅ 可配 | ✅ 可访问 | 主页仓库 |
| `negiao.cc.cd` | Cloudflare Pages | ✅ Cloudflare | ❌ 被屏蔽 | 主页仓库 |
| `negiao.pages.dev` | Cloudflare Pages 默认 | ✅ Cloudflare | ❌ 被屏蔽 | 主页仓库 |
| `negiao-pages.share.connect.posit.cloud` | Posit Connect 默认 | ❌ | ✅ 可访问 | 主页仓库 |
| `negiao.vercel.app` | Vercel 默认 | ❌ | ❌ 不可访问 | 主页仓库 |

### WebGIS 前端域名（7 个）

| 域名 | 平台 | 来源 |
|------|------|------|
| `negiao.github.io/WebGIS-Dev` | GitHub Pages | WebGIS-Dev 仓库根路径 |
| `negiao.github.io/WebGIS` | GitHub Pages | 主页仓库 `WebGIS/` 子目录 |
| `negiao.cloud-ip.cc/WebGIS-Dev` | GitHub Pages + 自定义域 | 自动跳转 |
| `webgis.negiao.cc.cd` | Cloudflare Pages | 私有域名挂载 |
| `webgis-dev.pages.dev` | Cloudflare Pages 默认 | 自动分配 |
| `negiao-webgis.share.connect.posit.cloud` | Posit Connect 默认 | 主页仓库触发 |
| `negiao-web.static.hf.space` | Hugging Face Static | WebGIS-Dev 直接推送 |

### 边缘数据接口域名（1 个）

| 组件 | 域名 | 平台 | 说明 |
|------|------|------|------|
| 数据接口 Worker | `api.negiao.cn` | Cloudflare Workers | 第三方数据接口统一封装层（GitHub 统计 / 51.la 访客等）；Worker 名 `negiao-api` |

> **架构约定（2026-10-27 确立）**：`api.negiao.cn` 专门承担"把第三方数据源封装成 JSON 接口"的职责 ——
> 免费、与业务后端完全隔离、天然带边缘缓存。**新增同类接口一律放这里，不得混入 WebGIS-Dev 或主页站点**。
> 典型场景：上游要求特殊 Header、证书异常、需要跨域、或需要把非结构化响应（HTML/JS/XML）解析成 JSON 时，
> 解析与容错都收敛在 Worker 内，前端只消费结构化数据。
> 实现与路由清单见主页仓库 `NEGIAO.github.io/workers/github-stats`（Worker 名 `negiao-api`，2026-10-28 由 `webgis-github-stats` 改名）。

### 后端与存储域名（2 个）

| 组件 | 域名 | 平台 | 说明 |
|------|------|------|------|
| 后端 API | `negiao-webgis.hf.space` | Hugging Face Docker | FastAPI + SQLite |
| 自定义瓦片存储 | `tiles.negiao.cc.cd` | Cloudflare R2 | XYZ 自定义瓦片对象存储 |

#### 域名能力对比

| 域名 | 可配 DNS | 可配 CDN | 只能托管 |
|------|----------|----------|----------|
| `negiao.github.io` | ❌ | ❌ | ✅ GitHub Pages |
| `negiao.cloud-ip.cc` | ✅ 大部分记录 | ✅ | ❌ 全能 |
| `negiao.cc.cd` | ✅ Cloudflare | ✅ Cloudflare | ❌ 全能 |
| `negiao.pages.dev` | ❌ | ❌ | ✅ Cloudflare |
| `negiao-pages.share.connect.posit.cloud` | ❌ | ❌ | ✅ Posit |
| `negiao.vercel.app` | ❌ | ❌ | ✅ Vercel |

---

## 数据流总结

```
用户请求
    │
    ├── 个人主页域名 ──► 静态个人主页（6 个域名）
    │
    └── WebGIS 前端域名 ──► Vue 3 SPA（8 个域名）
                            │
                            ├── REST API ──────────► HF Docker 后端（FastAPI + SQLite）
                            │                          negiao-webgis.hf.space
                            │
                            └── 瓦片请求 ──────────► tiles.negiao.cc.cd（Cloudflare R2）
                                                      │
                                                      └── 纠偏/直通代理（fallback）
                                                      vpn.negiao.cn/proxy/*（VPS，非 HF）
```

---

*本文档随部署架构变化更新；日常改动见维护日志。*
*当前版本见根 [README.md](../../README.md)「项目简介」行*
