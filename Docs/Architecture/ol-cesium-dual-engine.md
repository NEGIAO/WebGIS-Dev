# OpenLayers × Cesium 2D/3D 双引擎架构说明

日期：2026-07-21

适用范围：`frontend/src` 下地图引擎切换与视图状态同步相关模块（`views/HomeView.vue`、`components/Map/`、`components/Cesium/`、`composables/`、`utils/map/`、`utils/url/`、`stores/useUrlParamStore.ts`、`router/index.js`）。

本文是长期参考文档，说明 WebGIS 3.0 中「OpenLayers 二维地图 + Cesium 三维地球双引擎」的切换机制、视图状态同步算法、URL 参数编码格式、懒加载策略与竞态保护，供后续维护、调试分享链接还原问题与扩展引擎能力时对照。

## 1. 功能定位

本功能在同一页面内同时承载两套地图引擎：

- **OpenLayers（OL）**：二维平面地图，是核心首屏能力，始终挂载。
- **Cesium**：三维数字地球，按需懒加载，重量级资源不参与首屏竞争。

两者通过 URL 参数 `view=ol|cesium` 一键切换，并保证**视图状态双向同步**：

1. **位置与缩放**：地图中心经纬度（`lng`/`lat`）与缩放级别（`z`）在两个引擎间换算对齐。
2. **相机姿态**：Cesium 的 heading / pitch / roll 编码进 `cv` 参数，切回 2D 时保留中心与可视范围。
3. **底图预设**：`l` 参数为底图索引，OL 与 Cesium 共享同一套 `URL_LAYER_OPTIONS` 映射，切换引擎不丢底图。
4. **完整分享还原**：复制地址栏 URL 即可在新会话中精确重现当前引擎、视角、底图与（可选的）定位编码。

**重要边界**：OL 的 `z` 是**缩放级别**（zoom，浮点，常规 0–22），Cesium 的 `z` 是**相机离地高度**（米）。二者数值不可直接复用，切换时必须经 `viewScaleConverter` 精确互转，否则会出现"切到 3D 后相机穿地或飞到太空"的问题。

## 2. 文件结构

| 文件 | 职责 |
|------|------|
| `views/HomeView.vue` | 双引擎编排层：`setMapView` 切换调度、`ensureCesiumLoaded` 懒加载、`buildCesiumQueryPatchFromOl` / `buildOlQueryPatchFromCesium` 双向参数构建、`latestCesiumOlEquivalent` 缓存、`view-sync` 事件汇聚 |
| `components/Map/MapContainer.vue` | OL 容器（`v-show` 常驻）：暴露 `getCurrentViewState` / `syncViewFromCesium` / `getOlView` / `getMapSize`，接入启动守卫，发出 `view-sync` |
| `components/Cesium/CesiumContainer.vue` | Cesium 容器（`v-if` 懒挂载）：构建 Viewer、`restoreCameraFromUrl` 恢复视角、`bindCameraViewSync` 监听相机 moveEnd、发出 `view-sync` |
| `composables/useMapState.js` | OL 状态管理：URL 同步（`syncUrlFromMap`）、`getCurrentViewState`、`syncViewFromCesium`（含 `suppressNextUrlSync`）、`formatZParam` |
| `composables/useMapViewUrlState.js` | `view` 参数读写：`getCurrentMapView` / `replaceMapView`，OL→Cesium 时 `z` 兜底为默认相机高度 |
| `components/Cesium/composables/useCesiumUrlTracking.js` | Cesium 相机 URL 追踪：`parseCameraStateFromUrl` / `restoreCameraFromUrl` / `syncCameraViewToUrl` / 底图 `l` 同步 |
| `utils/map/viewScaleConverter.js` | OL zoom ↔ Cesium 相机高度精确互转库（`olZoomToCesiumHeight` / `cesiumHeightToOlZoom`） |
| `utils/url/urlConstants.js` | 共享常量：`MAP_VIEW_OL` / `MAP_VIEW_CESIUM` / `CAMERA_VIEW_PARAM_KEY`（`cv`）/ `normalizeMapView` |
| `utils/url/urlQueryReader.js` | URL query 统一读取：hash query 优先级高于 `route.query`，提供完整快照 |
| `utils/url/crypto.js` | Base62 编解码：`encodePos` / `encodeCesiumPoseState`（`p.<base62>`）/ `decodeCesiumCameraState`（兼容旧版完整相机码） |
| `composables/map/features/useStartupUrlRestoreGuard.js` | 启动期 URL 恢复守卫：分享参数应用前暂停 OL 写回，避免默认视图覆盖 URL |
| `stores/useUrlParamStore.ts` | URL 参数延迟应用仓库：路由阶段提取、引擎就绪后消费，`z` 按 `view` 双语义校验 |
| `router/index.js` | 全局路由守卫：`beforeEach` 中提取 URL 参数存入 `useUrlParamStore`，分享模式注入访客令牌 |

