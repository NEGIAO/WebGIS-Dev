# 属性表表头/内容列对齐修复（V3.4.23）

## 日期和时间

2026-07-26 19:46

## 修改内容

- 属性表全列改为**确定性像素宽**：用户拖拽宽度 > 类型默认宽（number 120 / date 132 / boolean 100 / 其余 170），`grid-template-columns` 全部为 px 轨道；表格容器宽度由列宽总和内联精确设定（`min-width: 100%` 保证窄表时表头背景铺满可视区）。
- 移除 `.pro-grid-layout` / `.virtual-holder` / `.pro-th-group` / `.pro-tr` 上的 `min-width: max-content` 与弹性 `minmax(140px, 1fr)` 轨道。
- 斑马纹由 `:nth-child(even)` 改为数据行号驱动的 `row-even` 类。
- 列宽拖拽起始宽度改由状态解析（`resolveFieldWidth`），删除 DOM 测量。

## 修改原因

用户反馈表头与内容列错位。

## 事件逻辑链条分析

### 核心症状

表头单元格与数据列边线不重合，列越靠右偏差越大；横向滚动或出现长内容后错位更明显；滚动时斑马纹"游动"。

### 根本原因

1. **双 grid 容器 + 弹性轨道**：表头（`.pro-th-group`）与每一数据行（`.pro-tr`）是相互独立的 grid 容器，共享同一 `grid-template-columns` 字符串，但 `minmax(140px, 1fr)` 的 fr 轨道在**各自容器宽度**内解算。数据行为绝对定位（不参与父级 intrinsic 尺寸），且自带 `min-width: max-content`——任一行的长内容（nowrap 单元格的 max-content 贡献）会把该行撑得比表头容器宽，fr 轨道随之解算出不同宽度 → 系统性错位。表头侧长别名/排序符也可反向撑宽表头。
2. **虚拟滚动 + nth-child**：`nth-child(even)` 只统计当前渲染切片内的 DOM 序，滚动改变切片起点的奇偶性时，同一数据行的条纹归属翻转，产生条纹漂移。

### 受影响模块

- `frontend/src/components/Layer/AttributeTable.vue`（模板列宽计算 + 样式）

### 优化处理

像素轨道与容器宽度彻底解耦：两个 grid 的轨道逐像素相同，无论容器宽度如何均严格对齐；容器总宽由状态推导（列宽求和），横向滚动条长度真实。字段配置内页表（`.field-header`/`.field-row`）虽也是双容器 minmax 结构，但二者同属一个定宽滚动容器、fr 解算基准一致，不受此 bug 影响，保持原样。

## 优化解决方案（实施步骤）

1. 组件新增 `resolveFieldWidth`（用户宽度→类型默认宽）、`columnWidths`、`gridTotalWidth` 计算；`gridTemplateColumns` 全 px 化；
2. `.pro-grid-layout` 绑定内联总宽；四处 `min-width: max-content` 移除；
3. 斑马纹 `row-even` 类绑定（`item.index % 2`）替代 nth-child；
4. 列宽拖拽起始值改状态解析；ESLint 验证。

## 性能指标

附带收益：全 px 轨道免去浏览器对每行 fr 轨道的 intrinsic 尺寸计算；斑马纹类绑定避免滚动期 nth-child 样式重算。

## 测试方案

**静态验证（已执行）**：ESLint 零告警；grep 确认组件主表格无 `minmax`/`min-width: max-content`/`nth-child(even)` 残留。

**人工验收步骤**：

1. 打开含长文本字段的图层属性表：表头与内容列边线逐列重合；横向滚动到最右侧仍对齐；
2. 拖拽调宽任意列：表头与内容同步变宽，其余列不受牵连；
3. 窄面板 + 少量列：表头背景铺满整行，无右侧断裂；
4. 上下滚动长表：斑马纹相对数据行固定，不再游动；
5. number/date 列默认宽度更紧凑，数值右对齐正常。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Layer\AttributeTable.vue
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.23）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.23 版本段）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-attribute-table-column-alignment-fix.md（本日志）

（无文件增删，文件树无结构变更。）
