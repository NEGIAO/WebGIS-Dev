# WebGIS Code Review 报告 — 鹰眼视图 & 卷帘持久化

## 日期和时间
- 2026-06-02 15:00

## 审查范围
本次 Code Review 覆盖 2026-06-02 14:30 提交的未暂存变更，涉及以下模块：
1. **鹰眼视图 (OverviewMap)** — 从硬编码天地图 token 迁移到基于 LAYER_CONFIGS 的动态生成
2. **卷帘持久化 (Swipe Persistence)** — 新增 `leftLayerIds`/`rightLayerIds` 字段以修复恢复逻辑

## 问题事件逻辑链条分析

### 鹰眼视图模块
- **核心症状**: 鹰眼视图使用硬编码天地图 token 创建 XYZ source，环境变量失效时鹰眼图层无法稳定加载
- **根本原因**: `createOverviewMapLayer` 调用 `config.createSource()` 时未传递 `sourceContext`（含 `tiandituTk`），导致天地图 URL 中 token 为 `undefined`
- **受影响模块**: `useOverviewMapLayer.js`、`MapContainer.vue`
- **潜在影响**: 所有需要认证 token 的底图源在鹰眼视图中生成的 URL 均为无效地址，瓦片加载失败

### 卷帘持久化模块
- **核心症状**: 卷帘状态恢复仅按数组对半分，左右堆叠层级不一致时恢复错误
- **根本原因**: Store 新增了 `leftLayerIds`/`rightLayerIds` 字段但未接入消费方，`enableBasemapSwipe` 不写入、`restoreSwipe` 不读取
- **受影响模块**: `useSwipeConfigStore.ts`、`useBasemapSwipe.js`
- **潜在影响**: 新增字段为死代码，卷帘恢复仍依赖脆弱的 midIndex 启发式拆分

---

## 审查发现

### 🔴 高优先级 (High)

#### H1. `createSource()` 缺少 context 参数 — 天地图 token 丢失
- **文件**: `useOverviewMapLayer.js:40`
- **问题**: `config.createSource()` 未传递 `sourceContext`，天地图图源的 `createSource(({ tiandituTk }) => ...)` 收到 `undefined`，生成 `tk=undefined` 的无效 URL
- **修复**: 新增 `sourceContext` 参数并透传至 `config.createSource(sourceContext)`

#### H2. 卷帘 `leftLayerIds`/`rightLayerIds` 未接入消费方 — 死代码
- **文件**: `useBasemapSwipe.js:210-214`、`useBasemapSwipe.js:264-267`
- **问题**: `enableBasemapSwipe` 仅写入 `targetLayerIds`（左右拼接），不写 `leftLayerIds`/`rightLayerIds`；`restoreSwipe` 用 `Math.ceil(len/2)` 拆分，不读 Store 中的左右字段
- **修复**: `enableBasemapSwipe` 同时写入 `leftLayerIds`/`rightLayerIds`；`restoreSwipe` 优先读取显式左右列表，兼容旧数据回退到 midIndex 拆分

### 🟡 中优先级 (Medium)

#### M1. 回退链顺序 — 已通过传入 context 解决
- **文件**: `MapContainer.vue:1162`
- **问题**: `fallbackLayerIds: ['imagery_tianditu', 'imagery_google_standard']`，天地图 `createSource` 在缺少 token 时可能生成无效 URL
- **结论**: 保持天地图优先（与原有行为一致），通过传入 `sourceContext` 确保 token 可用，此问题自然消失

#### M2. SSRF 保护存在 DNS Rebinding 绕过（来自 08:59 安全加固）
- **文件**: `backend/api/proxy.py:87-104`
- **问题**: `_is_private_host()` 仅检查主机名字符串，域名解析到私有 IP 的情况无法拦截
- **建议**: 使用 `socket.getaddrinfo()` 解析后校验 IP

### 🟢 低优先级 (Low)

#### L1. `resolvePresetLayerIds` 返回值未防御
- **文件**: `useOverviewMapLayer.js:16`
- **问题**: `candidateIds.push(...resolvePresetLayerIds(presetId))` — 若返回非数组将抛出运行时错误
- **修复**: `const ids = resolvePresetLayerIds(presetId); if (Array.isArray(ids)) candidateIds.push(...ids);`

