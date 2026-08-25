# 统一图层管理架构重构（OL / Cesium 双引擎）

> 起草：2026-08-25 ｜ 状态：**待实施** ｜ 前置：无（独立专项）
> 预估：P0 半天 / P1 一天 / P2 一天 ｜ 触碰 ~15 文件

---

## 一、现状诊断（逐行审计结论）

### 1.1 组件拓扑

```
HomeView.vue
 ├─ MapContainer.vue          ← OL，始终挂载（3D 时 v-show 隐藏）
 │   └─ SidePanel.vue         ← 纯事件中继 + 懒加载 tab 容器
 │       └─ TOCPanel.vue      ← 唯一 TOC 挂载点（~3000 行 god component）
 │           └─ LayerPanel.vue ← 树渲染 + 通用 action 转发
 │               └─ TOCTreeItem.vue ← 递归树行
 ├─ CesiumContainer.vue       ← Cesium，v-if 按需挂载/卸载
 │   └─ CesiumToolPanel.vue   ← 平行的 3D 工具面板（与共享 TOC 无关）
```

### 1.2 数据流分裂（核心问题）

| 图源 | 渲染引擎 | 注册位置 | TOC 展示 | 操作路由 |
|---|---|---|---|---|
| OL 底图 | OL | MapContainer 内部硬编码 | ✅ layerStore.layerTree | HomeView → mapContainerRef (OL) |
| 用户上传/绘制 | OL | layerStore.userLayers | ✅ layerStore.layerTree | HomeView → mapContainerRef (OL) |
| 在线服务(rsvc:) | OL+Cesium 双适配器 | remoteServices.ts 注册表 | ✅ buildRemoteServiceGroup 注入 layerTree | TOCPanel → handleRemoteServiceTreeAction 直调注册表 ✓ |
| Cesium 三维数据 | Cesium | cesiumLayersStore.records | ✅ buildCesiumDataGroup 注入 layerTree | TOCPanel → handleCesiumLayerTreeAction 直调 store ✓ |
| **Cesium WMS/ArcGIS 在线服务** | **仅 Cesium** | **remoteServices.ts** | **✅ 分组在** | **✗ 无路由——HomeView 全部调 OL** |

### 1.3 关键发现

| # | 发现 | 影响 |
|---|---|---|
| F1 | **SidePanel 不知道当前引擎**——零 engine prop，切换 2D/3D 时面板结构不变 | 用户在 3D 模式下看到 OL 的 TOC，操作静默落到隐藏的 OL 地图 |
| F2 | **HomeView 的 ~25 个 handler 全部硬编码调 OL**（`mapContainerRef.value?.xxx`）| 3D 模式下上传、绘制、样式、导出全部静默失败 |
| F3 | **两种跨引擎模式并存**：命令式 defineExpose（OL）+ store-adapter（Cesium），前者不可扩展 | 新增图源必须同时改两处 |
| F4 | **ID 前缀分流（`cesium:` `rsvc:`）是事实上的路由机制**，散落在 ≥3 个文件中的字符串检查 | 新增 kind 必须在每个文件加前缀判断，遗漏即静默失败 |
| F5 | **TOCPanel 是 ~3000 行 god component**：树分发 + 上传 + 地理编码 + AOI + 属性查询 + 样式编辑 + 共享资源扫描 | 维护成本极高，任何改动都可能破坏不相关功能 |
| F6 | LayerPanel 8 个 props 中 6 个是死代码（树直接从 Pinia store 取） | 接口冗余但无害 |
| F7 | **Cesium 引擎卸载时 cleanupLayers 清空在线服务适配器**；重新进入时依赖 addBaseImageryLayers/applyBasemap 触发重挂载 | 切换引擎后服务图层可能丢失（取决于时序） |
| F8 | `is3DMode` 存在于 HomeView 但未传给 SidePanel/TOCPanel/LayerPanel | 组件无法感知引擎上下文 |

---

## 二、目标架构

### 2.1 设计原则

1. **单一数据真源**：所有图层元数据统一存 Pinia（扩展 useLayerStore 或新建 useUnifiedLayerStore）
2. **引擎适配器模式**：每个引擎注册 `{ createLayer, removeLayer, setVisible, setOpacity, flyTo }` 适配器
3. **TOC 引擎无关**：只读统一树 + 发出类型化动作，不知道也不关心哪个引擎在渲染
4. **ID 即路由**：节点 id 自带引擎标识（`ol:` / `cesium:` / `rsvc:`），分流器按前缀直调对应处理器

