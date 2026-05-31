# TOC 功能增强日志

## 日期和时间
2026-05-27 21:00

## 修改内容
本次任务完成了 TOC（图层目录）系统的 4 项功能增强：
1. **图层重命名** - 支持双击图层名称进行重命名
2. **透明度控制** - 右键菜单中添加透明度滑块，实时调整图层透明度
3. **图层属性对话框** - 右键菜单中添加"图层属性"选项，显示图层详细信息
4. **TOC 搜索过滤** - 在图层目录顶部添加搜索框，支持按名称实时过滤图层

## 修改原因
原有 TOC 系统功能较为基础，缺少图层管理的常用操作。用户反馈需要更便捷的图层管理方式，特别是重命名、透明度调整和快速搜索功能，以提升工作效率。

## 影响范围
- **前端组件**：TOCPanel.vue, LayerPanel.vue, TOCTreeItem.vue, LayerPropertiesDialog.vue (新建)
- **状态管理**：useLayerStore.ts (新增 renameLayer 方法)
- **事件处理**：HomeView.vue (新增 rename-layer 事件处理)
- **菜单系统**：protocol.js, contextMenu.js, commandDispatcher.js (新增菜单项和命令)

## 优化解决方案

### 1. 图层重命名
- **实现方式**：双击图层名称触发重命名模式，显示输入框
- **事件流**：TOCTreeItem → rename-layer 事件 → TOCPanel → HomeView → layerStore.renameLayer()
- **数据更新**：直接修改 store 中的 layer.name 和 layer.displayName

### 2. 透明度控制
- **实现方式**：右键菜单中添加 range 滑块 (0-1, step 0.05)
- **事件流**：TOCTreeItem → change-layer-opacity 事件 → TOCPanel → HomeView → MapContainer.setUserLayerOpacity()
- **实时反馈**：滑块拖动时实时显示百分比

### 3. 图层属性对话框
- **实现方式**：新建 LayerPropertiesDialog 组件，使用 teleport 渲染到 body
- **显示内容**：图层名称、ID、几何类型、数据来源、要素数量、坐标系、中心坐标、范围、可见性、透明度、数据格式
- **事件流**：TOCTreeItem → show-layer-properties 事件 → TOCPanel 直接打开对话框

### 4. TOC 搜索过滤
- **实现方式**：在 LayerPanel 顶部添加搜索输入框
- **过滤逻辑**：递归匹配图层名称，文件夹匹配时保留所有子节点
- **用户体验**：搜索时自动展开文件夹，显示匹配结果数量

## 性能指标
- 搜索过滤：实时响应，无明显延迟
- 透明度调整：通过 OL 原生 API，毫秒级响应
- 重命名操作：直接 store 更新，即时生效

## 测试方案
1. **图层重命名**：双击图层名称 → 输入新名称 → 回车确认 → 验证名称更新
2. **透明度控制**：右键图层 → 拖动透明度滑块 → 验证地图图层透明度变化
3. **图层属性**：右键图层 → 点击"图层属性" → 验证对话框显示正确信息
4. **搜索过滤**：输入关键词 → 验证图层列表实时过滤 → 清空搜索 → 验证恢复完整列表

## 修改的文件路径
1. `frontend/src/components/TOCPanel.vue` - 添加事件处理和属性对话框
2. `frontend/src/components/LayerPanel.vue` - 添加搜索过滤功能
3. `frontend/src/components/TOCTreeItem.vue` - 添加重命名和透明度 UI
4. `frontend/src/components/LayerPropertiesDialog.vue` - 新建属性对话框组件
5. `frontend/src/stores/useLayerStore.ts` - 新增 renameLayer 方法
6. `frontend/src/views/HomeView.vue` - 添加 rename-layer 事件处理
7. `frontend/src/composables/map/toc/protocol.js` - 新增 RENAME, OPACITY, PROPERTIES 命令
8. `frontend/src/composables/map/toc/menu/contextMenu.js` - 添加菜单项
9. `frontend/src/composables/map/toc/menu/commandDispatcher.js` - 添加事件分发