## 3. 双引擎切换机制

### 3.1 挂载策略：v-show 常驻 + v-if 懒加载

`HomeView.vue` 模板对两个容器采用不同的渲染策略（源码注释已固化）：

```html
<!-- 2D 地图是核心，需优先加载且切换 3D 时不销毁（保持状态） -->
<MapContainer v-show="!is3DMode && !isAccountPanelFullscreen" ... />

<!-- 3D 地图很重，只有需要时才渲染 DOM；切回 OL 时卸载，确保相机 URL 监听同步清理 -->
<div v-if="is3DMode && isCesiumLoaded && !isAccountPanelFullscreen" class="cesium-wrapper">
    <component :is="CesiumContainer" ref="cesiumContainerRef" @view-sync="handleViewSync" />
</div>
```

- **MapContainer 用 `v-show`**：OL 始终存在于 DOM，切到 3D 时仅隐藏。这样隐藏的 OL 视图仍可被 `syncViewFromCesium` 静默更新中心与 zoom，作为切回 2D 时的状态来源。
- **CesiumContainer 用 `v-if`**：Cesium 仅在 `is3DMode && isCesiumLoaded` 时才创建 DOM 与 Viewer；切回 OL 时 `isCesiumLoaded` 置 `false`、`CesiumContainer` 置 `null`，组件卸载触发 `cleanupCameraViewSync()`，相机 moveEnd 监听被彻底清理。

### 3.2 懒加载：ensureCesiumLoaded

Cesium 组件不在首屏 import，而是首次切到 3D 时动态导入：

```js
async function ensureCesiumLoaded() {
    if (isCesiumLoaded.value) return true;
    if (_cesiumLoadPromise) return _cesiumLoadPromise;   // 并发调用复用同一 Promise
    isCesiumLoading.value = true;
    showLoading('正在加载 3D 引擎资源...');
    _cesiumLoadPromise = (async () => {
        try {
            const module = await import('../components/Cesium/CesiumContainer.vue');
            CesiumContainer.value = module.default;
            isCesiumLoaded.value = true;
            return true;
        } catch (error) { /* 提示并返回 false */ }
        finally { isCesiumLoading.value = false; hideLoading(); _cesiumLoadPromise = null; }
    })();
    return _cesiumLoadPromise;
}
```

`_cesiumLoadPromise` 缓存保证快速连点"3D"按钮时不会发起第二次动态导入。

### 3.3 切换调度：setMapView

`setMapView(view, { writeUrl })` 是唯一的引擎切换入口，`toggle3D` 与浏览器前进/后退的 `watch` 都收敛到它。核心顺序是**先完成 URL 语义转换，再加载/卸载目标引擎**：

