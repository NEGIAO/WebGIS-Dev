# 修复数据源移除功能：Vue 响应式代理导致 Cesium 移除静默失败

* **日期和时间**：2026-07-23 21:00
* **修改内容**：修复 `removeDataSource`、`clearAllDataSources`、`flyToDataSource` 中因 Vue 3 响应式代理（Proxy）导致 Cesium API 无法识别传入对象的引用匹配问题，同时补充 `gltf` 类型走 `primitives.remove` 的正确分支。
* **修改原因**：
  * 数据源移除按钮点击后，UI 列表正常消失（`loadedDataSources` 数组已过滤），但 Cesium 场景中的数据仍然存在，等于移除功能完全无效。
  * 根本原因：`loadedDataSources` 是 `ref([])`，Vue 3 将其内部对象深层次包裹为 reactive Proxy。`record.entity` 读取时返回的是 Proxy，而非原始 Cesium 对象引用。
  * Cesium 的 `DataSourceCollection.remove()` 和 `PrimitiveCollection.remove()` 内部使用 `indexOf`（`===` 引用恒等）查找对象，Proxy !== 原始对象 → 移除静默失败。
  * 此外，`gltf` 类型的 entity（`Cesium.Model`）存储在 `viewer.scene.primitives` 中，但 `removeDataSource` 原代码只判断了 `type === '3dtiles'` 走 `primitives.remove`，`gltf` 落到了 `else` 分支的 `dataSources.remove`，进一步导致移除失败。
* **影响范围**：数据导入模块（`useCesiumDataImport.js`），涉及移除单个数据源、清除全部数据源、定位到数据源三个功能。
* **优化解决方案**：
  1. 在 `removeDataSource`、`clearAllDataSources`、`flyToDataSource` 中从 `record` 读取 `entity` 时，使用 `toRaw()` 解包 Vue reactive Proxy，确保传给 Cesium API 的是原始对象引用。
  2. 将 `removeDataSource` 和 `clearAllDataSources` 的类型分支条件从 `type === '3dtiles'` 扩展为 `type === '3dtiles' || type === 'gltf'`，使 Model 也能正确走 `primitives.remove`。
* **测试方案**：
  1. 导入任意格式数据（GeoJSON / 3D Tiles / GLTF 等），点击数据源行右侧的 × 移除按钮，确认场景中对应数据消失。
  2. 导入多种格式后点击"全部清除"，确认场景清空。
  3. 定位功能正常（已用 `toRaw` 解包）。
* **修改的文件路径**：
  * `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\composables\useCesiumDataImport.js`（第 12 行：增加 `toRaw` 导入；第 1092-1103 行、1134-1143 行、1220 行：修复三处 `record.entity` 引用）
