# 丰富底图源体系架构说明

日期：2026-07-21

适用范围：`frontend/src/constants/basemap/`、`frontend/src/composables/tileSource/`、`frontend/src/composables/map/features/` 及 `backend/api/proxy.py`、`backend/gcj_rectify/` 模块。

本文是长期参考文档，说明 WebGIS 3.0 中"丰富底图源体系"功能的双引擎配置模型、预设栈机制、瓦片请求生命周期、熔断回退策略、GCJ-02 火星坐标纠偏算法、高清瓦片优化及后端代理架构，供后续维护、扩展图源与调参时对照。

## 1. 功能定位

本功能为 WebGIS 3.0 提供 **20+ 内置瓦片图源**（天地图、高德、Google、Esri/ArcGIS、OSM、CartoDB、Stamen/StadiaMaps、MapTiler、Mapbox、Yandex、腾讯、GeoQ、Windy、Maps-for-Free、Wikipedia、OpenTopoMap、欧空局 EMODnet、图新 GeovisEarth 等），并支持用户通过自定义 XYZ URL 接入任意外部瓦片服务。

**核心设计目标**：2D（OpenLayers）与 3D（Cesium）双引擎共享同一套底图描述元数据，一次配置、双端渲染。

**重要边界**：这是一套**瓦片图源管理与分发框架**，不负责地图交互逻辑（缩放、平移、拾取等），也不负责地形高程数据加载。它解决的核心问题是：如何用统一的描述模型驱动两个异构渲染引擎，并在网络不稳定时保证底图可用性。

## 2. 文件结构

| 文件 | 职责 |
|------|------|
| `frontend/src/constants/basemap/basemapConfig.ts` | OL 专用图层源定义（`LAYER_SOURCE_DEFINITIONS`）+ 底图预设栈（`BASEMAP_PRESETS`），约 1431 行 |
| `frontend/src/constants/basemap/sourceDescriptors.ts` | 引擎无关的 `TileSourceDescriptor` 描述符列表（`TILE_SOURCE_DESCRIPTORS`），供 Cesium 侧消费 |
| `frontend/src/constants/basemap/cesiumProviderFactory.ts` | Cesium 侧 `ImageryProvider` 工厂：将 `TileSourceDescriptor` 转换为 Cesium 渲染实例 |
| `frontend/src/constants/basemap/basemapResolver.ts` | 底图解析器：预设解析、图层配置生成、UI 选项列表导出 |
| `frontend/src/composables/tileSource/tileLifecycle.ts` | 瓦片请求生命周期：`prioritizeTileSourceRequest`（fetch + AbortController）、中断管理、代理兜底 |
| `frontend/src/composables/tileSource/types.ts` | 类型定义与常量（超时、错误状态等） |
| `frontend/src/composables/map/features/basemapLayerFactory.js` | OL 图层工厂：栅格/矢量瓦片图层创建、高清瓦片 `zDirection` 注入 |
| `frontend/src/composables/map/features/useTileHDRendering.js` | 高清瓦片渲染全局开关（`tileHDRendering` ref，持久化到 localStorage） |
| `frontend/src/composables/map/features/useBasemapResilience.js` | 底图容灾：切换验证、加载监测、熔断降级（`createBasemapResilience`） |
| `backend/api/proxy.py` | 后端通用流式代理 + GCJ-02 纠偏瓦片路由 |
| `backend/gcj_rectify/transform.py` | GCJ-02 坐标转换算法（WGS84/GCJ-02/BD-09 互转，牛顿迭代） |
| `backend/gcj_rectify/rectify.py` | 瓦片级纠偏：像素级重采样合成 WGS84 对齐瓦片 |

## 3. 双配置体系

底图源体系维护**两套并行配置**，分别服务于不同渲染引擎：

### 3.1 LayerSourceDefinition（OL 专用）

定义于 `basemapConfig.ts`，每条记录包含 `createSource` 工厂函数，直接返回 OpenLayers 的 `XYZ` / `OSM` / `TileWMS` / `VectorTile` 实例：

```typescript
export type LayerSourceDefinition = {
    id: string;
    name: string;
    category: LayerCategory;   // 'label' | 'imagery' | 'terrain' | 'vector' | 'theme' | 'custom'
    group: LayerGroup;
    defaultVisible?: boolean;
    createSource: (ctx: LayerFactoryContext) => TileSourceInstance;
};
```

