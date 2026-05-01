# WebGIS_Dev 图层切换系统详细分析报告

## 📋 目录
1. [核心函数概览](#核心函数概览)
2. [详细函数分析](#详细函数分析)
3. [调用关系图](#调用关系图)
4. [异步操作流程](#异步操作流程)
5. [潜在问题分析](#潜在问题分析)

---

## 核心函数概览

### 系统架构图
```
用户界面事件
    ↓
LayerControlPanel (@change-layer)
    ↓
handleLayerChange (createLayerControlHandlers)
    ↓
scheduleBasemapSelection (300ms 防抖)
    ↓
selectedLayerRef.value = layerId (更新 ref)
    ↓
watch(selectedLayerRef) (Vue 响应式监听)
    ↓
bindBasemapSelectionWatcher (createBasemapSelectionWatcher)
    ↓
runLayerSwitch (异步切换流程)
    ├─ releasePreviousLayerSources
    ├─ switchLayerById (useMapState)
    ├─ validateBaseLayerSwitch (容灾验证)
    └─ 自动兜底/回滚逻辑
```

---

## 详细函数分析

### 1️⃣ createLayerControlHandlers - 事件处理入口

**文件**: [useLayerControlHandlers.js](src/composables/map/features/useLayerControlHandlers.js)

**核心职责**:
- 响应 LayerControlPanel 的用户交互事件
- 处理底图切换、自定义 URL 加载、图层排序/显隐/透明度更新

**导出函数**:
```javascript
{
  loadCustomMap,          // 加载用户输入的 URL
  handleLayerChange,      // 统一处理底图切换和自定义 URL
  handleLayerOrderUpdate   // 处理图层排序、显隐、透明度
}
```

**核心逻辑流程**:

#### handleLayerChange
```
接收事件 payload { layerId, customUrl, source }
    ↓
if layerId:
    scheduleBasemapSelection(layerId)
        ↓
    [防抖 300ms]
        ↓
    applyBasemapSelection(layerId)
        ↓
    selectedLayerRef.value = normalizedLayerId
    (触发 Vue watch 响应)
        ↓
if source === 'custom-url':
    customMapUrlRef.value = customUrl
        ↓
    void loadCustomMap()
        ↓
    [异步加载]
```

**防抖机制**:
```javascript
BASEMAP_SWITCH_DEBOUNCE_MS = 300ms
basemapSwitchTimer: 取消上一次、启动新定时器
```

**关键数据流**:
- Input: `payload = { layerId, customUrl, source }`
- Output: 修改 `selectedLayerRef.value` (触发 watch 监听)

**可能的问题**:
- ⚠️ 没有检查 layerId 的有效性（空字符串被 trim 后可能仍为空）
- ⚠️ 防抖期间的多次切换可能导致最后一次切换被延迟

---

#### loadCustomMap (异步)
```
验证 customMapUrlRef.value
    ↓
detected = await createAutoTileSourceFromUrl(url)
    [检测类型: XYZ / 非标准XYZ / WMS / WMTS]
    ↓
customLayer = layerInstances.custom
    ↓
customLayer.setSource(detected.source)
    ↓
target.visible = true
    ↓
refreshLayersState()
    ↓
message.success()
```

**异步操作点**: `await createAutoTileSourceFromUrl()`
**等待点**: 图源检测完成

**错误处理**:
```javascript
catch (error) {
  const errorMessage = error instanceof Error ? error.message : '...';
  message.error(`加载自定义图源失败: ${errorMessage}`);
}
```

---

#### handleLayerOrderUpdate
```
type = 'reorder':
    验证索引 → list.splice() → refreshLayersState()

type = 'visibility':
    item.visible = !!payload.visible → refreshLayersState()

type = 'opacity':
    验证范围 [0, 1] → item.opacity = value → refreshLayersState()
```

---

### 2️⃣ createBasemapSelectionWatcher - 响应式监听和切换

**文件**: [useBasemapSelectionWatcher.js](src/composables/map/features/useBasemapSelectionWatcher.js)

**核心职责**:
- 监听 `selectedLayerRef` 变化
- 执行图层切换、验证、兜底降级
- 管理电路断路器（Circuit Breaker）机制

**导出函数**:
```javascript
{
  bindBasemapSelectionWatcher,  // 绑定 Vue watch
  resetBasemapChain              // 重置链路和故障状态
}
```

**内部状态管理**:
```javascript
let isAutoSwitchingLayer = false;        // 自动降级标志
let switchTimer = null;                  // 定时器
let switchSeq = 0;                       // 序列号（防止竞态条件）

const failureStateMap = new Map();       // 层级 -> { failures, circuitOpen }
```

**核心逻辑流程**:

#### bindBasemapSelectionWatcher() - 监听入口
```javascript
return watch(selectedLayerRef, (val, prevVal, onCleanup) => {
    clearSwitchTimer();
    
    if (prevVal === undefined) {
        // 初始化阶段：直接运行
        switchSeq += 1;
        void runLayerSwitch(val, prevVal, switchSeq);
        return;
    }
    
    // 防抖：300ms 延迟后才执行
    switchTimer = setTimeout(() => {
        switchSeq += 1;
        const currentSeq = switchSeq;
        void runLayerSwitch(val, prevVal, currentSeq);
    }, switchDebounceMs);
    
    onCleanup(() => {
        clearSwitchTimer();
    });
}, { immediate: true });
```

**重要参数**:
```javascript
defaultLayerId = 'google'           // 默认底图
validationTimeoutMs = 3000          // 验证超时
switchDebounceMs = 300              // 防抖间隔
circuitBreakThreshold = 3           // 电路断路阈值
```

---

#### runLayerSwitch(val, prevVal, currentSeq) - 切换核心逻辑
```
⏹️ 检查电路断路状态:
    if (circuitOpen) {
        message.warning('当前网络异常，请手动重试')
        if (prevVal !== val) {
            isAutoSwitchingLayer = true
            selectedLayerRef.value = prevVal  // 回滚
        }
        return
    }

🗑️ 释放前一个底图的资源:
    releasePreviousLayerSources(prevVal, val)

⚙️ 执行图层切换:
    switchLayerById(val, {
        onUpdated: () => {
            emitBaseLayersChange()
            if (isAutoSwitchingLayer) {
                setTimeout(() => {
                    mapInstanceRef.value?.updateSize()  // 延迟 50ms
                }, 50)
            }
        }
    })

🌐 同步 URL:
    syncUrlFromMap()

❌ 如果是自动降级阶段，直接返回:
    if (isAutoSwitchingLayer) {
        isAutoSwitchingLayer = false
        return
    }

✅ 验证底图加载状态:
    const result = await validateBaseLayerSwitch(
        val,
        switchedLayer,
        validationTimeoutMs
    )
    
    if (currentSeq !== switchSeq) {
        // 被打断，放弃处理
        return
    }

✨ 成功处理:
    if (result?.success) {
        clearLayerFailure(val)
        message.success('已成功切换到...')
        return
    }

📊 失败处理:
    const failCount = markLayerFailure(val)
    
    if (failCount >= circuitBreakThreshold) {
        message.error('网络异常，请手动重试')
        
        const nextFallback = createBaseLayerFallbackManager(val)
                            .getNextFallbackOption()
        if (nextFallback) {
            isAutoSwitchingLayer = true
            selectedLayerRef.value = nextFallback
            message.info('已自动切换至...')
        }
        return
    }
    
    // 非默认底图的失败只提示，不自动降级
    if (!isDefaultBaseLayer) {
        message.warning('切换失败，请重新选择')
        return
    }
    
    // 默认底图失败，自动尝试兜底
    const nextFallback = createBaseLayerFallbackManager(val)
                        .getNextFallbackOption()
    if (nextFallback) {
        isAutoSwitchingLayer = true
        selectedLayerRef.value = nextFallback
    }
```

**序列号机制（防竞态）**:
- 每次切换时 `switchSeq += 1`
- `runLayerSwitch` 接收 `currentSeq`
- 验证完毕时检查 `currentSeq !== switchSeq`
- 如果不相等，说明被新的切换打断，放弃处理

---

#### releasePreviousLayerSources(previousLayerId, nextLayerId)
```
获取前一个底图堆栈:
    previousStack = resolvePresetLayerIds(previousLayerId) || [previousLayerId]

获取新底图堆栈:
    nextStack = resolvePresetLayerIds(nextLayerId) || [nextLayerId]

计算需要释放的 ID:
    keepSet = Set(nextStack)
    
    previousStack.forEach(id => {
        if (!keepSet.has(id)) {
            releaseLayerSource(id)
        }
    })

作用: 避免图层实例被重复使用时的冲突
```

---

#### resetBasemapChain({ targetLayerId } = {})
```
清空所有状态:
    clearSwitchTimer()
    switchSeq += 1
    isAutoSwitchingLayer = false
    
    failureStateMap.forEach(state => {
        state.failures = 0
        state.circuitOpen = false
    })

释放目标图层的资源:
    targetStack = resolvePresetLayerIds(targetLayerId)
    targetStack.forEach(id => releaseLayerSource(id))

重新切换:
    switchLayerById(targetLayerId, {
        onUpdated: () => {
            emitBaseLayersChange()
            mapInstanceRef.value?.updateSize()
        }
    })

同步 URL:
    syncUrlFromMap()

用户提示:
    message.info('底图链路已重置，请重试底图切换。')
```

**用途**: 
- 从"重置链路"按钮触发
- 清除所有故障累计
- 重新尝试切换

---

### 3️⃣ createBasemapStateManagementFeature - 状态广播

**文件**: [useBasemapStateManagement.js](src/composables/map/features/useBasemapStateManagement.js)

**核心职责**:
- 广播底图列表状态给外部组件
- 刷新 Google 图层源（主机切换后）

**导出函数**:
```javascript
{
  emitBaseLayersChange,      // 广播底图列表状态
  refreshGoogleLayerSources   // 刷新 Google 底图源
}
```

**核心逻辑**:

#### emitBaseLayersChange()
```javascript
emit('base-layers-change', 
  layerList.value.map(item => ({
    id: item.id,
    name: item.name,
    visible: item.visible,
    category: getLayerCategory(item.id),
    group: getLayerGroup(item.id),
    active: selectedLayer.value === item.id
  }))
)

触发时机:
- runLayerSwitch 成功时
- resetBasemapChain 完成时
- 初始化时 (initMap 中)
```

**传递的状态**:
- `id`: 底图层 ID
- `name`: 显示名称
- `visible`: 是否可见
- `category`: 分类（卫星/矢量）
- `group`: 分组（Google/天地图）
- `active`: 是否激活

---

#### refreshGoogleLayerSources()
```javascript
const googleLayerIds = ['google', 'google_standard', 'google_clean']

googleLayerIds.forEach(id => {
    const cfg = LAYER_CONFIGS.find(item => item.id === id)
    const layer = layerInstances[id]
    if (!cfg || !layer) return
    
    layer.setSource(cfg.createSource())
})

触发时机:
- runDeferredStartupTasks 中 Google 主机切换后
```

**用途**: 
- Google 主机测速切换后重建图层源
- 支持多个 Google 变体（标准版、清洁版等）

---

### 4️⃣ createBasemapResilience - 容灾和验证

**文件**: [useBasemapResilience.js](src/composables/map/features/useBasemapResilience.js)

**核心职责**:
- 验证底图切换是否成功
- 监测瓦片加载状态
- 在故障时自动降级到备用底图

**导出函数**:
```javascript
{
  validateBaseLayerSwitch,      // 验证切换成功
  createBaseLayerFallbackManager, // 创建兜底管理器
  monitorLayerTimeout           // 长期监测底图状态
}
```

---

#### validateBaseLayerSwitch(layerId, layer, checkTimeoutMs = 3000)

**异步验证流程**:
```javascript
return new Promise((resolve) => {
    // 1️⃣ 前置检查
    if (!layer) {
        resolve({ success: false, reason: '底图图层实例不存在' })
        return
    }
    
    const source = layer.getSource()
    if (!source) {
        resolve({ success: false, reason: '底图数据源不可用' })
        return
    }
    
    // 2️⃣ 监听瓦片加载事件
    let hasSuccessfulLoad = false
    let hasError = false
    let errorCount = 0
    
    const onTileLoadEnd = () => {
        hasSuccessfulLoad = true  // 至少有一个瓦片加载成功
    }
    
    const onTileLoadError = () => {
        errorCount++
        if (errorCount >= 3) {
            hasError = true  // 连续 3 个瓦片失败
        }
    }
    
    source.on('tileloadend', onTileLoadEnd)
    source.on('tileloaderror', onTileLoadError)
    
    // 3️⃣ 超时检查
    setTimeout(() => {
        source.un('tileloadend', onTileLoadEnd)
        source.un('tileloaderror', onTileLoadError)
        
        if (hasSuccessfulLoad) {
            resolve({ success: true, reason: '切换成功' })
        } else if (hasError) {
            resolve({ success: false, reason: '底图服务异常，多个瓦片加载失败' })
        } else {
            resolve({ success: false, reason: '未能获取底图数据（需梯子或超时）' })
        }
    }, checkTimeoutMs)
})

返回值:
{
  success: boolean,
  reason: string  // 描述信息
}
```

**时间轴**:
```
T=0ms   ──> 监听开始
T=0~3000ms ──> 观察瓦片加载
T=3000ms ──> 超时检查，清除监听，返回结果
```

**判断标准**:
| 状态 | 条件 | 结果 |
|------|------|------|
| ✅ 成功 | 至少 1 个瓦片加载成功 | `{ success: true }` |
| ❌ 服务异常 | 3+ 个瓦片连续失败 | `{ success: false, reason: '服务异常' }` |
| ⏱️ 超时/无网 | 3s 内未加载任何瓦片 | `{ success: false, reason: '未能获取数据' }` |

---

#### createBaseLayerFallbackManager(layerId, isDefaultBaseLayer)

**兜底策略**:
```javascript
const FALLBACK_OPTIONS = ['tianDiTu', 'local']

let fallbackAttempts = 0
const maxFallbackAttempts = FALLBACK_OPTIONS.length

return {
    getNextFallbackOption: () => {
        if (fallbackAttempts >= maxFallbackAttempts) {
            message?.warning(`[底图兜底] ${layerId} 已尝试所有兜底选项`)
            return null
        }
        
        const nextOption = FALLBACK_OPTIONS[fallbackAttempts]
        fallbackAttempts++
        return nextOption
    },
    
    getCurrentFallback: () => lastFallbackKey,
    
    isNotifyOnly: () => !isDefaultBaseLayer,  // 非默认底图只通知，不降级
    
    reset: () => {
        fallbackAttempts = 0
        lastFallbackKey = null
    }
}
```

**兜底流程**:
```
Google 失败 (isDefault=true)
  ↓ getNextFallbackOption()
  ↓ [attempt=1]
  ↓ 返回 'tianDiTu'
  ↓ 尝试切换到天地图
  ↓ 天地图也失败
  ↓ getNextFallbackOption()
  ↓ [attempt=2]
  ↓ 返回 'local'
  ↓ 尝试切换到本地底图
  ↓ 如果本地也失败，getNextFallbackOption()
  ↓ [attempt=2 >= maxAttempts]
  ↓ 返回 null
  ↓ 所有兜底选项已用尽

vs

Google Clean 失败 (isDefault=false, isNotifyOnly=true)
  ↓ 仅显示警告信息
  ↓ 不触发自动降级
  ↓ 用户手动选择底图
```

---

#### monitorLayerTimeout(layer, layerId, isDefaultBaseLayer, callbacks = {})

**长期监测流程**:
```
标记已监测:
    layer.set(`_isTimeoutMonitored_${layerId}`, true)

参数定义:
    MAX_ERRORS = 3              // 最大连续错误数
    ACTIVITY_TIMEOUT = 10000    // 10 秒无活动超时
    WARNING_THRESHOLD = 5       // 5 个错误后警告

状态追踪:
    let loadingTilesCount = 0   // 正在加载的瓦片数
    let consecutiveErrors = 0   // 连续错误数
    let totalErrors = 0         // 总错误数
    let isSwitched = false      // 是否已降级

事件监听:
    source.on('tileloadstart', onTileLoadStart)
    source.on('tileloadend', onTileLoadEnd)
    source.on('tileloaderror', onTileLoadError)

流程:
    onTileLoadStart:
        loadingTilesCount++
        resetActivityTimer()

    onTileLoadEnd:
        loadingTilesCount--
        consecutiveErrors = 0
        
        if (loadingTilesCount <= 0) {
            清除超时定时器
            if (!hasNotifiedSuccess && totalErrors === 0) {
                callbacks.onSuccess()
            }
        }

    onTileLoadError:
        loadingTilesCount--
        consecutiveErrors++
        totalErrors++
        
        if (consecutiveErrors >= 3) {
            switchToBackup('连续错误')
            return
        }
        
        if (totalErrors === 5) {
            message.warning('累计错误5个')
        }

    resetActivityTimer:
        if (loadingTilesCount > 0) {
            定时 10s 后检查是否有新瓦片加载
            if (无) {
                switchToBackup('服务无响应')
            }
        }

自动降级:
    if (failCount >= 3 或 10s 无响应) {
        switchToBackup(reason)
            ↓
        if (isNotifyOnly) {
            仅显示警告
            return
        }
        
        const nextFallback = fallbackManager.getNextFallbackOption()
        if (nextFallback) {
            callbacks.onLayerSwitchRequired(nextFallback, reason)
        }
```

**监测状态机**:
```
[监测中] ─正常─> [监测中]
   ↓              ↑
   ├─3连续错误──> [降级] ─> [已切换]
   ├─10s无响应──> [降级] ─> [已切换]
   └─5总错误───> [警告] ─> [监测中]
```

---

### 5️⃣ switchLayerById (useMapState) - 核心图层切换

**文件**: [useMapState.js](src/composables/useMapState.js#L724)

**核心职责**:
- 执行实际的图层可见性切换
- 处理预设组合（Preset）和单图层模式
- 管理标签图层、卫星图层配对

**函数签名**:
```javascript
function switchLayerById(layerId, {
    layerList = layerListRef?.value,
    instanceMap = layerInstances,
    configs = layerConfigs,
    visibleLayerResolver = resolveVisibleLayerIds,
    satelliteIds = satelliteLayers,
    vectorIds = vectorLayers,
    onUpdated
} = {})
```

**切换逻辑**:

#### 第一步：解析预设组合
```javascript
const resolvedIds = typeof visibleLayerResolver === 'function'
    ? visibleLayerResolver(layerId, { layerList, instanceMap, configs })
    : null

if (Array.isArray(resolvedIds) && resolvedIds.length) {
    // 组合模式：多个图层同时可见
    normalizedResolvedIds = resolvedIds.map(id => String(id))
    const visibleIdSet = new Set(normalizedResolvedIds)
    let matchedCount = 0
    
    layerList.forEach(item => {
        const visible = visibleIdSet.has(item.id)
        if (visible) matchedCount++
        item.visible = visible
    })
    
    // 如果未匹配任何图层，退回单图层模式
    if (matchedCount === 0) {
        // 执行单图层切换逻辑
    }
}
```

#### 第二步：单图层切换
```javascript
layerList.forEach(item => {
    if (item.id === 'label' || item.id === 'label_vector') {
        // 标签层单独处理
        return
    }
    item.visible = item.id === layerId
})

// 根据底图类型配对标签
const needsSatelliteLabel = satelliteIds.includes(layerId)
const labelItem = layerList.find(item => item.id === 'label')
if (labelItem) labelItem.visible = needsSatelliteLabel

const needsVectorLabel = vectorIds.includes(layerId)
const vectorLabelItem = layerList.find(item => item.id === 'label_vector')
if (vectorLabelItem) vectorLabelItem.visible = needsVectorLabel
```

**标签层配对规则**:
```
底图类型         标签图层
────────────────────────
Google/天地图卫  'label' (英文标签)
矢量底图        'label_vector' (中文标签)
```

#### 第三步：刷新图层实例
```javascript
refreshLayerInstances({ layerList, instanceMap, configs })
```

#### 第四步：设置层级（组合模式）
```javascript
if (Array.isArray(normalizedResolvedIds) && normalizedResolvedIds.length && instanceMap) {
    const zIndexBase = layerList.length + 10
    normalizedResolvedIds.forEach((id, index) => {
        const layer = instanceMap[id]
        if (!layer || typeof layer.setZIndex !== 'function') return
        layer.setZIndex(zIndexBase + index)
    })
}
```

**层级分配**:
```
基础 = layerList.length + 10

第一层 (index=0): zIndex = 基础 + 0
第二层 (index=1): zIndex = 基础 + 1
...

例如 layerList.length=5:
  zIndexBase = 15
  第一层 = 15
  第二层 = 16
```

#### 第五步：触发回调
```javascript
if (typeof onUpdated === 'function') {
    onUpdated(layerId)
}
```

---

## 调用关系图

### 完整调用链
```
┌─────────────────────────────────────────────────────────┐
│                   LayerControlPanel                      │
│            (用户 UI 交互事件)                              │
└────────────────────┬────────────────────────────────────┘
                     │ @change-layer / @update-order
                     ↓
        ┌────────────────────────────────┐
        │  createLayerControlHandlers     │
        ├────────────────────────────────┤
        │ handleLayerChange              │
        │ handleLayerOrderUpdate         │
        │ loadCustomMap                  │
        └────────────────┬───────────────┘
                         │
                    [防抖 300ms]
                         │
                         ↓
        ┌────────────────────────────────┐
        │  selectedLayerRef.value = ...  │  ← 修改 Ref
        │  (触发 Vue 响应式系统)          │
        └────────────────┬───────────────┘
                         │
                         ↓
        ┌────────────────────────────────────────────┐
        │  watch(selectedLayerRef, ...)               │
        │  (createBasemapSelectionWatcher)            │
        │                                             │
        │  bindBasemapSelectionWatcher()             │
        └────────────────┬────────────────────────────┘
                         │
                    [防抖 300ms]
                         │
                         ↓
        ┌──────────────────────────────────────────────────┐
        │ async runLayerSwitch(val, prevVal, currentSeq)  │
        │                                                   │
        │ ✅ 电路状态检查                                   │
        │ 🗑️ 释放前一个底图资源                             │
        │ ⚙️ 执行图层切换                                   │
        │ 🌐 同步 URL                                       │
        │ ✔️ 验证底图加载                                   │
        │ 📊 处理失败/自动降级                             │
        └────────────────┬─────────────────────────────────┘
                         │
        ┌────────────────┴──────────────────────┐
        │                                        │
        ↓                                        ↓
   ┌─────────────────────┐         ┌──────────────────────┐
   │ switchLayerById     │         │ validateBaseLayer... │
   │                     │         │                      │
   │ (useMapState)       │         │ (useBasemapResilience)
   │                     │         │                      │
   │ 修改图层可见性      │         │ 验证切换是否成功    │
   │ 刷新图层实例        │         │ 监听瓦片加载事件    │
   │ 设置层级关系        │         │ 3s 超时检查        │
   │ 回调通知            │         │ 返回 success/reason │
   └─────────────────────┘         └──────────────────────┘
        │                                        │
        └────────────────┬─────────────────────┘
                         │
                         ↓
        ┌────────────────────────────────┐
        │  emitBaseLayersChange()        │
        │  (createBasemapStateManagement) │
        │                                 │
        │  emit('base-layers-change')    │
        │  广播到 LayerControlPanel      │
        └────────────────────────────────┘
```

### 关键交互点
```
① handleLayerChange → selectedLayerRef (同步)
② watch → runLayerSwitch (异步/防抖)
③ runLayerSwitch → switchLayerById (同步)
④ runLayerSwitch → validateBaseLayerSwitch (异步/等待)
⑤ 失败处理 → createBaseLayerFallbackManager (同步决策)
⑥ 自动降级 → selectedLayerRef = nextFallback (触发新一轮切换)
⑦ 成功完成 → emitBaseLayersChange → LayerControlPanel 刷新
```

---

## 异步操作流程

### 时间轴分析

```
T=0ms   用户点击底图选项
        │
T=0-300ms 防抖等待中...
        │ (可取消、可中断)
        │
T=300ms 防抖完成
        ├─→ handleLayerChange()
        │   └─→ scheduleBasemapSelection(layerId)
        │       └─→ setTimeout 300ms
        │
T=600ms selectedLayerRef.value 更新
        ├─→ Vue 响应式触发
        │   └─→ watch(selectedLayerRef) 回调
        │
T=600ms 进入 runLayerSwitch
        ├─→ releasePreviousLayerSources()
        │   └─→ 同步完成
        │
        ├─→ switchLayerById()
        │   └─→ 同步完成 (刷新图层可见性)
        │
        ├─→ syncUrlFromMap()
        │   └─→ 同步完成
        │
        ├─→ emitBaseLayersChange()
        │   └─→ 同步完成
        │
T=600-3600ms await validateBaseLayerSwitch()
        ├─→ 监听 tileloadend / tileloaderror 事件
        │   (并发、异步)
        │
        ├─→ 期望结果:
        │   ① 至少 1 个瓦片加载成功 → success=true
        │   ② 3+ 个连续瓦片失败 → success=false, 服务异常
        │   ③ 3s 超时无瓦片 → success=false, 未获取数据
        │
T=3600ms 验证完成
        ├─→ currentSeq === switchSeq? (检查打断)
        │
        ├─→ if success:
        │   └─→ clearLayerFailure(val)
        │       message.success('已成功切换')
        │
        ├─→ else:
        │   ├─→ markLayerFailure(val)
        │   │
        │   ├─→ if failCount >= 3:
        │   │   ├─→ 电路断路
        │   │   ├─→ 自动降级到兜底底图
        │   │   ├─→ isAutoSwitchingLayer = true
        │   │   ├─→ selectedLayerRef.value = nextFallback
        │   │   │   (触发新一轮 watch → runLayerSwitch)
        │   │   └─→ 回到 T=600ms 执行新切换
        │   │
        │   ├─→ else if isDefaultBaseLayer:
        │   │   └─→ 同上 (自动降级)
        │   │
        │   └─→ else:
        │       └─→ 仅提示，不自动降级
        │
        └─→ 结束
```

### 竞态条件 - switchSeq 机制

```
场景：用户快速切换多个底图

T=0ms:      用户选择 Google
            selectedLayerRef.value = 'google'
            switchSeq = 1, currentSeq = 1
            
T=100ms:    validateBaseLayerSwitch('google') 执行中...

T=200ms:    用户选择天地图
            selectedLayerRef.value = 'tianDiTu'
            switchSeq = 2, currentSeq = 2
            runLayerSwitch('tianDiTu', 'google', 2) 开始

T=3500ms:   Google 验证完成，但...
            currentSeq (1) !== switchSeq (2)
            ← 被新切换打断，放弃处理
            
            (天地图验证会正常进行)

作用：确保只有最后一次切换的验证结果会被接受
```

### 自动降级流程时间轴

```
T=0ms:      failCount=0, circuitOpen=false
            validateBaseLayerSwitch 启动

T=1s:       瓦片加载 3 个错误
            failCount=1, errorCount=1

T=2s:       继续加载 2 个错误
            failCount=2, errorCount=2

T=3.2s:     1 个成功 → result.success=false (之前 3 个错误)
            failCount=3 (总累计)
            circuitOpen=true
            ↓
            自动降级逻辑启动:
            const nextFallback = fallbackManager.getNextFallbackOption()
            ↓ 返回 'tianDiTu'
            ↓
            isAutoSwitchingLayer = true
            selectedLayerRef.value = 'tianDiTu'
            
T=3.2-3.6s: 新的 runLayerSwitch('tianDiTu', 'google', 2)
            ├─→ isAutoSwitchingLayer=true，所以:
            │   switchLayerById() 不会打印成功消息
            │   validateBaseLayerSwitch() 跳过 (isAutoSwitchingLayer=false)
            │   
            └─→ 天地图验证开始...

T=6.6s:     天地图验证完成
            假设成功:
            ├─→ clearLayerFailure('tianDiTu')
            ├─→ failureStateMap.clear()
            ├─→ 后续选择其他底图时 circuitOpen 会重置
```

---

## 潜在问题分析

### 🔴 高优先级问题

#### 1. **竞态条件：验证过程中的状态变化**
```javascript
// ❌ 问题场景
T=0ms:  validateBaseLayerSwitch('google', ...) 启动 (checkTimeoutMs=3000)
        source.on('tileloadend', onTileLoadEnd)
        source.on('tileloaderror', onTileLoadError)
        
T=100ms: 用户选择其他底图
        releaseLayerSource('google')  // ← 清空数据源
        source.setSource(null)
        
T=2500ms: 之前的验证还在监听中
        但数据源已被销毁
        tileloadend / tileloaderror 事件无法触发
        
T=3000ms: setTimeout 超时
        source.un(...) 可能失败 (null source)
        返回 { success: false, reason: '未能获取数据' }

✅ 解决方案:
- 在 releasePreviousLayerSources 之前检查是否有进行中的验证
- 在 releaseLayerSource 时自动 abort 相关的验证 Promise
- 添加 AbortController 用于取消进行中的验证
```

---

#### 2. **自动降级触发后的二次验证问题**
```javascript
// ❌ 问题代码
if (isAutoSwitchingLayer) {
    isAutoSwitchingLayer = false
    return  // ← 跳过验证
}

const result = await validateBaseLayerSwitch(val, switchedLayer, validationTimeoutMs)

// ❌ 问题：
// 自动降级时设置 isAutoSwitchingLayer=true
// 切换到兜底底图后，runLayerSwitch 中：
//   1. 直接返回，不执行验证
//   2. 下次切换时 isAutoSwitchingLayer=false
//   3. 才开始验证
//
// 这导致：
// - 第一次降级后的底图没有被验证
// - 如果兜底底图也是坏的，不会继续降级
// - 用户看到的可能是"已切换"，但实际加载失败

✅ 改进方案:
const result = await validateBaseLayerSwitch(val, switchedLayer, validationTimeoutMs)

// 即使是自动切换，也要验证
// 如果验证失败，继续降级
if (!result?.success && isAutoSwitchingLayer) {
    const nextFallback = createBaseLayerFallbackManager(val)
                        .getNextFallbackOption()
    if (nextFallback) {
        isAutoSwitchingLayer = true
        selectedLayerRef.value = nextFallback
    }
}
```

---

#### 3. **Ref 改变触发多次 watch**
```javascript
// ❌ 问题代码
function applyBasemapSelection(layerId) {
    if (!normalizedLayerId || !selectedLayerRef) return
    selectedLayerRef.value = normalizedLayerId  // ← 每次都设置
}

// 即使 layerId 相同，也会触发 watch
watch(selectedLayerRef, (val, prevVal) => {
    // 即使 val === prevVal（在 handleLayerChange 中），
    // watch 仍会被触发
})

// ❌ 问题场景：
// 用户点击当前已选中的底图
// handleLayerChange('google')
// selectedLayerRef.value = 'google'  (已经是 'google')
// watch 触发，prevVal='google', val='google'
// 浪费验证资源

✅ 改进方案:
function applyBasemapSelection(layerId) {
    const normalizedLayerId = String(layerId || '').trim()
    if (!normalizedLayerId || !selectedLayerRef) return
    
    if (selectedLayerRef.value === normalizedLayerId) {
        return  // ← 不重复设置
    }
    
    selectedLayerRef.value = normalizedLayerId
}
```

---

#### 4. **failureStateMap 内存泄漏**
```javascript
// ❌ 问题代码
const failureStateMap = new Map()

function getFailureState(layerId) {
    if (!failureStateMap.has(layerId)) {
        failureStateMap.set(layerId, {
            failures: 0,
            circuitOpen: false
        })
    }
    return failureStateMap.get(layerId)
}

// ❌ 问题：
// failureStateMap 永远不会被清理
// 如果用户切换 100+ 个底图，Map 会持续增长
// 即使某个底图永远不再使用，状态也保留在内存中

✅ 改进方案:
- 定期清理（如在 resetBasemapChain 中）
- 限制 Map 大小（如最多保留 50 个最近使用的底图）
- 组件卸载时清空 Map
```

---

### 🟡 中等优先级问题

#### 5. **防抖抖动导致的多次验证**
```javascript
// 防抖配置
switchDebounceMs = 300

// ❌ 问题：
// 用户快速连击 3 次底图按钮，间隔 150ms
// 防抖会取消前两次，只执行第三次
// 但每次取消时已经执行过的 runLayerSwitch 无法中止
// 导致多个验证并发进行

示例时间线：
T=0ms:      点击 Google
            scheduleBasemapSelection('google')
            → setTimeout 300ms

T=150ms:    点击天地图
            clearTimeout() ← 取消上一个
            scheduleBasemapSelection('tianDiTu')
            → setTimeout 300ms

T=300ms:    点击 Esri
            clearTimeout() ← 取消上一个
            scheduleBasemapSelection('esri')
            → setTimeout 300ms

T=600ms:    防抖完成，执行 applyBasemapSelection('esri')
            selectedLayerRef.value = 'esri'
            watch 触发，runLayerSwitch('esri', ..., seq=1)

T=600-3600ms: validateBaseLayerSwitch('esri') 验证中

✅ 改进方案:
// 使用序列号，在 watch 中也进行 skip check
function bindBasemapSelectionWatcher() {
    return watch(selectedLayerRef, (val, prevVal, onCleanup) => {
        const currentSeq = ++switchSeq
        const targetSeq = currentSeq
        
        onCleanup(() => {
            // 组件卸载时也要 abort
            abortValidation(targetSeq)
        })
        
        switchTimer = setTimeout(async () => {
            // 再次检查 currentSeq
            if (currentSeq !== switchSeq) {
                return  // 已被打断
            }
            
            await runLayerSwitch(val, prevVal, currentSeq)
        }, switchDebounceMs)
    })
}
```

---

#### 6. **网络超时后的用户体验**
```javascript
// validateBaseLayerSwitch 超时 3s
// 用户需要等待 3s 才能看到失败提示

// ❌ 问题：
// - 3s 太长，用户可能认为卡住了
// - 如果是前置检查失败（如 source 不存在），立即返回，但需要 await 3s

✅ 改进方案:
const validateBaseLayerSwitch = async (layerId, layer, checkTimeoutMs = 3000) => {
    // 前置检查可立即返回
    if (!layer) {
        return { success: false, reason: '底图图层实例不存在' }  // ← 同步
    }
    
    const source = layer.getSource?.()
    if (!source) {
        return { success: false, reason: '底图数据源不可用' }    // ← 同步
    }
    
    // 只对真正需要的情况 Promise 包装
    return new Promise(...)
}

// 调用时利用 Promise.race 提早超时
const fastValidation = Promise.race([
    validateBaseLayerSwitch(val, layer, 3000),
    new Promise(resolve => 
        setTimeout(() => resolve({ success: false, reason: '验证超时' }), 1500)
    )
])
```

---

#### 7. **releasePreviousLayerSources 复杂的堆栈逻辑**
```javascript
// ❌ 问题代码
function releasePreviousLayerSources(previousLayerId, nextLayerId) {
    const previousStack = Array.isArray(resolvePresetLayerIds?.(previousLayerId))
        ? resolvePresetLayerIds(previousLayerId)
        : [previousLayerId]
    const nextStack = Array.isArray(resolvePresetLayerIds?.(nextLayerId))
        ? resolvePresetLayerIds(nextLayerId)
        : [nextLayerId]
    const keepSet = new Set(nextStack.map((id) => String(id || '').trim()))

    previousStack
        .map((id) => String(id || '').trim())
        .filter(Boolean)
        .forEach((id) => {
            if (!keepSet.has(id)) {
                releaseLayerSource(id)
            }
        })
}

// ❌ 问题：
// - 如果 resolvePresetLayerIds 返回 undefined，逻辑正确但不够清晰
// - 如果 previousStack 和 nextStack 都是 ['google']，会清空 google 后立即重新加载
//   (这会导致加载中断)

✅ 改进方案:
function releasePreviousLayerSources(previousLayerId, nextLayerId) {
    if (previousLayerId === nextLayerId) {
        return  // ← 相同底图，不释放
    }
    
    const previousIds = resolveLayerStack(previousLayerId)
    const nextIds = resolveLayerStack(nextLayerId)
    const keepSet = new Set(nextIds)
    
    previousIds.forEach(id => {
        if (!keepSet.has(id)) {
            releaseLayerSource(id)
        }
    })
}

function resolveLayerStack(layerId) {
    const normalized = String(layerId || '').trim()
    if (!normalized) return []
    
    const stack = resolvePresetLayerIds?.(normalized)
    return Array.isArray(stack) && stack.length 
        ? stack.map(id => String(id || '').trim()).filter(Boolean)
        : [normalized]
}
```

---

#### 8. **emitBaseLayersChange 过度发送**
```javascript
// 调用时机：
// 1. runLayerSwitch 成功时
// 2. resetBasemapChain 时
// 3. initMap 时

// ❌ 问题：
// - 如果底图列表有 30+ 项，每次 emit 都需要 map 转换
// - 如果 LayerControlPanel 在 watch base-layers-change，会导致多次重新渲染

✅ 改进方案:
// 使用 throttle 或 batch 机制
let pendingEmit = false

function emitBaseLayersChangeBatched() {
    if (pendingEmit) return
    
    pendingEmit = true
    Promise.resolve().then(() => {
        emitBaseLayersChange()
        pendingEmit = false
    })
}
```

---

### 🟢 低优先级问题

#### 9. **错误消息国际化**
所有 message 中的中文硬编码，没有 i18n 支持。

#### 10. **日志缺失**
没有详细的 debug 日志，难以追踪问题。

#### 11. **TypeScript 类型缺失**
所有 Composable 都是 JS，缺少类型定义。

---

## 总结

### ✨ 设计亮点

| 项 | 说明 |
|----|------|
| **序列号机制** | 通过 switchSeq 防止竞态条件 |
| **电路断路器** | circuitOpen 与 failureStateMap 实现自动熔断 |
| **防抖策略** | 300ms 防抖避免频繁切换 |
| **兜底机制** | FALLBACK_OPTIONS 提供故障自恢复 |
| **资源管理** | releasePreviousLayerSources 避免冲突 |
| **模块解耦** | 功能按职责分散到 5 个 Composable |

### ⚠️ 需要改进的地方

| 优先级 | 问题 | 影响 | 建议 |
|--------|------|------|------|
| 🔴 高 | 验证过程中的状态变化 | 内存泄漏、异常崩溃 | 添加 AbortController |
| 🔴 高 | 自动降级后不验证 | 用户体验差 | 即使降级也要验证 |
| 🟡 中 | failureStateMap 内存泄漏 | 长期使用内存增长 | 定期清理 + 限制大小 |
| 🟡 中 | 3s 超时太长 | UX 不佳 | 使用 Promise.race 提早失败 |
| 🟢 低 | 缺少 i18n | 多语言支持困难 | 提取到 i18n 配置 |

---

## 调用流程代码示例

### 完整切换示例
```javascript
// 1. 用户在 LayerControlPanel 中点击 "Google"
// LayerControlPanel.vue
emit('change-layer', { layerId: 'google' })

// 2. MapContainer.vue 响应事件
handleLayerChange({ layerId: 'google' })
  // → createLayerControlHandlers.handleLayerChange()
  // → scheduleBasemapSelection('google')
  // → setTimeout 300ms → applyBasemapSelection('google')

// 3. [300ms 后] Ref 更新，触发 watch
selectedLayerRef.value = 'google'
// → createBasemapSelectionWatcher.bindBasemapSelectionWatcher()
// → watch 回调触发

// 4. watch 中的防抖再等 300ms
setTimeout(() => {
    runLayerSwitch('google', 'tianDiTu', switchSeq=1)
}, 300ms)

// 5. [600ms 后] runLayerSwitch 执行
async function runLayerSwitch(val, prevVal, currentSeq) {
    // ✅ 检查电路是否断路
    if (getFailureState(val).circuitOpen) {
        // 回滚到上一个底图
        selectedLayerRef.value = prevVal
        return
    }
    
    // 🗑️ 释放前一个底图的资源
    releasePreviousLayerSources(prevVal, val)
    
    // ⚙️ 执行实际的图层切换
    switchLayerById(val, {
        onUpdated: () => {
            emitBaseLayersChange()  // 通知外界
        }
    })
    
    // 🌐 同步 URL
    syncUrlFromMap()
    
    // 🔍 验证底图加载（异步，等待 3s）
    const result = await validateBaseLayerSwitch(
        val,
        layerInstances[val],
        3000
    )
    
    // 检查是否被打断
    if (currentSeq !== switchSeq) {
        return  // 已被新的切换打断
    }
    
    // 📊 处理结果
    if (result?.success) {
        clearLayerFailure(val)
        message.success('已成功切换到 Google 底图')
    } else {
        const failCount = markLayerFailure(val)
        if (failCount >= 3) {
            // 触发自动降级
            const fallbackMgr = createBaseLayerFallbackManager(val, true)
            const nextFallback = fallbackMgr.getNextFallbackOption()  // 'tianDiTu'
            
            if (nextFallback) {
                isAutoSwitchingLayer = true
                selectedLayerRef.value = nextFallback
                message.info('已自动切换至 天地图 底图')
                // → 触发新一轮 watch → runLayerSwitch('tianDiTu', ...)
            }
        }
    }
}

// 6. 用户看到成功提示
message: "已成功切换到 Google 底图"
```

