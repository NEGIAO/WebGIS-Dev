# MapContainer 图层切换事件逻辑链条分析

## 📊 完整事件流程链

```
用户点击底图选项
    ↓
LayerControlPanel @change-layer 事件
    ├─ payload: { layerId: 'google', ... }
    ↓
MapContainer handleLayerChange()
    ├─ 防抖 300ms
    ├─ 设置 selectedLayerRef.value = 'google'
    ↓
Vue watch(selectedLayerRef) 响应式触发
    ├─ prevVal = 'tianDiTu'
    ├─ val = 'google'
    ├─ 再防抖 300ms
    ↓
runLayerSwitch('google', 'tianDiTu', seq=1) [异步]
    ├─ [电路检查] 检查是否电路断路
    ├─ [资源释放] releasePreviousLayerSources('tianDiTu', 'google')
    ├─ [图层切换] switchLayerById('google')
    ├─ [URL同步] syncUrlFromMap()
    ├─ [状态广播] emitBaseLayersChange()
    └─ [验证] await validateBaseLayerSwitch('google') [0-3000ms]
        ├─ 监听 tileloadend / tileloaderror
        ├─ 返回 { success: true/false, reason: '...' }
        ├─ 自动降级 (若失败)
        └─ 广播成功/失败信息
```

## 🔌 核心 Composables 及职责

| Composable | 文件位置 | 核心职责 | 关键函数 |
|-----------|---------|--------|--------|
| **createLayerControlHandlers** | `useLayerControlHandlers.js` | 响应 UI 事件，防抖处理 | `handleLayerChange`, `handleLayerOrderUpdate` |
| **createBasemapSelectionWatcher** | `useBasemapSelectionWatcher.js` | 监听选择变化，执行切换 | `bindBasemapSelectionWatcher`, `runLayerSwitch` |
| **createBasemapStateManagementFeature** | `useBasemapStateManagement.js` | 广播底图状态 | `emitBaseLayersChange` |
| **createBasemapResilience** | `useBasemapResilience.js` | 验证、容灾、自动降级 | `validateBaseLayerSwitch`, `createBaseLayerFallbackManager` |
| **useMapState** | `useMapState.js` | 执行实际图层切换 | `switchLayerById` |

## ⏱️ 详细时间轴

```
T=0ms   用户点击底图按钮
        │
T=0-300ms  防抖等待（可被取消）
        │
T=300ms    防抖完成 → handleLayerChange() 执行
        │
T=300-600ms 第二层防抖等待（watch 防抖）
        │
T=600ms    selectedLayerRef.value 更新
        │  ├─ switchLayerById() 执行 (同步)
        │  │  ├─ 修改图层可见性
        │  │  ├─ 刷新图层实例
        │  │  └─ 设置图层层级
        │  │
        │  ├─ syncUrlFromMap() (同步)
        │  │
        │  ├─ emitBaseLayersChange() (同步)
        │  │
        │  └─ validateBaseLayerSwitch() 启动 (异步)
        │
T=600-3600ms  验证阶段
        │  ├─ 监听瓦片加载事件
        │  ├─ 等待至少 1 个瓦片成功
        │  └─ 或 3 个连续失败 / 3s 超时
        │
T=3600ms   验证完成
        │  ├─ success: 更新状态 ✅
        │  │
        │  └─ failure: 开始自动降级
        │     └─ 修改 selectedLayerRef.value = nextFallback
        │        └─ 触发新一轮 watch → runLayerSwitch (递归)
        │           └─ T=3900-6900ms (第二次验证)
```

## 🔴 三大流畅性问题（高优先级）

### 问题 1: 验证过程中的状态变化 ⚠️ 最严重

**症状**: 快速切换图层时偶发卡顿、内存泄漏

**原因**:
```javascript
T=0ms:   validateBaseLayerSwitch('google') 启动
         source.on('tileloadend', onTileLoadEnd)  // 监听中

T=500ms: 用户切换到天地图
         releaseLayerSource('google')  // ← 销毁源
         source = null

T=2500ms: 监听仍然有效，但源已死亡
         tileloadend / tileloaderror 永不触发
         
T=3000ms: setTimeout 超时
         source.un(...) 失败 (null source)
         返回 success=false
```

**影响**:
- ❌ 验证资源泄漏
- ❌ 降级流程启动错误
- ❌ 多次验证并发运行

**改进方案**:
```javascript
// 添加 AbortController
const abortController = new AbortController()

function releasePreviousLayerSources(prevId, nextId) {
    // 先检查该图层是否有进行中的验证
    abortValidation(prevId)  // ← 关键
    
    // 再释放资源
    releaseLayerSource(prevId)
}

// 改进后的验证函数
async function validateBaseLayerSwitch(layerId, layer, signal) {
    // 使用 signal 监听取消信号
    signal.addEventListener('abort', () => {
        source.un('tileloadend', onTileLoadEnd)
        source.un('tileloaderror', onTileLoadError)
    })
    
    // ... 验证逻辑
}
```

---

