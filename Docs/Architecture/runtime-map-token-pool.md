# 天地图 Token 运行时池 — 架构说明

日期：2026-08-02

适用范围：`frontend/src/domains/common/services/runtimeMapTokens.ts`（核心）、
`frontend/src/domains/ol/composables/useRuntimeMapTokenPool.ts`（轮换）、
`frontend/src/api/backend/runtime.ts`（拉取）、
`backend/api/api_keys_management.py`（后端接口）。

本文说明运行时地图密钥（天地图 `tianditu_tk`、Cesium Ion `cesium_ion_token`、高德 `amap_key`、
奥维 `ovital_tdtkey`）从"管理员在面板录入"到"浏览器直连各地图服务"的全链路：
拉取、缓存、分发、消费、轮换、刷新。

---

## 1. 设计评价

### 做得好的

| 点 | 说明 |
|---|---|
| **一次性拉取 + 内存缓存** | 启动时拉一次，后续全读模块级变量，零网络开销。对高频场景（底图瓦片每秒数十次请求）至关重要——不可能每次拼 URL 都去查库 |
| **4 个 token 池 + 本地轮换** | 天地图 / Cesium Ion / 高德 / 奥维各自维护主 token + 备用数组，失败时毫秒级切换，用户无感。比"失败了再问后端拉下一个"快得多 |
| **响应式 ref 桥接** | 非响应式的 `cachedTokens` 通过 `tiandituTkRef` 桥接到 Vue 响应式系统，token 切换后组件自动感知 |
| **SSOT 清晰** | 前端只有一个读取点 `getRuntimeMapTokensSync()`，后端只有一个出口 `get_runtime_map_tokens`，没有散落各处的 `import.meta.env.VITE_TIANDITU_TK` |
| **后端聚合候选列表** | 后端按 `FRONTEND_RUNTIME_KEYS` 一次性批量返回 4 个主 token + 各自候选池，前端无需多次请求拼凑 |

### 可改进的

| 点 | 说明 |
|---|---|
| **轮换无衰减与回退** | 当前是顺序下标递增，永远回不到主 token。如果主 token 只是短暂限流（非封禁），会长期卡在备用 token。建议：失败后记录时间戳，N 分钟后尝试回主 token |
| **缓存无 TTL** | `cachedTokens` 在内存中直到页面关闭或强制刷新。如果管理员在后台换了 token，已打开的页面不会感知，必须手动触发 `force: true`。建议：对高频应用加一个 5–10 分钟的软过期 |
| **token 池无优先级感知** | 池内 token 平等轮换，无法表达"主 token 优先、备用仅应急"的语义。各池主 token 仅为数组首项，与备用无区别 |
| **失败判定粒度过粗** | `markRuntimeMapTokenFailed` 被调用时并不区分"这个 token 被封"和"网络临时抖动"。一次网络抖动就可能把健康的备用 token 也轮换掉 |
| **无跨标签页同步** | 多个标签页各自维护独立缓存，A 页轮换到 token2 后，B 页仍用 token1（可能继续失败并重复轮换）。建议：`storage` 事件或 BroadcastChannel 同步轮换状态 |

### 总体评价

**7.5 / 10**。核心机制（缓存 + 轮换 + 响应式桥接）设计合理，足以支撑生产环境的高频瓦片请求。
短板主要在**轮换策略的智能化**（无回退、无衰减）和**跨标签页一致性**，属于"能用但不够精致"的层面，不影响功能正确性。

---

## 2. 总体架构图

