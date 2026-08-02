# 暂存区 Review 修复（require 崩溃 + 容器版本号 + 分层边界）

**日期与时间**：2026-08-02 16:30
**任务等级**：L2（多文件修复 + 配置登记 + 部署链路，无跨模块架构重构）
**版本**：V3.5.8

---

## 问题分析

### 核心症状 → 根本原因

对暂存区（V3.5.7 Code Review 修复批次，37 文件）进行二次 Review，发现 2 个真实 Bug + 2 个架构问题：

| # | 类别 | 症状 | 根本原因 | 严重度 |
|---|------|------|---------|--------|
| 1 | Bug | `client.js` 错误提示在浏览器必崩 | `require('@common/shell/useMessage')`：frontend 为纯 ESM（`"type": "module"`），vite 无 commonjs 转换，浏览器中 `require` 未定义 → 首次 API 错误触发 `getShowError()` 即抛 ReferenceError，`Promise.reject` 前异常吞掉原始错误 | HIGH |
| 2 | Bug | 容器内 FastAPI version 恒为 V0.0.0 | `_read_app_version()` 读 `Path(__file__).parent.parent/README.md`；但 deploy.yml 用 `git subtree split --prefix=backend` 推 HF，容器内无根 README.md | MEDIUM |
| 3 | 重复 | 新增 `setSelectedEditLayerId` 与既有 `setStyleTarget` 实现完全相同 | 未检查既有 action 即新增 | LOW |
| 4 | 边界 | common 域 store import ol 域 utils | `browserDownload.ts` 放 ol 域却被 common 域 `useDownloadStore` 使用，跨域反向依赖 | LOW |
| 5 | 类型 | `useLazyModules.ts` 2 个 TS2307 | 项目首个 .ts 文件 import .vue，无 `.vue` 模块声明 | MEDIUM |

### 受影响模块

- 前端 API 层（client.js）
- 后端应用入口（app.py）+ 配置登记（.env.example / catalog.py）+ 部署链路（deploy.yml）
- 前端 stores（useLayerStore.ts / useDownloadStore.ts）
- 前端组件（TOCPanel.vue / MapContainer.vue / MapDownloader.vue / AdministrativeDivisionPanel.vue）
- 前端工具层（browserDownload.ts 迁移）

### 候选方案对比

**Bug1（require()）**：
- A) 保留延迟加载，改动态 `import()` → 需把拦截器改 async，改动面大
- B) 恢复静态 import `useMessage` → ✅ 阅读 useMessage.js 确认其为纯模块级实现（`render()` 命令式挂载），**不依赖 inject**，原顶层调用本就安全；改回即正确

**Bug2（容器版本号）**：
- A) 新增 `APP_VERSION` 环境变量注入 → ❌ 违反 SSOT（版本号唯一来源应是根 README），增加配置维护负担
- B) Dockerfile COPY 根 README → ❌ subtree 推送的 HF 仓库里没有根 README，无处可 COPY
- C) deploy.yml 在 subtree push 前 `cp README.md backend/README.md` → ✅ 容器内自带 README，原代码零改动，版本号仍 100% 来自根 README

**Bug5（.vue 类型）**：
- A) useLazyModules 改用 `// @ts-ignore` → 掩盖问题
- B) 新增 `vue-shims.d.ts`（Vite 标准做法）→ ✅ 一次解决所有 .ts import .vue

---

## 修改内容

1. **client.js**：`require()` 延迟加载 → 静态 `import { useMessage }` + 顶层解构（3 处调用同步改回）
2. **deploy.yml**：push 前 `cp README.md backend/README.md`，让容器内自带根 README（_read_app_version() 原代码零改动，版本号仍 100% 来自根 README，无新配置 key）
5. **useLayerStore.ts**：删除重复 `setSelectedEditLayerId`；**TOCPanel.vue** 改回 `setStyleTarget`
6. **browserDownload.ts**：ol/utils → common/utils；useDownloadStore.ts / MapDownloader.vue 更新 import
7. **vue-shims.d.ts**：新建 `.vue` 模块声明
8. **MapContainer.vue**：`useLayerStore()` 声明移至 store 声明区（模板 :86 已使用）
9. **AdministrativeDivisionPanel.vue**：移除 `|| '/'` 冗余兜底
10. **frontend-structure.md**：同步 browserDownload 迁移（common 增 / ol 删）+ vue-shims.d.ts

---

## 修改原因

暂存区批次（V3.5.7）存在未验证即提交的 `require()`（日志自己标注"生产构建需验证"但未执行）；版本号注入设计未考虑 HF subtree 部署拓扑；新 action 与既有逻辑重复；新 utils 放错域。

---

