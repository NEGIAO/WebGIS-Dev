# OpenLayers ↔ Cesium 双引擎视图尺度高精度双向转换实现规范

## 1. 目标

项目同时使用 OpenLayers（以下简称 OL）和 Cesium 两套地图引擎：

* 2D 模式：OpenLayers
* 3D 模式：Cesium

需要支持以下视图切换：

```text
OL 2D
  ↓
Cesium 3D
```

以及：

```text
Cesium 3D
  ↓
OL 2D
```

核心要求：

1. 两套引擎的视图尺度必须高精度对应。
2. 转换必须尽可能数学可逆。
3. 不允许简单使用一个经验常数建立 `OL zoom ↔ Cesium camera.height`。
4. 不能因为 Cesium 相机高度变化、屏幕尺寸变化、FOV、纬度等因素导致尺度漂移。
5. 必须支持小数 zoom，例如：

   * `5.32`
   * `8.716`
   * `12.00453`
6. 2D → 3D → 2D 后，OL zoom 应恢复到原始值；允许极小浮点误差，但必须通过统一的高精度中间状态保证转换稳定。
7. Cesium → OL → Cesium 也必须保持尺度一致。
8. 需要优先保证“地图实际视觉尺度”一致，而不是机械追求 camera.height 数值一致。
9. 所有转换逻辑必须集中封装，禁止在组件中散落公式。

---

# 2. 最重要的设计原则

## 2.1 禁止直接建立：

```text
OL zoom ↔ Cesium camera.height
```

不能实现成：

```js
cesiumHeight = someConstant * Math.pow(2, -olZoom)
```

然后再：

```js
olZoom = someConstant2 - Math.log2(cesiumHeight)
```

这种设计不可靠。

原因：

Cesium 的 camera.height 并不唯一决定屏幕上的地面尺度。

Cesium 视觉尺度还与以下因素有关：

* 纬度
* Canvas 高度
* Camera FOV
* Camera pitch
* Camera heading
* Camera roll
* 椭球模型
* Terrain
* 当前视锥体
* 地面交点位置

因此不能把：

```text
camera.height
```

当作唯一的“zoom”。

---

# 3. 建立统一的 Canonical View Scale

两套引擎之间必须增加一个统一的中间尺度：

```text
Canonical Ground Resolution
```

定义：

> 当前视图下，屏幕一个像素对应地面实际距离多少米。

单位：

```text
meters / pixel
```

命名建议：

```js
canonicalResolution
```

或者：

```js
groundResolution
```

以后所有转换都经过这个值。

---

# 4. 核心架构

必须实现：

```text
                    ┌──────────────────────┐
                    │ Canonical View Scale │
                    │ groundResolution      │
                    └──────────┬───────────┘
                               │
                ┌──────────────┴──────────────┐
                │                             │
                ▼                             ▼
        OpenLayers                     Cesium
        resolution                    ground scale
                │                             │
                ▼                             ▼
           OL zoom                     Camera state
```

即：

```text
OL zoom
   ↓
OL resolution
   ↓
Canonical Ground Resolution
   ↓
Cesium Camera
```

反方向：

```text
Cesium Camera
   ↓
Canonical Ground Resolution
   ↓
OL resolution
   ↓
OL zoom
```

---

# 5. OpenLayers 的尺度定义

## 5.1 OL zoom 不应该作为最终真值

OL 的：

```js
view.getZoom()
```

只是一个表现层参数。

真正应该作为尺度依据的是：

```js
view.getResolution()
```

因此：

```text
zoom
 ↓
resolution
```

是第一层转换。

---

# 6. EPSG:3857 下 OL zoom → resolution

如果项目使用 Web Mercator：

```text
EPSG:3857
```

且 tileSize：

```text
256
```

则：

$$
R = 6378137
$$

世界周长：

$$
C = 2\pi R
$$

zoom 为 `z` 时，基础分辨率：

$$
resolution_0 =
\frac{2\pi R}{256}
$$

即：

```text
156543.03392804097
```

所以：

$$
resolution(z)
=
\frac{156543.03392804097}{2^z}
$$

代码：

```js
export function olZoomToResolution(
  zoom,
  tileSize = 256,
  earthRadius = 6378137
) {
  const worldSize = 2 * Math.PI * earthRadius;

  return worldSize / (tileSize * Math.pow(2, zoom));
}
```

