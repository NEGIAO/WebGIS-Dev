# 2026-07-25 体积云 BSM 地面阴影高度淡出修复

## 日期和时间

2026-07-25 21:56

## 修改内容

- 修复相机海拔接近或高于体积云时，地面云影仍保持强阴影、甚至视觉上遮挡云层上表面的问题。
- Aerial / Atmosphere 地面云影 shader 新增 `u_cloudShadowAltitudeFadeStart` 与 `u_cloudShadowAltitudeFadeEnd`，按相机高度对地面云影做渐隐。
- `ThreeGeospatialPipeline._syncBSM()` 将体积云自身高度淡出参数同步给地面云影：起点为云顶高度 `_getMaxHeight()`，终点为云顶高度 + `altitudeFadeRange`。
- 同步更新内联 `bundledShaders.js`，避免生产构建使用旧 shader。
- 更新 README / CHANGELOG / 前端文件树说明。

## 修改原因

用户反馈：当相机海拔接近或高于体积云时，地面云影效果明显变差，甚至像遮挡在体积云上面。体积云本体已有基于 `u_altitudeFadeStart` / `u_altitudeFadeEnd` 的高度渐隐，但地面云影没有跟随这套高度权重，导致云体已经淡出时，地面 BSM 阴影仍按完整强度参与 Aerial/Atmosphere 地面太阳透过率计算。

## 事件逻辑链条分析

1. 核心症状：
   - 相机接近云顶或高于云层后，体积云逐渐变淡，但地面云影仍然明显。
   - 俯视云层时，地面云影在视觉上像压到云体上方，破坏空间层次。
2. 根本原因：
   - 主云 shader 有相机高度淡出：`altitudeFade = 1.0 - smoothstep(u_altitudeFadeStart, u_altitudeFadeEnd, u_cameraHeight)`。
   - 地面云影 `getGroundSunTransmittance()` 只考虑太阳高度、太阳光线长度和 BSM OD，没有同一高度淡出因子。
   - BSM 本身仍在渲染完整云层阴影，Aerial/Atmosphere 不知道当前相机视角下云体已淡出。
3. 解决链条：
   - 将云体高度淡出起止高度同步到 Aerial/Atmosphere 的 cloud shadow uniforms。
   - 地面云影采样前根据相机修正后高度计算 `altitudeFade`。
   - 最终 `fade = horizonFade * lowSunFade * rayLenFade * altitudeFade`，确保云体淡出时地面云影也同步消失。

## 影响范围

- 前端 Cesium 体积云地面 BSM 云影。
- AerialPerspectiveEffect 地面太阳遮光。
- AtmospherePostProcess 地面云影/大气链路。
- 内联 shader bundle。
- 后端无影响。

## 优化解决方案

- `aerialPerspectiveEffect.frag`
  - 新增 `u_cloudShadowAltitudeFadeStart` / `u_cloudShadowAltitudeFadeEnd`。
  - 新增 `getCloudShadowCameraAltitudeFade()`。
  - `getGroundSunTransmittance()` 将高度淡出乘入最终地面云影 fade。
- `AtmospherePostProcess.js`
  - 同步 shader 字符串与 uniforms。
  - `setCloudShadow()` 接收 `altitudeFadeStart` / `altitudeFadeEnd`。
- `AerialPerspectiveEffect.js`
  - 同步 uniforms 与 `setCloudShadow()` 参数。
- `ThreeGeospatialPipeline.js`
  - `bsmShadowOpts` 增加 altitude fade 字段。
  - 每帧使用 `_getMaxHeight()` 与 `altitudeFadeRange` 同步地面云影淡出区间。
- `bundledShaders.js`
  - 同步内联 shader，修复生产 bundle 中 shader 缺失 altitudeFade 声明的问题。

## 性能指标

- 只增加少量 uniform 与一次 `smoothstep`，对 GPU 性能影响可忽略。
- 不新增 pass，不改变 BSM 分辨率和采样步数。

## 测试方案

1. 静态验证：
   - 运行 `npm run build`，确认 shader 编译与 Vite 构建通过。
   - 2026-07-25 已执行 `cd frontend && npm run build`：构建通过；仅保留既有 `min-enhanced.js` 非 module 提示与 chunk size 警告。
2. 手动视觉验证：
   - 进入 Cesium 体积云，开启 BSM 云阴影。
   - 逐步抬升相机至接近云顶、穿过云顶、高于云层。
   - 预期：体积云渐隐时，地面云影同步渐隐；高于云层后不再出现地面云影像遮挡云上表面的效果。
   - 在 smooth / balanced / ultra 三档下重复验证。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\ThreeGeospatialPipeline.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\AtmosphereFromThreeGeospatial\Shaders\aerialPerspectiveEffect.frag`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\AtmosphereFromThreeGeospatial\AerialPerspectiveEffect.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\AtmosphereFromThreeGeospatial\AtmospherePostProcess.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\shaders\bundledShaders.js`
- `D:\Dev\GitHub\WebGIS-Dev\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07\26-07-25\2026-07-25-cloud-bsm-shadow-altitude-fade.md`
