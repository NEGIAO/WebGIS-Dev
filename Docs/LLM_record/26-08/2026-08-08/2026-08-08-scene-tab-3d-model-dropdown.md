# 2026-08-08 场景 Tab「加载 3D 模型」改为下拉菜单

> 日期：2026-08-08 上午
> 任务等级：L2
> 版本：V3.5.16

---

## 问题分析

- **核心症状**：场景 Tab 的「加载 3D 模型」是单机按钮，只能加载一个固定的远程模型（TilesetWithDiscreteLOD）；而 Data Tab 已有"样例数据"下拉菜单（3 项：city / ion / i3s），UI/逻辑完整。用户希望场景 Tab 也采用同样范式，并把原单机加载的模型作为新样例加入。
- **根本原因**：场景模块的 `tileset` action 直接绑定 `useCesiumSceneActions.loadCustomTileset`（硬编码单一 URL），未复用 Data Tab 的样例下拉范式。
- **受影响模块**：`tilesetLoader.js` / `useCesiumDataImport.js` / `useCesiumDataOpsHandlers.js` / `CesiumToolPanel.vue` / `sceneModule.js` / `useCesiumToolModules.js` / `useCesiumSceneActions.js` / i18n（zh-CN + en-US）。
- **候选方案对比**：
  1. **直接改 `loadCustomTileset` 为下拉**：需侵入 `useCesiumSceneActions`，且与 Data Tab 样例加载路径（`tilesetLoader` + `useCesiumDataImport`）分裂，后续维护两份逻辑。❌
  2. **在场景 Tab 新增独立下拉 + 把 LOD 补进 `tilesetLoader`**：复用 Data Tab 完整链路（UI 样式 / emit 事件 / handler 分发），移除冗余单机逻辑。✅ 单一事实来源，UI 一致。
- **选定方案**：方案 2。

---

## 修改内容

### 1. 新增 `loadSampleDiscreteLODTileset`（tilesetLoader.js）

- 加载 `https://raw.githubusercontent.com/CesiumGS/3d-tiles-samples/master/1.0/TilesetWithDiscreteLOD/tileset.json`
- `viewer.scene.primitives.add` + `viewer.flyTo`（HeadingPitchRange pitch -25°，半径 2.5 倍，duration 2s）
- 成功 toast：`已加载离散 LOD 样例 (TilesetWithDiscreteLOD)`

### 2. 导出新 loader（useCesiumDataImport.js）

- import 列表加入 `loadSampleDiscreteLODTileset`
- return 中加入 `loadSampleDiscreteLODTileset: () => loadSampleDiscreteLODTileset(loaderCtx())`

### 3. handler 分发新类型（useCesiumDataOpsHandlers.js）

- `handleImportTilesetSample` 新增 `else if (type === 'discreteLOD')` 分支 → `dataImport.loadSampleDiscreteLODTileset()`

### 4. 场景 Tab UI 改造（CesiumToolPanel.vue）

- 在 `quick-actions` 网格中，`v-for` 渲染 sceneModule actions 之后，追加「加载 3D 模型」下拉按钮（`sample-dropdown` 容器）
- 下拉按钮：Box 图标 + `t('cesium.load3DModel')` + ChevronDown
- 菜单 4 项：city（MapPin）/ ion（Globe）/ i3s（Building）/ discreteLOD（Layers），每项 emit `import-tileset-sample` 并关闭菜单
- 新增 `sceneSampleMenuOpen = ref(false)` 状态
- `getActionIcon` 移除 `scene.tileset: Box` 映射（已无该 action）
- 复用已有 `.sample-dropdown` / `.sample-menu` / `.sample-menu-item` / `.sample-chevron` CSS（Data Tab 同范式）

### 5. i18n 新增 key

- zh-CN：`sampleLod: '离散 LOD 样例 (3d-tiles-samples)'`、`load3DModel: '加载 3D 模型'`
- en-US：`sampleLod: 'Discrete LOD Sample (3d-tiles-samples)'`、`load3DModel: 'Load 3D Model'`

### 6. 移除冗余单机逻辑

- `sceneModule.js`：移除 `tileset` action 定义与 JSDoc `@param` 中的 `loadCustomTileset`
- `useCesiumToolModules.js`：`handleToolAction` scene 分支移除 `tileset: sceneActions.loadCustomTileset`
- `useCesiumSceneActions.js`：移除已无外部调用者的 `loadCustomTileset` 函数（该函数原即加载 TilesetWithDiscreteLOD，现由 `loadSampleDiscreteLODTileset` 接替）

---

## 修改原因

- 统一场景 Tab 与 Data Tab 的样例加载范式，降低认知与维护成本。
- 保留原单机按钮加载的模型（TilesetWithDiscreteLOD）作为下拉第 4 项，功能不丢失。
- 移除 `loadCustomTileset` 避免同一 URL 两处维护（SSOT：样例 URL 只在 `tilesetLoader.js` 一处定义）。