`createSource` 内部调用 `prioritizeTileSourceRequest()` 注入 fetch 优先加载策略，并可叠加 `withSkipHighResTile()` 标记注记图层跳过高清优化。

### 3.2 TileSourceDescriptor（引擎无关）

定义于 `sourceDescriptors.ts`，纯数据描述，不含任何引擎 API 调用：

```typescript
export type TileSourceDescriptor = {
    id: string;
    name: string;
    category: LayerCategory;
    group: LayerGroup;
    serviceType: 'xyz' | 'wms' | 'wmts' | 'osm' | 'vector-tile' | 'custom';
    url: string;               // 支持 {z}/{x}/{y}/{s} 占位符
    maxZoom?: number;
    tilePixelRatio?: number;   // HD/@2x 瓦片设为 2
    subdomains?: string[];
    nonStandardAdapter?: string;
    needsContext?: ('tiandituTk' | 'customUrl' | 'normBase')[];
    wms?: { layers: string; version?: string; ... };
    wmts?: { layer: string; matrixSet: string; ... };
};
```

Cesium 侧通过 `cesiumProviderFactory.ts` 的 `createCesiumImageryProvider()` 将描述符转换为 `UrlTemplateImageryProvider` / `WebMapServiceImageryProvider` / `WebMapTileServiceImageryProvider` / `OpenStreetMapImageryProvider`。

### 3.3 同步约束

两套配置通过 `id` 字段关联，**需手动保持同步**。文件头部注释明确标注：

> 新增图源时需同步编辑此文件和 basemapConfig.ts

`sourceDescriptors.ts` 中的 `getDescriptorById(id)` 提供按 ID 快速查找，`basemapResolver.ts` 中的 `LAYER_SOURCE_MAP` 提供 OL 侧索引。

## 4. 预设栈模型

`BASEMAP_PRESETS` 是一个有序数组，每项定义一个用户可选的底图方案：

```typescript
export type BasemapPresetDefinition = {
    id: string;
    label: string;       // UI 显示名称
    stack: string[];     // 图层源 ID 数组，从底到顶堆叠
};
```

**栈语义**：`stack` 中的 ID 按数组顺序从底层到顶层渲染。例如：

```typescript
{ id: 'imagery_google_preset', label: 'Google原版', stack: ['imagery_google', 'terrain_google', 'label_tianditu'] }
```

表示：Google 卫星影像（底）→ Google 山体阴影（中）→ 天地图注记（顶）。

**关键索引**：
- `index 0`：`local_tiles_preset`（本地瓦片）
- `index 1`：`custom`（自定义 URL，`l=1`）
- 默认预设：`DEFAULT_BASEMAP_PRESET_ID = 'custom_China_Blender_preset_2'`

`basemapResolver.ts` 的 `resolvePresetLayerIds(optionId)` 将预设 ID 解析为去重、保序的图层源 ID 数组，过滤掉不存在的 ID。`URL_LAYER_OPTIONS` 导出预设 ID 列表供 URL 参数 `l={index}` 映射。

当前预设栈共 **60+ 项**，覆盖天地图、图新、Google、高德、Mapbox、Yandex、腾讯、OSM、CartoDB、Stamen、MapTiler、ArcGIS/ESRI、Windy、MFF、GeoQ 等系列。

## 5. 瓦片请求生命周期

`tileLifecycle.ts` 的 `prioritizeTileSourceRequest(source)` 是 OL 侧所有瓦片源的请求入口，核心策略：**fetch + AbortController 优先，CORS/redirect 失败回退后端代理**。

### 5.1 工作流程

```
tileLoadFunction 触发
  ├─ 检查 epoch（防止过期请求结果被采纳）
  ├─ 检查 signal.aborted（已中断则标记 TILE_STATE_ERROR）
  ├─ fetch(srcUrl, { signal, mode:'cors', credentials:'omit' })
  │    ├─ 成功 → 创建 blob URL → 赋给 img.src
  │    └─ 失败（CORS / 网络错误）
  │         ├─ TILE_PROXY_MODE === 'always' → 直接走后端代理
  │         └─ TILE_PROXY_MODE === 'fallback' → 尝试 /proxy/{srcUrl}
  │              ├─ 代理成功 → blob URL → img.src
  │              └─ 代理失败 → markTileAsError
  └─ 超时（TILE_REQUEST_TIMEOUT_MS = 15000ms）→ markTileAsError
```

### 5.2 为什么用 fetch 而非 img.src

