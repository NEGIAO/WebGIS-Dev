# 2026-05-28 KML/KMZ 样式不可见问题修复

## 日期和时间
2026-05-28 21:30

## 修改内容
修复 KML/KMZ 样式解析中 Placemark-Feature 错配导致的不可见问题，增强 styleUrl 解析与几何兼容性校验，并为非标准 IconStyle 引用增加回退渲染。

## 修改原因
部分 KML/KMZ 文件导入后在 TOC 中可见但地图不渲染，只有在手动设置样式或打开属性表高亮后才显示。

## 事件逻辑链条分析
- **核心症状**：KML/KMZ 导入成功，图层与要素存在，但地图渲染为空。
- **根本原因**：
  1) `applyKmlStylesToFeatures()` 以索引匹配 Placemark 与 Feature，遇到 MultiGeometry 或解析顺序变化时会错配样式。
  2) 错配时可能把仅包含 `IconStyle` 的样式应用到面/线要素，OpenLayers 在非点几何上不会渲染图标，导致要素不可见。
  3) 现有的 `:contains` 选择器在 `querySelector` 中无效，导致基于 ID/名称的兜底匹配不可用。
- **受影响模块**：KML 样式解析器（Placemark-Feature 映射、样式应用）。

## 影响范围
- `frontend/src/utils/gis/parsers/kmlStyleParser.js`
- KML/KMZ 导入链路（useLayerDataImport -> applyKmlStylesToFeatures）

## 优化解决方案
1. 预构建 Placemark 的 `id/name` 映射表，优先按 `featureId`/`name` 匹配，索引匹配仅作为兜底。
2. 支持解析 `styleUrl` 中的 `#fragment`，避免携带路径导致样式无法命中。
3. 对样式与几何类型做兼容性校验：非点几何禁止使用仅包含 `IconStyle` 的样式，改为交给图层默认样式渲染。
4. 对 `IconStyle.href` 进行有效性判断（非 URL/非图片扩展），自动回退到圆形点样式，避免点要素不可见。

## 性能指标
- 仅增加一次 Placemark 的预解析与映射，复杂度 O(n)，性能影响可忽略。

## 测试方案
1. 导入包含 MultiGeometry 的 KML/KMZ，验证面/线要素正常渲染。
2. 导入仅有 IconStyle 的点样式 KML，验证点要素仍正确显示。
3. 验证导入后未设置样式情况下，图层默认样式仍可见。

## 修改的文件路径
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\gis\parsers\kmlStyleParser.js

## 执行状态
- 已完成（待实际导入验证）
