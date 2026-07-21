# 2026-06-18 OL/Cesium URL 追踪 Code Review 修复与 Cesium 中国视角高度调整

## 日期和时间

2026-06-18 15:08

## 修改内容

- 继续按照 `immutable-kindling-muffin.md` 方案补齐 OL/Cesium 双向视图同步与 URL 语义重设计：
  - 新增 `frontend/src/utils/map/viewScaleConverter.js`，提供 OL zoom ↔ Cesium camera height 换算。
  - `cv` 新链接改为 `p.<pose>` 姿态-only 编码，旧 full-camera `cv` 继续兼容解码。
  - `view=cesium` 时 `lng/lat/z` 明确表示 Cesium 相机经纬度/高度，不再表示鼠标拾取点。
  - OL → Cesium 切换时用当前 OL center/zoom 计算 Cesium height，并一次性写入 `lng/lat/z/cv`。
  - Cesium → OL 通过 `view-sync` 将 camera height 反算为 OL zoom，静默同步隐藏 2D 视图。
  - 针对用户反馈“Cesium 和 OL 区别太大”，转换器增加纬度 `cos(lat)` 局部比例尺修正，避免 WebMercator 投影米直接当地表米导致中高纬范围偏差。
- 修复暂存区 Code Review 中发现的 OL/Cesium URL 追踪逻辑问题：
  - `shouldUseDefaultCesiumHeight` 未定义导致的 `view=cesium` 切换运行时崩溃。
  - OL 与 Cesium 双写 URL 时 `cv` 相机编码被错误清空的问题。
  - Cesium 鼠标坐标写回与相机 `moveEnd` 写回之间的 `lng/lat/z` 与 `cv` 语义分裂。
  - 三处重复 URL 查询读取实现导致的 hash/query 快照不一致风险。
  - Cesium 侧 `replaceState` 与 OL 侧 `router.replace` 混用导致的路由状态分裂风险。
- 将 Cesium 默认中国居中视角高度从 `15,000,000m` 调整为 `6,000,000m`。
- 抽取 URL 常量与 URL 查询读取工具：
  - `frontend/src/utils/url/urlConstants.js`
  - `frontend/src/utils/url/urlQueryReader.js`
- 处理本次 `npm run lint -- --max-warnings=0` 暴露的 ESLint 问题：
  - 天地图 token 变量未定义。
  - 未使用 import / 变量。
  - 控制字符正则 lint 报错。
  - `console.debug` 不在允许列表。
  - `v-html` 安全 lint 提示显式注释处理。
- 已执行 `npm run lint -- --max-warnings=0` 与 `npm run build` 验证通过。
- 追加修复本轮暂存区复查发现的问题：
  - OL 缩放值 `z=10` 切 Cesium 时被误当作 10 米相机高度。
  - 缺失 `heading/pitch/roll` 被 `Number('')` 解析为 `0`，导致默认俯视角失效。
  - 鼠标拾取坐标写回 URL 时保留旧 `cv`，造成明文坐标与编码相机状态不一致。
  - `isSameQuery()` 只比较局部字段，导致清理 `cv/heading/pitch/roll` 时可能提前 return。
  - Cesium 组件切回 OL 时未卸载，相机监听仍可能继续写 URL。
  - 浏览器前进/后退改变 `view` 后 HomeView 未监听 route 变化。
  - Cesium 鼠标坐标写回增加 300ms 节流，避免高频 `router.replace()`。
- 15:45 追加修复用户反馈的 OL → Cesium 可视范围过度放大问题：
  - 移除 OL → Cesium 单向默认放大系数 `DEFAULT_OL_TO_CESIUM_CALIBRATION = 4.8`。
  - 删除未再需要的 `normalizeOlToCesiumCalibration()`。
  - `olZoomToCesiumHeight()` 改为与 `cesiumHeightToOlZoom()` 共用 `normalizeCalibration()`，保持双向换算互逆。
