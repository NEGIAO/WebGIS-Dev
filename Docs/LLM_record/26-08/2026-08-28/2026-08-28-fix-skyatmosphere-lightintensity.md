# 2026-08-28 修复天空大气光强参数失效（skyAtmosphereLightIntensity 不生效）

**日期和时间**：2026-08-28 10:20

## 修改内容

- `CesiumContainer.vue` 的 `applyBaseAtmosphereParams`：天空大气光强赋值由旧属性名 `sky.lightIntensity` 改为优先写入 `sky.atmosphereLightIntensity`（保留旧属性名 `else if` 兼容回退，支持 Cesium < 1.121）。
- `atmosphereModule.js`：「光晕强度」滑杆上限由 30 调整为 100，覆盖 Cesium 1.121+ 引擎默认值 50 的区间。

## 修改原因

**事件逻辑链条分析**：

1. **核心症状**：用户在 `baseAtmosphereParams` 中配置/调节 `skyAtmosphereLightIntensity: 16`（地球外环光晕强度），无论怎么改滑杆，场景光晕均无任何变化，且控制台无报错。
2. **排查过程**：
   - 分发链路验证：面板控件 → `handleToolControlChange`（controlId 命中 `baseAtmosphereParams`）→ deep watch → `applyBaseAtmosphereParams`，链路本身通畅；
   - 引擎源码验证（`node_modules/cesium@1.132`）：`SkyAtmosphere` 构造器中**不存在** `lightIntensity` 属性，实际属性为 `atmosphereLightIntensity`（默认 50）；`lightIntensity` 是 Cesium 1.121（2024-09 大气统一重构）之前的旧属性名；
   - `applyBaseAtmosphereParams` 中 `if ('lightIntensity' in sky)` 防御检查对不存在的属性返回 false → 赋值被**静默跳过**，光强恒为引擎默认 50——这就是"参数不管用"的直接原因。
3. **根本原因**：Cesium 1.121 的 Breaking Change（`SkyAtmosphere.lightIntensity` → `atmosphereLightIntensity`，同时新增 Rayleigh/Mie 系数等属性）未同步到本项目的参数写入代码。
4. **附带问题**：滑杆上限 30 低于引擎默认 50，即使修复属性名，向上增强光晕的操作也无法通过滑杆表达。

## 影响范围

- 三维场景「大气·光照·天空」模块（基础大气参数 → 天空大气外环光晕渲染）。
- 不涉及 Globe 地面大气（`globe.atmosphereLightIntensity` 属性在 1.132 中未更名，原逻辑正常）。

## 优化解决方案

1. 属性名适配：`'atmosphereLightIntensity' in sky` 优先写入，`'lightIntensity' in sky` 作为旧版本兼容回退；
2. 滑杆量程修正：`max: 30 → 100`，`step: 0.5` 保持不变；
3. 行为说明：修复后参数真实生效，配置默认值 16 < 引擎默认 50，光晕会比"失效期间"（恒为 50）略暗，属预期；想要更亮可调至 50 以上。

## 性能指标

- 无性能影响：仅属性名替换与 UI 量程调整，渲染管线无改动。

## 测试方案

- 环境：`frontend/` 本地 dev（npm run dev），3D 引擎视图。
- 步骤：
  1. 打开三维工具面板「大气·光照·天空」模块，找到「光晕强度」滑杆；
  2. 将滑杆分别调至 0 / 16 / 50 / 100，从太空视角观察地球外环光晕亮度：0 最暗、100 最亮，50 约等于引擎默认；
  3. 控制台执行 `viewer.scene.skyAtmosphere.atmosphereLightIntensity` 确认数值与滑杆一致。
- 预期结果：滑杆变化实时反映到光晕亮度，无报错；2D 视图不受影响。

## 修改的文件路径

- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\cesium\components\CesiumContainer.vue`
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\cesium\composables\toolModules\atmosphereModule.js`

## 文档同步说明

- 根 README「版本演进」新增 V3.5.34，保留最近三个版本（V3.5.34/33/32），V3.5.31 归档至 CHANGELOG；
- `Docs/Guide/CHANGELOG.md` 顶部新增 V3.5.34 条目；
- 本次无文件新增/删除，目录结构未变化，`Docs/Guide/project-structure.md` 及 frontend/backend README 的文件树无需改动。
