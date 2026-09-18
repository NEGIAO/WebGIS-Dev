# 2026-09-18 V3.6.6 整合：在线 presence + external_proxy + OL 标注夹心 + 下载搁置

## 日期与时间

2026-09-18 12:30

## 任务等级

L2（跨后端统计/鉴权 + 前端 SSE/OL 图层 + 文档结构树；多次不规范 commit 暂存区整合为 V3.6.6）

## 问题分析

- **核心症状**：账号面板「N 人在线」长期固定显示 **2 人在线**；同批暂存还有 `external_proxy` 恢复、底图下载搁置标注、TopBar 中国 layer、OL 数据标注夹心（geometry/label 双层）等多次零散改动。
- **同批 staged 主题**（整合为 V3.6.6 单次提交）：
  1. 在线 presence 身份链路
  2. `external_proxy.py` 自 V3.6.5 误删后恢复挂载
  3. OL 托管矢量层 geometry + label 双层（zIndex 夹心）
  4. 底图下载入口注释 + git tag 标记文档
  5. TopBar 中国快捷定位 layer 22→26；README 本地默认管理员说明
- **根本原因**（presence 事件逻辑链）：
  1. **在线键错误**：tracker/ticket 以 `username` 计数；游客 `user_{MAX(id)+1}` 并发撞名。
  2. **设备身份被吞**：前端仅 `!token` 时发 `X-Guest-Device-Id`；分享模式假 token 使 device_id 丢失。
  3. **僵尸 SSE**：代理半开连接 disconnect 失灵，在线数被钉死。
  4. **展示口径分叉**：`displayOnlineUsers` 回退 DB sessions（漏游客）；`loadCenterData` 整包覆盖 `realtime`。
  5. **无 device_id 的脚本/探针**：随机 guest_uid 抬高在线集合。
- **受影响模块**：`backend/api/{realtime_stats,statistics,auth/*}`、`backend/api/external_proxy.py`、`backend/app.py`、frontend presence/client、OL layer 全链路、结构树与 CHANGELOG。

## 修改内容

### 本次 Code Review（工作区修复，未 git add）

| 级别 | 项 | 处置 |
|---|---|---|
| **P0** | 临时游客随机 `guest_uid` 曾计为可统计 `g:` | `presence_id_from_fields`：无 device_id → `e:` 不计数（已在 staged） |
| **P0** | `presence_id_from_fields` 优先 `device_id`：注册用户会话若残留 device_id 会被吞成 `g:`，登录前后双身份 | **账号身份优先**：`role≠guest` 且有 name → 恒 `u:name` |
| **P1** | 前端恒发 `X-Guest-Device-Id` + `require_login` 靠 device-id 游客兜底 → **过期 token 被静默降级为临时游客**，而非 401 | `require_login`：携带 Authorization/X-Auth-Token 且会话无效 → **SESSION_EXPIRED 401**；仅无凭据头时才 guest 兜底 |
| **P1** | offline beacon：`sendBeacon` 成功则跳过带 Authorization 的 fetch → 登录用户 `u:` 身份关页后无法 beacon 撤销 | 登录态改走 **keepalive fetch + Authorization**；游客仍 sendBeacon |
| **P1** | SSE 过期扫描 `client_count==0` 时跳过 prune | 扫描协程恒 prune（已在 staged） |
| **P1** | 共享 `app.state.http_client` 默认可能跟随重定向，external_proxy/agent 复用时有 SSRF-via-redirect 面 | `httpx.AsyncClient(..., follow_redirects=False)` |
| **P2** | `backend-structure.md` **重复两条** `external_proxy.py` | 合并为一条（含 V3.6.6 恢复说明） |
| **P2** | `frontend-structure.md`：MapDownloader/MyDownloadTasks **重复登记**在 services 下伪 components 段；zIndexBands 注释仍写旧分层；feature/ 树缩进错 | 删重复段；正确路径注释补 ⚠️ 404；zIndex 注释改为夹心双层；feature/ 树改平级 |
| **P2** | `project-structure.md` Docs 树缺 `26-09` 与 TODO 下载标记文档 | 已补 |
| **P2** | 日志重复「任务等级」章节；CHANGELOG/README **未写 OL 双层主题**（代码在暂存区） | 日志重写；CHANGELOG/README 补主题三 |
| **P2** | `check_app_import` 文案写「无 /proxy」易误导：`/api/proxy/*` JSON 代理存在且不在禁项前缀内 | 文案改为「无 `/proxy/*` 与 `/tiles/*` 瓦片中转」，并注明 JSON 代理灰区归用户决策 |
| **知悉** | `external_proxy` HF 政策灰区 | 代码保留；部署是否挂 HF **由用户决策** |
| **知悉** | `/api/proxy/ipapi/country` 无 `require_api_access_or_guest` | 历史公开 IP 定位端点；未改行为，记入风险 |
| **知悉** | REDLINE-2 字面量命中 `maxRayDistance`/`raymarch`（Cesium 云影） | 非 VPN/代理，业务无命中 |