```mermaid
flowchart TB
    subgraph ADMIN["管理员操作"]
        PANEL["ApiKeysManagementPanel<br/>录入 / 编辑 / 删除 4 类运行时 key"]
    end

    subgraph DB["SQLite"]
        AK["api_keys 表<br/>主 token"]
        AB["api_key_backups 表<br/>备用 token 池"]
    end

    subgraph BE["后端 backend/api/api_keys_management.py"]
        GRT["get_runtime_map_tokens()<br/>FRONTEND_RUNTIME_KEYS 批量聚合<br/>4 主 token + 候选池"]
    end

    subgraph FE_CORE["前端核心 runtimeMapTokens.ts（模块级缓存）"]
        LRT["loadRuntimeMapTokens()<br/>启动时拉取一次"]
        CACHED["cachedTokens<br/>tiandituTk/Tokens · cesiumIonToken/Tokens<br/>amapKey/Keys · ovitalTdtkey/Tdtkeys"]
        GRS["getRuntimeMapTokensSync()<br/>同步读缓存（零网络）"]
        FAIL["markRuntimeMapTokenFailed(keyName)<br/>keyName 归一化 → 按池顺序轮换"]
    end

    subgraph FE_REACT["响应式桥接"]
        POOL["useRuntimeMapTokenPool<br/>hydrate / retry / 轮换"]
        REF["tiandituTkRef / ovitalTdtkeyRef<br/>Vue 响应式 ref"]
    end

    subgraph FE_CONSUMERS["消费方（6 大场景）"]
        BASEMAP["OL 底图瓦片<br/>4 类图层 URL tk="]
        CESIUM["Cesium 底图<br/>ImageryProvider tk="]
        SEARCH["地名/POI 搜索<br/>v2/search?tk="]
        GEOCODE["逆地理编码<br/>geocoder?tk="]
        ROUTE["路径规划<br/>drive?tk="/]
        WEATHER["天气模块<br/>逆编码城市名"]
    end

    PANEL -- "写入" --> AK
    PANEL -- "写入" --> AB
    AK --> GRT
    AB --> GRT
    GRT -- "GET /api/runtime-config/map-tokens<br/>{ 4 主 token, token_pools(4), is_set, note }" --> LRT
    LRT --> CACHED
    CACHED --> GRS
    GRS --> POOL
    POOL --> REF
    FAIL -. "轮换后更新" .-> CACHED

    REF --> BASEMAP
    REF --> CESIUM
    REF --> SEARCH
    REF --> GEOCODE
    REF --> ROUTE
    REF --> WEATHER

    BASEMAP -. "token 失败" .-> FAIL
    CESIUM -. "token 失败" .-> FAIL
```

---

## 3. 生命周期详解

### 3.1 启动拉取（一次性）

```mermaid
sequenceDiagram
    participant APP as 应用启动
    participant RMT as runtimeMapTokens.ts
    participant BE as 后端 API
    participant DB as SQLite

    APP->>RMT: loadRuntimeMapTokens()
    RMT->>BE: GET /api/runtime-config/map-tokens
    BE->>DB: _get_api_keys_sync(FRONTEND_RUNTIME_KEYS)<br/>批量取 4 个 key_name（不再单查 tianditu_tk）
    BE->>DB: _get_api_key_candidates_sync(key_name)<br/>逐池取候选（api_keys + api_key_backups）
    DB-->>BE: 4 主 token + 各自备用列表
    BE-->>RMT: { data: { tianditu_tk, cesium_ion_token, amap_key, ovital_tdtkey,<br/>token_pools(4), is_set, note } }
    RMT->>RMT: normalizeRuntimeTokenPayload()<br/>4 组 activeTokenIndexes + cachedTokens 各池数组
    RMT-->>APP: 完成（后续全读内存）
```

**关键代码**（`runtimeMapTokens.ts`）：

```ts
// 模块级缓存（非响应式，纯内存）——4 个池，各含主 token + 数组
let cachedTokens = {
    tiandituTk: '', cesiumIonToken: '', amapKey: '', ovitalTdtkey: '',
    tiandituTokens: [], cesiumIonTokens: [], amapKeys: [], ovitalTdtkeys: [],
};
let activeTokenIndexes = {
    tianditu_tk: 0, cesium_ion_token: 0, amap_key: 0, ovital_tdtkey: 0,
};

export async function loadRuntimeMapTokens({ force = false } = {}) {
    if (hasLoadedRuntimeTokens && !force) return getRuntimeMapTokensSync();
    // ... 拉取后端
    cachedTokens = normalizeRuntimeTokenPayload(payload);
    hasLoadedRuntimeTokens = true;
}
```

### 3.2 运行时消费（同步读缓存）

所有消费方通过同一个入口读取，**零异步、零网络**：

```js
// 底图瓦片
const { tiandituTk } = getRuntimeMapTokensSync();
const url = buildTiandituUrl('/img_w/wmts?...', tiandituTk);

// 搜索
const { tiandituTk } = getRuntimeMapTokensSync();
fetch(`https://api.tianditu.gov.cn/v2/search?...&tk=${tiandituTk}`);

