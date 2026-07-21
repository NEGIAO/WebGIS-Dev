# 路径规划（驾车 / 公交）架构说明

日期：2026-07-21

适用范围：`frontend/src/components/Routing/` 面板模块，及其依赖的 `frontend/src/api/locationSearch.js`、`frontend/src/utils/driveXmlParser.ts`、`frontend/src/utils/transitRouteBuilder.js`、`frontend/src/composables/map/features/useRouteRendering.js`。

本文是长期参考文档，说明 WebGIS 3.0 中"路径规划"功能的管线划分、天地图 API 调用、XML/JSON 解析、选点交互、路线渲染与 token/请求取消机制，供后续维护、排错与功能扩展时对照。

## 1. 功能定位

本功能在侧边工具箱中提供两种出行方式的路径规划：

- **驾车规划**（含步行策略）：调用天地图 `drive` 接口，返回 **XML**，由独立解析器提取整线坐标与分段引导信息。
- **公交规划**：调用天地图 `transit` 接口，返回 **JSON**，由面板内联逻辑归一化为候选方案与换乘分段。

起终点既可在主地图上点选，也可通过集成的**天地图地名/POI 搜索**输入关键词选择。规划结果以 OpenLayers 矢量要素绘制到地图，并支持点击步骤定位、悬停预览。

**重要边界**：本功能是天地图在线路径服务的**前端编排与可视化层**，不在本地做路网求解。路径质量、可达性、实时路况均取决于天地图后端；前端只负责拼参、请求、解析、渲染与交互。坐标全程遵循 **WGS-84**（天地图 drive/transit/search 接口均直接返回 WGS-84，无需坐标转换）。

## 2. 文件结构

| 文件 | 职责 |
|------|------|
| `components/Routing/DrivingPlannerPanel.vue` | 驾车面板 + 编排层：起终点状态、策略选择、调用 drive API、调用 XML 解析器、结果展示与步骤交互；内含 `TokenMissingError` |
| `components/Routing/BusPlannerPanel.vue` | 公交面板 + 编排层：起终点状态、策略选择、调用 transit API、JSON 归一化（`extractLinesFromTransitResponse` / `normalizeTransitResults`）、候选方案与分段步骤展示 |
| `components/Routing/MapPointPickerCard.vue` | 起终点选点卡片：地图点选按钮 + 关键词搜索下拉（防抖 + `AbortController`），驾车/公交两套主题 |
| `api/locationSearch.js` | 地名/POI 搜索模块：`fetchLocationResultsByService` 统一入口，`searchWithTianditu` 调天地图 `v2/search`；声明 WGS-84 坐标契约，透传 `signal` |
| `utils/driveXmlParser.ts` | 驾车 XML 解析：`parseDriveRouteXml` 提取起终点、总览、分段与整线坐标串 |
| `utils/transitRouteBuilder.js` | 路线渲染数据构建：`buildBusRouteRenderData` / `buildDriveRouteRenderData` / `buildRouteRenderData` 生成 OpenLayers 要素，`fitExtentToCoverage` 视口适配 |
| `composables/map/features/useRouteRendering.js` | 路线绘制功能库：`createRouteRenderingFeature` 工厂返回 `drawRouteOnMap`（公交）/ `drawDriveRouteOnMap`（驾车）/ `syncRouteManagedLayer` |

集成位置：`components/Shell/SidePanel.vue` 在 `activeTab === 'bus'` / `'drive'` 时分别挂载两个面板，并下发 `tiandituToken` 与一组地图回调；`components/Map/MapContainer.vue` 通过 `createRouteRenderingFeature` 创建绘制函数，并以 `ensureRouteBuilderApi` **动态导入** `transitRouteBuilder.js`（按需加载）。

## 3. 两条管线总览

驾车与公交共享同一套选点卡片与同一套渲染落地逻辑，但**请求—解析**两段完全独立：

