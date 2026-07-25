# 体积云地面阴影底层修复计划

## Context

用户反馈：体积云本身正常，但地面云影"只有部分地方显示、相机一移动就消失或错误遮蔽，三种质量档一致"。此前日志 `2026-07-24-fix-cloud-ground-shadow.md` 的分析只解决了"开关层"（smooth 档 `useShadowBuffer`/`aerialStageEnabled` 门控导致 BSM pass 不存在），未触及底层实现缺陷。经代码核实，确认以下真 bug，按症状对应关系排列：

| # | Bug | 对应症状 | 位置 |
|---|-----|---------|------|
| P0-1 | smooth 档 resolve pass 首帧渲染一次后永久冻结，`_syncBSM` 却始终优先取 resolve 的 `_historyTex` → 阴影贴图永远是初始相机那一帧 | 只有初始区域有阴影 | ThreeGeospatialPipeline.js:1380/1664；ShadowResolvePass.js:237 |
| P0-2 | 采样 UV 越界被 `clamp(uv,0,1)` 钳到 cascade 边缘 texel → 覆盖范围外大片错误变暗；PCF tap 偏移未按 tile 钳制 → 跨 cascade 串采 | 移动后错误遮蔽 | aerialPerspectiveEffect.frag:154-167；AtmospherePostProcess.js 内嵌版同名函数；ThreeGeospatialPipeline.js 主云 shader ~L456-490 |
| P0-3 | `bsmUpdateInterval>1` 时 cascade 矩阵冻结 N 帧，但 shader 选级用当前帧 `czm_view` + 当前 `frustum.near` → 移动期选级与矩阵错配 | 移动时阴影消失，停下恢复 | CloudShadowPass.js:669/677；aerialPerspectiveEffect.frag:228-235 |
| P1-4 | balanced 档 `aerialStageEnabled:false` → 无地面阴影路径；且 `DEFAULT_CLOUD_QUALITY='balanced'` 与注释"默认流畅档"矛盾 | 默认档完全无阴影 | cloudQualityPresets.js:145/215 |
| P1-5 | 主云 stage 读 BSM 图集未除 blit 编码 scale（clamp01 路径 scale=200）→ 云内 BSM 读数错 200 倍 | 丁达尔/云自阴影异常 | ThreeGeospatialPipeline.js readShadowOpticalDepth ~L458-464、_syncBSM L1387 |
| P2-6 | BSM 生成端 frontDepth 基于 Bruneton 修正球（`+u_altitudeCorrection`），aerial 采样端 `distToShadowTop` 基于 ECEF 原点球 → 数百米系统误差 | 阴影浓度/边缘偏差 | CloudShadowFrag.glsl.js:406；aerialPerspectiveEffect.frag:208-214 |

目标：修复 P0/P1（根治"部分显示 + 移动遮蔽"），P2-6 实现时验证影响再决定是否同版修复。

## 修改方案

### 1. P0-1：resolve 冻结（ThreeGeospatialPipeline.js）

`_syncBSM` L1380 改为按运行时参数决定是否使用 resolve 输出：

```js
let tex = (this.params.shadowResolveEnabled !== false && this._bsm.resolve)
  ? this._bsmResolveGetTexture() : null;
if (!tex) tex = sp.getTexture();
```

`_bsmResolveGetTexture` 已有 fallback 到 `pass._colorTexture`，无需改。init 处（L1661-1667）resolve 仍照常创建，保证切档到 balanced/ultra 时 resolve 可用；但把 `updateInterval` 的 `MAX_SAFE_INTEGER` hack 移除，改为 resolve pass 增加 `enabled` 运行时开关（构造时 `enabled: shadowResolveEnabled !== false`），并在 `applyCloudPanelParams`（或 `_syncBSM`）同步 `this._bsm.resolve.enabled = this.params.shadowResolveEnabled !== false`，实现热切换。

### 2. P0-2：UV 越界错误遮蔽（三处 shader 同步修）

修改点（同一逻辑复制到三处）：
- `aerialPerspectiveEffect.frag` `sampleShadowOpticalDepthPCF`（L154-167）
- `AtmospherePostProcess.js` 内嵌 GLSL 的同名/等价函数（丁达尔路径）
- `ThreeGeospatialPipeline.js` 主云 fragment shader 的 PCF 采样（~L478-490）

逻辑：
1. 中心 UV 越界（含小保护带 `border = texelSize`）→ 返回 0 光学厚度（无阴影），**删除 `clamp(uv,0,1)`**；在边界带内做线性 fade 避免硬切（`edgeFade = smoothstep` 沿两轴取 min）。
2. PCF tap：`uvTap = clamp(uv + offset, halfTexel, 1.0 - halfTexel)` 后再映射进图集，保证不跨 tile。

