# 矢量 DataSource 透明度（统一图层管理·二期收官，V3.4.35）

## 日期和时间

2026-07-26 20:29（北京时间）

## 事件逻辑链条分析

- **核心症状**：统一图层管理一期中矢量类（geojson/kml/czml/shp）`supportsOpacity=false`，卡片与 TOC 的透明度滑杆对其隐藏——设计文档决策点 4 的既定二期项。
- **根本原因**：DataSource 无整体 alpha 属性，需 per-entity 遍历改材质；朴素实现存在三个坑——①对已缩放颜色再缩放会逐次衰减；②覆盖 CZML 时间动态颜色会冻结动画；③滑杆高频拖动 × 万级实体会卡顿。
- **受影响模块**：`dataSourceDisplay.js`（核心实现）、`cesiumLayers.ts`（能力集）、`CesiumContainer.vue`（渲染回调）。
- **解决思路**：原色快照（WeakMap，新值恒为原始×系数）+ 动态属性跳过（isConstant 检查）+ rAF 每帧合并 + 应用后回调补 requestRender。

## 修改内容

1. **`dataSourceDisplay.js`**：新增模块级 `vectorColorSnapshots`（WeakMap<DataSource, Map<entityId, snapshot>>，随句柄 GC）与 `vectorOpacityPending`（rAF 合并挂起表）；`VECTOR_COLOR_TARGETS` 清单覆盖 point.color/outlineColor、billboard.color、label.fillColor/outlineColor/backgroundColor、polyline/polygon 的 `ColorMaterialProperty` 材质色与 polygon.outlineColor；`applyColorScale` 单属性缩放（仅常量颜色；材质仅 `ColorMaterialProperty`，贴图/特效材质不触碰）；`setRecordOpacity` 增加第四参 `onApplied`，default 分支经 `scheduleVectorOpacity` rAF 合并应用。
2. **`cesiumLayers.ts`**：`OPACITY_SUPPORTED_TYPES` 由 3 类扩至 7 类（全类型），注释指向实现位置——卡片滑杆与 TOC opacity 动作对矢量自动生效（UI 零改动，能力驱动）。
3. **`CesiumContainer.vue`**：adapter.setOpacity 传入 `onApplied=() => requestRender()`，保证 rAF 异步应用后按需渲染模式下即时可见。
4. **设计文档**：`cesium-unified-layer-management.md` 类型×能力矩阵矢量行更新为已落地（决策点 4 闭环）。

## 修改原因

用户指示继续；统一图层管理设计的唯一遗留二期项，补齐后 7 类导入数据的显隐/透明度/重命名/定位/移除全量一致。

## 影响范围

矢量数据透明度（新增能力）；既有 tif/gltf/3dtiles 路径零变化（switch 分支未动）；CZML 动画、贴图材质经防守分支保持原行为。

## 优化解决方案

三坑对策：衰减 → 原始色快照恒等式；动画冻结 → `isConstant===false` 跳过；高频卡顿 → rAF 单帧合并（挂起值覆盖式更新，最后一次生效）。快照键用 entity.id + 属性路径，实体增删安全（新实体首调时补快照）。

## 性能指标

滑杆拖动每帧至多一次全量遍历；万级实体单次遍历为纯属性赋值 O(n)，无几何重建；WeakMap 缓存零手动清理成本。

## 测试方案

- **已验（静态）**：`dataSourceDisplay.js`、`cesiumLayers.ts`、`CesiumContainer.vue` ESLint 零告警。
- **待实机**：
  1. 导入 GeoJSON → 卡片/TOC 出现透明度滑杆，拖动面/线/点同步变淡；反复 0↔100% 十次颜色无衰减；
  2. 导入带时间动画颜色的 CZML → 调透明度后动画属性仍随时间变化（静态属性正常变淡）；
  3. 万级点 GeoJSON 快速拖动滑杆 → 无明显掉帧；
  4. 隐藏→显示→再调透明度 → 状态正确；移除数据源后重新导入 → 快照重建正常（WeakMap 已随旧句柄释放）。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\composables\dataImport\dataSourceDisplay.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\stores\layer\cesiumLayers.ts
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\CesiumContainer.vue
- D:\Dev\GitHub\WebGIS-Dev\Docs\Architecture\cesium-unified-layer-management.md（能力矩阵更新）
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.35 三处 + 版本表保留最新三条）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.35 条目）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-vector-datasource-opacity.md（本日志）

> 备注：无文件增删，文件树不变；未执行任何 git 操作，提交由用户决策。