反向：

$$
z =
\log_2
\left(
\frac{156543.03392804097}{resolution}
\right)
$$

代码：

```js
export function olResolutionToZoom(
  resolution,
  tileSize = 256,
  earthRadius = 6378137
) {
  const worldSize = 2 * Math.PI * earthRadius;

  return Math.log2(
    worldSize / (tileSize * resolution)
  );
}
```

---

# 7. 不允许忽略纬度

Web Mercator 下，地图投影分辨率与真实地面距离存在纬度影响。

设纬度为：

$$
\varphi
$$

则局部地面尺度：

$$
groundResolution
=
resolution_{3857}
\cdot
\cos(\varphi)
$$

因此：

```js
export function webMercatorResolutionToGroundResolution(
  resolution,
  latitude
) {
  const latRad = latitude * Math.PI / 180;

  return resolution * Math.cos(latRad);
}
```

反向：

```js
export function groundResolutionToWebMercatorResolution(
  groundResolution,
  latitude
) {
  const latRad = latitude * Math.PI / 180;

  return groundResolution / Math.cos(latRad);
}
```

注意：

纬度不能直接使用未经检查的任意值。

必须限制：

```text
-85.05112878 <= latitude <= 85.05112878
```

---

# 8. 统一视图状态 ViewState

建立独立的数据结构，例如：

```ts
export interface UnifiedViewState {
  center: {
    longitude: number;
    latitude: number;
    height?: number;
  };

  scale: {
    canonicalResolution: number;
  };

  ol: {
    zoom: number;
    resolution: number;
  };

  cesium: {
    height: number;
    heading: number;
    pitch: number;
    roll: number;
    fovY: number;
  };

  viewport: {
    width: number;
    height: number;
  };
}
```

注意：

真正的 canonical 真值是：

```js
scale.canonicalResolution
```

而：

```js
ol.zoom
ol.resolution
cesium.height
```

都是派生状态。

---

# 9. OL → Canonical

当执行：

```text
2D → 3D
```

首先获取：

```js
const view = map.getView();

const zoom = view.getZoom();
const resolution = view.getResolution();
const center = view.getCenter();
```

不要只读取 zoom。

然后获得当前位置纬度：

```js
const [longitude, latitude] = toLonLat(center);
```

计算：

```js
canonicalResolution =
  resolution * cos(latitude)
```

即：

```js
const canonicalResolution =
  webMercatorResolutionToGroundResolution(
    resolution,
    latitude
  );
```

保存：

```js
UnifiedViewState.scale.canonicalResolution
```

---

# 10. Cesium 任意视角下不能通过 height 直接计算 scale

这是整个实现最重要的一条。

Cesium 如果允许：

```text
pitch
heading
roll
```

变化，则：

```js
camera.positionCartographic.height
```

不能直接代表视觉尺度。

因此必须通过“屏幕像素射线与地面相交”的方法计算真正的 ground resolution。

---

# 11. Cesium Ground Resolution 计算方法

核心思路：

取 Cesium Canvas 中两个非常接近的屏幕像素：

```text
P1 = 屏幕中心
P2 = 屏幕中心右侧 1 pixel
```

分别创建 camera pick ray：

```js
camera.getPickRay(...)
```

然后将射线与地球表面求交。

优先使用：

```js
scene.globe.pick(ray, scene)
```

如果项目场景存在 Terrain，必须优先获得真实 Terrain 地面的交点。

如果 terrain 不可用，再退化到：

```js
viewer.camera.pickEllipsoid(...)
```

或者：

```js
rayEllipsoid
```

---

# 12. 计算 Cesium 实际地面像素分辨率

伪代码：

```js
const centerPixel = new Cesium.Cartesian2(
  canvas.clientWidth / 2,
  canvas.clientHeight / 2
);

const neighborPixel = new Cesium.Cartesian2(
  canvas.clientWidth / 2 + 1,
  canvas.clientHeight / 2
);

const ray1 = viewer.camera.getPickRay(centerPixel);
const ray2 = viewer.camera.getPickRay(neighborPixel);

const point1 = viewer.scene.globe.pick(ray1, viewer.scene);
const point2 = viewer.scene.globe.pick(ray2, viewer.scene);

const groundResolution =
  Cesium.Cartesian3.distance(point1, point2);
```

