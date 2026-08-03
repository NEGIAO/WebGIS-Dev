# 2026-08-03 默认底图跳过容灾监控

**日期与时间**：2026-08-03 15:30
**任务等级**：L2

---

## 问题分析

**核心症状**：首屏加载时大量 `[底图监测]` / `[底图降级]` 报错信息铺满屏幕，遮挡视线，影响体验。

**根本原因**：
1. `useBasemapLayerBootstrap.js` 中 `isDefaultBaseLayer = item.id === defaultLayerId`，但 `item.id` 是具体图层 ID（如 `custom_China_Blender`），而 `defaultLayerId` 传入的是预设 ID（如 `custom_China_Blender_preset_2`），两者永远不会相等 → `isDefaultBaseLayer` 始终为 `false`。
2. 因此默认底图（China Blender 自定义瓦片）被 `monitorLayerTimeout` 监控，非中国区域瓦片不存在 → 大量失败 → 触发降级/message 轰炸。
3. `useBasemapSelectionWatcher.js` 中切换默认预设时同样会执行瓦片验证，必然失败并产生 `切换到xxx底图失败` 警告。

**受影响模块**：底图容灾系统（`resilience/useBasemapResilience.js` 的消费者）

---

## 修改内容

### 1. `frontend/src/domains/ol/basemap/composables/useBasemapLayerBootstrap.js`

- 引入 `resolvePresetLayerIds` 解析默认预设包含的具体图层 ID 集合
- 在 `initializeBasemapLayers` 中，跳过属于默认预设的图层，不调用 `monitorLayerTimeout`

### 2. `frontend/src/domains/ol/basemap/composables/useBasemapSelectionWatcher.js`

- 在工厂内部通过 `getActualDefaultLayerId()` 读取管理员 L2 配置的默认预设 ID（运行时动态值，fallback 到静态 `defaultLayerId`）
- 在 `runLayerSwitch` 中，通过 `val === getActualDefaultLayerId()` 判断当前选中的预设是否为默认预设，是则跳过 `validateBaseLayerSwitch` 验证，直接静默切换成功

---

## 修改原因

项目使用的瓦片是自定义制作，只覆盖中国区域。首屏加载时地图视野通常覆盖全国甚至全球，非中国区域的瓦片必然不存在（404），触发容灾监控的连续错误判断，导致：
- `[底图降级]` 消息不断弹出
- 尝试降级到兜底底图（但默认底图本身是被期望使用的）
- 用户被大量无意义的报错信息淹没

**设计决策**：默认底图是管理员明确配置的，用户选择信任它。瓦片不完整是已知限制，不是"异常"，不应触发容灾机制。

---

## 影响范围

- **底图容灾监控**：默认预设图层不再被监控
- **底图切换验证**：默认预设图层跳过瓦片加载验证
- **非默认底图**：不受影响，仍然完整监控和兜底

---

## 解决方案

| 方案 | 描述 | 取舍 |
|---|---|---|
| **方案 A（采用）** | 默认预设图层完全跳过监控和验证 | 简洁彻底，但默认底图真正出问题时也无声 |
| 方案 B | 降低默认底图的监控敏感度（增加阈值） | 依然会有延迟的报错，不够干净 |
| 方案 C | 只过滤 404 错误，保留超时等其他异常 | 实现复杂，且 404 本身就是主要问题 |

选择方案 A：默认底图的"瓦片缺失"是正常业务逻辑，不是故障。

---

## 性能指标

未实测（UI 逻辑改动，无性能影响）

---

## 测试方案

**Agent 已执行**：
- [x] 代码审查：确认修改逻辑正确
- [x] 确认 `resolvePresetLayerIds` 已正确导入

**待用户实机验证**：
1. 启动项目，打开浏览器访问首页
2. 确认首屏加载时不再出现大量 `[底图监测]` / `[底图降级]` 报错
3. 手动切换到其他非默认底图，确认容灾监控仍然正常工作
4. 手动切换回默认底图，确认无验证报错

---

## 变更文件清单

| 文件路径 | 说明 |
|---|---|
| `frontend/src/domains/ol/basemap/composables/useBasemapLayerBootstrap.js` | 跳过默认预设图层的容灾监控接入 |
| `frontend/src/domains/ol/basemap/composables/useBasemapSelectionWatcher.js` | 跳过默认预设图层的切换验证 |

---

## 遗留与风险

- **风险**：如果默认底图服务完全不可用（而非部分瓦片缺失），用户不会收到任何提示。这是预期代价。
- **后续可考虑**：在 HUD 或状态栏加一个低调的"底图加载进度"指示器，不阻塞但可感知。

---

## 下一步建议

- 实机验证是否还有 OL 层面（非 resilience）的 tileloaderror 日志输出到控制台
- 如有需要，可考虑在 `ol/source/XYZ` 层面加一个全局 silent mode
