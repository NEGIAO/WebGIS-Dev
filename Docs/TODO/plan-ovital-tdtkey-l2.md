# 奥维 tdtkey L2 密钥池化 实施方案（V3.5.24，并入综合版本）

> **状态**：⏳ 待用户批准（L3 架构级，批准后实施）
> **建议等级**：L3（跨 后端密钥管理 / 前端运行时 token 池 / OL 底图配置 / Cesium 上下文 / 管理员面板）
> **创建**：2026-08-20

---

## 1. 核心症状 → 根本原因 → 受影响模块

| 项 | 内容 |
|---|---|
| 核心症状 | 奥维注记（`Omap_label`）与奥维等高线（`terrain_omap_contour`）的 `tdtkey` 硬编码在 `basemapConfig.ts`（4 处字面量，同一个 key `1VMohDhFD1emI6KVzaD82VQssQEXVSW5`）；奥维服务防范性强、key 频繁失效变更，每次变更都要改代码重新部署，期间所有引用该 key 的预设（奥维注记被 30+ 预设栈引用）全部失效 |
| 根本原因 | tdtkey 属于「常变运营密钥」，却按「静态资源 URL」硬编码，未走既有 L2 密钥池链路（api_keys 表 + `/api/runtime-config/map-tokens` + 前端运行时 token 池） |
| 受影响模块 | 底图链路（OL + Cesium）、密钥管理后端、管理员面板、前端运行时 token 池、下载器、i18n |

## 2. 既有 L2 链路（复用对象，零新建基础设施）

天地图 `tianditu_tk` 已实现完整 L2 池化，奥维 tdtkey 完全复用同一条链路：

```mermaid
flowchart LR
    Admin[管理员] -->|面板写入/删除/备用池| Panel[ApiKeysManagementPanel.vue]
    Panel -->|POST /api/admin/api-keys/set| Backend[api_keys_management.py]
    Backend -->|api_keys / api_key_backups 表| DB[(SQLite auth.db)]
    User[普通用户] -->|GET /api/runtime-config/map-tokens| Backend
    Backend -->|主 token + 备用池| Front[frontend 运行时 token 池 runtimeMapTokens.js]
    Front -->|ovitalTdtkey| OL[OL createSource 注入<br/>basemapConfig.ts]
    Front -->|{ovitalTdtkey} 占位符| Cesium[basemapProviderFactory.ts]
    OL --> Tiles[omap.map-world.com.cn 瓦片]
    Cesium --> Tiles
```

## 3. 方案对比

| 方案 | 说明 | 结论 |
|---|---|---|
| A. 新增 `ovital_tdtkey` 密钥池，全链路复用 tianditu_tk 模式 | 后端 ALLOWED_API_KEYS/FRONTEND_RUNTIME_KEYS + 运行时接口 + 前端 token 池 + OL/Cesium 注入 + 面板卡片 | ✅ **选定**：与既有体系零新概念，管理员面板已有完整 UI/API 模式可复制 |
| B. 用通用 `system_config` 表存字符串 | 需另写读取/注入逻辑，且失去备用池、状态展示、删除等面板能力 | ❌ 重复造轮子 |
| C. 保留硬编码 + 面板覆盖 | 双源漂移，key 更新后仍需发版 | ❌ 不符合"管理员动态维护"诉求 |

## 4. 选定方案实施清单（文件级）

### 4.1 后端（2 文件）
1. `backend/api/api_keys_management.py`：
   - `ALLOWED_API_KEYS` 增加 `ovital_tdtkey`（面板增删改查自动放行）
   - `FRONTEND_RUNTIME_KEYS` 增加 `ovital_tdtkey`（map-tokens 自动下发）
   - `get_runtime_map_tokens` 响应 data + token_pools + is_set 增加 ovital_tdtkey
   - `ApiKeyConfig.description` 文案补充 ovital_tdtkey

### 4.2 前端运行时 token 池（3 文件）
2. `frontend/src/domains/common/services/runtimeMapTokens.js`：EMPTY 常量、`normalizeRuntimeKeyName`（ovital_tdtkey/ovital）、payload 归一化、`markRuntimeMapTokenFailed` 分支、clear 复位——全部按 tianditu_tk 模式镜像
3. `frontend/src/domains/ol/composables/useRuntimeMapTokenPool.js`：新增 `getOvitalTdtkey/setOvitalTdtkey/ovitalTdtkeyRef` 依赖注入；`applyRuntimeMapTokens` 同时应用 ovitalTdtkey 并重建图层配置
4. `frontend/src/domains/ol/components/MapContainer.vue`：`OVITAL_TDTKEY` 变量 + `ovitalTdtkey` ref + 传入 pool 与 `createLayerConfigs`

