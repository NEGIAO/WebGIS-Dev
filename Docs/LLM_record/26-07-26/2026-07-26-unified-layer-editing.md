# 2026-07-26 图层管理统一与几何编辑全图层开放（unified-layer-editing）

- **日期和时间**：2026-07-26 18:55
- **所属版本**：V3.4.9
- **变更类型**：前端功能重构（编辑引擎泛化 + TOC 统一入口 + DrawPanel 职责收敛）

---

## 事件逻辑链条分析

| 环节 | 内容 |
|------|------|
| 核心症状 | ① DrawPanel 的编辑功能与 LayerPanel（TOC 图层目录）的图层管理互不统一：绘制面板里"选择编辑/删除选中/清除所有"自成一套，图层目录里的可见性/移除/导出另成一套，同一批托管图层存在两个各管各的操作入口；② 几何编辑（SelectEdit）硬编码只允许 `sourceType === 'draw'` 的绘制图层，上传/搜索/行政区划矢量图层无法编辑 |
| 根本原因 | V3.4.5 集成几何编辑时为规避误改上传数据做了保守限制（`isEditableLayer` 只放行 draw），且编辑入口只挂在 DrawPanel，未接入 TOC 菜单协议（protocol/contextMenu/commandDispatcher），导致编辑能力与图层管理体系脱节 |
| 受影响的模块 | 几何编辑会话（useGeometryEdit）、选中高亮（useDrawingFeatureStyle）、TOC 菜单协议全链（protocol / contextMenu / commandDispatcher / contextActionManager / layerTreeBuilder / TOCTreeItem / TOCPanel / SidePanel / HomeView / MapContainer）、DrawPanel/ControlsPanel 文案 |
| 解决方案 | 编辑能力下沉为"面向全部矢量托管图层"的通用能力；TOC 右键菜单新增「编辑要素」定向入口与 DrawPanel SelectEdit 共用同一引擎；图层级操作（清除/移除）归口 TOC，DrawPanel 收敛为"绘制 + 要素级编辑" |

---

## 修改内容

1. **编辑能力泛化**（`useGeometryEdit.js`）
   - `isEditableLayer`：由 `sourceType === 'draw'` 硬编码改为通用矢量判断（图层含 `getFeatures` 矢量源即可编辑）；显式排除路线图层（几何与规划步骤强绑定）、栅格/瓦片源、WebGL 大数据图层。
   - 新增 `getOlLayerFromItem`：兼容常规托管记录的 `layer` 与行政区划托管记录的 `_layer` 字段，全部取层逻辑统一走该解析器。
   - `activateGeometryEdit(options)`：支持 `{ layerId }` 定向编辑（Select 过滤仅命中指定图层），供 TOC 入口使用；无参调用行为不变（编辑全部可编辑图层）。
   - 键盘快捷键：新增 Delete/Backspace 删除选中要素（输入框/文本域/可编辑元素聚焦时不响应，防误删）；Esc 逻辑保持。
   - `deleteSelectedDrawingFeature`：绘制图层删空后维持"自动移除托管图层"原行为；非绘制图层删空后保留空图层记录，是否移除交由 TOC 统一决定（避免绕过图层管理入口，也规避行政区划管理器内部状态失同步）。
   - `updateSelectedDrawingStyle`：非绘制要素首次调样式时按几何类型推导 drawType（Point/LineString/Polygon），替代原先一律按 Polygon 处理。
2. **通用选中高亮**（`useDrawingFeatureStyle.js`）
   - 抽出内部 `buildSelectionOverlayStyles`（光晕 + 虚线描边）；`createSelectionHighlightStyle` 复用之。
   - 新增导出 `createGenericSelectionHighlightStyle`：非绘制来源要素选中时仅叠加通用高亮，不再伪造 Polygon 基础样式覆盖原图层样式语义。
3. **TOC「编辑要素」全链接线**
   - `protocol.js`：`TOC_MENU_COMMANDS.EDIT = 'edit'`。
   - `contextMenu.js`：图层节点菜单编辑组头部插入「编辑要素」（`capabilities.canEdit` 控制）。
   - `commandDispatcher.js`：EDIT 命令 → `{ type: 'edit-layer', payload: { layerId } }`。
   - `contextActionManager.js`：`edit-layer` 加入 LAYER_ID_FORWARD_EVENT_TYPES 直转发。
   - `layerTreeBuilder.ts`：节点 `actions.edit`（矢量图层开放，route 组与栅格图层关闭）。
   - `TOCTreeItem.vue`：menuCapabilities 新增 `canEdit`。
   - `TOCPanel.vue` / `SidePanel.vue`：emits 声明与事件转发补 `edit-layer`。
   - `HomeView.vue`：`handleEditLayer` → `MapContainer.activateGeometryEditForLayer`。
   - `MapContainer.vue`：新增 `activateGeometryEditForLayer(layerId)`（先统一清理绘制/测量/编辑交互再定向激活，附操作提示消息）并加入 defineExpose；SelectEdit 注释同步为全矢量范围。