### presence 主题（staged + review）

1. **presence_id**：`u:{username}` / `g:{guest_uid}` / `e:{hash}`（e: 不计入）。
2. **游客用户名**：由 `guest_uid` 确定性派生，删除 `MAX(id)+1`。
3. **连接 TTL** 75s + 关页 offline + 断线 presence ping。
4. **新端点**：`POST /api/statistics/presence/ping`、`POST .../offline`、`GET /api/statistics/admin/online-debug`。
5. **展示口径**：`online_users` = tracker；`online_users_db` / `online_guests_db` 供对比。
6. **前端**：恒发 device-id；auth 变化 reconnect；pagehide beacon；SSE 断线 ping。
7. **测试**：`tests/test_realtime_stats.py` 扩至 **14** 例（含注册用户残留 device_id 仍为 `u:`）。

### external_proxy 恢复（staged）

- `backend/api/external_proxy.py` + `app.py` `include_router`。
- 路由前缀 `/api/proxy`，配置 key 已在 `catalog.py` + `deploy/.env.example`。
- `check_app_import` 不禁 `/api/proxy`（仅禁 `/proxy/*`、`/tiles/*`、`/api/download`）。

### OL 标注夹心（staged）

- `zIndexBands.js`：DATA=200 / LABEL=600 / DATA_LABEL=700 / DISTRICT=850 / SYSTEM=900；卷帘偏移 120。
- `useCreateManagedVectorLayer`：Canvas 路径双层共源；feature 样式备份 + `setStyle(null)`。
- `useManagedLayerStyle`：`buildGeometryStyle`（去 Text）+ `buildLabelOnlyStyle`。
- `useUserLayerActions` / highlight / registry：labelLayer 显隐、透明度、移除、zIndex 同步。

## 架构关系（L2 ≥3 文件协同，§2.9）

```mermaid
flowchart LR
  subgraph FE[前端]
    Panel[FloatingAccountPanel / OverviewTab]
    Client[client.js 恒发 device-id]
    SSE[useRealtimeStats ticket/reconnect/beacon]
    OL[OL 双层 geometry + label]
  end
  subgraph BE[后端]
    Ticket["/statistics/ticket presence_id"]
    Stream["/statistics/stream"]
    Ping["/presence/ping · /offline"]
    Tracker[OnlineUserTracker]
    Merge[_merge_online_tracker]
    Auth[require_login / session]
    Proxy[/api/proxy external_proxy]
  end
  Client -->|换 ticket| Ticket
  Ticket --> Stream
  Stream --> Tracker
  SSE -->|断线/关页| Ping
  Ping --> Tracker
  Auth -->|mark_presence_active| Tracker
  Tracker --> Merge
  Merge -->|online_stats / center| Panel
  Client -->|搜索/天气/EPSG| Proxy
```

**变更后在线口径**：内存 tracker 的 presence_id 集合（SSE ∪ 窗口内心跳，排除 `e:`）；DB sessions 仅对照字段 `online_users_db`。

## 修改原因

用户要求：按 `Docs/Force_command.md` 对**暂存区**多次不规范 commit 做 code review，修复潜在 bug，更新文档与文件树，整合为 **V3.6.6**，并给出 commit message。**不准动 git**（不 add/commit），便于查看 changes 状态。

## 影响范围

- 实时在线统计口径（登录 + 游客 presence 去重）。
- 鉴权：过期 token 一律 401（不再被 device-id 吞成游客）；`require_api_access_or_guest` 端点仍允许游客（设计如此）。
- SSE ticket 载荷语义（username → presence_id）。
- external JSON 代理恢复；前端搜索/地理编码/天气/EPSG 依赖 `/api/proxy`。
- OL 托管矢量层渲染架构（双层 + zIndex 夹心）。
- 文档：结构树 / CHANGELOG / README / Logs / project-structure Docs 树。
- **无**新增 L1/L3 配置 key；**无**场景数据/TOC 业务变更（OL 渲染分层属图层显示架构）。

