# 2026-08-25 严重修复：在线服务进入 TOC 后要素查询能力保持

## 日期和时间

2026-08-25 13:30

## 修改内容

修复"原本支持要素查询的服务，进入 TOC「在线服务」分组后无法再查询"的严重问题。根因有二：

1. **WMS Capabilities 解析缺失 queryable 提取**：`parseCapabilitiesXml` 未读取 Layer 节点的 `queryable="1"` 属性 → 所有 WMS 记录注册时 `queryable=false` → 点选候选收集永远跳过它们；
2. **标准 WMS 的 GetFeatureInfo 查询完全未实现**：identify 链路仅覆盖 ArcGIS REST（`identifyArcgisFeatures`）。

## 修改内容明细

1. `wmsService.js parseCapabilitiesXml`：提取 `queryable="1"` 声明并写入返回元信息；
2. `wmsService.js` 新增 `identifyWmsGetFeatureInfo(record, lonLat, view)`：构造标准 GetFeatureInfo 请求（版本自适应 X/Y 与 I/J、CRS/SRS 自适应、QUERY_LAYERS 取勾选组合、application/json 解析），与 `identifyArcgisFeatures` 返回结构完全对齐；
3. `useLayerControlHandlers.js collectIdentifyCandidates/handleMapIdentify`：候选收集纳入 `kind==='wms' && visible && queryable` 记录；分发按 kind 路由（arcgis→identify API / wms→GetFeatureInfo），GetFeatureInfo 所需的 BBOX 按服务投影重投影、点击位置用视口像素坐标。

## 影响范围

* frontend/src/domains/common/basemap/wmsService.js（queryable 提取 + 新增 identifyWmsGetFeatureInfo）
* frontend/src/domains/ol/layer/composables/useLayerControlHandlers.js（候选收集与分发）

## 测试方案

1. 加载一个声明 `queryable="1"` 的 WMS 服务（如 GeoServer topp:states）→ 注册表记录 queryable=true → 地图单击要素弹出属性；
2. TOC 中隐藏该服务后再点击 → 不发起 GetFeatureInfo；
3. 回归：ArcGIS 服务点选查询行为不变。

## 修改的文件路径

见上方影响范围。
