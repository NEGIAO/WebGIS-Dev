# 体积云阴影稳定性修复维护日志

## 日期和时间

2026-07-26 09:44

## 修改内容

> 本日志按“先写文档、再实施代码改动、最后回填结果”的流程创建。本节将在代码修复完成后回填最终变更。

计划修复 Cesium 体积云 BSM（Beer Shadow Map）地面阴影链路中的三类稳定性问题：

1. 旋转视角时偶发大面积黑色阴影纹理。
2. 相机海拔垂直变化时地面云影剧烈抖动。
3. 阴影纹理疑似固定在屏幕位置，未稳定贴附地面。

## 修改原因

当前体积云阴影问题集中在底层渲染链路，而非 UI 层：BSM 生成、时域解析、矩阵同步、地面采样坐标系与 cascade 选择均会影响阴影是否贴地、是否闪烁。用户反馈的三类现象说明现有阴影图集与相机变化之间存在帧间错配和采样不稳定，需要从底层修复。

## 事件逻辑链分析

### 核心症状

| 症状 | 表现 | 关联链路 |
|------|------|----------|
| 旋转黑闪 | 视角旋转时突然出现大面积黑色阴影块 | CloudShadowPass 清空/重绘、ShadowResolvePass history、BSM blit |
| 垂直抖动 | 相机升降时阴影轮廓剧烈跳动 | 相机视锥 CSM 重建、cascade 边界选择、地面采样坐标 |
| 屏幕固定 | 阴影像停留在屏幕固定区域 | BSM atlas/matrix 节流错配、坏深度 fallback、视相关 shadow matrix |

### 根本原因

1. `CloudShadowPass.render()` 将 `updateShadowCascades()` 与昂贵的 BSM raymarch 绑定在同一个 `bsmUpdateInterval` 节流逻辑中，导致相机变动时 matrix/atlas 可能滞后。
2. BSM 渲染和 `_blitBSM()` 均有整图 clear，若消费者读到未完成或错误缩放的图集，会将光学深度解码为异常阴影，形成黑闪。
3. `ShadowResolvePass` 对相机运动只提高 `temporalAlpha`，但大幅旋转或 cascade 滑动时仍可能混入失效历史。
4. 地面采样中 raw ECEF、Bruneton bottom sphere correction、view-depth cascade 选择存在混用风险，导致相机升降时阴影不够贴地。
5. cascade 边界使用 `gl_FragCoord` jitter，在垂直运动时可能放大边界闪烁。

## 影响范围

- 前端 Cesium 体积云模块。
- BSM 云影生成与地面云影采样。
- 大气 / 空中透视后处理中的地面太阳透过率。
- 体积云质量预设中 BSM 更新节奏的语义说明。

## 优化解决方案

### 计划实施步骤

1. `CloudShadowPass` 解耦矩阵更新与 BSM raymarch 节流：矩阵每帧更新，昂贵渲染仅在静止时按 interval 节流，运动中强制刷新。
2. 引入 last-good / 双缓冲语义，避免消费者读到 clear 中或未完成的 BSM atlas。
3. `ShadowResolvePass` 在大幅相机运动时 hard reset history，避免历史重投影污染。
4. `_syncBSM` 只发布有效纹理和最新矩阵，确保 aerial/atmosphere 侧数据一致。
5. 修正地面采样 shader：统一采样坐标系，降低 cascade 边界 jitter，坏深度场景减少假贴地阴影。
6. 同步相关 README 与项目结构文档，版本升级至 `V3.4.3`。

## 性能指标

本次修复目标以稳定性为主，不以提升帧率为目标。预期：

- 运动中 BSM 可能更频繁刷新以保证正确性。
- 静止时仍保留 `bsmUpdateInterval` 节流，避免持续增加 GPU 压力。
- 黑闪、屏幕固定和升降抖动应明显减少或消失。

## 测试方案

1. 启动前端开发环境，进入 Cesium 三维体积云场景。
2. 在 `balanced` 与 `ultra` 质量档测试 `useShadowBuffer=true`。
3. 快速旋转相机 10 秒，确认无大面积黑色阴影块。
4. 固定地面兴趣点，相机垂直升降，确认阴影贴地且轮廓连续。
5. 慢速平移相机，确认阴影不固定在屏幕坐标。
6. 切换 `shadowResolveEnabled` 开/关，确认无崩溃且视觉稳定。
7. 运行前端可用的 lint/build 检查并记录结果。

## 修改的文件路径

> 代码实施完成后回填最终文件列表。

预计涉及：

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\CloudShadowPass.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\ShadowResolvePass.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\ThreeGeospatialPipeline.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\AtmosphereFromThreeGeospatial\Shaders\aerialPerspectiveEffect.frag`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\AtmosphereFromThreeGeospatial\AtmospherePostProcess.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\cloudQualityPresets.js`
- `D:\Dev\GitHub\WebGIS-Dev\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\backend\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\project-structure.md`