浏览器对 `<img>` 的 HTTP 请求由内核管理，JS 无法中途取消。被墙的源会阻塞 30-60 秒占据并发连接槽位。`fetch()` + `AbortController` 可以立即释放底层 TCP 连接。

### 5.3 中断机制（abortTileSourceRequests）

四层级联释放：

1. **epoch++**：所有进行中的异步回调在 fetch 完成时发现 epoch 过期，丢弃结果
2. **controller.abort()**：中断所有正在进行的 fetch() 请求，释放 TCP 连接
3. **标记缓存 tile 为 ERROR**：遍历 tileCache 逐个 `setState(TILE_STATE_ERROR)`
4. **source.clear()**：清空 OL 内部瓦片缓存

### 5.4 代理模式

由环境变量 `VITE_TILE_PROXY_MODE` 控制：

| 模式 | 行为 |
|------|------|
| `fallback`（默认） | 直连优先，失败后自动走后端 `/proxy/{URL}` |
| `always` | 所有可代理的外部瓦片统一走后端 |
| `off` | 禁用代理，仅直连 |

代理触发时通过 `useMessage` 弹出 toast 通知（5s 防抖去重，`PROXY_NOTIFY_DEBOUNCE_MS = 5000`）。

## 6. 熔断与回退

`useBasemapResilience.js` 的 `createBasemapResilience()` 提供底图容灾能力：

### 6.1 切换验证（validateBaseLayerSwitch）

切换底图后启动验证：
- 监听 `tileloadstart` / `tileloadend` / `tileloaderror` 事件
- 至少 1 次 start + 1 次 end 才算成功
- **连续 3 个瓦片失败**即快速判定失败（不等超时）
- 超时阈值：`checkTimeoutMs = 3000`ms

### 6.2 加载监测（monitorLayerTimeout）

对活跃底图持续监测：

| 参数 | 值 | 含义 |
|------|-----|------|
| `MAX_ERRORS` | 3 | 连续错误阈值，触发降级 |
| `ACTIVITY_TIMEOUT` | 10000ms | 无瓦片加载活动的超时 |
| `WARNING_THRESHOLD` | 5 | 累计错误警告阈值 |

### 6.3 降级链（FallbackManager）

每个 `layerId` 维护独立的 `FallbackManager` 单例：

```javascript
const FALLBACK_OPTIONS = ['tianDiTu', 'local'];
```

降级逻辑：
1. 跳过当前失败的 layerId，避免降级到同一个图层
2. 按顺序尝试 `tianDiTu` → `local`
3. 所有选项耗尽后提示用户手动切换或刷新
4. 非默认底图仅通知，不自动降级

## 7. GCJ-02 火星坐标纠偏

### 7.1 算法原理

`backend/gcj_rectify/transform.py` 实现国测局偏移算法：

- **正向加偏**（`wgs2gcj`）：对 WGS84 坐标施加非线性偏移
- **逆向求解**（`gcj2wgs`）：**牛顿迭代法**，最多 20 次迭代，精度 `1e-6` 度（约 0.1 米）

```python
GCJ2WGS_MAX_ITERATIONS = 20
GCJ2WGS_TOLERANCE = 1e-6  # 约 0.1 米精度
```

迭代公式：

```python
for iteration in range(GCJ2WGS_MAX_ITERATIONS):
    g1 = wgs2gcj(w0[0], w0[1])
    w1 = (w0[0] - (g1[0] - g0[0]), w0[1] - (g1[1] - g0[1]))
    if abs(w1[0] - w0[0]) < TOLERANCE and abs(w1[1] - w0[1]) < TOLERANCE:
        return w1
    w0 = w1
```

中国境外坐标（`out_of_china`）直接返回原值，不做偏移。

### 7.2 瓦片级纠偏（rectify.py）

`get_gcj2wgs_tile(x, y, z, template, cache_dir)` 流程：

1. 检查输出缓存（文件系统），命中直接返回
2. **z ≤ 9 时直接返回源瓦片**（低缩放级别偏差可忽略）
3. z > 9 时执行像素级纠偏：
   - 将目标 WGS84 瓦片的 bbox 转换为 GCJ-02 bbox
   - 计算 GCJ bbox 覆盖的源瓦片网格（可能跨多块瓦片）
   - 并发获取源瓦片（`MAX_CONCURRENCY = 100`）
   - 拼接为大图 → 裁剪到目标 bbox → 输出 256×256 PNG

前端通过 URL 前缀 `/proxy/gcj2wgs/{原始URL}` 触发纠偏代理。例如高德影像 WGS 版：

