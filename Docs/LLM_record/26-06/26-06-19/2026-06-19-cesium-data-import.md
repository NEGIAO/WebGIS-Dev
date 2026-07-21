# 2026-06-19 Cesium 数据导入功能：支持 GLB/GLTF/GeoJSON/KML/SHP/CZML 加载到 3D 场景 + Code Review 修复

**日期和时间**：2026-06-19 16:20（功能初版）/ 17:45（Code Review 修复）

**修改内容**：
- 新建 `useCesiumDataImport.js` composable，统一管理所有格式的 Cesium 数据加载逻辑
- 新建 `CesiumDataImportDialog.vue` 弹窗组件，用于 GLB/GLTF 无嵌入坐标时的手动坐标输入
- 修改 `CesiumToolPanel.vue`，新增「数据」tab（第 4 个 tab），支持文件选择和已加载数据源管理
- 修改 `CesiumContainer.vue`，接入数据导入 composable + 弹窗 + 拖拽上传覆盖层
- Code Review 后修复：响应式转发、SHP 数组分支、KMZ BlobURL 泄漏、Dialog 重入聚焦、文件选择交互
- 更新 `frontend/README.md` / `README.md` 文件结构树

**修改原因**：
当前项目的数据导入管线完全在 OL（2D）侧（`useLayerDataImport.js`），Cesium 3D 模式下无任何用户数据导入能力。两个引擎使用完全不同的渲染 API，需要在 Cesium 侧新建独立的导入 composable，同时复用底层解析器（SHP → GeoJSON、KMZ 解压等）。

**影响范围**：
- Cesium 数据导入系统（新建）
- Cesium 高级控制台（`CesiumToolPanel.vue`）
- Cesium 容器（`CesiumContainer.vue`）

---

## 事件逻辑链条分析

### 核心症状
用户无法在 Cesium 3D 模式下加载任何用户数据，所有数据导入功能仅在 OL 2D 模式下可用。

### 根本原因
1. OL 使用 `ol/format/*` + `ol/layer/Vector` 管线，Cesium 使用 `DataSource` + `Model` + `Primitive` 完全不同的 API
2. Cesium 组件与 OL 数据导入之间无任何共享代码
3. 底层解析器（SHP → GeoJSON、KMZ 解压等）与渲染引擎无关，可直接复用

### 优化解决方案
复用现有解析层，仅新建 Cesium 渲染层，最小化代码重复。

---

## 格式 → Cesium API 映射

| 格式 | Cesium API | 自动定位 |
|------|-----------|---------|
| GeoJSON/JSON | `Cesium.GeoJsonDataSource.load()` | ✅ flyTo |
| KML | `Cesium.KmlDataSource.load()` | ✅ flyTo |
| KMZ | `Cesium.KmlDataSource.load()` (内置支持) + 回退手动解压 | ✅ flyTo |
| SHP | `parseShpPartsToGeoJSON()` → `GeoJsonDataSource` | ✅ flyTo |
| GLB/GLTF | `Cesium.Model.fromGltfAsync()` — 有嵌入坐标自动，否则弹窗输入 | 视情况 |
| CZML | `Cesium.CzmlDataSource.load()` | ✅ flyTo |
| 3D Tiles | `Cesium.Cesium3DTileset.fromUrl()` | ✅ flyTo |

---

## 新建文件

### 1. `composables/useCesiumDataImport.js`
- 核心 composable，接收 `getViewer`/`getCesium`/`message` 闭包
- `loadDataFile(file)` — 根据扩展名分发到对应加载函数
- `loadGeoJSON(file)` — `GeoJsonDataSource.load(blobUrl)` + 自动定位
- `loadKML(file)` — `KmlDataSource.load(blobUrl)`
- `loadKMZ(file)` — 先尝试 `KmlDataSource.load`，失败则手动 JSZip 解压
- `loadSHP(file)` — 复用 `parseShpPartsToGeoJSON()` → `GeoJsonDataSource`
- `loadGLTF(file)` — 检测嵌入坐标 (`CESIUM_RTC` / `asset.extras`)，无则暂存到 `pendingGltfFile`
- `loadCZML(file)` — `CzmlDataSource.load(blobUrl)`
- `loadTilesetJSON(file)` — `Cesium3DTileset.fromUrl(blobUrl)`
- `loadGltfWithUserCoords(coords)` — 用户弹窗输入坐标后调用
- `removeDataSource(id)` / `clearAllDataSources()` — 管理已加载数据

### 2. `CesiumDataImportDialog.vue`
- `Teleport to body` 全局弹窗
- 输入经度 (-180~180)、纬度 (-90~90)、高度 (≥0)
- 实时验证 + `emit confirm({lng, lat, height})` / `cancel`

### 3. 修改 `CesiumToolPanel.vue`
- 新增 `Upload`/`FileJson`/`Globe` 图标导入
- 新增 `data` tab（第 4 个 tab，4 列网格布局）
- 数据 tab 包含：文件选择区（虚线框 + hidden input）、已加载数据源列表、全部清除按钮
- 新增 props: `loadedDataSources`
- 新增 emits: `data-import`/`data-remove`/`data-clear-all`
- `UI_STATE_VERSION` 升至 3（适配新 tab 结构）
- 新增样式：`.data-upload-area`/`.data-source-row`/`.data-source-icon` 等

