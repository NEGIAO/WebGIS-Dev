# 卷帘分析 - 双底图对比功能使用指南

## 功能概述

通过"卷帘分析"功能，用户可以同时加载两个不同的在线底图，并通过可拖拽的分割线进行实时对比分析。

## 使用步骤

### 1. 启动卷帘分析

- 点击左侧侧栏的 **"卷帘分析"** 按钮（标有 `LayoutGrid` 图标）
- 系统会弹出底图选择对话框

### 2. 选择左侧底图

- 在对话框中选择"左侧底图"下拉菜单
- 支持的底图类型：
  - 天地图（矢量、影像、地形等）
  - Google地图
  - OpenStreetMap
  - 其他自定义底图

### 3. 选择右侧底图

- 在对话框中选择"右侧底图"下拉菜单
- **重要**：左右底图必须不同，否则无法启用
- 建议选择：
  - 左侧：矢量图（查看边界和标注）
  - 右侧：卫星图（查看地表特征）

### 4. 选择滑动模式

- **水平 (↔)**：从左到右拖拽分割线
- **竖直 (↕)**：从上到下拖拽分割线

### 5. 启用对比

- 点击"启用对比"按钮
- 系统会加载两个底图并显示可拖拽的分割线

## 交互方式

### 拖拽分割线

- 在地图上的分割线处点击并拖动
- 实时查看两个底图的对比效果
- 观察开发者工具 Network 标签，可看到两个底图分别发送的网络请求

### 模式切换

- 点击分割线上的模式切换按钮（圆形按钮）
- 在水平和竖直模式之间切换

### 关闭卷帘分析

- 点击分割线上的关闭按钮（×）
- 或再次点击侧栏的"卷帘分析"按钮
- 系统会移除第二底图Layer，恢复单底图显示

## 网络请求验证

### 打开开发者工具

1. 按 `F12` 打开开发者工具
2. 切换到 **Network** 标签
3. 勾选 **Img** 过滤器查看瓦片请求

### 观察双请求

- 拖拽分割线时，应该能看到两条不同的瓦片请求
- 左侧底图的瓦片 URL
- 右侧底图的瓦片 URL

### 示例 URL 格式

**天地图矢量底图**：
```
https://t0.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&...
```

**天地图卫星底图**：
```
https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&...
```

## 常见问题

### Q: 对话框没有弹出？
A: 确保地图已完全加载。如果问题持续，尝试刷新页面。

### Q: 选择相同的底图提示错误？
A: 这是设计的。必须选择不同的底图进行对比。

### Q: 看不到分割线？
A: 
- 检查是否成功点击了"启用对比"按钮
- 尝试刷新页面后重新操作
- 检查浏览器控制台是否有错误信息

### Q: 网络请求没有显示？
A: 
- 确保 DevTools 的 Network 标签打开且在加载新瓦片时观察
- 移动分割线时瓦片应该重新加载

### Q: 可以使用自定义底图吗？
A: 可以。在"选择底图"下拉菜单中选择"custom"，输入自定义 URL 即可。

## 性能建议

- 卷帘分析会同时加载两个底图，请确保网络连接良好
- 移动分割线时网络流量会增加
- 建议在 4G 或 WiFi 网络下使用

## 技术实现细节

### 架构

```
ControlsPanel
    ↓ (emit: enable-basemap-swipe)
HomeView  
    ↓ (调用)
MapContainer.enableBasemapSwipe()
    ├─ 创建第二底图Layer (__swipe_compare_layer__)
    ├─ 配置source为右侧底图
    └─ 启用Map Swipe Canvas裁剪效果
    
Map Swipe (useMapSwipe)
    ├─ prerender事件：Canvas裁剪矩形
    ├─ postrender事件：恢复Canvas状态
    └─ 实时更新分割线位置
```

### 关键类和方法

- **ControlsPanel.confirmSwipeConfig()**: 验证用户输入，emit事件
- **HomeView.handleEnableBasemapSwipe()**: 事件处理中心
- **MapContainer.enableBasemapSwipe()**: 创建Layer和启用Swipe
- **useMapSwipe.attachToLayers()**: Canvas级别的裁剪实现

## 调试步骤

### 检查Layer是否创建

在浏览器控制台执行：
```javascript
// 获取Map实例
const map = window.__mapInstance; // 需要确保已暴露

// 查看所有Layer
console.log(map.getLayers().getArray());

// 查找swipe对比Layer
const swipeLayer = map.getLayers().getArray().find(l => l.get('name') === '__swipe_compare_layer__');
console.log('Swipe Layer:', swipeLayer);
```

### 检查Swipe配置

```javascript
// 查看layerStore的swipeConfig
import { useLayerStore } from '@/stores/useLayerStore';
const store = useLayerStore();
console.log('Swipe Config:', store.swipeConfig);
```

### 启用调试日志

在MapContainer中搜索 `[MapContainer]` 标签的console输出。

## 预期效果

✅ 点击"卷帘分析"后，弹出选择对话框
✅ 对话框中能选择不同的底图
✅ 点击"启用对比"后，地图上显示两个底图
✅ 可拖拽分割线实时对比
✅ DevTools Network中能看到双重瓦片请求
✅ 模式切换正常工作
✅ 关闭后正确清理资源

---

**更新时间**: 2026-05-02
**功能版本**: 1.0
**支持的地图引擎**: OpenLayers 6+
