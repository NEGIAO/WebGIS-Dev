# 体积云性能优化实施计划（2026-07-24）

## Context

用户反馈 `frontend/src/components/Cesium/Cloud` 体积云模块当前平均帧率约 20 FPS，目标是稳定 60 FPS 以上。经底层链路梳理，当前性能瓶颈不是单点 bug，而是“默认画质路径过重 + BSM 阴影链路每帧全量执行 + 主云 shader 采样过密 + CPU/GC 每帧对象创建过多”的叠加结果。本次目标是把默认/流畅档调整为真实 60FPS 路径，同时保留极致档作为高画质参考，不强求极致档 60FPS。

## 事件逻辑链分析

### 核心症状

- 开启体积云后 Cesium 场景帧率约 20 FPS。
- 当前 `DEFAULT_CLOUD_QUALITY` 是 `balanced`，默认启用 BSM 云影、阴影长度/丁达尔、Aerial stage、LensFlare，且主 raymarch 步数仍较高。
- 多个全屏/离屏 pass 每帧运行，GPU 帧时间被持续拉高；同时 WebGL uniform 查找、VBO 创建删除、Cesium 对象分配造成 CPU 和 GC 抖动。

### 根本原因

1. **主体积云全屏 raymarch 过重**：`ThreeGeospatialPipeline.js` 内联 cloud fragment shader 的 `marchClouds()` 最多 512 次循环，当前 balanced `maxSteps=280`，每个有效采样还可能执行天气纹理、3D shape/detail、太阳方向光学深度、多重散射、BSM PCF 等。
2. **BSM 是第二套体积云渲染器**：`CloudShadowPass.js` 每帧渲染 1024×1024 atlas、4 个 cascade tile，每个 tile 的 shader 同样 raymarch 云体。
3. **ShadowResolve + BSM blit 每帧叠加**：`ShadowResolvePass.js` 每帧 1024 resolve，且当前每帧创建/删除 fullscreen VBO；`ThreeGeospatialPipeline._blitBSM()` 又做一次 1024 blit。
4. **全屏后处理链默认过长**：Atmosphere、Aerial、Cloud、LensFlare 多个全屏 PostProcessStage 叠加。
5. **每帧 CPU/GC 开销偏高**：`_buildCloudUniforms()` 返回大量新 `Cartesian*` / `Matrix4` / 数组；`_advanceOffsets()` 被多个 uniform 回调触发，存在一帧多次推进风险。
6. **Vue 参数桥接为 deep watch**：`setupCloudIntegration.js` 对 `cloudParams` 深度监听，滑杆/对象变化时容易重复全量 apply。

### 受影响模块

- 体积云 Vue 集成：`frontend/src/components/Cesium/Cloud/setupCloudIntegration.js`
- 体积云参数预设：`frontend/src/components/Cesium/Cloud/cloudQualityPresets.js`
- 参数同步：`frontend/src/components/Cesium/Cloud/cloudParamsApply.js`
- 主渲染管线：`frontend/src/components/Cesium/Cloud/lib/ThreeGeospatialPipeline.js`
- BSM 阴影：`frontend/src/components/Cesium/Cloud/lib/CloudShadowPass.js`
- BSM resolve：`frontend/src/components/Cesium/Cloud/lib/ShadowResolvePass.js`
- 面板参数来源：`frontend/src/components/Cesium/composables/toolModules/cloudModule.js`（仅在需要补充 UI 参数时修改）
- 文档和日志：`README.md`、`frontend/README.md`、`backend/README.md`、`Docs/Guide/CHANGELOG.md`、`Docs/Guide/frontend-structure.md`、`Docs/Guide/project-structure.md`、`Docs/LLM_record/26-07/26-07-24/...md`

## 推荐实施方案

### 1. 先把默认路径改成真正的 60FPS 流畅档

修改 [cloudQualityPresets.js](frontend/src/components/Cesium/Cloud/cloudQualityPresets.js)：

