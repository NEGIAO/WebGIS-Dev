# V3.4.89 — Cesium/流体 toast + 下载 store lastError i18n

> 日期：2026-07-28 22:05  
> 任务等级：L2  
> 版本号：V3.4.89  
> 顺延说明：接 L0 暂存区 CR（tip 曾为 V3.4.86；会话内 tip 已至 V3.4.88），本批修 CR 的 P2/P3 残留，顺延为 **89**。

---

## 问题分析

### 核心症状
- 英文 UI 下 Cesium 启动 / 导航选点 / 流体与洪水相关 `message.*` 仍为中文硬编码
- `MapDownloader` 已 `useLocale`，但 `store.lastError` / `store.message` 透传中文或后端原文
- Force 条文写「`.env` 不得直接改」与用户授权 + L1 非密实践冲突

### 根本原因
- V3.4.86 仅覆盖 ToolPanel / module 工厂，**CesiumContainer / FluidSimulationPanel toast 明确不在本批**
- `useDownloadStore` 在 throw / lastError 中写中文字面量，UI 无法 t()
- Force 边界未区分 L1 非密与 L3 绝密

### 受影响模块
- `CesiumContainer.vue`、`FluidSimulationPanel.vue`
- `useDownloadStore.ts`、`MapDownloader.vue`
- `locales/zh-CN.js` / `en-US.js`（`cesium.toast` / `cesium.fluidToast` / `mapDownload.err*`）
- `Docs/Force_command.md` 第 2 节第 3 条

---

## 修改内容

1. **cesium.toast**（9 键）+ **cesium.fluidToast**（9 键）zh/en；两 Vue 全量 `t()`
2. **mapDownload** 增补 store 侧校验/状态键；`useDownloadStore` 统一 `Error('mapDownload.xxx')` / lastError key
3. **MapDownloader**：`resolveStoreText` — `mapDownload.*` 走 t()，其它原文透传（后端 message）
4. **Force**：L1 `.env` 可改须 example+catalog；L3 绝密禁止
5. **P3 import 顺序**：`analysisModule` / `sceneModule` 工作区已正确（import 在文件顶），无需再改

**不纳入**（越权）：其它 Cesium loader / wind / layers 的 CJK toast（CR 未列、非本批 P2）

---

## 修改原因

用户要求「修复他们」= CR 列出的 P2/P3；英文主路径 3D 启动与下载失败条高感知。

---

## 影响范围

- 前端 toast / 下载错误展示；Force 文案
- 无新配置 key；无结构树文件增删
- 无 Git 写操作

---

## 解决方案

| 方案 | 说明 | 选择 |
|---|---|---|
| A. 仅 UI 映射中文表 | store 仍中文，EN 依赖映射表维护 | 否 |
| B. store 存 i18n path + UI resolve | 与 auth `code` 模式一致 | ✓ |
| C. 顺手 i18n 全部 Cesium loader | 扩大面，越权 | 否 |

---

## 性能指标

未实测（字符串 / 键替换）

---

## 测试方案

### Agent 已执行
- [x] CesiumContainer / FluidSimulationPanel 目标 `message.*` 无 CJK 字面量（改 t()）
- [x] useDownloadStore 用户可见 throw/lastError/message 默认值改为 `mapDownload.*`
- [x] zh/en 叶节点 **1728 = 1728**
- [x] `CheckStructureTree.py` 398=398；`CheckConfigRegistry.py` 全绿

### 待用户实机
- [ ] 英文：Cesium 启动成功/失败 toast 为英文
- [ ] 英文：流体创建/洪水开始结束/清除为英文
- [ ] 英文：下载校验失败（空模板/过期）错误条为英文
- [ ] 中文路径无回归；后端返回的中文 `message` 仍可原样显示

---

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/components/Cesium/CesiumContainer.vue` | boot / nav toast t() |
| `frontend/src/components/Cesium/FluidSimulation/FluidSimulationPanel.vue` | fluid toast t() |
| `frontend/src/stores/useDownloadStore.ts` | lastError/message/throw → mapDownload.* |
| `frontend/src/components/Map/MapDownloader.vue` | resolveStoreText |
| `frontend/src/locales/zh-CN.js` / `en-US.js` | toast + mapDownload 键 |
| `Docs/Force_command.md` | L1/L3 `.env` 分级 |
| `README.md` / `CHANGELOG.md` / 本日志 | V3.4.89 |

---

## 遗留与风险

- 其它 Cesium 子模块（import loaders、wind、layers）仍有 CJK `message.*`，未本批清理
- 后端下载任务 `message` 字段若中文，EN 下进度说明仍可能中文（有意透传）
- 未跑浏览器实机

---

## 下一步建议

- 可选：Cesium dataImport loaders / useCesiumWind 等 toast 扫尾
- 用户 stage + commit（Agent 不写 git）