```js
async function setMapView(view, { writeUrl = true } = {}) {
    const normalizedView = view === MAP_VIEW_CESIUM ? MAP_VIEW_CESIUM : MAP_VIEW_OL;
    const queryPatch = normalizedView === MAP_VIEW_CESIUM
        ? buildCesiumQueryPatchFromOl()      // OL → Cesium：zoom 转相机高度
        : buildOlQueryPatchFromCesium();     // Cesium → OL：相机高度转 zoom

    // 先把 URL 中的 z 转换为目标引擎语义，再加载引擎，
    // 保证目标引擎初始化时读到的 z 已经是自己对应的语义
    if (writeUrl) replaceMapView(normalizedView, queryPatch ? { queryPatch } : undefined);

    if (normalizedView === MAP_VIEW_CESIUM) {
        isWeatherBoardMode.value = false;             // 天气看板仅支持 2D
        const loaded = await ensureCesiumLoaded();
        if (!loaded) { if (writeUrl) replaceMapView(MAP_VIEW_OL); return false; }  // 加载失败回滚
        is3DMode.value = true;
    } else {
        if (latestCesiumOlEquivalent.value) {
            mapContainerRef.value?.syncViewFromCesium?.(latestCesiumOlEquivalent.value);
        }
        // 把 URL 中的 l 同步到 OL 底图，await 避免 selectedLayer 已变但 switchLayerById 未执行的竞态
        const incomingLayerIndex = parseFiniteNumber(readQueryValue('l'));
        if (incomingLayerIndex !== null) {
            const targetLayerId = getLayerIdByIndex(incomingLayerIndex);
            if (targetLayerId) await mapContainerRef.value?.setBaseLayerActive?.(targetLayerId);
        }
        is3DMode.value = false;
        isCesiumLoaded.value = false;                 // 卸载 CesiumContainer，清理相机监听
        CesiumContainer.value = null;
        cesiumContainerRef.value = null;
    }
    return true;
}
```

浏览器前进/后退或外部 `router.replace` 改变 `view` 时，由 `watch(() => getCurrentMapView())` 捕获并以 `writeUrl: false` 调用 `setMapView`，避免重复写 URL。`onMounted` 时也调用一次 `setMapView(getCurrentMapView(), { writeUrl: false })`，使刷新带 `view=cesium` 的链接能直接进入 3D。

## 4. 视图状态同步算法：zoom ↔ 相机高度

`utils/map/viewScaleConverter.js` 是双引擎视图对齐的数学核心，提供两个**严格互逆**的函数 `olZoomToCesiumHeight` 与 `cesiumHeightToOlZoom`。

### 4.1 对齐基准

以视口**垂直方向**为对齐基准（与 Cesium `fovy` 语义一致）：OL 垂直方向可见地表范围 = `groundRes × viewportHeight`，Cesium 视锥垂直截面地面范围 = `2h·tan(fovy/2)`，两者相等即可反推相机高度。使用宽度或 `Math.min(w,h)` 都会在竖屏视口下引入横纵比误差。

### 4.2 正向四步换算（OL zoom → Cesium height）

```
① res       = INIT_RES / 2^zoom                 OL 投影分辨率（Web Mercator，米/像素）
② groundRes = res × cos(centerLat)              地表实际分辨率（修正 Mercator 高纬拉伸）
③ visibleH  = groundRes × viewportHeight        垂直方向地表可见范围（米）
④ height    = visibleH / (2·tan(fovy/2)) × calib  相机高度（俯视视锥几何反推 + 视觉校准）
```

对应实现：

```js
const res = getProjectedResolution(view, normalizedZoom);      // ① 优先委托 OL View，降级用标准公式
const groundRes = res * resolveLatScale(centerLat);            // ② cos(lat) 纬度修正
const visibleH = groundRes * resolveViewportHeight(mapSize);   // ③ 取视口高度
const height =
    (visibleH / (2 * Math.tan(resolveFovy(cesiumFovy) / 2))) * // ④ 视锥反推
    resolveCalibration(calibration);
```

### 4.3 反向换算（Cesium height → OL zoom）

对 ④③②① 依次取代数逆，两函数在相同参数 `{ view, mapSize, centerLat, cesiumFovy, calibration }` 下严格互逆（往返误差仅来自 IEEE 754 双精度舍入）：

```
④⁻¹ visibleH  = height × 2·tan(fovy/2) / calib
③⁻¹ groundRes = visibleH / viewportHeight
②⁻¹ res       = groundRes / cos(lat)
①⁻¹ zoom      = log₂(INIT_RES / res)
```

### 4.4 关键设计点

