# V3.5.16 数据源透明度联动加固与诊断

- **日期与时间**：2026-08-08 21:40
- **任务等级**：L2
- **版本**：V3.5.16
- **相关日志**：`2026-08-08-tileset-material-bugfix.md`（V3.5.16，透明度/材质状态脱节首次修复）

---

## 问题分析

**核心症状**：用户报告「数据源（CesiumToolPanel 数据 Tab 卡片）设置透明度：全部都失效，无法设置——调整滑杆，但模型的透明度没有改变」。

**根本原因**：经全链路静态审查（滑杆 → `onSourceOpacityInput` → `cesiumLayersStore.setOpacity` → adapter 回调 → `findImportRecord` → `setRecordOpacity` 类型分派 → 场景对象），**代码链路完整、各分支实现正确**——但链路中每一环的失败路径都是**静默 return**（store 找不到记录、adapter 未注册、句柄记录缺失、Cesium 命名空间未就绪均无任何可见输出）。在用户实机环境中「全部类型同时失效」意味着断点位于**类型无关的公共环节**（store / adapter / 句柄匹配 / Cesium 命名空间），而这些环节全部静默，导致问题不可见、不可定位。

**受影响模块**：数据源透明度链路（CesiumToolPanel 卡片 → cesiumLayers store → CesiumContainer adapter → dataSourceDisplay 类型适配）。

**候选断点（按优先级）**：
1. `adapter` 未注册（CesiumContainer 卸载后未重建、store 实例被重置）
2. `findImportRecord(id)` 返回 null（id 类型/格式不一致）
3. `getCesium()` 返回 null（boot 未完成或失败）
4. `getTilesetState` 初始 alpha 与 UI 元数据脱节（3D Tiles 首次拖拽状态基准错误）

## 方案对比

| 方案 | 说明 | 结论 |
|---|---|---|
| A. 仅加诊断日志 | 低成本，把静默失败变成 Console 可见 | ✅ 已实施（主干） |
| B. 跳过失败环节强行操作 | adapter/句柄缺失时 store 无句柄可用，无解 | ❌ 不可行 |
| C. 重构元数据-句柄映射表 | 大改，违背「元数据入店、句柄留场」架构 | ❌ 过度 |

## 修改内容

1. `cesiumLayers.ts` — `setOpacity`：记录缺失（id 未建档/已销档）与 adapter 未注册时 `console.warn`，不再静默 return（元数据更新逻辑不变）。
2. `CesiumContainer.vue` — adapter 回调 `setVisible` / `setOpacity`：句柄记录缺失、Cesium 命名空间未就绪时 `console.warn` 后 return。
3. `dataSourceDisplay.js` — `getTilesetState`：状态初始化 alpha 优先读 `record.opacity`（`Number.isFinite` 校验），与统一图层元数据对齐，消除「首次拖拽回弹/状态基准错误」。

## 影响范围

- 统一图层管理（cesiumLayers store + 场景 adapter）
- 数据 Tab 卡片透明度滑杆（tif / gltf / 3dtiles / 矢量类）
- 无配置变更、无文件增删

## 性能指标

未实测（本次改动为诊断加固，引入 4 次 console.warn 分支，热路径开销可忽略）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `tsc --noEmit` 通过（0 新错误） | 打开开发者工具 Console，在数据 Tab 拖动任意数据源透明度滑杆，观察是否有 `[cesiumLayers]` / `[CesiumContainer]` 开头的新警告 |
| `vite build` 通过（28.7s，无报错） | 若出现警告 → 按警告内容定位断点（adapter 未注册 / 记录缺失 / 命名空间未就绪）反馈；若无警告且模型仍不变 → 问题不在本链路（需检查滑杆 input 事件与 CSS 层） |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/cesium/stores/cesiumLayers.ts` | setOpacity 失败路径显式告警；setVisible 同步 |
| `frontend/src/domains/cesium/components/CesiumContainer.vue` | adapter 回调失败路径显式告警 |
| `frontend/src/domains/cesium/composables/dataImport/dataSourceDisplay.js` | getTilesetState 初始 alpha 对齐 record.opacity |
| `README.md` | 版本号三处 → V3.5.19 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.5.19 条目 |
| 本日志 | 新增 |

## 遗留与风险

- **根因未最终确认**：静态链路无硬伤，断点需实机验证后锁定；本次已使断点显式化。
- **待确认**：滑杆 input 事件是否真实触发（若 Console 无任何警告，则排查 `@input` 绑定与 CSS 层遮挡）。
- 已记 TODO 候选：`kmz` 类型未列入 `OPACITY_SUPPORTED_TYPES`（无透明度滑杆），待产品确认。

## 下一步建议

1. 用户实机拖动一次并回传 Console 输出（区分 adapter / 记录 / 命名空间 / 无警告四类结果）。
2. 若为「无警告但无效」：检查 `CesiumToolPanel.vue` 791-815 行滑杆的 `:value`/`@input` 与自定义 CSS（`.tileset-slider` / thumb）事件的接收情况。