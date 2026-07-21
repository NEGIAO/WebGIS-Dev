# 多格式数据导入架构说明

日期：2026-07-21

适用范围：`frontend/src/utils/gis/`（格式分发与解析）、`frontend/src/composables/useLayerDataImport.js`（2D/OL 导入管线）、`frontend/src/components/Cesium/composables/useCesiumDataImport.js`（3D/Cesium 导入管线）。

本文是长期参考文档，说明 WebGIS 3.0 中"多格式数据导入"功能的格式分发机制、2D 与 3D 双管线差异、Shapefile 解析、坐标参考转换、3D Tiles blob URL 加载方案及 GLTF 坐标提取等核心实现，供后续维护、格式扩展与 bug 修复时对照。

## 1. 功能定位

本功能支持用户通过**文件选择**或**拖拽**方式，将多种 GIS 数据格式导入到 2D（OpenLayers）或 3D（Cesium）场景中，并自动定位到数据范围。

支持的格式包括：GeoJSON、KML/KMZ、Shapefile（.shp + .dbf/.shx/.prj/.cpg）、GeoTIFF、GLB/GLTF、CZML、3D Tiles（ZIP 包或文件夹）。

**重要边界**：2D 管线与 3D 管线是**独立的两套实现**，共享底层解析工具（`shpParser.ts`、`crs-engine.ts`、`decompressFile.js`），但上层的格式路由、图层创建、相机定位逻辑完全分离。2D 管线不处理 GLTF/CZML/3D Tiles；3D 管线不处理 GeoTIFF 栅格。

## 2. 文件结构

| 文件 | 职责 |
|------|------|
| `utils/gis/dataDispatcher.js` | 格式分发入口：根据扩展名/魔术字节路由到 ZIP/KMZ 解包、KML 解析、GeoJSON 解析、TIFF 打包等流程 |
| `utils/gis/archiveProcessor.js` | 归档处理：ZIP/KMZ 解包后 SHP 文件分组、资源 Blob URL 管理、批量 packet 构建 |
| `utils/gis/decompressFile.js` | ZIP 解压（JSZip）+ 魔术字节检测，返回标准化 entry 列表（`{ name, path, extension, buffer }`） |
| `utils/gis/parsers/shpParser.ts` | Shapefile 解析：`parseShpPartsToGeoJSON` 多策略解析 + DBF 属性增强 + CRS 重投影 |
| `utils/gis/crs-engine.ts` | proj4 坐标参考引擎：PRJ WKT 识别、EPSG 注册、`reprojectGeoJSON` 逐坐标转换 |
| `utils/gis/crsAware.js` | 投影感知辅助：`detectGeoJsonProjection`、`detectKmlProjectionHint`、`detectShpProjectionFromPrj` |
| `composables/useLayerDataImport.js` | 2D/OL 导入主管线（约 1533 行）：矢量要素创建、栅格图层渲染、自动定位 |
| `composables/useGisLoader.ts` | 2D 管线的分发桥接层：文件夹/ZIP 递归扫描、SHP 分组、调用 `dispatchGisData` |
| `components/Cesium/composables/useCesiumDataImport.js` | 3D/Cesium 导入主管线（约 1187 行）：DataSource 加载、3D Tiles blob URL 方案、GLTF 坐标提取 |
| `components/Cesium/CesiumContainer.vue` | 3D 场景容器：拖拽事件监听（`@drop.prevent="onDrop"`）→ 调用 `loadDataFile` |

## 3. 格式支持矩阵

