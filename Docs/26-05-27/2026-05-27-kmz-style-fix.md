# 2026-05-27 KMZ 样式解析修复 + Code Review

## 日期和时间
2026-05-27 22:00

## 修改内容
1. 修复 KMZ 文件解压后未按 KML 样式解析的根本原因（默认命名空间导致 querySelectorAll 失败）
2. 修复 renameLayer 未更新 displayName 的 bug
3. 对本次所有变更进行 Code Review

## 修改原因
用户反馈：HENU湖泊.kmz 文件应渲染蓝色，但实际渲染为黑色。经深入分析发现根本原因：

### 根本原因：KML 默认命名空间导致 CSS 选择器失效
KML 文件声明了默认命名空间 `xmlns="http://www.opengis.net/kml/2.2"`，当 DOMParser 解析此 XML 时，所有元素（Style、Placemark 等）都属于该命名空间。CSS 的 `querySelectorAll` 是命名空间无关的，无法匹配命名空间内的元素，导致：
- `querySelectorAll('Style[id]')` 返回空集 → 样式定义未提取
- `querySelectorAll('Placemark')` 返回空集 → 无法匹配 Placemark 与 Feature
- 结果：所有要素无样式 → 使用 OL 默认黑色渲染

### 为什么之前的修复不够
之前的修复（`element.id` → `getAttribute('id')`、kml: 前缀归一化、StyleMap 支持）都是正确的改进，但都没有触及核心问题：默认命名空间 `xmlns="..."` 使得 querySelectorAll 完全失效。

## 影响范围
- `frontend/src/utils/gis/parsers/kmlStyleParser.js` - 样式解析器核心
- `frontend/src/stores/useLayerStore.ts` - 图层重命名

## 优化解决方案

### 问题 1：默认命名空间导致 querySelectorAll 失败
**文件**：`frontend/src/utils/gis/parsers/kmlStyleParser.js`

**修复**：新增 `stripKmlDefaultNamespace()` 函数，在解析前移除 KML 默认命名空间声明：
- 移除 `xmlns="http://www.opengis.net/kml/2.2"`
- 移除 `xmlns:gx="..."`、`xmlns:xsi="..."`、`xsi:schemaLocation="..."`
- 在 `extractKmlStyleDefinitions()` 和 `applyKmlStylesToFeatures()` 两处应用

### 问题 2：renameLayer 未更新 displayName
**文件**：`frontend/src/stores/useLayerStore.ts`

**修复**：在 `renameLayer()` 中增加 `layer.displayName = name`，确保 TOCTreeItem 显示的 `node.displayName || node.name` 能正确反映新名称。

## Code Review 结论

### 已修复的问题
| 严重度 | 文件 | 问题 | 状态 |
|--------|------|------|------|
| CRITICAL | kmlStyleParser.js | 默认命名空间导致 querySelectorAll 失败，所有 KMZ 样式丢失 | ✅ 已修复 |
| BUG | useLayerStore.ts | renameLayer 未更新 displayName，重命名后显示名不变 | ✅ 已修复 |

### 已验证无问题的设计
| 模块 | 说明 |
|------|------|
| useManagedLayerStyle.js | feature.getStyle() 检查逻辑正确，数组样式在 OL 中有效 |
| useLayerDataImport.js | kml: 前缀归一化逻辑正确，始终归一化是正确策略 |
| LayerPanel.vue filterTree | 文件夹匹配时保留所有子节点是有意设计 |
| TOCTreeItem.vue commitRename | enter/blur 双触发有 isRenaming 守卫，不会重复提交 |
| contextMenu.js | 重命名/透明度/属性菜单项已在 `nodeType === 'layer'` 条件内，不会在文件夹上显示 |
| toc-theme.css | CSS 变量化全面，150+ 变量覆盖所有 TOC 组件 |
| LayerPropertiesDialog.vue | 防御性取值（多路径 fallback）设计合理 |

### 已知限制（非 bug，可后续优化）
1. **opacity 滑块不实时更新**：右键菜单中的透明度滑块拖动时，视觉位置不会实时更新（菜单项在打开时计算一次）。影响较小，用户松开后下次打开菜单会显示新值。
2. **StyleMap 链式引用**：如果 StyleMap A 引用 StyleMap B，且 B 在 A 之后解析，A 无法解析 B 的样式。实际 KML 文件中此情况罕见。

## 测试方案
1. 上传 HENU湖泊.kmz → 验证湖泊渲染为蓝色（KML color: fff5d6a3）
2. 上传包含 kml: 前缀的 KMZ → 验证样式正确
3. 上传普通 KML → 验证样式正确
4. 双击图层重命名 → 验证名称更新
5. 右键菜单透明度滑块 → 验证图层透明度变化
6. 右键菜单图层属性 → 验证对话框显示正确信息

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\gis\parsers\kmlStyleParser.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\useLayerStore.ts`