---

## 影响范围

- **Cesium 3D 场景 Tab**：场景 Tab 操作区新增一下拉入口，原单机按钮移除。
- **Cesium 3D 数据 Tab**：无改动（下拉菜单仍 3 项，独立存在）。
- **配置 key**：无新增。
- **结构树**：无文件增删（仅文件内容改动）。

---

## 解决方案

详见「修改内容」。关键文件变更：

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `frontend/src/domains/cesium/composables/dataImport/loaders/tilesetLoader.js` | 新增 | `loadSampleDiscreteLODTileset` |
| `frontend/src/domains/cesium/composables/dataImport/useCesiumDataImport.js` | 改动 | 导入 + 导出新 loader |
| `frontend/src/domains/cesium/composables/dataImport/useCesiumDataOpsHandlers.js` | 改动 | handler 新增 `discreteLOD` 分支 |
| `frontend/src/domains/cesium/components/CesiumToolPanel.vue` | 改动 | 场景 Tab 模板 + 状态 + icon map |
| `frontend/src/domains/cesium/composables/toolModules/sceneModule.js` | 移除 | 移除 `tileset` action |
| `frontend/src/domains/cesium/composables/toolModules/useCesiumToolModules.js` | 移除 | 移除 scene.tileset 映射 |
| `frontend/src/domains/cesium/composables/camera/useCesiumSceneActions.js` | 移除 | 移除 `loadCustomTileset` |
| `frontend/src/locales/zh-CN.js` | 新增 | `sampleLod` / `load3DModel` |
| `frontend/src/locales/en-US.js` | 新增 | `sampleLod` / `load3DModel` |

---

## 性能指标

不涉及（UI 交互逻辑改动，无计算/渲染路径变化）。

---

## 测试方案

### Agent 已执行

- `npx tsc --noEmit`：零报错通过。
- `python CheckStructureTree.py`：结构树漂移 0，缺失 0。
- `python CheckConfigRegistry.py`：全部配置登记门禁通过。
- 代码审查：确认 `loadCustomTileset` 移除后无其他调用点（grep 验证）。

### 待用户实机验证

1. 打开 Cesium 3D 场景 → 场景 Tab → 操作区应出现「加载 3D 模型」下拉按钮（位于「回家」「珠峰」按钮右侧）。
2. 点击下拉按钮 → 菜单展开 4 项：样例城市 / Cesium Ion 河南大学 / 河南大学地学楼 I3S / 离散 LOD 样例。
3. 逐项点击：
   - 样例城市 → 加载本地 city tileset.json，白膜材质，贴地，flyTo
   - Ion → 加载 asset 5115505，flyTo 河南大学
   - I3S → 加载地学楼 SceneServer，flyTo
   - 离散 LOD → 加载 GitHub 远程 TilesetWithDiscreteLOD，flyTo（网络依赖 raw.githubusercontent.com）
4. 点击菜单外区域 → 菜单收起。
5. Data Tab 样例数据下拉仍正常工作（3 项），不受影响。

---

## 变更文件清单

- `frontend/src/domains/cesium/composables/dataImport/loaders/tilesetLoader.js` — 新增 `loadSampleDiscreteLODTileset`
- `frontend/src/domains/cesium/composables/dataImport/useCesiumDataImport.js` — 导入/导出新 loader
- `frontend/src/domains/cesium/composables/dataImport/useCesiumDataOpsHandlers.js` — handler 新增 `discreteLOD`
- `frontend/src/domains/cesium/components/CesiumToolPanel.vue` — 场景 Tab 下拉菜单 + 状态 + icon map
- `frontend/src/domains/cesium/composables/toolModules/sceneModule.js` — 移除 `tileset` action
- `frontend/src/domains/cesium/composables/toolModules/useCesiumToolModules.js` — 移除 scene.tileset 映射
- `frontend/src/domains/cesium/composables/camera/useCesiumSceneActions.js` — 移除 `loadCustomTileset`
- `frontend/src/locales/zh-CN.js` — 新增 i18n key
- `frontend/src/locales/en-US.js` — 新增 i18n key
- `README.md` — 版本号三处 + 版本演进表
- `Docs/Guide/CHANGELOG.md` — 追加 V3.5.16 条目

---

## 遗留与风险

- **网络依赖**：离散 LOD 样例托管于 `raw.githubusercontent.com`，企业网络若屏蔽 GitHub raw 域名会加载失败（与改造前原单机按钮行为一致，未引入新风险）。
- 无配置 key 变更，无需更新 `.env.example` / `catalog.py`。

---

## 下一步建议

- 若后续继续扩充 3D 样例，只需在 `tilesetLoader.js` 新增 loader + `CesiumToolPanel.vue` 场景下拉追加菜单项 + `handleImportTilesetSample` 加分支，三处同步即可。