### 2.2 目标数据流

```
用户操作（TOC / 面板 / Agent）
    ↓ 类型化 action { type, engine, payload }
统一 Action Router（新增，替代散落的 if-else）
    ↓ 按 engine 字段分发
┌──────────┐     ┌──────────────┐
│ OL 处理器 │     │ Cesium 处理器 │
│ (现有方法) │     │ (新增包装)     │
└──────────┘     └──────────────┘
```

### 2.3 远程服务的双引擎生命周期

```
registerRemoteServiceStack(payload, names[])
    ↓ records 更新（deep watch）
OL adapter: 创建/销毁 TileLayer（zIndex 子带 100~149）      ← 已实现 ✓
Cesium adapter: 创建/销毁 ImageryLayer（per-sublayer split）← 已实现 ✓
    ↓ viewer 就绪自愈 watch（已实现 ✓）
identify 点击 → queryArcgisLayerAtPoint per-sublayer        ← 已实现 ✓
属性表 → fetchArcgisLayerAttributes per-sublayer            ← 已实现 ✓
```

---

## 三、分阶段实施计划

### P0：让远程服务在 Cesium 模式下完整可用（半天）

> 目标：用户在 3D 模式下通过 TOC 对 WMS/ArcGIS 服务进行显隐、缩放、移除、属性表操作。

#### P0-1 传递引擎状态到 TOCPanel

**文件**: `SidePanel.vue`
```diff
+ const props = defineProps({
+     ...
+     activeEngine: { type: String, default: 'ol' }, // 'ol' | 'cesium'
+ });
```
```diff
  <TOCPanel
      ...
+     :active-engine="activeEngine"
  />
```

**文件**: `HomeView.vue`
```diff
  <SidePanel
      ...
+     :active-engine="is3DMode ? 'cesium' : 'ol'"
  />
```

#### P0-2 zoom 动作按引擎分发

**文件**: `HomeView.vue` → `handleZoomLayer`

```js
function handleZoomLayer(layerId) {
    if (String(layerId).startsWith(RSVC_NODE_PREFIX)) {
        const { serviceId } = parseRsvcNodeId(layerId);
        // 按当前引擎分发到对应 adapter 的 zoomTo
        if (is3DMode.value) {
            cesiumContainerRef.value?.zoomToRemoteService?.(serviceId);
        } else {
            mapContainerRef.value?.zoomToRemoteService?.(serviceId);
        }
        return;
    }
    // ……既有逻辑不变
}
```

前置：CesiumContainer.vue 需 expose `zoomToRemoteService(serviceId)` 方法，
内部调 `cesiumRemoteServiceAdapter.flyTo(serviceId)`。
（若 cesiumRemoteServiceAdapter 未暴露 flyTo，需补一个。）

#### P0-3 identify 点击查询常驻绑定（消除对 submit 流程的依赖）

**文件**: `useCesiumLayers.js`

现状：`bindCesiumArcgisIdentify(info)` 只在 `handleCustomBasemapSubmit` 里调用。
修复：改为无条件绑定（候选集合动态收集），移除 `!cesiumIdentifyInfo` 早退守卫。

```diff
  function bindCesiumArcgisIdentify(info) {
      cesiumIdentifyInfo = info && info.queryable ? info : null;
      const viewer = getViewer?.();
      const Cesium = getCesium?.();
-     if (!cesiumIdentifyInfo || !viewer || !Cesium || ...) return;
+     if (!viewer || !Cesium || typeof Cesium.ScreenSpaceEventHandler !== 'function') return;
      if (cesiumIdentifyHandler) return;
```

调用点改为无条件：
```js
// rsvcInitTimer 轮询回调内追加：
ensureRemoteServiceAdapter();
bindCesiumArcgisIdentify(null); // null = 无自定义流程服务，纯靠注册表动态收集
```

#### P0-4 移除子层叶子的 :L: 复合 id（简化路由）

**文件**: `remoteServiceNodeBuilder.ts`

叶子 id 从 `rsvc:<recordId>:L:<enc(name)>` 改为 `rsvc:<recordId>`（每叶子=独立记录后天然唯一）。
同步更新 `parseRsvcNodeId` 和 HomeView 的 `:L:` 解析逻辑（可标记废弃）。

### P0 验收清单

