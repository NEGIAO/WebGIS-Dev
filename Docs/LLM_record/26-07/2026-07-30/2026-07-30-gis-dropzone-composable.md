# 2026-07-30 GIS 拖拽导入 Composable 提取 + 2D 地图整图拖拽覆盖层

- **日期与时间**：2026-07-30 15:00
- **任务等级**：L2
- **版本号**：V3.5.1

---

## 问题分析

### 核心症状
TOCPanel 上传区的拖拽逻辑（~40 行）与 MapContainer 的拖拽导入需求高度重复，且 MapContainer 作为 2D 地图容器缺少整图拖拽导入能力——用户必须精准拖到 TOC 小上传条才能触发导入，体验差。

### 根本原因
1. 载荷构建函数（`createUploadPayloadsFromFiles` / `createUploadPayloadFromFolder` / `createUploadPayloadFromEntries`）定义在 `useGisLoader.ts` 内，既不能被拖拽场景复用，也增加了 loader 文件体积
2. 拖拽事件处理逻辑（dragEnter / dragOver / dragLeave / drop）硬编码在 TOCPanel 内，无法被 MapContainer 复用
3. MapContainer 没有覆盖层 UI 反馈，用户拖文件到地图区域时无任何视觉提示

### 受影响模块
- 数据导入链路（`data-import/`）
- 图层面板（`TOCPanel.vue`）
- 2D 地图容器（`MapContainer.vue`）
- 首页事件路由（`HomeView.vue`）
- i18n 中英文 locale

### 候选方案对比

| 方案 | 描述 | 优点 | 缺点 |
|---|---|---|---|
| A. 保持现状，MapContainer 内联实现 | 在 MapContainer 内写一份新的拖拽逻辑 | 快速 | 重复代码，TOC 与 Map 逻辑分叉 |
| B. 提取 composable + 覆盖层（✅ 选定） | `useGisDropZone` 统一拖拽处理，MapContainer 加 overlay 组件 | 复用性强、UX 好 | 新增 2 文件 |
| C. 提取为工具函数（非 composable） | 只抽 payload 构建函数 | 简单 | 拖拽状态（isDragging）仍需各组件自行管理 |

**选定方案 B**：composable 封装完整拖拽生命周期（状态 + 事件处理 + 载荷构建），覆盖层提供整图视觉反馈。

---

## 修改内容

### 功能开发
1. **新增 `gisUploadPayload.ts`**：从 `useGisLoader.ts` 提取三个载荷构建函数 + `GisDispatchInput` 类型，成为独立 SSOT
2. **新增 `useGisDropZone.ts`**：通用 GIS 文件拖拽 composable，封装 `isDragging` 状态 + 四个事件处理器 + `hasFileItems` 检测
3. **MapContainer 新增 2D 地图拖拽覆盖层**：全屏 overlay（模糊 + 虚线边框 + 上传图标 + i18n 提示），`gis-upload-dragging` class 触发时 desaturate 地图
4. **TOCPanel 重构**：删除内联拖拽处理函数（~40 行），改用 `useGisDropZone` composable
5. **HomeView 事件链路**：`@upload-data="handleUploadData"` 同时绑定到 MapContainer 和 CesiumToolPanel
6. **i18n 新增**：`layer.dropToMap`（中："释放文件，导入到二维地图" / 英："Release to import into the 2D map"）
7. **新增 `Docs/Demo/submergeAnalysis.html`**：淹没分析独立演示页（Vue 3 + Cesium CDN，532 行）

### Bug 修复
- 无（本次为功能开发）

---

## 修改原因
- TOCPanel 与 MapContainer 拖拽逻辑重复，违反 DRY
- 用户必须精准拖到 TOC 上传条，大地图操作体验差
- 为后续 Cesium 3D 地图拖拽导入奠定 composable 基础

---

## 影响范围
- 系统模块：数据导入链路、图层面板、2D 地图容器、首页事件路由、i18n
- 用户可见变化：拖拽文件到 2D 地图任意位置均可触发导入，并显示覆盖层提示

---

## 性能指标
- 未实测（纯前端逻辑重构，无网络/计算密集操作）

---

## 测试方案

### Agent 已执行
- [x] 代码审查（Code Review）完成，9 个文件逐行审查
- [x] 类型检查：确认新增 `.ts` 文件无 TS 编译错误（` GisDispatchInput` 类型导出/导入一致）
- [x] i18n key 一致性：中英文 locale 均添加 `dropToMap`

### 待用户实机验证
- [ ] 拖拽单个 GeoJSON 文件到 2D 地图中心 → 应显示覆盖层 → 释放后成功导入
- [ ] 拖拽 SHP 配套文件（.shp + .dbf + .shx）到地图 → 应递归读取后导入
- [ ] 拖拽文件夹到地图 → 应识别为文件夹上传
- [ ] 拖拽文件到 TOC 上传区 → 覆盖层不应出现（TOC 在 MapContainer 插槽内，事件冒泡需确认）
- [ ] 非文件拖拽（如 DOM 元素）→ 覆盖层不应出现
- [ ] 3D 模式下拖拽 → 应无反应（Cesium 容器不绑定此事件）

---

## 变更文件清单

| 文件路径 | 说明 |
|---|---|
| `frontend/src/domains/common/data-import/gisUploadPayload.ts` | **新增**：载荷构建函数 + GisDispatchInput 类型 SSOT |
| `frontend/src/domains/common/data-import/useGisDropZone.ts` | **新增**：通用 GIS 文件拖拽 composable |
| `frontend/src/domains/common/data-import/useGisLoader.ts` | **修改**：删除内联载荷函数，改为从 gisUploadPayload 导入 |
| `frontend/src/domains/common/layer-tree/components/TOCPanel.vue` | **修改**：删除 ~40 行内联拖拽逻辑，改用 useGisDropZone |
| `frontend/src/domains/ol/components/MapContainer.vue` | **修改**：新增拖拽覆盖层 UI + useGisDropZone 接入 + CSS |
| `frontend/src/app/HomeView.vue` | **修改**：MapContainer 绑定 @upload-data 事件 |
| `frontend/src/locales/zh-CN.js` | **修改**：新增 layer.dropToMap |
| `frontend/src/locales/en-US.js` | **修改**：新增 layer.dropToMap |
| `Docs/Demo/submergeAnalysis.html` | **新增**：淹没分析独立演示页 |

---

## 遗留与风险

1. **MapContainer 继续膨胀**（#5）：新增 47 行 CSS 添加到已 2000+ 行文件，建议后续提取为 `GisUploadOverlay.vue` 组件
2. **TOC 拖拽链路空引用风险**（#4）：TOC 的 `upload-data` 经 HomeView 中转调用 `mapContainerRef.value?.addUserDataLayer()`，当 MapContainer 未挂载时静默失败
3. **GisDispatchInput.content 死字段**（#1）：全仓库无消费方，建议下次清理
4. **onUpload 未 await**（#6）：`useGisDropZone` 的 `onUpload` 回调若为 async，Promise 被静默丢弃

---

## 门禁结果
- CheckStructureTree：待运行
- CheckConfigRegistry：待运行（本次无新增配置 key）