```
                       ┌─ 地图点选 (startMapPointPick / startBusPointPick)
起终点输入 ────────────┤
                       └─ 关键词搜索 (MapPointPickerCard → locationSearch.searchWithTianditu)

驾车管线: DrivingPlannerPanel.startDriveSearch
   → fetch drive?type=search (XML)
   → parseDriveRouteXml (DOMParser)
   → routeResult { distanceKm, durationText, routelatlon, steps[] }
   → drawDriveRouteOnMap → buildDriveRouteRenderData → OpenLayers

公交管线: BusPlannerPanel.startTransitPlan
   → fetch transit?type=busplan (JSON)
   → extractLinesFromTransitResponse → normalizeTransitResults
   → routes[] (候选方案，各含 segments / steps)
   → drawRouteOnMap → buildBusRouteRenderData → OpenLayers
```

两个面板都通过 props 接收地图回调（绘制、缩放、预览、清除预览、选点），自身不持有地图实例，做到 UI 编排与地图渲染解耦。

## 4. 选点交互

`MapPointPickerCard.vue` 是驾车/公交共用的起终点输入卡片，提供两条输入路径：

### 4.1 地图点选

点击"设置起点/终点"按钮触发 `pick-start` / `pick-end` 事件，面板调用父级注入的 `startMapPointPick` / `startBusPointPick`（实际由 `MapContainer` 提供，在主地图上捕获单击坐标），返回 `{ lng, lat }`。面板随后调用 `locationToAddress` 做逆地理编码回填地址文本（失败则置空，不阻断主流程）。

### 4.2 关键词搜索（天地图）

输入框 `@input` 触发 `onStartSearchInput` / `onEndSearchInput`：

1. `clearTimeout` 重置 **400ms 防抖**定时器；
2. 立即 `startAbort.abort()` 中断仍在飞行的上一次请求；
3. 新建 `AbortController`，延时后调用 `doStartSearch` / `doEndSearch`。

`doStartSearch` 调用 `fetchLocationResultsByService({ service: 'tianditu', keywords, page: 1, pageSize: 10, tiandituTk, signal })`，将结果填入下拉列表；捕获到 `AbortError` 时静默返回（避免乱序覆盖）。下拉支持 ↑/↓ 键高亮、Enter 选中、`mousedown` 选中，选中后 `emit('select-start-result', { lng: item.lon, lat: item.lat, address: item.display_name })`。

`locationSearch.js` 的 `searchWithTianditu` 拼装天地图 `v2/search` 请求：

```
https://api.tianditu.gov.cn/v2/search?postStr=<encoded JSON>&type=query&tk=<token>
postStr: { keyWord, level: 12, mapBound, queryType: 1, start, count }
```

未传 `mapBound` 时回退到中国大约范围 `73.5,18.2,135.0,53.5`。响应经 `parseTiandituResponse` 兼容多种结构（`area` / `areas` / `pois` / `queryResults.results` / `results` / `data` / 顶层数组），`normalizeTiandituItem` 统一为 `{ display_name, lon, lat, original }`。模块头部注释明确**坐标契约**：天地图与 Nominatim 直接返回 WGS-84，高德 POI 的 GCJ-02 会经 `gcj02ToWgs84` 转换，上层始终拿到 WGS-84。

## 5. 驾车管线（drive API + XML）

`DrivingPlannerPanel.vue` 的 `startDriveSearch` 是驾车编排核心：

1. **校验**：`parseCoord` + `isValidLngLat` 检查起终点经纬度合法（经度 ±180、纬度 ±90）。
2. **token 检查**：`token` 为空时 `throw new TokenMissingError()`（见 §8）。
3. **拼参请求**：

   ```
   postObj = { orig: `${oLng},${oLat}`, dest: `${dLng},${dLat}`, style: routeStyle }
   https://api.tianditu.gov.cn/drive?tk=<token>&type=search&postStr=<encoded JSON>
   ```

   `routeStyle` 取值：`0` 最快路线、`1` 最短路线、`2` 避开高速、`3` 步行。
4. **解析 XML**：`response.text()` 取 XML 字符串，交 `parseDriveRouteXml`。
5. **组装结果**：把 `parsed.segments` 映射为 `steps[{ text: seg.guide, linePoint: seg.streetLatLon }]`（过滤空引导文本），并回填 `distanceKm`、`durationText`、`routelatlon`。若 XML 的 `parameters` 带回起终点坐标，还会回填输入框便于核对。
6. **渲染**：调用 `props.drawDriveRouteOnMap({ routeLatLonStr: parsed.routeLatLon, stepLinePoints: steps.map(s => s.linePoint) })`。