## 解决方案

| 候选 | 说明 | 结论 |
|---|---|---|
| A. 仅加 DB 游客 last_seen 统计 | 不动 tracker | 否：双身份与僵尸 SSE 仍在 |
| B. 恢复 5s 心跳 | V3.5.19 旧模型 | 否：与零轮询设计冲突 |
| **C. presence_id + TTL + 展示统一 + 关页 beacon + review 修复** | 身份稳定、幽灵可清、口径一致 | **采用** |
| D. 不恢复 external_proxy，前端改直连 | 避免 HF 灰区 | 否：密钥进前端且改动面大；恢复后端代理，部署策略归用户 |

## 性能指标

未做压测。tracker 为内存字典；presence/offline 为单次内存写；ping 仅在 SSE 断开且页面打开时触发（25s）；`_merge_online_tracker` 每次广播多一次 guest COUNT；OL 双层共享同一 VectorSource，要素数不变、多一层 draw。

## 测试方案

### Agent 已执行

- `uv run --with pytest python -m pytest tests/test_realtime_stats.py -v` → **14 passed**（含 registered+device_id → `u:`）
- `uv run python scripts/check_app_import.py` → **[OK] import app 通过**，路由 119 条，无 `/proxy/*` 与 `/tiles/*` 瓦片中转
- `python Scripts/CheckStructureTree.py` → 文档 482 · 磁盘 482 · 漏登记 0 · 幽灵 0 → **✅**
- `python Scripts/CheckConfigRegistry.py` → B1–B4 / F1–F3 全通过 → **✅**
- presence_id 手工断言：`reg+device→u:alice`、`guest+device→g:...`、`guest no device→e:...`、`admin→u:admin`
- Force_command §11.2 红线四条 rg：REDLINE-1/3/4 CLEAN；REDLINE-2 仅 Cesium `maxRayDistance`/`raymarch` 字面量误命中
- **未执行任何 Git 写操作**

### 待用户实机验证

1. 重启后端 + 前端后，3 个不同浏览器/设备 → 速览条应为 **3 人在线**。
2. 全部关闭 → 约 1～2 分钟内降至 0（offline beacon + TTL），不应卡在 2。
3. 同浏览器登录/退出 → 不因游客+账号双计 +1；登录后应显示 `u:` 身份。
4. 登录态 token 过期后刷新 → 应提示重新登录，**不得**静默变成游客仍显示已登录 UI。
5. 管理员 `GET /api/statistics/admin/online-debug` 核对 `online_presence_ids`。
6. 导入 KMZ/GeoJSON → 几何颜色保留，标注可开关，且数据标注文字在瓦片注记之上。
7. 搜索/逆地理/天气/EPSG → `/api/proxy/*` 不再 404（需后端配置高德 key 池）。

## 平台红线自查（§11.2）

| 命令 | 结果 |
|---|---|
| REDLINE-1 | **CLEAN** |
| REDLINE-2 | **CLEAN（业务无代理）** — 字面量误命中 Cesium `maxRayDistance`/`raymarch` |
| REDLINE-3 | **CLEAN**（presence ping 非 `/api/keepalive`，无防休眠） |
| REDLINE-4 | **CLEAN**（未改生产基线三项） |

**§11.1.8 说明**：未恢复 HF keep-alive / UptimeRobot。presence ping 仅在「用户已打开页面且 SSE 断开」时请求。

## 门禁结果（2026-09-18 本次收尾）

- `CheckStructureTree.py`：482 · 482 · 漏登记 0 · 幽灵 0 → **✅**
- `CheckConfigRegistry.py`：B1–B4 / F1–F3 → **✅**
- 本次**无新增配置 key**，无需改 `.env.example` / `catalog.py`（external_proxy 既有 key 已登记）
- `check_app_import.py` → **✅**（119 路由）
- `test_realtime_stats.py` → **14 passed**

## 变更文件清单

### 本次 review 工作区改动（相对暂存区，待你 `git add` 后一并提交）

