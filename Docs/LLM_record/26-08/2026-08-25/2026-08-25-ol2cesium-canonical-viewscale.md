# 2026-08-25 OL↔Cesium 视图尺度高精度双向转换实现（V3.5.33）

## 日期与时间

2026-08-25 22:40

## 任务等级

L3（规范文档 `Docs/TODO/ol2cesium.md`，用户批准执行；本文档即实施报告）

## 问题分析

- **核心症状**：OL→Cesium 切换后视觉尺度不匹配（中国低缩放视角变极近）；旧转换器往返不可逆。
- **根本原因**：
  1. 直接建立 `OL zoom ↔ camera.height` 一元映射，忽略纬度/视口/FOV/pitch；
  2. 正反向分别委托 OL View 的两个非对称方法；
  3. URL 序列化 2 位小数截断高度精度。
- **受影响模块**：HomeView 引擎切换链路 / MapContainer.syncViewFromCesium / CesiumContainer 相机恢复 / agent 地图适配器。

## 架构（Mermaid）

```mermaid
flowchart TB
    subgraph Canonical[Canonical Ground Resolution<br/>米/屏幕像素 · 唯一尺度真值]
        G((canonicalResolution))
    end
    OL[OL View] -->|zoom| WM[webMercator.js<br/>zoom ↔ resolution₃₈₅₇]
    WM -->|×cosφ| G
    G -->|÷cosφ| WM2[resolution] --> OLZ[zoom = log₂(INIT/res)]
    CS[Cesium Camera<br/>height/pitch/fovY] -->|解析模型<br/>G = 2S·tan(f/2)/vh<br/>S = h/cosθ| G
    G -->|h = G·vh·cosθ/(2t)| CS
    RAYS[屏幕像素射线采样<br/>pickRay→globe.pick→distance] -.Terrain 真值.-> G
```

## 修改内容（按规范 §28 模块化落地于 common/utils/viewScale/）

| 文件 | 内容 |
|---|---|
| constants.js | EARTH_RADIUS/TILE_SIZE/MAX_LAT/PIXEL_DELTA/容差/FOV 默认 |
| precision.js | nearlyEqual（绝对+相对容差）/ 负零归一化 / clamp 工具 |
| webMercator.js | olZoomToResolution / olResolutionToZoom / 纬度修正双向（§6/§7） |
| openlayersScale.js | OL 尺度归一化：resolution 显式优先，zoom 推导兜底（§5） |
| cesiumScale.js | nadir 高度公式（§18）/ 任意 pitch 斜距模型（§19 解析近似）/ 射线测量注入式封装（§11~14）/ solveCameraHeightBinary 二分求解（§21） |
| canonicalScale.js | canonical ↔ OL/Cesium 视图片段（§9/§15/§16/§17） |
| conversion.js | convertOlViewToCesium / convertCesiumViewToOl / olViewToCanonical / cesiumViewToCanonical / canonicalScaleToCesiumView / canonicalScaleToOlView —— 返回 UnifiedViewState（§8/§31/§32） |
| index.js | 桶式导出 SSOT 入口 |

### 接入与兼容

- **HomeView.vue**：`buildCesiumQueryPatchFromOl` 改走 `convertOlViewToCesium`（canonical 链路产出相机高度）；`syncOlFromCesiumPayload` 改走 `convertCesiumViewToOl`（射线实测 Precision 优先，注入 `cesiumContainerRef.measureGroundResolution`）。
- **CesiumContainer.vue**：defineExpose 新增 `measureGroundResolution()`（browserAdapter 射线实测），供 Precision 校正与 §44 误差报告。
- **viewScaleConverter.js**：降级为兼容再导出入口——旧调用方（HomeView/agent 适配器）签名零改动。

### 同批修复（前置遗留）

- useMapViewUrlState：切 Cesium 且 patch 缺 z 时无条件写默认相机高度（z 语义禁止跨引擎复用，根因修复见同日 p2-batch1 日志追加项 11）。

## 修改原因

执行已批准规范：以 Canonical Ground Resolution 为唯一尺度中间层，消除固定经验常数映射（§27/§45 明令禁止），支持任意 pitch 与 Terrain。