- 将 `DEFAULT_CLOUD_QUALITY` 从 `balanced` 改为 `smooth`。
- 重调 `smooth`：
  - `maxSteps` 降到约 `96~120`。
  - `multiScatteringOctaves` 降到 `1~2`。
  - 缩短 `maxRayDistance`、提前 `distFadeStart/distFadeEnd`。
  - 增大 `minStepSize`、`perspectiveStepScale`（需要在 preset 和 apply 映射中补齐）。
  - 保持 `useShadowBuffer=false`、`shadowLengthEnabled=false`、`hazeEnabled=false`、`temporalEnabled=false`、`lensFlareEnabled=false`、`aerialStageEnabled=false`。
- 重调 `balanced`：
  - `maxSteps` 降到约 `140~160`。
  - `multiScatteringOctaves=2`。
  - 默认关闭 `shadowLengthEnabled`；BSM 如保留，必须走低分辨率 + 低频更新。
- 保留 `ultra` 为高画质参考，但明确不作为 60FPS 目标；可适度把 `maxSteps` 从 500 降至 320~360，避免极端卡顿。

修改 [cloudParamsApply.js](frontend/src/components/Cesium/Cloud/cloudParamsApply.js)：

- 在 `scalarKeys` 中补齐性能参数映射：`minStepSize`、`maxStepSize`、`perspectiveStepScale`、`maxStepsToSun`、`maxShadowLengthIterationCount`、`shadowMapSize`、`bsmUpdateInterval`、`shadowResolveEnabled`、`shadowPcfTaps` 等。
- 增加简洁注释，说明这些参数会直接影响 shader 采样量和 BSM 频率。

### 2. LensFlare 改为按需懒创建

修改 [setupCloudIntegration.js](frontend/src/components/Cesium/Cloud/setupCloudIntegration.js)：

- 当前 pipeline 创建后总是动态 import 并初始化 `LensFlareBloomStage`，再根据参数禁用 stage。
- 改为：仅当 `cloudParams.value.lensFlareEnabled === true` 时创建 LensFlare。
- 若用户后续从面板打开 LensFlare，再懒创建并应用参数。
- 关闭 LensFlare 时只禁用 stage；销毁 pipeline 时统一 destroy。

预期收益：默认 smooth 不再额外加入 LensFlare 全屏后处理 stage。

### 3. ShadowResolvePass 消除每帧 VBO 创建/删除和 uniform 查找

修改 [ShadowResolvePass.js](frontend/src/components/Cesium/Cloud/lib/ShadowResolvePass.js)：

- 在 `init()` 中创建一次 fullscreen triangle VBO，保存到 `this._vbo`。
- 在 `createProgram()` 后缓存 uniform/attribute locations：
  - `u_texelSize`、`u_varianceGamma`、`u_temporalAlpha`、`u_inputBuffer`、`u_depthVelocityBuffer`、`u_historyBuffer`、`a_position`。
- 在 `render()` 中复用 VBO 和 location cache，删除每帧 `gl.createBuffer()` / `gl.deleteBuffer()`。
- `destroy()` 中统一释放 `_vbo`。

预期收益：减少 CPU driver 开销和 GC/显存抖动。

### 4. CloudShadowPass 缓存 WebGL location，并支持低频渲染

修改 [CloudShadowPass.js](frontend/src/components/Cesium/Cloud/lib/CloudShadowPass.js)：

- 在 `createProgram()` 后缓存所有常用 uniforms/attributes，替换 render 内部反复 `gl.getUniformLocation()`。
- 增加 `shouldRender(frameState)` / `render({ force, frameIndex })` 类似的早退逻辑：
  - `bsmUpdateInterval <= 1` 时每帧渲染。
  - balanced 默认可设为 3 或 4 帧一次。
  - 当首次渲染、相机运动超过阈值、太阳方向变化、云层/阴影参数变更时强制渲染。
- 保留原有 `init()`/`destroy()` 生命周期，避免破坏 Cesium 清理链。