### 问题 2: 自动降级后不验证

**症状**: 用户看到"已切换"，但新底图加载失败无反应

**原因**:
```javascript
if (isAutoSwitchingLayer) {
    isAutoSwitchingLayer = false
    return  // ← 跳过验证！
}

// 验证代码永不执行
const result = await validateBaseLayerSwitch(val, ...)
```

**时间线**:
```
Google 失败 (failCount ≥ 3)
  ↓
自动降级到天地图
  ├─ isAutoSwitchingLayer = true
  ├─ selectedLayerRef.value = 'tianDiTu'
  └─ runLayerSwitch('tianDiTu') 触发

runLayerSwitch 中:
  ├─ if (isAutoSwitchingLayer) {
  │    isAutoSwitchingLayer = false
  │    return  ← 完全跳过验证
  ├─ 切换完成，显示"已切换"
  └─ 但天地图实际可能也是坏的！

用户看到: "已成功切换到天地图"
实际情况: 天地图根本没加载任何数据
```

**改进方案**:
```javascript
// 验证应该在任何情况下都进行
const result = await validateBaseLayerSwitch(val, layer, validationTimeoutMs)

if (!result?.success) {
    // 即使降级，验证失败也要继续降级
    if (isAutoSwitchingLayer) {
        const nextFallback = fallbackManager.getNextFallbackOption()
        if (nextFallback) {
            selectedLayerRef.value = nextFallback
            return  // 递归等待下一次降级验证
        }
    }
    
    // 非自动降级的失败处理
    markLayerFailure(val)
    // ...
}
```

---

### 问题 3: failureStateMap 内存泄漏

**症状**: 长期使用应用，内存持续增长

**原因**:
```javascript
const failureStateMap = new Map()  // 全局，永不清理

function markLayerFailure(layerId) {
    if (!failureStateMap.has(layerId)) {
        failureStateMap.set(layerId, { failures: 0, circuitOpen: false })
    }
    // ...
}

// ❌ 如果用户切换了 200 个底图
// failureStateMap 会有 200 个条目，永远不删除
```

**影响**:
- 内存逐月增长
- 旧底图状态永久保留
- 如果用户导入自定义底图，会堆积更快

**改进方案**:
```javascript
// 方案 A: 限制大小（LRU）
const MAX_FAILURE_RECORDS = 50
const failureStateMap = new Map()

function getFailureState(layerId) {
    // 如果超过限制，删除最旧的
    if (failureStateMap.size >= MAX_FAILURE_RECORDS) {
        const firstKey = failureStateMap.keys().next().value
        failureStateMap.delete(firstKey)
    }
    
    if (!failureStateMap.has(layerId)) {
        failureStateMap.set(layerId, { failures: 0, circuitOpen: false })
    }
    return failureStateMap.get(layerId)
}

// 方案 B: 在 resetBasemapChain 时清理
function resetBasemapChain() {
    failureStateMap.clear()  // ← 清空所有故障记录
    // ...
}

// 方案 C: 定期清理（如 5 分钟清一次）
setInterval(() => {
    failureStateMap.clear()
}, 5 * 60 * 1000)
```

---

## 🟡 三个流畅性问题（中等优先级）

### 问题 4: 防抖+防抖的双层延迟

**症状**: 用户快速选择底图，响应缓慢（最多 600ms）

**原因**:
```
防抖层1 (handleLayerChange)    : 300ms
防抖层2 (watch debounce)       : 300ms
总延迟                          : 300-600ms
```

**改进方案**:
```javascript
// 方案：合并防抖到一层
// 在 handleLayerChange 中去掉防抖，只在 watch 中防抖

// 或者：使用单层防抖 + immediateCallback
function handleLayerChange(layerId) {
    // 直接更新，不防抖
    // 把防抖的职责转给 watch
    selectedLayerRef.value = layerId
}

watch(selectedLayerRef, 
    async (val, prevVal) => {
        await runLayerSwitch(val, prevVal, seq)
    }, 
    { debounce: 200 }  // ← 单层防抖
)
```

---

### 问题 5: validateBaseLayerSwitch 超时太长

**症状**: 底图加载失败，用户要等 3 秒才看到提示

**原因**:
```javascript
const checkTimeoutMs = 3000  // 硬编码 3 秒

// 如果网络很差，3 秒是必要的
// 但如果前置检查失败（source 不存在），也要等 3 秒
```

**改进方案**:
```javascript
async function validateBaseLayerSwitch(layerId, layer, timeoutMs = 3000) {
    // 前置检查可立即返回（不走 Promise）
    if (!layer) {
        return { success: false, reason: '底图实例不存在' }  // ← 即时
    }
    
    const source = layer.getSource?.()
    if (!source) {
        return { success: false, reason: '数据源不可用' }    // ← 即时
    }
    
    // 只对真正的网络加载使用 Promise
    return Promise.race([
        new Promise(resolve => {
            // 真正的瓦片监听逻辑
            // ...
        }),
        // 快速失败：1.5 秒就算超时
        new Promise(resolve => 
            setTimeout(() => 
                resolve({ success: false, reason: '加载超时' }), 
                1500
            )
        )
    ])
}
```