| 格式 | 2D（OpenLayers） | 3D（Cesium） | 说明 |
|------|:---:|:---:|------|
| GeoJSON / JSON | ✓ | ✓ | 2D 通过 `ol/format/GeoJSON` 读取；3D 通过 `GeoJsonDataSource.load()` |
| KML | ✓ | ✓ | 2D 通过 `ol/format/KML`；3D 通过 `KmlDataSource.load(blobUrl)` |
| KMZ | ✓ | ✓ | 2D 走 ZIP 解包管线；3D 优先 `KmlDataSource` 原生支持，失败回退手动解压 |
| Shapefile | ✓ | ✓ | 统一经 `parseShpPartsToGeoJSON` → EPSG:4326 GeoJSON → 各引擎加载 |
| GeoTIFF | ✓ | — | 2D 通过 `ol/source/GeoTIFF` + WebGLTileLayer；3D 不支持 |
| GLB / GLTF | — | ✓ | 3D 通过 `Model.fromGltfAsync`，支持坐标自动提取或用户手动输入 |
| CZML | — | ✓ | 3D 通过 `CzmlDataSource.load(blobUrl)` |
| 3D Tiles（ZIP/文件夹） | — | ✓ | 3D 通过 blob URL 重写方案 + `Cesium3DTileset.fromUrl()` |
| 文件夹批量导入 | ✓ | — | 2D 通过 `useGisLoader` 递归扫描并批量分发 |

## 4. 格式分发流程（dataDispatcher.js）

`dispatchGisData(input)` 是 2D 管线的统一入口，接收 `{ content, type, name }` 并返回标准化的 packet 结构：

```javascript
// 核心路由逻辑（简化）
const normalizedType = normalizeType(type, name);  // 按扩展名归一化
const topMagic = detectMagicType(content);          // 魔术字节检测（ZIP/TIFF/JSON/XML）

if (shouldDecompress) {
    // ZIP/KMZ → decompressBuffer → buildArchivePackets（批量）
} else if (normalizedType === 'kml') {
    // 单文件 KML → 解码 + 投影检测 → packet { kind: 'kml' }
} else if (normalizedType === 'geojson' || normalizedType === 'json') {
    // GeoJSON → 解析 + 投影检测 → packet { kind: 'geojson' }
} else if (normalizedType === 'tif' || normalizedType === 'tiff') {
    // TIFF → Blob URL → packet { kind: 'tiff' }
} else if (normalizedType === 'shp') {
    // 单独 .shp → 抛错提示用户按组上传
}
```

**归档批处理**（`buildArchivePackets`）：解压后通过 `classifyArchiveDatasets` 将 entries 分类为 KML/KMZ/SHP/TIFF/GeoJSON 五组，SHP 通过 `groupShpEntriesByBaseName` 按同名文件组配对（.shp + .dbf + .shx + .prj + .cpg），每组生成一个 packet。嵌套 KMZ 通过延迟注入的 `_dispatchGisData` 递归处理。

## 5. 2D 导入管线（useLayerDataImport.js）

### 5.1 主入口

`addUserDataLayer({ content, type, name, resources, file })` 是 2D 导入主入口：

1. **文件夹/ZIP/KMZ** → `gisInlet.dispatch()` 递归扫描 → `importDispatchedPackets()` 批量导入
2. **TIF/TIFF** → `createManagedRasterLayer()` 栅格处理
3. **GeoJSON/KML/SHP** → 矢量要素解析 + `createManagedVectorLayer()`

### 5.2 矢量导入

`importDispatchedPackets` 遍历每个 packet，按 `kind` 分发：

- **kml**：`parseKmlTextToFeatures()` → OL Feature 数组
- **geojson**：`new GeoJSON().readFeatures(data, { dataProjection, featureProjection: 'EPSG:3857' })`
- **shp**：`parseShpPartsToGeoJSON(parts)` → EPSG:4326 GeoJSON → `readFeatures` 转 EPSG:3857

每个矢量图层创建时自动：随机分配样式模板、提取标注字段（`pickFeatureLabelField`）、构建 TOC 条目、首个图层自动 `fit` 到数据范围。

### 5.3 栅格导入

`createManagedRasterLayer` 支持两种模式：

- **URL 模式**：`GeoTIFFSource` 直接从 URL 按需加载（Range Requests）
- **Blob 模式**：上传的 ArrayBuffer → Blob → `GeoTIFFSource`

