# 高德 AOI JSON 解析属性提取修复

**日期和时间**：2026-07-01 15:20

## 事件逻辑链条分析

### 核心症状
用户在「高德 AOI 数据注入」弹窗中点击【解析绘制】后，AOI 面能正常落图，但要素属性表里只能看到 `名称 / POI_ID / 来源` 三个字段。高德 `v5/aoi/polyline` 接口返回的业务属性（`type`、`typecode`、`pname`、`cityname`、`adname`、`address`、`pcode`、`adcode`、`citycode`、`geotype` 等）全部丢失，无法在 TOC 属性表中查看。

### 根本原因
1. `drawAmapAoiByDetailJsonInput`（`useMapSearchAndCoordinateInput.js`）调用的是 `universalAmapParser`，其返回结构只含 `poiid / name / ringsGcj02 / ringsWgs84 / source`，**不含 base 属性节点**，因此下游无属性可写。
2. 即使改用 `parseAmapAoiPayload`（返回 `base` 属性），其属性/边界提取函数 `extractAoiShape / extractBaseNode / extractPoiId / extractPoiName` 只覆盖了「详情接口」结构（`data.spec.mining_shape`、`pois[0]`），**未覆盖 AOI 边界接口的 `aois[0]` 结构**。而用户粘贴的正是 `aois[0].polyline` + `aois[0]` 下挂的那批属性，导致 base 节点取空。

### 受影响模块
- 前端 AOI 注入链路（`useMapSearchAndCoordinateInput.js`）
- 高德解析器（`amapAoiParser.js`）
- TOC 属性表展示（间接受益）

## 优化解决方案

### 实施步骤
1. **切换解析器**：`drawAmapAoiByDetailJsonInput` 由 `universalAmapParser` 改为 `parseAmapAoiPayload`，拿到完整 `base` 属性节点，并将其展开合入要素属性：
   ```js
   const baseProperties = detail.base || {};
   const aoiFeature = new Feature({
       geometry: new Polygon(mapRings),
       名称: layerName,
       POI_ID: poiid,
       来源: detail.source,
       ...baseProperties,
   });
   ```
   同时移除已不再使用的 `universalAmapParser` import。

2. **扩展解析器兼容 `aois[0]` 结构**（`amapAoiParser.js`）：
   - `extractAoiShape`：追加 `data.aois[0].polyline`、`data.aois[0].shape` 分支。
   - `extractBaseNode`：追加 `data.aois[0]` 分支，使 `type/typecode/pname/...` 等属性被纳入 base。
   - `extractPoiId`：追加 `data.aois[0].id` 分支。
   - `extractPoiName`：追加 `data.aois[0].name` 分支。

   `normalizeBaseProperties` 会将 base 下的所有标量/对象属性统一序列化写入，故上述新增分支一旦命中，全部业务字段即可进入属性表。

## 测试方案
- **环境**：前端本地 `npm run build`（Vite 生产构建）。
- **步骤**：
  1. 执行 `npm run build`，确认无编译错误。
  2. 运行时在弹窗中粘贴含 `aois[0].polyline` + `type/typecode/pname/...` 的高德 AOI JSON，点击【解析绘制】。
  3. 打开该 AOI 图层属性表，核对 `type/typecode/pname/cityname/adname/address/pcode/adcode/citycode/geotype` 是否齐全。
- **预期**：AOI 正常落图，属性表包含全部业务字段。
- **实际**：`npm run build` 通过（✓ built in 30.48s），无报错。

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\useMapSearchAndCoordinateInput.js`
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\utils\gis\parsers\amapAoiParser.js`