### 4.3 底图配置与解析（3 文件）
5. `frontend/src/domains/ol/basemap/constants/basemapConfig.ts`：
   - `LayerFactoryContext` 增加 `ovitalTdtkey`；`needsContext` 联合类型增加 `'ovitalTdtkey'`
   - 新增 `buildOvitalUrl(pathAndQuery, tdtkey)`（追加 `&tdtkey=`，与 `buildTiandituUrl` 同构）
   - `Omap_label` / `terrain_omap_contour`：url 模板占位符 `{ovitalTdtkey}`（Cesium 消费），createSource 用 `buildOvitalUrl`（OL 消费）
   - **不保留任何硬编码 tdtkey 字面量**（已失效 key 无保留价值；未配置时图层走既有容灾提示）
6. `frontend/src/domains/ol/basemap/constants/basemapResolver.ts`：`createLayerConfigs(tiandituTk, ovitalTdtkey, customUrl)` 签名扩展 + context 注入
7. `frontend/src/domains/ol/components/MapDownloader.vue`：`TIANDITU_TK` 旁增加 `OVITAL_TDTKEY`，`refreshLayerConfigs` 同步携带（下载器需拿到含正确 tdtkey 的瓦片模板）

### 4.4 Cesium 链路（2 文件）
8. `frontend/src/domains/cesium/constants/basemapProviderFactory.ts`：`CesiumProviderContext` 增加 `ovitalTdtkey`；`resolveContextPlaceholders` 替换 `{ovitalTdtkey}`
9. `frontend/src/domains/cesium/components/CesiumContainer.vue` + `composables/layers/useCesiumLayers.js`：`getOvitalTdtkey` 读取 + ctx 传值

### 4.5 管理员面板 + i18n + 登记（4 文件）
10. `frontend/src/domains/common/user/components/ApiKeysManagementPanel.vue`：
    - 天地图密钥卡片**之后**新增「🔑 奥维 TDT Key」卡片（ovital_tdtkey），复制 tianditu 卡片模板
    - `frontendRuntimeKeyNames` / `keysStatus` / `editValues` / `backupEditValues` / `managedApiKeys` / `loadKeysStatus` 全链路补充（保存/删除/备用池操作后自动 `clearRuntimeMapTokensCache`，管理员改动即时生效）
11. `frontend/src/locales/zh-CN.js` + `en-US.js`：`apiKeys.ovitalKey` 系列文案（标题/占位符/hint/备份标签）
12. `.env.example`：[L2] 段「地图 Token 池」注释补充 `ovital_tdtkey（奥维 TDT Key，浏览器直连）`——仅登记说明，不设 env fallback（与 tianditu_tk 同语义）

### 4.6 收尾（规范 DoD）
- 日志 `Docs/LLM_record/26-08/2026-08-20/2026-08-20-ovital-tdtkey-l2.md`（含 Mermaid 变更前后图）
- 版本号 V3.5.24：README 三处 + CHANGELOG 条目（并入 V3.5.24 综合版本）
- 门禁：`python CheckConfigRegistry.py`（无新增 env key，预期通过）、`python CheckStructureTree.py`（无文件增删，预期通过）
- 无文件增删 → 结构树无需同步

## 5. 关键决策点（请确认）

1. **不保留硬编码 fallback**：DB 未配置 ovital_tdtkey 时，奥维图层无法加载（显示既有容灾提示）。旧硬编码 key 已频繁失效，保留无价值。
2. **失败自动轮换（备用池）暂不接入**：`retryTiandituLayersWithNextToken` 是天地图专用；奥维备用池可在面板维护，但瓦片失败自动切换备用 key 列为后续增强（涉及 createBasemapResilience 泛化）。本次交付：管理员可配主 key + 备用池，手动轮换。
   > ✅ **已于 V3.5.24（综合版本）实现**：`retryRuntimeTokenLayersWithNextToken` 泛化（basemapConfig `resolveRuntimeTokenPoolKey` SSOT 判定 + OL 两条失败路径 + Cesium boot 轮换）。详见[日志](../LLM_record/26-08/2026-08-20/2026-08-20-ovital-tdtkey-failover.md)。
3. **普通用户最新 key 获取**：整页刷新即重新拉取 map-tokens（与天地图行为一致）；不做页面内自动轮询。

## 6. 测试方案

**Agent 已执行（实施后）**：`npx tsc --noEmit`（前端类型）、`python CheckConfigRegistry.py`、`python CheckStructureTree.py`。

**待用户实机验证**：
1. admin 登录 → 密钥管理 → 奥维 TDT Key 卡片保存新 key → 刷新页面 → 2D/3D 奥维注记/等高线图层可加载
2. 备用池新增一个 key → 删除主 key → 奥维图层仍可加载（用备用）
3. 未配置 key 时 → 奥维图层加载失败但显示容灾提示，其余底图不受影响
4. 下载器选中含奥维图层的预设 → 下载模板 URL 含最新 tdtkey

## 7. 遗留与风险

- 失败自动轮换备用 key 未接入（见决策 2），已记 TODO
- 并行会话可能撞 README 版本号，实施时先 `grep 当前版本 README.md` 复核