- **纬度修正 `cos(lat)`**：Web Mercator 高纬拉伸，同一 zoom 下投影"米"非地表真实米。纬度钳制到 ±85.05112877980659°，`cos` 结果做下限保护（`MIN_LAT_SCALE`），防止极点附近 `cos→0` 导致相机高度趋于无穷。未提供 `centerLat` 时返回 1（视为赤道，不修正）。
- **分辨率委托**：`getProjectedResolution` / `getZoomFromResolution` 优先调用 OL View 的 `getResolutionForZoom` / `getZoomForResolution`（感知自定义投影），失败时降级到标准 Web Mercator 公式 `INIT_RES / 2^zoom`。
- **默认不截断**：主链路只做有限数校验，不做范围 clamp，以免破坏可逆性；只有显式传 `clamp: true` 才执行有损截断。

## 5. URL 参数编码

### 5.1 参数总览

| 参数 | 语义 | 说明 |
|------|------|------|
| `view` | 引擎选择 | `ol`（默认）/ `cesium`；`normalizeMapView` 还把 `3d` 归一为 `cesium` |
| `lng` / `lat` | 中心经纬度 | OL 下为地图中心，Cesium 下为相机经纬度，6 位小数 |
| `z` | **双语义** | `view=ol` 时为 zoom 级别；`view=cesium` 时为相机离地高度（米），统一两位小数（`formatZParam`） |
| `l` | 底图预设索引 | OL / Cesium 共享 `URL_LAYER_OPTIONS` 映射 |
| `cv` | Cesium 相机姿态码 | `p.<base62>` 姿态短码；兼容旧版完整相机码 |
| `heading`/`pitch`/`roll` | 兼容明文姿态 | 会被编码进 `cv`，URL 独立展示时不保留（`CAMERA_STATE_QUERY_KEYS`） |
| `s` / `loc` / `p` | 分享 / 定位 | 分享标记、定位来源、加密点位编码（见 `useMapState` 与 `crypto.js`） |

### 5.2 z 双语义的处理

`z` 的语义随 `view` 变化，三处协同保证不出错：

1. **校验**（`useUrlParamStore.validateViewZ`）：`view=cesium` 时按相机高度校验（1 ≤ z ≤ 50000000），否则按 zoom 校验（0 ≤ z ≤ 30）。
2. **切换兜底**（`useMapViewUrlState.replaceMapView`）：OL→Cesium 且 `queryPatch` 未提供 `z`、且现有 `z` 不适合作相机高度（`shouldUseDefaultCesiumHeight`）时，写入 `DEFAULT_CESIUM_URL_HEIGHT = '6000000.00'`，避免把 OL 的 zoom 数值（如 17）当成 17 米高度。
3. **切换换算**（`HomeView`）：正常切换路径总是通过 `buildCesiumQueryPatchFromOl` / `buildOlQueryPatchFromCesium` 提供换算后的 `z`，兜底仅在异常路径生效。

### 5.3 cv 姿态编码（Base62）

`crypto.js` 用打乱顺序的自定义 Base62 字符表把整数编码为短字符串：

```js
const BASE62_ALPHABET = '4CiHUu0oP7ahIA29xNQtgbOMDs6V3nREfw1mGlvWeqSjFT8dJXpBLYKr5kzyZc';
const BASE = 62n;
const MIN_CODE_LENGTH = 8;          // 不足 8 位用字符表首字符左填充
const CESIUM_POSE_PREFIX = 'p.';    // 姿态码前缀
```

**当前姿态码 `encodeCesiumPoseState`**（仅姿态，不含位置/高度，位置由明文 `lng/lat/z` 承载）按固定位宽封包 BigInt：

| 字段 | 位宽 | 缩放 | 偏移 | 取值范围 |
|------|------|------|------|---------|
| heading | 19 bit | ×1000 | 0 | [0, 360) |
| pitch | 18 bit | ×1000 | +90 | [-90, 90] |
| roll | 19 bit | ×1000 | +180 | [-180, 180) |

```js
let packed = BigInt(headingScaled);
packed = (packed << CESIUM_PITCH_BITS) | BigInt(pitchScaled);
packed = (packed << CESIUM_ROLL_BITS) | BigInt(rollScaled);
return `${CESIUM_POSE_PREFIX}${encodeBase62(packed)}`;   // 形如 p.xxxxx
```