### 5.1 XML 解析（driveXmlParser.ts）

`parseDriveRouteXml` 用 `DOMParser` 解析，检测 `parsererror` 节点，失败抛错。提取：

- `origText` / `destText`：`parameters` 节点下 `orig` / `dest`，回退到根属性；
- `distanceKm`：`distance` 标签；`durationSec`：`duration` 标签；`durationText` 由 `toMinuteText` 格式化为"X分钟"；
- `routeLatLon`：`routelatlon` 标签（整线坐标串）；
- `segments`：`simple` 节点下各 `item` 的 `strguide`（引导文本）、`streetDistance`（分段距离）、`streetLatLon`（分段坐标串），组成 `DriveSegment[]`。

### 5.2 步骤交互

结果列表点击步骤触发 `handleSelectDriveStep`：先 `drawDriveRouteOnMap` 重绘整线 + 各分段（保留步骤索引与分段索引一一对应，不过滤空项），再 `zoomToDriveRouteStep(stepIndex)` 定位；`mouseenter` / `mouseleave` 触发 `previewDriveRouteStep` / `clearDriveRouteStepPreview` 做高亮预览（预览失败被吞掉，不影响主流程）。步骤左侧色条由 `DRIVE_STEP_COLOR_PALETTE` 循环取色。

## 6. 公交管线（transit API + JSON）

`BusPlannerPanel.vue` 的 `startTransitPlan` 是公交编排核心：

1. **校验**：起终点均需已设置。
2. **token 检查**：为空时抛带引导文案的 `Error`（公交面板未单独定义 `TokenMissingError`，直接 `throw new Error(...)`）。
3. **拼参请求**：

   ```
   postObj = { startposition: `${lng},${lat}`, endposition: `${lng},${lat}`, linetype }
   https://api.tianditu.gov.cn/transit?tk=<token>&type=busplan&postStr=<encoded JSON>
   ```

   `linetype` 取值：`1` 较快捷、`2` 少换乘、`3` 少步行、`4` 不乘地铁。
4. **解析 JSON**：`response.json()` 得 `TransitResponse`。
5. **归一化**：`extractLinesFromTransitResponse` 把 `results[].lines[]` 摊平为 `TransitLine[]`；`normalizeTransitResults` 逐方案累加分段时长/距离、生成分段步骤 `StepInfo[]`，输出 `RouteCandidate[]`。
6. **渲染**：默认选中第 0 个方案并 `drawRouteOnMap(normalized[0])`。

### 6.1 JSON 归一化细节

每个 `TransitSegment` 含 `segmentType`（`1` 步行，其余公交）、`stationStart` / `stationEnd`（`{ name, lonlat }`）、`segmentLine[]`（`{ linePoint, lineName, segmentTime, segmentDistance }`）。归一化时：

- `parseSegmentMetrics` 取分段首条 `segmentLine` 的 `segmentTime` / `segmentDistance` 作为该段指标；
- `resolveStationName` 在站名为空时按位置回退为"起点 / 终点 / 途经点"；
- `getSegmentDisplayName` 取线路名，步行段无名时显示"步行"，公交段无名时显示"公交段 N"；
- 每段输出 `modeText`（步行/公交）、`time`（分钟）、`distanceKm`（米 ÷ 1000，保留两位）。

### 6.2 方案与步骤交互

左侧列候选方案（`route.lineName` / 时长 / 里程），点击 `handleSelectRoute` 重绘该方案；右侧列所选方案的分段步骤，点击 `handleSelectStep` 先 `drawRouteOnMap` 再 `zoomToBusRouteStep(stepIndex)`，悬停触发 `previewBusRouteStep` / `clearBusRouteStepPreview`。

## 7. 路线渲染（OpenLayers）

渲染分两层：**数据构建**（`transitRouteBuilder.js`）与**地图落地**（`useRouteRendering.js`）。

### 7.1 数据构建（transitRouteBuilder.js）

