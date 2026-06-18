# 2026-06-18 z 参数精度链路修复

## 日期和时间

2026-06-18 17:46

## 修改内容

- 检查 `z` 参数在 URL、OpenLayers 视图、Cesium 相机高度、2D/3D 切换换算链路中的精度传递。
- 按用户要求将 URL 展示/分享链路中的 `z` 统一保留两位小数，避免过长参数，同时确认读取与视图应用链路不发生整数化。
- 修复 OL/Cesium 换算工具默认 clamp 导致的不可逆截断问题，保留显式 clamp 工具给边界保护使用。
- 同步根目录、前端、后端 README 的结构树与本次维护说明。

## 修改原因

用户反馈需要检查“链路中 z 参数有没有损失精度”。经排查发现读取链路使用 `Number()` / `parseFloat()`，没有 `parseInt` 整数化；写回链路按产品期望保留两位小数属于可接受展示精度，真正需要修复的是 OL/Cesium 换算函数默认 clamp 导致的范围截断。

## 问题事件逻辑链条分析

### 核心症状

- OpenLayers 的浮点 zoom（例如 `12.345678`）写入 URL 后变为 `12.35`。
- Cesium camera height（例如 `1234567.891234`）写入 URL 后变为 `1234567.89`。
- 2D/3D 切换时 `z` 的语义已正确区分为 OL zoom 或 Cesium height，但 query patch 仍将 `z` 格式化到 2 位小数。
- `viewScaleConverter.js` 文件说明强调互逆精度，但函数内部默认 clamp，可能在 zoom 超过 22 或 height 越界时直接截断。

### 根本原因

- `useMapState.js` 的 `buildQuery()` 将 OL zoom 写回为 `formatNumber(zoom, 2)`。
- `HomeView.vue` 的 OL→Cesium、Cesium→OL query patch 对 `z` 使用 `toFixed(2)`。
- `useCesiumUrlTracking.js` 的 Cesium camera URL 同步对 `z` 使用 `formatNumber(safeHeight, 2)`。
- `viewScaleConverter.js` 将解析与范围保护耦合，默认执行 `clampOlZoom()` / `clampCesiumHeight()`，使换算函数在主链路中存在有损截断。

### 受影响模块

- 前端 URL 状态同步：`frontend/src/composables/useMapState.js`
- 2D/3D 视图切换：`frontend/src/views/HomeView.vue`
- Cesium URL 追踪：`frontend/src/components/Cesium/composables/useCesiumUrlTracking.js`
- OL/Cesium 视图换算：`frontend/src/utils/map/viewScaleConverter.js`
- 文档结构同步：`README.md`、`frontend/README.md`、`backend/README.md`

### 优化处理与解决方案

1. 新增或调整链路专用数字格式化函数，区分“显示格式”和“换算内部精度”。
2. `lng/lat` 仍保留 6 位小数，`z` 按用户要求统一保留 2 位小数，避免 URL 参数过长。
3. OL/Cesium query patch 中的 `z` 统一走 `formatZParam()`，避免散落 `toFixed(2)` 造成维护不一致。
4. `viewScaleConverter.js` 中换算函数默认只校验有限数，不做范围截断；新增 `clamp` 可选项，调用方需要边界保护时显式开启。
5. 更新注释说明：主链路保留换算精度，显式 clamp 才是有损行为。

## 影响范围

- 前端 URL 分享链接的 `z` 参数统一为两位小数，满足用户对“高精度但不要太长”的要求。
- 2D/3D 切换时 `z` 参数的语义不变：`view=ol` 表示 OL zoom，`view=cesium` 表示 Cesium camera height。
- 后端无业务代码变更，仅 README 按规范同步说明本次前端修复。

## 性能指标

- 本次不涉及性能优化；仅改变 URL 参数格式化和换算截断策略。
- 预期额外运行时开销为常数级字符串格式化，影响可忽略。

## 测试方案

1. 静态检查：确认 `z` 写回集中走 `formatZParam()`，输出两位小数且没有 `parseInt` 整数化。
2. 构建检查：运行前端构建或语法检查，确保新增/修改 JS 无语法错误。
3. 手动验证：
   - 在 `view=ol` 链接中输入浮点 `z`，移动/切换后观察 URL 保留两位小数。
   - 在 `view=cesium` 下移动相机，观察 `z` camera height 保留两位小数。
   - 执行 OL→Cesium→OL 切换，确认 zoom/height 换算不被默认 clamp 截断且页面不崩溃。

## 修改的文件路径

- `d:/Dev/GitHub/WebGIS_Dev/frontend/src/composables/useMapState.js`
- `d:/Dev/GitHub/WebGIS_Dev/frontend/src/views/HomeView.vue`
- `d:/Dev/GitHub/WebGIS_Dev/frontend/src/components/Cesium/composables/useCesiumUrlTracking.js`
- `d:/Dev/GitHub/WebGIS_Dev/frontend/src/utils/map/viewScaleConverter.js`
- `d:/Dev/GitHub/WebGIS_Dev/README.md`
- `d:/Dev/GitHub/WebGIS_Dev/frontend/README.md`
- `d:/Dev/GitHub/WebGIS_Dev/backend/README.md`
- `d:/Dev/GitHub/WebGIS_Dev/Docs/26-06/26-06-18/2026-06-18-z-parameter-precision-fix.md`