该值即：

```text
meters / screen pixel
```

这才是 Cesium 当前实际视角下的 canonical scale。

---

# 13. 不要固定使用屏幕正中心

为了避免：

* 中心点没有击中地面
* 中心点落在地平线
* 3D 斜视情况下数值异常

实现时需要加入 fallback。

优先顺序：

```text
1. viewport center
2. viewport center + 小范围偏移
3. 多个候选点取有效结果
4. 如果完全无法求交，使用 camera 高度 + FOV 的退化方案
```

候选点例如：

```js
[
  [0.5, 0.5],
  [0.5, 0.6],
  [0.5, 0.4],
  [0.6, 0.5],
  [0.4, 0.5]
]
```

---

# 14. 像素距离必须非常小

建议：

```text
deltaPixel = 1
```

或者：

```text
deltaPixel = 0.5
```

如果项目对数值稳定性有更高要求，可以测试：

```text
0.5
1
2
```

选择误差最稳定的方案。

但是不要使用很大的像素距离，否则得到的是局部平均尺度，不是真正的局部 ground resolution。

---

# 15. Cesium → Canonical

当执行：

```text
3D → 2D
```

首先：

```text
Cesium Camera
       ↓
screen ray
       ↓
ground intersection
       ↓
1 pixel ground distance
       ↓
canonicalResolution
```

例如：

```js
const canonicalResolution =
  getCesiumGroundResolution(viewer);
```

然后必须根据 OL 地图中心纬度，把 canonical resolution 转回 OL Web Mercator resolution。

---

# 16. Canonical → OL

已知：

```js
canonicalResolution
latitude
```

计算：

```js
const olResolution =
  groundResolutionToWebMercatorResolution(
    canonicalResolution,
    latitude
  );
```

然后：

```js
map.getView().setResolution(olResolution);
```

最后：

```js
const actualZoom =
  map.getView().getZoom();
```

这个 zoom 才作为最终 OL zoom。

---

# 17. Canonical → Cesium

这是 2D → 3D 的核心。

首先从 OL 获得：

```js
canonicalResolution
```

然后根据目标 Cesium 视角计算相机状态。

如果 3D 目标视角规定：

```text
pitch = -90°
heading = 0°
roll = 0°
```

则可以使用解析公式计算高度。

---

# 18. Cesium 正俯视时的高度公式

设：

```text
H = viewport height in pixels
FOV = vertical field of view
G = canonical ground resolution
```

则：

$$
groundSpan =
G \cdot H
$$

对于正俯视：

$$
groundSpan =
2h\tan(FOV/2)
$$

因此：

$$
\boxed{
h =
\frac{G\cdot H}
{2\tan(FOV/2)}
}
$$

代码：

```js
export function groundResolutionToCameraHeight({
  groundResolution,
  viewportHeight,
  fovY
}) {
  return (
    groundResolution * viewportHeight
  ) /
  (
    2 * Math.tan(fovY / 2)
  );
}
```

注意：

Cesium 使用弧度，因此：

```js
fovY
```

必须是 radians。

---

# 19. 任意 pitch 时禁止套用正俯视公式

如果：

```js
Math.abs(pitch + Math.PI / 2) > epsilon
```

即不是正俯视：

不能直接：

```js
height = groundResolution * H /
         (2 * tan(FOV / 2))
```

因为视锥体与地面的交点已经不是简单平面投影。

此时必须使用：

```text
target ground footprint
```

的反向求解。

---

# 20. 任意 pitch 的推荐实现

需要定义：

```text
目标 groundResolution = G
```

然后对相机高度进行数值求解。

过程：

### 第一步

给定一个候选 camera height：

```js
height = H0;
```

### 第二步

计算当前 camera 状态下的实际：

```js
measuredGroundResolution =
getCesiumGroundResolution(viewer);
```

### 第三步

比较：

```text
error =
measuredGroundResolution - targetGroundResolution
```

### 第四步

根据 error 调整 height。

因为通常：

```text
height ↑
groundResolution ↑
```

所以可以使用二分法。

---