```
https://negiao-webgis.hf.space/proxy/gcj2wgs/http://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}
```

## 8. 高清瓦片优化

### 8.1 zDirection 偏上层取瓦

`basemapLayerFactory.js` 的 `buildRasterBasemapSource(rawSource)` 在 `tileHDRendering` 开关开启时注入自定义 `NearestDirectionFunction`：

```javascript
function alwaysPickFinerZoom(target, high, low) {
    if (high === target || low === target) return 1;   // 精确命中整数级
    return -1;                                          // 非整数 zoom 一律取更高层级
}
```

效果：fractional zoom（如 z=14.5）时请求 z+1 层瓦片并缩小渲染，瓦片数 ×4，清晰度显著提升。

### 8.2 skipHighResTile

注记图层（`category='label'`）通过 `withSkipHighResTile()` 标记 `skipHighResTile: true`，跳过高清优化。原因：注记文字在高清瓦片中会显示过小，影响可读性。

### 8.3 tilePixelRatio

HD/@2x 瓦片（如 MapTiler 影像 HD）实际为 512×512 像素叠在 256 网格上。`TileSourceDescriptor.tilePixelRatio = 2` 告知渲染器按 256 网格缩放还原，避免拉伸糊化。

### 8.4 全局开关

`useTileHDRendering.js` 导出全局单例 `tileHDRendering`（Vue ref），默认 `true`（开启），持久化到 `localStorage` 键 `webgis:tileHDRendering`。

## 9. 自定义底图接入

自定义底图位于预设栈 `index 1`（URL 参数 `l=1`）：

```typescript
{ id: 'custom', label: '自定义URL', stack: ['custom'] }
```

对应 `LayerSourceDefinition`：

```typescript
{
    id: 'custom',
    name: '自定义URL',
    category: 'custom',
    group: '自定义',
    createSource: ({ customUrl }) => /* 使用 ctx.customUrl 创建 XYZ source */,
}
```

对应 `TileSourceDescriptor`：

```typescript
{
    id: 'custom',
    name: '自定义URL',
    category: 'custom',
    group: '自定义',
    serviceType: 'custom',
    url: '',
    needsContext: ['customUrl'],
}
```

Cesium 侧在 `createCesiumImageryProvider` 中检测 `serviceType === 'custom'` 时，直接使用 `ctx.customUrl` 作为瓦片 URL 模板创建 `UrlTemplateImageryProvider`。

用户只需提供标准 XYZ URL 模板（含 `{z}/{x}/{y}` 占位符），即可同时接入 2D 和 3D 视图。

## 10. Cesium 侧工厂

`cesiumProviderFactory.ts` 的 `createCesiumImageryProvider(Cesium, descriptor, ctx)` 按 `serviceType` 分发：

| serviceType | Cesium Provider | 备注 |
|-------------|-----------------|------|
| `xyz` / `custom` | `UrlTemplateImageryProvider` | 默认路径，`WebMercatorTilingScheme` |
| `osm` | `OpenStreetMapImageryProvider` | 降级为 UrlTemplate |
| `wms` | `WebMapServiceImageryProvider` | 需 `wms.layers` |
| `wmts` | `WebMapTileServiceImageryProvider` | 需 `wmts.layer` + `wmts.matrixSet` |
| `vector-tile` | 返回 `null` | Cesium 不支持 PBF 矢量瓦片 |
| 非标准适配器（MFF） | 返回 `null` | 实验性，暂不支持 Cesium |

URL 模板转换（`toCesiumUrlTemplate`）处理：
- `{-y}` → `{reverseY}`（腾讯等 TMS 反转）
- `%7C` → `|`、`%2C` → `,`（Google apistyle 解码）
- `{a-d}` 范围展开为 subdomains 数组

每个 descriptorId 绑定独立 `AbortController`（`rotateAbortController`），切换底图时中断旧请求。

## 11. 后端代理架构

`backend/api/proxy.py` 提供三类路由：

| 路由 | 功能 |
|------|------|
| `/proxy/{target_url:path}` | 通用流式代理，转发任意 HTTP(S) 资源 |
| `/proxy/gcj2wgs/{target_url:path}` | GCJ-02 → WGS84 瓦片纠偏 |
| `/proxy/wgs2gcj/{target_url:path}` | WGS84 → GCJ-02 瓦片纠偏 |
| `/tiles/ships66/{z}/{x}/{y}.png` | 船舶网专用代理（特殊请求头） |

