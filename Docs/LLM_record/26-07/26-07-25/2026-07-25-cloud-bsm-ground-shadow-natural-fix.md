# 2026-07-25 体积云 BSM 地面阴影自然度底层修复

## 日期和时间

2026-07-25 21:48

## 修改内容

- 在前一次 BSM 生命周期修复基础上，继续修复“地面云影看起来不像自然云影”的底层算法问题。
- 统一 `CloudStage`、`AerialPerspectiveEffect`、`AtmospherePostProcess` 三条 BSM 采样链路的 atlas 解码逻辑。
- 主体云 shader 新增 `u_shadowScale` / `u_shadowDecode`，避免采样被 blit 编码后的共享 `Cesium.Texture` 时把编码值当作真实光学厚度。
- 地面云影读取 BSM 时补用 `shadow.a` tail 光学厚度，修复云影边缘硬截断、块状边界和非自然断裂。
- `CloudShadowFrag.glsl.js` 的 BSM shadow pass 与主云 shader 对齐：当 `shapeDetailAmounts` 全 0 时跳过 detail 噪声分支，避免影子密度模型与可见云模型不一致。
- 移除地面云影距离驱动的“强制贴合 bottom 球”采样稳定项，仅保留显式几何误差修正，避免远处地面阴影被压平成贴球滑动的假阴影。
- 同步更新内联 shader bundle、README、CHANGELOG 和前端文件树说明。

## 修改原因

用户反馈上一轮修复方向虽然正确，但地面云影仍不像自然云影，属于底层 bug。排查后发现问题集中在 BSM atlas 的“物理语义消费不一致”：主云、Aerial、Atmosphere 对同一张 BSM 纹理的解码和光学厚度组合方式不同；地面路径丢弃了 tail 通道；远距采样稳定逻辑过度把地形点拉向 bottom 球，导致阴影不贴真实地面投影而像球面贴图。

## 事件逻辑链条分析

1. 核心症状：
   - 地面云影出现了，但边缘硬、块状、像贴图或球面阴影，不像自然云层投影。
   - 三档模式下 BSM 开启后云体和地面阴影的形态不完全对应。
2. 根本原因：
   - `CloudShadowFrag.glsl.js` 输出的 BSM atlas 语义为 `r=frontDepth, g=meanExtinction, b=maxOpticalDepth, a=maxOpticalDepthTail`。
   - 主云 shader 使用 `shadow.b + shadow.a`，但地面云影路径只用 `shadow.b`，丢掉 tail 后边缘被硬截断。
   - `_syncBSM()` 将 BSM blit 到共享 `Cesium.Texture` 后可能使用缩放编码，但主云 shader 原先没有对应 decode uniform，造成同一 atlas 在不同 pass 中被不同方式解释。
   - BSM shadow pass 的 detail 噪声分支与主云 shader 不一致，`shapeDetailAmounts=0` 时仍可能改变密度，导致影子和可见云不匹配。
   - 地面采样稳定函数按距离自动把采样点拉向 bottom 球，远处会形成不自然的球面化阴影。
3. 解决链条：
   - 统一 atlas 解码：主云、Aerial、Atmosphere 都按 scale/decode 还原真实 BSM 值。
   - 统一光学厚度：地面路径也使用 `shadow.b + shadow.a`。
   - 统一密度模型：shadow pass 的 detail skip 条件对齐主云 shader。
   - 减少几何过度修正：移除距离驱动贴球，只保留显式 correction。

## 影响范围

- 前端 Cesium 体积云 BSM 地面阴影和云体自遮挡。
- Bruneton AerialPerspective 地面太阳透过率计算。
- AtmospherePostProcess 中的地面云影 / 丁达尔辅助采样。
- 内联 shader bundle 与文档说明。
- 后端无影响。

## 优化解决方案

- `ThreeGeospatialPipeline.js`
  - GLSL 新增 `u_shadowScale`、`u_shadowDecode`。
  - `readShadowOpticalDepth()` 对 `u_shadowBuffer` 先按 scale/decode 还原，再计算 OD。
  - `_scratch` 增加 `shadowDecode`，`_syncBSM()` 维护 `_bsmShadowScale`，确保主云 stage 与 Aerial/Atmosphere 共用同一解码约定。
- `CloudShadowFrag.glsl.js`
  - `sampleMedia()` detail 分支加入 `any(greaterThan(u_shapeDetailAmounts, vec4(0.0)))`，与主云 shader 一致。
- `AerialPerspectiveEffect.js` / `aerialPerspectiveEffect.frag`
  - 地面 OD 从 `shadow.b` 改为 `shadow.b + shadow.a`。
  - `stabilizeBsmSamplePosition()` 不再使用 `smoothstep(8000, 50000, viewDist)` 距离贴球修正。
- `AtmospherePostProcess.js`
  - 同步地面 OD 与丁达尔 BSM 采样对 tail 通道的使用。
  - 同步移除距离贴球修正。
- `bundledShaders.js`
  - 同步更新内联 `aerialPerspectiveEffect.frag` 内容，确保生产构建走 bundle 时也生效。

## 性能指标

- 本次修复只增加少量 uniform 和 shader 标量运算，不新增 pass，不改变采样步数。
- 移除距离驱动贴球修正后减少一次 `smoothstep/max` 组合，性能影响可忽略。
- detail 分支 skip 与主云一致，在 `shapeDetailAmounts=0` 时可减少 BSM 侧无意义 detail 密度扰动。

## 测试方案

1. 静态验证：
   - 运行 `npm run build`，确认 shader 拼接和 Vite 构建通过。
2. 手动视觉验证：
   - 进入 Cesium 体积云。
   - 分别在 smooth / balanced / ultra 下开启 BSM 云阴影。
   - 观察地面云影边缘是否从硬块状变为更连续的云团投影。
   - 调整风速 / 演化速度，确认云体与地面阴影形态同步变化。
   - 远距离斜视地面时，确认阴影不再像球面贴图滑动。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\ThreeGeospatialPipeline.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\CloudShadowFrag.glsl.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\AtmosphereFromThreeGeospatial\Shaders\aerialPerspectiveEffect.frag`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\AtmosphereFromThreeGeospatial\AtmospherePostProcess.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\shaders\bundledShaders.js`
- `D:\Dev\GitHub\WebGIS-Dev\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07\26-07-25\2026-07-25-cloud-bsm-ground-shadow-natural-fix.md`
