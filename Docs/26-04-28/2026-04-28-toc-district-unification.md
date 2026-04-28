# 2026-04-28 00:03 - 行政区划并入主 TOC

## 修改内容
- 取消了独立的行政区划 TOC 展示组件，恢复为单一的主 TOC 目录。
- 将行政区划边界数据按 `folder-district` 合并进现有 `useLayerStore.layerTree`，复用 `TOCTreeItem` 的右键菜单、可见性切换、查看/缩放和移除能力。
- 收敛了 HomeView / SidePanel / TOCPanel 的 district 专用事件通道，保留原有 TOC 事件链路。

## 修改原因
- 避免为行政区划重复创建独立面板和独立操作逻辑。
- 让行政区划成为现有图层目录中的标准图层分组，和其它图层统一管理。
- 保持项目中已有 TOC 右键菜单、批量选择和操作分发逻辑可复用。

## 影响范围
- 前端 TOC 树结构与图层目录展示
- 行政区划边界加载后的元数据同步与可见性管理
- HomeView / SidePanel / TOCPanel / LayerPanel / useLayerStore / DistrictManager

## 修改文件
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\useLayerStore.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\HomeView.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\LayerPanel.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\TOCPanel.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\SidePanel.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MapContainer.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\services\DistrictManager.ts
- d:\Dev\GitHub\WebGIS_Dev\README.md
- d:\Dev\GitHub\WebGIS_Dev\frontend\README.md
- d:\Dev\GitHub\WebGIS_Dev\backend\README.md