有地理配准时使用 `WebGLTileLayer`（GPU 加速）；无配准时降级为 `ImageLayer`（CPU 渲染 PNG 叠加）。大文件（>50MB）走 Worker 解码路径（`loadTifInWorker`），多波段使用 WebGL 着色器渲染，单波段使用 CPU 拉伸。

### 5.4 自动定位

首个成功导入的图层触发 `map.getView().fit(extent, { padding: [50,50,50,50], maxZoom: 18, duration: 900 })`，范围通过 `projectExtentToMapView` 从源投影转换到视图投影。

## 6. 3D 导入管线（useCesiumDataImport.js）

### 6.1 主入口

`loadDataFile(file)` 按扩展名 switch 分发：

```javascript
switch (ext) {
    case 'geojson': case 'json':  // 含 tileset.json 检测
    case 'kml':                   // KmlDataSource.load(blobUrl)
    case 'kmz':                   // 优先原生，回退手动解压
    case 'shp':                   // parseShpPartsToGeoJSON → GeoJsonDataSource
    case 'glb': case 'gltf':     // Model.fromGltfAsync + 坐标提取
    case 'czml':                  // CzmlDataSource.load(blobUrl)
    case 'zip':                   // loadTilesetFromZip（3D Tiles）
}
```

### 6.2 拖拽导入

`CesiumContainer.vue` 监听 `@dragover.prevent` 和 `@drop.prevent`，拖入时显示视觉提示覆盖层，释放时遍历 `event.dataTransfer.files` 逐个调用 `loadDataFile(file)`。

### 6.3 自动定位

`flyToEntity(viewer, Cesium, entity, format)` 统一处理：

- **3D Tiles**：`viewer.flyTo(tileset, { offset: HeadingPitchRange(0, -30°, radius×2) })`
- **DataSource**（GeoJSON/KML/CZML/SHP）：`viewer.flyTo(dataSource, { duration: 2 })`
- **GLTF**：`camera.flyTo` 到模型坐标上方 500m

## 7. Shapefile 解析（shpParser.ts）

### 7.1 多策略解析

`parseShpPartsToGeoJSON(parts)` 采用**渐进降级**策略：

```javascript
// 按优先级尝试多种组合
const attempts = [
    'shp+dbf+shx',  // 完整三件套
    'shp+dbf',      // 无索引
    'shp+shx',      // 无属性
    'shp-only',     // 仅主文件
];
for (const attempt of attempts) {
    try { raw = await shp(attempt.input); break; }
    catch { failures.push(...); }
}
```

底层使用 `shpjs` 库解析。若 shpjs 未能成功解析 DBF，则启动自定义 `parseDbfBuffer` 解析器做属性增强（`enrichFeaturesWithDbfAttributes`），按索引将第 i 条 DBF 记录关联到第 i 个 feature。

### 7.2 头部校验

`inspectShpHeader` 验证文件签名（9994）、几何类型（支持 Point/Polyline/Polygon/MultiPoint 及其 Z/M 变体，共 13 种），并在头部声明长度与实际长度偏差 >32 字节时发出兼容警告。

### 7.3 编码处理

DBF 编码通过三级检测：CPG 文件内容 → DBF 头部 LDID 字节（0x4d→CP936, 0x7a→CP936 等）→ UTF-8/GBK 自动探测（`decodeMaybeText`）。

## 8. 坐标参考转换（crs-engine.ts）

### 8.1 投影识别

`resolveDatasetProjection({ prjText, kmlText, targetCrs })` 的识别链路：

1. **PRJ WKT 解析**：`registerWktProjection` 先尝试从 AUTHORITY 块提取 EPSG 代码，再按名称匹配（Gauss-Kruger → EPSG:2387-2390，UTM → EPSG:326xx），最后回退到 `proj4.defs(alias, wkt)` 动态注册。
2. **KML 文本检测**：扫描 `EPSG:3857` / `EPSG:4490` 关键字。
3. **默认值**：无 PRJ 时默认 EPSG:4326。

