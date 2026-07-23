# 修复数据导入：GeoJSON/SHP 解析、GLTF 自动定位 + 位置调整

* **日期和时间**：2026-07-23 22:30
* **修改内容**：
  1. **GeoJSON/SHP 解析修复**：`GeoJsonDataSource.load()` 改传解析后的 JSON 对象而非 blob URL，避免部分 Cesium 版本中 blob URL 加载失败的问题。
  2. **SHP 配套文件分组**：新增 `loadDataFiles(files)` 函数，自动按 basename 将 `.shp` + `.dbf`/`.shx`/`.prj` 归组后合并加载，修复多文件选择时 SHP 因缺少 sidecar 文件解析失败的问题。
  3. **GLTF 自动定位**：无嵌入坐标时，自动拾取相机视野中心 + 地形高度采样（通过 `getAutoPlaceCoords`），不再强制弹窗；定位失败时才回退到弹窗。
  4. **GLTF 位置调整**：已加载模型可通过数据源行的定位按钮（MapPin 图标）重新打开坐标弹窗修改位置。
* **修改原因**：
  * GeoJSON/SHP 使用 blob URL 传给 `GeoJsonDataSource.load()` 在某些环境下（CORS/Content-Type 限制）加载失败，导致无法显示。
  * SHP 文件必需 .dbf 等配套文件才能解析属性，原 `loadDataFile` 逐个文件处理导致 sidecar 缺失。
  * GLTF 无嵌入坐标时弹窗要求手动输入，用户体验差；自动放相机中心 + 采样地面高度更合理。
  * 用户需要能在自动放置后微调模型位置。
* **影响范围**：数据导入模块（`useCesiumDataImport.js`）、坐标输入弹窗（`CesiumDataImportDialog.vue`）、控制台面板（`CesiumToolPanel.vue`）、容器组件（`CesiumContainer.vue`）。
* **优化解决方案**：
  * `loadGeoJSON` / `loadSHP` → 读文件解析为 JS 对象后直传 `GeoJsonDataSource.load(obj)`，移除 blob URL 中间步骤。
  * `loadDataFiles` → 遍历文件列表，将 `.shp`/`.dbf`/`.shx`/`.prj` 按 basename 分组，SHP 组调用 `loadSHP(shp, sidecars)`，其余文件逐个调用 `loadDataFile`。
  * `getAutoPlaceCoords` → 屏幕中心 raycast/ellipsoid pick → 地形采样（优先 `heightSampler.sampleHeight`，降级 `Cesium.sampleTerrain`）→ 返回 `{lng, lat, height}`。
  * `startGltfReposition` / `confirmGltfReposition` → 保存原模型记录的 `position` 字段；reposition 时销毁旧模型、在新坐标重建。
  * 对话框新增 `initialCoords` 和 `mode` prop，区分"首次导入"和"调整位置"两种模式。
* **测试方案**：
  1. 导入 `.geojson` 文件，确认显示在地图正确位置。
  2. 同时选择 `.shp` + `.dbf` + `.shx` + `.prj` 文件导入，确认属性要素正确显示。
  3. 导入无嵌入坐标的 `.glb` 文件，确认自动放置在相机视野中心地面。
  4. 点击 GLTF 数据源的定位按钮（地图图标），确认弹窗显示当前坐标，修改后模型移到新位置。
* **修改的文件路径**：
  * `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\composables\useCesiumDataImport.js`
  * `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\CesiumDataImportDialog.vue`
  * `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\CesiumToolPanel.vue`
  * `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\CesiumContainer.vue`
