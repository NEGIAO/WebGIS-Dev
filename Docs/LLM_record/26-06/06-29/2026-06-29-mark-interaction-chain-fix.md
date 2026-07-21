# 2026-06-29 标注功能事件链路全面修复

## 日期和时间
2026-06-29 15:00

## 修改内容
修复"标注"（逆地理编码选点）功能的 4 个 Bug：重复 Toast、catch 正则遗漏、await 后地图存活校验缺失、选点模式无光标指示。

## 修改原因
用户点击"标注"按钮后，虽然核心功能可用，但存在多个影响用户体验和代码健壮性的问题。

## 影响范围
- 左侧控制面板 ControlsPanel（Toast 消息）
- 地图容器 MapContainer（选点逻辑、光标指示）
- 交互选点 composable（错误传播链路）

## 问题分析（事件逻辑链路）

### 完整事件链路
```
ControlsPanel "标注" click
  ├── emit('open-tab', 'toolbox')              → SidePanel 展开工具箱
  └── emit('map-interaction', 'ReverseGeocodePick')
       → HomeView.handleControlsMapInteraction()
            → MapContainer.activateInteraction('ReverseGeocodePick')
                 → startReverseGeocodePickAndDraw()
                      → startReverseGeocodePick()   [创建 Promise，等待用户点击]
                      → [用户点击地图]
                      → useMapEventHandlers singleclick 解析 {lng, lat}
                      → apiReverseGeocodeWithFallback(lng, lat)
                      → drawPointByCoordinatesInput({lng, lat, properties})
                      → message.success/warning
```

### Bug 1：重复 Toast 消息（中等）
- **症状**：点击标注按钮后同时弹出两个几乎相同的提示
- **根因**：ControlsPanel.vue:288 和 MapContainer.vue:1706 各自调用 `message.info`
- **修复**：删除 ControlsPanel 中的 message.info（MapContainer 的更好：`closable: true`，duration 4500ms）

### Bug 2：catch 正则遗漏"地图已卸载"（中等）
- **症状**：用户在选点等待期间切换页面，组件卸载触发 `disposeAll()` reject "地图已卸载"，catch 正则 `/(取消|cancel)/i` 不匹配，弹出不必要的 warning Toast
- **根因**：useMapInteractionPickers.js:81 reject 消息为 "地图已卸载"，不在正则范围内
- **修复**：正则扩展为 `/(取消|cancel|地图已卸载|地图尚未初始化)/i`

### Bug 3：await 后未校验地图存活（低）
- **症状**：`startReverseGeocodePick()` 等待用户点击可能长达数分钟，期间地图可能已卸载
- **根因**：await 后直接调用 `drawPointByCoordinatesInput` 未检查 `mapInstance.value`
- **修复**：await 后添加 `if (!mapInstance.value) throw new Error('地图已卸载')`

### Bug 4：选点模式无 crosshair 光标（低）
- **症状**：进入选点模式后鼠标样式无变化，用户无从得知当前处于特殊交互模式
- **修复**：添加 `isReverseGeocodePickMode` ref + CSS class `reverse-geocode-pick-mode` + crosshair 样式

## 测试方案
1. 点击"标注"按钮 → 只弹出一个 Toast（MapContainer 的，closable，4.5s）
2. 出现 crosshair 光标，选点完成后光标恢复
3. 选点成功 → 点位绘制 + 逆地理编码属性写入
4. 选点期间切换其他工具 → 无多余 warning
5. 选点期间页面跳转/组件卸载 → 无 warning Toast

## 修改的文件路径
- `frontend/src/components/ControlsPanel/ControlsPanel.vue` — 删除重复 message.info
- `frontend/src/components/Map/MapContainer.vue` — catch 正则扩展 + await 后地图校验 + isReverseGeocodePickMode ref + CSS