// 逆地理编码
const tk = resolveTiandituToken(); // 内部调 getRuntimeMapTokensSync()
```

### 3.3 Token 轮换（本地，不查库）

```mermaid
sequenceDiagram
    participant BASEMAP as 底图瓦片
    participant POOL as useRuntimeMapTokenPool
    participant RMT as runtimeMapTokens.ts
    participant SVC as 地图服务 API

    BASEMAP->>SVC: 请求瓦片 tk=t1
    SVC-->>BASEMAP: 403（token 失效）
    BASEMAP->>POOL: retryRuntimeTokenLayersWithNextToken({ layerId, reason })
    POOL->>POOL: resolveLayerTokenPools(layerId)<br/>按 needsContext 判定所属池（天地图 / 奥维）
    POOL->>RMT: markRuntimeMapTokenFailed(poolKey)
    RMT->>RMT: keyName 归一化 → activeTokenIndexes[池] += 1<br/>cachedTokens[主 token 字段] = 下一个 token
    RMT-->>POOL: { switched, tokens }
    POOL->>POOL: applyRuntimeMapTokens + 更新响应式 ref
    BASEMAP->>SVC: 重试瓦片 tk=t2
    SVC-->>BASEMAP: 200 OK
```

**关键代码**（`runtimeMapTokens.ts:128-158`）：

```ts
export function markRuntimeMapTokenFailed(keyName: any) {
    const normalizedKey = normalizeRuntimeKeyName(keyName); // 别名归一化（tianditu / gaode / ovital 等）
    if (!normalizedKey) return { switched: false, tokens: getRuntimeMapTokensSync() };

    const poolKey = normalizedKey === 'cesium_ion_token' ? 'cesiumIonTokens'
        : normalizedKey === 'amap_key' ? 'amapKeys'
        : normalizedKey === 'ovital_tdtkey' ? 'ovitalTdtkeys'
        : 'tiandituTokens';
    const activeKey = normalizedKey === 'cesium_ion_token' ? 'cesiumIonToken'
        : normalizedKey === 'amap_key' ? 'amapKey'
        : normalizedKey === 'ovital_tdtkey' ? 'ovitalTdtkey'
        : 'tiandituTk';
    const tokens = cachedTokens[poolKey] || [];
    if (tokens.length <= 1) return { switched: false, tokens: getRuntimeMapTokensSync() };

    const nextIndex = Math.min((activeTokenIndexes[normalizedKey] || 0) + 1, tokens.length - 1);
    if (nextIndex === activeTokenIndexes[normalizedKey]) {
        return { switched: false, tokens: getRuntimeMapTokensSync() }; // 已到末位：提前返回
    }

    activeTokenIndexes[normalizedKey] = nextIndex;
    cachedTokens = { ...cachedTokens, [activeKey]: tokens[nextIndex] || '' };
    return { switched: true, tokens: getRuntimeMapTokensSync() };
}
```

### 3.4 强制刷新（用户改密钥后）

```mermaid
sequenceDiagram
    participant USER as 管理员
    participant PANEL as ApiKeysManagementPanel
    participant RMT as runtimeMapTokens.ts
    participant BE as 后端

    USER->>PANEL: 保存新 token
    PANEL->>BE: POST /api/admin/api-keys
    BE-->>PANEL: 200
    PANEL->>RMT: loadRuntimeMapTokens({ force: true })
    RMT->>BE: GET /api/runtime-config/map-tokens
    BE-->>RMT: 新 token 数据
    RMT->>RMT: 覆盖 cachedTokens
    RMT-->>PANEL: 完成
    Note over RMT: 各组件通过响应式 ref 自动感知新 token
