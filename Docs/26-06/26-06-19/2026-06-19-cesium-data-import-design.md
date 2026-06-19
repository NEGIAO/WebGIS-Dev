# 2026-06-19 Cesium 数据导入功能：支持 GLB/GLTF/GeoJSON/KML/SHP/CZML 加载到 3D 场景

**日期和时间**：2026-06-19 15:30

**修改内容**：
- 设计方案：在 Cesium 3D 高级控制台中新增「数据」tab，支持加载 GLB/GLTF、GeoJSON/JSON、KML/KMZ、SHP、CZML 等常用 GIS 数据格式到 Cesium 3D 场景
- 新建 `useCesiumDataImport.js` composable，统一管理所有格式的加载逻辑
- 新建 `CesiumDataImportDialog.vue` 弹窗组件，用于 GLB/GLTF 坐标输入
- 修改 `CesiumToolPanel.vue`，新增数据导入 tab 和文件选择 UI
- 修改 `CesiumContainer.vue`，接入数据导入 composable

**修改原因**：
当前项目的数据导入管线完全在 OL（2D）侧：
- `useLayerDataImport.js` 支持 GeoJSON、KML、SHP、TIFF 等格式，通过 `ol/format/*` 解析并渲染为 OL 图层
- Cesium 侧仅有 `Cesium3DTileset.fromUrl()` 加载 3D Tiles 的硬编码示例，**无任何用户数据导入能力**
- 两个引擎的渲染 API 完全不同：OL 用 `ol/source/Vector` + `ol/layer/Vector`，Cesium 用 `DataSource` + `Entity` / `Model` / `Primitive`
- 用户需要在 3D 模式下也能加载 GIS 数据，特别是 GLB/GLTF 三维模型

**影响范围**：
- Cesium 数据导入系统（新建）
- Cesium 高级控制台（`CesiumToolPanel.vue`）
- Cesium 容器（`CesiumContainer.vue`）
- Cesium 工具模块定义（`useCesiumToolModules.js`）

---

## 事件逻辑链条分析

### 核心症状
用户无法在 Cesium 3D 模式下加载任何用户数据（GeoJSON、KML、SHP、GLB/GLTF），所有数据导入功能仅在 OL 2D 模式下可用。

### 根本原因
1. **渲染引擎差异**：OL 使用 `ol/format/GeoJSON` → `ol/source/Vector` → `ol/layer/Vector` 管线；Cesium 使用 `Cesium.GeoJsonDataSource` / `Cesium.KmlDataSource` / `Cesium.Model` 等完全不同的 API
2. **架构隔离**：Cesium 组件（`components/Cesium/`）与 OL 数据导入（`composables/useLayerDataImport.js`）之间无任何共享代码
3. **解析层可复用**：SHP → GeoJSON 的转换（`shpParser.ts`）、ZIP 解压（`decompressFile.js`）、文本编码检测（`vectorUtils.js`）等底层解析逻辑与渲染引擎无关，可以直接复用

### 受影响模块
- Cesium 控制面板（需新增 UI）
- Cesium 容器（需接入新 composable）
- 数据导入系统（需新建 Cesium 侧实现）

### 优化处理方案
复用现有解析层，仅新建 Cesium 渲染层，最小化代码重复。

---

## 架构设计

### 格式 → Cesium API 映射表

| 格式 | Cesium API | 是否需要用户输入 | 自动定位 |
|------|-----------|----------------|---------|
| GeoJSON/JSON | `Cesium.GeoJsonDataSource.load()` | 否 | ✅ flyTo bounding box |
| KML/KMZ | `Cesium.KmlDataSource.load()` | 否 | ✅ flyTo bounding box |
| SHP | 先 `parseShpPartsToGeoJSON()` → `GeoJsonDataSource` | 否 | ✅ flyTo bounding box |
| GLB/GLTF | `Cesium.Model.fromGltfAsync()` | 有嵌入坐标则自动，否则弹窗输入 | 视情况 |
| 3D Tiles (tileset.json) | `Cesium.Cesium3DTileset.fromUrl()` | 否 | ✅ flyTo boundingSphere |
| CZML | `Cesium.CzmlDataSource.load()` | 否 | ✅ flyTo bounding box |

### 数据流

