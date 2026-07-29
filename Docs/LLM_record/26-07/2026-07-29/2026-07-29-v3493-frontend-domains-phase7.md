# 前端 domains 架构 Phase 7：Data Import / GIS IO 拆分

- **日期与时间**：2026-07-29 16:45
- **任务等级**：L2
- **版本**：V3.4.93

---

## 问题分析

- **核心症状**：数据解析、CRS 工具、Data Import composables 散落在 `utils/gis/parsers/`、`utils/`、`composables/dataImport/`、`composables/` 四个位置，既有跨引擎共享的通用解析器，又有 OL 专用的导入逻辑，边界模糊。
- **根本原因**：历史上以 OL 为默认上下文增长，数据导入相关代码自然堆叠在 `utils/` 和 `composables/` 下，未区分"通用解析"与"引擎适配器"。
- **受影响模块**：KML / SHP / TIF / DBF / GeoJSON 解析链路；OL 数据导入；Cesium KML 加载；坐标纠偏；`utils/io`、`utils/geo`、`api/map`、`api/geocoding`、`api/locationSearch`、`api/backend/location` 等消费方。

---

## 修改内容

1. `utils/coordTransform.js` → `domains/common/data-import/crs/coordTransform.js`
2. `utils/crsUtils.js` → `domains/common/data-import/crs/crsUtils.js`
3. `utils/gis/parsers/` 全部 7 个文件 → `domains/common/data-import/parsers/`
4. `composables/dataImport/` 全部 4 个文件 → `domains/common/data-import/`
5. `composables/useLayerDataImport.js` → `domains/ol/data-import/composables/useLayerDataImport.js`
6. 消费方 import 更新（约 14 个文件）改用 `@common/data-import/` alias
7. `domains/common/index.js` 新增 `data-import` barrel re-export

---

## 修改原因

- 通用解析器（KML/SHP/TIF/DBF）同时服务 OL 和 Cesium，归 `common/data-import/parsers/` 符合跨引擎共享原则。
- `coordTransform.js` / `crsUtils.js` 是纯 CRS 工具，无引擎依赖，归 `common/data-import/crs/`。
- `useLayerDataImport.js` 使用 OL 格式类（`ol/format/GeoJSON`、`ol/layer/WebGLTile`），是 OL 专用导入逻辑，归 `ol/data-import/composables/`。
- `composables/dataImport/`（index.js、vectorUtils.js、rasterUtils.js、webglRasterRenderer.js）被 OL 和 Cesium 共用，归 `common/data-import/`。

---

## 影响范围

- **数据导入链路**：GeoJSON / KML / SHP / TIF / DBF 文件上传 → 解析 → 渲染
- **坐标纠偏链路**：GCJ-02 ↔ WGS84 双向转换
- **反向地理编码**：`api/geocoding.js`、`api/locationSearch.js`、`api/backend/location.js`
- **用户定位**：`composables/useUserLocation.js`
- **行政区划服务**：`services/DistrictManager.ts`
- **地图容器**：`domains/ol/components/MapContainer.vue`、根 `components/Map/MapContainer.vue`

---

## 方案对比

| 方案 | 优点 | 缺点 |
|---|---|---|
| **A：全部进 common**（✅ 选用） | 解析器通用；引擎边界清晰 | OL 导入需通过 alias 引用 common |
| B：按引擎拆分到 ol/cesium | 领域内聚 | 解析器重复；修 bug 需改两处 |
| C：保留在 utils/gis | 零迁移成本 | 继续模糊边界；不符合 Refactor.md |

---

## 实施步骤

1. 迁移文件到目标目录
2. 更新迁移文件内部相对路径（`../` 层级调整）
3. 更新消费方 import 路径（alias 化）
4. 运行 `npm run build` 验证
5. 修复 linter 引入的路径错误（`useGisLoader`、`useMessage` 路径过浅）
6. 版本号 +1、CHANGELOG、结构树同步
7. 运行门禁脚本

---