通用代理特性：
- 协议补全：缺省协议统一补全为 `https://`
- SSRF 防护：阻止私网/本地地址访问（`_is_private_host`）
- 流式转发：`StreamingResponse` + `aiter_raw()`，不缓冲整个响应
- 请求头伪装：模拟 Chrome UA，优先接受图片格式
- 超时配置：连接 5s，总计 20s（`httpx.Timeout(20.0, connect=5.0)`）
- 连接池：`max_connections=100, max_keepalive_connections=20`

## 12. 局限与升级方向

**现有局限：**

1. **双配置手动同步**：`LAYER_SOURCE_DEFINITIONS`（OL）与 `TILE_SOURCE_DESCRIPTORS`（引擎无关）需人工保持一致，新增/修改图源时必须同步编辑两个文件，存在遗漏风险。
2. **MFF 非标准图源不支持 Cesium**：Maps-for-Free 使用非标准 URL 格式（`z{z}/row{y}/{z}_{x}-{y}.jpg`），Cesium 侧直接返回 null 跳过。
3. **矢量瓦片（PBF）仅 OL 可用**：Cesium 不支持 PBF 矢量瓦片渲染，`vector-tile` 类型在 3D 视图中不可用。
4. **纠偏精度与性能权衡**：z ≤ 9 不纠偏（偏差可忽略），z > 9 需拼接多块源瓦片再裁剪，高缩放级别下首次请求延迟较高（依赖文件缓存缓解）。
5. **熔断阈值固定**：`MAX_ERRORS = 3` 为硬编码，无法按图源质量动态调整（如某些免费图源偶发 404 属正常现象）。
6. **代理单点**：后端代理部署在 `negiao-webgis.hf.space`（Hugging Face Spaces），存在冷启动延迟和可用性风险。

**升级方向：**

1. 引入编译期代码生成：从单一 JSON/YAML 图源清单自动生成 OL `createSource` 和 `TileSourceDescriptor`，消除手动同步成本。
2. 为 Cesium 实现自定义 `TileCoordinatesImageryProvider`，支持 MFF 等非标准 URL 格式。
3. 探索 Cesium 3D Tiles / `Cesium3DTileset` 接入矢量瓦片，实现 3D 矢量渲染。
4. 纠偏缓存引入 Redis / CDN 层，降低首次请求延迟；考虑 WebWorker 前端纠偏减少后端依赖。
5. 熔断器引入滑动窗口 + 半开状态（circuit breaker pattern），支持自动恢复探测。
6. 代理层支持多节点负载均衡与故障转移。

## 13. 关键常量速查

| 常量 | 值 | 位置 | 含义 |
|------|-----|------|------|
| `TILE_REQUEST_TIMEOUT_MS` | 15000 | `tileSource/types.ts` | 单瓦片 fetch 超时（ms） |
| `TILE_STATE_ERROR` | 3 | `tileSource/types.ts` | OL 瓦片错误状态码 |
| `MAX_ERRORS` | 3 | `useBasemapResilience.js` | 连续错误熔断阈值 |
| `ACTIVITY_TIMEOUT` | 10000 | `useBasemapResilience.js` | 无活动超时（ms） |
| `WARNING_THRESHOLD` | 5 | `useBasemapResilience.js` | 累计错误警告阈值 |
| `PROXY_NOTIFY_DEBOUNCE_MS` | 5000 | `tileLifecycle.ts` | 代理通知防抖（ms） |
| `GCJ2WGS_MAX_ITERATIONS` | 20 | `gcj_rectify/transform.py` | 牛顿迭代最大次数 |
| `GCJ2WGS_TOLERANCE` | 1e-6 | `gcj_rectify/transform.py` | 迭代收敛精度（度） |
| `MAX_CONCURRENCY` | 100 | `gcj_rectify/rectify.py` | 纠偏并发获取上限 |
| `TILE_SIZE` | 256 | `gcj_rectify/utils.py` | 标准瓦片像素尺寸 |
| `DEFAULT_BASEMAP_PRESET_ID` | `'custom_China_Blender_preset_2'` | `basemapConfig.ts` | 默认底图预设 |
| `GOOGLE_MANUAL_HOST` | `'gac-geo.googlecnapps.club'` | `basemapConfig.ts` | Google 瓦片手动主机 |
| `checkTimeoutMs`（默认参数） | 3000 | `useBasemapResilience.js` | 切换验证超时（ms） |
| `tileHDRendering`（默认值） | `true` | `useTileHDRendering.js` | 高清渲染默认开启 |