```
用户选择文件
    │
    ▼
┌─────────────────────┐
│  useCesiumDataImport │  ← 新建 composable
│  loadDataFile(file)  │
└──────────┬──────────┘
           │
    ┌──────▼──────┐
    │ 格式检测     │  ← getExtension(file.name)
    └──────┬──────┘
           │
    ┌──────▼──────────────────────────┐
    │ 按格式分发                       │
    │                                  │
    │  .geojson/.json ──→ GeoJsonDataSource.load()
    │  .kml           ──→ KmlDataSource.load()
    │  .kmz           ──→ JSZip解压 → KmlDataSource.load()
    │  .shp           ──→ parseShpPartsToGeoJSON → GeoJsonDataSource
    │  .glb/.gltf     ──→ 检测嵌入坐标 → Model.fromGltfAsync() 或弹窗
    │  .czml          ──→ CzmlDataSource.load()
    │  tileset.json   ──→ Cesium3DTileset.fromUrl()
    └──────┬──────────────────────────┘
           │
    ┌──────▼──────┐
    │ viewer       │  ← 加载到场景
    │ .dataSources │
    │ .primitives  │
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ flyTo 自动定位│
    └─────────────┘
```

### 复用策略

| 已有模块 | 复用方式 |
|---------|---------|
| `utils/gis/parsers/shpParser.ts` → `parseShpPartsToGeoJSON()` | 直接调用，SHP → GeoJSON 转换 |
| `utils/gis/decompressFile.js` → `decompressBuffer()` | KMZ/ZIP 解压 |
| `composables/dataImport/vectorUtils.js` → `decodeTextContent()` | KML 文本编码检测 |
| `utils/geo` → 投影检测函数 | CRS 自动识别 |

---

## 实施步骤

### Step 1: 创建 `useCesiumDataImport.js` composable

**文件**：`frontend/src/components/Cesium/composables/useCesiumDataImport.js`

核心功能：
```js
export function useCesiumDataImport({ getViewer, getCesium, message }) {
    const loadedDataSources = ref([]); // [{ id, name, type, entity }]

    async function loadDataFile(file) { ... }  // 格式分发
    async function loadGeoJSON(file) { ... }   // GeoJsonDataSource
    async function loadKML(file) { ... }       // KmlDataSource
    async function loadKMZ(file) { ... }       // 解压 → KmlDataSource
    async function loadSHP(file) { ... }       // parseShpPartsToGeoJSON → GeoJsonDataSource
    async function loadGLTF(file) { ... }      // Model.fromGltfAsync 或弹窗
    async function loadCZML(file) { ... }      // CzmlDataSource
    function removeDataSource(id) { ... }      // 移除单个数据源
    function clearAllDataSources() { ... }     // 清除所有

    return { loadDataFile, loadedDataSources, removeDataSource, clearAllDataSources };
}
```

GLB/GLTF 坐标检测逻辑：
1. 读取 GLTF JSON（如果是 .gltf）或 GLB 二进制头部
2. 检查 `extensionsUsed` 中是否有 `CESIUM_RTC`（相对地心坐标）
3. 检查是否有 `asset.extras` 中的地理坐标
4. 如果没有嵌入坐标 → 弹出坐标输入弹窗（`CesiumDataImportDialog`）
5. 用户输入经纬度+高度 → 创建 `Cesium.Transforms.headingPitchRollToFixedFrame` 变换矩阵
6. 调用 `Cesium.Model.fromGltfAsync({ url, modelMatrix })` 加载

### Step 2: 创建 `CesiumDataImportDialog.vue` 弹窗

**文件**：`frontend/src/components/Cesium/CesiumDataImportDialog.vue`

功能：
- 暗色主题，匹配 CesiumToolPanel 风格
- 输入字段：经度（lng, -180~180）、纬度（lat, -90~90）、高度（height, ≥ 0）
- 坐标格式验证
- 确认/取消按钮
- emit `confirm({ lng, lat, height })` 和 `cancel`

### Step 3: 修改 `CesiumToolPanel.vue`

**文件**：`frontend/src/components/Cesium/CesiumToolPanel.vue`

改动：
1. 新增第 4 个 tab: "数据"（Upload 图标）
2. 数据 tab 内容：
   - 文件选择按钮（`<input type="file">`，accept: `.geojson,.json,.kml,.kmz,.shp,.glb,.gltf,.czml,.zip`）
   - 已加载数据源列表（名称、类型标签、删除按钮）
   - 全部清除按钮
3. 新增 props：`loadedDataSources`（数据源列表）
4. 新增 emit：`data-import`（文件选择事件）、`data-remove`（删除数据源）、`data-clear-all`