- `buildBusRouteRenderData(route)`：遍历 `segments`，用 `parseTransitLinePoint` 把 `linePoint` 字符串（支持 `;`、`；`、`|` 分隔及正则回退）解析为坐标数组并 `fromLonLat` 投影，生成 `LineString` 线要素；站点用 `addOrMergeMarker` 按坐标去重合并（同坐标多角色合并为 `segment-both`），生成 `Point` 站标要素；同时累计 `fitExtent`。
- `buildDriveRouteRenderData(routeInput)`：兼容字符串或对象入参（读 `routeInput?.routeLatLonStr`），生成整线要素（`stepIndex: -1`）与可选的逐步分段要素（`stepIndex: N`），供步骤点击定位。
- `buildRouteRenderData(mode, input)`：按 `'bus'` / `'drive'` 分派。
- `fitExtentToCoverage(map, extent, opts)`：按目标屏幕覆盖率（`targetCoverage`）+ 缓冲（`bufferRatio` / `minBufferMeters` / `maxBufferMeters`）计算目标范围并 `view.fit`，缩放钳制在 `[minZoom, maxZoom]`。
- `normalizeLonLatPair` 会探测 lat/lon 顺序颠倒并自动交换，提升对异常响应的容错。

### 7.2 地图落地（useRouteRendering.js）

`createRouteRenderingFeature` 是工厂函数，注入地图实例、图层/数据源、托管图层记录等依赖后返回：

- `drawRouteOnMap(route)`（公交）：确保图层已加入地图 → `busRouteSource.clear()` 清旧线（保留起终点 marker）→ `ensureRouteBuilderApi()` 动态导入构建器 → `buildRouteRenderData('bus', route)` → `addFeatures` → `fitExtentToCoverage`（覆盖率 0.72）→ `syncRouteManagedLayer` 同步到托管图层（`type: 'bus_route'`）。
- `drawDriveRouteOnMap(routeLatLonStr)`（驾车）：流程同上，`buildRouteRenderData('drive', ...)`，托管图层 `type: 'drive_route'`。
- `syncRouteManagedLayer`：把路线图层登记/更新为用户托管图层记录并 `emitGraphicsOverview`。

`MapContainer.vue` 的 `ensureRouteBuilderApi` 用 `import('../../utils/transitRouteBuilder')` 做**按需动态导入**并缓存 Promise，避免首屏加载路线构建代码。

## 8. Token 与请求取消

### 8.1 天地图 Token

token 由 `SidePanel.vue` 以 `tiandituToken` 下发给两个面板与选点卡片。缺失时各处处理略有差异：

- **驾车面板**：定义专门的 `TokenMissingError extends Error`（`name = 'TokenMissingError'`），`startDriveSearch` 中 token 为空即抛出，catch 分支识别后给出"请在「设置」→「API 密钥管理」中添加 tianditu_tk"的引导文案。
- **公交面板**：直接 `throw new Error('天地图 Token 未配置...')`，文案与驾车一致但未走专用错误类型。
- **搜索模块**：`searchWithTianditu` 在 `!tiandituTk` 时抛 `Error('天地图 Token 未配置')`，并在 catch 中识别 `Token` 关键字弹出提示。

### 8.2 请求取消（AbortController）

`AbortController` 仅用于**地名搜索**场景：`MapPointPickerCard` 起点/终点各持有一个 `AbortController`（`startAbort` / `endAbort`），新输入时先 `abort()` 旧请求再发起新请求，`signal` 经 `fetchLocationResultsByService` 透传给 `fetch`，`AbortError` 被静默忽略。这避免了快速输入时旧响应乱序覆盖新结果。

驾车 `drive` 与公交 `transit` 的规划请求本身**未接入 AbortController**——它们是一次性"开始导航/规划"动作，靠 `isLoading` / `planning` 状态禁用按钮防止重复提交。

### 8.3 网络错误兜底

两个面板的 catch 都用 `/failed\s+to\s+fetch/i` 识别真正的网络层失败（CORS / Mixed Content），给出"确认 https 部署、token 已绑定域名、控制台无 CORS 报错"的排查清单；其余错误（XML 解析、坐标处理、地图渲染）原样透出消息并 `console.error`。

## 9. 驾车 vs 公交对比