# 21. 任意 pitch 使用二分法求相机高度

推荐：

```js
function solveCameraHeight({
  targetGroundResolution,
  minHeight,
  maxHeight,
  tolerance,
  maxIterations
}) {
  let low = minHeight;
  let high = maxHeight;

  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;

    setCameraHeight(mid);

    const measured =
      getCesiumGroundResolution();

    if (
      Math.abs(measured - targetGroundResolution)
      <= tolerance
    ) {
      return mid;
    }

    if (measured < targetGroundResolution) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}
```

但这里存在一个非常重要的实现问题：

每次改变 camera height 都会触发 Cesium 渲染。

因此：

不要在普通视图同步过程中频繁进行大量实时迭代。

---

# 22. 更推荐的策略

### 2D → 3D

如果项目的 3D 初始视角固定为：

```text
pitch = -90°
```

直接解析计算。

### 3D → 2D

实时通过：

```text
screen ray → terrain intersection
```

得到实际 groundResolution。

### 3D 用户自由倾斜时

不要求通过单独的 height 反推唯一 zoom。

直接通过当前 Cesium viewport 的真实地面尺度获得 OL zoom。

这是最稳定的方案。

---

# 23. 双向转换必须区分两个概念

这是实现时必须遵守的原则：

## 23.1 Scale equivalence

要求：

```text
2D scale ≈ 3D scale
```

即视觉尺度一致。

## 23.2 Camera state equivalence

不能要求：

```text
2D → 3D → 2D
```

后：

```text
Cesium camera.height
```

与第一次完全相同。

因为 Cesium camera 存在多个自由度。

真正应该保证的是：

```text
groundResolution
```

一致。

---

# 24. 双向可逆要求

定义：

```text
F:
OL → Cesium
```

```text
G:
Cesium → OL
```

则要求：

$$
G(F(OL)) \approx OL
$$

以及：

$$
F(G(Cesium)) \approx Cesium_{scale}
$$

这里的 Cesium 并不是要求：

```text
position Cartesian
```

全部数值完全一致。

而是：

```text
camera footprint scale
```

保持一致。

---

# 25. 浮点误差处理

禁止直接：

```js
if (a === b)
```

判断转换结果。

提供统一函数：

```js
export function nearlyEqual(
  a,
  b,
  absoluteTolerance = 1e-10,
  relativeTolerance = 1e-10
) {
  const diff = Math.abs(a - b);

  if (diff <= absoluteTolerance) {
    return true;
  }

  return diff <=
    relativeTolerance *
    Math.max(
      Math.abs(a),
      Math.abs(b)
    );
}
```

---

# 26. 必须保留 Canonical 精度

不要这样：

```js
canonicalResolution.toFixed(2)
```

更不能：

```js
parseFloat(resolution.toFixed(2))
```

在内部计算阶段禁止人为截断。

应该：

```text
原始 double precision
       ↓
计算
       ↓
最终显示时才格式化
```

---

# 27. 禁止缓存一个固定 zoom-height 比例

严禁：

```js
const ZOOM_HEIGHT_RATIO = ...
```

或者：

```js
height = 500.5 * Math.pow(2, 5.32 - zoom);
```

这种算法只能在非常固定的实验条件下工作。

项目最终实现不能依赖固定比例。

---

# 28. 需要封装独立模块

建议创建：

```text
src/
  utils/
    viewScale/
      constants.js
      webMercator.js
      openlayersScale.js
      cesiumScale.js
      canonicalScale.js
      conversion.js
      precision.js
      index.js
```

---

# 29. constants.js

至少提供：

```js
export const EARTH_RADIUS = 6378137;

export const DEFAULT_TILE_SIZE = 256;

export const WEB_MERCATOR_MAX_LATITUDE =
  85.0511287798;

export const DEFAULT_PIXEL_DELTA = 1;

export const DEFAULT_ABSOLUTE_TOLERANCE = 1e-10;

export const DEFAULT_RELATIVE_TOLERANCE = 1e-10;
```

---

# 30. API 设计

提供：

```js
olZoomToResolution(...)
```

```js
olResolutionToZoom(...)
```

```js
resolutionToGroundResolution(...)
```

```js
groundResolutionToResolution(...)
```