## 影响范围

- 2D↔3D 引擎切换的视角同步精度
- agent 地图命令（setMapView/zoom）换算精度
- URL z 参数序列化精度（2dp→6dp，仅 Cesium 高度侧；OL zoom 侧维持 2dp 显示语义）

## 解决方案

见上文架构与文件表。选型理由：射线测量是任意 pitch/Terrain 下唯一真值来源；解析模型作为 Realtime 快路径；二分求解仅在需要时经回调注入使用（§42 性能约束）。

## 性能指标

- 解析模型单次转换 <1µs（纯算术）
- 射线测量 ≤5 组候选 × 2 次 globe.pick，实测浏览器 ~0.1ms 量级（⚠️ 实机数值待录）
- 不在 mousemove/wheel 内做射线迭代；Precision 仅在模式切换结束时执行一次

## 测试方案

### Agent 已执行（viewscale-spec-suite.mjs + viewscale-v2.mjs + z-invert.mjs）
- A. OL→Canonical→OL：10 zoom × 7 lat × 5 viewport × 5 fovY = **1750 组合 max|Δzoom|=0**
- B. Cesium 解析自洽（6 pitch × 2 lat × 2 vp）：max rel err = 1.78e-16
- C. Resize 不变性：canonical 对视口恒定，往返精确
- D. 小数 zoom 5.32/8.716/12.345 正常处理
- E. 射线测量（Terrain 平面 mock）：measured=真实分辨率
- F. solveCameraHeightBinary 收敛至相对容差内
- G. nearlyEqual / 钳制回归
- H. 字符串级互逆：全网格 [0,22]×0.01 共 2201 点通过

### 待用户实机验证
1. 浏览器内 OL 中国低 zoom → 切 3D：globe 视野与中国范围一致
2. 3D 倾斜旋转后切回 2D：中心与比例符合倾斜视线预期
3. 开启 Terrain 服务重复上述两步（globe.pick 路径）
4. 控制台观察 `[ActionRouter]` 无 unsupported 警告

## 变更文件清单

新增：
- frontend/src/domains/common/utils/viewScale/constants.js
- frontend/src/domains/common/utils/viewScale/precision.js
- frontend/src/domains/common/utils/viewScale/webMercator.js
- frontend/src/domains/common/utils/viewScale/openlayersScale.js
- frontend/src/domains/common/utils/viewScale/cesiumScale.js
- frontend/src/domains/common/utils/viewScale/canonicalScale.js
- frontend/src/domains/common/utils/viewScale/conversion.js
- frontend/src/domains/common/utils/viewScale/compat.js
- frontend/src/domains/common/utils/viewScale/browserAdapter.js
- frontend/src/domains/common/utils/viewScale/index.js
- frontend/src/domains/common/utils/viewScale/constants-and-precision.js（聚合入口）

修改：
- frontend/src/domains/common/utils/viewScaleConverter.js —— 重写为兼容再导出 shim
- frontend/src/app/HomeView.vue —— 两处换算接入 canonical 链路；移除失效 import
- frontend/src/domains/cesium/components/CesiumContainer.vue —— expose measureGroundResolution
- frontend/src/domains/ol/url-state/useMapViewUrlState.js —— z 语义跨引擎防护（无条件默认高度）
- Docs/Guide/frontend-structure.md —— viewScale/ 目录树登记

## 遗留与风险

- Terrain 实机测试 ⚠️ 未验证：射线测量接口已按 globe.pick 实现（自动含 Terrain），需连真实地形服务人工复核
- FOV 动态读取：当前经参数注入，若项目后续改用 viewer.camera.frustum.fovy 实时值，仅需在调用处传入
- 任意 pitch 的射线实测校正循环未接自动重试（规范 §34 第 12 步），当前为一次校正；如实测超容差再补一轮迭代

## 已知限制

- 倾斜补偿采用平面地表近似，超大倾角+大范围场景存在曲率级误差（规范 §22 认可此策略）
- WGS84 椭球扁率忽略（R=6378137 球体模型，与 Web Mercator 基准一致）