### 3. P0-3：选级与冻结矩阵错配

- `CloudShadowPass.updateShadowCascades()` 渲染时 snapshot 当时的 view matrix（`cam.viewMatrix` 拷贝到 `this._shadowViewMatrix`，Float32Array 复用）与已有的 `_shadowNear/_shadowFar` 一起对外暴露（`getShadowViewMatrix()`）。
- `_syncBSM` 把它加入 `bsmShadowOpts`（新字段 `viewMatrix`），`AerialPerspectiveEffect`/`AtmospherePostProcess` 的 `setCloudShadow` 接收并下发新 uniform `u_cloudShadowViewMatrix`。
- 三处 shader 的 `getFadedCascadeIndex` 调用改传 `u_cloudShadowViewMatrix` 替代 `czm_view`，使"选级坐标系"与"冻结的 cascade 矩阵"始终一致；配合修复 2 的越界兜底，节流期内不再出现选级错配。
- 主云 shader 中 `u_cameraNear`（当前帧 frustum.near）同样改用 snapshot near。

### 4. P1-4：balanced 档与默认档（cloudQualityPresets.js）

- `balanced.aerialStageEnabled: false → true`（地面云影唯一渲染路径；balanced 本就带 BSM+resolve，增量成本仅一个 Aerial 全屏 pass）。
- `DEFAULT_CLOUD_QUALITY` 注释与取值统一（保持 `'balanced'`，改注释；balanced 修后有阴影，无需改默认值）。

### 5. P1-5：主云 shader 除 scale

- `_buildCloudUniforms` 新增 `u_shadowBufferScale`（取 `_syncBSM` 的 `scaleToPass`，存 `this._bsmSharedScale`）；主云 shader `readShadowOpticalDepth` 内 `texture(...) / u_shadowBufferScale`，对齐 aerial 侧 L147-149 的做法。

### 6. P2-6：球心不一致（实现时验证）

实现修复 1-5 后实测：若阴影位置/浓度仍有系统偏移，在 aerial/atmosphere 采样端计算 `distToShadowTop` 时改用与 BSM 生成端一致的修正球（`samplePos + altitudeCorrection` 换算），uniform `u_altitudeCorrection` 已存在于 frag。若目视无明显问题则记入"已知遗留"，不扩大本次范围。

## 修改文件

- `frontend/src/components/Cesium/Cloud/lib/ThreeGeospatialPipeline.js`（_syncBSM、主云 shader GLSL、_buildCloudUniforms、init）
- `frontend/src/components/Cesium/Cloud/lib/ShadowResolvePass.js`（enabled 热切换）
- `frontend/src/components/Cesium/Cloud/lib/CloudShadowPass.js`（snapshot view matrix + getter）
- `frontend/src/components/Cesium/Cloud/lib/AtmosphereFromThreeGeospatial/Shaders/aerialPerspectiveEffect.frag`（越界兜底、PCF tile 钳制、u_cloudShadowViewMatrix）
- `frontend/src/components/Cesium/Cloud/lib/AtmosphereFromThreeGeospatial/AtmospherePostProcess.js` 与 `AerialPerspectiveEffect.js`（setCloudShadow 新字段、内嵌 GLSL 同步修）
- `frontend/src/components/Cesium/Cloud/cloudQualityPresets.js`（balanced aerialStageEnabled、注释）

## 文档同步（按仓库规范）

- 新建日志 `Docs/LLM_record/26-07-24/2026-07-24-fix-bsm-underlying-shadow.md`（含本事件逻辑链分析：纠正前一份日志"仅开关问题"的结论）
- 根 `README.md` 版本号三处 → V3.4.3（同日多次更新归于当日记录）；`Docs/Guide/CHANGELOG.md` 增补
- `Docs/Guide/project-structure.md` / `frontend/README.md`：无文件增删，仅确认注记；`backend/README.md` 不涉及

## 验证

1. `frontend/` 运行 `npm run build`（GLSL 为字符串内嵌，重点看无语法错误 + 运行时 shader 编译日志）
2. 浏览器实测（dev server）：
   - smooth 档：开启体积云 → 地面阴影随云移动**持续更新**（不再是冻结快照）
   - 相机平移/旋转/缩放：阴影跟随，无"移动即消失"、无大片错误变暗
   - balanced / ultra：地面阴影存在且行为一致；tile 接缝处无异常亮/暗条带
   - 观察 25-45km 外阴影自然淡出（shadowFar 截断 + 新增 edgeFade），无硬边
3. 关闭再开启体积云、卸载 CesiumContainer → 无报错/泄漏