| # | 场景 | 预期 |
|---|---|---|
| 1 | 2D 加载府谷服务 → 切 3D | 服务图层自动渲染在 Cesium globe 上 |
| 2 | 3D 模式 TOC 勾选/取消子层 | ImageryLayer show 同步切换 |
| 3 | 3D 模式右键缩放 | camera.flyTo 服务范围 |
| 4 | 3D 模式右键移除 | ImageryLayer 卸载 + TOC 节点消失 |
| 5 | 3D 模式点击地图 | 弹窗显示该点要素属性（精确到勾选子层） |
| 6 | 2D↔3D 来回切 | 图层状态保持一致（visible/opacity） |

---

### P1：统一 Action Router + Cesium 缺失操作（一天）

> 目标：新建统一 Action Router，消除 HomeView 中 ~15 个硬编码 OL 调用。

#### P1-1 定义 Action Router 接口

**新文件**: `src/domains/common/layer-tree/actions/unifiedActionRouter.js`

```js
/**
 * 统一图层操作路由器
 * 每个 action 带 engine 字段（'ol'|'cesium'）或由 router 根据 is3DMode 自动判定。
 * handler 注册表由各 Container 挂载时注入。
 */
const handlers = new Map(); // engine → { methodName: fn }

export function registerEngineHandlers(engine, api) {
    handlers.set(engine, api);
}

export function dispatchLayerAction(action) {
    const engine = action.engine ?? currentEngine;
    const api = handlers.get(engine);
    if (!api?.[action.method]) {
        console.warn(`[ActionRouter] ${engine} 引擎不支持 ${action.method}`);
        return false;
    }
    api[action.method](action.payload);
    return true;
}
```

#### P1-2 CesiumContainer 注册处理器

```js
import { registerEngineHandlers } from '@common/layer-tree/actions/unifiedActionRouter';

registerEngineHandlers('cesium', {
    setUserLayerVisibility(id, visible) { /* imageryLayers.show */ },
    setUserLayerOpacity(id, opacity) { /* layer.alpha */ },
    removeUserLayer(id) { /* imageryLayers.remove */ },
    zoomToUserLayer(id) { /* flyTo extent */ },
});
```

#### P1-3 HomeView 替换硬编码

逐步将 `mapContainerRef.value?.xxx` 替换为 `dispatchLayerAction({ method:'setUserLayerVisibility', payload:{...}, engine: currentEngine })`。

优先替换顺序（按使用频率）：
1. `handleToggleLayerVisibility` — 最高频
2. `handleChangeLayerOpacity`
3. `handleRemoveLayer`
4. `handleZoomLayer`

其余低频操作可后续批次迁移。

### P1 验收清单

| # | 场景 | 预期 |
|---|---|---|
| 1 | 3D 模式下上传 GeoJSON/TIF | Cesium 正确渲染（当前静默落 OL） |
| 2 | 3D 模式绘制要素 | Cesium entities 正确创建 |
| 3 | 3D 模式导出坐标 | 正常工作 |
| 4 | 2D 回退 | OL 行为不受影响 |

---

### P2：TOCPanel 拆分 + 死代码清理（一天）

> 目标：将 ~3000 行 god component 拆分为职责单一的模块。

拆分目标：

| 提取物 | 来源行数（估） | 新文件 |
|---|---|---|
| 文件上传逻辑 | ~400 | `composables/useFileUpload.js` |
| 地理编码/逆编码 | ~200 | `composables/useGeocoding.js` |
| AOI 手动对话框 | ~150 | `components/AoiManualDialog.vue` |
| 共享资源扫描 | ~200 | `composables/useSharedResources.js` |
| 树 action 分发 | ~300 | `composables/useTreeActionDispatcher.js` |

死代码清理：
- LayerPanel 6 个死 props
- TOCPanel 3 个死 emits（`set-base-layer`, `toggle-base-layer-visibility`, `show-layer-properties`）
- SidePanel 2 个死事件中继（`request-download-extent`, `clear-download-extent`）

---

## 四、风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| 并发 agent 冲突 | 🔴 高 | 单 commit 提交引用本文档路径；改动前 git stash |
| HMR 陈旧导致误判"修复无效" | 🟡 中 | 每轮验证前重启 dev server + Ctrl+F5 |
| Cesium adapter dispose 后未重建 | 🟡 中 | §P0-3 的轮询机制兜底 |
| 旧版 localStorage 数据格式不兼容 | 🟢 低 | 会话态设计天然规避 |

## 五、回滚策略

整个特性收敛于「stack 展开」和「adapter 注册」两个入口。
回滚 = hooks 改回调旧的 `registerRemoteService(单条)` + 移除 `rsvcEngineApi` 注册即可恢复组合模式。