**兼容旧版完整相机码 `decodeCesiumCameraState`**：无 `p.` 前缀，额外封包经纬度（`LAT_BITS=28`，`COORD_SCALE=1e6`）与高度（33 bit，×100），可在没有明文坐标时单独还原完整视角。`parseCameraStateFromUrl` 的解码优先级为：

1. `cv` 姿态码（`decodeCesiumPoseState`）+ 明文 `lng/lat/z`；
2. 旧版完整相机码（`decodeCesiumCameraState`）；
3. 明文 `lng/lat/z` + `heading/pitch/roll`（`cv` 损坏时的退路，避免一个坏编码让分享链接完全失效）。

### 5.4 hash query 优先级

`urlQueryReader.js` 统一约定 **hash query（`#/home?key=val`）优先级高于 `route.query`**：

- `getCurrentQuerySnapshot(routeQuery)`：先铺 `route.query`，再用 `location.hash` 中的 query 覆盖同名字段。
- `readQueryValue(key, routeQuery)`：先读 hash，命中即返回，否则回退 `route.query`。

所有 OL / Cesium / UI 组件都经此模块读参数，避免多处独立实现导致快照分裂。

## 6. 双向同步链路

### 6.1 OL → Cesium（buildCesiumQueryPatchFromOl）

切到 3D 前，从当前 OL 视图构建 Cesium URL 参数：

```js
const state = mapContainerRef.value?.getCurrentViewState?.();   // { lng, lat, zoom, layerIndex, size, view }
const height = olZoomToCesiumHeight({ view: state.view, zoom: state.zoom, mapSize: state.size, centerLat: state.lat });
const poseCode = encodeCesiumPoseState({ heading: 0, pitch: -90, roll: 0 });  // 默认正俯视
const patch = {
    lng: Number(state.lng).toFixed(6),
    lat: Number(state.lat).toFixed(6),
    z: formatZParam(height ?? 6000000),
    cv: poseCode && poseCode !== '0' ? poseCode : undefined,
};
if (Number.isFinite(state.layerIndex)) patch.l = String(state.layerIndex);   // 显式写 l，避免 Cesium 落到默认底图
```

Cesium 容器挂载后，`initViewer` 调 `restoreCameraFromUrl({ duration: 0 })` 从 URL 精确还原相机；失败则 `flyToHome(0)` 回到默认视角（中国中心，6000km 高度）。

### 6.2 Cesium → OL（latestCesiumOlEquivalent）

Cesium 相机每次 moveEnd 触发 `syncCameraViewToUrl`，经 `onCameraViewSync` 发出 `view-sync` 事件，payload 为 `{ view: 'cesium', camera: { lng, lat, height, heading, pitch, roll } }`。`HomeView.handleViewSync` 转交 `syncOlFromCesiumPayload`：

```js
function syncOlFromCesiumPayload(payload = {}) {
    let equivalent = payload?.olEquivalent;
    const camera = payload?.camera;
    if (!equivalent && camera) {
        const zoom = cesiumHeightToOlZoom({          // 相机高度 → OL zoom
            view: mapContainerRef.value?.getOlView?.(),
            height: camera.height,
            mapSize: mapContainerRef.value?.getMapSize?.(),
            centerLat: camera.lat,
        });
        if (zoom !== null) equivalent = { lng: camera.lng, lat: camera.lat, zoom };
    }
    if (!equivalent) return;
    latestCesiumOlEquivalent.value = equivalent;     // 缓存最近一次等效视图
    mapContainerRef.value?.syncViewFromCesium?.(equivalent);  // 静默更新隐藏的 OL 视图
}
```

切回 2D 时 `buildOlQueryPatchFromCesium` 读取 `latestCesiumOlEquivalent` 写回 `lng/lat/z`，并从 Cesium 当前 `activeBasemap` 重新计算 `l`（而非透传 URL 旧值，避免熔断降级后底图已变但 URL 未写回的场景）。

### 6.3 底图 l 的双向一致性

OL 与 Cesium 通过 `createBasemapUrlMappingFeature` 复用同一套 `getLayerIdByIndex` / `getLayerIndexById`：

