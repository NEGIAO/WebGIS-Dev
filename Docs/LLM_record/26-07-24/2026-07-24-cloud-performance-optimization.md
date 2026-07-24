# 体积云性能优化（2026-07-24 09:40）

## 修改内容

围绕 `frontend/src/components/Cesium/Cloud` 体积云模块，把默认路径重构为“真实 60FPS 流畅档”，并在链路上削减 GPU/CPU/GC 三处热点。共 8 项：

1. **预设重调 + 默认改流畅档**：`DEFAULT_CLOUD_QUALITY` 由 `balanced` 改为 `smooth`；重调三档 `smooth/balanced/ultra` 的采样量、BSM 分辨率与更新频率、特效开关（详见「优化解决方案」）。
2. **LensFlare 懒创建**：`setupCloudIntegration.js` 仅当 `lensFlareEnabled === true` 才动态 import 并 `new LensFlareBloomStage`，避免默认档常驻一个无用全屏后处理 stage。
3. **ShadowResolvePass 去每帧 VBO/location**：`init()` 一次性建 fullscreen triangle VBO；`createProgram()` 后缓存 `_locations`；`render(force)` 支持 interval gating；`destroy()` 释放 `_vbo` 并置空 `_locations`。（本项在本轮前已暂存，本次仅核对完整性）
4. **CloudShadowPass 缓存 location + 低频渲染**：`createProgram()` 后遍历 `ACTIVE_UNIFORMS` 一次性建 `this._locations` 与 `this._positionLoc`；`render()` 内 set1f/set2f/set3f/set4f/set1i、bindTex、矩阵/atlas offset/attrib 全部改查缓存，删除每帧几十次 `gl.getUniformLocation`；`render(force)` 按 `bsmUpdateInterval` 做帧间隔早退（首帧 `_hasRendered` 强制渲染）；`destroy()` 置空 `_locations/_positionLoc`。
5. **Pipeline 统一 BSM 尺寸/启停/blit 缓存**：BSM 尺寸走 `params.shadowMapSize`；`_blitBSM` 缓存 `blitLoc`（src/scale/pos）与 `_bsmBlitSize` viewport；`_syncBSM` 在 BSM inactive 时仅状态变化调用一次 `setCloudShadow({enabled:false})`；`destroy()` 补 `blitLoc:null` 与 `_bsmSharedTexture=null`。
6. **主 shader 质量旋钮**：`u_shadowPcfTaps` clamp 1..16 + break 循环（预分已暂存）；本次补 `sampleMedia` 的 3D detail 纹理跳过——`any(greaterThan(u_shapeDetailAmounts, vec4(0.0)))` 为假（流畅档三层 detailAmount 全 0）时整体跳过最重的 `texture(u_shapeDetailTexture, ...)`。
7. **每帧 uniform 对象分配削减**：构造器新增 `_scratch` 对象池，`_getAltitudeCorrectionOffset/_getLayerVec4/_getDensityProfileVec4/_getIntervalHeights` 支持传入 result 复用；`_buildCloudUniforms` 每个 vec2/vec3/vec4/矩阵回调改写各自独立 scratch；`_syncBSM` 的 `updateDynamicParams` 参数对象、shadow intervals/matrices、`setCloudShadow` 的 opts 全部预分配复用（`setCloudShadow` 存引用，复用安全）。
8. **Vue watch 帧级合并**：`setupCloudIntegration.js` deep watch 稳态参数应用改为 `requestAnimationFrame` 合并（`scheduleApply` + `pendingApplyParams`），同一帧多次滑杆/对象变化只应用一次；`teardownPipeline`/cleanup 中 `cancelAnimationFrame` 防悬挂回调命中已销毁管线。

## 修改原因

用户反馈开启体积云后场景约 20 FPS。经链路梳理，瓶颈非单点 bug，而是“默认画质路径过重 + BSM 阴影每帧全量 + 主 raymarch 采样过密 + 每帧对象分配过多”叠加。目标：默认/流畅档达到真实 60FPS 路径，极致档仅作高画质参考，不承诺 60FPS。

## 影响范围

- 体积云 Vue 集成：`setupCloudIntegration.js`（LensFlare 懒创建、watch RAF 合并）
- 体积云参数预设：`cloudQualityPresets.js`（默认档、三档重调）
- 参数同步：`cloudParamsApply.js`（性能标量键映射）
- 主渲染管线：`lib/ThreeGeospatialPipeline.js`（scratch 复用、BSM 统一、shader detail 跳过、destroy 补漏）
- BSM 阴影：`lib/CloudShadowPass.js`（location 缓存、低频渲染）
- BSM resolve：`lib/ShadowResolvePass.js`（VBO/location 复用、interval gating）
- 不涉及后端逻辑。