#### L2. 空 catch 块无日志
- **文件**: `useOverviewMapLayer.js:43`
- **问题**: `catch {}` 静默吞掉所有错误，开发阶段难以调试
- **修复**: 添加 `catch (e) { console.debug('[OverviewMap] source creation failed:', e); }`

#### L3. `SwipeConfig` 类型未显式标注到 ref
- **文件**: `useSwipeConfigStore.ts:57`
- **问题**: `ref({...})` 推断类型可能与 `SwipeConfig` 类型漂移
- **修复**: `ref<SwipeConfig>({...})`

#### L4. 过期注释引用已移除函数
- **文件**: `MapContainer.vue:840, 855, 884`
- **问题**: 注释仍引用 `prioritizeTileSourceRequest`，但该函数已从本文件移除

#### L5. Fallback httpx 客户端未使用 `PROXY_VERIFY_SSL`
- **文件**: `backend/api/proxy.py:181, 311`
- **问题**: `httpx.AsyncClient(follow_redirects=False)` 未传 `verify=PROXY_VERIFY_SSL`

#### L6. 502 错误响应泄露内部信息
- **文件**: `backend/api/proxy.py:357`
- **问题**: `"error": str(exc)` 可能暴露 DNS 解析错误、连接拒绝等内部信息

---

## 修复方案

### Fix H1: 传递 sourceContext 到 createOverviewMapLayer

**useOverviewMapLayer.js** — 新增 `sourceContext` 参数：
```js
export function createOverviewMapLayer({
    layerConfigs,
    resolvePresetLayerIds,
    presetId,
    fallbackLayerIds = [],
    sourceContext,  // 新增
} = {}) {
    // ...
    const source = config.createSource(sourceContext);
    // ...
}
```

**MapContainer.vue** — 传入 context：
```js
const overviewLayer = createOverviewMapLayer({
    layerConfigs: LAYER_CONFIGS,
    resolvePresetLayerIds,
    presetId: selectedLayer.value,
    fallbackLayerIds: ['imagery_google_standard', 'imagery_tianditu'],
    sourceContext: { normBase: NORM_BASE, tiandituTk: TIANDITU_TK, customUrl: '' },
});
```

### Fix H2: 接入 leftLayerIds/rightLayerIds

**useBasemapSwipe.js** — enableBasemapSwipe 写入左右字段：
```js
layerStore.setSwipeConfig({
    enabled: true,
    position: 0.5,
    mode,
    targetLayerIds: [...leftLayerIds, ...rightLayerIds],
    leftLayerIds,   // 新增
    rightLayerIds,  // 新增
});
```

**useBasemapSwipe.js** — restoreSwipe 优先读取显式左右列表：
```js
const config = layerStore.swipeConfig;
// 优先使用显式持久化的左右列表，兼容旧数据回退到 midIndex 拆分
let leftLayerIds, rightLayerIds;
if (config.leftLayerIds?.length && config.rightLayerIds?.length) {
    leftLayerIds = config.leftLayerIds;
    rightLayerIds = config.rightLayerIds;
} else {
    const midIndex = Math.ceil(targetLayerIds.length / 2);
    leftLayerIds = targetLayerIds.slice(0, midIndex);
    rightLayerIds = targetLayerIds.slice(midIndex);
}
```

---

## 修改的文件路径

| 文件 | 变更类型 |
|------|---------|
| `frontend/src/composables/map/features/useOverviewMapLayer.js` | 修复: sourceContext 参数 |
| `frontend/src/components/Map/MapContainer.vue` | 修复: 传入 context + 回退链顺序 |
| `frontend/src/composables/map/features/useBasemapSwipe.js` | 修复: 接入 leftLayerIds/rightLayerIds |
| `frontend/src/stores/useSwipeConfigStore.ts` | 优化: 显式类型标注 |
| `Docs/26-06-02/2026-06-02-code-review-overviewmap-swipe.md` | 新增: 本报告 |

---

## 审查结论

本次变更的核心设计方向正确（从硬编码迁移到配置驱动、新增左右图层持久化字段），但实现层存在两个 **High** 级别问题需要在合并前修复：
1. 鹰眼视图的 `createSource` 缺少 context 导致天地图 token 丢失
2. 卷帘持久化的左右图层字段未接入消费方

修复后可安全提交。