## 影响范围

- 前端 API 拦截器（错误提示链路，原 bug 下每次 API 错误必崩）
- 后端版本号展示（/openapi.json、/api/info 相关）
- 部署链路（deploy.yml backend 推送步骤）
- 图层编辑链路（TOCPanel 编辑目标切换，行为与旧代码一致）
- 下载链路（Blob/URL 下载触发，纯迁移无行为变化）

---

## 解决方案

见「候选方案对比」。核心原则：**能复用则复用、能回归则回归**；新增配置按规范先登记再编码；部署链路改动在日志写明动机。

---

## 性能指标

非性能相关任务，未实测。

---

## 测试方案

### Agent 已执行

- [x] `npm run build` 两次通过（29.59s / 37.80s），产物中无 `require(` 残留，`V3.5.7` 版本注入正确
- [x] `npx tsc --noEmit`：本次引入的 2 个 TS2307 已消除；剩余 6 个错误全部为存量（CompassManager/decompressor/useAuthStore/useTileSourceFactory/driveXmlParser，均不在暂存区范围）
- [x] `_read_app_version()` 单测：读 README → V3.5.7（无 env var 介入）
- [x] `python CheckConfigRegistry.py` 通过（catalog 111 key）
- [x] `python CheckStructureTree.py` 通过（419/419）
- [x] deploy.yml YAML 语法解析通过，`cp README.md backend/README.md` + subtree push 逻辑均存在
- [x] 后端 `python -m py_compile app.py` 通过（完整 import 因本机缺 rasterio 依赖无法执行，已在日志标注）

### 待用户实机验证

1. `npm run dev` 后触发任意 API 错误（如断开后端），确认错误 toast 正常弹出（原 bug 会崩溃）
2. 推送到 main 触发 deploy.yml，观察 `sync-to-huggingface` 步骤执行 `cp README.md backend/README.md`
3. HF Space 构建完成后访问 `/openapi.json`，确认 version 为 `V3.5.8`（非 V0.0.0）
4. 图层编辑：TOC 面板切换编辑目标图层，行为与 V3.5.7 一致
5. MapDownloader 下载：Blob 下载 / 原生 URL 下载均正常触发

---

## 变更文件清单

| 文件 | 说明 |
|------|------|
| `frontend/src/api/backend/client.js` | require() → 静态 import useMessage（3 处调用回归） |
| `.github/workflows/deploy.yml` | backend push 前 `cp README.md backend/README.md`（容器内自带根 README，版本号仍 100% 来自根 README） |
| `frontend/src/domains/ol/stores/useLayerStore.ts` | 删除重复 setSelectedEditLayerId |
| `frontend/src/domains/common/layer-tree/components/TOCPanel.vue` | 改用既有 setStyleTarget |
| `frontend/src/domains/ol/utils/browserDownload.ts` → `frontend/src/domains/common/utils/browserDownload.ts` | 迁移消除 common→ol 反向依赖 |
| `frontend/src/domains/common/data-import/stores/useDownloadStore.ts` | import 路径更新 |
| `frontend/src/domains/ol/components/MapDownloader.vue` | import 路径更新 |
| `frontend/src/vue-shims.d.ts` | 新建 .vue 模块声明 |
| `frontend/src/domains/ol/components/MapContainer.vue` | layerStore 声明位置调整 |
| `frontend/src/domains/ol/components/AdministrativeDivisionPanel.vue` | 移除冗余兜底 |
| `Docs/Guide/frontend-structure.md` | browserDownload 迁移 + vue-shims.d.ts 同步 |
| `README.md` | 版本号三处 V3.5.7 → V3.5.8 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.5.8 条目 |

---

## 遗留与风险

- **deploy.yml `cp README.md` 依赖 HF_TOKEN 权限**：subtree push 需 HF_TOKEN 有 Space 写权限；若 push 失败则版本号在生产仍显示 V0.0.0（功能不受影响，仅版本号回退）
- **存量 tsc 错误 6 个**：均不在本次范围（CompassManager.ts:1078、decompressor.ts:205、useAuthStore.ts:73、useTileSourceFactory.ts:15、driveXmlParser.ts:156），已记入待办，建议后续独立任务修复
- **暂存区/工作区状态**：本次修改已 staged，用户需自行 git commit
- 后端完整 import 验证受本机缺 rasterio 限制，实机部署（HF build）为最终验证

---

## 下一步建议

1. 修复存量 6 个 tsc 错误（独立 L2 任务）
2. 实机推 main 验证 deploy.yml 注入链路
3. 继续 V3.5.7 遗留的分层边界提取（MapContainer initMap / CesiumContainer initViewer / CesiumToolPanel）
