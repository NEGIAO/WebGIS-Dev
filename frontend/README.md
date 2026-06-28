# WebGIS 前端项目 — v3.3.13

## 📝 2026-06-28 LLM 参数动态配置管理（管理员后台）

管理员控制台新增 LLM 参数配置面板 (`AdminControlPanel.vue`)，支持动态修改后端运行时读取的 Agent 对话参数，修改后**无需重启服务即时生效**。

**核心特性：**
- 🆕 **可配置参数**：Base URL、Model、Available Models 列表、Timeout、Max Tokens、Temperature (1.0)、Top P (0.95)、Extra Body (JSON)、System Prompt、Stream、Guest/Registered 每日额度
- 🆕 **后端动态读取机制**：所有参数存储在数据库 `system_config` 表，后端运行时实时读取，前端 AI 助手、Agent 对话、模型列表等功能统一使用这些配置
- 🔧 **默认参数已标准化**：Temperature=1、Top P=0.95、Max Tokens=32768、Extra Body 包含 `chat_template_kwargs.enable_thinking=true` 和 `reasoning_budget=16384`
- 🔧 **前后端链路一致性**：`ApiKeysManagementPanel.vue`、`ChatPanelContent.vue` 均从后端动态获取配置，彻底消除硬编码

**涉及文件：**
- `frontend/src/components/UserCenter/AdminControlPanel.vue` - 新增 LLM 配置面板
- `frontend/src/components/UserCenter/ApiKeysManagementPanel.vue` - 默认参数对齐
- `frontend/src/components/Chat/ChatPanelContent.vue` - 运行时使用动态配置
- `backend/api/agent_chat/constants.py` - 后端默认常量
- `backend/api/agent_chat/db.py` - 数据库读写逻辑
- `backend/api/agent_chat/routes.py` - Admin API 端点

详见维护日志 `Docs/26-06/26-06-28/2026-06-28-llm-dynamic-config.md`。

## 📝 2026-06-27 PlayerController 全面优化（动画混合 + 移动手感 + 相机平滑 + GC 优化）

对人物漫游控制器进行四维度全面优化，提升动画流畅度、移动手感、相机跟随和性能：

* 🆕 **crossfade 动画混合**：`playByName` 支持 150ms crossfade 过渡，消除动画硬切
* 🆕 **跳跃超时保护**：`jumpStart` 超过 2s 未完成事件，强制推进到 `jumpLoop`
* 🆕 **输入变化检查**：`setAnimationByPressed` 构造输入哈希，无变化则跳过调用
* 🆕 **smoothDamp 加速**：使用临界阻尼弹簧模型替代线性加速度，实现缓入缓出
* 🆕 **空中控制衰减**：`airControl=0.3`，空中加速度降为地面 30%，保留惯性感
* 🆕 **跳跃速度叠加**：`velU = max(velU, 0) + jumpHeight`，保留起跳前运动状态
* 🆕 **落地缓冲**：`velU *= landingDamping(0.3)`，模拟软着陆
* 🔧 **弹簧时间平滑**：`updateSpringTimeBySpeed` 改为 smoothDamp，冲刺/行走切换无跳变
* 🔧 **碰撞恢复优化**：`collisionLerp` 从 0.18 降至 0.12，减少相机微抖
* 🔧 **越肩视角过渡**：新增 `_overShoulderOffset`，smoothDamp 平滑横移量（0.2s）
* 🔧 **消除冗余 fetch**：使用 `Model.boundingSphere` 获取包围盒，无需二次网络请求
* 🔧 **GC 优化**：`composeModelMatrixLookAt` + `getCameraDirEnu` 使用预分配 scratch 对象

详见维护日志 `Docs/26-06/26-06-27/2026-06-27-player-controller-optimization.md`。

## 📝 2026-06-27 Cesium 体积云模块彻底删除

彻底清除 Cesium ECEF 球壳体积云的所有代码和依赖，为全新模块集成做准备：

* 🗑️ **删除 cloud/ 目录**（4 个文件：cloudShader / cloudPresets / cloudControls / useVolumetricCloud）
* 🔧 **CesiumAdvancedEffects.vue**：删除体积云 import、composable 解构、GUI toggle、Stage 初始化/更新/降级/清理
* 🔧 **useCesiumToolModules.js**：删除 cloud/ import、cloudParams、云控件定义、isCloudControlId 处理块
* 🔧 **CesiumToolPanel.vue**：删除 Cloud 图标导入和 clouds 图标映射
* ✅ **保留**：ShallowWater Three.js 云 Dome（独立系统）、Tellux 大气系统云控件

详见维护日志 `Docs/26-06/26-06-27/2026-06-27-volumetric-cloud-complete-removal.md`。

## 📝 2026-06-27 体积云代码模块化提取 → TypeScript 重构

将 Cesium 主场景体积云代码从 `CesiumAdvancedEffects.vue` 和 `useCesiumToolModules.js` 提取到独立 `Cloud/` TypeScript 模块：