## 性能指标

- 未实测（本次为路径迁移，不涉及算法变更）

---

## 测试方案

### Agent 已执行

- `npm run build` — ✅ 通过（24.47s，无错误）
- `tsc --noEmit` — 未单独执行（build 流程已覆盖）

### 待用户实机验证

1. 上传 KML 文件 → 应正常解析并渲染图层
2. 上传 SHP 文件（含 zip 压缩包）→ 应正常解析并渲染图层
3. 上传 TIF 栅格文件 → 应正常解析并渲染图层
4. 上传 GeoJSON → 应正常解析并渲染图层
5. 反向地理编码搜索 → 应返回正确坐标
6. 用户定位 → 应正确纠偏到 WGS84

---

## 变更文件清单

| 路径 | 说明 |
|---|---|
| `domains/common/data-import/crs/coordTransform.js` | 从 `utils/coordTransform.js` 迁移 |
| `domains/common/data-import/crs/crsUtils.js` | 从 `utils/crsUtils.js` 迁移 |
| `domains/common/data-import/parsers/amapAoiParser.js` | 从 `utils/gis/parsers/amapAoiParser.js` 迁移 |
| `domains/common/data-import/parsers/universalAmapParser.js` | 从 `utils/gis/parsers/universalAmapParser.js` 迁移 |
| `domains/common/data-import/parsers/kmlParser.ts` | 从 `utils/gis/parsers/kmlParser.ts` 迁移 |
| `domains/common/data-import/parsers/kmlStyleParser.js` | 从 `utils/gis/parsers/kmlStyleParser.js` 迁移 |
| `domains/common/data-import/parsers/shpParser.ts` | 从 `utils/gis/parsers/shpParser.ts` 迁移 |
| `domains/common/data-import/parsers/dbfParser.ts` | 从 `utils/gis/parsers/dbfParser.ts` 迁移 |
| `domains/common/data-import/parsers/tifLoader.ts` | 从 `utils/gis/parsers/tifLoader.ts` 迁移 |
| `domains/common/data-import/index.js` | 从 `composables/dataImport/index.js` 迁移 |
| `domains/common/data-import/vectorUtils.js` | 从 `composables/dataImport/vectorUtils.js` 迁移 |
| `domains/common/data-import/rasterUtils.js` | 从 `composables/dataImport/rasterUtils.js` 迁移 |
| `domains/common/data-import/webglRasterRenderer.js` | 从 `composables/dataImport/webglRasterRenderer.js` 迁移 |
| `domains/ol/data-import/composables/useLayerDataImport.js` | 从 `composables/useLayerDataImport.js` 迁移 |
| `domains/common/index.js` | 新增 data-import barrel |
| `utils/geo/index.js` | import 路径更新 |
| `utils/gis/crsAware.js` | import 路径更新 |
| `utils/io/index.js` | import 路径更新 |
| `composables/map/features/useDeferredUserLayerApis.js` | import 路径更新 |
| `api/map.js` | import 路径更新 |
| `api/backend/location.js` | import 路径更新 |
| `api/geocoding.js` | import 路径更新 |
| `api/locationSearch.js` | import 路径更新 |
| `composables/useUserLocation.js` | import 路径更新 |
| `services/DistrictManager.ts` | import 路径更新 |
| `components/Map/MapContainer.vue` | import 路径更新 |
| `domains/ol/components/MapContainer.vue` | import 路径更新 |
| `domains/cesium/composables/dataImport/loaders/kmlLoader.js` | import 路径更新 |

---

## 遗留与风险

- **旧路径保留**：`utils/coordTransform.js`、`utils/crsUtils.js`、`utils/gis/parsers/`、`composables/dataImport/` — 为兼容未迁移的消费方暂保留，Phase 9 清理。
- **linter 路径回退**：linter 偶尔将 alias 路径改回相对路径，需人工复核关键文件。
- **Worker 路径**：`tifLoader.ts` 内部 worker 引用路径待后续验证。
