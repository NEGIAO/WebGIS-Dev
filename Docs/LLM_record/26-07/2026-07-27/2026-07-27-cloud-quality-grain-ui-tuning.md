# 2026-07-27 体积云流畅/均衡档颗粒感优化

- **日期和时间**：2026-07-27 15:58
- **版本号**：V3.4.65

## 修改内容

- 调整体积云「流畅」「均衡」两档的主 raymarch 质量参数，降低低/中档位颗粒感。
- 在 Cesium 体积云工具面板中暴露颗粒感相关参数：云渲染分辨率、最小采样步长、远距步长增幅。
- 更新主采样步数 tooltip，使 UI 提示与实际预设值一致。

## 修改原因

用户反馈体积云三档预设中，只有「极致」颗粒感较小，「流畅」「均衡」颗粒感明显偏强。排查确认核心原因是低/中档使用了较低 `cloudResolutionScale`，并叠加较低 `maxSteps`、较大的 `minStepSize` 与较快的 `perspectiveStepScale` 步长增长。

## 影响范围

- 前端 Cesium 体积云性能预设。
- 前端 Cesium 工具面板体积云参数控制项。
- 后端无代码行为影响。

## 优化解决方案

### 事件逻辑链

1. 核心症状：流畅、均衡档体积云颗粒感强，极致档观感明显更细腻。
2. 根本原因：
   - `cloudResolutionScale`：流畅 0.5、均衡 0.75、极致 1.0；低分辨率 raymarch 放大合成会直接放大颗粒。
   - `maxSteps`：流畅 108、均衡 156，主采样步数低于极致 340。
   - `minStepSize`：流畅 110、均衡 80，步长偏大导致云体细节跳采样。
   - `perspectiveStepScale`：流畅 1.03、均衡 1.018，远距步长增长快，远云更容易颗粒化。
3. 处理策略：优先提高低/中档分辨率缩放，再适度增加采样步数、降低步长，避免直接把流畅档提升到极致档成本。

### 参数调整

- 流畅档：
  - `cloudResolutionScale`：0.5 → 0.67
  - `maxSteps`：108 → 144
  - `maxStepsToSun`：2 → 3
  - `minStepSize`：110 → 85
  - `maxStepSize`：1400 → 1200
  - `perspectiveStepScale`：1.03 → 1.018
- 均衡档：
  - `cloudResolutionScale`：0.75 → 0.85
  - `maxSteps`：156 → 220
  - `maxStepsToSun`：4 → 5
  - `minStepSize`：80 → 60
  - `maxStepSize`：1200 → 1100
  - `perspectiveStepScale`：1.018 → 1.01

## 性能指标

- 本次为画质/采样参数调优，未在当前环境进行 GPU 实机帧率采样。
- 预期成本：流畅档像素 raymarch 成本由 0.5²≈25% 提升到 0.67²≈45%；均衡档由 0.75²≈56% 提升到 0.85²≈72%。
- 预期收益：低/中档低分辨率放大导致的颗粒感明显降低，但仍低于极致档 100% 全分辨率成本。

## 测试方案

- 已执行 `node --check` 检查以下两个变更 JS 文件语法通过：
  - `frontend/src/components/Cesium/Cloud/cloudQualityPresets.js`
  - `frontend/src/components/Cesium/composables/toolModules/cloudModule.js`
- 已尝试运行 `npm --prefix frontend run lint -- --quiet`，失败原因是既有 `cesium-navigation` 模块存在 9 个 ESLint 错误，非本次改动引入。
- 待实机验证：打开 Cesium 体积云，切换流畅/均衡/极致，观察流畅与均衡颗粒感是否降低，并按 GPU 情况微调新增 UI 控件。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\cloudQualityPresets.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\composables\toolModules\cloudModule.js`
- `D:\Dev\GitHub\WebGIS-Dev\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\backend\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\project-structure.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07\2026-07-27\2026-07-27-cloud-quality-grain-ui-tuning.md`

## 后续追加

- 2026-07-27 16:20 追加修复体积云 Cesium 时间倍率/时间轴同步与大气透视显示偏弱问题，详见同目录 `2026-07-27-cloud-time-atmosphere-sync.md`。
