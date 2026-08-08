# 2026-08-08 — 3D Tiles 材质模式 Bug 修复 V3.5.16

- **日期**: 2026-08-08 15:30
- **任务等级**: L2
- **版本**: V3.5.16

---

## 问题分析

用户报告 3D Tiles 卡片的材质选择器中，「高度分层」「高度渐变」以及透明度调节均无法正确应用。

### 核心症状
1. 切换「高度分层」后所有建筑变成纯色，无分层效果
2. 切换「高度渐变」后建筑只显示单一颜色，无渐变效果
3. 透明度滑杆与材质模式之间存在状态冲突

### 根本原因（5 个独立 Bug）

| # | 位置 | 根因 | 影响 |
|---|---|---|---|
| 1 | `buildHeightStyle` | `isNaN()` 不是 3D Tiles Styling 合法函数 | 表达式解析失败，整个 style 无效 |
| 2 | `buildCustomShader` (gradient) | 硬编码 `bottomHeight=560, topHeight=750` | 仅对一个样例有效，其他瓦片集 Z 值范围不匹配 |
| 3 | `buildCustomShader` (gradient) | 缺失 `lightingModel: UNLIT` | 颜色受 PBR 光照影响变暗，渐变效果失真 |
| 4 | `getTilesetState` | 默认 `mode: 'none'` 与 UI 默认 `'baimo'` 脱节 | 首次拖透明度时材质被重置为原始材质 |
| 5 | `loadTilesetFromFileMap/JSON` | 未设 `materialMode` 也未应用默认材质 | UI 显示 baimo 但实际未应用 |

### 受影响模块
- `tilesetLoader.js`（材质应用 + 数据加载）
- `dataSourceDisplay.js`（外观状态管理）

---

## 修改内容

### 1. `buildHeightStyle`：替换无效表达式
```js
// 修复前：isNaN() 非 3D Tiles Styling 合法函数
["isNaN(Number(${height}))", ...]

// 修复后：使用 has_property() 兜底
["!has_property('height')", fallback],
["${height} === null", fallback],
```
同时移除了无效的 `=== undefined` 检查。

### 2. `buildCustomShader` gradient：动态高度范围
```js
// 修复前：硬编码
float bottomHeight = 560.0, topHeight = 750.0;
(fsInput.attributes.positionMC.z - bottomHeight) / (topHeight - bottomHeight)

// 修复后：从 boundingSphere 动态计算
// positionWC.z（世界坐标 ECEF Z 分量）作为高度代理
float bottomHeight = <centerZ - radius*0.6>;
float heightRange = <radius * 1.2>;
(fsInput.attributes.positionWC.z - bottomHeight) / heightRange
```
同时添加 `lightingModel: Cesium.LightingModel.UNLIT`。

### 3. `getTilesetState`：接受 record 参数初始化 mode
```js
function getTilesetState(tileset, record) {
    let state = tilesetAppearanceState.get(tileset);
    if (!state) {
        state = { mode: record?.materialMode || 'none', alpha: 1 };
        // ...
    }
}
```
`setTilesetMaterialMode` 和 `setRecordOpacity` 均传入 record。

### 4. 加载器统一默认 baimo
`loadTilesetFromFileMap` 和 `loadTilesetJSON` 加载时：
- 调用 `applyTilesetMaterial(tileset, 'baimo', Cesium)`
- 设置 `record.materialMode = 'baimo'`

---

## 影响范围
- 3D Tiles 材质选择器（5 种模式全部生效）
- 3D Tiles 透明度滑杆（与材质模式互不覆盖）
- 用户通过 ZIP/文件夹/JSON 导入的 3D Tiles 数据集

---

## 性能指标
未涉及性能优化，仅修复功能正确性。

---

## 测试方案

### Agent 已执行
- 静态代码审查：确认 `isNaN` 已替换、`positionWC` 访问路径正确（`fsInput.attributes.positionWC.z`）
- lint 检查：确认无未使用变量

### 待用户实机验证
1. 加载样例数据（城市/河南大学），依次切换 5 种材质模式，确认每种视觉效果正确
2. 在高度分层模式下确认有 4 个颜色分层（不是纯色）
3. 在高度渐变模式下确认有从绿到红的垂直渐变
4. 在任意材质模式下拖动透明度滑杆，确认材质不被重置
5. 通过 ZIP 导入用户自有 3D Tiles，确认默认显示白膜贴图且材质切换正常

---

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/cesium/composables/dataImport/loaders/tilesetLoader.js` | buildHeightStyle（isNaN 替换）+ buildCustomShader（gradient 动态范围 + UNLIT）+ applyTilesetMaterial（传 bsInfo）+ 两个加载器补默认 baimo |
| `frontend/src/domains/cesium/composables/dataImport/dataSourceDisplay.js` | getTilesetState 接受 record 参数 + setTilesetMaterialMode/setRecordOpacity 传入 record |

---

## 遗留与风险
- 高度渐变的颜色范围基于 boundingSphere 的 60% 半径估算，对于极端扁平或极深的瓦片集可能渐变不够显著（用户可接受范围）
- heightStyle 的分层阈值（30m/60m/130m）仍为硬编码，适配国内常见建筑高度；对于超高/超低建筑可能需要动态调整
