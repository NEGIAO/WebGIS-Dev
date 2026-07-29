# 前端 domains 架构 Task 2：Layer/ControlsPanel 组件迁移（Phase 6 收尾）

- **日期与时间**：2026-07-29 13:50
- **任务等级**：L3 架构级
- **版本号**：V3.4.97

---

## 问题分析

### 核心症状
`components/Layer/`（TOCPanel、LayerPanel、LayerControlPanel、AttributeTable）和 `components/ControlsPanel/`（ControlsPanel、DrawPanel、MeasurePanel、SpatialAnalysisPanel、LogMonitor、AdministrativeDivisionPanel、AdministrativeDivisionTreeNode）共 11 个 Vue 组件仍保留在旧目录，与新的 `domains/ol`、`domains/common` 领域架构不匹配。

### 根本原因
Phase 6（v3492）已完成 TOC 协议/工厂/UI（TOCTreeItem、LayerPropertiesDialog、SharedResourceTreeItem）迁移到 `domains/common/layer-tree/`，但遗留了 4 个 Layer 组件和 7 个 ControlsPanel 组件在旧路径（见 v3492 日志「遗留与风险」第 2 条）。

### 受影响模块
- `domains/common/layer-tree/components/`：新增 TOCPanel.vue、LayerPanel.vue
- `domains/ol/layer/components/`：新增 LayerControlPanel.vue、AttributeTable.vue
- `domains/ol/components/`：新增 ControlsPanel.vue、DrawPanel.vue、MeasurePanel.vue、SpatialAnalysisPanel.vue、LogMonitor.vue、AdministrativeDivisionPanel.vue、AdministrativeDivisionTreeNode.vue
- `domains/common/shell/SidePanel.vue`：更新 TOCPanel 引用
- `domains/common/app/HomeView.vue`：更新 ControlsPanel、LogMonitor 引用
- `domains/ol/components/MapContainer.vue`：更新 LayerControlPanel、AttributeTable 引用

### 候选方案对比
1. **仅移动文件，不改 import**（不可行）：旧相对路径在新位置失效
2. **移动文件 + 更新所有 import 为 `@/` alias**（选定）：composables/stores/utils 尚未迁移（Task 4/5 范围），使用 `@/` 作为中转，后续 Task 4/5 再升级为域 alias

### 选定方案与理由
严格按 `Refactor-tasks.md` Task 2 定义执行，移动 11 个文件，更新所有消费方引用。内部 import 使用 `@/` alias（因为被依赖的 composables/stores/utils 仍在旧位置，属于 Task 4/5 迁移范围）。

---

## 修改内容

### 1. 文件迁移（git mv，11 个文件）

| 源路径 | 目标路径 |
|--------|----------|
| `components/Layer/TOCPanel.vue` | `domains/common/layer-tree/components/TOCPanel.vue` |
| `components/Layer/LayerPanel.vue` | `domains/common/layer-tree/components/LayerPanel.vue` |
| `components/Layer/LayerControlPanel.vue` | `domains/ol/layer/components/LayerControlPanel.vue` |
| `components/Layer/AttributeTable.vue` | `domains/ol/layer/components/AttributeTable.vue` |
| `components/ControlsPanel/ControlsPanel.vue` | `domains/ol/components/ControlsPanel.vue` |
| `components/ControlsPanel/DrawPanel.vue` | `domains/ol/components/DrawPanel.vue` |
| `components/ControlsPanel/MeasurePanel.vue` | `domains/ol/components/MeasurePanel.vue` |
| `components/ControlsPanel/SpatialAnalysisPanel.vue` | `domains/ol/components/SpatialAnalysisPanel.vue` |
| `components/ControlsPanel/LogMonitor.vue` | `domains/ol/components/LogMonitor.vue` |
| `components/ControlsPanel/AdministrativeDivisionPanel.vue` | `domains/ol/components/AdministrativeDivisionPanel.vue` |
| `components/ControlsPanel/AdministrativeDivisionTreeNode.vue` | `domains/ol/components/AdministrativeDivisionTreeNode.vue` |

### 2. 消费方 import 更新

| 文件 | 旧值 | 新值 |
|------|------|------|
| `domains/common/shell/SidePanel.vue` | `@/components/Layer/TOCPanel.vue` | `@common/layer-tree/components/TOCPanel.vue` |
| `domains/common/app/HomeView.vue` | `@/components/ControlsPanel/ControlsPanel.vue` | `@ol/components/ControlsPanel.vue` |
| `domains/common/app/HomeView.vue` | `@/components/ControlsPanel/LogMonitor.vue`（动态 import） | `@ol/components/LogMonitor.vue` |
| `domains/ol/components/MapContainer.vue` | `@/components/Layer/LayerControlPanel.vue` | `@ol/layer/components/LayerControlPanel.vue` |
| `domains/ol/components/MapContainer.vue` | `@/components/Layer/AttributeTable.vue` | `@ol/layer/components/AttributeTable.vue` |

### 3. 迁移文件内部 import 更新

所有迁移文件的内部相对路径（`../../composables/`、`../../stores/` 等）已更新为 `@/` alias：