### Step 4: 修改 `useCesiumToolModules.js`

**文件**：`frontend/src/components/Cesium/composables/useCesiumToolModules.js`

改动：
1. 接收 `dataImport` 参数（包含 `loadedDataSources` 状态）
2. 在 `toolModules` computed 中新增 dataImport 状态信息
3. 新增 `handleDataImportAction` 和 `handleDataImportStateChange` 处理函数

### Step 5: 修改 `CesiumContainer.vue`

**文件**：`frontend/src/components/Cesium/CesiumContainer.vue`

改动：
1. 导入 `useCesiumDataImport` composable
2. 导入 `CesiumDataImportDialog` 组件
3. 初始化 composable，传入 `getViewer` / `getCesium` / `message`
4. 将 `loadedDataSources` 传给 `CesiumToolPanel`
5. 处理 `data-import` / `data-remove` / `data-clear-all` 事件
6. 清理：`onUnmounted` 中调用 `clearAllDataSources()`

---

## 涉及文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `Cesium/composables/useCesiumDataImport.js` | **新建** | 核心 composable：格式分发 + 加载逻辑 |
| `Cesium/CesiumDataImportDialog.vue` | **新建** | GLB/GLTF 坐标输入弹窗 |
| `Cesium/CesiumToolPanel.vue` | **修改** | 新增"数据"tab + 文件选择 UI |
| `Cesium/composables/useCesiumToolModules.js` | **修改** | 新增 dataImport 模块状态 |
| `Cesium/CesiumContainer.vue` | **修改** | 接入 composable，事件分发 |
| `utils/gis/parsers/shpParser.ts` | **不变** | 复用 `parseShpPartsToGeoJSON()` |
| `utils/gis/decompressFile.js` | **不变** | 复用 `decompressBuffer()` |
| `composables/dataImport/vectorUtils.js` | **不变** | 复用 `decodeTextContent()` |

---

## 不支持的格式处理

| 格式 | 处理方式 |
|---|---|
| TIFF/GeoTIFF | Cesium 不支持直接加载用户 TIF，提示用户使用 2D 模式 |
| Shapefile 缺少 .prj | 使用 `parseShpPartsToGeoJSON` 的默认 EPSG:4326 处理 |
| 损坏的 GLB/GLTF | 捕获 `Model.fromGltfAsync` 异常，提示文件损坏 |

---

## 验证方案

1. **GeoJSON 加载**：准备一个包含点/线/面的 GeoJSON 文件 → 选择文件 → 验证加载到场景并自动定位
2. **KML 加载**：准备一个含样式的 KML 文件 → 选择文件 → 验证样式和位置正确
3. **SHP 加载**：准备一个含 .shp/.dbf/.shx/.prj 的 Shapefile → 选择文件 → 验证属性和投影正确
4. **GLB 加载**：
   - 有嵌入坐标的 GLB → 直接加载，出现在正确位置
   - 无嵌入坐标的 GLB → 弹出坐标输入框 → 输入坐标 → 验证模型出现在指定位置
5. **CZML 加载**：准备一个 CZML 文件 → 选择文件 → 验证时间动态实体加载
6. **删除功能**：加载多个数据源 → 逐一删除 → 验证场景中对应实体消失
7. **全部清除**：加载多个数据源 → 点击全部清除 → 验证场景恢复干净
8. **错误处理**：选择不支持的格式 → 验证错误提示

---

## 性能指标

- 文件读取 + 解析：GeoJSON/KML < 500ms（10MB 以内），SHP < 1s（含 DBF 解析）
- GLB 加载：取决于模型大小，预期 < 2s（10MB 以内）
- 场景渲染：Cesium DataSource 自动管理 LOD，无额外性能优化需求
- 内存：每个 DataSource 约 5-20MB，取决于要素数量

---

## 测试方案

1. 准备测试文件集：
   - `test.geojson`（含点/线/面要素，EPSG:4326）
   - `test.kml`（含样式和图标）
   - `test.shp` + `test.dbf` + `test.shx` + `test.prj`
   - `test.glb`（无嵌入坐标）
   - `test.czml`（简单时间动态数据）
2. 在 3D 模式下逐一加载，验证：
   - 数据正确渲染
   - 自动定位到数据范围
   - 删除和清除功能正常
3. 错误场景测试：
   - 损坏文件 → 错误提示
   - 不支持格式 → 错误提示
   - GLB 无坐标 → 弹窗出现 → 取消 → 无加载