预期收益：BSM 若启用，离屏云 raymarch 从每帧全量降低到低频更新。

### 5. Pipeline 统一控制 BSM/Resolve/Blit 的启停和尺寸

修改 [ThreeGeospatialPipeline.js](frontend/src/components/Cesium/Cloud/lib/ThreeGeospatialPipeline.js)：

- 将硬编码 `SHADOW_MAP_SIZE=1024`、`BSM_BLIT_SIZE=1024` 改为实例参数：
  - `params.shadowMapSize`（smooth 无 BSM；balanced 512；ultra 1024）
  - `params.bsmBlitSize` 或直接与 shadowMapSize 同步。
- 初始化 `CloudShadowPass` / `ShadowResolvePass` 时传入当前 `shadowMapSize`。
- 添加 `_isBsmActive()`：仅当 `useShadowBuffer && cloudsVisible && cloudStage.enabled && _bsm.pass` 时才执行 BSM sync。
- `_syncBSM()` 在 BSM inactive 时只在状态变化时调用一次 `setCloudShadow({enabled:false})`，不要每帧重复。
- `_blitBSM()` 缓存 `u_src`、`u_scale`、`a_pos`，避免每次 blit 查找。
- 当 ShadowResolve 没有新 BSM 输入帧时，不执行 resolve/blit。

预期收益：smooth 彻底绕过 BSM；balanced 即使启用 BSM，也降低分辨率和更新频率。

### 6. 主 cloud shader 增加质量旋钮，减少采样成本

修改 [ThreeGeospatialPipeline.js](frontend/src/components/Cesium/Cloud/lib/ThreeGeospatialPipeline.js) 的 `getCloudFragmentShader()` 与 uniforms：

- 增加 uniforms：
  - `u_shadowPcfTaps`：smooth 0/1，balanced 4，ultra 8/16。
  - `u_detailEnabled` 或通过 `shapeDetailAmount` 全 0 时在 GLSL 中跳过 detail 3D texture。
  - `u_lowCostLighting`：smooth 可减少 `marchOpticalDepthToSun()` 或使用更低 `maxStepsToSun`。
- `sampleShadowOpticalDepthPCF()` 从固定 16 taps 改为按质量档选择 1/4/8/16 taps。
- 确保 smooth preset 将 `shapeDetailAmount` 全部设为 0，避免无意义 detail 纹理采样。
- 通过 preset 控制：`maxStepsToSun`、`minStepSize`、`perspectiveStepScale`、`edgeAlphaCutoff`，让 60FPS 档优先减少采样总量。

预期收益：主全屏云 pass 是最大 GPU 消耗点，此阶段是稳定 60FPS 的核心。

### 7. 降低每帧 uniform 对象分配和重复计算

修改 [ThreeGeospatialPipeline.js](frontend/src/components/Cesium/Cloud/lib/ThreeGeospatialPipeline.js)：

- 增加 `_frameUniformCache` 和 scratch 对象，统一缓存：
  - altitude correction
  - camera height
  - min/max cloud height
  - layer vec4s
  - interval heights
  - shadow intervals/matrices
  - resolution
  - weather/shape/detail offsets
- 把 `_advanceOffsets()` 改为每帧只运行一次（例如在 postRender 或 `_updateFrameCache()` 中），uniform 回调只返回缓存对象。
- `_getAltitudeCorrectionOffset(bottomRadius, result)` 支持传入 result，减少 `Cartesian3` 分配。
- `_syncBSM()` 中的 `[0,1,2,3].map()`、`new Cartesian2`、`Matrix4.fromArray` 尽量改为复用对象，参数变化时更新版本号。

预期收益：降低 CPU 与 GC 抖动，提升帧时间稳定性。

### 8. Vue 参数桥接做帧级合并和变化感知

修改 [setupCloudIntegration.js](frontend/src/components/Cesium/Cloud/setupCloudIntegration.js) 与 [cloudParamsApply.js](frontend/src/components/Cesium/Cloud/cloudParamsApply.js)：