```js
getCesiumGroundResolution(...)
```

```js
groundResolutionToCesiumHeight(...)
```

```js
cesiumCameraToGroundResolution(...)
```

```js
olViewToCanonicalScale(...)
```

```js
cesiumViewToCanonicalScale(...)
```

```js
canonicalScaleToOlView(...)
```

```js
canonicalScaleToCesiumView(...)
```

---

# 31. 推荐完整转换接口

## OL → Cesium

实现：

```js
convertOlViewToCesium({
  map,
  viewer,
  targetPitch,
  targetHeading,
  targetRoll
});
```

返回：

```js
{
  center: {
    longitude,
    latitude
  },

  canonicalResolution,

  ol: {
    zoom,
    resolution
  },

  cesium: {
    height,
    heading,
    pitch,
    roll
  }
}
```

---

# 32. Cesium → OL

实现：

```js
convertCesiumViewToOl({
  map,
  viewer
});
```

返回：

```js
{
  center: {
    longitude,
    latitude
  },

  canonicalResolution,

  ol: {
    zoom,
    resolution
  },

  cesium: {
    height,
    heading,
    pitch,
    roll
  }
}
```

---

# 33. Center 也必须同步

2D → 3D：

```text
OL center EPSG:3857
        ↓
toLonLat
        ↓
Cesium Cartesian3
```

3D → 2D：

```text
Cesium camera 地面中心
        ↓
Cartographic
        ↓
lon / lat
        ↓
fromLonLat
        ↓
OL center
```

不能只转换 zoom。

---

# 34. 2D → 3D 推荐流程

严格按照：

```text
1. 获取 OL View
2. 获取 center
3. 获取 latitude
4. 获取 resolution
5. resolution → canonicalGroundResolution
6. 构造 Cesium center
7. 根据目标 pitch / FOV / viewport
   计算或求解 camera height
8. 设置 Cesium camera
9. 等待 Cesium 渲染
10. 再次测量实际 groundResolution
11. 检查与 target 是否满足 tolerance
12. 如果误差过大，进行一次校正
13. 完成同步
```

---

# 35. 3D → 2D 推荐流程

严格按照：

```text
1. 获取 Cesium Camera
2. 获取当前地面中心
3. 计算实际 Cesium groundResolution
4. 得到 canonicalGroundResolution
5. 得到中心 latitude
6. canonicalResolution → OL resolution
7. 设置 OL center
8. 设置 OL resolution
9. 由 OL 自己重新计算 zoom
10. 检查结果
```

---

# 36. 2D → 3D → 2D 验证

必须建立自动测试：

```js
const originalZoom = 5.32;

map.getView().setZoom(originalZoom);

const state =
  convertOlViewToCesium(...);

applyCesiumView(state);

const recovered =
  convertCesiumViewToOl(...);

console.log({
  originalZoom,
  recoveredZoom: recovered.ol.zoom,
  difference:
    recovered.ol.zoom - originalZoom
});
```

要求：

```text
abs(recoveredZoom - originalZoom)
```

在定义的 tolerance 范围内。

---

# 37. 建立多组测试数据

至少测试：

```text
zoom = 0
zoom = 1
zoom = 5
zoom = 5.32
zoom = 8.716
zoom = 10
zoom = 12.345
zoom = 15
zoom = 18
zoom = 20
```

纬度至少测试：

```text
0°
15°
30°
40°
45°
60°
80°
```

---

# 38. 测试不同 viewport

至少测试：

```text
1920 × 1080
1366 × 768
1440 × 900
2560 × 1440
3840 × 2160
```

因为 Cesium 视锥体尺度依赖 viewport。

---

# 39. 测试不同 FOV

至少：

```text
30°
45°
60°
75°
90°
```

如果项目运行时 FOV 固定，则至少确认模块动态读取：

```js
viewer.camera.frustum.fovy
```

不要硬编码。

---

# 40. 测试不同 pitch

至少：

```text
-90°
-80°
-70°
-60°
-45°
-30°
```

确认：

```text
camera.height
```

不能直接代表 ground resolution。

---

# 41. Terrain 场景必须测试

分别测试：

```text
关闭 Terrain
开启 Terrain
```

因为：

```js
scene.globe.pick(...)
```

的结果会发生变化。