- **TOCPanel.vue**（14 处）：composables、stores、utils、api、services、LayerPanel 等全部更新为 `@/` 或 `@common/` alias
- **LayerControlPanel.vue**（4 处）：api、constants、composables 更新为 `@/`
- **AttributeTable.vue**（3 处）：stores、utils、composables 更新为 `@/`
- **LayerPanel.vue**（1 处）：stores 更新为 `@/`
- **ControlsPanel.vue**（3 处）：composables、stores、constants 更新为 `@/`
- **DrawPanel.vue**（2 处）：composables 更新为 `@/`
- **MeasurePanel.vue**（1 处）：composables 更新为 `@/`
- **SpatialAnalysisPanel.vue**（2 处）：utils、composables 更新为 `@/`
- **LogMonitor.vue**（1 处）：api 更新为 `@/`

### 4. 操作后删除

- `components/Layer/` 目录已清空并删除
- `components/ControlsPanel/` 目录已清空并删除

---

## 修改原因

- **架构一致性**：Phase 6 遗留的 Layer/ControlsPanel 组件完成迁移，`components/` 目录不再承担领域 UI 职责
- **依赖方向正确**：`common/layer-tree` 承接跨引擎 TOC UI，`ol/layer` 承接 OL 专属图层 UI，`ol/components` 承接 OL 专属控制 UI
- **收尾 Phase 6**：v3492 日志明确将此迁移列为「待后续 Phase 统一迁移」

---

## 影响分析

- **行为无变化**：纯路径迁移，业务逻辑零修改
- **构建影响**：所有内部 import 已更新为 `@/` alias，不引入新的构建错误
- **遗留风险**：构建仍失败于 `App.vue` 引用 `./stores/useThemeStore`（文件不存在），这是并行会话（Task 5 stores 迁移）导致的预存问题，非本任务范围

---

## 性能影响

无。纯路径迁移，运行时行为与包体大小不变。

---

## 测试计划

- [x] `npm run build`：Task 2 相关文件无新错误；预存 `useThemeStore` 错误非本任务范围
- [ ] `npm run dev` 实机验证：
  - TOC 工具箱面板（TOCPanel）渲染、标签切换、图层操作
  - 底图切换面板（LayerControlPanel）底图选择、高清渲染、图层管理
  - 属性表（AttributeTable）打开、最小化、关闭、CSV 导出
  - 控制面板（ControlsPanel）菜单切换、绘制/测量/空间分析子面板
  - 日志监控（LogMonitor）显示、滚动锁定、类型切换
  - 行政区划面板（AdministrativeDivisionPanel）搜索、选择、展开/收起

注：构建通过（除预存 useThemeStore 错误）；实机功能验证留待用户合并后执行。

---

## 文件清单

### 迁移（git mv，11 个文件）
- `frontend/src/domains/common/layer-tree/components/TOCPanel.vue`
- `frontend/src/domains/common/layer-tree/components/LayerPanel.vue`
- `frontend/src/domains/ol/layer/components/LayerControlPanel.vue`
- `frontend/src/domains/ol/layer/components/AttributeTable.vue`
- `frontend/src/domains/ol/components/ControlsPanel.vue`
- `frontend/src/domains/ol/components/DrawPanel.vue`
- `frontend/src/domains/ol/components/MeasurePanel.vue`
- `frontend/src/domains/ol/components/SpatialAnalysisPanel.vue`
- `frontend/src/domains/ol/components/LogMonitor.vue`
- `frontend/src/domains/ol/components/AdministrativeDivisionPanel.vue`
- `frontend/src/domains/ol/components/AdministrativeDivisionTreeNode.vue`

### 修改（import 更新，9 个文件）
- `frontend/src/domains/common/shell/SidePanel.vue` — 1 处 import
- `frontend/src/domains/common/app/HomeView.vue` — 2 处 import
- `frontend/src/domains/ol/components/MapContainer.vue` — 2 处 import
- `frontend/src/domains/common/layer-tree/components/TOCPanel.vue` — 14 处 import
- `frontend/src/domains/common/layer-tree/components/LayerPanel.vue` — 1 处 import
- `frontend/src/domains/ol/layer/components/LayerControlPanel.vue` — 4 处 import
- `frontend/src/domains/ol/layer/components/AttributeTable.vue` — 3 处 import
- `frontend/src/domains/ol/components/ControlsPanel.vue` — 3 处 import
- `frontend/src/domains/ol/components/DrawPanel.vue` — 2 处 import
- `frontend/src/domains/ol/components/MeasurePanel.vue` — 1 处 import
- `frontend/src/domains/ol/components/SpatialAnalysisPanel.vue` — 2 处 import
- `frontend/src/domains/ol/components/LogMonitor.vue` — 1 处 import

### 删除（空目录）
- `frontend/src/components/Layer/`
- `frontend/src/components/ControlsPanel/`

### 文档
- `README.md` — 版本 V3.4.96 → V3.4.97（3 处：项目简介、版本表、页脚）
- `Docs/Guide/CHANGELOG.md` — 新增 V3.4.97 条目
- `Docs/Guide/frontend-structure.md` — 同步更新结构树
- `Docs/LLM_record/26-07/2026-07-29/2026-07-29-v3497-task2-layer-controls-panel-migration.md` — 本文件

---

## 遗留与风险

1. **预存构建错误**：`App.vue` 引用 `./stores/useThemeStore` 不存在，来自并行会话（Task 5 stores 迁移），非本任务范围
2. **并行会话冲突风险**：多会话同时修改 `HomeView.vue`、`MapContainer.vue`，合并时可能需解决冲突
3. **`usePositionCodeTool` 仍使用 `@/composables/map`**：Task 1 未清除旧目录，暂保持；待 Task 1 收尾后更新为 `@ol/utils/usePositionCodeTool`
4. **未执行 git commit**：按 Force_command.md 规定，版本控制决策权归用户