- 保留当前 deep watch 兼容面板结构，但使用 `requestAnimationFrame` 合并同一帧内多次参数变化。
- `applyCloudPanelParams()` 可返回 `{ changed, shadowDirty, requiresRebuild }`，用于标记 BSM dirty 或未来重建尺寸。
- 仅当实际值变化时写入 `pipeline.params`，避免滑杆/对象更新造成重复同步。

预期收益：减少 UI 调参时的主线程抖动，避免 BSM 静态参数每帧全量重算。

## 文档与日志同步计划

根据全局规范，修改 `frontend/` 后必须同步维护日志和文档：

- 新增维护日志：`Docs/LLM_record/26-07/26-07-24/2026-07-24-cloud-performance-optimization.md`
  - 包含日期时间、事件逻辑链、修改内容、修改原因、影响范围、优化方案、性能指标、测试方案、修改文件绝对路径。
- 更新 [Docs/Guide/CHANGELOG.md](Docs/Guide/CHANGELOG.md)：新增 `V3.3.23 (2026-07-24) — 体积云性能优化`。
- 更新 [README.md](README.md)：更新当前版本、最近三条版本记录、最后更新时间。
- 更新 [frontend/README.md](frontend/README.md)：更新最后更新时间、版本和体积云性能说明。
- 更新 [backend/README.md](backend/README.md)：按用户“三个 README”要求做同步说明（不改后端逻辑，仅文档日期/导航说明如有必要）。
- 更新 [Docs/Guide/frontend-structure.md](Docs/Guide/frontend-structure.md)：若新增/删除文件则同步 Cloud 树；若仅修改现有文件，记录 Cloud 模块职责注释为“性能预设 + BSM 低频更新 + shader 质量旋钮”。
- 更新 [Docs/Guide/project-structure.md](Docs/Guide/project-structure.md)：若新增日志目录或 Docs 结构摘要需要变化则同步；否则只保持现有根/Docs 树不变。

## 验证方案

### 基线和对比

- 在同一浏览器、同一分辨率、同一 Cesium 相机高度/角度下记录：
  - 优化前默认档约 20 FPS（用户已反馈，可在本地再测一次）。
  - 优化后 smooth/default FPS。
  - balanced 和 ultra FPS。
- 复用现有帧率采样工具 [useCesiumFrameRate.js](frontend/src/components/Cesium/composables/interaction/useCesiumFrameRate.js)，必要时结合 Chrome Performance。

### 功能回归

- 开启体积云 → 资源加载完成 → 关闭体积云 → 再开启。
- 切换 `smooth / balanced / ultra`，确认参数和 stage 开关正确。
- LensFlare 默认不创建；打开后能懒加载，关闭后不影响云。
- BSM 关闭时不再执行 shadow/resolve/blit；打开时云影仍能更新。
- 相机移动、缩放、俯仰时云不错误遮挡地形/模型。
- 卸载 CesiumContainer 后无 WebGL 资源和 preRender/postRender listener 泄漏。

### 构建检查

- 在 `frontend/` 运行：`npm run build`。
- 如项目 lint 可用，再运行：`npm run lint`。
- 不执行 `git commit`、`git stash`、`git push`。

## 风险和兜底

- 60FPS 目标依赖硬件、分辨率、DPR 和同时开启的 Cesium 图层；本方案保证默认 smooth 是性能优先路径，ultra 不承诺 60FPS。
- BSM 低频更新可能造成云影响应略慢；相机/太阳/参数变化时强制刷新可降低观感问题。
- shader 采样减少可能带来云体稀疏、噪声或边缘 banding；通过 STBN jitter、alpha cutoff、距离淡出和可选 balanced/ultra 提供画质兜底。
- 如果上述阶段后仍无法稳定 60FPS，再评估更大改造：低分辨率云离屏渲染 + 深度感知 upsample，但该方案侵入性更高，本轮不优先实施。