| 维度 | 驾车（DrivingPlannerPanel） | 公交（BusPlannerPanel） |
|------|----------------------------|------------------------|
| 天地图接口 | `drive?type=search` | `transit?type=busplan` |
| 响应格式 | XML（`DOMParser` 解析） | JSON（`response.json()`） |
| 解析器 | `parseDriveRouteXml`（独立 ts 模块） | 面板内联 `extractLinesFromTransitResponse` + `normalizeTransitResults` |
| 请求参数 | `orig` / `dest` / `style` | `startposition` / `endposition` / `linetype` |
| 策略取值 | 0 最快 / 1 最短 / 2 避开高速 / 3 步行 | 1 较快捷 / 2 少换乘 / 3 少步行 / 4 不乘地铁 |
| 结果形态 | 单一路线 + 分段步骤 | 多候选方案，每方案含换乘分段 |
| 渲染构建 | `buildDriveRouteRenderData`（整线 + 逐步分段） | `buildBusRouteRenderData`（分段线 + 去重站标） |
| 绘制函数 | `drawDriveRouteOnMap` | `drawRouteOnMap` |
| token 缺失 | 专用 `TokenMissingError` | 普通 `Error`（文案相同） |
| 主题色 | 蓝（`theme="drive"`） | 绿（`theme="bus"`） |

## 10. 坐标约定

全链路统一 **WGS-84**：

- 天地图 `drive` / `transit` / `v2/search` 接口直接返回 WGS-84，前端不做坐标转换；
- `locationSearch.js` 头部注释固化契约：仅高德 POI 的 GCJ-02 需 `gcj02ToWgs84` 转换，天地图/Nominatim 原样输出；
- 渲染前由 `transitRouteBuilder.js` 的 `fromLonLat` 将 WGS-84 经纬度投影为地图视图坐标；`normalizeLonLatPair` 额外做 lat/lon 顺序纠错。

## 11. 局限与升级方向

**现有局限：**

1. **死代码遗留**（经核对，以下符号仅有定义、全工程无引用）：
   - `utils/drawTransitRoute.ts` 的 `drawTransitRoute`：基于天地图 JS SDK（`TiandituMap.addOverLay`）绘制公交线，已被 OpenLayers 渲染管线（`transitRouteBuilder` + `useRouteRendering`）取代。
   - `utils/driveXmlParser.ts` 的 `parseAndDrawDriveRoute`：依赖全局 `T`（天地图 SDK）解析并绘制驾车路线，现仅 `parseDriveRouteXml` 被使用。
   - `utils/loadTiandituSdk.js` 的 `loadTiandituSdk`：动态注入天地图 JS SDK script，当前路径规划走 REST 接口，无需 SDK。
   这三处可在确认后清理，以免误导维护者以为渲染依赖天地图 SDK。
2. **token 错误处理不统一**：驾车用 `TokenMissingError`，公交用普通 `Error`，建议统一为专用错误类型以便上层精确识别。
3. **规划请求不可取消**：drive/transit 规划请求未接入 `AbortController`，仅靠按钮禁用防重复；慢网下无法主动中止。
4. **绘制入参签名不一致**：`useRouteRendering.drawDriveRouteOnMap(routeLatLonStr)` 形参名为字符串，实际面板传入对象 `{ routeLatLonStr, stepLinePoints }`，靠 `buildDriveRouteRenderData` 兼容对象读取才正常工作，签名易误导。
5. **公交指标取首线**：`parseSegmentMetrics` 仅取分段首条 `segmentLine` 的时长/距离，多线路分段时统计可能不完整。
6. **在线依赖**：路径质量与可用性完全依赖天地图后端，无本地路网兜底；`v2/search` 默认 `mapBound` 为全国范围，未利用当前视图缩小搜索域。

**升级方向：**

1. 清理上述死代码，统一渲染入口与错误类型，收敛驾车/公交的对称实现。
2. 为规划请求引入 `AbortController` 与超时控制，提升弱网体验。
3. 搜索 `mapBound` 接入当前地图视图范围，提高地名命中相关性。
4. 公交分段指标聚合全部 `segmentLine`，并补充换乘步行距离、票价等字段展示。
5. 视需求引入多服务源（如高德驾车/公交）做结果对比或容灾切换，复用 `locationSearch` 的多服务分派模式。