* 🆕 **Cloud/CloudManager.ts**：体积云管理器（PostProcessStage 生命周期 + 质量切换 + 降级）
* 🆕 **Cloud/CloudPresets.ts**：质量预设（low/medium/high/ultra）+ 默认参数
* 🆕 **Cloud/CloudUniforms.ts**：GPU Uniform 缓冲区管理
* 🆕 **Cloud/cloudIntegration.ts**：Cesium 场景集成
* 🆕 **Cloud/composables/useVolumetricCloud.ts**：Vue composable（init/update/cleanup）
* 🆕 **Cloud/shaders/**：4 个 GLSL Shader（cloudFragment / cloudVertex / noise / utils）
* 🆕 **Cloud/textures/**：4 个纹理资源（weather / shape / shape_detail / turbulence）
* 🔧 **CesiumAdvancedEffects.vue**：删除体积云代码，改为调用 Cloud/ 模块
* 🔧 **useCesiumToolModules.js**：体积云控件重构为独立 `cloudParams`

详见维护日志 `Docs/26-06/26-06-27/2026-06-27-volumetric-cloud-extract.md`。

## 📝 2026-06-27 洪水模拟功能

水体流体模块新增洪水模拟，通过控制中心统一接入：

* 🆕 **洪水模拟按钮**：`useCesiumToolModules.js` 控制中心新增 `floodSim` 动作，运行时高亮为「停止洪水」
* 🆕 **动态速度滑块**：默认速度 = 水位值域 ÷ 10（10s 完成），范围 [值域/100, 值域/1]，显示 `m/s（完成时间s）`
* 🆕 **FluidSimulationPanel.vue**：`requestAnimationFrame` 驱动水位自动上涨，到达最大值自动停止
* 🆕 **生命周期安全**：cleanup / onBeforeUnmount / clearFluid 均停止动画

详见维护日志 `Docs/06-27/2026-06-27-flood-simulation-button.md`。

## 📝 2026-06-27 漫游坐标显示 + 相机速度联动

* 🆕 **漫游坐标显示**：漫游模式下实时显示人物世界坐标
* 🆕 **相机速度联动** (`CameraSystem.ts`)：`updateSpringTimeBySpeed()` 根据玩家速度动态调整弹簧相机时间，速度越快跟得越紧

## 📝 2026-06-27 漫游导航指引

人物漫游模式新增导航方向指引系统：

* 🆕 **NavGuideHUD.vue**：屏幕顶部 HUD 组件，显示目标名称 + 方向箭头（CSS rotate）+ 实时距离，到达（< 10m）变绿提示，有目标即显示（不依赖漫游状态）
* 🆕 **NavTargetDialog.vue**：三选一对话框（搜索地点 / 选择数据要素 / 地图点选），点击「设置导航」弹出
* 🆕 **导航状态** (`usePlayerController.js`)：`navTarget` ref + `setNavTarget`/`clearNavTarget`/`startNavPick`/`openNavDialog` 方法，每帧 Haversine 距离/方位计算
* 🆕 **三种目标来源**：地图点选（ScreenSpaceEventHandler）、搜索选点（HomeView → CesiumContainer prop）、数据要素点击（scene.pick 优先检测 entity）
* 🆕 **Cesium Selection Indicator**：设置目标时自动 `viewer.selectedEntity` 持久聚焦（不随漫游停止清除）
* 🔧 **useCesiumToolModules.js**：人物漫游模块新增「设置导航」「清除导航」action（不受漫游状态限制）
* 🔧 **HomeView.vue**：搜索选点结果在 3D 模式下自动传递为导航目标

详见维护日志 `Docs/06-27/2026-06-27-nav-guide-hud.md`。

## 📝 2026-06-26 人物漫游控制器集成（第一/第三人称 + Rapier 物理碰撞）

集成 `cesium-player-controller` 库，实现 3D 场景中的人物漫游功能：

* 🆕 **PlayerController 模块** (`components/Cesium/PlayerController/`)：完整移植 12 个源文件，包含核心控制器、物理系统、相机系统、输入系统、动画系统、坐标变换工具
* 🆕 **Rapier 物理碰撞**：`@dimforge/rapier3d-compat` 胶囊体碰撞 + 地形高度场采样 + 射线避障
* 🆕 **第一/第三人称切换**：V 键切换视角，第三人称弹簧阻尼跟随 + 过肩视角 + 滚轮缩放
* 🆕 **飞行模式**：F 键切换飞行，无地形时自动进入飞行模式悬浮移动
* 🆕 **操作提示面板** (`PlayerGuidePanel.vue`)：右上角悬浮键位说明条，实时显示当前视角和飞行状态
* 🆕 **控制台调试参数**：CesiumToolPanel 人物漫游模块新增行走速度/飞行速度/重力/跳跃高度/鼠标灵敏度滑块
* 🆕 **Cesium ESM 垫片** (`src/cesium-shim.js`)：桥接 CDN Cesium 与 npm ESM 导入，Vite alias 映射
* 🔧 **Vite 配置**：添加 `resolve.alias['cesium']` + `optimizeDeps.exclude['cesium']`，消除 CDN/npm 双实例冲突
* 🔧 **地形碰撞自适应**：有地形时创建碰撞体可行走，无地形时自动飞行模式 + 最低高度保护
* 🐛 **修复 ArcGIS 地形无法识别**：新增 `ArcGISTerrainProvider` 增强包装器（参照天地图 `GeoTerrainProvider` 补充 `availability` + `getTileDataAvailable`），使 `sampleTerrainMostDetailed` 原生支持 + 降级兜底

详见维护日志 `Docs/26-06/26-06-26/2026-06-26-player-controller-integration.md`。

## 📝 2026-06-26 热带浅水控件显示修复

修复热带浅水控件无法正确显示在控制面板中的问题：

* 🐛 **修复 `type: 'info'` 分隔符控件处理**：LilGuiControls.vue 中缺少对分隔符类型控件的特殊处理，导致分隔符被当作普通文本输入框处理。现在分隔符控件渲染为带样式的标题分隔线。
* 🔧 **补充 `shallowWater` 模块图标映射**：CesiumToolPanel.vue 中添加 `Waves` 图标导入和 `shallowWater` 模块/操作图标映射。

详见维护日志 `Docs/06-26/2026-06-26-shallow-water-controls-fix.md`。

## 📝 2026-06-26 大气系统清理 + 场景美化 + 高度阈值

完全移除 `AtmosphereManager`（Tellux 移植的大气系统），新增场景美化模块和大气高度阈值：

* 🗑️ **删除 atmosphere 目录**：移除 AtmosphereManager、DayNightTransition、MoonLightSystem 等 14 个文件
* 🆕 **useCesiumBeautify.js**：HDR + PBR_NEUTRAL 色调映射 + FXAA + 定向光 + 天空大气微调，控制面板可调
* 🆕 **大气高度阈值**：相机低于 800m 自动关闭大气增强，避免与晨昏半球冲突
* 🔧 **晨昏半球无限高度**：`lightingFadeOutDistance` / `nightFadeOutDistance` 改为 MAX_SAFE_INTEGER
* ✅ **保留基础功能**：`configureSolarLighting`、`baseAtmosphereParams`、`CesiumAdvancedEffects`

详见维护日志 `Docs/26-06/26-06-26/2026-06-26-cesium-terminator-fix.md`。

## 📝 2026-06-26 Tellux 大气渲染系统完整移植

从 Tellux 项目完整移植大气渲染系统，替换原有的 Clouds 实现：

* 🆕 **日夜过渡系统**：基于太阳高度角的平滑过渡，使用 `smoothstep` 插值算法
* 🆕 **月光照明系统**：月光方向光 + 环境光，支持月相计算和可见性判断
* 🆕 **月相计算器**：基于太阳-月亮相量点积计算月相因子（0=新月，1=满月）
* 🆕 **体积云渲染器**：基于 Cesium PostProcessStage 的 raymarching 实现，支持日夜过渡
* 🆕 **星空渲染器**：基于相机高度和夜间因子控制星空可见性
* 🆕 **大气管理器**：协调所有子系统，提供统一 API
* 🆕 **UI 控制面板**：Vue 组件，提供大气效果控制界面
* 🔧 **替换原有体积云实现**：废除旧的 `Clouds/` 目录，使用新的大气系统

**大气系统目录结构**：
```
Cesium/atmosphere/
├── shaders/                          # GLSL shader
│   ├── cloudVertex.glsl              # 云层 vertex shader
│   ├── cloudFragment.glsl            # 云层 fragment shader（FBM + HG 相位函数）
│   └── cloudShaders.js               # shader 导入文件
├── AtmosphereManager.js              # 主管理器
├── DayNightTransition.js             # 日夜过渡系统
├── MoonLightSystem.js                # 月光照明系统
├── MoonPhaseCalculator.js            # 月相计算
├── VolumetricCloudRenderer.js        # 体积云渲染
├── StarFieldRenderer.js              # 星空渲染
├── AtmosphereControlPanel.vue        # UI 控制面板
├── useCesiumAtmosphere.js            # Vue Composable
├── atmosphereConstants.js            # 常量定义
├── atmosphereDefaults.js             # 默认配置
└── index.js                          # 索引文件
```

详见维护日志 `Docs/26-06-26/2026-06-26-tellux-atmosphere-migration.md`。

## 📝 2026-06-26 模块卡片 UI 清理与视觉优化

CesiumToolPanel.vue 引入 lil-gui 后的冗余清理 + 模块卡片视觉增强：

* 🧹 **清理死代码 CSS**：移除约 200 行已废弃的手写控制样式（`.control-row` / `.control-label` / `.control-help` / `.control-range` / `.control-number` / `.control-select` / `.control-color` / `.control-value` 系列），这些样式在引入 lil-gui 替换自定义控件后已不再使用。
* 🐛 **隐藏 lil-gui 重复标题**：LilGuiControls.vue 中 lil-gui 自带的 `.lil-title` 与 module-head 标题重复，通过 `height: 0 + overflow: hidden` 视觉隐藏（保留 DOM 以维持折叠逻辑）。
* 🎨 **模块卡片视觉增强**：
  - expanded 状态左侧 3px 绿色渐变色条，提升视觉层次
  - hover 时边框变亮 + 微阴影 `box-shadow`
  - 图标区域 32→36px，渐变背景 + 发光边框
  - 展开动画（opacity + translateY 过渡）
  - 状态标签加圆点指示器（`::before` 伪元素）

详见维护日志 `Docs/26-06/26-06-26/2026-06-26-module-card-ui-cleanup.md`。

## 📝 2026-06-26 体积云性能优化

体积云开启后卡死问题的全面优化：

* 🚀 **减少阴影计算步数**：`marchSunOpticalDepth` 从 6 步减到 3 步，`marchBeerShadowOpticalDepth` 从 10 步减到 4 步。
* 🚀 **LOD 优化**：根据距离和质量等级动态调整步数，远处云层降低 60% 计算量。
* 🚀 **远处禁用昂贵阴影**：超过阈值后跳过 Beer 阴影和 BSM 计算。
* 🚀 **自适应步长**：空白区域跳 3 倍大步，减少无效采样。
* 🚀 **更激进的早期终止**：云层足够厚时提前结束循环。
* 🆕 **分辨率缩放模块**：`useCesiumResolutionScaling.js` 支持低分辨率渲染 + 动态调整。

详见维护日志 `Docs/26-06/26-06-26/2026-06-26-cloud-performance-optimization.md`。

## 📝 2026-06-26 修复 Cesium → OL 图层同步问题

当 URL 面板是 Cesium 时，`l` 参数（图层索引）不能同步到 OpenLayers 中的问题：

* 🐛 **修复 `setBaseLayerActive` ID 类型不匹配**：`layerList` 包含图层源 ID（如 `'imagery_google'`），而 `selectedLayer` 存储预设 ID（如 `'imagery_google_preset'`）。原代码检查 `layerList` 中是否存在该图层，导致始终返回 `undefined`。简化为直接设置 `selectedLayer.value`。

详见维护日志 `Docs/26-06/26-06-26/2026-06-26-fix-cesium-to-ol-layer-sync.md`。

## 📝 2026-06-26 Code Review 两轮修复（17 个问题）

未提交代码的两轮全面审查与修复：

**第一轮（4 个）**：
* 🐛 GLSL sampler null 检查 → `uniform bool hasVelocityTexture` 标志
* 🐛 深度纹理格式 → `DEPTH_COMPONENT16` renderbuffer 兼容 WebGL1/2
* 🐛 TAAU resolve stage 缺失 uniforms → 补充 depthTexture/velocityTexture/hasVelocityTexture
* 🐛 lil-gui title 隐藏 → `height: 0` 保留 DOM 折叠逻辑

**第二轮（13 个）**：
* 🔴 **TAAU resolve stage 永久禁用** → 接入质量预设（high/ultra 自动启用）
* 🔴 **swapBuffers() 从未调用** → preRender 中 TAAU 启用时交换 ping-pong framebuffer
* 🟡 内部 API 访问封装 → `getStageOutputTexture()`/`getSceneDepthTexture()`/`getFramebufferColorTexture()`
* 🟡 GLSL 兼容性 → `FRAG_COLOR`/`SAMPLE_TEX` 宏 + `#if __VERSION__` 兼容块
* 🟡 cloudShadowShaders `out_FragColor` 未声明 → 显式 `out vec4` 声明
* 🟡 嵌入模式 expanded 卡片无视觉区分 → 添加 `.is-embedded .module-item.expanded` 规则
* 🟡 TAAU resolve stage 资源泄漏 → 模块级变量 + cleanupEffects 移除
* 🔵 `const scene` 变量遮蔽 / `fract()` 定义顺序 / `historyValid` 过早设置 / 无用矩阵克隆 / lil-gui min-height 防护 / 蓝噪声哈希优化

详见维护日志 `Docs/26-06/26-06-26/2026-06-26-code-review-taau-lilgui-fix.md`。

## 📝 2026-06-26 体积云模块重构 + 性能优化

将分散的体积云相关代码整合到 `Clouds/` 目录，实现高聚合：

* ♻️ **模块重组**：将 `useCesiumClouds.js`、`useCesiumTemporalUpsampling.js`、`useCesiumResolutionScaling.js` 从 `composables/` 移动到 `Clouds/composables/`。
* 🚀 **性能优化**：减少阴影计算步数（-55%）、LOD 距离优化（-65%）、远处禁用昂贵阴影（-85%）。
* 🆕 **分辨率缩放模块**：`useCesiumResolutionScaling.js` 支持低分辨率渲染 + 动态调整。

**体积云目录结构**：
```
Cesium/Clouds/
├── composables/
│   ├── useCesiumClouds.js          # 体积云 composable
│   ├── useCesiumTemporalUpsampling.js  # TAAU 时序上采样
│   └── useCesiumResolutionScaling.js   # 分辨率缩放
├── atmosphereLutResources.js       # 大气 LUT 纹理
├── CesiumVolumetricClouds.js       # 体积云 Primitive
├── CloudShadowPrimitive.js         # BSM 阴影 Primitive
├── cloudDefaults.js                # 质量预设配置
├── cloudMath.js                    # 云层数学工具
├── cloudShaders.js                 # 云层 shader
├── cloudShadowShaders.js           # 阴影 shader
├── cloudShadowResources.js         # 阴影资源管理
└── shadowResolveShaders.js         # 阴影 TAA shader
```

详见维护日志 `Docs/26-06/26-06-26/2026-06-26-cloud-performance-optimization.md`。

## 📝 2026-06-22 暂存区 Code Review 修复

针对 V3.3.8 要素高亮 Pinia 化暂存变更的后续审查：

* 🐛 **修复托管图层 ID 时序**：`useCreateManagedVectorLayer.js` 先生成图层 ID 并确保要素 ID，再进行样式备份，避免 `id` 声明前访问导致备份失效。
* 🐛 **补齐高亮清理旧 API 兼容**：`clearManagedFeatureHighlight(feature)` 可通过 `store.highlightedList` 反查 `layerId/featureId`，旧调用链不再静默 no-op。
* 🐛 **修复点击命中遍历语义**：`forEachFeatureAtPixel` 回调返回 `false` 以继续累积命中要素，避免 `totalHits` 永远只统计首个命中。
* 🧹 **清理维护日志空白字符**：保证 `git diff --check` 可通过。

详见维护日志 `Docs/26-06/26-06-22/2026-06-22-fix-staged-feature-highlight-review.md`。

## 📝 2026-06-21 高亮 Pinia 化后置修复

针对同日 V3.3.8 Pinia 化改造的 Code Review 发现：

* 🐛 **修复 `useFeatureStyleStore.ts` TS 报错**：`highlightFeature` 内 `targets` 数组元素补充 `feature: any` 字段类型；`syncLayerHighlights` 的 `callbacks` 默认值类型显式声明 `cb = callbacks || {}`，消除 7 个 TS 报错（`Property 'feature'/'restoreStyle'/'lookupFeature'/'applyHighlight' does not exist on type ...`）
* 🐛 **回滚 `useMapUIEventHandlers.js` 破坏性重命名**：参数 `zoomToManagedFeature` 恢复原参数名，`void zoomToManagedFeature` 保留契约引用
* 🐛 **修正 `useLayerMetadataNormalization.js` dl 合并顺序**：`{ ...dlParsed, ...next }` → `{ ...next, ...dlParsed }`，避免解析值被原 attributes 覆盖
* ♻️ **抽离 `getFeatureIdFromFeature` 工具函数**：消除 4 处重复的 `getId() ?? get('_gid') ?? get('id')` 回退逻辑，统一到 `utils/map/featureKey.js`
* ♻️ **`useManagedFeatureHighlight.js` 删除直接操作 store state 的代码**：统一通过 `store.clearHighlight` 行动维护封装性

详见维护日志 `Docs/26-06/26-06-21/2026-06-21-fix-feature-style-store-types-and-bugs.md`。

## 📋 项目概述

基于 **Vue 3 + Vite + OpenLayers + Cesium** 构建的专业级 WebGIS 前端应用。历经多次优化迭代，现已发展成为功能丰富、架构清晰的 WebGIS 平台。

### 🎯 核心功能

- 🗺️ **地图引擎**：OpenLayers 6.x + Cesium 3D 地球
- 🧭 **三维分析**：Cesium 统一控制面板集成场景导航、高级特效、风场、水体模拟和参数说明
- 🏙️ **Google 真实 3D 模型**：Cesium 叠加层支持 Google Photorealistic 3D Tiles 倾斜摄影接入
- 🔐 **运行时 Token 池**：天地图 TK 与 Cesium Ion Token 由管理员后台配置，支持主/备 token 自动兜底
- 🌊 **掩膜分析（水体模拟）**：按捕捉区域高程值域生成外包盒，支持点击点高程初始水位、水位滑杆和水色调色板
- 📊 **数据管理**：多格式导入（GeoJSON/KML/SHP/GeoTIFF/CSV），批量导出
- 🔎 **高德 AOI 手动注入**：支持详情 JSON 与搜索 AOI，`@` 分隔的独立区域会被拆分为多个环
- 🔎 **纯坐标串 AOI 注入**：支持双引号包围的坐标文本，按 `;` 分隔坐标对、按 `@` 分隔多区域，自动闭合首尾
- 🎨 **可视化**：热力图、等高线、3D 要素、电影级效果
- 🔍 **交互**：绘制、测量、路线规划、地点搜索
- 🌤️ **天气**：实时天气 + 趋势预报
- 🤖 **AI 助手**：LLM 集成地理问答
- ⚡ **性能**：ESM 分包、动态加载、30-50% 首屏加速

## 🚀 快速开始
# WebGIS 前端项目

基于 Vue 3 + Vite + OpenLayers/Cesium 的 WebGIS 前端工程

## 项目概览

- 地图内核：OpenLayers 2D + Cesium 3D
- 数据能力：GeoJSON/KML/KMZ/SHP/GeoTIFF/CSV 导入，CSV/TXT/GeoJSON/KML 导出
- 图层系统：TOC 协议层、右键菜单、多选批处理、行政区划与用户图层统一管理
- 业务模块：路径规划、地点检索、属性表、天气看板、AI 聊天、罗盘 HUD（面板展示与启用绘制解耦）、Cesium 三维分析、水体模拟

## 快速开始
# WebGIS 前端项目

基于 Vue 3 + Vite + OpenLayers/Cesium 的 WebGIS 前端工程

## 项目概览

- 地图内核：OpenLayers 2D + Cesium 3D
- 数据能力：GeoJSON/KML/KMZ/SHP/GeoTIFF/CSV 导入，CSV/TXT/GeoJSON/KML 导出
- 图层系统：TOC 协议层、右键菜单、多选批处理、行政区划与用户图层统一管理
- 业务模块：路径规划、地点检索、属性表、天气看板、AI 聊天、罗盘 HUD（面板展示与启用绘制解耦）、Cesium 三维分析、水体模拟

## 快速开始

### 环境要求

- Node.js 18+
- npm 9+

### 安装与运行

```bash
npm install
npm run dev
```

### 构建与预览

```bash
npm run build
npm run preview
```

### 体积分析

```bash
npm run build:analyze
```

## 环境变量

复制 `.env.example` 为 `.env.local` 后配置：

```env
VITE_BACKEND_URL=http://localhost:8000
VITE_TILE_PROXY_BASE_URL=https://negiao-webgis.hf.space
VITE_TILE_PROXY_MODE=fallback
# Amap key is configured in the admin API key panel.
VITE_BASE_URL=./
```

天地图 TK 与 Cesium Ion Token 由管理员在用户中心统一配置，后端写入数据库；前端启动时通过 `/api/runtime-config/map-tokens` 读取一次主/备 token 池后直连第三方服务。不要在 `VITE_TIANDITU_TK` / `VITE_CESIUM_ION_TOKEN` 中写入真实值，Vite 会把它们打进前端产物。

## 部署说明

- 本地开发：`VITE_BASE_URL=./`
- GitHub Pages(WebGIS-Dev)：`VITE_BASE_URL=/WebGIS-Dev/`
- GitHub Pages(WebGIS)：`VITE_BASE_URL=/WebGIS/`

构建示例：

```bash
VITE_BASE_URL=/WebGIS-Dev/ npm run build
```

## 目录结构（2026-06-27 更新）

以下结构按当前工程实际文件扫描生成。

```text
frontend/src/
├── App.vue                                         # 根组件
├── main.js                                         # 应用入口（挂载 Router/Pinia）
├── cesium-shim.js                                  # Cesium ESM 垫片（CDN window.Cesium 桥接）
│
├── api/                                            # API 客户端封装
│   ├── backend.js                                  # 后端 API barrel re-export
│   ├── backend/                                    # 后端 API 按业务域拆分
│   │   ├── client.js                               # axios 实例、拦截器、错误处理
│   │   ├── auth.js                                 # 鉴权接口
│   │   ├── location.js                             # 地理编码/定位接口
│   │   ├── weather.js                              # 天气接口
│   │   ├── routing.js                              # 路线规划接口
│   │   ├── agent.js                                # AI Agent 接口
│   │   ├── statistics.js                           # 统计/消息/公告
│   │   ├── admin.js                                # 管理后台接口
│   │   ├── spatial.js                              # 空间分析接口
│   │   ├── runtime.js                              # 前端运行时地图 token 配置接口
│   │   └── index.js                                # barrel export
│   ├── download.js                                 # 底图下载任务 API
│   ├── geocoding.js                                # 天地图/高德地理编码
│   ├── httpStatusMap.js                            # HTTP 状态码 + 高德 infocode 统一映射
│   ├── index.js                                    # barrel export
│   ├── ipLocation.js                               # IP 定位 API
│   ├── locationSearch.js                           # 地点搜索 API
│   ├── map.js                                      # 地图业务 API
│   └── weather.js                                  # 天气 API
│
├── assets/                                         # 全局样式与静态数据
│   ├── theme.css                                   # 全局主题变量
│   ├── toc-theme.css                               # TOC 主题变量
│   └── data/compass-metadata/                      # 罗盘元数据
│       ├── compass-data.ts                         # 罗盘基础数据
│       └── twentyEightConstellations.ts            # 二十八宿数据
│
├── components/                                     # 业务组件
│   ├── Cesium/                                     # ===== 3D 地球模块 =====
│   │   ├── CesiumContainer.vue                     # Cesium 容器（底图/地形 + URL 追踪 + 工具面板 + 拖拽导入）
│   │   ├── CesiumAdvancedEffects.vue               # 高级视觉效果（高度雾/HBAO/移轴/大气）
│   │   ├── CesiumToolPanel.vue                     # 统一控制面板（场景/数据/特效/风场/流体/漫游）
│   │   ├── CesiumDataImportDialog.vue              # GLTF/GLB 模型放置坐标输入弹窗
│   │   ├── LilGuiControls.vue                      # lil-gui 动态控件渲染器
│   │   ├── Wind2D.js                               # 2D 风场渲染
│   │   │
│   │   ├── Cloud/                                  # 体积云模块（TypeScript）
│   │   │   ├── index.ts                            # 模块入口
│   │   │   ├── CloudManager.ts                     # 体积云管理器（Stage 生命周期 + 质量切换）
│   │   │   ├── CloudPresets.ts                     # 质量预设（low/medium/high/ultra）
│   │   │   ├── CloudUniforms.ts                    # GPU Uniform 缓冲区管理
│   │   │   ├── cloudIntegration.ts                 # Cesium 场景集成（PostProcessStage）
│   │   │   ├── composables/useVolumetricCloud.ts   # Vue composable
│   │   │   └── textures/                           # 体积云纹理（public/textures/cloud/）
│   │   │
│   │   ├── PlayerController/                       # 人物漫游控制器（crossfade + smoothDamp + 越肩过渡）
│   │   │   ├── index.js                            # 模块入口（懒加载导出）
│   │   │   ├── usePlayerController.js              # Vue composable（启停/状态/地形碰撞）
│   │   │   ├── playerDefaults.ts                   # 默认配置（模型/物理/相机/键位）
│   │   │   ├── playerController.ts                 # 核心控制器类（800+ 行）
│   │   │   ├── dynamicObject.ts                    # 动态物体句柄
│   │   │   ├── types.ts                            # 类型定义
│   │   │   ├── PlayerGuidePanel.vue                # 键位说明面板
│   │   │   ├── NavGuideHUD.vue                     # 漫游导航 HUD（方向箭头+距离）
│   │   │   ├── NavTargetPicker.vue                 # 导航目标选择器
│   │   │   ├── systems/                            # 子系统
│   │   │   │   ├── AnimationSystem.ts              # 动画状态机（crossfade + 跳跃超时 + 输入检查）
│   │   │   │   ├── CameraSystem.ts                 # 相机系统（弹簧平滑 + 避障 + 越肩过渡）
│   │   │   │   ├── InputSystem.ts                  # 键鼠输入管理
│   │   │   │   └── PhysicsSystem.ts                # Rapier 物理碰撞（胶囊体+射线）
│   │   │   └── utils/                              # 工具函数
│   │   │       ├── frame.ts                        # ECEF/ENU/Rapier 坐标变换（scratch 复用）
│   │   │       ├── gltfGeometry.ts                 # glTF 几何解析
│   │   │       ├── math.ts                         # lerp + smoothDamp 平滑阻尼
│   │   │       ├── mobileControls.ts               # 移动端虚拟摇杆
│   │   │       └── terrainHelper.ts                # 地形 provider 检测
│   │   │
│   │   ├── FluidSimulation/                        # 流体模拟（洪水 + 水位动画）
│   │   │   ├── FluidSimulationPanel.vue            # 流体控制面板
│   │   │   └── fluidruntime.js                     # WebGL 流体渲染引擎
│   │   │
│   │   ├── ShallowWater/                           # Three.js 热带浅水场景叠加
│   │   │   ├── ShallowWaterOverlay.vue             # 叠加层组件
│   │   │   ├── shaders/                            # GLSL 着色器
│   │   │   │   ├── caustics.glsl.js                # 焦散着色器
│   │   │   │   ├── waterSurface.glsl.js            # 水面着色器
│   │   │   │   └── clouds.glsl.js                  # 体积云着色器
│   │   │   ├── composables/useShallowWater.js      # Three.js 生命周期
│   │   │   └── utils/textures.js                   # 程序化纹理
│   │   │
│   │   ├── composables/                            # Cesium composables
│   │   │   ├── cesiumRuntime.js                    # Cesium CDN 运行时加载
│   │   │   ├── cesiumAtmosphere.js                 # 大气系统
│   │   │   ├── cesiumStorage.js                    # 本地存储
│   │   │   ├── cesiumTimeSystem.js                 # 时间系统
│   │   │   ├── useCesiumBasemapSwitcher.js         # 底图熔断/降级切换
│   │   │   ├── useCesiumBeautify.js                # 场景美化（HDR/FXAA/定向光）
│   │   │   ├── useCesiumCameraEnhanced.js          # 相机增强
│   │   │   ├── useCesiumCreditHider.js             # Credit 隐藏
│   │   │   ├── useCesiumDataImport.js              # 数据导入（GeoJSON/KML/SHP/GLB/TIF）
│   │   │   ├── useCesiumFrameRate.js               # FPS 采样
│   │   │   ├── useCesiumHeightSampler.js           # 高度采样
│   │   │   ├── useCesiumInteractions.js            # 交互管理
│   │   │   ├── useCesiumLayers.js                  # 底图/地形/叠加层编排
│   │   │   ├── useCesiumModelManager.js            # 3D 模型管理
│   │   │   ├── useCesiumSceneActions.js            # 场景动作
│   │   │   ├── useCesiumToolModules.js             # 工具面板模块编排
│   │   │   ├── useCesiumUrlTracking.js             # URL 追踪
│   │   │   └── useCesiumWind.js                    # 风场管理
│   │   │
│   │   └── terrain/                                # 自定义地形 Provider
│   │       ├── GeoTerrainProvider.js               # 天地图地形
│   │       ├── ArcGISTerrainProvider.js            # ArcGIS 地形
│   │       ├── GeoWTFS.js                          # WMTS 地形
│   │       └── util.js                             # 工具函数
│   │
│   ├── Chat/ChatPanelContent.vue                   # AI 聊天面板
│   ├── Common/ExtentPicker.vue                     # 框选范围组件
│   ├── Compass/
│   │   ├── CompassControlPanel.vue                 # 罗盘控制面板
│   │   └── PalaceExplanationPanel.vue              # 宫位解释面板
│   ├── ControlsPanel/
│   │   ├── ControlsPanel.vue                       # 总面板入口
│   │   ├── AdministrativeDivisionPanel.vue         # 行政区面板
│   │   ├── AdministrativeDivisionTreeNode.vue      # 行政区树节点
│   │   ├── DrawPanel.vue                           # 绘制面板
│   │   ├── LogMonitor.vue                          # 日志监控
│   │   ├── MeasurePanel.vue                        # 测量面板
│   │   └── SpatialAnalysisPanel.vue                # 空间分析面板
│   ├── feng-shui-compass-svg/                      # 罗盘 SVG HUD
│   │   ├── feng-shui-compass-svg.vue               # 罗盘主组件
│   │   ├── themes/                                 # 5 种主题配置
│   │   │   ├── index.ts
│   │   │   ├── theme-compass.ts
│   │   │   ├── theme-crice.ts
│   │   │   ├── theme-dark.ts
│   │   │   ├── theme-polygon.ts
│   │   │   └── theme-simple.ts
│   │   └── types/                                  # TypeScript 类型定义
│   │       ├── common.ts
│   │       ├── compass.ts
│   │       ├── index.ts
│   │       └── theme.ts
│   ├── Layer/
│   │   ├── TOCPanel.vue                            # TOC 主面板
│   │   ├── LayerPanel.vue                          # TOC 树容器
│   │   ├── TOCTreeItem.vue                         # 递归树节点
│   │   ├── LayerControlPanel.vue                   # 底图控制面板
│   │   ├── LayerPropertiesDialog.vue               # 图层属性弹窗
│   │   ├── AttributeTable.vue                      # 属性表
│   │   └── SharedResourceTreeItem.vue              # 共享资源树节点
│   ├── Map/
│   │   ├── MapContainer.vue                        # 地图容器（能力暴露 + 罗盘 HUD）
│   │   ├── MapControlsBar.vue                      # 底部坐标/缩放工具栏
│   │   ├── MapSwipeController.vue                  # 卷帘对比滑块
│   │   ├── MapDownloader.vue                       # 底图下载面板
│   │   └── MapEasterEgg.vue                        # 彩蛋组件
│   ├── Routing/
│   │   ├── BusPlannerPanel.vue                     # 公交规划
│   │   ├── DrivingPlannerPanel.vue                 # 驾车规划
│   │   └── MapPointPickerCard.vue                  # 地图点选卡片
│   ├── Search/
│   │   ├── LocationSearch.vue                      # 地点搜索
│   │   └── AmapAoiInjectDialog.vue                 # 高德 AOI 注入弹窗
│   ├── Shell/
│   │   ├── TopBar.vue                              # 顶栏
│   │   ├── SidePanel.vue                           # 右侧综合侧栏
│   │   ├── ResizeHandle.vue                        # 可拖拽分割条
│   │   ├── GlobalLoading.vue                       # 全局加载遮罩
│   │   ├── Message.vue                             # 全局消息条
│   │   ├── PersistentAnnouncementBar.vue           # 顶部公告条
│   │   └── MagicCursor.vue                         # 首屏特效
│   ├── Weather/
│   │   ├── WeatherChartPanel.vue                   # 天气可视化主面板
│   │   ├── WeatherLiveCards.vue                    # 实况天气卡片
│   │   └── WeatherForecastTable.vue                # 预报表格
│   └── UserCenter/
│       ├── FloatingAccountPanel.vue                # 用户中心浮层壳
│       ├── AdminControlPanel.vue                   # 管理员控制台
│       ├── ApiKeysManagementPanel.vue              # API 密钥管理
│       ├── ApiManagementPanel.vue                  # API 使用管理
│       └── tabs/
│           ├── OverviewTab.vue                     # 总览标签
│           ├── SecurityTab.vue                     # 安全标签
│           └── PreferencesTab.vue                  # 偏好标签
│
├── composables/                                    # 组合式函数
│   ├── auth/useAuthIdentity.js                     # 认证身份校验
│   ├── Magic/                                      # 首屏视觉特效
│   │   ├── useDelaunay.js
│   │   ├── useFluid.js
│   │   ├── useGravity.js
│   │   ├── useRingExplosion.js
│   │   ├── useSingularity.js
│   │   └── useWave.js
│   ├── dataImport/                                 # 数据导入工具
│   │   ├── rasterUtils.js                          # 栅格工具
│   │   ├── vectorUtils.js                          # 矢量工具
│   │   ├── webglRasterRenderer.js                  # WebGL 栅格渲染
│   │   └── index.js
│   ├── map/                                        # 地图核心 composables
│   │   ├── features/                               # 功能模块（30+ 文件）
│   │   │   ├── basemapLayerFactory.js              # 底图图层工厂
│   │   │   ├── useBasemapLayerBootstrap.js         # 底图初始化
│   │   │   ├── useBasemapResilience.js             # 底图容错与降级
│   │   │   ├── useBasemapSelectionWatcher.js       # 底图选择监听
│   │   │   ├── useBasemapStateManagement.js        # 底图状态批处理
│   │   │   ├── useBasemapSwipe.js                  # 卷帘对比
│   │   │   ├── useBasemapUrlMapping.js             # 底图 URL 映射
│   │   │   ├── useCoordinateSystemConversion.js    # 坐标系转换
│   │   │   ├── useCreateManagedVectorLayer.js      # 托管矢量图层创建
│   │   │   ├── useDataManager.js                   # 数据管理
│   │   │   ├── useDeferredUserLayerApis.js         # 延迟用户图层 API
│   │   │   ├── useDistrictManager.js               # 行政区划管理
│   │   │   ├── useDrawMeasure.js                   # 绘制与测量
│   │   │   ├── useLayerContextMenuActions.js       # 图层右键菜单
│   │   │   ├── useLayerControlHandlers.js          # 图层控制处理
│   │   │   ├── useLayerMetadataNormalization.js    # 图层元数据规范化
│   │   │   ├── useManagedFeatureHighlight.js       # 要素高亮
│   │   │   ├── useManagedFeatureOperations.js      # 要素操作
│   │   │   ├── useManagedFeatureSerialization.js   # 要素序列化
│   │   │   ├── useManagedLayerStyle.js             # 图层样式管理
│   │   │   ├── useMapEventHandlers.js              # 地图事件处理
│   │   │   ├── useMapInteractionPickers.js         # 交互选点
│   │   │   ├── useMapSearchAndCoordinateInput.js   # 搜索与坐标输入
│   │   │   ├── useMapUIEventHandlers.js            # UI 事件处理
│   │   │   ├── useRightDragZoom.js                 # 右键拖拽缩放
│   │   │   ├── useRouteRendering.js                # 路线渲染
│   │   │   ├── useRouteStepInteraction.js          # 路线步骤交互
│   │   │   ├── useRouteStepStyles.js               # 路线步骤样式
│   │   │   ├── useSpatialAnalysis.js               # 空间分析
│   │   │   ├── useStartupTaskScheduler.js          # 启动任务调度
│   │   │   ├── useStartupUrlRestoreGuard.js        # URL 恢复守卫
│   │   │   ├── useUserLayerApiFacade.js            # 用户图层 API 门面
│   │   │   └── index.js
│   │   ├── toc/                                    # TOC 模块
│   │   │   ├── actions/                            # 右键菜单动作
│   │   │   │   ├── contextActionManager.js
│   │   │   │   ├── exportService.js
│   │   │   │   └── selectionManager.js
│   │   │   ├── menu/                               # 菜单调度
│   │   │   │   ├── commandDispatcher.js
│   │   │   │   └── contextMenu.js
│   │   │   ├── factory.js
│   │   │   ├── protocol.js
│   │   │   └── index.js
│   │   ├── basemapSystem.js                        # 底图系统入口
│   │   ├── GISCommander.js                         # Agent GIS 功能封装
│   │   ├── interactionHandlers.js                  # 交互处理器
│   │   ├── layerManager.js                         # 图层管理器
│   │   ├── routeService.js                         # 路线服务
│   │   ├── usePositionCodeTool.js                  # p 参数工具
│   │   └── index.js
│   ├── tileSource/                                 # 瓦片源工厂
│   │   ├── types.ts                                # 类型定义
│   │   ├── urlUtils.ts                             # URL 工具
│   │   ├── tileLifecycle.ts                        # 请求生命周期管理
│   │   ├── wmsSource.ts                            # WMS 源创建
│   │   ├── wmtsSource.ts                           # WMTS 源创建
│   │   ├── xyzSource.ts                            # XYZ 源 + 自动检测
│   │   └── index.ts
│   ├── weather/
│   │   ├── useWeatherData.js                       # 天气数据获取
│   │   └── useWeatherCharts.js                     # ECharts 图表渲染
│   ├── useErrorHandler.ts                          # 错误处理
│   ├── useGisLoader.ts                             # GIS 加载器
│   ├── useKmzLoader.js                             # KMZ 加载器
│   ├── useLayerDataImport.js                       # 图层数据导入
│   ├── useManagedLayerRegistry.js                  # 托管图层注册
│   ├── useMapState.js                              # OL 地图状态
│   ├── useMapSwipe.ts                              # 卷帘核心逻辑
│   ├── useMapViewUrlState.js                       # 2D/3D URL 状态
│   ├── useMessage.js                               # 全局消息提示
│   ├── useMessageIslandMotion.js                   # 消息动画
│   ├── useSharedResourceLoader.ts                  # 共享资源加载器
│   ├── useStyleEditor.js                           # 样式编辑器
│   ├── useTileSourceFactory.ts                     # 瓦片源工厂 barrel
│   ├── useUserLayerActions.js                      # 用户图层动作
│   └── useUserLocation.js                          # 用户定位
│
├── config/env.ts                                   # 环境变量集中管理
│
├── constants/                                      # 常量配置
│   ├── basemap/
│   │   ├── basemapConfig.ts                        # 图源定义 + 预设配置
│   │   ├── basemapResolver.ts                      # 解析逻辑
│   │   ├── sourceDescriptors.ts                    # 引擎无关图层源描述符
│   │   ├── cesiumProviderFactory.ts                # Cesium ImageryProvider 工厂
│   │   └── index.ts
│   ├── agentToolsSchema.js                         # Agent Function Calling 工具声明
│   ├── index.js
│   ├── mapStyles.js                                # 地图样式常量
│   └── tileSourceAdapters.ts                       # 非标准瓦片源适配器
│
├── router/
│   ├── index.js                                    # 路由与守卫
│   └── lazyHomeViewLoader.js                       # HomeView 二段式懒加载
│
├── services/
│   ├── agent/AgentExecutor.js                      # Agent 响应拦截与工具调用
│   ├── compass/
│   │   ├── index.js
│   │   └── urlState.ts                             # 罗盘 URL 状态编解码
│   ├── CompassManager.ts                           # 罗盘管理器
│   ├── DistrictManager.ts                          # 行政区划管理器
│   ├── auth.js                                     # 鉴权工具
│   ├── runtimeMapTokens.js                         # 运行时地图 token 池
│   ├── userLocationContext.js                      # 用户定位上下文
│   └── userPositionCache.js                        # 用户位置缓存
│
├── stores/                                         # Pinia 状态管理
│   ├── layer/
│   │   ├── layerHelpers.ts                         # 图层工具函数
│   │   ├── layerTreeBuilder.ts                     # 图层树构建器
│   │   └── index.ts
│   ├── index.ts
│   ├── useAppStore.ts                              # 全局应用状态
│   ├── useAttrStore.ts                             # 属性表状态
│   ├── useAuthStore.ts                             # 鉴权状态
│   ├── useChatStore.ts                             # Chat 状态
│   ├── useCompassStore.ts                          # 罗盘状态
│   ├── useDownloadStore.ts                         # 下载任务状态
│   ├── useFeatureStyleStore.ts                     # 要素高亮样式
│   ├── useLayerStore.ts                            # 图层状态
│   ├── useSwipeConfigStore.ts                      # 卷帘配置
│   ├── useThemeStore.ts                            # 主题状态
│   ├── useTOCStore.ts                              # TOC 元数据状态
│   ├── useUrlParamStore.ts                         # URL 参数管理
│   ├── useUserPreferencesStore.ts                  # 用户偏好
│   └── useWeatherStore.ts                          # 天气状态
│
├── data/goldenSoupQuotes.js                        # 励志语录数据（懒加载）
│
├── utils/                                          # 工具函数
│   ├── abortManager.js                             # 请求中断管理器
│   ├── coordTransform.js                           # 坐标转换（GCJ-02/WGS84）
│   ├── coordinateFormatter.js                      # 坐标格式化
│   ├── coordinateInputHandler.js                   # 坐标输入处理
│   ├── crsUtils.js                                 # CRS 检测与注册
│   ├── drawTransitRoute.ts                         # 公交路线绘制
│   ├── driveXmlParser.ts                           # 驾车路线 XML 解析
│   ├── explanationLookup.ts                        # 罗盘宫位解释查询
│   ├── labelValidator.ts                           # 标签校验
│   ├── layerExportService.js                       # 图层导出服务
│   ├── loadTiandituSdk.js                          # 天地图 SDK 加载
│   ├── normalize.ts                                # 二值标记规范化
│   ├── pathUtils.js                                # 路径工具
│   ├── textDecoder.js                              # 文本解码
│   ├── themeExplanationMapper.ts                   # 主题-解释文件映射
│   ├── tifUtils.js                                 # TIF 工具
│   ├── transitRouteBuilder.js                      # 路线渲染数据构建
│   ├── vectorWorkerUtils.js                        # 矢量 Worker 工具
│   ├── index.js
│   ├── amapRectangle.js                            # 高德矩形范围解析
│   ├── biz/index.js                                # 业务工具 barrel
│   ├── echarts/
│   │   ├── cesiumFxRuntime.js                      # Cesium 图表运行时
│   │   └── weatherRuntime.js                       # 天气图表运行时
│   ├── geo/index.js                                # CRS barrel
│   ├── gis/                                        # GIS 工具库
│   │   ├── parsers/
│   │   │   ├── kmlParser.ts                        # KML/KMZ 解析
│   │   │   ├── kmlStyleParser.js                   # KML 样式解析
│   │   │   ├── shpParser.ts                        # Shapefile 解析
│   │   │   ├── tifLoader.ts                        # GeoTIFF 加载
│   │   │   ├── dbfParser.ts                        # DBF 解析
│   │   │   ├── amapAoiParser.js                    # 高德 AOI 解析
│   │   │   └── universalAmapParser.js              # 通用高德解析
│   │   ├── archiveProcessor.js                     # 归档解包
│   │   ├── batchProcessor.js                       # 批量数据分类
│   │   ├── crs-engine.ts                           # CRS 引擎
│   │   ├── crsAware.js                             # CRS 感知层
│   │   ├── dataDispatcher.js                       # 数据格式分发
│   │   ├── decompressFile.js                       # ZIP 解压
│   │   ├── decompressor.ts                         # 通用解压器
│   │   ├── deferredGisAssets.js                    # 延迟 GIS 资源
│   │   ├── deferredGisWarmupLauncher.js            # GIS 预热启动
│   │   ├── loadJsZip.ts                            # JSZip 动态加载
│   │   ├── mapRuntimeDeps.js                       # OL 运行时依赖
│   │   └── shpPacketBuilder.js                     # SHP 包构建
│   ├── io/index.js                                 # GIS IO barrel
│   ├── map/
│   │   ├── featureKey.js                           # FeatureKey 复合主键
│   │   └── viewScaleConverter.js                   # OL zoom ↔ Cesium height 换算
│   ├── ui/
│   │   ├── index.js
│   │   └── loading.js                              # 全局 loading 控制
│   ├── url/
│   │   ├── index.js
│   │   ├── crypto.js                               # URL 参数加解密
│   │   ├── urlConstants.js                         # URL 常量
│   │   └── urlQueryReader.js                       # hash/query 参数统一读取
│   └── weather/weatherUtils.js                     # 天气工具函数
│
├── views/
│   ├── HomeView.vue                                # 主页面
│   ├── RegisterView.vue                            # 注册/登录
│   ├── NotFoundView.vue                            # 404 页面
│   ├── TermsOfService.vue                          # 服务条款
│   ├── PrivacyPolicy.vue                           # 隐私政策
│   └── home/
│       ├── index.ts
│       ├── useDistrictLayer.ts                     # 行政区划图层
│       ├── useLayerOperations.ts                   # 图层操作
│       └── useSidePanel.ts                         # 侧边栏逻辑
│
└── workers/                                        # Web Worker
    ├── tiffWorker.js                               # TIF 解码 Worker
    └── shpWorker.js                                # Shapefile 解析 Worker
```

## V3.3.8 (2026-06-19)
### 🛰️ Cesium 数据导入 + 底图预设统一接入

- ✅ **Cesium 数据导入**：GeoJSON / KML / KMZ / SHP / GLB / GLTF / CZML / 3D Tiles 加载到 3D 场景；支持文件选择 + 拖拽上传 + GLTF 坐标弹窗；自动定位到数据源范围；BlobURL 生命周期管理。
- ✅ **底图预设统一接入**：`sourceDescriptors.ts` + `cesiumProviderFactory.ts` 让 OL/Cesium 共享同一套 `BASEMAP_PRESETS`；Cesium 接入 `useCesiumBasemapSwitcher` 熔断/降级；URL `l` 参数还原底图预设。
- ✅ **字体栈变量**：`theme.css` 新增 5 个 `--font-*` 字体栈变量（基础/中文/英文/衬线/等宽）。
- ✅ **Cesium OSM Buildings + Google Photorealistic 3D Tiles 叠加层**：熔断链路重置按钮入口。
- ✅ **Code Review 修复**：
  - `CesiumContainer.onDragLeave` 屏蔽子节点冒泡导致的覆盖层闪烁
  - `useCesiumDataImport.loadGLTF` 重复导入时回收旧 BlobURL
  - `CesiumDataImportDialog` 重入残留检查，仅在 visible=true 时重置表单
  - `CesiumToolPanel.localDataSources` 去掉 deep watch，避免每次 push 重建数组
  - `useCesiumDataImport.clearAllDataSources` 移除未使用变量 `knownEntityIds`

详见 [`../Docs/26-06/26-06-19/2026-06-19-cesium-data-import.md`](../Docs/26-06/26-06-19/2026-06-19-cesium-data-import.md) 与 [`../Docs/26-06/26-06-19/2026-06-19-unified-basemap-ol-cesium.md`](../Docs/26-06/26-06-19/2026-06-19-unified-basemap-ol-cesium.md)

## V3.3.7 (2026-06-19)
### 🔍 暂存区 Code Review & Bug 修复

- ✅ **严重 Bug 修复**：`buildShareMarkedUrl` 中 `loc` 在 `resolvePositionCodeForShare` 前被重置为 `'0'`，导致分享链接 `p` 参数丢失。
- ✅ TopBar 主题适配：移除硬编码颜色，图标改用 `currentColor`，浮动菜单 2x2 网格重构。
- ✅ CSS 变量统一：`#6b8c6b` → `var(--text-muted)`、`#e8f0e8` → `var(--border-brand-light)`。
- ✅ 罗盘初始化：`restoringFromUrl` 标志防止 watcher 回写 URL 循环。
- ✅ 定位上下文：`hasUrlLocFlag()` 防止未授权时使用 localStorage 缓存。

详见 [`../Docs/26-06/26-06-19/2026-06-19-staged-code-review.md`](../Docs/26-06/26-06-19/2026-06-19-staged-code-review.md)

## V3.3.8 (2026-06-21)
### ✨ 要素高亮 Pinia 集中化 & 连续多选样式持久化

- ✅ **新增** `src/stores/useFeatureStyleStore.ts`：高亮要素集合 + 原始样式备份 Map + TOC 图层联动清理
- ✅ **新增** `src/utils/map/featureKey.js`：FeatureKey 复合主键工具（`${layerId}::${featureId}`）
- ✅ **重构** `src/composables/map/features/useManagedFeatureHighlight.js`：闭包变量 → store 薄壳（保留 OL 类样式生成）
- ✅ **改造** `src/composables/map/features/useMapEventHandlers.js` singleclick：累积命中 + Ctrl/Shift 多选模式
- ✅ **联动修复** `src/stores/useTOCStore.ts` `removeLayerMeta` + `src/stores/useLayerStore.ts` `syncLayers`：自动清理已移除图层的高亮数据
- ✅ **样式备份** `src/composables/map/features/useCreateManagedVectorLayer.js` + `src/composables/useUserLayerActions.js`：在 `setStyle(null)` 前先备份到 store，避免 KML/自定义样式永久丢失

**修复内容**：解决"连续多选要素样式丢失"的核心痛点。

详见 [`../Docs/26-06/26-06-21/2026-06-21-feature-style-pinia-multi-select.md`](../Docs/26-06/26-06-21/2026-06-21-feature-style-pinia-multi-select.md)

### ✨ 增强要素属性 HTML 解析逻辑

- ✅ **重写** `parseHtmlTableValue` 为列索引驱动解析：识别 `<thead>` 表头 → 提取 `name`/`value` 列索引
- ✅ **新增** `parseDefinitionListValue`：支持 `<dl>/<dt>/<dd>` 定义列表字段
- ✅ **新增** `stripScriptsAndStyles`：主动剥离 `<script>` / `<style>` / inline 事件 / `javascript:` URL
- ✅ **新增** `normalizeNullString`：识别 `<Null>` 占位符（OSM/Cesium/GeoServer 约定）→ null
- ✅ **支持嵌套表格**：外层 `details` + 内层 `floor` → `details.floor` 命名空间
- ✅ **同名多值合并**：多个 `<tr><th>image</th>...` → 数组化

**用户截图修复**：属性表 `description` 字段从一长串乱码展开为多行字段（name / building / layer / levels / height / location / BldgClass）。

详见 [`../Docs/26-06/26-06-21/2026-06-21-enhance-html-attribute-parser.md`](../Docs/26-06/26-06-21/2026-06-21-enhance-html-attribute-parser.md)

### 🐛 修复 import 路径

`useManagedFeatureHighlight.js` 两条 import 相对路径层级缺失：`../../...` → `../../../...`，解决 Vite `[plugin:vite:import-analysis] Failed to resolve import` 报错。

详见 [`../Docs/26-06/26-06-21/2026-06-21-fix-managed-feature-highlight-import.md`](../Docs/26-06/26-06-21/2026-06-21-fix-managed-feature-highlight-import.md)

## V3.3.6 (2026-06-18)
### 🛠️ z 参数精度链路修复（2026-06-18 追加）

- ✅ 确认 URL 读取链路使用 `Number()` / `parseFloat()`，未对 `z` 执行 `parseInt` 整数化。
- ✅ 按用户要求将 URL 中 `z` 统一保留两位小数，避免参数过长；OL zoom 与 Cesium height 的内部换算继续使用原始数值。
- ✅ `src/utils/map/viewScaleConverter.js` 默认不再 clamp，只有显式传入 `clamp: true` 时才执行范围截断，避免 2D/3D 往返被默认截断。
- ✅ `useMapState.js`、`HomeView.vue`、`useCesiumUrlTracking.js` 集中使用 `formatZParam()`，避免 z 格式化逻辑散落。

详见 [`../Docs/26-06/26-06-18/2026-06-18-z-parameter-precision-fix.md`](../Docs/26-06/26-06-18/2026-06-18-z-parameter-precision-fix.md)

### 🛠️ OL / Cesium URL Code Review 修复 + 中国视角高度调整 + 双向视图同步
- ✅ 新增 `src/utils/map/viewScaleConverter.js`，按 OL resolution、视口短边与 Cesium FOV 在 `zoom` 与 camera height 之间近似换算。
- ✅ 新增 `src/utils/url/urlConstants.js` 与 `src/utils/url/urlQueryReader.js`，统一 URL 常量、视图规范化、hash/query 快照读取。
- ✅ Cesium URL 写入改为 `router.replace`，与 OL URL 写入链路保持一致。
- ✅ Cesium 新链接改为 `cv=p.<pose>` 姿态-only 编码，`lng/lat/z` 在 `view=cesium` 下承担相机经纬度/高度；旧 full-camera `cv` 继续兼容解码。
- ✅ OL → Cesium 切换时将当前 OL center/zoom 转换为 Cesium `lng/lat/z/cv` 一次性写入 URL，避免把 OL zoom 误当相机高度。
- ✅ Cesium → OL 通过 `view-sync` 将相机高度换算为 OL zoom 并静默同步隐藏的 2D 视图，切回 2D 后范围更接近。
- ✅ 鼠标拾取坐标不再写入视图 URL，避免临时 UI 坐标污染分享链接。
- ✅ OL 仅在 `view=ol` 时清理 Cesium 专属 `cv/heading/pitch/roll`，并按完整 query 快照判断是否需要写入，避免隐藏 OL 面板覆盖 3D 状态。
- ✅ 切回 OL 时卸载 CesiumContainer 并监听 route view 变化，防止隐藏 Cesium 继续写 URL，浏览器前进/后退也能同步 2D/3D 面板。
- ✅ Cesium 默认中国中心相机高度从 `15,000,000m` 调整为 `6,000,000m`。
- ✅ 全量修复当前 ESLint 报错/警告，并通过生产构建。

**新增文件：**
- `src/utils/map/viewScaleConverter.js`
- `src/utils/url/urlConstants.js`
- `src/utils/url/urlQueryReader.js`

**验证：**
```bash
npm run lint -- --max-warnings=0
npm run build
```

**日志：** [`../Docs/26-06/26-06-18/2026-06-18-ol-cesium-url-review-fix.md`](../Docs/26-06/26-06-18/2026-06-18-ol-cesium-url-review-fix.md)

## V3.3.6 (2026-06-17)
### 🛰️ OL / Cesium URL 状态同步

- ✅ 新增 `view=ol|cesium`，刷新/分享/直链可恢复 2D 或 3D 面板。
- ✅ Cesium 新增 `useCesiumUrlTracking.js`，鼠标移动写回坐标面板 `lng/lat/z`，相机停止移动写回 `cv` 编码视角。
- ✅ `view=cesium` 下 `z` 表示坐标面板捕捉到的高程，`cv` 用于完整还原相机位置/姿态；`view=ol` 下 `z` 仍表示 OL 缩放级别。
- ✅ `MapContainer.vue` 新增 `urlSyncEnabled`，隐藏 2D 时停止 OL URL 写回，防止覆盖 Cesium 状态。
- ✅ `router/index.js` 与 `useUrlParamStore.ts` 扩展 `view` 参数提取和延迟应用流程。

**修改文件：**
- `src/composables/useMapState.js`
- `src/composables/useMapViewUrlState.js`
- `src/components/Cesium/composables/useCesiumInteractions.js`
- `src/components/Cesium/composables/useCesiumUrlTracking.js`
- `src/components/Cesium/CesiumContainer.vue`
- `src/components/Map/MapContainer.vue`
- `src/views/HomeView.vue`
- `src/router/index.js`
- `src/stores/useUrlParamStore.ts`

---

## V3.3.0 (2026-06-05)
### 🤖 Chat Function Calling GIS 架构 + 🛡️ 前端 404 兜底页面

**核心架构（Chat Function Calling GIS）：**
- ✅ 实现三层降级的 Function Calling 架构（原生 → 文本解析 → 关键词意图检测）
- ✅ 新增 `constants/agentToolsSchema.js`：Agent 工具声明（zoom_to_extent/search_and_zoom/switch_basemap）
- ✅ 新增 `services/agent/AgentExecutor.js`：Agent 响应拦截与工具调用执行路由
- ✅ 新增 `composables/map/GISCommander.js`：Agent GIS 功能封装（缩放/搜索/底图切换）
- ✅ 新增 `stores/useChatStore.ts`：Chat 工具调用状态管理
- ✅ 新增 `components/Shell/ResizeHandle.vue`：侧边栏可拖拽调整宽度

**修改文件：**
- ✅ `components/Chat/ChatPanelContent.vue`：核心改造，新增工具调用流程 + 意图检测
- ✅ `api/backend/agent.js`：API 层新增 tools/tool_choice 参数透传
- ✅ `components/Map/MapContainer.vue`：新增 setCustomBasemapByUrl 方法
- ✅ `views/HomeView.vue`：新增 provide/inject 底图切换能力 + ResizeHandle 集成
- ✅ `components/Shell/SidePanel.vue`：新增天气 tab + shouldLoadWeather prop
- ✅ `composables/map/features/useLayerControlHandlers.js`：handleLayerChange 改为 async

**404 兜底页面：**
- ✅ 新增 `views/NotFoundView.vue` 404 错误页面组件（赛博朋克风格）
- ✅ 路由配置添加 catch-all 路由 `/:pathMatch(.*)*`

**修改文件：**
- `src/views/NotFoundView.vue`：**新增** 404 页面组件
- `src/router/index.js`：添加 catch-all 路由

---

## V3.2.9 (2026-06-04)
### - 🚀 `dataImport/webglRasterRenderer.js`：**新增** WebGL 栅格着色器渲染器
###   - GPU 并行处理像素拉伸和颜色映射，替代 CPU 逐像素循环
###   - 10000×10000 TIF 渲染从 3-5 秒降至 <50ms（60-100 倍提升）
###   - 自动检测 WebGL 支持，不可用时回退到 CPU 分块处理
### - `useLayerDataImport.js`：数据导入模块 Code Review + WebGL 集成
###   - 合并重复的栅格采样器（消除 ~90 行）和 KML 解析函数（消除 ~60 行）
###   - 提取常量、添加 JSDoc
### - `main.js`：注入 `powerPreference: 'high-performance'` 强制使用独立显卡
### - `vite.config.js`：Gzip/Brotli 预压缩 + vendor-toast 拆分 + modulePreload 启用
### - `index.html`：min-enhanced.js defer 改写 + CDN preconnect
### - `dataImport/rasterUtils.js`：`getBandMinMax` 添加 20 万采样上限

## V3.1.2
### - `MapDownloader.vue`：新增下载模式选择（`native` / `progressive`），并在 `native` 模式下触发 token 附带的原生浏览器下载。
### - `useDownloadStore.ts`：新增 `downloadMode` 与 `downloadToken` 字段；`applyTaskResponse` 会接收后端返回的 `download_token`。
### - `api/download.js`：增加 `apiDownloadTaskFileUrl(taskId, token)` 用于生成浏览器原生下载 URL；保留 `apiDownloadTaskFile` 作为流式下载。
### - UI/UX：Progressive 模式下显示本地传输进度卡片并支持取消；Native 模式隐藏进度卡片以节省资源。
## 🆕 在线底图下载模块 (V3.1.0)

### MapDownloader 组件

**位置**：`src/components/MapDownloader.vue`

**功能**：
- 底图源选择（Google/Bing/OpenStreetMap 等）
- 分辨率配置（10m/30m/100m 等）
- 矩形范围选择（点击按钮激活地图拖拽）
- 异步任务提交与状态监控
- GeoTIFF 文件下载

**事件链**：
```
MapDownloader.vue (emit 'request-extent')
  ↓
TOCPanel.vue (relay)
  ↓
SidePanel.vue (relay)
  ↓
HomeView.vue (listen @request-download-extent)
  ↓
MapContainer.vue.pickDownloadExtent()
  ↓
useDownloadStore.applyBboxFromExtent()
```

**使用示例**：
```vue
<script setup>
import MapDownloader from '@/components/MapDownloader.vue'
import { useDownloadStore } from '@/stores'

const downloadStore = useDownloadStore()
const showDownloader = ref(false)

const handleExtentRequest = async () => {
  // 等待用户在地图上选择范围
  const result = await mapContainer.pickDownloadExtent()
  // 结果格式: { extent: [minLon, minLat, maxLon, maxLat], crs: 'EPSG:4326' }
  downloadStore.applyBboxFromExtent(result.extent, result.crs)
}
</script>

<template>
  <MapDownloader
    v-if="showDownloader"
    @close="showDownloader = false"
    @request-extent="handleExtentRequest"
  />
</template>
```

### useDownloadStore Pinia 状态

**位置**：`src/stores/useDownloadStore.ts`

**核心状态**：
```typescript
{
  // 当前任务
  currentTaskId: string | null
  currentStatus: 'pending' | 'processing' | 'completed' | 'failed'
  currentProgress: number // 0-100
  currentMessage: string
  
  // 范围与参数
  bbox: {
    minLon: number
    minLat: number
    maxLon: number
    maxLat: number
  }
  resolution_m: number // 分辨率（米）
  tile_url_template: string // 瓦片源 URL
  
  // 任务历史
  taskHistory: DownloadTask[]
}
```

**关键方法**：
```typescript
// 应用范围（自动坐标系转换）
applyBboxFromExtent(extent: [minX, minY, maxX, maxY], crs: string)

// 提交下载任务
submitDownloadTask(): Promise<{ task_id: string }>

// 查询任务状态
pollTaskStatus(taskId: string): Promise<DownloadTask>

// 获取下载文件 URL
getFileUrl(taskId: string): string

// 清空历史任务
clearHistory()
```

### download.js API 客户端

**位置**：`src/api/download.js`

**导出方法**：
```javascript
// 创建下载任务
export async function createDownloadTask(payload) {
  // payload: {
  //   tile_url_template: string
  //   bbox: { minLon, minLat, maxLon, maxLat }
  //   crs: 'EPSG:4326' | 'EPSG:3857'
  //   resolution_m: number
  //   format: 'GeoTIFF'
  // }
  // 返回: { task_id, status, progress, message }
}

// 查询任务状态
export async function getDownloadTask(taskId) {
  // 返回: { task_id, status, progress, message, created_at, updated_at }
}

// 获取文件下载 URL
export function downloadTaskFileUrl(taskId) {
  // 返回: `/api/download/tasks/{taskId}/file`
}
```

### MapContainer 范围选择集成

**方法**：`pickDownloadExtent()`

**工作流**：
1. 激活 DragBox 交互（矩形选择）
2. 用户在地图上拖拽选择范围
3. 返回 EPSG:3857 范围: `[minX, minY, maxX, maxY]`
4. 调用 `toLonLat()` 转换为 EPSG:4326 (WGS84)
5. 返回 Promise 对象：
   ```javascript
   {
     extent: [minLon, minLat, maxLon, maxLat],
     crs: 'EPSG:4326'
   }
   ```

**坐标系说明**：
- **EPSG:3857** (Web Mercator)：OpenLayers 内部使用，X/Y 分别为投影坐标
- **EPSG:4326** (WGS84)：GIS 标准坐标系，经度/纬度（Lon/Lat）
- 转换函数：`toLonLat([projX, projY]) → [lon, lat]`

---

## 近期架构更新

### 🔄 V3.0.7 (2026-05-01)

## 开发约定

- 统一从聚合入口导入（如 `@/api`、`@/stores`、`@/composables/map`）
- 新增功能优先在 `composables/map/features` 扩展，避免堆叠到组件内
- 新增或重命名文件后，请同步更新本 README 的目录结构章节

## 常用命令

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

## 许可证

MIT

---

最后更新：2026-06-19
说明：`GlobalLoading.vue` 已在 `App.vue` 全局挂载，业务组件仅需调用 `showLoading(text)` 与 `hideLoading()` 即可。

## 后续变更程序准则（贡献者约定）

1. **边界优先**：新增能力先确定归属目录，再决定导出入口；禁止为“快速可用”绕过边界。
2. **职责单一**：
    - 组件层（`components/`）：只处理 UI 与事件。
    - 编排层（`composables/map`）：组织流程与地图动作。
    - 状态层（`stores/`）：维护业务状态与派生树。
    - 工具层（`utils/`）：纯函数与解析逻辑。
    - 服务层（`api/`）：外部服务调用与结果标准化。
3. **新增文件必须补齐出口**：新增 `api`/`store`/`constant`/`map feature`/`utils` 文件后，同步更新对应 `index` barrel。
4. **文档同步更新**：目录变化、职责迁移、公共入口变更必须同步更新 README 的目录结构与本章节。
5. **提交前最小验收**：
    - 运行 `npm run docs:index`（边界索引同步）。
    - 运行 `npm run build`（构建校验通过）。
    - 检查是否出现跨层深链导入与重复实现。

## 版本记录

### V3.3.5 (2026-06-15)
#### 🔐 运行时地图 Token 池 + 四类 API 备用 Token

**新增与增强：**
- `api/backend/runtime.js`：新增 `/api/runtime-config/map-tokens` 运行时配置接口封装
- `services/runtimeMapTokens.js`：新增天地图/Cesium token 池缓存、失败标记与备用 token 切换能力
- `components/UserCenter/ApiKeysManagementPanel.vue`：新增备用 Token 池管理区，支持高德、Agent、天地图、Cesium 四类 API 任意数量备用 token
- `components/Map/MapContainer.vue`：2D 天地图瓦片连续失败时切换备用 TK，并重建当前可见底图 source
- `components/Cesium/CesiumContainer.vue`：Cesium 初始化失败时自动尝试备用 Cesium Ion / 天地图 token 并重建 viewer
- `components/Cesium/composables/useCesiumLayers.js`：叠加层保留 Cesium OSM Buildings（ion asset 96188）与 Google Photorealistic 3D Tiles

**安全变化：**
- 生产构建不再从 `VITE_TIANDITU_TK` / `VITE_CESIUM_ION_TOKEN` 读取真实 token
- 浏览器直连 token 仍会暴露给浏览器，请在天地图与 Cesium ion 后台限制域名、Referer、权限和配额

详见 [`../Docs/26-06/26-06-15/2026-06-15-readme-structure-sync-v335.md`](../Docs/26-06/26-06-15/2026-06-15-readme-structure-sync-v335.md)

### V3.3.4 (2026-06-14)
#### 🧭 Cesium 三维分析控制面板增强 + 掩膜分析（水体模拟）

**新增与增强：**
- `components/Cesium/CesiumToolPanel.vue`：控制项标签旁新增 `?` 提示气泡，解释阈值、混合、光强、水位、水色等参数含义
- `components/Cesium/CesiumToolPanel.vue`：图层 tab 中底图源、地形、叠加层改为折叠卡片，并通过 UI 状态版本确保升级后默认收起
- `components/Cesium/composables/useCesiumLayers.js`：地形新增 ArcGIS World Elevation 3D；叠加层新增 Cesium OSM Buildings（ion asset 96188）开关，并支持 Google Photorealistic 3D Tiles
- `components/Cesium/composables/useCesiumToolModules.js`：流体模块接入水位状态、动态值域、显示值格式化和调色板配置
- `components/Cesium/FluidSimulation/FluidSimulationPanel.vue`：水体外包盒高度改为按采样高程最低点到最高点动态计算
- `components/Cesium/FluidSimulation/FluidSimulationPanel.vue`：点击位置三维坐标高程作为初始水位，并纳入外包盒初始范围
- `components/Cesium/FluidSimulation/FluidSimulationPanel.vue`：新增水位滑杆和数值输入，值域来自当前捕捉区域高程范围
- `components/Cesium/FluidSimulation/FluidSimulationPanel.vue`：新增水色调色板，支持实时修改水体渲染颜色
- `components/Cesium/FluidSimulation/fluidRuntime.js`：水位改为当前高程值域内的归一化绝对海拔，并支持 `setInitialWaterLevel()` 重置模拟
- `components/Cesium/FluidSimulation/fluidRuntime.js`：恢复顶部薄层动画水面效果，避免绝对水位模式下顶层特效消失
- `components/Map/MapContainer.vue`：欢迎提示版本号同步到 V3.3.4

**交互变化：**
- 用户点击三维场景后，点击点海拔会成为初始水位；水位控制滑杆从该区域最低高程到最高高程变化
- 图层配置区默认只显示分组标题与当前摘要，点击标题行即可展开或收起对应配置项
- 地形分组现在支持天地图地形、Cesium 世界地形、ArcGIS 世界地形和平面地形四种来源
- 叠加层分组可一键加载/卸载 Cesium OSM Buildings（ion asset 96188）建筑图层，开关状态会持久化
- 相机可以进入水体外包盒；进入外包盒水平范围且低于盒顶时，水体主渲染 pass 会临时隐藏，离开后自动恢复
- 水体外包盒不再使用固定高度，海拔落差直接决定模拟体高度
- 流体参数在统一控制面板内集中调整，说明信息通过悬浮提示展示，减少参数含义猜测成本

详见 [`../Docs/26-06/26-06-14/2026-06-14-cesium-tool-panel-fluid-simulation-v334.md`](../Docs/26-06/26-06-14/2026-06-14-cesium-tool-panel-fluid-simulation-v334.md)

### V3.3.3 (2026-06-11)
#### 📧 邮箱账号化 + 旧用户绑定迁移

**修改：**
- `views/RegisterView.vue`：注册表单改为邮箱、昵称、密码和验证码；登录框文案调整为“邮箱/旧用户名”；旧用户名登录后展示绑定邮箱面板而不是直接进入 `/home`
- `api/backend/auth.js`：新增 `apiAuthBindEmail`、`apiAuthChangeDisplayName`，注册接口兼容对象 payload
- `api/backend/client.js`：识别 `403 EMAIL_BINDING_REQUIRED`，供受限绑定态前端处理
- `composables/auth/useAuthIdentity.js`：封装邮箱、昵称、密码校验和用户显示名解析，避免认证身份逻辑继续堆在注册页
- `components/UserCenter/FloatingAccountPanel.vue`：账号中心优先展示 `display_name` 和邮箱，并接入昵称修改
- `components/UserCenter/tabs/SecurityTab.vue`：安全页增加昵称修改入口
- `components/UserCenter/FloatingAccountPanel.vue`：合并认证用户对象，避免统计中心旧结构覆盖中文昵称和头像索引；缺失头像字段的响应不再覆盖本地头像状态

**交互变化：**
- 新用户必须使用已验证邮箱完成注册，后续用邮箱登录和重置密码
- 无邮箱旧用户仍可用旧用户名和密码登录一次，但会被限制在绑定邮箱流程中
- 绑定邮箱成功后前端保存后端签发的新 token 并进入正式系统
- 中文昵称修改后持续展示，自定义头像索引保存后立即刷新并写回本地会话；管理员头像刷新也会保持已保存索引

详见 [`../Docs/26-06/26-06-11/2026-06-11-email-account-auth-migration.md`](../Docs/26-06/26-06-11/2026-06-11-email-account-auth-migration.md) | [`../Docs/26-06/26-06-11/2026-06-11-fix-display-name-avatar-persistence.md`](../Docs/26-06/26-06-11/2026-06-11-fix-display-name-avatar-persistence.md)

### V3.3.3 (2026-06-11)
#### 🎛️ Cesium 统一工具面板 + 水体流体模拟 + 底图/地形切换

**新增：**
- `CesiumToolPanel.vue`：统一控制台，管理场景导航、高级特效、风场和流体四大模块
- `FluidSimulation/FluidSimulationPanel.vue`：水体流体面板，支持高度图捕捉和参数实时调节
- `FluidSimulation/fluidRuntime.js`：WebGL 流体渲染引擎（GLSL 着色器 + 大气后处理）

**重构：**
- `CesiumContainer.vue`：移除内联 UI（按钮组 + 风场滑块），改为调度 CesiumToolPanel；新增天地图/Google 底图切换 + 三种地形源切换
- `CesiumAdvancedEffects.vue`：新增 headless 模式 + `controls` prop 外部同步

**交互变化：**
- 底图支持天地图/Google 一键切换（Google 走后端代理）
- 地形支持天地图地形/Cesium 世界地形/平面地形三种
- 风场、特效、流体参数统一在 ToolPanel 中调节

详见 [`../Docs/26-06/26-06-11/2026-06-11-cesium-tool-panel-fluid-simulation.md`](../Docs/26-06/26-06-11/2026-06-11-cesium-tool-panel-fluid-simulation.md)

### V3.3.3 (2026-06-11)
#### 🔧 流体模拟范围修复 + 特效默认关闭

**修复（fluidRuntime.js 8 项）：**
- UI 参数（threshold/blend/lightStrength）同步写入 `fluidParam`，真正控制流体模拟行为
- `terrainColor()` UV 映射修正：`p.xz` → `p.xz + 0.5`
- `terrainColor` 改采样 `iChannel0`（含水面数据）而非原始高度图
- `getHeight()` 改用 `texelFetch()` 避免线性插值伪影
- 正交相机 `frustum.far` 动态计算，覆盖高耸地形不裁剪
- Ray March 步长 0.1→0.3，80 次迭代足够穿越整个 box
- 移除未使用的 `waterSize` uniform
- 初始水深改用 `fluidParam.w` 控制（默认 3%）

**修复（特效默认值）：**
- `CesiumAdvancedEffects.vue`：fog/hbao/tiltShift/atmosphere 默认值全部改为 `false`
- `CesiumContainer.vue`：`advancedEffectControls` 默认值全部改为 `false`
- `initCinematicEffects` 中 `applyAtmosphereEnhancement` 改为条件调用

详见 [`../Docs/26-06/26-06-11/2026-06-11-fix-fluid-simulation-range-and-effects-defaults.md`](../Docs/26-06/26-06-11/2026-06-11-fix-fluid-simulation-range-and-effects-defaults.md)

### V3.3.2 (2026-06-09)
#### 📊 天气组件动态适配父组件尺寸 + 风力仪表 UI 优化

**修改：**
- `components/Weather/WeatherChartPanel.vue`：
  - 启用 CSS 容器查询 `container-type: inline-size; container-name: weather-panel`
  - 将媒体查询重构为容器查询 `@container weather-panel`
  - `.charts-layout` 改为响应式 grid，宽屏并排、窄面板堆叠
  - `.chart-canvas` 适配父容器真实尺寸，避免 ECharts 初始化拿到固定高度

- `composables/weather/useWeatherCharts.js`：
  - 新增 `ResizeObserver` 监听图表容器、图表面板及天气面板大小变化
  - 容器尺寸变化时通过防抖 + `requestAnimationFrame` 触发 resize + 重新渲染
  - 气温趋势图和风力图均基于图表 DOM 真实宽高计算 legend、grid、字号、标记点
  - 气温趋势图恢复最高/最低标注，白天与晚间两条曲线均显示温度标注
  - 风力图改为上下 50% 分区：上半区仅显示轻量风力仪表，下半区独立显示预报风级柱线图
  - 预报风级纵轴改为按白天/夜间/平均风力返回值域动态计算，低风级数据对比更明显
  - `setupResizeObserver()` 在图表实例创建时自动调用
  - 组件卸载时清理 ResizeObserver

- `composables/weather/useWeatherData.js`：
  - 城市名称解析优先使用高德正地理编码返回的 adcode，只有缺失 adcode 时才逆地理编码兜底
  - 手动 adcode 查询和城市解析查询不再先 `setAdcode`，避免 store watcher 与手动加载重复触发天气请求

- `components/Weather/WeatherLiveCards.vue`：
  - 启用 CSS 容器查询 `container-type: inline-size`
  - 主卡片最小宽度从 260px 降为 180px
  - 降雨面板右侧最小宽度从 260px 降为 200px
  - 添加 `@container` 查询，根据父容器宽度自适应布局

- `stores/useCompassStore.ts`：
  - 新增固定屏幕 HUD 专用渲染配置生成逻辑
  - 按 HUD 尺寸缩放刻度线高度、刻度数字字号、分层文字字号、天池半径和天心十字线宽度
  - 对 24/60 分宫等高密度图层设置更小字号上限，减少小 HUD 中的文字遮挡和环层塌陷
  - HUD 默认尺寸提升到 340px，并将尺寸范围统一为 240-560px

- `components/Map/MapContainer.vue`：
  - 固定屏幕 HUD 浮层增加圆形背景、响应式边距和 drop shadow
  - 为罗盘 SVG 增加 `overflow: visible` 显示保护，避免边缘被裁切

- `components/Compass/CompassControlPanel.vue`：
  - HUD 尺寸滑杆范围同步为 240-560px，和 store 的实际 clamp 保持一致

- `composables/tileSource/tileLifecycle.ts`：
  - 外部 HTTP(S) 瓦片请求直连优先，直连失败后兜底请求既有 `/proxy/{URL}` 后端代理
  - 保留 `fetch + AbortController` 中断请求能力，同时避免第三方瓦片缺少 CORS 响应头导致图源完全不可用
  - 已经是后端代理、当前站点同源、`/proxy/` 或 `/tiles/` 的地址不再二次代理
  - 支持 `VITE_TILE_PROXY_BASE_URL` 指定代理根地址，`VITE_TILE_PROXY_MODE=always` 强制代理，`off` 关闭兜底代理

- `.env.example`：
  - 补充 `VITE_TILE_PROXY_BASE_URL` 和 `VITE_TILE_PROXY_MODE` 示例配置

**解决的问题：**
- 图表容器高度写死 `clamp(240px, 34vh, 340px)`，不随父组件变化
- 只监听 `window.resize`，侧边栏折叠/面板展开时图表不重新适配
- 风力仪表的指针、刻度、图例与柱状图区在窄面板中互相遮挡
- 实况卡片固定 `min-width: 260px`，窄屏下布局溢出
- 媒体查询只响应视口宽度，不响应父容器实际宽度
- 罗盘 HUD 固定屏幕模式直接压缩大尺寸主题参数，导致刻度、文字和中心盘挤压塌陷
- HUD 尺寸滑杆展示范围与 store 实际限制不一致，调整反馈不直观
- `maps-for-free.com` 等第三方瓦片服务不返回 CORS 响应头时，统一瓦片 `fetch` 直连会被浏览器拦截，需要代理兜底

---

### V3.3.1 (2026-06-06)
#### 📱 LogMonitor 移动端/Pad 适配修复

**修改：**
- `components/Shell/TopBar.vue`：
  - 新增 `ActivityIcon` 图标导入
  - 新增 `useAppStore` 和 `storeToRefs` 导入
  - 新增 `logMonitorVisible` 响应式状态
  - 新增 `handleToggleLogMonitor()` 函数
  - 浮动菜单中新增"日志监控"入口按钮

- `components/ControlsPanel/LogMonitor.vue`：
  - **基础样式重构**：`.panel-header` 改为 `min-height: 36px` + `height: auto` + `flex-wrap: wrap`
  - **按钮防换行**：`.action-btn` 添加 `white-space: nowrap` + `flex-shrink: 0`
  - **iPad 横屏适配**（1024px ~ 1366px）：50% 宽度 + 最小宽度 400px + 按钮优化
  - **Pad 竖屏适配**（769px ~ 1023px）：60% 宽度 + 隐藏 Lock scroll
  - **移动端适配**（≤768px）：面板高度 35vh + 按钮 min-height: 36px
  - **极窄屏适配**（≤380px）：隐藏按钮文字，只显示图标
  - **iPad 横屏按钮修复**：增加面板最小宽度，优化按钮内边距，防止"复制全部"和"开启"按钮文字换行

- `components/Map/MapSwipeController.vue`：
  - **新增移动端控制面板**：预设位置按钮（25%、50%、75%）+ 滑块控件
  - **新增函数**：`setPresetPosition()` 预设切换、`handleSliderInput()` 滑块处理
  - **新增样式**：`.mobile-controls`、`.preset-buttons`、`.slider-control` 等
  - **响应式显示**：仅在移动端（≤576px）显示控制面板

**解决的问题：**
- 移动端用户无法打开日志监控面板（ControlsPanel 被隐藏）
- iPad 横屏"复制全部"文字垂直显示
- "开启"开关在 Pad 上无法显示
- 移动端卷帘分析滑块操作困难，需要长按才能拖拽

详见 [开发日志](../Docs/06-06/2026-06-06-log-monitor-mobile-pad-fix.md)

---

### V3.2.7 (2026-06-04)
#### 🤖 Agent Chat 默认 AI 专属配置模式

**新增：**
- `api/backend/agent.js`：新增 4 个 API 函数
  - `apiAdminGetDefaultAIConfig()` — 管理员获取默认 AI 配置（含 api_key）
  - `apiAdminUpdateDefaultAIConfig()` — 管理员更新默认 AI 配置
  - `apiGetDefaultAIConfig()` — 公开获取默认 AI 配置（不含 api_key）
  - `apiAgentChatDefaultProxy()` — 使用默认 AI 配置代理聊天

- `components/Chat/ChatPanelContent.vue`：
  - 新增第三种路由模式：默认 AI 模式（`isDefaultAIMode`）
  - 启动时自动加载管理员配置的默认 AI 配置
  - 模式切换：默认 AI → 个人 Key → 后端代理
  - UI 状态展示区分三种模式

- `components/UserCenter/ApiKeysManagementPanel.vue`：
  - 新增"默认 AI 专属配置"管理面板
  - 支持查看/编辑/保存/取消操作
  - API Key 掩码显示

### V3.2.6 (2026-06-04)
#### 🧩 可复用 ExtentPicker 框选组件

**新增：**
- `components/Common/ExtentPicker.vue`：通用框选范围组件（开始框选/重新框选/清除选区/状态提示/坐标标签）
- Props: `hasExtent` / `disabled` / `extentLabel`；Events: `pick-extent` / `clear-extent`

**重构：**
- SpatialAnalysisPanel 渔网分析：内联"地图选取"按钮 → `ExtentPicker`（新增清除功能 + 状态提示）
- MapDownloader：内联 3 个按钮 + hint → `ExtentPicker`（统一交互体验）

### V3.2.5 (2026-06-04)
#### 🌐 空间分析统一 EPSG:3857 + 渔网分析 + 模块化拆分

**新增：**
- 空间分析面板新增"渔网分析"工具（四至输入 + 地图框选/当前视图 + 网格大小 + 面/线 + 中心点）
- 通用 `pickBoxExtent()` 框选函数（`useMapInteractionPickers.js`），从下载专用逻辑中解耦
- `pickExtent` prop 逐层传递：HomeView → ControlsPanel → SpatialAnalysisPanel

**重构：**
- 删除前端 `metersToDegrees`/`getReferenceLat`/`toLonLat` 重复转换函数
- aggregation `_gridSize` → `gridSize`（修复命名 bug：用户输入被静默忽略）
- aggregation 标签"度"→"米"，默认值 0.01→500
- simplify tolerance 直接传米（后端在 3857 下处理）
- fishnet payload `grid_size_meters` → `grid_size`（统一字段名）

### V3.2.2 (2026-06-04)
#### 🔧 统一 HTTP 状态码映射 + 日志监控修复 + 瓦片请求中断修复

**新增：**
- `api/httpStatusMap.js`：统一 HTTP 状态码映射模块（80+ 标准 HTTP 码 + 40+ 高德 infocode）

**修复：**
- axios 拦截器错误处理使用状态码映射，`apiError` 新增 `status`/`statusText`
- 统一 geocoding / weather / ipLocation / map / locationSearch 的 infocode 错误映射
- LogMonitor `getLogClass()` HTTP 状态码正则检测优先于 `INFO`，5xx 红色 / 4xx 黄色
- `tileLifecycle.ts` 用 `fetch()` + `AbortController.signal` 替代 `img.src`，abort 立即释放 TCP
- 修复 `useBasemapResilience` 的 `validateBaseLayerSwitch` setTimeout 泄漏

### V3.2.1 (2026-06-03)
#### 📧 邮箱验证码系统 + 密码重置 + 认证安全增强

**后端新增：**
- 新增 `email_service.py`：SMTP 邮件发送服务（阿里云邮件推送代理转发，HTML 验证码模板，异步发送）
- 新增 `verification.py`：验证码核心逻辑（secrets 安全生成、频率限制 60秒/次、每日上限 10次、5次尝试上限、5分钟有效期）
- 新增 `email_verification_codes` 表 + users 表 email/email_verified 字段 + 邮箱部分唯一索引
- 新增 SendCodeRequest / VerifyCodeRequest / ResetPasswordRequest 请求模型
- 新增 POST `/send-code`、`/verify-code`、`/reset-password` 接口
- 改造 POST `/register` 支持邮箱绑定（可选）
- 新增 `_get_user_by_email_sync` / `_check_email_taken_sync` / `_update_user_password_by_email_sync` 等邮箱 CRUD

**前端新增：**
- 新增 `apiAuthSendCode` / `apiAuthVerifyCode` / `apiAuthResetPassword` API 函数
- `apiAuthRegister` 扩展 email/emailCode 参数
- 注册表新增邮箱输入框 + 验证码行（发送/验证/已验证徽章）
- 登录模式新增"忘记密码？"链接 + 密码重置弹窗（两步：邮箱→验证码+新密码）
- 新增完整 CSS 样式（邮箱验证码行、忘记密码链接、密码重置弹窗）

**安全设计：**
- 6位数字验证码（secrets 模块安全生成）
- 60秒发送间隔限制 + 每日上限 10 次
- 5分钟有效期 + 最多 5 次验证尝试
- 邮箱部分唯一索引（防并发注册竞态）
- 密码重置后注销该账号全部会话

**Code Review 修复：**
- schema.py 新增邮箱唯一索引（`idx_users_email_unique`），防止并发注册竞态
- auth.js 移除密码字段 trim，保留用户输入意图

---

### V3.2.0 (2026-06-03)
#### ✨ 圆环粒子特效鼠标交互 + 🔧 GCJ-02 纠偏模块优化

**新增功能：**
- 新增 `useRingExplosion.js` 圆环粒子迸溅特效（Apple Watch 风格）
- 鼠标跟随：圆环平滑跟随鼠标移动（缓动插值系数 0.08）
- 悬停增强：鼠标进入圆环范围时亮度提升 1.4 倍，颜色粉色→蓝色平滑渐变
- 点击迸发：鼠标点击瞬间爆发 30 个高速粒子（2.5x 速度）
- 拖拽旋转：鼠标拖拽时计算角速度，影响粒子切向速度方向
- 悬停渐变：hoverFactor [0,1] 平滑过渡，HSL 插值，进入速度 0.06，退出 0.04

**技术实现：**
- 鼠标状态对象统一管理交互状态
- 平滑跟随使用线性插值避免卡顿
- 悬停检测使用距离判断（RING_RADIUS + 30 缓冲区）
- 角速度计算处理 ±PI 跨越问题
- 事件监听在 destroy 时正确移除避免内存泄漏

**后端优化 - GCJ-02 纠偏模块：**
- **P0 修复**：`fetch_tile()` 移除递归调用，改为循环+重试（MAX_RETRIES=2）
- **P1 性能**：缓存命中时直接 `read_bytes()` 返回，避免解码/编码（预期 -50% I/O）
- **P1 性能**：添加 `_is_valid_image_bytes()` 魔数快速验证，避免不必要 PIL 解码
- **P2 质量**：`transform.py` 代码全面重构（命名、文档、类型注解、收敛警告）
- **健壮性**：WebP 格式检查长度验证、瓦片获取异常处理、变量初始化

### V3.1.9 (2026-06-02)
#### 🧹 项目文件重构 — 清理/去重/拆分/重组

**Phase 1 — 清理死代码（-1.5MB 构建产物）**
- 删除 vendored `public/ol.js` + `public/ol.css`（~1.5MB 死代码，项目已通过 npm 引入 OL）
- 移动 `public/images/images_to_webp.py` → `scripts/`（Python 脚本不应部署到生产）
- 重命名 `kmlStyleParser.doc.js` → `kmlStyleParser.doc.md`（文档文件不应使用 .js 扩展名）
- 删除空目录：`src/components/Widgets/`、`feng-shui-compass-svg/data/`、`src/gis/`（整个空壳 scaffold）
- 修复拼写错误：`dark_explantion.json` → `dark_explanation.json`

**Phase 2 — 消除重复工具函数（6+ 处 → 1 处）**
- 新建 `src/utils/pathUtils.js`：统一 `normalizePath`、`getExtension`、`getStem`、`getNameStem`、`getDir`、`splitDirAndFile`、`resolveRelativePath` 等路径工具
- 新建 `src/utils/textDecoder.js`：统一 `decodeTextContent`（多编码自动检测）和 `decodeBufferSimple`（UTF-8+GBK 快速版）
- 消除 `normalizeBinaryFlag` 重复：`useMapState.js`、`useUserLocation.js` 改为导入 `utils/normalize.ts`
- 更新 6 个文件改用共享模块：`archiveProcessor.js`、`batchProcessor.js`、`decompressFile.js`、`useGisLoader.ts`、`useKmzLoader.js`、`useSharedResourceLoader.ts`

**Phase 3 — 数据文件重组**
- 移动 `constants/goldenSoupQuotes.js` → `src/data/goldenSoupQuotes.js`（1454 行语录数据不属于常量配置）
- 重命名 `NON_STANDARD_XYZ_ADAPTER_EXAMPLES.ts` → `tileSourceAdapters.ts`（文件名与实际内容匹配）

**Phase 4 — 超大组件拆分**
- `FloatingAccountPanel.vue` (2520 → 1463 行, -42%)：提取 `OverviewTab.vue`(492行)、`SecurityTab.vue`(289行)、`PreferencesTab.vue`(562行)，子组件通过 `defineAsyncComponent` 懒加载
- `WeatherChartPanel.vue` (1883 → 452 行, -76%)：提取 `useWeatherData.js`、`useWeatherCharts.js`、`weatherUtils.js`、`WeatherLiveCards.vue`、`WeatherForecastTable.vue`

**Phase 5 — Barrel 清理**
- `utils/geo/index.js`：移除不相关的 re-export（amapAoiParser、driveXmlParser、drawTransitRoute、transitRouteBuilder），仅保留 CRS 相关模块
- `utils/biz/index.js`：移除服务层 re-export（userLocationContext、userPositionCache），仅保留纯工具函数

**Phase 6 — 文档同步**
- 更新 README 目录结构树，反映所有变更

### V3.1.8 (2026-05-30)
#### 🔧 ESLint 全项目修复 + 超大文件拆分

- **ESLint**：389 → 0 errors，修复全部未使用变量、空 catch 块、console 语句、无用转义等
- **TypeScript**：新建 `tsconfig.json`，修复 12 个类型错误
- **拆分 `api/backend.js`** (881 行 → 10 文件)：按业务域拆为 `backend/{client,auth,location,weather,routing,agent,statistics,admin,spatial}.js`
- **拆分 `useTileSourceFactory.ts`** (1099 行 → 8 文件)：按职责拆为 `tileSource/{types,urlUtils,tileLifecycle,wmsSource,wmtsSource,xyzSource}.ts`
- **拆分 `dataDispatcher.js`** (696 行 → 3 文件)：提取 `archiveProcessor.js` + `shpPacketBuilder.js`
- **修复构建警告**：`useFluid.js`、`useMapUIEventHandlers.js` 导入语句修复

### V3.1.7 (2026-05-29)
#### 🔧 Code Review 修复 + ESLint TypeScript 支持 + 环境变量集中管理

- **Code Review**：修复 34 项 composable/store/component 问题（资源泄漏、死代码、性能）
- **ESLint**：启用 `typescript-eslint`，`.vue` 文件正确解析 TS 语法
- **环境变量**：新建 `config/env.ts` 集中管理 `TIANDITU_TOKEN` / `AMAP_WEB_KEY` / `BACKEND_BASE_URL`
- **工具函数**：`normalizeBinaryFlag` 提取到 `utils/normalize.ts`，消除 5 处重复实现
- **MapContainer**：`await loadMapRuntimeDeps()` 改为静态 import，修复 `defineExpose after await` 编译错误

### V3.1.6 (2026-05-29)
#### 🔧 超大文件拆分 + 图层拖拽性能优化

- 底图/数据导入/图层 Store 模块化拆分
- `useBasemapManager.ts` 1587 行 → ~400 行
- `useLayerStore.ts` 1110 行 → 344 行
- 拖拽排序响应速度提升 90%+

### V3.0.7 (2026-05-01)
#### 🔹 在线地图性能优化与功能完善

本次版本聚焦**底图/图层切换体验、内存稳定性、弱网兼容性**，全面解决卡顿、延迟、闪烁、内存泄漏等问题，图层操作响应速度、界面流畅度、长期运行稳定性实现大幅提升，同时保持功能兼容、无感升级。

---

#### 🚀 核心优化（重点）
##### 1. 图层切换性能极致优化
- 移除**多层防抖嵌套**，统一防抖策略，切换响应延迟从 **600ms → 300ms**，提速 50%
- 优化地图渲染逻辑，合并冗余重绘操作，切换时界面**无闪烁、无抖动**
- 新增快速失败机制，底图验证超时从 **3s → 1.5s**，弱网环境反馈更及时

##### 2. 内存泄漏 & 资源管控
- 新增 `AbortController` 异步请求中断控制，切换时自动清理未完成请求
- 实现 LRU 缓存限制，错误状态集合固定容量 50 条，杜绝内存无限增长
- 优化图层实例生命周期管理，长期运行地图不卡顿、不崩溃

##### 3. 交互体验升级
- 图层切换、底图加载、顺序调整全程**丝滑流畅**
- 避免重复触发、重复加载、重复渲染，操作更跟手
- 状态更新批处理，界面响应更统一、无跳变

##### 4. 可靠性 & 稳定性增强
- 移除危险的“跳过验证直接加载”逻辑，底图状态判断准确率提升至 99%+
- 完善异常捕获、加载失败提示，避免控制台报错
- 兼容国内外地图服务、天地图、自定义底图服务

---

#### 📊 优化前后对比
| 体验指标 | 优化前 | 优化后 | 提升效果 |
|--------|--------|--------|----------|
| 图层切换响应延迟 | 600ms | 300ms | 速度提升 50% |
| 底图服务验证超时 | 3000ms | 1500ms | 弱网体验大幅改善 |
| 页面重绘次数 | 3~4 次/次操作 | 1 次/次操作 | 无闪烁、更流畅 |
| 内存占用趋势 | 持续增长 | 恒定稳定 | 长期使用不卡顿 |
| 功能成功率 | 85% | 99%+ | 几乎零失败 |

---

#### 📦 涉及文件
- `useLayerControlHandlers.js` —— 图层切换核心逻辑
- `useBasemapSelectionWatcher.js` —— 底图选择监听
- `useBasemapResilience.js` —— 底图验证与容错
- `useBasemapStateManagement.js` —— 状态与事件批处理

---

#### ⚠️ 兼容说明
- **无破坏性变更**：对外 props / events 完全保持不变
- 父组件、子组件调用逻辑无需修改
- 可直接升级，支持一键回滚

---

#### ✅ 使用者收益
1. **操作更流畅**：图层切换秒响应，无延迟、无卡顿
2. **长期更稳定**：地图长时间运行不崩溃、不内存溢出
3. **网络更兼容**：弱网环境下加载更快、提示更准确
4. **维护更简单**：逻辑统一、代码健壮，减少线上问题



### V3.0.6 (2026-04-30)
#### 🧭 罗盘宫位解释系统与性能优化
* **宫位解释架构升级**：
  * 新增 `src/utils/explanationLookup.ts`，实现分层精确查询（按 sectionKey + palaceName 精确匹配）与多级回退策略（universalQuery/generateDefaultExplanation），确保所有宫位都有解释显示。
  * 新增 `src/utils/themeExplanationMapper.ts`，负责主题识别（根据 config.info 推导）、标准化 JSON 优先导入、缺失时自动兜底，完整支持 5 种主题映射。
  * 新增 `src/components/PalaceExplanationPanel.vue`，渲染点击宫位的风水解释面板（支持 5 种主题样式，包含完整的 UI 交互与关闭逻辑）。
  * 新增 5 个标准化 JSON 解释库：`compass_explanation_standard.json`、`polygon_explanation_standard.json`、`circle_explanation_standard.json`、`dark_explanation_standard.json`、`simple_explanation_standard.json`，每个采用统一的 { category, title, meaning } schema。
  * 新增 `src/utils/DATA_FORMAT_SPECIFICATION.md`，规范宫位解释 JSON 的数据结构与扩展方式。
* **罗盘性能重构**：
  * 修改 `src/stores/useCompassStore.ts`，默认位置改为 `NaN`（无有效值），避免页面加载时不必要的默认罗盘渲染。
  * 修改 `src/services/CompassManager.ts`：
    - `ensureVectorLayer()` 延迟创建逻辑，仅当启用且为 vector 模式时才创建图层。
    - `bindStoreWatchers()` 新增 watch，在 enabled && mode === 'vector' 时触发懒创建。
    - `handleMapSingleClick` 分支支持放置模式（placementMode=true 时直接设置位置）与宫位选中（非放置模式时解析宫位并触发高亮）。
  * 修改 `src/components/PalaceExplanationPanel.vue`，宫位名称拼接改用 `join('')` 而非仅取首字，完整支持三字及以上宫位标签。
* **交互改进**：
  * 修改 `src/stores/useCompassStore.ts` 的 `setSelectedPalace()` 与相关 action，支持点击宫位后自动渲染高亮扇区。
  * 修改 `setPosition()` 逻辑，移动罗盘时自动清除之前的选中状态，避免弹窗漂移。
* **文档完善**：
  * 更新 `frontend/README.md` 的目录结构与版本记录。
* **构建验证**：所有修改文件均通过 TypeScript 静态检查，无编译错误。
* **关键特性**：
  * 罗盘默认不加载（cs=0），仅用户主动启用或分享链接带参数时才渲染。
  * 宫位点击与选中的高亮、解释显示完全解耦，互不干扰，地图 click 事件保持原有逻辑不变。
  * 支持灵活扩展：新增宫位解释只需更新 JSON 文件，无需修改代码。

### V2.8.8 (2026-04-17)
#### 🌲 ParentId 驱动的上传层次结构实现 + TOC 协议层中心化
* **协议层中心化**：新增 `src/composables/map/toc/protocol.js`，集中管理 TOC_MENU_COMMANDS、导出格式标准化（normalizeTocExportFormat）、图层 ID 解析（normalizeTocLayerId）、能力解析等协议定义。
* **上传层次化构建**：在 `useLayerStore.ts` 中新增上传层次结构相关函数：
  * `buildUploadLayerChildren()` - 从 parentId 路径链构建文件夹 + 层级关系
  * `normalizeUploadFolderPath()` - 支持多种分隔符（`/`、`\`、`>`）的路径规范化
  * `buildUploadFolderPathChain()` - 递归生成完整的祖先路径链（用于展开状态初始化）
  * `toUploadFolderNodeId()` - 动态文件夹 ID 生成（前缀 `folder-upload-dyn:`）
  * `deriveUploadFolderDisplayName()` - 文件夹显示名称推导
  * `UploadFolderEntry` 类型定义 - 层级树节点结构
* **展开状态智能初始化**：上传图层树的所有祖先文件夹在 `syncLayers()` 时自动标记为展开，提供直观的默认 UX
* **兼容性保证**：保留对遗留 parentId 格式的降级支持，不破坏现有上传流程
* **构建验证**：`npm run build` 成功（1266 modules transformed，SidePanel 109.48 kB / 36.81 kB gzipped）

#### 🌳 TOC 右键菜单架构收敛 + KML 增强
* **右键命令迁移完成**：将 TOC 右键命令解析从组件中迁移到 `src/composables/map/toc/menu/commandDispatcher.js`，组件仅负责渲染与事件透传。
* **右键动作集中管理**：新增 `src/composables/map/toc/actions/contextActionManager.js`，统一处理多选、批量显示/隐藏、批量导出、批量移除及图层动作转发。
* **KML 导出服务独立**：新增 `src/composables/map/toc/actions/exportService.js`，通过 OpenLayers `KML` format 直接写出，`layerExportService.js` 改为调用该服务。
* **大树多选性能优化**：`selectionManager.js` 增加 `applyRecursiveSelectionChunked`，对上百要素 KML 文件夹执行分帧递归勾选，减少主线程阻塞。
* **TOC 领域边界成型**：新增 `src/composables/map/toc/index.js`，并由 `src/composables/map/index.js` 汇总导出，便于后续统一维护。
* **构建验证通过**：`npm run build` 成功（1265 modules transformed）。

### V2.8.7 (2026-04-16)
#### 🌿 全局 Loading 遮罩 + 高耗时流程统一反馈
* **新增全局遮罩组件**：`src/components/GlobalLoading.vue`，采用绿色主题、毛玻璃背景（`backdrop-filter: blur(4px)`）、CSS3 环形动画与动态提示语。
* **新增应用级状态仓库**：`src/stores/useAppStore.ts`，统一管理 `loading` 与 `loadingText` 状态。
* **新增全局工具接口**：`src/utils/loading.js` 暴露 `showLoading(text)` / `hideLoading()`，并通过 `src/utils/index.js` 统一导出。
* **关键流程完成接入**：`src/views/HomeView.vue` 接入 3D 模块懒加载和 GIS 数据导入；`src/components/CesiumContainer.vue` 接入 3D 运行时初始化阶段。
* **部署体验优化**：遮罩组件在根组件同步挂载，兼容 GitHub Pages，避免异步加载造成的首帧闪烁。

### V2.8.6 (2026-04-15)
#### 🧭 基于用户协助的高德 AOI 提取（半自动）
* **POI 点击直达注入流程**：用户点击高德搜索结果 POI 条目后，自动弹出 AOI 注入窗口，不再依赖 TOC 右键操作。
* **AOI 数据注入弹窗组件**：新增 `src/components/AmapAoiInjectDialog.vue`，提供 POI ID 输入、详情跳转、JSON 粘贴与解析绘制按钮，交互从“POI 点击”闭环完成。
* **解析逻辑解耦**：新增 `src/utils/gis/parsers/amapAoiParser.js`，统一封装 JSON 校验、`data.spec.mining_shape.shape` 提取、边界拆解与 `gcj02ToWgs84` 纠偏，组件层仅负责交互。
* **落图与 TOC 联动**：解析后自动创建独立 AOI 图层，命名格式为 `POI名称 - AOI范围`，并通过托管图层机制自动入 TOC 可管理。
* **样式与定位**：AOI 默认样式为半透明蓝填充（`rgba(0,153,255,0.2)`）+ 深蓝描边；绘制完成后自动 `fit` 到 AOI 范围。
* **属性同步与反馈**：完整写入高德 `base` 节点属性到要素属性表；成功后统一提示 `AOI 提取成功，属性已同步至属性表`。
* **鲁棒性增强**：对无效 JSON、缺失 shape、异常结构等场景进行友好提示（如 `未发现边界数据`），避免流程中断。
#### 🧩 POI-AOI 手动导入体验增强 + 搜索链路收敛
* **搜索结果新增「复制ID」按钮**：`LocationSearch.vue` 在每条结果中新增一键复制 POI ID，支持剪贴板 API 与降级复制方案，方便快速粘贴到 AOI 手动导入流程。
* **POI ID 自动回填 TOC**：地图搜索结果落图后，自动将当前 POI ID 同步到 TOC 的「高德 AOI 手动导入」输入框，详情链接实时联动更新，无需二次手动填写。
* **手动 AOI 命名统一**：手动粘贴高德详情 JSON 绘制 AOI 时，图层命名统一为 `POI名称_AOI`（若可解析到名称）。
* **事件链路增强**：新增 `search-poi-selected` 事件由 `MapContainer -> HomeView -> SidePanel -> TOCPanel` 透传，实现搜索与工具箱状态同步。
* **冗余代码清理**：
    * `LocationSearch.vue`：清理重复样式定义，修复未注入 `message` 的异常分支。
    * `TOCPanel.vue`：合并 POI ID 解析逻辑，移除重复提取函数。
    * `useMapSearchAndCoordinateInput.js`：简化单任务 `Promise.allSettled` 为直接异步捕获，减少无效层级。
    * `SidePanel.vue`：移除未使用的组件导入，降低噪声。
#### 🌦️ 天气看板图表优化 + 多设备适配
* **ECharts 配置升级**：气温图增强 tooltip、动态温度范围、最高/最低点标识、移动端图例与坐标标签自适应。
* **风力图可读性提升**：由“仪表 + 气泡”优化为“实况仪表 + 白天/夜间分组柱 + 平均风力线”，同时保留风向信息提示。
* **性能优化**：窗口尺寸变化加入防抖，避免连续 resize 导致图表频繁重绘。
* **响应式完善**：天气看板在桌面/平板/移动端分别优化卡片栅格、图表高度、按钮与输入布局；移动端进入天气模式时主内容区高度分配更合理。
* **文档同步**：README 增加天气 API、天气组件与天气 store 的目录说明，并更新高德 Key 用途。

### V2.8.5 (2026-04-15)
#### 🌐 多源地理服务 API 深度集成
* **统一 API 封装库**：新增 `src/api/geocoding.js` 与 `src/api/ipLocation.js`，深度集成 **高德 (AMap)** 与 **天地图 (Tianditu)** 双引擎。
    * **地理/逆地理编码**：支持结构化地址与经纬度双向转换，内置 WGS-84 (天地图) 与 GCJ-02 (高德) 坐标纠偏逻辑。
    * **IP 定位服务**：实现基于 IPv4 的城市级定位，支持获取行政区划编码（adcode）及城市矩形外包框（Rectangle）。

#### 🔐 URL 参数体系架构升级
* **新增三位一体参数协议**：
    * **`s` (Share ID)**：链接共享标识符，用于追踪分享来源与特定的业务会话上下文。
    * **`loc` (Location Status)**：用户实时定位标识，记录用户当前的定位授权状态。
    * **`p` (Private Encoded Data)**：加密地理位置参数。默认值为 `0`，用于存放基于 Base62 算法加密的短码信息。

#### 🧪 坐标加解密与隐私安全
* **可逆混淆算法**：于 `src/utils/urlCrypto.js` 中实现基于位封包（Bit-packing）与自定义 Base62 字符集的加解密逻辑。
* **信息保护**：将敏感的高精度信息浮点数转换为 8-10 位的混淆短串，非对称逻辑确保分享链接中的地理隐私安全。
* **参数绘制增强**：在坐标绘制面板新增 `p` 参数解析接口，实现“短码输入 -> 解码落图 -> 自动逆编码 -> 属性归档”的一键化链路。

#### 🛠️ 交互逻辑与绘图引擎优化
* **地理编码交互工具栏**：在绘制 Tab 中新增专属功能面板：
    * **地理编码（地址落图）**：支持模糊地址检索，自动解析坐标并加入 TOC 图层管理，原始地址自动同步为点位标注。
    * **逆地理编码（拾点识地）**：激活拾点模式后，

### V2.8.4 (2026-04-11)
#### 🧩 结构优化复盘 + MapContainer 解耦（Phase 18-25）
* **MapContainer 持续瘦身**：
    * 新增 `useLayerControlHandlers.js`，提取图层面板相关逻辑：`handleLayerChange`、`handleLayerOrderUpdate`、`loadCustomMap`。
    * 将地图交互样式切换到 `src/constants/mapStyles.js` 的 `createMapStylesObject()` 工厂统一生成。
    * 新增 `useDeferredUserLayerApis.js`，抽离用户图层延迟 API 门面（动态导入 + 动作代理）。
    * 新增 `useBasemapSelectionWatcher.js`，抽离底图切换监听与自动兜底逻辑。
    * 新增 `useBasemapLayerBootstrap.js`，抽离底图层初始化与首屏监控挂载。
    * 修复多处 setup 初始化顺序导致的引用问题（桥接函数 + 依赖顺序整理）。
    * 本轮持续重构后 MapContainer 行数约 `1263 -> 1042`（减少 221 行）。
* **feature 库补全**：
    * 新增并接入 `useMapUIEventHandlers.js`（Phase 18）。
    * 新增并接入 `useCreateManagedVectorLayer.js`（Phase 19）。
    * 新增并接入 `useLayerControlHandlers.js`（Phase 21）。
    * 新增并接入 `useDeferredUserLayerApis.js`（Phase 22）。
    * 新增并接入 `useBasemapSelectionWatcher.js`（Phase 23）。
    * 新增并接入 `useBasemapLayerBootstrap.js`（Phase 24）。
* **项目结构现代化整理（Phase 25）**：
    * 新增 `src/composables/map/features/index.js`，MapContainer 改为统一 barrel 导入，降低 import 分散度。
    * `useLayerStore` 主实现迁移至 `src/stores/useLayerStore.ts`。
    * 删除冗余旧入口：`src/composables/useAreaImageOverlay.js`、`src/composables/useGisLoader.js`。
* **目录边界收口（Phase 26）**：
    * 新增 `src/stores/index.ts` 与 `src/constants/index.js`，统一跨层导入到目录边界。
    * 规范化本地导入，移除 `./xxx.ts` 显式后缀写法。
    * 清退空壳兼容层 `src/composables/useLayerStore.ts`。
    * 新增 `scripts/generate-boundary-index.mjs` 与 `npm run docs:index`，自动维护 `docs/BOUNDARY_INDEX.md`。
* **构建验证**：
    * `npm run build` 持续通过，1229-1233 模块范围内稳定构建，无编译错误。

#### 🎯 移动端优化 + 地图事件处理提取 + MapContainer 重构
* **移动端交互升级**：
  * 替换双击为长按（500ms）打开上下文菜单，提升移动端体验。
  * 禁用移动端拖拽排序（Drag-Drop），保留 checkbox 显隐控制。
  * 添加触摸防漂移检测，移动超过 10px 自动取消长按。
  * Long-press 菜单支持完整操作（透明度、置顶/置底、URL 操作）。
* **地图事件处理提取（Phase 17）**：
  * 创建 `useMapEventHandlers.js`，统一处理所有地图事件（pointermove、singleclick、contextmenu、坐标更新等）。
  * 坐标同步逻辑从 3 处分散位置合并到单一 `updateCurrentCoordinate` 函数。
  * MapContainer 代码量减少 130+ 行（从 1420 → 1280 行）。
  * 构建验证：1226 modules，20.06s，✅ 无错误。
* **LayerControlPanel 增强**：
  * 新增 `clearLongPressTimer` 函数，支持触摸取消与自动清理。
  * CSS 增强：`-webkit-user-select: none` + `-webkit-touch-callout: none`，防止长按出现文本选择菜单。
  * 移动端显示绿色"⋯"图标代替"⋮⋮"，视觉清晰提示长按操作。

### V2.8.3 (2026-04-08)
#### 🐛 标注菜单修复 + 文件结构优化 + 共享资源递归扫描
* **标注菜单 Bug 修复**：修正 TOCTreeItem.vue 中标注菜单判断逻辑，使用正确的属性 `props.node?.raw?.name` 替代不存在的 `labelFieldValue`，解决标注开启/关闭菜单无法显示的问题。
* **文件结构重构**：
  * 将非标准切片适配器等常量迁移至 `src/constants/` 目录，使 `composables` 职责聚焦于业务逻辑。
  * 新增 `src/views/` 目录，集中管理页面级组件（HomeView、RegisterView）。
  * `src/router/` 独立路由配置，支持未来的页面路由拓展。
  * `src/stores/` 集中 Pinia 状态管理（useLayerStore.ts）。
* **共享资源支持递归子文件夹**：
  * `useSharedResourceLoader` 中 glob pattern 从 `/public/ShareDate/*` 升级为 `/public/ShareDate/**/*`，支持无限深度嵌套文件夹。
  * TOCPanel 显示效果同步，多级目录以"📂 文件夹名"标题分组展示。
  * 优化文件夹排序策略，"根目录"始终排前，其余按字母顺序排列。
* **项目文档同步**：更新 README 目录树结构部分，新增 `constants/`、`views/`、`stores/` 目录说明与文件清单。

#### 📦 共享资源快速加载 + 样式优化
* **共享资源加载器**：新增 `useSharedResourceLoader` composable，自动扫描 `public/ShareDate` 目录中的 KML/KMZ/GeoJSON/JSON/SHP/TIF/TIFF 文件。
* **TOCPanel 集成共享资源**：在"图层"标签页下方添加"共享资源"菜单，用户点击"加载资源"按钮自动扫描，扫描结果以子菜单形式展示。
* **复用上传逻辑**：每个共享资源将被转换为 File 对象，通过现有的导入流程处理，保证与手动上传完全一致的行为和错误处理。
* **零代码维护**：不需要修改代码，只需将 KML/SHP 等文件放入 `public/ShareDate` 文件夹即可自动发现和二次利用。
* **样式适配绿色主题**：共享资源菜单、按钮和资源项采用项目绿色主题（#2f9a57 等），与整体 UI 风格一致。
* **可扩展架构**：支持两种扫描实现方式（import.meta.glob 编译时 + 动态 API 降级），便于后续集成真实后端服务或 CDN manifest 文件。
* **生产最适方案**：优先使用 import.meta.glob（可靠稳定），无法使用时自动降级，确保开发和生产环境的一致性。

### V2.8.2 (2026-04-06)
#### 🔁 矢量图层坐标切换（GCJ-02 <=> WGS-84） + 数据轻量导出 + 坐标显示格式优化
* **坐标切换范围扩展**：凡纳入 TOC 的矢量点/线/面图层均可右键切换 `WGS-84/GCJ-02` 并重绘。
* **几何级遍历转换**：对矢量几何执行统一转换流程，覆盖 Point/LineString/Polygon 及其多部件形式，自动同步图层元数据与 TOC 展示坐标。
* **性能约束保持**：未引入新的重型依赖，导出与转换均使用浏览器原生能力与现有 OpenLayers/工具函数实现，维持首屏加载策略不变。
* **导出 ID 重排策略**：导出时对要素重新顺序编号 `1..n`，同一要素的所有折点共享同一 ID（便于回溯源要素）。
* **点线面统一折点导出**：Point/LineString/Polygon 及多部件几何统一展开为十进制经纬度折点记录，GeoJSON保留点线面格式，默认四列（ID、经度、纬度、名称），并追加几何类型/部件/环/点序号辅助列。
* **CSV 防乱码**：`CSV` 导出内容默认写入 UTF-8 BOM 头，减少 Excel 打开中文乱码问题。
* **大文件提示**：导出后显示文件体积，超大体积给出卡顿风险提示，便于用户先筛选图层再导出。
* **坐标显示优化**：地图右下坐标显示支持经纬度格式切换（十进制/度分秒），用户可自定义坐标显示格式，并在输入框中智能识别用户输入格式进行解析。

### V2.8.1 (2026-04-04)
#### 🧭 SHP 导入链路强化（参考 mapshaper 设计思路）
* **同名 sidecar 组装修复**：修复多文件导入时 `.dbf/.shx/.prj/.cpg` 被误过滤的问题，统一按 stem 分组后再进入解析流程。
* **解析容错增强**：`shpParser.ts` 新增 SHP 头部校验与分级回退策略（`shp+dbf+shx -> shp+dbf -> shp+shx -> shp-only`），降低异常数据导致的全量失败概率。
* **属性编码兼容提示**：接入 `.cpg` 与 DBF `LDID` 编码提示逻辑，在属性解析失败时给出可理解告警并保留几何导入。
* **导入路径统一**：移除导入层的直连 `shpjs` 分支，统一走 `dataDispatcher + shpParser`，避免 ZIP/文件夹/单文件行为不一致。
* **文档同步**：更新 README 文件树与 GISDataInlet 说明，补充 `Magic/*` 子模块与最新导入策略说明。

### V2.8.0 (2026-04-03)
#### 🌳 图层 TOC 升级为递归树结构 + ArcGIS 风格上下文菜单
* **递归树组件**：
    * 新增 **TOCTreeItem.vue** 递归树节点组件（294 行），支持无限深度嵌套、文件夹展开/折叠。
    * 文件夹复选框支持三态（全选/部分选/未选），点击自动级联控制所有子层级可见性。
    * 完整的生命周期管理（onMounted/onBeforeUnmount）负责全局指针、滚动事件监听与菜单关闭。
* **树构建容器**：
    * 新增 **LayerPanel.vue** 树转换逻辑（280 行），自动将扁平的四层图层组（绘制/上传/搜索/未命名）转换为层级结构。
    * 在线文件夹自动应用特殊标记（如 `[draw_virtual]` 当数据存在但列表为空时自动占位）。
    * 拖拽排序、标注可见性、图层删除等操作优化为树节点事件驱动模式。
* **ArcGIS 风格上下文菜单**：
    * 右键单击或悬停"•••"按钮弹出固定位置菜单，包含 8 项操作（查看/仅显示/属性/样式/标注/复制/缩放/删除）。
    * 菜单自动贴边（normalizeMenuPosition），点击外部、滚动、窗口 resize 时自动关闭。
    * 使用 Teleport 避免层叠上下文干扰，完整键盘与鼠标事件处理。
* **事件契约保持**：
    * 新增 **handleLayerTreeAction** 派发器（TOCPanel 43 行），将树内部事件（toggle-folder-visibility、zoom-layer 等）精确映射到原有 9 种 emit 类型。
    * 上传面板保持不变，确保下游组件（HomeView、MapContainer）无感知迁移。
* **性能优化**：
    * 移除 81 行冗余的扁平卡片模板，替换为 13 行树组件调用，代码减少 68 行。
    * 移除 4 个重复的格式化辅助函数（formatLayerDisplayName、formatFileSize 等），集中在 LayerPanel。
    * Pinia 图层状态、事件链路完整保持，无需调整下游存储或控制器。

### V2.7.2 (2026-04-01)
#### 🎬 Cesium 高级视觉组件化（按需加载）
* 新增 **CesiumAdvancedEffects.vue**：封装电影级高度雾（GLSL PostProcessStage）、HBAO 微阴影、低仰角移轴摄影（Tilt-Shift）、动态天空大气与 Bloom 增强。
* 新增 **ECharts 动态交互图表**：实时展示 3D 相机高度、俯仰角与帧率趋势，支持图例交互与响应式缩放。
* `CesiumContainer.vue` 保持最小改动：仅增加异步子组件挂载入口，原有飞行、地形、坐标与模型加载能力保持不变。
* 资源加载策略优化：在 `CesiumContainer` 未启用前，不请求高级特效与图表资源；仅当进入 3D 视角并完成 Viewer 初始化后才按需加载。

### V2.7.1 (2026-04-01)
#### 🧩 Great Decoupling（深度解耦）
* **MapContainer 最小化**：将图片彩蛋、搜索 API 集成、图层面板交互进一步外移，父组件回归“地图初始化 + 编排桥接”职责。
* **底图配置集中管理**：
    * 新增 **useBasemapManager.ts** 为底图管理单一源，集中 27 种在线底图配置、URL_LAYER_OPTIONS、BASEMAP_OPTIONS、Google 主机选择逻辑。
    * 消除 MapContainer 与 LayerControlPanel 间底图配置同步问题，简化新增底图的扩展流程（仅需在 useBasemapManager 中修改）。
    * MapContainer 导入 URL_LAYER_OPTIONS、createLayerConfigs 等方法而无需本地定义，减少代码 ~38 行。
    * LayerControlPanel 导入 BASEMAP_OPTIONS 而无需本地定义，减少代码 ~45 行，总计删除 ~83 行重复配置。
    * 新增 JSDoc 清晰标记扩展步骤：新增底图时需同步更新 BASEMAP_OPTIONS、URL_LAYER_OPTIONS、createLayerConfigs。
* **MapEasterEgg 升级为自驱组件**：
    * 内聚区域命中、像素定位、缩略图显示、Lightbox 大图预览。
    * 全屏遮罩层使用 `Teleport to="body"`，避免地图容器层叠上下文干扰。
* **LayerControlPanel 深迁移**：
    * 面板内部接管多服务地名搜索 API（天地图/高德/Nominatim）与 `mapBound` 拼装。
    * 搜索结果在面板内完成坐标解析后再向父组件发出标准化定位事件。
    * 图层管理面板改为 `Teleport to="body"`，并基于按钮锚点固定定位，提升复杂布局下的稳定性。
* **MapControlsBar 主题统一**：品牌绿主色统一为 `#309441`，并保持坐标编辑、复制、双击 Home 交互一致。
* **文档同步**：README 更新文件树注释与 `mapInstance` 组件通信说明，便于后续扩展和团队协作。

### V2.7.0 (2026-04-01)
#### 🎨 MapContainer 组件架构重构 (Component Decoupling)
* **顶部面板分离**：
    * 新增 **LayerControlPanel.vue** 独立组件，封装所有图层控制逻辑（底图切换、TOC 管理、拖拽排序、地名搜索）。
    * 支持 27 种预设底图供应商，覆盖本地瓦片、天地图、ESRI、OSM、高德等全球服务。
    * 自动代理 LocationSearch 搜索结果，通过 `search-jump` 事件回传至父组件。
    * 应用 Glassmorphism（磨砂玻璃）绿色主题（rgba(45,138,78,0.8)）。
* **底部控制条分离**：
    * 新增 **MapControlsBar.vue** 独立组件，替代老旧 MapControls.vue，专注于坐标/缩放/主页交互。
    * 实时显示鼠标坐标与地图缩放级别，支持坐标复制、编辑与跳转功能。
    * 主页按钮支持单击重置视图、双击快速定位用户（280ms 时间窗口）。
    * 包含完整生命周期管理（onUnmounted 清理所有计时器，避免内存泄漏）。
    * 应用绿色主题 Glassmorphism 样式。
* **状态管理升级**：
    * 增强 **useMapState.js** 为完整状态引擎，集成 URL 同步、图层切换、地形线渲染与视图动画。
    * **防抖 URL 同步**：pan/zoom 事件每 500ms 批处理一次，显著降低 hash 更新频率。
    * **统一图层切换 API**：`switchLayerById(layerId, config)` 集成标注逻辑（卫星图显示标注、矢量图隐藏）。
    * **地形线渲染引擎**：`setGraticuleActive()` 和 `toggleGraticule()` 统一管理经纬网生命周期。
    * **延迟图层初始化**：`refreshLayerInstances()` 仅在需要时创建 VectorSource，优化首屏加载。
* **事件驱动集成**：
    * MapContainer 新增适配器函数：`handleLayerChange()` 处理图层切换、`handleLayerOrderUpdate()` 处理顺序变化、`handleToggleGraticule()` 同步地形线状态。
    * 完全移除 MapContainer 中冗余的拖拽、可见性、格线渲染逻辑（减少 ~400 行代码）。
    * 所有子组件通过 emits 与父组件通信，保证数据流向清晰可控。
* **性能优化**：
    * 移除重复的 lng/lat 格式化函数与样式定义（集中在 useMapState 与对应组件）。
    * 图层源创建延迟至使用时，减少初始化内存占用。
    * Glassmorphism 样式集中管理，减少跨组件样式修改成本。

### V2.6.1 (2026-03-26)
#### 🔗 视角初始化优先级优化
* **URL 参数优先**：当 `lng`、`lat` 参数有效时，地图会优先使用 URL 指定的中心点和缩放级别初始化。
* **自动定位兜底**：只有在 URL 参数缺失或非法时，才会触发浏览器定位与自动缩放逻辑。
* **分享即恢复**：地图视角可通过查询参数直接复现，便于快速分享当前浏览位置。
* **历史记录更干净**：地图移动后的 URL 更新继续使用 `replace`，避免拖拽和缩放污染浏览器后退历史。
* **文件组织优化**：对项目文件结构进行优化，提升代码可维护性和开发效率。

### V2.6.0 (2026-03-25)
#### 🛠️ 交互与 UI 革命 (UX/UI Refactor)
* **非阻塞通知系统**：全面抛弃原生 `alert()`，上线自研 **Glassmorphism（磨砂玻璃）响应式 Message 系统**。支持消息队列，平滑处理批量导入时的多状态反馈。
* **侧边栏逻辑重构**：默认激活面板由“资讯”改为“工具箱（Toolbox）”，实现“开箱即用”的图层操作与数据管理体验。
* **卡片智能显示**：绘制、路线、搜索结果图层采用“数据驱动显示”策略（v-if 逻辑优化），无数据时不占位，确保界面视觉聚焦。
* **会话状态保活**：路径规划（公交/驾车）面板支持状态保持，关闭或切换后再次打开，历史规划结果与步骤依然留存。

#### 📦 核心引擎升级 (Data Engine)
* **万能容器层 (Data Inlet)**：
    * **深度解压**：基于 `JSZip` 实现 ZIP/KMZ 容器的递归扫描，支持多层级嵌套文件夹识别。
    * **自动化批处理**：突破单一文件限制，支持一次性识别并队列化导入包内所有的 `.shp`, `.kml`, `.tif`, `.json` 资源。
* **坐标系中心 (CRS Engine)**：
    * **空间感知**：自动解析 `.prj` 投影文件或 KML 内部元数据定义。
    * **动态重投影**：集成 `proj4` 算法，实现非标坐标系（如北京54/西安80/CGCS2000）向 `EPSG:4326/3857` 的自动转换。
* **内存优化管理**：建立 **Blob 资源生命周期管控机制**，自动执行 `revokeObjectURL`，完美适配 **1.4GB+** 级大规模空间数据导入场景。

### V2.5.2 (2026-03-22)
- **🧩 地图主文件可维护性整合（MapContainer）**：
    - 将公交/驾车的步骤交互核心抽为统一函数：步骤状态复位、步骤要素检索、步骤缩放、步骤预览。
    - 保持现有功能不变的前提下，减少重复逻辑，降低后续拆分风险。
    - 为关键交互函数补充功能注释，便于团队协作与后续重构。
- **🧭 公交+驾车步骤交互统一**：
    - 两类规划均支持步骤悬停预览高亮 + 点击定位缩放。
    - 驾车分段颜色区分与步骤列表颜色保持一致，提升步骤-线路映射可读性。
- **📘 结构文档更新**：
    - README 目录结构补充并细化到关键文件职责。
    - 新增路线解析与构建工具文件说明（transitRouteBuilder、driveXmlParser）。

### V2.5.1 (2026-03-22)
- **🚀 性能优化（首屏与交互）**：
    - 将 `shpjs`、`jszip`、`geotiff` 改为按需动态加载，仅在导入对应数据类型时下载与解析，显著减少首屏主包体积与解析开销。
    - 地图初始化改为优先渲染地图，再异步执行 IP 区域判断，避免首屏等待网络请求。
    - `min-enhanced.js` 调整为生产环境空闲时延迟注入（`requestIdleCallback` / `setTimeout` 兜底），减少关键渲染路径阻塞。
- **🔎 搜索交互优化**：
    - 地名搜索改为“单一搜索按钮 + 悬浮服务菜单”，用户点击搜索后可自由选择天地图或国际（Nominatim）。
    - 增加点击空白区域自动关闭服务菜单，交互更贴近原生下拉体验。
- **🔎 实时测度加载瓦片**：
    - 增加判断函数，对比两个主机的加载速度，自动选择最快速的瓦片服务

### V2.5.0 (2026-03-17)
- **🧰 工具箱与 TOC 重构**：
    - 工具箱迁移至侧边栏，与新闻/聊天面板风格统一。
    - 图层面板按业务拆分为绘制图层、上传图层与搜索结果图层。
    - 每次绘制结束自动生成独立图层并加入 TOC，便于单独控制。
- **🎨 样式系统增强**：
    - 新增样式模板（经典绿、警示橙、水系蓝、品红）。
    - 支持填充色、边框色、填充透明度、边框宽度编辑。
    - 样式编辑可应用到绘制图层、上传图层和搜索结果图层。
- **🖱️ 交互优化**：
    - 图层项支持左键查看、右键仅显。
    - 地图支持右键快速属性查询。
    - 上传图层与搜索结果图层自动附带名称标注。
- **📦 数据导入能力扩展**：
    - 新增 SHP/ZIP 导入支持（基于 `shpjs` 解析）。
    - 新增 KMZ 导入支持（自动解压并解析其中 KML）。
    - 上传入口支持点击/拖拽一体化上传，并复用统一文件大小与类型校验（支持多选）。
    - 优化 KML 导入后样式覆盖逻辑，避免样式编辑不生效。
    - 新增 TIFF/GeoTIFF 导入，支持无坐标参考回退显示。
- **🧭 栅格能力增强**：
    - 单波段支持分位数拉伸与 NoData 透明处理。
    - 地图单击可查询当前点击位置的栅格波段值（多波段逐波段返回）。
- **🧱 经纬分割辅助线优化**：
    - 九宫格分割模式保留边缘经纬标注（N/S/E/W 方向语义）。
    - 视图中心标记改为“+”号符号，减少中心区域视觉干扰。

### V2.4.1 (2026-02-01)
- **🔒 安全性优化**：
    - 移除代码中硬编码的 API Key，改为环境变量配置。
    - 天地图 Token 和 AI API Key 现在通过 `.env` 文件配置。
    - 新增 `.env.example` 环境变量配置模板。
- **📝 代码质量优化**：
    - 为所有主要组件添加 JSDoc 文档注释。
    - 统一代码区域标记格式，提升可读性。
    - 移除未使用的常量和冗余注释。
- **🤖 AI 助手优化**：
    - 未配置 API Key 时显示友好提示，引导用户前往设置。
    - 优化欢迎消息初始化逻辑。
- **📖 文档更新**：
    - README 新增环境变量配置表格说明。
    - 更新目录结构，添加 `.env.example` 文件说明。
    - 完善开发建议，强调环境变量安全实践。

### V2.4.0 (2026-01-14)
- **🤖 AI 智能助手**：
    - **集成 DeepSeek V2.5**：通过 SiliconFlow API 接入先进的 GIS 领域大语言模型，提供实时、准确的专业问答服务。
    - **流式响应**：实现在线打字机效果，大幅提升对话流畅度与用户体验。
    - **无缝集成**：AI 面板内置于 `SidePanel`，通过顶部导航栏一键唤起，不遮挡地图主界面，支持与新闻面板快速切换。
    - **个性化设置**：支持自定义 API Endpoint、Key 和模型名称，且能在本地自动持久化保存。
    - **历史管理**：支持一键清除聊天记录。
- **UI/UX 优化**：
    - **侧边栏重构**：升级 `SidePanel` 组件，使其支持多 Tab 模式（信息/聊天），在保持原有新闻展示功能的同时扩展了 AI 交互能力，避免了弹窗遮挡问题。
    - **TopBar 升级**：新增 AI 助手入口按钮，优化了按钮布局。

### V2.3.2 (2026-01-12)
- **性能优化**：
    - **SidePanel 延迟加载**：侧边栏改为异步组件 + v-if 策略，初始化时不加载，首次展开时才加载组件及图片资源，显著提升首屏加载速度。
    - **优化占位符**：侧边栏折叠时显示现代化的占位符按钮，支持 SVG 图标、渐变背景、光晕动画和多设备自适应。
- **地图增强**：
    - **缩放级别显示**：底部控制栏新增实时缩放级别数字显示，方便了解当前地图层级。
    - **完整缩放范围**：移除最小缩放限制，支持从 0 级（全球视图）到 22 级（街道级）的完整缩放范围。
    - **初始图层优化**：默认同时加载 Google 影像和天地图注记，提供更好的地理信息展示。
- **Bug 修复**：
    - 修复天地图注记层初始化时虽勾选但不显示的问题。
    - 修复初始状态图层可见性未正确应用的问题。

### V2.3.1 (2026-01-11)
- **鹰眼视图**：
    - 新增 OverviewMap 控件，位于地图左上角，实时显示当前视图范围。
    - 支持展开/折叠，提供全局视野导航。
    - 桌面端尺寸 200x200px，移动端自适应为 120x120px。
    - 当前视图范围用蓝色半透明框高亮显示。

### V2.3.0 (2026-01-07)
- **图层管理增强**：
    - **全新图层管理器**：新增独立的图层管理面板，支持拖拽排序（Drag & Drop）和更细粒度的图层显隐控制。
    - **多图层叠加**：重构底层逻辑，从单一底图切换改为多图层叠加模式，支持通过拖拽调整 Z-Index 遮盖顺序。
    - **自定义底图**：新增自定义 URL 功能，用户可直接输入 XYZ 格式（如 `https://.../{z}/{x}/{y}.png`）加载外部瓦片服务。
- **图源库扩充**：
    - 新增 **Esri** 系列（海洋、地形、物理、山影、灰度）。
    - 新增 **Google Earth**（最新影像）、**Yandex** 卫星地图。
    - 新增 **GeoQ**（灰色底图、水系图）及 **腾讯地图**。
    - 修复天地图矢量注记（cva）与影像注记（cia）的混合冲突问题，现在各类底图会自动匹配正确的注记层。
- **UI/UX 改进**：
    - 优化图层切换器布局，增加面板关闭按钮与交互动画。
    - 修复部分 UI 在特定分辨率下的遮挡问题。

### V2.2.3 (2025-12-29)
- **延迟统计脚本集成（min-enhanced.js）：**
    - 将第三方统计/展示脚本集中到 `public/min-enhanced.js`，在 `index.html` 以延迟方式引入。
    - 脚本在 `window.load` 后延时执行（默认 3s），再按顺序加载 Supabase、MapMyVisitors、Google Analytics、51.la（国内/国际）等 SDK，并对目标 DOM 元素存在性做检查。

### V2.2.2 (2025-12-29)
- **重大 UI 更新：**
    - 适配移动端，代码组织重新优化。
    - 增加获取用户定位/IP的功能，显示用户的位置。
    - 初始视图改为优先尝试获取并居中到用户定位（若用户允许，缩放到 18）。
    - 底部"主页"按钮交互重构为统一处理：单击复位视图，双击（快速两次点击）请求定位并缩放到用户位置（内部使用 300ms 防抖）。
    - 优化 `zoomToUser` 行为：优先使用最后已知位置，若无则执行一次定位并居中。
    - 大图预览改为 Lightbox（全屏遮罩）模式，点击遮罩或关闭按钮收起，改善移动端体验。
    - 鼠标位置显示控件样式调整为 flex 居中，更好地垂直对齐显示内容。

### V2.2.1 (2025-12-12)
- **性能优化**：
    - 将 Font Awesome 的 CDN 源从 `bootcdn` 切换至 `cdnjs.loli.net`，提升国内访问速度与稳定性。

### V2.2.0 (2025-12-12)
- **侧边栏优化**：
    - 新增侧边栏折叠/展开功能，支持点击按钮快速切换。
    - 优化侧边栏在移动端的显示效果，折叠时自动吸底。
    - 调整折叠按钮样式，支持垂直/水平居中显示。
- **地图交互增强**：
    - 优化复位按钮交互：单击复位视图，双击跳转至中国全图。
    - 新增 `MagicCursor` 鼠标特效组件。
- **文档更新**：更新项目目录结构说明。

### V2.1.0 (2025-11-30)
- **3D 地图集成**：引入 CesiumJS 实现三维地球展示，支持二三维视图切换。
- **智能地形切换**：实现基于视点位置的动态地形加载策略——中国境内加载天地图地形，境外自动切换为 Cesium World Terrain。
- **UI 统一**：统一了 2D/3D 视图下的坐标显示面板样式与交互体验。
- **体验优化**：
    - 修复了本地瓦片加载路径问题。
    - 优化了鼠标位置追踪与坐标实时显示功能。

### V2.0.0 (2025-11-28)
- **架构重构**：迁移至 Vue 3 + Vite + Vue Router 的 SPA 架构。
- **功能新增**：
    - 新增登录/注册页面。
    - 新增地图复位按钮。
    - 优化经纬度显示控件 UI。
- **移动端适配**：实现响应式布局，支持手机端访问（上下布局）。
- **代码优化**：
    - 移除 jQuery 风格的 DOM 操作，全面拥抱 Vue 响应式数据流。
    - 组件拆分（MapContainer, SidePanel, TopBar），降低耦合度。
    - 修复 OpenLayers 地图初始化与定位问题。

### V1.0.0 (2024-06-13)
- **初始发布**：作为课程作业提交。
- **基础功能**：
    - OpenLayers 地图展示与底图切换。
    - 简单的图文联动功能。
    - 基础的 HTML/CSS/JS 结构。

## 开发建议

- 建议使用 VS Code + Volar 插件，配合 ESLint 保持代码风格一致。
- 大比例尺时请求的瓦片较多，可按需控制缩放阈值或裁剪瓦片范围。
- **环境变量配置**：复制 `.env.example` 为 `.env`，配置你的 API Key，不要将 `.env` 提交到版本控制。
- **新增 API Key**：在 `.env` 文件中配置 `VITE_` 前缀变量，使用 `import.meta.env.VITE_XXX` 读取。
- **生产部署**：确保配置天地图 Token 和 AI API Key，否则相关功能将不可用。

欢迎继续扩展功能，例如添加更多兴趣点、天气信息或 3D 建筑模型。若遇到问题，欢迎提 Issue 讨论。祝学习 顺利！
```


## 🔐 邮箱账号、验证码与密码重置系统（V3.3.3）

前端认证页面集成邮箱账号注册、邮箱验证码、旧用户绑定邮箱和密码重置功能：

### 注册流程
- 注册时邮箱为账号（输入邮箱 → 发送验证码 → 校验 → 填写昵称和密码 → 提交注册）
- 验证码 60 秒倒计时，显示已验证状态徽章
- 昵称仅作为展示名，可重复、可修改，不再作为登录账号

### 旧用户绑定流程
- 无邮箱旧用户可用旧用户名和密码登录一次
- 进入绑定邮箱面板后完成邮箱验证码和当前密码校验
- 绑定成功后保存新 session，后续使用邮箱登录

### 密码重置流程
- 登录页新增"忘记密码？"入口
- 两步重置：输入邮箱发送验证码 → 输入验证码+新密码

### 相关前端文件

| 文件 | 说明 |
|------|------|
| `api/backend/auth.js` | `apiAuthSendCode`、`apiAuthVerifyCode`、`apiAuthResetPassword`、`apiAuthBindEmail`、`apiAuthChangeDisplayName` |
| `api/backend/client.js` | 识别 `EMAIL_BINDING_REQUIRED` |
| `composables/auth/useAuthIdentity.js` | 邮箱/昵称/密码校验与显示名解析 |
| `views/RegisterView.vue` | 邮箱账号注册、旧用户名绑定邮箱、忘记密码与重置弹窗 |

### 相关后端接口

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/auth/send-code` | 发送邮箱验证码 |
| POST | `/api/auth/verify-code` | 校验邮箱验证码 |
| POST | `/api/auth/reset-password` | 通过邮箱验证码重置密码 |
| POST | `/api/auth/register` | 邮箱验证码注册账号 |
| POST | `/api/auth/bind-email` | 旧用户绑定邮箱 |
| POST | `/api/auth/change-display-name` | 修改昵称 |

---

## 🤖 后端 Agent Chat 系统（V3.0.2）

后端提供了完整的 LLM Agent 对话服务，前端可通过 `/api/agent/chat/*` 接口调用：

- **权限管理**：区分 Guest（每日 10 次）、Registered（每日 100 次）、Admin（无限次）
- **配置管理**：Admin 可通过前端面板配置 LLM Provider（如 DeepSeek-V3）
- **个性化配置**：用户可保存个人参数配置（温度、系统提示等）
- **配额消费**：实时跟踪用户配额使用情况

更多详情见 [后端详细文档 - Agent Chat](../backend/README.md#%EF%B8%8F-v302-agent-chat-配置同步修复)
