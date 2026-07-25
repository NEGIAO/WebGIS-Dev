# 2026-07-25 体积云 BSM 地面阴影动态修复

## 日期和时间

2026-07-25 21:32

## 修改内容

- 修复体积云 BSM（Beer Shadow Map）地面云影在“流畅 / 均衡 / 极致”三种模式下运行时开启、关闭和切换预设后无法正确动态显示的问题。
- `ThreeGeospatialPipeline` 新增 BSM 资源签名与运行时生命周期管理：开启时自动创建 `CloudShadowPass` / `ShadowResolvePass`，关闭时禁用并销毁，预设切换导致尺寸或更新频率变化时自动重建。
- `_syncBSM()` 显式推进风场与云形演化 offset，并同步云层上下高度给 `CloudShadowPass`，确保地面阴影随云层动态变化。
- `_blitBSM()` 改为按目标 `Cesium.Texture` 实际尺寸刷新整张 atlas，并在写入前清空目标 FBO，避免 512/1024 预设切换时旧阴影残留。
- `CloudShadowPass.updateDynamicParams()` 补充 `shadowBottomHeight` / `shadowTopHeight` 动态同步。
- 微调 smooth / balanced 预设的 `bsmGroundScale`，保留 smooth 默认关闭 BSM 的性能语义，但用户手动开启后阴影更容易被观察到。
- 同步更新根 README、前端 README、后端 README、项目结构文档与 CHANGELOG。

## 修改原因

用户反馈体积云在三种不同模式下开启地面云阴影后，底层逻辑无法正确动态显示云的阴影。经排查，根因不是单一 shader 采样错误，而是 BSM 管线只在初始化时根据开关创建，运行时控制面板和质量预设只改参数，不会补建、销毁或重建 GPU pass；同时 BSM atlas blit 固定用 shadowMapSize viewport，和大气侧固定 1024 共享纹理之间存在尺寸不一致与旧像素残留风险。

## 事件逻辑链条分析

1. 核心症状：
   - smooth 默认 `useShadowBuffer=false`，用户后续手动开启 BSM 后没有地面阴影。
   - balanced / ultra 切换到其他模式后，阴影可能不按新 `shadowMapSize` / `bsmUpdateInterval` 生效。
   - 风速或演化速度变化时，主云体在动，但地面云影可能滞后或不动。
2. 根本原因：
   - `init()` 中的 BSM 创建逻辑是一次性的，缺少运行时生命周期。
   - 资源级参数变化只写入 `params`，没有重建 RT/FBO 和 resolve pass。
   - `_syncBSM()` 依赖云 stage uniform 回调推进 offset，和渲染时序耦合。
   - 512 BSM 写入 1024 target texture 时未清空整图，旧 atlas 区域可能残留。
3. 解决链条：
   - 以资源签名识别 pass 是否需要创建/复用/重建。
   - 在 `_syncBSM()` 开头统一收束开关、重建、参数同步与动画推进。
   - 使用目标纹理尺寸作为 blit viewport，并清空 FBO，保证 atlas 完整刷新。

## 影响范围

- 前端 Cesium 体积云模块：BSM 云阴影、ShadowResolve、AerialPerspective 地面云影消费链路。
- Cesium 工具面板体积云三档预设：smooth / balanced / ultra。
- 文档体系：根 README、frontend README、backend README、Docs/Guide 文件树与 CHANGELOG。
- 后端代码无变更，后端结构无影响。

## 优化解决方案

1. 生命周期管理：
   - 新增 `_getBSMResourceSignature()`、`_sameBSMResourceSignature()`、`_ensureBSMPasses()`、`_destroyBSMPasses()`。
   - `init()` 和 `_syncBSM()` 共用 `_ensureBSMPasses()`，避免初始化和运行时两套分叉逻辑。
2. 动态同步：
   - `_syncBSM()` 中显式调用 `_advanceOffsets()`，保证 BSM 与主云使用同一帧推进后的 weather/shape/detail offset。
   - 每帧同步 `shadowBottomHeight`、`shadowTopHeight`、`shadowFar`、`shadowSplitLambda`、`shadowFadeScale` 等参数。
3. atlas 稳定性：
   - `_blitBSM()` 读取目标 `Cesium.Texture` 的 `width/_width` 和 `height/_height`，全尺寸 viewport 写入。
   - 写入前清空目标 FBO，防止低分辨率模式切换后的旧像素参与采样。
4. 预设可见性：
   - smooth 仍默认关闭 BSM 以保障帧率；用户开启后基础地面阴影强度从 0.1 提升至 0.18。
   - balanced 地面阴影强度从 0.08 提升至 0.12。

## 性能指标

- 本次为渲染正确性与生命周期修复，不引入额外常驻 pass。
- smooth 仍默认关闭 BSM，不影响默认性能路径。
- 仅在用户开启 `useShadowBuffer` 时创建 BSM pass；关闭后销毁 pass，释放对应 WebGL 资源。
- 预设切换只在资源签名变化时重建，普通每帧同步复用已有 pass 和 scratch 容器。

## 测试方案

1. 静态验证：
   - 在 `frontend/` 运行 `npm run build`，确认 Vite 构建通过。
2. 手动功能验证：
   - 启动前端，进入 Cesium 3D 模式并打开体积云。
   - 依次选择 smooth / balanced / ultra。
   - 在每个模式下开启 `BSM 云阴影`，观察地面云影出现。
   - 调高 `地面阴影强度`，调整 `风速` / `演化速度`，确认地面云影随云层动态移动。
   - 在 BSM 开启/关闭、三档预设来回切换时观察控制台，预期无 FBO / shader / sampler 报错，无旧阴影残留。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\ThreeGeospatialPipeline.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\CloudShadowPass.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\cloudQualityPresets.js`
- `D:\Dev\GitHub\WebGIS-Dev\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\backend\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\project-structure.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07\26-07-25\2026-07-25-cloud-bsm-ground-shadow-dynamic-fix.md`