### 8.2 预注册坐标系

`ensureProjectionDefs()` 预注册中国常用坐标系：

| EPSG | 坐标系 |
|------|--------|
| 4326 | WGS84 地理坐标 |
| 4490 | CGCS2000 |
| 4610 | 西安80 |
| 4214 | 北京54 |
| 3857 | Web Mercator |
| 2387-2390 | CGCS2000 / 3度带高斯-克吕格（18/21/24/27 带） |
| 32649-32651 | UTM WGS84 北半球 49/50/51 带 |

### 8.3 重投影

`reprojectGeoJSON(geojson, sourceCrs, targetCrs)` 深拷贝后递归遍历所有坐标对，调用 `proj4(sourceCrs, targetCrs, [x, y])` 逐点转换，保留高程分量。转换后通过 `validateGeoJsonCoordinates` 校验结果合理性（经纬度范围、WebMercator 范围、(0,0) 异常检测）。

## 9. 3D Tiles Blob URL 加载方案

### 9.1 核心问题

3D Tiles 的 `tileset.json` 内部通过相对路径引用 tile 内容文件（如 `tiles/0.b3dm`）。浏览器中用户上传的 ZIP/文件夹没有可访问的 HTTP 路径，直接用 blob URL 加载 tileset.json 后，Cesium 无法解析这些相对引用。

### 9.2 解决方案

`loadTilesetFromFileMap(fileMap, sourceName)` 实现完整的 blob URL 重写管线：

```javascript
// Step 1: 所有文件 → blob URL 映射
for (const [relPath, blob] of Object.entries(fileMap)) {
    blobUrlMap[normalized] = URL.createObjectURL(blob);
}

// Step 2: 找出所有 tileset.json（含 root 字段的 JSON）
// Step 3: 递归重写 content.url → blob URL
rewriteTilesetContentUrls(json.root, tsDir, blobUrlMap);

// Step 4: 改写后的 JSON 重新序列化为新 blob URL
// Step 5: Cesium3DTileset.fromUrl(rewrittenBlobUrl)
```

### 9.3 content 1.0 / 1.1 兼容

`rewriteTilesetContentUrls` 必须处理两种 tileset 规范：

```javascript
const content = node.content;
if (content) {
    if (Array.isArray(content)) {
        // 3D Tiles 1.1 / 3DTILES_multiple_contents：content 是数组
        for (const contentItem of content) rewriteItem(contentItem);
    } else {
        // 3D Tiles 1.0：content 是单个对象
        rewriteItem(content);
    }
}
```

同时递归处理 `node.children` 和 `node.extensions` 中可能含有的 URL 引用。

### 9.4 路径解析

`resolveTilesetPath(baseDir, relativeUrl)` 将 tileset 内的相对引用规范化为 blobUrlMap 的键：

- 已是绝对 URL（blob/file/http）→ 不处理
- 以 `/` 开头 → **strip 前导斜杠**（ZIP 内路径无前导 `/`）
- 相对路径 → 与 baseDir 拼接后规范化（处理 `.` 和 `..`）

### 9.5 导入来源

- **ZIP 文件**：`loadTilesetFromZip` 用 JSZip 解压 → 构建 `{ relPath: Blob }` 映射
- **文件夹**：`importTilesetFromDirectory` 用 File System Access API（`showDirectoryPicker`）递归读取

## 10. GLTF 坐标提取

`extractGlbEmbeddedCoords(file)` 按优先级从模型元数据中提取地理坐标：

### 10.1 CESIUM_RTC 扩展

```javascript
if (json.extensionsUsed?.includes('CESIUM_RTC') && json.extensions?.CESIUM_RTC?.center) {
    const center = json.extensions.CESIUM_RTC.center; // [x, y, z] 地固坐标
    const cartesian = new Cesium.Cartesian3(center[0], center[1], center[2]);
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    return { lng: toDegrees(lon), lat: toDegrees(lat), height };
}
```

