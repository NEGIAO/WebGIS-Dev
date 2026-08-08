# 2026-08-08 远程 3D 服务加载 + 数据源统一注册

**日期与时间**：2026-08-08 15:30
**任务等级**：L2
**版本**：V3.5.16

---

## 问题分析

### 核心症状
1. 用户要求在 Cesium 3D 场景中添加 ArcGIS Scene Server（I3S）等远程 3D 数据加载能力
2. 原有的 Cesium Ion 资产加载位于**图层 Tab**，用户要求移到**数据 Tab**
3. 远程加载的数据（Ion/I3S/3D Tiles）应注册到统一数据源列表，与样例城市数据享有相同控制（高度、材质、显隐、飞行、移除）

### 根本原因
- `Cesium3DTileset.fromUrl()` 无法处理 I3S SceneServer URL（期望 tileset.json），必须使用 `Cesium.I3SDataProvider.fromUrl()`
- 加载成功后若仅加入 `scene.primitives` 而不注册到 `loadedDataSources`，则无法在数据列表中统一管理

### 受影响模块
- 数据导入（useCesiumDataImport）
- 图层管理（useCesiumLayers）
- CesiumToolPanel UI
- CesiumContainer 装配
- i18n 中英文

---

## 修改内容

### 1. 数据 Tab UI 改造（CesiumToolPanel.vue）
- 「样例数据」按钮改为下拉菜单，三个选项：
  - 样例城市 3D Tiles
  - Cesium Ion 河南大学 (5115505)
  - 河南大学地学楼 (I3S)
- 使用 `<Teleport to="body">` + `position: fixed` 避免 HMR `__vnode` 错误
- 远程服务卡片（类型选择 + URL 输入 + 加载按钮）移至数据 Tab

### 2. 远程加载逻辑（useCesiumLayers.js）
- 新增 `loadCustomUrl3DTiles(type, url)` 统一处理三种类型
- I3S：`Cesium.I3SDataProvider.fromUrl()` → 取 `layers[0]._tileset`
- 3D Tiles：`Cesium.Cesium3DTileset.fromUrl()`
- Ion：路由到原有 `loadCustomIon3DTiles`
- 加载成功后调用 `dataImport.registerExternalDataSource()` 注册到统一列表

### 3. 数据源注册（useCesiumDataImport.js）
- 新增 `registerExternalDataSource({ name, entity, tilesetGeo, currentBaseHeight, terrainElevation })`
- 返回唯一 ID，后续高度/材质/显隐操作通过 ID 定位

### 4. 样例加载器（tilesetLoader.js）
- 新增 `loadSampleIonTileset` — Ion Asset 5115505 河南大学
- 新增 `loadSampleI3sTileset` — webgis.henu.edu.cn 地学楼 I3S
- 已有 `loadSampleDiscreteLODTileset` — CesiumGS 官方 TilesetWithDiscreteLOD
- **全部四个样例加载器（city/ion/i3s/discreteLOD）均注册到 `loadedDataSources`**，获得统一数据源卡片 UI（高度滑杆、材质选择、透明度、显隐、飞行、移除）

### 5. 事件路由（useCesiumDataOpsHandlers.js）
- `handleImportTilesetSample(payload)` 按 `payload.type` 分发：`city` / `ion` / `i3s` / `discreteLOD`

### 6. CesiumContainer.vue 装配修复
- `dataImport` 移至 `useCesiumLayers` 之前（依赖注入顺序）
- `heightSampler` 移至 `dataImport` 之前（useCesiumDataImport 依赖它）

### 7. cesium-shim.js
- 新增 `I3SDataProvider` 垫片导出

### 8. i18n
- 新增 `cesium.sampleDataTitle` / `sampleCity` / `sampleIon` / `sampleI3s`

---

## 修改原因
- 用户明确要求远程 3D 服务加载功能
- 数据源统一管理避免 UI 碎片化（原来 Ion 高度滑杆在图层 Tab，与其他数据源控制分离）
- HMR `__vnode` 错误是 Vue 热更新已知问题，Teleport 彻底绕开组件树 patch