- OL 写回：`useMapState.buildQuery` 写入当前 `selectedLayer` 对应索引。
- Cesium 写回：`syncBasemapToUrl(presetId)` / `syncCameraViewToUrl` 写入 `activeBasemap` 对应索引；`watch(activeBasemap)` 兜底其它入口（如 CesiumToolPanel）触发的同步。
- 恢复：Cesium `restoreBasemapFromUrl` 优先用 URL `l`，无 `l` 时才应用服务器管理员默认底图。

## 7. URL 参数的延迟应用

地图引擎是异步初始化的，而地址栏参数在路由阶段就已可用，因此采用"先提取、后消费"的两段式：

1. **路由阶段提取**：`router.beforeEach` 在跳转 `/home` 时调用 `urlParamStore.extractAndStorePendingParams(routeQueryParams)`，把 `lng/lat/z/l/s/loc/p/view` 规范化后存入仓库，并重置 `isParamApplied`。该调用对纯 query/hash 变化也生效，供刷新恢复与前进/后退同步。
2. **引擎就绪后消费**：`MapContainer.applyDeferredUrlParams` 在底图核心就绪后调用 `getValidCoordinateParams()` 取出合法坐标，`flyToView` 定位，再 `markParamsAsApplied`。
3. **Cesium 分流**：`getValidCoordinateParams` 在 `view === 'cesium'` 时返回 `null`——Cesium 相机恢复不走 OL 坐标路径，而由 `useCesiumUrlTracking.restoreCameraFromUrl()` 独立处理 `cv` 编码，避免 OL 坐标恢复逻辑与 Cesium 相机恢复逻辑冲突。

## 8. 竞态保护

双引擎共享一条 URL，多个写回源（OL moveend、Cesium moveEnd、切换调度、定位回写）可能互相覆盖，故设两道守卫。

### 8.1 启动守卫 startupUrlRestoreGuard

`createStartupUrlRestoreGuard` 在分享链接参数尚未应用前暂停 OL 主动写回，避免地图默认视图覆盖 URL：

```js
hasPendingRestore()           // 是否仍存在启动期待恢复参数
markInitialRestoreApplied()   // 标记启动期参数已处理，后续可正常写回
canSyncNow()                  // isUrlSyncEnabled && !initialRestorePending 才允许写回
```

`MapContainer` 的 `syncUrlFromActiveMap` 仅在 `canSyncNow()` 为真时写回；`bindActiveMapViewSync` 在 `hasPendingRestore()` 期间不绑定 moveend；`applyDeferredUrlParams` 在 `flyToView` 之后才 `markInitialRestoreApplied` 并绑定 moveend——避免飞行动画产生的首次 moveend 覆盖分享链接。

### 8.2 抑制下一次同步 suppressNextUrlSync

`useMapState.syncViewFromCesium` 在静默更新隐藏 OL 视图（中心 + zoom）前置 `suppressNextUrlSync = true` 并取消挂起的防抖同步：

```js
suppressNextUrlSync = true;
debouncedSyncUrlFromMap.cancel();
view.setCenter?.(fromLonLat([lng, lat]));
view.setZoom?.(zoom);
```

`syncUrlFromMap` 开头检测到该标志即消费它（置回 `false`）并直接返回，从而避免"隐藏的 2D 面板被 Cesium 等效视图更新后，下一次 moveend 又把 OL 状态写回 URL、覆盖 Cesium 相机编码"的循环覆盖。

### 8.3 写回前的快照比对

OL（`useMapState.replaceUrlQuery`）、Cesium（`useCesiumUrlTracking.replaceUrlQuery`）与 `useMapViewUrlState.replaceMapView` 在 `router.replace` 前都用 `isSameQuerySnapshot` 比对当前快照与目标快照，完全一致则跳过，避免无意义的路由替换。OL 侧还仅在 `view === 'ol'` 时才清除 `cv/heading/pitch/roll`，避免在 Cesium 模式下 OL 残留调用抹掉相机编码状态。

## 9. 局限与升级方向

**现有局限：**