4. **DrawPanel 职责收敛**（`DrawPanel.vue` / `ControlsPanel.vue` / `drawingToolRegistry.js`）
   - SelectEdit 工具提示：「点击任意矢量图层要素（绘制/上传/搜索/区划）拖动顶点修改，Delete 删除选中」。
   - 「清除所有」→「清除绘制」，tooltip 注明仅作用于绘制图层、其他图层请在图层目录统一管理；ControlsPanel 对应提示语同步。

## 修改原因

用户反馈 DrawPanel 编辑与 LayerPanel 图层管理功能冲突、不统一：图层应统一管理，编辑不应局限于绘制图层。本次将"编辑要素"升级为图层体系的通用能力并归口 TOC 入口，绘制面板回归绘制工具本职。

## 影响范围

- 几何编辑链路（激活、选择过滤、高亮、删除、样式更新）
- TOC 菜单协议与事件转发链（新增一条 edit-layer 事件，既有事件零改动）
- DrawPanel/ControlsPanel 仅文案与按钮语义，不改绘制逻辑
- 不影响：绘制/测量交互、图层上传管线、路线规划渲染、空间分析、后端

## 优化解决方案（实施步骤）

1. 摸清双链路：DrawPanel→ControlsPanel→HomeView→MapContainer 与 TOCTreeItem→dispatcher→contextActionManager→TOCPanel→SidePanel→HomeView，确认冲突源于编辑引擎的 draw 限制与 TOC 缺编辑入口。
2. 先泛化引擎（isEditableLayer/定向参数/快捷键/通用高亮），再沿 TOC 菜单协议逐层接线新命令，最后收敛 DrawPanel 文案，保证每步独立可验证。
3. 行政区划记录 `_layer` 字段兼容与"非绘制图层删空保留记录"两处边界在实施中发现并补齐。

## 性能指标

- 无性能敏感路径改动；Select 层过滤函数增加一次字符串比较，可忽略。通用高亮避免了为非绘制要素重建基础样式，选中开销略降（未量化）。

## 测试方案

- **静态验证（已执行，全部通过）**：7 个 JS 模块 `node --check`（ESM）语法通过；7 个 Vue 组件 `@vue/compiler-sfc` parse + compileScript + compileStyle 编译通过；`layerTreeBuilder.ts` TypeScript transpile 无诊断；`useGeometryEdit` 中 `.layer` 直接访问残留为 0（全部经 `getOlLayerFromItem`）；全部改动文件行尾风格与原文件一致（无 CRLF/LF 混用）。
- **手动验收清单（建议执行）**：① 上传 GeoJSON → 图层目录右键「编辑要素」→ 点选要素拖顶点、Delete 删除、Esc 退出；② 绘制面板 SelectEdit 可同时命中绘制与上传要素；③ 路线图层与 TIF 栅格图层右键无「编辑要素」；④ 行政区划图层可定向编辑；⑤ 上传图层删空全部要素后图层记录仍在目录中，可经右键移除；⑥ 绘制图层删空要素自动移除（原行为）；⑦ 输入框聚焦时按 Delete 不误删要素；⑧ DrawPanel「清除绘制」只清绘制图层。
- 预期结果：编辑能力覆盖全部矢量图层，图层级管理动作全部归口图层目录，绘制流程行为与改版前一致。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\useGeometryEdit.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\useDrawingFeatureStyle.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\drawingToolRegistry.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\toc\protocol.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\toc\menu\contextMenu.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\toc\menu\commandDispatcher.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\toc\actions\contextActionManager.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\stores\layer\layerTreeBuilder.ts`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Layer\TOCTreeItem.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Layer\TOCPanel.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Shell\SidePanel.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\views\HomeView.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Map\MapContainer.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\ControlsPanel\DrawPanel.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\ControlsPanel\ControlsPanel.vue`
- `D:\Dev\GitHub\WebGIS-Dev\README.md`（版本升至 V3.4.9）
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md`（新增 V3.4.9 条目）
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md`（useGeometryEdit 注释更新）
- `D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-unified-layer-editing.md`（本日志，新增）