```

---

## 4. 消费方清单

| 消费方 | 文件 | 使用方式 | 调用路径 |
|---|---|---|---|
| OL 底图（注记） | `basemapConfig.ts` | `buildTiandituUrl(path, tk)` | `MapContainer → LayerControlPanel → createLayer` |
| OL 底图（影像） | `basemapConfig.ts` | 同上 | 同上 |
| OL 底图（矢量） | `basemapConfig.ts` | 同上 | 同上 |
| OL 底图（矢量注记） | `basemapConfig.ts` | 同上 | 同上 |
| Cesium 底图 | `useCesiumLayers.ts` | `UrlTemplateImageryProvider.url` | `CesiumContainer → useCesiumLayers` |
| 地名/POI 搜索 | `locationSearch.ts` | `fetch(\`...&tk=${tiandituTk}\`)` | `SidePanel → MapPointPickerCard` |
| 逆地理编码 | `geocoding.ts` | `axios.get('/geocoder', { params: { tk } })` | `TOCPanel / usePositionCodeTool / useSharedEntryResolver` |
| 天气模块 | `useWeatherData.ts` | 逆编码城市名 | `SidePanel → WeatherPanel` |
| 路径规划（驾车/公交） | `RoutePlannerPanel.vue` / `.ts` | 驾车 `fetch(\`...drive?tk=${token}...\`)`；公交天地图 transit API | `SidePanel → RoutePlannerPanel`（按 `mode` 分派；旧 `DrivingPlannerPanel` / `BusPlannerPanel` 已合并） |
| 地图下载器 | `MapDownloader.vue` | `refreshLayerConfigs(tiandituTk)` | `MapContainer → MapDownloader` |

---

## 5. 后端接口契约

**GET /api/runtime-config/map-tokens**

```json
{
    "status": "success",
    "data": {
        "tianditu_tk": "主 token 或空字符串",
        "cesium_ion_token": "...",
        "amap_key": "...",
        "ovital_tdtkey": "...",
        "token_pools": {
            "tianditu_tk": ["主 token", "备用1", "备用2"],
            "cesium_ion_token": ["..."],
            "amap_key": ["..."],
            "ovital_tdtkey": ["..."]
        },
        "is_set": {
            "tianditu_tk": true,
            "cesium_ion_token": true,
            "amap_key": true,
            "ovital_tdtkey": true
        },
        "note": "These browser runtime tokens are returned once so the frontend can call Tianditu, Cesium, Amap, and Ovital directly."
    }
}
```

后端实现见 `api_keys_management.py:723-750`：`FRONTEND_RUNTIME_KEYS = ("tianditu_tk", "cesium_ion_token", "amap_key", "ovital_tdtkey")` 批量取 4 个主值（`:40,729`），再逐池取候选（`:730-733`），最后附 `note` 字段。

- 权限：`require_api_access_or_guest`（登录用户或 guest）
- 来源：`api_keys` 表主 token + `api_key_backups` 表备用（按 `enabled=1` 过滤，主 token 在前）
- 空 token 时 `tianditu_tk = ""`，前端需兜底提示

---

## 6. 关键文件索引

| 文件 | 职责 |
|---|---|
| `frontend/src/domains/common/services/runtimeMapTokens.ts` | **核心**：4 池缓存、拉取、同步读、keyName 归一化轮换 |
| `frontend/src/domains/ol/composables/useRuntimeMapTokenPool.ts` | 响应式桥接：hydrate / retry / 按 needsContext 多池轮换 |
| `frontend/src/api/backend/runtime.ts` | HTTP 客户端：`apiGetRuntimeMapTokens()` |
| `frontend/src/domains/ol/components/MapContainer.vue` | 根组件：初始化 token ref、订阅轮换 |
| `frontend/src/domains/ol/composables/useSharedEntryResolver.ts` | 分享链接入口：消费 token 做逆编码 |
| `frontend/src/api/geocoding.ts` | 逆地理编码：`resolveTiandituToken()` |
| `frontend/src/api/locationSearch.ts` | 地名搜索：`searchWithTianditu()` |
| `frontend/src/domains/ol/basemap/constants/basemapConfig.ts` | 底图：`buildTiandituUrl()` |
| `frontend/src/domains/cesium/composables/layers/useCesiumLayers.ts` | Cesium 底图 |
| `frontend/src/domains/common/weather/composables/useWeatherData.ts` | 天气 |
| `backend/api/api_keys_management.py` | 后端：聚合 token 池 |
| `frontend/src/domains/common/user/components/ApiKeysManagementPanel.vue` | 管理面板：写入触发刷新 |

---

## 7. 相关文档

- [三层配置架构](../Architecture/configuration-three-tier.md) — L1/L2/L3 总体配置模型
- [底图源系统](../Architecture/basemap-source-system.md) — 底图图层如何构建与消费
- [路径规划](../Architecture/route-planning.md) — 驾车/公交管线的 token 使用
- [配置使用手册](../Guide/configuration.md) — 管理员操作手册
