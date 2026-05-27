# ControlsPanel 组件目录重组

- **日期和时间**：2026-05-27 11:30
- **修改内容**：将 ControlsPanel 及其关联的 5 个子面板组件从 `components/` 根目录移入 `components/ControlsPanel/` 子目录，统一管理左侧控制栏功能域
- **修改原因**：上次任务新增了 DrawPanel、MeasurePanel、SpatialAnalysisPanel 三个子面板，加上原有的 AdministrativeDivisionPanel 和 TreeNode，共 6 个文件散落在 components 根目录。参照项目既有的功能域分组模式（UserCenter/、Cesium/），应归入独立子目录便于维护
- **影响范围**：components/ControlsPanel/ 目录结构、HomeView.vue 导入路径、frontend/README.md 文件结构树
- **优化解决方案**：

## 移动文件清单

| 原路径 | 新路径 |
|--------|--------|
| `components/ControlsPanel.vue` | `components/ControlsPanel/ControlsPanel.vue` |
| `components/DrawPanel.vue` | `components/ControlsPanel/DrawPanel.vue` |
| `components/MeasurePanel.vue` | `components/ControlsPanel/MeasurePanel.vue` |
| `components/SpatialAnalysisPanel.vue` | `components/ControlsPanel/SpatialAnalysisPanel.vue` |
| `components/AdministrativeDivisionPanel.vue` | `components/ControlsPanel/AdministrativeDivisionPanel.vue` |
| `components/AdministrativeDivisionTreeNode.vue` | `components/ControlsPanel/AdministrativeDivisionTreeNode.vue` |

## 导入路径更新

- `HomeView.vue`：`@/components/ControlsPanel.vue` → `@/components/ControlsPanel/ControlsPanel.vue`
- `ControlsPanel.vue` 内部 `./` 导入不受影响（子组件在同一目录）
- `AdministrativeDivisionPanel.vue` 内部 `./AdministrativeDivisionTreeNode.vue` 导入不受影响（同目录）

## 修改的文件路径

| 文件 | 操作 |
|------|------|
| `frontend/src/components/ControlsPanel/` | 新建目录 |
| 6 个 .vue 文件 | 移动到新目录 |
| `frontend/src/views/HomeView.vue` | 更新导入路径 |
| `frontend/README.md` | 更新文件结构树 |
| `Docs/26-05-27/2026-05-27-controlspanel-directory-restructure.md` | 本日志 |

## 测试方案
1. `npm run dev` 启动无报错
2. 左侧控制栏各按钮功能正常
3. 行政区划子面板正常弹出
