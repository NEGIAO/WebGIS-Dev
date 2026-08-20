# 奥维 tdtkey L2 密钥池化（V3.5.30）

- **日期与时间**：2026-08-20 15:40
- **任务等级**：L3（架构级，方案文档 `Docs/TODO/plan-ovital-tdtkey-l2.md` 已获用户批准）
- **版本号说明**：V3.5.29 已被并行会话（unify-data-clamp-to-ground）占用（CHANGELOG 已登记），本任务顺延取 V3.5.30

---

## 问题分析

**核心症状**：奥维注记（`Omap_label`）与奥维等高线（`terrain_omap_contour`）的 `tdtkey` 硬编码在 `basemapConfig.ts`（同一 key `1VMohDhFD1emI6KVzaD82VQssQEXVSW5` 共 4 处字面量）。奥维服务防范性强、key 频繁失效变更，每次变更都要改代码重新部署；奥维注记被 30+ 预设栈引用，key 失效期间全部相关预设不可用。

**根本原因**：tdtkey 属于「常变运营密钥」，却按「静态资源 URL」硬编码，未走既有 L2 密钥池链路（api_keys 表 + `/api/runtime-config/map-tokens` + 前端运行时 token 池）。

**受影响模块**：底图链路（OL + Cesium）、密钥管理后端、管理员面板、前端运行时 token 池、下载器、i18n。

**方案对比**：
| 方案 | 结论 |
|---|---|
| A. 新增 `ovital_tdtkey` 密钥池，全链路复用 tianditu_tk 模式 | ✅ 选定：零新概念，面板 UI/API 模式可复制 |
| B. system_config 表存字符串 | ❌ 失去备用池/状态展示/删除能力，重复造轮子 |
| C. 保留硬编码 + 面板覆盖 | ❌ 双源漂移，更新仍需发版 |

---

## 变更前后关系（Mermaid）

```mermaid
flowchart LR
    subgraph 变更前
        Code[basemapConfig.ts 硬编码 tdtkey] -->|部署后固定| Tiles1[奥维瓦片]
        Code -->|key 失效需改代码重发| Pain[🔴 运维痛点]
    end
    subgraph 变更后
        Admin2[管理员] -->|面板写入/备用池| Panel2[ApiKeysManagementPanel]
        Panel2 -->|POST /api/admin/api-keys/set| BE2[api_keys_management.py]
        BE2 --> DB2[(SQLite api_keys 表)]
        User2[普通用户] -->|GET /api/runtime-config/map-tokens| BE2
        BE2 --> Pool2[runtimeMapTokens.js 池]
        Pool2 --> OL2[OL createSource<br/>buildOvitalUrl 注入]
        Pool2 --> CE2[Cesium {ovitalTdtkey} 占位符替换]
        OL2 --> Tiles2[奥维瓦片]
        CE2 --> Tiles2
    end
```

---

## 修改内容

1. **后端 `backend/api/api_keys_management.py`**：
   - `ALLOWED_API_KEYS` 增加 `ovital_tdtkey`（面板增删改查自动放行）
   - `FRONTEND_RUNTIME_KEYS` 增加 `ovital_tdtkey`（map-tokens 自动下发）
   - `get_runtime_map_tokens` 响应 data + token_pools + is_set 增加 ovital_tdtkey
   - `ApiKeyConfig` description 文案补充
2. **前端运行时 token 池 `runtimeMapTokens.js`**：EMPTY 常量、`normalizeRuntimeKeyName`（ovital_tdtkey/ovital）、payload 归一化（`data.ovital_tdtkey` + `pools.ovital_tdtkey`）、`markRuntimeMapTokenFailed` 分支、clear 复位——按 tianditu_tk 模式镜像
3. **底图配置 `basemapConfig.ts`**：`LayerFactoryContext` 与 `needsContext` 增加 `ovitalTdtkey`；新增 `buildOvitalUrl(pathAndQuery, tdtkey)`（追加 `&tdtkey=`，与 buildTiandituUrl 同构）；`Omap_label` / `terrain_omap_contour` url 模板改 `{ovitalTdtkey}` 占位符、createSource 运行时注入；**删除全部硬编码 tdtkey 字面量**
4. **解析与注入链**：
   - `basemapResolver.ts`：`createLayerConfigs(tiandituTk, ovitalTdtkey, customUrl)` 签名扩展 + context 注入
   - `MapContainer.vue`：`OVITAL_TDTKEY` 变量 + `ovitalTdtkey` ref + 传入 pool 与 createLayerConfigs
   - `useRuntimeMapTokenPool.js`：新增 `getOvitalTdtkey/setOvitalTdtkey/ovitalTdtkeyRef` 依赖；`applyRuntimeMapTokens` 泛化为「任一 token 变化即重建」
   - `MapDownloader.vue`：`refreshLayerConfigs(tiandituTk, ovitalTdtkey)` 同步携带