1. **换算依赖视口高度**：`viewScaleConverter` 以视口垂直方向为基准，OL 与 Cesium 容器尺寸不一致（如分屏、面板拖拽后未 `updateSize`）时，往返换算会有可视范围偏差。
2. **姿态码精度有损**：`cv` 姿态码 heading/roll 精度 0.001°、pitch 精度 0.001°，位置/高度依赖明文 `lng/lat/z`（6 位小数 / 两位小数），极端高精度需求下分享还原存在量化误差。
3. **默认正俯视**：OL→Cesium 切换固定写入 `heading:0, pitch:-90, roll:0`，不携带 OL 的旋转角（OL 二维视图本身无相机姿态概念）。
4. **隐藏 OL 常驻内存**：`v-show` 策略使 OL 地图在 3D 模式下仍占用内存与瓦片缓存，长时间停留 3D 时存在资源冗余。
5. **Cesium 卸载即失态**：切回 OL 会销毁 Viewer，3D 场景内的临时数据源、模型、相机历史不保留，再次进入需重新初始化与加载。

**升级方向：**

1. 引入容器尺寸联动（ResizeObserver + `map.updateSize`），在面板拖拽 / 分屏时实时校正换算基准。
2. 评估将姿态码升级为含位置的完整相机码或二进制 Base64，提升精度并缩短 URL。
3. 对 Cesium 采用 `keep-alive` 或 Viewer 复用池，保留 3D 场景状态、减少重复初始化开销。
4. 抽象统一的 ViewState 中间表示（中心 + 高度 + 姿态），让两个引擎都向中间态同步，简化双向链路并便于接入第三引擎。

## 10. 关键常量速查

| 常量 | 值 | 含义 | 所在文件 |
|------|-----|------|---------|
| `WEB_MERCATOR_INITIAL_RESOLUTION` | `(2π×6378137)/256 ≈ 156543.034` | Web Mercator zoom=0 投影分辨率（米/像素） | `viewScaleConverter.js` |
| `DEFAULT_FOVY` | `π/3`（60°） | Cesium 垂直视场角默认值 | `viewScaleConverter.js` |
| `DEFAULT_VIEWPORT_HEIGHT` | 768 | 未传 mapSize 时的视口高度兜底 | `viewScaleConverter.js` |
| `MIN_CESIUM_HEIGHT` / `MAX_CESIUM_HEIGHT` | 1 / 50,000,000 | Cesium 相机高度上下限（米） | `viewScaleConverter.js` |
| `MIN_OL_ZOOM` / `MAX_OL_ZOOM` | 0 / 22 | OL 缩放级别上下限 | `viewScaleConverter.js` |
| `MIN_LAT_SCALE` | `cos(85.05112877980659°) ≈ 0.08726` | 纬度缩放系数下限（防极点 cos→0） | `viewScaleConverter.js` |
| `MAP_VIEW_OL` / `MAP_VIEW_CESIUM` | `'ol'` / `'cesium'` | 引擎常量 | `urlConstants.js` |
| `CAMERA_VIEW_PARAM_KEY` | `'cv'` | Cesium 相机视角 URL 参数键 | `urlConstants.js` |
| `CAMERA_STATE_QUERY_KEYS` | `['heading','pitch','roll']` | 会被编码进 cv 的独立姿态键 | `urlConstants.js` |
| `BASE62_ALPHABET` | 打乱顺序的 62 字符表 | 自定义 Base62 字符表 | `crypto.js` |
| `CESIUM_POSE_PREFIX` | `'p.'` | 姿态码前缀 | `crypto.js` |
| `MIN_CODE_LENGTH` | 8 | 编码最小长度（左填充） | `crypto.js` |
| heading / pitch / roll 位宽 | 19 / 18 / 19 bit | 姿态封包位宽（缩放 ×1000，pitch +90、roll +180 偏移） | `crypto.js` |
| `DEFAULT_CESIUM_URL_HEIGHT` | `'6000000.00'` | OL→Cesium 切换时 z 的兜底相机高度 | `useMapViewUrlState.js` |
| `DEFAULT_CESIUM_HEIGHT` / `LNG` / `LAT` | 6000000 / 104.1954 / 35.8617 | Cesium 默认相机状态（中国中心，6000km） | `useCesiumUrlTracking.js` |
| `DEFAULT_CESIUM_PITCH_DEGREES` | -90 | Cesium 默认俯仰角（正俯视） | `useCesiumUrlTracking.js` |