---

## 影响范围
- 数据导入链路
- 图层管理（远程加载路径）
- CesiumToolPanel UI（数据 Tab 布局）
- i18n 中英文

---

## 解决方案

### 方案对比
| 方案 | 优点 | 缺点 |
|------|------|------|
| A. 在图层 Tab 直接加 I3S 支持 | 改动小 | 数据源管理碎片化，UI 重复 |
| B. 数据 Tab 统一入口 + 数据源注册 | 一致体验，统一控制 | 改动较大，需调整装配顺序 |

选定方案 B。

### 实施步骤
1. cesium-shim 加 I3SDataProvider 导出
2. useCesiumLayers 加 `loadCustomUrl3DTiles` + `handleRemoteServiceSubmit`
3. useCesiumDataImport 加 `registerExternalDataSource`
4. tilesetLoader 加 Ion/I3S 样例加载器
5. CesiumToolPanel UI 改造（下拉菜单 + Teleport）
6. CesiumContainer 装配顺序调整
7. i18n 补全

---

## 性能指标
未实测（功能性与架构调整，不涉及渲染性能）

---

## 测试方案

### Agent 已执行
- `npx vite build` 通过（29.43s）
- 无新增 TypeScript 报错（已有 tsc 配置）

### 待用户实机验证
1. 数据 Tab → 样例数据下拉菜单 → 选择「样例城市 3D Tiles」→ 确认加载并注册到列表
2. 数据 Tab → 样例数据 → 选择「Cesium Ion 河南大学」→ 确认飞行定位 + 数据源注册
3. 数据 Tab → 样例数据 → 选择「河南大学地学楼 I3S」→ 确认 I3S 加载成功
4. 数据 Tab → 远程服务 → 选择 I3S → 输入 URL → 加载 → 确认数据源注册
5. 已加载数据列表 → 高度滑杆 / 材质选择 / 显隐 toggle / 飞行 / 移除 全部功能验证

---

## 变更文件清单

| 文件 | 说明 |
|------|------|
| `frontend/src/cesium-shim.js` | 新增 I3SDataProvider 垫片导出 |
| `frontend/src/domains/cesium/composables/layers/useCesiumLayers.js` | 新增 loadCustomUrl3DTiles + handleRemoteServiceSubmit + 数据源注册 |
| `frontend/src/domains/cesium/composables/dataImport/useCesiumDataImport.js` | 新增 registerExternalDataSource |
| `frontend/src/domains/cesium/composables/dataImport/loaders/tilesetLoader.js` | 新增 loadSampleIonTileset + loadSampleI3sTileset；全部样例加载器注册到 loadedDataSources |
| `frontend/src/domains/cesium/composables/dataImport/useCesiumDataOpsHandlers.js` | handleImportTilesetSample 按 type 分发 |
| `frontend/src/domains/cesium/components/CesiumToolPanel.vue` | 下拉菜单 UI + Teleport + 远程服务卡片移至数据 Tab |
| `frontend/src/domains/cesium/components/CesiumContainer.vue` | 装配顺序调整（heightSampler → dataImport → layers） |
| `frontend/src/locales/zh-CN.js` | i18n 新增 4 key |
| `frontend/src/locales/en-US.js` | i18n 新增 4 key |

---

## 遗留与风险
- **CORS**：ArcGIS Scene Server 若未配置 `Access-Control-Allow-Origin`，浏览器会拦截请求。加载失败时需提示用户检查 CORS。
- **Ion 资产类型简化**：Ion 类型仅走 3D Tiles 路径，若用户输入的 Ion ID 实际是影像或地形，会加载失败。后续可扩展自动识别。
- **I3S 样例 URL**：`webgis.henu.edu.cn` 服务器对 User-Agent 敏感（无 UA 被拦截），浏览器正常访问无问题。