5. **Cesium 链路**：`basemapProviderFactory.ts`（`CesiumProviderContext` + `resolveContextPlaceholders` 替换 `{ovitalTdtkey}`）；`CesiumContainer.vue`（`getOvitalTdtkey`）；`useCesiumLayers.js`（`ovitalTdtkeyToken` 注入 + ctx 传值）
6. **管理员面板 `ApiKeysManagementPanel.vue`**：天地图密钥卡片**之后**新增「奥维 TDT Key」卡片；`frontendRuntimeKeyNames` / `keysStatus` / `editValues` / `backupEditValues` / `managedApiKeys` / `loadKeysStatus` / 两个 cancel 复位全链路补充——保存/删除/备用池操作后自动 `clearRuntimeMapTokensCache`
7. **i18n**：zh-CN.js / en-US.js 增加 `apiKeys.ovitalKey` / `ovitalKeyPlaceholder` / `ovitalKeyHint`
8. **登记**：`.env.example` [L2] 段「地图 Token 池」注释补充 ovital_tdtkey（仅登记说明，无 env fallback，与 tianditu_tk 同语义）
9. **版本与文档**：README 三处 V3.5.28→V3.5.30、CHANGELOG 顶部追加 V3.5.30 条目、本日志、方案文档留存

## 修改原因

奥维 tdtkey 频繁变更，硬编码导致每次变更需发版、期间 30+ 预设不可用；改由管理员在面板动态维护，普通用户每次加载页面自动拉取最新 key，无需发版。

## 影响范围

- 底图链路（OL `createSource` + Cesium `resolveContextPlaceholders`）
- 前端运行时 token 池（4 个密钥池中的第 4 个）
- 密钥管理后端（白名单 + map-tokens 响应）
- 管理员面板（新增卡片 + 备用池）
- 下载器（瓦片模板含最新 tdtkey）
- 数据库（api_keys 表新 key_name 行，表结构不变）

## 解决方案

详见方案文档 `Docs/TODO/plan-ovital-tdtkey-l2.md`（用户已批准）。核心决策：
- 不保留硬编码 fallback：DB 未配置时奥维图层不可用（既有容灾提示）
- 失败自动轮换备用 key 未接入（`retryTiandituLayersWithNextToken` 为天地图专用），面板支持手动主/备维护
- 最新 key 靠整页刷新拉取（与天地图一致）

## 性能指标

未实测（本任务无渲染性能改动；仅初始化多携带一个字符串 token）。

## 测试方案

### Agent 已执行
- `npx tsc --noEmit`（frontend）：✅ 无新增类型错误
- `python -m py_compile backend/api/api_keys_management.py`：✅
- 全仓库 grep 硬编码 key `1VMohDhFD1emI6KVzaD82VQssQEXVSW5`：✅ 无残留
- `python CheckConfigRegistry.py` / `python CheckStructureTree.py`：见门禁结果

### 待用户实机验证
1. admin 登录 → 密钥管理 → 「奥维 TDT Key」卡片（天地图密钥之后）保存新 key → 刷新页面 → 2D/3D 奥维注记/等高线图层可加载
2. 备用池新增一个 key → 删除主 key → 刷新页面 → 奥维图层仍可加载（用备用 key）
3. 未配置 key 时 → 奥维图层加载失败但显示容灾提示，其余底图不受影响
4. 下载器选中含奥维图层的预设 → 下载模板 URL 含最新 tdtkey

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/api/api_keys_management.py` | ovital_tdtkey 入白名单 + map-tokens 下发 |
| `frontend/src/domains/common/services/runtimeMapTokens.js` | ovitalTdtkey 池化（归一化/轮换/清缓存） |
| `frontend/src/domains/ol/basemap/constants/basemapConfig.ts` | buildOvitalUrl + 占位符 + 删硬编码 |
| `frontend/src/domains/ol/basemap/constants/basemapResolver.ts` | createLayerConfigs 签名扩展 |
| `frontend/src/domains/ol/composables/useRuntimeMapTokenPool.js` | ovital 依赖注入 + apply 泛化 |
| `frontend/src/domains/ol/components/MapContainer.vue` | OVITAL_TDTKEY 变量 + ref + 传入 |
| `frontend/src/domains/ol/components/MapDownloader.vue` | refreshLayerConfigs 携带 ovital |
| `frontend/src/domains/cesium/constants/basemapProviderFactory.ts` | ctx + {ovitalTdtkey} 替换 |
| `frontend/src/domains/cesium/components/CesiumContainer.vue` | getOvitalTdtkey + 传入 |
| `frontend/src/domains/cesium/composables/layers/useCesiumLayers.js` | ovitalTdtkeyToken 注入 + ctx |
| `frontend/src/domains/common/user/components/ApiKeysManagementPanel.vue` | 奥维 TDT Key 卡片（天地图之后）+ 全链路 |
| `frontend/src/locales/zh-CN.js` / `en-US.js` | ovitalKey 系列文案 |
| `.env.example` | [L2] 段登记说明 |
| `README.md` | 版本号三处 V3.5.30 + 版本演进表 |
| `Docs/Guide/CHANGELOG.md` | V3.5.30 条目 |
| `Docs/TODO/plan-ovital-tdtkey-l2.md` | L3 方案文档（本次新增） |

## 遗留与风险

- **失败自动轮换备用 key 未接入**：奥维备用池可在面板维护，但瓦片失败自动切换备用 key 属后续增强（涉及 `createBasemapResilience` 泛化，`retryTiandituLayersWithNextToken` 为天地图专用）。已记入交接块。
- **并行会话版本号**：V3.5.29 被并行会话占用，本任务顺延 V3.5.30；若并行会话在 README 侧继续推进可能撞号，后完成者顺延。
- **首次部署**：DB 无 ovital_tdtkey 时奥维图层不可用，需管理员先在面板配置。