### 10.2 asset.extras 自定义属性

检查 `json.asset.extras` 中的 `longitude/lng`、`latitude/lat`、`height/altitude/alt` 字段。

### 10.3 node matrix 平移分量

检查首个 node 的 4×4 变换矩阵的平移列（`matrix[12], matrix[13], matrix[14]`），仅当值 >100000（看起来像地固坐标）时才视为地理坐标。

### 10.4 无坐标时的交互

若三种方式均未提取到坐标，将文件暂存到 `pendingGltfFile`，触发弹窗让用户手动输入经纬度 + 高度，确认后调用 `loadGltfWithUserCoords(coords)` 完成加载。

### 10.5 模型放置

`loadGltfWithCoords` 通过 ENU 局部坐标系放置模型：

```javascript
const center = Cesium.Cartesian3.fromDegrees(lng, lat, height);
const modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(
    center, new Cesium.HeadingPitchRoll(0, 0, 0),
    Cesium.Ellipsoid.WGS84, fixedFrameTransform,
);
const model = await Cesium.Model.fromGltfAsync({ url: blobUrl, modelMatrix });
```

## 11. GLB 二进制解析

`parseGlbJsonChunk(buffer)` 解析 GLB 容器格式：

```
| 12 字节头部 | JSON chunk (length + type + data) | 可选 BIN chunk |
| magic=glTF  | chunkType=JSON (0x4E4F534A)       |                |
```

从偏移 20 处读取 JSON chunk 数据并 `JSON.parse`，获取模型的 extensions、asset、nodes 等元数据。

## 12. 局限与升级方向

**已知 bug：**

1. **`loadKMZFallback` 字段名不一致**：`useCesiumDataImport.js` 的 KMZ 手动解压回退路径中，查找内部 KML 文件时使用 `entry.ext === 'kml'`，但 `decompressBuffer` 返回的 entry 对象字段名为 `extension`（非 `ext`）。同时使用 `entry.name` 做后缀匹配，而规范路径字段为 `entry.path`。当前因 `entry.name`（原始 ZIP 条目名）通常也含 `.kml` 后缀，第二个条件可兜底命中，但第一个条件永远为 false，属于潜在隐患。此外，`decompressBuffer` 返回的是包含 `.entries` 数组的对象，而 `loadKMZFallback` 直接对返回值调用 `.find()`，在回退路径触发时会抛出 TypeError。

**现有局限：**

1. **2D/3D 管线割裂**：两套管线各自维护格式路由和加载逻辑，新增格式需在两处分别实现。
2. **3D 管线无栅格支持**：Cesium 侧不处理 GeoTIFF，无法在 3D 场景中叠加栅格影像。
3. **Shapefile 编码猜测**：DBF 编码依赖 CPG/LDID/UTF-8 探测链，对无 CPG 且 LDID 为 0 的文件可能误判。
4. **3D Tiles 内存开销**：blob URL 方案将整个 ZIP 的所有文件同时驻留内存，超大 tileset（>1GB）可能导致浏览器 OOM。
5. **GLTF 坐标提取有限**：仅支持 CESIUM_RTC、asset.extras、首 node matrix 三种来源，不处理多 node 或 mesh primitive 级别的变换。

**升级方向：**

1. 统一 2D/3D 格式路由层，抽象为 `FormatAdapter` 接口，新格式只需实现一次解析 + 两端渲染适配。
2. 3D Tiles 引入流式加载（Service Worker 拦截 + 按需解压），避免全量 blob URL 驻留。
3. 增加 3D Tiles 1.1 的 `3DTILES_implicit_tiling` 支持（当前仅处理显式 content.url）。
4. Shapefile 解析引入 `iconv-lite` 完整编码表，替代当前有限的 LDID 映射。
5. GLTF 坐标提取支持 `EXT_meshopt_compression`、多 scene 及 node 层级递归搜索。
