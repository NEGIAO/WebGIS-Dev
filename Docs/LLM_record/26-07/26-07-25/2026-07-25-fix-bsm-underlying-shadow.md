# 体积云 BSM 地面阴影底层修复日志

## 日期和时间

2026-07-25 10:16

## 修改内容

本次任务按 `2026-07-24-fix-cloud-ground-shadow.md` 的问题链条，修复体积云地面云影底层 BSM（Beer Shadow Map）链路缺陷，目标是解决地面云影“只有部分地方显示、相机一移动就消失或错误遮蔽、质量档切换不能根治”的问题。

计划修改方向：

1. 修复 ShadowResolvePass 伪禁用导致 `_syncBSM` 读取冻结 history 纹理的问题。
2. 修复 BSM 采样 UV / PCF tap 越界串采相邻 cascade tile 的问题。
3. 修复 `bsmUpdateInterval > 1` 时 shader 选级使用当前相机矩阵、而 BSM cascade 矩阵使用冻结旧相机矩阵导致的错配。
4. 修复主云 shader 读取共享 BSM 纹理时未按 blit scale 解码的问题。
5. 按项目规范同步根 README、前端 README、后端 README 与 `Docs/Guide/project-structure.md`。

## 修改原因

用户反馈体积云本身正常，但地面云影出现局部显示和移动后消失/遮蔽错误。上一份日志主要定位了开关层问题，但代码复核显示真正根因在 BSM 底层同步与采样链路：

- smooth 档关闭 resolve 时使用 `Number.MAX_SAFE_INTEGER` 伪禁用，resolve pass 仍可能保留首次 history 纹理；`_syncBSM` 又优先取 resolve 输出，导致阴影贴图停留在初始相机帧。
- BSM 是 2×2 atlas，PCF tap 没有在当前 cascade tile 内钳制，偏移后可能串采相邻 cascade，表现为边缘脏块或移动后错误遮蔽。
- BSM pass 允许多帧节流更新，但 shader 每帧用当前 `czm_view` 选 cascade，和旧 cascade 矩阵不是同一相机状态，导致移动期间选级错误。
- `_blitBSM` 为兼容 clamp01 会按 scale 写共享纹理，Aerial/Atmosphere 已解码，主云 shader 未解码，云内阴影/丁达尔读数不一致。

## 事件逻辑链条分析

### 核心症状

- 地面云影只在初始或局部区域显示。
- 相机平移、旋转、缩放后云影突然消失、错位或大片错误变暗。
- 切换 smooth / balanced / ultra 后症状不能完全消失。

### 根本原因

1. resolve 输出选择错误：禁用 resolve 不等于禁用其 history 纹理，导致 `_syncBSM` 可能拿到冻结帧。
2. atlas 采样边界缺失：中心 UV 与 PCF tap 缺少不同层级的边界处理，tap 可跨 tile。
3. cascade 选级状态错配：冻结 BSM 矩阵与当前帧 view/near 混用。
4. BSM scale 解码不统一：主云与 Aerial/Atmosphere 对共享纹理数值解释不一致。

### 受影响模块

- `frontend/src/components/Cesium/Cloud/lib/ThreeGeospatialPipeline.js`：BSM 同步、主云 shader、uniform 管理。
- `frontend/src/components/Cesium/Cloud/lib/CloudShadowPass.js`：cascade 矩阵、相机 view snapshot、getter。
- `frontend/src/components/Cesium/Cloud/lib/ShadowResolvePass.js`：resolve 启停策略复用。
- `frontend/src/components/Cesium/Cloud/lib/AtmosphereFromThreeGeospatial/AerialPerspectiveEffect.js`：地面云影 uniform 下发。
- `frontend/src/components/Cesium/Cloud/lib/AtmosphereFromThreeGeospatial/AtmospherePostProcess.js`：大气/丁达尔链路 BSM 采样。
- `frontend/src/components/Cesium/Cloud/lib/AtmosphereFromThreeGeospatial/Shaders/aerialPerspectiveEffect.frag`：地面云影 shader。
- `frontend/src/components/Cesium/Cloud/cloudQualityPresets.js`：质量档注释与默认策略核对。

## 优化解决方案

1. 将 ShadowResolvePass 的禁用策略从 `Number.MAX_SAFE_INTEGER` 改为真实 `enabled` 开关，`_syncBSM` 只在 resolve 启用时读取 resolve 纹理，否则读取当前 BSM pass 纹理。
2. 在主云、Aerial、Atmosphere 三处 BSM 采样中统一处理：中心 UV 越界直接无阴影，PCF tap 使用 half texel 在当前 tile 内钳制，避免串采相邻 cascade。
3. `CloudShadowPass.updateShadowCascades()` 在 BSM 更新帧 snapshot 相机 view matrix，并通过 `getShadowViewMatrix()` 下发给 `ThreeGeospatialPipeline`，再传给 Aerial/Atmosphere；shader 选 cascade 时使用冻结 view matrix 与冻结 near/far。
4. 主云 shader 新增 `u_shadowBufferScale`，读取共享 BSM 时和 Aerial/Atmosphere 一样按 scale 解码。
5. 完成后运行构建与静态搜索验证，并把结果补写到本日志。

## 性能指标

本次为正确性修复，不引入额外高频 pass。预期性能影响：

- resolve 启停改为真实 `enabled`，smooth 等禁用 resolve 的场景避免无意义 resolve 输出依赖。
- PCF 仅增加少量 `clamp`/边界判断，成本低于原有 texture 采样成本。
- view matrix snapshot 复用矩阵对象，不引入每帧大量分配。

实际构建/运行结果将在任务结束前补充。

## 测试方案

1. 静态搜索：确认不再使用 `Number.MAX_SAFE_INTEGER` 伪禁用 shadow resolve。
2. 静态搜索：确认 BSM 消费 shader 使用冻结 shadow view matrix，而不是当前 `czm_view`。
3. 静态搜索：确认三处 PCF tap 都在 tile 内钳制，中心越界不 clamp 到边缘。
4. 构建验证：在 `frontend/` 执行 `npm run build`。
5. 浏览器验证建议：
   - smooth：无冻结旧地面云影残留。
   - balanced：移动相机时地面云影持续稳定，无大片错误变暗。
   - ultra：无 cascade 接缝串采条带。
   - 开关体积云与销毁 CesiumContainer 无控制台错误。

## 修改的文件路径

预计/实际变更文件：

- `D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07\26-07-25\2026-07-25-fix-bsm-underlying-shadow.md`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\ThreeGeospatialPipeline.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\CloudShadowPass.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\AtmosphereFromThreeGeospatial\AerialPerspectiveEffect.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\AtmosphereFromThreeGeospatial\AtmospherePostProcess.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\AtmosphereFromThreeGeospatial\Shaders\aerialPerspectiveEffect.frag`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\cloudQualityPresets.js`
- `D:\Dev\GitHub\WebGIS-Dev\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\project-structure.md`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\backend\README.md`