### 4. 修改 `CesiumContainer.vue`
- 导入 `useCesiumDataImport` + `CesiumDataImportDialog` + `Upload` 图标
- 初始化 `dataImport` composable
- 模板新增：`CesiumDataImportDialog` 弹窗 + 拖拽覆盖层 (`drag-overlay`)
- `CesiumToolPanel` 新增 props/emits 绑定
- 拖拽支持：`@dragover`/`@dragleave`/`@drop` 事件 → `onDragOver`/`onDragLeave`/`onDrop`
- `onUnmounted` 中调用 `dataImport.clearAllDataSources()`
- 事件处理函数：`handleDataImport`/`handleDataRemove`/`handleDataClearAll`/`handleGltfCoordConfirm`

---

## 修改的文件路径

| 文件 | 操作 |
|---|---|
| `frontend/src/components/Cesium/composables/useCesiumDataImport.js` | **新建** |
| `frontend/src/components/Cesium/CesiumDataImportDialog.vue` | **新建** |
| `frontend/src/components/Cesium/CesiumToolPanel.vue` | **修改** |
| `frontend/src/components/Cesium/CesiumContainer.vue` | **修改** |
| `frontend/README.md` | **修改** |

---

## 测试方案

1. **GeoJSON 加载**：选择 .geojson 文件 → 验证加载到场景并自动定位
2. **KML 加载**：选择 .kml 文件 → 验证样式和位置正确
3. **SHP 加载**：选择 .shp 文件 → 验证投影转换正确
4. **GLB 加载**：
   - 有 `CESIUM_RTC` 扩展的 GLB → 直接加载
   - 无嵌入坐标的 GLB → 弹出坐标输入框 → 输入坐标 → 验证模型出现
5. **拖拽上传**：拖拽任意支持格式文件到 Cesium 场景 → 验证拖拽覆盖层 + 加载成功
6. **删除/清除**：加载多个数据 → 逐一删除 → 全部清除 → 验证场景恢复
7. **错误处理**：选择不支持的格式 → 验证错误提示

---

## 🐞 Code Review 修复记录（2026-06-19 17:45）

### Bug 1：CesiumContainer.vue 中 ref 解包丢失响应式

**症状**：用户加载/删除数据源时，`CesiumToolPanel` 中的「已加载数据源列表」不刷新。

**根因**：模板里写 `:loaded-data-sources="dataImport.loadedDataSources.value"` 直接把响应式 ref 解包成普通数组，父组件再次 `set` ref 时面板拿不到响应。

**修复**：用 `computed` 转发：

```js
const loadedDataSourcesForPanel = computed(() => dataImport.loadedDataSources.value);
```

模板改为 `:loaded-data-sources="loadedDataSourcesForPanel"`，并把 `pendingGltfFile` 也用 `computed` 转发。

### Bug 2：SHP 多数据集数组分支要素数显示 '?'

**症状**：SHP 包含多个 FeatureCollection 时，控制台显示「Shapefile ... 加载成功 (? 个要素)」。

**根因**：`parseShpPartsToGeoJSON()` 在多数据集中返回 `FeatureCollection[]`，但提示文案中 `geojson?.features?.length` 取了数组的 `.features`，结果是 undefined → 显示 `?`。

**修复**：归一化为 FeatureCollection 数组后累加每个集合的 `features.length`，并把多个 FeatureCollection 合并成一个用于 `GeoJsonDataSource.load`。

### Bug 3：KMZ Fallback 路径的 Blob URL 泄漏

**症状**：若 KMZ 文件本身直接被 `KmlDataSource.load(blobUrl)` 成功加载，回退分支里再次 `createBlobUrl(file)` 的 url 永远不会 `revokeObjectURL`。

**修复**：
- `loadKMZFallback` 不再创建顶层 blobUrl（KMZ 输入本身已在 `loadKMZ` 顶层创建/回收）。
- 内层 try 块不再捕获失败后 throw，仅由 `loadKMZ` 顶层在 catch 里把 blobUrl revoke 掉。

### Bug 4：CesiumDataImportDialog 重入残留

**症状**：用户取消弹窗 → 再次选择 GLB → 弹窗打开时旧错误信息仍在。

**修复**：合并两个 watcher 为一个统一重置分支，visible 变化时无论真假都清空表单状态。

### Bug 5：CesiumToolPanel 文件选择可访问性

**症状**：上传区是 `<div>`，没有 `role/tabindex`，键盘用户无法触发文件选择。

**修复**：增加 `role="button"`、`tabindex="0"`、`aria-label` 和 `@keydown.enter/space` 处理，调用 `triggerFileInput()` 主动 `fileInputRef.value.click()`。同时移除按钮 `title` 中的歧义文案。

### Bug 6：未使用 / 死代码清理

- `useCesiumDataImport.js` 删除未使用的 `GLTF_EXTENSIONS` / `GEOJSON_EXTENSIONS` 常量。
- `useCesiumDataImport.js` 将 `catch (error) { throw error; }` 改为直接传播。
- `useCesiumDataImport.js` 修复未使用变量 `e`。
- `CesiumContainer.vue` 移除 `dataImport.pendingGltfFile.value` 的直接传值，统一走 computed。
- `CesiumToolPanel.vue` 移除 `data-upload-area` 中冗余的点击透传逻辑。
