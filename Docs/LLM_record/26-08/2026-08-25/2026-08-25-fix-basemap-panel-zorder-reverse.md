# 2026-08-25 图层面板层叠顺序（zIndex）反向修复

## 日期和时间

2026-08-25 10:13

## 修改内容

修复「图层控制面板」（LayerControlPanel）中图层层叠顺序与列表顺序相反的问题：
面板列表顶部的底图/叠加图层，在地图上反而渲染在最底层；现改为面板顶部 = zIndex 最高 = 地图最上层，与用户直觉及 TOC 数据图层的行为保持一致。

## 修改原因

### 事件逻辑链条分析

* **核心症状**：在图层控制面板中拖拽排序 / 右键"移到顶部"后，地图上的实际压盖顺序与面板显示顺序相反——列表最上面的图层最先被其它层盖住。
* **根本原因**：项目中存在两套 zIndex 分配语义，且互不一致：
  1. **TOC 数据托管图层**（`useManagedLayerRegistry.refreshUserLayerZIndex`）：`Z_BAND.DATA + (total - 1 - index)` 反向映射，数组 index 0（列表顶部）拿最高 zIndex —— **正确**；
  2. **底图/叠加列表面板**（`useMapState.refreshLayerInstances` 与 `useBasemapLayerBootstrap.initializeBasemapLayers`）：`zBand + index` 正向映射，index 越大 zIndex 越高；而面板 `v-for="(layer, index) in layerList"` 直接按数组序渲染（index 0 在面板顶部），右键菜单"移到顶部"也是 `dropIndex: 0`。**UI 语义（index 0 = 顶部）与 z 语义（index 大 = 上层）相反 → 层叠顺序颠倒**。
* **受影响模块**：OL 二维底图带（imagery/vector/terrain/theme/custom）与标注带的相对顺序、图层控制面板的拖拽排序与右键置顶/置底功能。TOC 数据图层链路、卷帘对比层（独立 150~199 偏移带）、区划/标注/系统带均不受影响。

## 影响范围

* `frontend/src/domains/ol/composables/useMapState.js`（refreshLayerInstances）
* `frontend/src/domains/ol/basemap/composables/useBasemapLayerBootstrap.js`（initializeBasemapLayers）
* 图层控制面板排序交互的实际渲染效果（行为修正，无 API/持久化格式变更）

## 优化解决方案

1. `refreshLayerInstances`：`targetZIndex` 由 `zBand + index` 改为 `zBand + (layerList.length - 1 - index)` 反向映射，并同步修正注释。
2. `initializeBasemapLayers`：初始创建图层时的 `zIndex` 同步改为反向映射，保证初始化与后续刷新语义一致。
3. 显示带方案（zIndexBands.js SSOT）不变：底图带 0~199、卷帘偏移 150~199、数据带 200~799、标注带 800~899、系统带 900+。常规底图反向映射后最大值仍为 N-1，与原逻辑上界一致，不侵入卷帘带。

## 性能指标

无性能影响：仅改变 zIndex 数值计算方向，调用次数与判断逻辑（值未变化跳过 setZIndex）保持不变。

## 测试方案

1. 启动前端开发服务，打开二维地图与图层控制面板。
2. 同时勾选两个可叠加的底图/自定义图层（如矢量 + 注记 + 自定义 XYZ）。
3. 验证：面板中排最上面的图层在地图上压盖在最顶层；右键"移到顶部"后该层立即变为最上层；拖拽排序后压盖关系实时跟随。
4. 回归验证：TOC 数据图层拖拽排序仍为"顶部 = 最上层"；卷帘左右两侧底图层级正常；标注类底图恒在数据层之上。

## 修改的文件路径

* d:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\ol\composables\useMapState.js
* d:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\ol\basemap\composables\useBasemapLayerBootstrap.js
