# 卷帘分析调试指南

## 问题症状
- 点击"卷帘分析"后报错：主底图Layer不存在
- 没有看到分割线
- 没有网络请求

## 调试步骤

### 步骤 1: 验证地图初始化

1. 打开开发者工具 (F12)
2. 切换到 Console 标签
3. 等待地图加载完成
4. 执行以下代码检查底图Layer：

```javascript
// 获取MapContainer实例
const mapContainer = document.querySelector('[id="map-container"]');
console.log('MapContainer:', mapContainer);

// 通过Vue获取组件实例
// 这可能需要访问Vue DevTools，或者在控制台注入获取方式
```

### 步骤 2: 使用提供的DevTools检查

在开发者工具Console中执行：

```javascript
// 尝试访问全局变量（如果项目中暴露了）
if (window.__map) {
    const layers = window.__map.getLayers().getArray();
    console.log('All layers:', layers.map(l => ({
        name: l.get('name'),
        type: l.constructor.name,
        hasTile: !!l.getSource?.()?.getTile
    })));
}
```

### 步骤 3: 检查完整的事件流

1. **打开控制台的Network和Console标签**

2. **点击"卷帘分析"按钮**
   - 应该看到对话框弹出
   - Console中应该有日志输出

3. **查看Console输出**：

```
[handleEnableBasemapSwipe] Received payload: { leftBasemap: '...', rightBasemap: '...', mode: '...' }
[handleEnableBasemapSwipe] Calling mapContainerRef.enableBasemapSwipe
[enableBasemapSwipe] Starting with: { leftBasemapId: '...', ... }
[enableBasemapSwipe] All layers count: X
[enableBasemapSwipe] Main layer found: [layer_name]
[enableBasemapSwipe] Creating source for: [basemap_id]
[enableBasemapSwipe] Source created: XYZ (或其他)
[enableBasemapSwipe] Swipe layer created and inserted at index: Y
[enableBasemapSwipe] Attaching swipe handlers
[useMapSwipe] attachToLayers called with 2 layers
[useMapSwipe] Swipe handlers created
[useMapSwipe] Attaching to layer 0 : [main_layer]
[useMapSwipe] Successfully attached to layer 0
[useMapSwipe] Attaching to layer 1 : __swipe_compare_layer__
[useMapSwipe] Successfully attached to layer 1
[useMapSwipe] Swipe enabled with 2 attached layers
[enableBasemapSwipe] Success!
```

4. **选择底图和模式，点击"启用对比"**

### 步骤 4: 如果看不到日志，检查以下可能

**可能 1: 选择对话框没有弹出**
- 清空浏览器缓存
- 检查是否有JavaScript错误（Console中的红色错误）
- 刷新页面重试

**可能 2: mapContainerRef未正确连接**
```javascript
// 在HomeView中检查mapContainerRef
console.log('mapContainerRef:', mapContainerRef.value);
console.log('enableBasemapSwipe方法:', mapContainerRef.value?.enableBasemapSwipe);
```

**可能 3: enableBasemapSwipe中找不到主Layer**
- 查看"[enableBasemapSwipe] Available TileLayers:"的输出
- 如果没有任何Layer，说明地图初始化有问题
- 如果有Layer但没有getTile方法，说明是矢量Layer而非瓦片Layer

### 步骤 5: 验证network请求

1. 打开Network标签
2. 点击启用卷帘分析
3. 拖拽分割线
4. 应该看到两条不同URL的瓦片请求

**示例请求**：
```
GET https://t0.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX=...&TILEROW=...&TILECOL=...&tk=...

GET https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX=...&TILEROW=...&TILECOL=...&tk=...
```

如果只看到一条请求，说明swipe效果没有生效。

## 常见问题解决

### 问题: "主底图Layer不存在"

**原因 1**: 地图还未完全加载
- **解决**: 等待页面完全加载后再点击卷帘分析

**原因 2**: Layer不是TileLayer类型
- **解决**: 检查LAYER_CONFIGS中的图层定义

**原因 3**: Layer的Source没有getTile方法
- **解决**: 检查是否使用了正确的Source（XYZ、WMTS等）

### 问题: 看到分割线但拖拽无效

**原因**: useMapSwipe的Canvas裁剪没有生效
- **检查**: prerender/postrender事件是否被调用
- **方案**: 在useMapSwipe中添加更多日志

```javascript
// 在prerender中添加
console.log('[prerender] clip applied', { swipeMode: swipeMode.value, position: swipePosition.value });
```

### 问题: 没有看到分割线

**原因**: MapSwipeController组件没有挂载
- **检查**: 
  ```javascript
  // 检查swipeConfig是否为enabled
  console.log('swipeConfig:', layerStore.swipeConfig);
  ```
- **方案**: 确保MapSwipeController在MapContainer中正确显示

## 快速测试命令

将以下代码保存为书签，方便快速测试：

```javascript
javascript:(function() {
    console.log('=== Map Swipe Debug Info ===');
    
    // 检查LayerStore
    console.log('1. LayerStore check:');
    try {
        const { useLayerStore } = window;
        if (useLayerStore) {
            const store = useLayerStore();
            console.log('swipeConfig:', store.swipeConfig);
        }
    } catch(e) {
        console.error('Cannot access useLayerStore');
    }
    
    // 尝试手动启用swipe（仅用于测试）
    console.log('2. Manual swipe enable (for testing):');
    console.log('请在Console执行: mapContainerRef.value?.enableBasemapSwipe?.({ leftBasemapId: "tianditu_vec", rightBasemapId: "tianditu_img", mode: "horizontal" })');
})();
```

## 期望行为

✅ 点击按钮 → 对话框弹出
✅ 选择底图 → Console无错误
✅ 点击启用 → 看到Console日志
✅ 地图显示分割线 → 可拖拽
✅ 拖拽时 → Network中有双重请求

如果任何一步失败，查看上述相应的调试步骤。

---

**关键调试技巧**:
1. 始终打开Console查看错误和日志
2. 使用Network标签验证请求是否成功
3. 逐步检查事件流中的每个环节
4. 查看是否有JavaScript运行时错误