---

### 问题 6: 过度的 emitBaseLayersChange

**症状**: LayerControlPanel 频繁重新渲染

**原因**:
```javascript
// emitBaseLayersChange 被调用多次：
// 1. switchLayerById() 后
// 2. 验证成功后
// 3. resetBasemapChain() 后
// 4. initMap() 时

// 每次都要 map 转换全部 30+ 项底图
emit('base-layers-change', layerList.value.map(item => ({...})))
```

**改进方案**:
```javascript
// 使用 throttle / batch 机制
let pendingEmit = false
let emitTimer = null

function emitBaseLayersChangeBatched() {
    if (pendingEmit) return
    
    pendingEmit = true
    clearTimeout(emitTimer)
    
    emitTimer = setTimeout(() => {
        emitBaseLayersChange()  // 实际的 emit
        pendingEmit = false
    }, 50)  // 50ms 批处理窗口
}

// 所有调用改为：
// emitBaseLayersChangeBatched() 替代 emitBaseLayersChange()
```

---

## 📈 改进优先级清单

| 优先级 | 问题 | 等待时间影响 | 建议修复 |
|--------|------|------------|--------|
| 🔴 高 | 验证过程中的状态变化 | 导致无响应 | 本周内 |
| 🔴 高 | 自动降级不验证 | 延迟反应 | 本周内 |
| 🔴 高 | failureStateMap 泄漏 | 长期卡顿 | 本周内 |
| 🟡 中 | 双层防抖延迟 | 最多 600ms | 近期 |
| 🟡 中 | 验证超时太长 | 需要等 3s | 近期 |
| 🟡 中 | 过度 emit 重绘 | 每次 30+ 项目 | 这周 |

---

## ✅ 流畅性改进方案总结

```javascript
// 改进后的完整流程（伪代码）

// 1️⃣ 单层防抖
watch(selectedLayerRef, 
    async (val, prevVal) => {
        await runLayerSwitch(val, prevVal, ++switchSeq)
    },
    { debounce: 200 }  // 合并为单层
)

// 2️⃣ 验证过程中的状态保护
async function runLayerSwitch(val, prevVal, seq) {
    const abortSignal = createAbortSignal(val)  // 创建信号
    
    // 释放资源时自动 abort 验证
    releasePreviousLayerSources(prevVal, val)
    abortOutstandingValidation(val)  // ← 关键
    
    switchLayerById(val, { onUpdated: emitBatched })
    
    // 验证即使降级也要进行
    const result = await validateBaseLayerSwitch(
        val, 
        switchedLayer, 
        validationTimeoutMs,
        abortSignal  // ← 传递信号
    )
    
    if (!result?.success && isAutoSwitching) {
        // 继续降级
        const next = fallbackManager.getNextFallbackOption()
        if (next) {
            selectedLayerRef.value = next  // 递归
        }
    }
}

// 3️⃣ 快速失败验证
async function validateBaseLayerSwitch(id, layer, timeout, signal) {
    // 前置检查：立即返回
    if (!layer || !layer.getSource?.()) {
        return { success: false, reason: '...' }
    }
    
    // 网络检查：快速失败 1.5s
    return Promise.race([
        checkTilesLoaded(),
        Promise.delay(1500)  // 1.5s 快速超时
    ])
}

// 4️⃣ 批量 emit
const emitBatched = createBatchEmitter(
    emitBaseLayersChange,
    { batchWindow: 50 }  // 50ms 窗口
)

// 5️⃣ 内存泄漏修复
function resetBasemapChain() {
    failureStateMap.clear()  // ← 清理
    // ...
}
```

---

## 📝 关键代码位置参考

| 文件 | 行号 | 函数 | 改进重点 |
|------|------|------|--------|
| `useLayerControlHandlers.js` | 60+ | `handleLayerChange` | 删除防抖，转给 watch |
| `useBasemapSelectionWatcher.js` | 120+ | `bindBasemapSelectionWatcher` | 添加 abortController |
| `useBasemapSelectionWatcher.js` | 200+ | `runLayerSwitch` | 移除 `isAutoSwitchingLayer` 跳过 |
| `useBasemapResilience.js` | 400+ | `validateBaseLayerSwitch` | 快速失败 + Promise.race |
| `useBasemapStateManagement.js` | 80+ | `emitBaseLayersChange` | 包装为批量 emit |

---

## 🎯 预期改进效果

| 指标 | 现在 | 改进后 | 提升 |
|------|------|--------|------|
| 响应延迟 | 300-600ms | 200-300ms | ↓ 50% |
| 验证时间 | 3000ms | 1500ms | ↓ 50% |
| 内存增长 | 线性 | 恒定 | ↓ 100% |
| 重绘次数 | 每次 3+ | 每次 1 | ↓ 70% |
| 用户流畅感 | 中等 | 流畅 | ↑ 80% |