- 16:44 追加修复本轮暂存区 Code Review 指出的问题：
  - `useMapViewUrlState.js` 显式引入并使用 `MAP_VIEW_CESIUM`，避免 re-export 与内部视图判断语义不清。
  - Router 同一路由 query/hash 变化时也刷新 `urlParamStore`，避免前进/后退或 `router.replace()` 后 pending params 过期。
  - OL zoom 参数校验由 `parseInt` 改为 `parseFloat`，保留 `z=10.75` 等小数缩放精度。
  - Cesium 相机 URL 监听改为 terrain 初始化完成后绑定，且默认不立即写回 URL，避免初始化阶段覆盖分享链接。
  - 删除空实现的 `syncUrlFromPickedCoordinate()` 和对应鼠标拾取写 URL 入口，明确 `lng/lat/z` 只由相机状态维护。
  - 删除 Cesium URL 追踪 composable 中永远为 `null` 的 OL 等效视图计算死路径，由 `HomeView` 统一换算。
  - Cesium 动态组件加载成功后再写入 `view=cesium`，避免加载失败时 URL 与 UI 状态不一致。
  - `AbortManager` 恢复使用 `console.debug`，减少正常 abort 控制流在开发环境中的 warning 噪声。
  - `Message.vue` 的 `v-html` 注释改为强调 `escapeHtml` 安全边界。
- 17:36 追加修复生产构建阻断问题：
  - `useSharedResourceLoader.ts` 的 `import.meta.glob('/public/ShareData/**/*', { query: '?url' })` 在 Windows + 中文文件名场景下被 Rollup 解析为非法绝对盘符模块 ID。
  - 改为相对 glob `../../public/ShareData/**/*`，并扩展 `normalizeResourcePath()` 对相对 public 路径的清洗。
  - `SHARED_RESOURCE_DIR` 改为基于 `import.meta.env.BASE_URL` 拼接 `/ShareData`，兼容不同 Vite base 部署路径。

## 修改原因

### 事件逻辑链条分析

1. **核心症状**
   - 用户反馈暂存区中存在大量 ESLint 错误，并指出 URL 解析与编码链路仍有问题。
   - Code Review 发现 `useMapViewUrlState.js` 引用了未定义的 `shouldUseDefaultCesiumHeight`，切换 Cesium 时会直接抛 `ReferenceError`。
   - Cesium URL 中同时存在 `lng/lat/z` 与 `cv` 时，两者可能分别代表鼠标点与相机位置，分享链接恢复结果不确定。
   - OL 地图隐藏后仍可能通过残余 URL 同步调用清空 Cesium 的 `cv` 参数。
   - Cesium 默认高度 `15,000,000m` 过高，进入 3D 时看到偏全球视角，而不是中国居中视角。
   - 初始 OL zoom ↔ Cesium height 转换未修正 EPSG:3857 的纬度比例尺，WebMercator 投影米在中高纬会明显大于真实地表距离，导致 2D/3D 视觉范围偏差。
   - 用户复测反馈：当前 Cesium → OL 已经基本正常，但 OL → Cesium 时 3D 视角“放大的太大了”，切换后可视范围明显不一致。

2. **根本原因**
   - URL 读取、URL 写入、视图常量分散在多个文件中重复实现，缺少统一入口。
   - OL 与 Cesium 使用不同 URL 写入机制：OL 使用 Vue Router，Cesium 与视图切换使用 `history.replaceState`，导致 `route.query` 与实际 hash query 可能短暂分裂。
   - `z` 参数在 OL 中表示缩放层级，在 Cesium 中表示相机高度，缺少明确的视图分支保护。
   - Cesium 相机状态与鼠标拾取坐标共用明文 `lng/lat/z`，但原实现没有保证这些明文坐标与 `cv` 编码相机状态同步。
   - 历史 ESLint 问题被本次全量 lint 暴露，需要一并收敛。
   - OL → Cesium 单独使用 `4.8` 作为默认校准因子，而 Cesium → OL 使用默认因子 `1`，双向公式不再互逆；在 OL 切入 Cesium 时，相机高度被额外放大约 4.8 倍，直接导致 3D 可视范围过大。
   - Router 对同一路由 query-only 导航提前返回，导致 URL 动态变化不会同步刷新 `urlParamStore`。
   - Cesium 初始化后立即执行相机 URL 写回，可能在分享链接恢复尚未稳定时覆盖原始 `cv/lng/lat/z`。
   - 鼠标拾取 URL 同步函数已退化为空实现，但调用入口仍存在，造成 API 语义误导。
   - `useUrlParamStore` 使用 `parseInt` 解析 OL zoom，导致小数缩放级别在刷新/分享恢复时被截断。
   - `import.meta.glob('/public/ShareData/**/*?url')` 在 Windows 环境下对中文资源路径产生非法模块 ID，导致生产构建失败。

