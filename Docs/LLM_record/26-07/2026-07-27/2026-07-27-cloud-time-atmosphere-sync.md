# 2026-07-27 体积云时间轴同步与大气透视修复

- **日期和时间**：2026-07-27 16:20
- **版本号**：V3.4.67

## 修改内容

- 将体积云风场漂移与云形态演化从 `performance.now()` 墙钟时间切换为 Cesium `viewer.clock.currentTime` 仿真时间。
- 同步修正 BSM 云影 pass 的 `u_time` 来源，保证云体与云影使用同一个 Cesium 时间轴。
- 调整体积云后处理链顺序为 Atmosphere → Aerial → Cloud，恢复 Aerial 负责的几何像素地面云影，再让体积云叠加到天空与地面大气之上。
- 修复流畅档默认关闭 Aerial、各档 `aerialPerspectiveScale` 为 0 导致大气效果几乎不可见的问题。

## 修改原因

用户反馈体积云演进应当跟随 Cesium 时间轴：时间倍率加速时云演化也应加速，拖动时间轴时云应同步变化；同时反馈体积云大气效果显示很弱，只露出一点点。排查确认此前云演化使用真实时间增量，与 Cesium clock 无关；流畅档关闭 Aerial stage，且三档云体大气透视强度均为 0。

## 影响范围

- 前端 Cesium 体积云主渲染管线。
- 前端 BSM 云影 pass 时间 uniform。
- 前端体积云三档预设的大气透视默认值。
- 后端无代码行为影响。

## 优化解决方案

### 事件逻辑链

1. 核心症状：
   - 调整 Cesium 时间倍率时，体积云演化速度没有同步变化。
   - 拖动 Cesium 时间轴时，云形态没有按目标时间点跳转。
   - 大气透视/Bruneton 相关效果视觉很弱。
2. 根本原因：
   - `ThreeGeospatialPipeline._advanceOffsets()` 使用 `performance.now()` 计算真实时间 `dt` 并累加偏移，与 `viewer.clock.currentTime`、`multiplier` 和 timeline scrub 无关。
   - `CloudShadowPass.render()` 也独立使用 `performance.now()` 计算 `u_time`，云影时间通道与 Cesium 时间轴不一致。
   - 流畅档 `aerialStageEnabled=false`、`groundAerialScale=0`，三档 `aerialPerspectiveScale=0`，导致云体和地面空中透视几乎被关掉。
   - 初始化顺序为 Atmosphere → Aerial → Cloud，Aerial 不是链路末端，云输出绕过末端空中透视/tonemap。
3. 处理策略：
   - 以 `Cesium.JulianDate.secondsDifference(viewer.clock.currentTime, baseline)` 作为仿真经过秒数。
   - 云体 `localWeatherOffset/shapeOffset/shapeDetailOffset` 直接由仿真秒数计算，时间倍率和拖拽天然同步。
   - 将同一仿真秒数传入 BSM 动态参数，CloudShadowPass 的 `u_time` 不再使用墙钟。
   - 将后处理链保持/恢复为 Atmosphere → Aerial → Cloud：Aerial 先写几何像素与地面云影，Cloud 最后叠加云体，避免地面阴影被云 stage 覆盖。
   - 为流畅/均衡/极致设置非零 `aerialPerspectiveScale`，流畅档保留基础 Aerial stage。

## 性能指标

- 本次为时间源和后处理链路修复，未在当前环境进行 GPU 实机帧率采样。
- 预期性能影响：Cesium clock 秒差计算为轻量 CPU 操作；流畅档开启 Aerial stage 会增加一个全屏后处理 pass，但换来基础大气透视可见。

## 测试方案

- 已执行 `node --check` 检查以下变更 JS 文件语法通过：
  - `frontend/src/components/Cesium/Cloud/cloudQualityPresets.js`
  - `frontend/src/components/Cesium/composables/toolModules/cloudModule.js`
  - `frontend/src/components/Cesium/Cloud/lib/ThreeGeospatialPipeline.js`
  - `frontend/src/components/Cesium/Cloud/lib/CloudShadowPass.js`
- 已执行定向 ESLint：`npm exec eslint -- src/components/Cesium/Cloud/cloudQualityPresets.js src/components/Cesium/composables/toolModules/cloudModule.js src/components/Cesium/Cloud/lib/ThreeGeospatialPipeline.js src/components/Cesium/Cloud/lib/CloudShadowPass.js --quiet`，通过。
- 待实机验证：
  1. 开启体积云，调整 Cesium 时间倍率，观察云演化速度同步变快/变慢。
  2. 拖动 Cesium 时间轴到不同时间点，观察云体纹理与云影位置同步跳变。
  3. 切换流畅/均衡/极致，确认大气透视不再只显示一点点，并根据观感微调「大气透视」「地面发白」。

## 纠偏记录

- 2026-07-27 16:25 纠偏：短暂尝试把 Aerial 放到 Cloud 后会让 Aerial 负责的地面云影被后续合成链路覆盖；已恢复为 Atmosphere → Aerial → Cloud，并在运行时重建 cloud stage 时同步保持该顺序。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\cloudQualityPresets.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\ThreeGeospatialPipeline.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\CloudShadowPass.js`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07\2026-07-27\2026-07-27-cloud-time-atmosphere-sync.md`
- `D:\Dev\GitHub\WebGIS-Dev\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\backend\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\project-structure.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md`
