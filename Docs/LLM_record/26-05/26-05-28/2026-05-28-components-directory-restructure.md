# 2026-05-28 Components 目录结构重组

## 日期和时间
2026-05-28 16:00

## 修改内容
将 `frontend/src/components/` 目录下堆积的 29 个顶层 Vue 文件按功能域归入 8 个子目录，清理 3 处死代码，并同步更新所有 import 路径。

## 修改原因
`components/` 目录顶层堆积了 29 个 Vue 文件，缺乏分类，导致：
- 新人难以定位组件
- 功能相关的组件散落各处，修改一个功能需要在多个文件间跳转
- 同类组件（如 Layer 相关的 6 个文件）没有聚合，违反了项目自身已建立的 `Cesium/`、`ControlsPanel/` 组织模式

## 影响范围
- 前端组件目录结构
- 所有引用被移动组件的 import 路径（约 30 处）
- 无功能变更，纯结构性重构

## 优化解决方案

### 1. 清理死代码
- 删除 `components/FloatingAccountPanel.vue`：旧版本，全项目无引用，`UserCenter/` 版本是正式版
- 删除 `components/icons/` 目录：5 个 Vue CLI 脚手架残留组件，全项目无引用

### 2. 创建 8 个功能子目录

```
components/
  Cesium/                  (不变)
  ControlsPanel/           (不变，已含 LogMonitor.vue)
  UserCenter/              (不变)
  feng-shui-compass-svg/   (不变)
  Layer/                   ← 图层管理系统 (7 个文件)
  Map/                     ← 地图核心与控制器 (5 个文件)
  Routing/                 ← 路线规划 (3 个文件)
  Search/                  ← 搜索与数据注入 (2 个文件)
  Weather/                 ← 天气面板 (1 个文件)
  Chat/                    ← AI 聊天助手 (1 个文件)
  Compass/                 ← 罗盘控制面板 (2 个文件)
  Shell/                   ← 应用壳层/全局 UI (6 个文件)
```

### 3. 文件移动清单

| 目标目录 | 移入的文件 |
|---------|-----------|
| `Layer/` | TOCPanel.vue, LayerPanel.vue, TOCTreeItem.vue, LayerControlPanel.vue, LayerPropertiesDialog.vue, AttributeTable.vue, SharedResourceTreeItem.vue |
| `Map/` | MapContainer.vue, MapControlsBar.vue, MapSwipeController.vue, MapDownloader.vue, MapEasterEgg.vue |
| `Routing/` | BusPlannerPanel.vue, DrivingPlannerPanel.vue, MapPointPickerCard.vue |
| `Search/` | LocationSearch.vue, AmapAoiInjectDialog.vue |
| `Weather/` | WeatherChartPanel.vue |
| `Chat/` | ChatPanelContent.vue |
| `Compass/` | CompassControlPanel.vue, PalaceExplanationPanel.vue |
| `Shell/` | TopBar.vue, SidePanel.vue, GlobalLoading.vue, Message.vue, PersistentAnnouncementBar.vue, MagicCursor.vue |

### 4. Import 路径更新
- 所有被移动组件内部的 `../` 外部引用更新为 `../../`
- 所有引用被移动组件的外部文件更新为新路径
- 包含动态 `import()` 的同步更新

## 测试方案
- **环境**：本地 Vite 构建
- **步骤**：执行 `npx vite build`
- **结果**：构建成功 (3140 modules transformed, 22.67s)，无编译错误

## 修改的文件路径

### 删除
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\FloatingAccountPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\icons\` (整个目录)

### 移动 (27 个 Vue 文件)
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\TOCPanel.vue` → `Layer/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\LayerPanel.vue` → `Layer/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\TOCTreeItem.vue` → `Layer/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\LayerControlPanel.vue` → `Layer/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\LayerPropertiesDialog.vue` → `Layer/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\AttributeTable.vue` → `Layer/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\SharedResourceTreeItem.vue` → `Layer/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MapContainer.vue` → `Map/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MapControlsBar.vue` → `Map/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MapSwipeController.vue` → `Map/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MapDownloader.vue` → `Map/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MapEasterEgg.vue` → `Map/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\BusPlannerPanel.vue` → `Routing/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\DrivingPlannerPanel.vue` → `Routing/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MapPointPickerCard.vue` → `Routing/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\LocationSearch.vue` → `Search/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\AmapAoiInjectDialog.vue` → `Search/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\WeatherChartPanel.vue` → `Weather/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\ChatPanelContent.vue` → `Chat/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\CompassControlPanel.vue` → `Compass/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\PalaceExplanationPanel.vue` → `Compass/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\TopBar.vue` → `Shell/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\SidePanel.vue` → `Shell/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\GlobalLoading.vue` → `Shell/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Message.vue` → `Shell/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\PersistentAnnouncementBar.vue` → `Shell/`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MagicCursor.vue` → `Shell/`

### 修改 import 路径的文件
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\App.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\HomeView.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\useMessage.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Layer\TOCPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Layer\TOCTreeItem.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Layer\LayerPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Layer\LayerControlPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Layer\AttributeTable.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Map\MapContainer.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Map\MapControlsBar.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Map\MapDownloader.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Routing\BusPlannerPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Routing\DrivingPlannerPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Search\LocationSearch.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Search\AmapAoiInjectDialog.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Weather\WeatherChartPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Chat\ChatPanelContent.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Compass\CompassControlPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Compass\PalaceExplanationPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Shell\TopBar.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Shell\SidePanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Shell\GlobalLoading.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Shell\Message.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Shell\PersistentAnnouncementBar.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Shell\MagicCursor.vue`