---

# 42. 性能要求

不要在：

```text
mousemove
wheel
camera.changed
```

事件里每次执行大量 Cesium 射线求交和二分迭代。

必须：

```text
节流 / debounce / requestAnimationFrame
```

例如：

```js
requestAnimationFrame(() => {
  syncViewScale();
});
```

实时同步中优先使用轻量计算。

---

# 43. 精确同步与实时同步分开

建议实现两个模式：

## Mode A：Realtime

用于用户拖动 / 缩放过程中：

```text
低开销
快速估算
```

## Mode B：Precision

用于：

```text
2D → 3D
3D → 2D
模式切换结束
```

执行：

```text
精确 ground resolution
最终校正
```

这样性能和精度兼顾。

---

# 44. 最终必须建立误差报告

每次转换可以在 debug 模式下输出：

```js
{
  source: 'ol',
  target: 'cesium',

  sourceZoom: 5.32,

  sourceResolution: ...,

  canonicalResolution: ...,

  targetCameraHeight: ...,

  measuredGroundResolution: ...,

  scaleError: ...,

  recoveredZoom: ...,

  zoomError: ...
}
```

---

# 45. 重要：不要为了“5.32 → 500.5 → 5.32”硬编码数值

例如原始数据：

```text
OL zoom = 5.32
```

假设某一环境下计算出：

```text
Cesium height = 500.5
```

不能把：

```text
500.5
```

存进配置作为固定映射。

必须由：

```text
zoom
+
latitude
+
viewport
+
FOV
+
camera orientation
```

计算得到。

否则换个屏幕：

```text
1920x1080
```

变成：

```text
2560x1440
```

就会失效。

---

# 46. 关于“严格可逆”的实现定义

本项目中的“可逆”定义为：

### 数学层：

```text
OL zoom
→ OL resolution
→ canonicalResolution
→ Cesium scale
→ canonicalResolution
→ OL resolution
→ OL zoom
```

前后结果误差必须小于 tolerance。

### 视觉层：

2D 和 3D 在同一中心位置附近：

```text
1 pixel
```

对应的地面实际距离必须尽可能一致。

### 不要求：

```text
Cesium camera Cartesian position
```

在转换前后逐 bit 完全一致。

因为二维和三维相机模型不是同构系统。

---

# 47. 推荐的数据流

最终架构应为：

```text
                    ┌─────────────────────────┐
                    │   Unified View State    │
                    │                         │
                    │ canonicalResolution    │
                    │ center                 │
                    └────────────┬────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
             OpenLayers                  Cesium
                    │                         │
              resolution                  Camera
                    │                         │
                 zoom Z                  height/FOV
                    │                         │
                    └────────────┬────────────┘
                                 │
                          Sync Controller
```

---

# 48. 实现时的优先级

按以下顺序实现，不要一开始就把所有复杂情况混在一起。

## Phase 1

完成：

```text
OL zoom
↔
OL resolution
```

并测试高精度双向转换。

## Phase 2

完成：

```text
OL resolution
↔
canonical groundResolution
```

处理纬度。

## Phase 3

完成：

```text
Cesium
→
实际 groundResolution
```

使用：

```text
screen ray
+
terrain/globe intersection
```

## Phase 4

完成：

```text
canonical groundResolution
→
Cesium camera
```

先只支持：

```text
pitch = -90°
```

## Phase 5

增加：

```text
任意 pitch
```

必要时通过数值求解。

## Phase 6

完成：

```text
2D → 3D → 2D
```

自动精度测试。

## Phase 7

完成：

```text
3D → 2D → 3D
```

自动精度测试。

---

# 49. 特别禁止以下实现

禁止：

```js
const height =
  500 *
  Math.pow(2, 5 - zoom);
```

禁止：

```js
zoom =
  Math.log2(
    500 / camera.height
  );
```

禁止：

```js
zoom =
  camera.positionCartographic.height / constant;
```

禁止：

```js
zoom = Math.round(zoom);
```

禁止：

```js
zoom = Number(zoom.toFixed(2));
```

禁止：

```js
resolution = Number(resolution.toFixed(...));
```

禁止把：

```text
500.5
```

作为某个固定 zoom 的永久映射值。

---

# 50. 最终验收标准