| 路径 | 说明 |
|---|---|
| `backend/api/auth/dependencies.py` | `require_login`：无效 Authorization 不再 guest 兜底 |
| `backend/api/realtime_stats.py` | `presence_id_from_fields`：非 guest 账号优先 `u:` |
| `backend/app.py` | 共享 `http_client` `follow_redirects=False` |
| `backend/api/external_proxy.py` | 清理未用异常变量 |
| `backend/scripts/check_app_import.py` | 门禁文案澄清 `/api/proxy` 灰区 |
| `backend/tests/test_realtime_stats.py` | +1 例 registered 残留 device_id |
| `frontend/.../useRealtimeStats.js` | offline beacon：登录态 keepalive fetch + Auth |
| `Docs/Guide/backend-structure.md` | 去重 external_proxy 条目 |
| `Docs/Guide/frontend-structure.md` | 去重 MapDownloader；zIndex/下载注释对齐 |
| `Docs/Guide/project-structure.md` | Docs 树补 26-09 与 TODO 标记 |
| `Docs/Guide/CHANGELOG.md` / `README.md` | V3.6.6 补 OL 夹心与 review 修复 |
| 本日志 | 重写并整合 review 结论 |

### 同批 staged（并入 V3.6.6）

| 路径 | 说明 |
|---|---|
| `backend/api/realtime_stats.py` 等 presence 全链路 | presence_id / TTL / ping / offline / admin debug |
| `backend/api/external_proxy.py` + `app.py` | JSON 代理恢复挂载 |
| `backend/api/auth/{dependencies,session,user}.py` | presence 标活 + 游客名派生 |
| `backend/api/statistics.py` | UPSERT 稳定 username；`_merge_online_tracker` |
| `backend/tests/test_realtime_stats.py` | 回归扩展 |
| `frontend/src/api/backend/client.js` | 恒发 device-id + 分享模式头 |
| `frontend/.../useRealtimeStats.js` 等 UI | 在线展示与 SSE 生命周期 |
| `frontend/src/domains/ol/layer/**` + MapContainer | OL 双层夹心 |
| `frontend/.../download.js` 等 | 下载 404 注释 |
| `Docs/TODO/plan-download-feature-git-marker.md` | 下载代码位置（tag `tile-download-last`） |
| `Docs/Guide/*` / README / Logs / traffic.json | 文档与结构树 |
| `frontend/.../TopBar.vue` | 中国 layer 22→26 |

## Code Review 结论（暂存区）

### 保留并合入 V3.6.6
1. presence_id 在线统计全链路 + review 修复
2. `external_proxy.py` + 挂载（HF 部署策略见风险）
3. OL geometry/label 双层夹心
4. 下载功能「已删接口」注释 + `plan-download-feature-git-marker.md`
5. TopBar 中国 layer 22→26
6. README 三处 V3.6.6 + 本地默认管理员说明

### 已在工作区修复、待你 `git add` 后一并提交
- 见上表「本次 review 工作区改动」

### 未改代码、仅记录
- `external_proxy` HF 政策灰区（部署决策归你）
- `/api/proxy/ipapi/country` 无鉴权依赖配额（历史行为）
- webhook 异步测试缺 `pytest-asyncio`（历史问题）
- `require_api_access_or_guest` 在无效 token 时仍降级游客（**设计如此**，用于搜索/天气等公开能力；与 `require_login` 过期 401 区分）

## 遗留与风险

- **未实机**：多设备在线数、代理环境下 offline beacon 到达率、OL 双层标注视觉未在生产验证。
- **webhook 异步测试**：`test_shutdown_webhook_watches_noop_when_idle` 缺 `pytest-asyncio`，非本次引入。
- **历史游客行**：DB 旧 `user_N` username 仍在；tracker 已改 presence_id。
- **presence ping 可被脚本刷 device-id 抬高在线**：公开端点无速率限制；若需要可另开 L2 加限流。
- **external_proxy 与 HF**：功能已恢复；推 HF Space 需自行评估第三方中转风险；必要时 HF 不挂该 router。
- **冷启动在线数**：后端重启后 tracker 空，在首位用户鉴权/SSE 前可能短暂显示 0（有 DB 对照字段 `online_users_db`）。
- **主工作区直接改写**：会话提示可能并发写 main worktree；若需隔离由你决定。
- **未跑 tsc --noEmit**：本批无新增 `.ts`；`useDownloadStore.ts` 仅注释行。
- **结构树**：已按磁盘实际文件对齐；若你本地另有未入库改动，以磁盘为准再调树。

## 零散修补

（无额外 L1 追加；L1 项已并入上表 review 修复）