## 优化解决方案

### 事件逻辑链

- **核心症状**：开启体积云 → ~20 FPS；默认 balanced 启用 BSM 云影 + 丁达尔 + Aerial stage + LensFlare，主 raymarch 步数偏高。
- **根本原因**：① 主全屏 raymarch 过重（maxSteps 高 + 每步天气/3D shape/detail/太阳光学深度/多散射/BSM PCF）；② BSM 是第二套体积云渲染器，每帧 1024 atlas × 4 cascade；③ ShadowResolve + blit 每帧叠加且每帧建删 VBO；④ 全屏后处理链默认过长；⑤ `_buildCloudUniforms` 每帧 new 大量 Cartesian/Matrix4；⑥ deep watch 重复全量 apply。
- **解决路径**：先把默认路径改为轻档（①③④减负），再对保留链路做 GPU location 缓存与低频更新（③④），最后削 CPU/GC（⑤⑥）。

### 三档关键参数（优化后）

| 参数 | smooth（默认） | balanced | ultra |
|---|---|---|---|
| maxSteps | 108 | 156 | 340 |
| maxStepsToSun | 2 | 4 | 6 |
| minStepSize / maxStepSize | 110 / 1400 | 80 / 1200 | 45 / 1100 |
| perspectiveStepScale | 1.03 | 1.018 | 1.008 |
| multiScatteringOctaves | 1 | 2 | 6 |
| shadowMapSize | 512 | 512 | 1024 |
| bsmUpdateInterval | 4 | 3 | 1 |
| shadowResolveEnabled | false | true | true |
| shadowPcfTaps | 1 | 4 | 8 |
| useShadowBuffer | false | true | true |
| shadowLengthEnabled | false | false | true |
| aerialStageEnabled | false | false | true |
| lensFlareEnabled | false | false | true |

## 性能指标

- 目标：默认 smooth 档稳定 60FPS（依赖硬件/分辨率/DPR/同开图层，非绝对承诺）。
- 结构性削减（可静态确认）：
  - CloudShadowPass 每帧 `getUniformLocation` 调用从约 45+ 次降为 0（全部走 createProgram 时的一次性缓存）。
  - BSM 离屏 raymarch 从每帧全量 → 流畅档完全绕过、均衡档每 3 帧一次、极致档每帧。
  - 主 shader 流畅档跳过 3D detail 纹理采样（每有效步省一次 `texture3D`）。
  - `_buildCloudUniforms` + `_syncBSM` 每帧 `new Cartesian2/3/4` / `Matrix4` 由数十个降为 0（全部复用 `_scratch`）。
  - deep watch 稳态 apply 由“每次触发”→“每帧至多一次”。
- 实测 FPS 需在浏览器复用 `useCesiumFrameRate.js` 对比，代码层不产出运行时数据。

## 测试方案

- **构建**：`frontend/` 运行 `npm run build`（如 lint 可用再跑 `npm run lint`）。
- **功能回归**：开启体积云 → 加载完成 → 关闭 → 再开启；切换 smooth/balanced/ultra 确认参数与 stage 开关；LensFlare 默认不创建、打开后懒加载、关闭不影响云；BSM 关闭时不执行 shadow/resolve/blit、打开时云影仍更新；相机移动/缩放/俯仰云不错误遮挡地形；卸载 CesiumContainer 后无 WebGL 资源与 preRender/postRender 泄漏。
- **帧率**：同浏览器/分辨率/相机高度下对比优化前后 smooth/balanced/ultra。
- **未执行**：按规范不执行 `git commit` / `git stash` / `git push`。

## 修改的文件绝对路径

- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\cloudQualityPresets.js`
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\cloudParamsApply.js`
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\setupCloudIntegration.js`
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\ThreeGeospatialPipeline.js`
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\CloudShadowPass.js`
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\ShadowResolvePass.js`

## 文档同步

- 维护日志：本文件
- `Docs/Guide/CHANGELOG.md`：新增 `V3.3.23 (2026-07-24)`
- 根 `README.md`、`frontend/README.md`、`backend/README.md`：版本/日期同步
- `Docs/Guide/project-structure.md`、`Docs/Guide/frontend-structure.md`：Cloud 模块职责注记（性能预设 + BSM 低频更新 + shader 质量旋钮 + scratch 复用）