必须满足：

### A. OL → Cesium → OL

例如：

```text
原始 OL zoom = 5.32
```

转换：

```text
OL → Cesium → OL
```

结果：

```text
recoveredZoom ≈ 5.32
```

并输出：

```text
zoomError
```

---

### B. Cesium → OL → Cesium

任意 Cesium 相机：

```text
height
heading
pitch
roll
FOV
```

转换：

```text
Cesium → OL → Cesium
```

最终必须满足：

```text
groundResolutionError < tolerance
```

而不是只比较：

```text
camera.height
```

---

### C. Resize

窗口从：

```text
1920 × 1080
```

调整到：

```text
2560 × 1440
```

重新转换后，尺度算法必须仍然成立。

---

### D. Latitude

在：

```text
0°
30°
40°
60°
```

测试结果必须稳定。

---

### E. Fractional Zoom

至少保证：

```text
5.32
8.716
12.345
```

能够正常处理。

---

# 51. 最终实现原则

请严格遵循以下结论：

```text
不要：
OL zoom ↔ Cesium camera.height
```

必须：

```text
OL zoom
   ↓
OL resolution
   ↓
latitude correction
   ↓
Canonical Ground Resolution
   ↓
Cesium actual ground scale
   ↓
Cesium camera
```

反向：

```text
Cesium camera
   ↓
screen ray
   ↓
ground intersection
   ↓
actual Ground Resolution
   ↓
Canonical Ground Resolution
   ↓
latitude correction
   ↓
OL resolution
   ↓
OL zoom
```

其中：

```text
Canonical Ground Resolution
```

是整个系统唯一的尺度中间层。

---

# 52. Agent 的具体执行要求

请直接检查项目现有代码后完成以下工作：

1. 找到 OpenLayers View 创建位置。
2. 找到当前 OL zoom / resolution 获取与设置逻辑。
3. 找到 Cesium Viewer 创建位置。
4. 找到 Cesium Camera 同步逻辑。
5. 找到当前 2D → 3D 切换代码。
6. 找到当前 3D → 2D 切换代码。
7. 找到所有现存的 zoom → height、height → zoom 计算。
8. 删除或废弃现有不可靠的固定比例映射。
9. 建立独立 `viewScale` 工具模块。
10. 建立 `canonicalResolution`。
11. 建立 OL ↔ canonical 转换。
12. 建立 Cesium → canonical 实际地面尺度计算。
13. 建立 canonical → Cesium 相机尺度计算。
14. 接入现有 2D → 3D。
15. 接入现有 3D → 2D。
16. 不改变项目已有的其他地图功能。
17. 不改变已有 URL、图层、瓦片加载、中心点等业务逻辑。
18. 对现有同步流程进行最小侵入式修改。
19. 增加 debug 信息与误差检测。
20. 增加至少一组自动双向精度测试。

---

# 53. Agent 完成后的必须回报内容

修改完成后必须明确说明：

```text
1. 修改了哪些文件
2. 每个文件修改了什么
3. 当前统一尺度变量叫什么
4. OL → Cesium 使用什么公式
5. Cesium → OL 使用什么公式
6. Cesium groundResolution 如何计算
7. 是否支持任意 pitch
8. 是否支持 Terrain
9. 浮点误差 tolerance 设置是多少
10. 2D → 3D → 2D 测试结果
11. 3D → 2D → 3D 测试结果
12. 是否还有已知限制
```

最终代码必须保证：

```text
OL 5.32
    ↓
Cesium
    ↓
OL
```

能够稳定恢复：

```text
≈ 5.32
```

而不能依赖：

```text
固定经验常数
```

或：

```text
zoom ↔ camera.height
```

的一元硬编码映射。

有一个测试方案，需要通过了才行，才算是达标：
1、ol中的z默认为4
2、将ol引擎转换为cesium，z转换为对应的高度值
3、cesium 转换为ol，得到ol中的z值；

4、反复进行2、3步骤且不进行其它干扰操作，观察ol中的z是否有变化，是否可逆；
5、若z出现任何变化，则说明失败，需要重新debug，优化

6、反复进行4、5，直到满足要求，经过ol与cesium的多次转换，z仍然不变，则说明测试成功

针对这个md文档的