3. **受影响模块**
   - URL 参数管理：`useMapState.js`、`useMapViewUrlState.js`、`useUrlParamStore.ts`
   - Cesium 视角恢复与追踪：`useCesiumUrlTracking.js`、`useCesiumSceneActions.js`、`CesiumContainer.vue`
   - 页面视图切换：`HomeView.vue`、`MapContainer.vue`
   - URL 编解码：`crypto.js`
   - 辅助工具与 lint 修复：`TOCPanel.vue`、`Message.vue`、`abortManager.js`、`batchProcessor.js` 等

## 影响范围

- 前端 URL 分享与刷新恢复链路：`view=ol|cesium`、`lng/lat/z/l`、`cv`、`heading/pitch/roll`。
- Cesium 初始相机位置：默认仍位于中国中心 `104.1954, 35.8617`，高度改为 `6,000,000m`。
- OL 地图 URL 同步：仅在 OL 视图下清理 Cesium 专属参数，避免隐藏面板覆盖 3D 状态。
- Cesium URL 同步：相机停止移动时同时写入 `cv` 和相机位置的 `lng/lat/z`。
- 前端 lint/build 质量门禁。

## 优化解决方案

1. **统一 URL 常量**
   - 新增 `urlConstants.js`，集中维护：
     - `MAP_VIEW_OL`
     - `MAP_VIEW_CESIUM`
     - `CAMERA_VIEW_PARAM_KEY`
     - `CAMERA_STATE_QUERY_KEYS`
     - `normalizeMapView()`

2. **统一 URL 查询读取**
   - 新增 `urlQueryReader.js`，集中处理：
     - `readHashQueryValue()`
     - `getCurrentQuerySnapshot()`
     - `readQueryValue()`
   - 约定 hash query 优先于 `route.query`，避免各模块实现漂移。

3. **修复视图切换崩溃**
   - `useMapViewUrlState.js` 中补齐 `shouldUseDefaultCesiumHeight()`。
   - 当切换到 Cesium 且 `z` 无效时默认写入 `6000000.00`。

4. **统一 URL 写入机制**
   - Cesium URL 追踪与视图切换使用 `router.replace()`，与 OL 侧保持一致。
   - 减少 `window.history.replaceState` 与 Vue Router 状态不同步的风险。

5. **修复 OL/Cesium 参数竞态**
   - `useMapState.js` 只在 `nextQuery.view === 'ol'` 时删除 `cv/heading/pitch/roll`。
   - 避免 OL 残余调用错误清空 Cesium 相机状态。

6. **修复 Cesium 明文坐标与 `cv` 语义分裂**
   - `syncCameraViewToUrl()` 同时写入：
     - `view=cesium`
     - `cv=<encoded camera>`
     - `lng/lat/z=<camera position>`
   - 鼠标拾取坐标写回时显式清除旧 `cv`，并使用 300ms 节流，避免高频路由更新和相机/鼠标状态交叉污染。
   - 保证分享链接中编码相机与明文坐标不会长期指向两个不同状态。

7. **调整 Cesium 中国默认视角**
   - `DEFAULT_CESIUM_HEIGHT`、`DEFAULT_CESIUM_URL_HEIGHT`、`flyToHome()` 高度统一为 `6,000,000m`。
   - 保持中国中心经纬度不变。

8. **Lint 收敛与复查修复**
   - 修复未定义 token、未使用变量、控制字符正则、console debug、v-html lint 提示等问题。
   - URL 写入改为完整 query 快照比较，避免只比较 `nextQuery` 时跳过清理字段。
   - 切回 OL 时卸载 CesiumContainer，确保 Cesium 相机 URL 监听随组件卸载清理。
   - HomeView 增加 `view` 路由同步 watcher，支持浏览器前进/后退后的 2D/3D 面板同步。

