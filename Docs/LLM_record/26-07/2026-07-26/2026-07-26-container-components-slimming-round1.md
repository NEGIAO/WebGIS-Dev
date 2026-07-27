# MapContainer / CesiumContainer 容器瘦身·第一轮（V3.4.29）

## 日期和时间

2026-07-26 20:05

## 修改内容

- `MapContainer.vue` 2222 → 2080 行（-142）：抽离两个功能簇为独立 composable（行为零变化的机械抽离，factory 注入依赖）——
  - `composables/map/features/useRuntimeMapTokenPool.js`：运行时天地图 token 池（应用 token 并保留图层可见性/透明度、启动水合、主 token 失效切备用并重试受影响图层）；
  - `composables/map/features/useSharedEntryResolver.js`：分享链接入口识别（新版 s=1 + 旧版 from/shared 兼容）与启动问候逆地理编码。
- `CesiumContainer.vue` 1053 → 915 行（-138）：抽离 `composables/dataImport/useCesiumDataOpsHandlers.js`——13 个数据操作事件处理器（导入/移除/定位/清空/重定位/拉伸高程/贴地高度/样例城市/材质切换/ZIP·文件夹导入/GLTF 坐标弹窗确认与取消）的转发层。
- barrel 注册：`composables/map/features/index.js` 与领域 barrel `composables/map/basemapSystem.js` 同步登记新导出（转发链 map/index.js → 领域 barrel → 模块，缺一不可达）。

## 修改原因

两个容器组件过大（合计 3275 行，script 分别 2000/853 行），违反 Force_command 第 6 条（功能代码不得堆积在容器组件，须封装为单一职责模块）。用户要求优化。

## 事件逻辑链条分析

### 核心症状

MapContainer script 2000 行：35 个 import、84 个顶层 const、32 个函数——大量完整功能实现（token 池 111 行、分享解析 63 行、启动流水线 170 行等）内联在装配层；CesiumContainer 类似（handleData* 一族 161 行）。

### 根本原因

功能随迭代直接落在容器内，未按既有 factory-composable 模式沉淀。

### 受影响模块

- `frontend/src/components/Map/MapContainer.vue`、`frontend/src/components/Cesium/CesiumContainer.vue`
- 新增三个 composable 模块 + 两处 barrel 注册

### 优化处理（抽离原则）

- **机械抽离零行为变化**：函数体逐行搬移，仅把对宿主作用域的引用改为注入参数（ref 传引用、模块级 let 传 get/set 访问器）；
- **晚绑定语义保留**：`monitorLayerTimeout` / `switchLayerById` / `emitBaseLayersChangeBatched` 在宿主中声明晚于工厂调用点，以 getter 延迟解析（与原实现的运行时晚绑定一致，且沿用了仓库既有写法）；
- **TDZ 校验**：工厂参数在创建点求值，已逐一核对所有注入依赖的声明行均早于调用点。

## 优化解决方案（实施步骤）

1. 量化两组件分段（template/script/style）与逐函数行区间，圈定内聚且引用面可控的功能簇；
2. 精读簇内全部外部引用与簇外全部调用点（含二处 `onRuntimeTokenFailure` 注册与启动流水线调用）；
3. 按 factory 模式写模块 → 容器替换为装配调用 → barrel 双层注册；
4. ESLint 全部涉改文件 + barrel 可达性校验。

## 性能指标

无运行时行为变化；容器 script 体积 -280 行，模块可独立测试与复用。

## 测试方案

**静态验证（已执行，全部通过）**：ESLint 对 MapContainer.vue / CesiumContainer.vue / 三个新模块 / 两个 barrel 零告警；barrel 转发链存在性校验通过。

**人工验收步骤**：

1. 2D 地图：正常加载底图；admin 配置的天地图 token 失效时自动切换备用并重试（观察 warning 提示）；
2. 打开分享链接（含 s=1 与旧版 from=share）：分享问候与地址解析正常；
3. 3D 场景：拖拽导入 GeoJSON/GLB、面板执行移除/定位/清空/材质切换/贴地高度/ZIP 与文件夹导入、GLTF 坐标弹窗确认与取消——行为与拆分前一致。

## 后续拆分路线图（建议下一轮）

MapContainer 剩余大簇：`runDeferredStartupTasks`（170 行，启动流水线）、`getInitialViewState`（124 行）、`activateInteraction`（121 行）、`syncAttributeTableMapExtent` 段内联体、尾部 `getMapExtent` 簇（209 行）；CesiumContainer 剩余：`bootCesium/initViewer/reset`（244 行启动簇）、`applyAtmosphereParams` 簇（165 行）、`handleNavTargetSelect`（84 行）。按同一模式逐簇推进可将两容器分别压至 ~1200 / ~500 行。

## 后续补记（同日 20:50）：二轮首簇 + 门禁接入 LocalDev

- 抽离 `composables/map/features/useStartupViewResolver.js`：`getInitialViewState`（URL/默认初始视图）+ `applyDeferredUrlParams`（底图稳定后延迟应用 URL 参数、Cesium 跳过、失败防重试、完成后释放启动守卫并绑定 moveend）。依赖注入齐 TDZ 核对（parseUrlToState@922、startupUrlRestoreGuard@952 均先于装配点@1046；函数声明提升覆盖其余）。两层链下仅登记 features/index.js。MapContainer 约 -57 行。
- `LocalDev.bat`：Step2 前 advisory 运行 `CheckConfigRegistry.py` 与 `CheckStructureTree.py --quiet`（`where python` 守卫，缺 python 静默跳过，不阻塞启动）。
- 备注：挂载环境禁止移动/删除文件，T2 批量分域（utils/features/dataImport 目录改名）留待用户本机执行或后续会话以"新建+引导删除"方式推进。
- 期间并行会话在 MapContainer 引入 `readCachedPreferredBasemap` 的短暂 no-undef（import 半途），复跑 ESLint 已零告警，非本次改动引入。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Map\MapContainer.vue
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\CesiumContainer.vue
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\useRuntimeMapTokenPool.js（新增）
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\useSharedEntryResolver.js（新增）
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\composables\dataImport\useCesiumDataOpsHandlers.js（新增）
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\index.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\basemapSystem.js
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md（树补录三个新模块）
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.29）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.29 版本段）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-container-components-slimming-round1.md（本日志）