9. **修复 OL → Cesium 单向过度放大**
   - 保留 `calibration` 作为显式外部校准入口，但默认值统一为 `1`。
   - `olZoomToCesiumHeight()` 与 `cesiumHeightToOlZoom()` 使用同一校准归一化逻辑：
     - OL → Cesium：`height = visibleMeters / (2 * tan(fovy / 2)) * factor`
     - Cesium → OL：`visibleMeters = height * 2 * tan(fovy / 2) / factor`
   - 避免内置单向经验系数破坏双向一致性；后续如需针对具体场景微调，应通过调用方显式传入同一个 `calibration`。

10. **追加修复暂存区 Code Review 问题**
   - Router 在 `beforeEach` 开头统一提取 home 路由 URL 参数，同一路由 query-only 更新只跳过鉴权和 loading，不跳过 pending params 刷新。
   - `validateZoom()` 改用 `parseFloat()`，保持 OL URL `z` 小数精度。
   - Cesium URL 监听在底图/地形初始化后绑定，默认 `initialSync=false`，避免初始化 setView 立即覆盖分享链接。
   - 删除空实现的鼠标拾取 URL 写入 API，并移除 `CesiumContainer` 的 `onCoordinatePick` 传入。
   - 删除 Cesium URL 追踪内部 OL 等效视图计算死路径，统一由 `HomeView.syncOlFromCesiumPayload()` 使用实际 `MapContainer` ref 换算。
   - `setMapView('cesium')` 调整为 Cesium 组件加载成功后再写 URL；失败则保持当前 OL URL/UI 状态。
   - `AbortManager` 正常中断日志恢复为 `console.debug`，`Message.vue` 补充 `escapeHtml` 安全边界说明。
   - `useSharedResourceLoader.ts` 改用相对 glob 扫描 public 资源，运行时加载路径统一从 `BASE_URL/ShareData` 读取。

## 性能指标

- 本次主要为正确性与稳定性修复，不涉及运行时性能优化。
- `npm run build` 完成时间：约 23.90s。
- 构建保留 Vite 原有 chunk size warning，非本次变更引入。

## 测试方案

### 已执行

```bash
cd frontend
npm run lint -- --max-warnings=0
npm run build
```

结果：
- ESLint：通过，0 errors / 0 warnings。
- Vite build：通过。
- 构建提示：`index.html` 中非 module script 与部分 chunk 超 300k，为既有 Vite warning，不阻断构建。

### 建议人工验证

1. 访问 `#/home?view=cesium`：
   - 不应出现 `ReferenceError: shouldUseDefaultCesiumHeight is not defined`。
   - 初始视角应为中国中心，高度约 `6,000,000m`。
2. 在 Cesium 中拖拽视角后停止：
   - URL 应同时包含 `view=cesium`、`cv`、`lng`、`lat`、`z`。
   - `lng/lat/z` 应代表当前相机位置而非旧鼠标点。
3. 从 Cesium 切换回 OL：
   - 仅显式切回 OL 时清除 `cv`。
4. 从 OL 切换到 Cesium 再刷新：
   - 应恢复 3D 面板。
5. 复制 Cesium URL 到新标签：
   - 应恢复相机位置与姿态。
6. 从 OL 切换到 Cesium：
   - 3D 初始可视范围不应再比 OL 当前范围额外放大数倍。
   - 在同一中心点附近来回切换 OL/Cesium，视野范围应保持近似一致。
7. 浏览器前进/后退切换同一路由 query：
   - `urlParamStore` 应刷新为当前 URL 参数，不应保留旧 view/z。
8. 模拟 Cesium 动态 import 失败：
   - URL 不应提前变为 `view=cesium`。
9. 访问带小数 zoom 的 OL 链接（如 `z=10.75`）：
   - 刷新恢复后缩放级别不应被截断为整数。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\url\urlConstants.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\url\urlQueryReader.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\url\crypto.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\useMapViewUrlState.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\useMapState.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\composables\useCesiumUrlTracking.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\composables\useCesiumSceneActions.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\CesiumContainer.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\composables\useCesiumInteractions.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Map\MapContainer.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\views\HomeView.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\router\index.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\useUrlParamStore.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Layer\TOCPanel.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Shell\Message.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\feng-shui-compass-svg\feng-shui-compass-svg.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\auth\useAuthIdentity.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\abortManager.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\gis\batchProcessor.js`
- `D:\Dev\GitHub\WebGIS_Dev\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\backend\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\Docs\26-06\26-06-18\2026-06-18-ol-cesium-url-review-fix.md`
