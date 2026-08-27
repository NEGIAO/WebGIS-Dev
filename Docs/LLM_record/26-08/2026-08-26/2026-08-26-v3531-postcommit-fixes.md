# 2026-08-26 — V3.5.31 提交后工作区修复：统一图层管理跨模块链路 P1×2 + P2×3

- **日期与时间**：2026-08-26 19:40
- **任务等级**：L2

## 问题分析

- **核心症状**：V3.5.31 已由用户提交（d508ae58）。本会话对该提交内容做全面 Code Review（主会话人工审查 cesium/ol/viewScale/i18n diff + 两个子代理分别审查 layer-tree 与 viewScale），发现 2 个 P1 运行期缺陷与 3 个低风险改进项。全部修复以**工作区编辑**方式落地（未执行任何 git 写操作，未加入暂存区）。
- **根本原因**：
  1. capabilitiesProxy 采用「后写覆盖」单例——Cesium 引擎挂载时其 builder 覆盖常驻 OL builder，而 CesiumContainer 卸载时只反注册 actionRouter 不恢复 OL builder → 进过一次 3D 后，能力文档拉取永久绕过 `TILE_PROXY_MODE==='off'` 门控与同源排除；
  2. cesiumTocActions 分流器假设事件载荷形如 `{layerId}` 且组头 id 带 `cesium:` 前缀，但实际 commandDispatcher 发出的 `folder-clear-layers` 载荷是 `{nodeId}`（经 TOCTreeItem.emitAction 平铺到 evt 顶层），且「三维数据」组头 id 为 `cesium-data-group` 不带前缀 → 组头清空动作提前 return false，穿透到通用兜底分支收集出 `cesium:*` 叶子逐个 emit('remove-layer')，而 HomeView.handleRemoveLayer 无 cesium 分支 → **组头「清空全部数据」实际不删除任何三维数据**。
- **受影响模块**：`common/basemap/capabilitiesProxy.ts`、`cesium/layers/toc-adapters/cesiumTocActions.js`、`common/basemap/remoteServices.ts`、双引擎注册点。

## 修改内容

| 级别 | 文件 | 问题与修复 |
|---|---|---|
| P1 | `common/basemap/capabilitiesProxy.ts` | 单例后写覆盖 + 无注销机制 → 改为按 owner 键注册表；`getCapabilitiesProxyBuilder` 返回合成链（按注册序首个非空结果），OL 先注册且自带门控天然优先 |
| P1 | `cesium/layers/toc-adapters/cesiumTocActions.js` | 组头清空死代码：识别 `CESIUM_GROUP_NODE_ID`（`cesium-data-group`）组头节点；`extractLayerId` 兼容平铺的 `evt.nodeId`；`folder-clear-layers` case 前移至 id 解构之前（组头无记录 id） |
| P2 | `ol/components/MapContainer.vue:866` | 注册时显式传 owner `'ol'` |
| P2 | `cesium/composables/layers/useCesiumLayers.js` | 注册时显式传 owner `'cesium'`；`cleanupLayers()` 尾部 `setCapabilitiesProxyBuilder(null, 'cesium')` 注销，自动回落常驻 OL 构造器 |
| P2 | `common/basemap/remoteServices.ts` removeRemoteServiceSublayer | 存量空选未触碰记录（WMS 默认全选语义）直接 drop 空数组 → 「移除一项」变「其余全部消失」。剔除前先经 `effectiveSelectedIds` 展开再 drop |
| P2 | `common/basemap/remoteServices.ts` registerRemoteService | 同 URL 重注册传空 selectedIds 时 normalize 拉平为全选并置 selectionTouched → 覆写用户已勾掉的选择。已触碰+空选时保留原选择集不覆写 |
| P3 | `common/basemap/xyzWmtsCapabilities.js` | 文件中部 import 移至头部（ESM 提升后可运行，纯风格） |

## 修改原因

- 用户指令：「修复潜在的 bug」（P1/P2 属授权范围）；P3 为审查代理建议的低风险顺手修。
- 严格约束：不动 git、不擅自加暂存区——所有修改停留在工作区，交由用户查看后自行决定暂存。

## 影响范围

- 能力文档拉取链路（WMS/WMTS/ArcGIS f=json 直连失败兜底）：2D↔3D 反复切换后门控行为恢复正确
- TOC「三维数据」分组组头右键「清空全部数据」：从完全失效修复为逐条走 adapter 清场景
- 在线服务子图层管理：叶子移除不再误清其余勾选；重复注册不再覆写用户选择
- 不影响：viewScale 数学链路、TOCPanel 拆分结构、i18n 词表（均验证无问题）

## 解决方案

- capabilitiesProxy 注册表方案对比过两个备选：(a) CesiumContainer.onUnmounted 里重新注入 OL builder——需处理 MapContainer 生命周期耦合，弃；(b) 按 owner 注册表 + 链式回落——零生命周期耦合，引擎差异化代理语义天然保留，采纳。
- cesiumTocActions 修复选择在分流器侧兼容组头节点而非改 commandDispatcher 载荷形态——后者会影响全部既有菜单命令的事件契约。

## 测试方案

**Agent 已执行**：无（本批为逻辑修复，静态验证为主）

**静态验证**：
- capabilitiesProxy 合成链：`builders.size===0` 时返回 null（消费端 `buildProxyUrl?.(url)` 可选链兼容）✅
- 组头清空路径推演：contextMenu(FOLDER_CLEAR_LAYERS) → commandDispatcher({type:'folder-clear-layers', payload:{nodeId:'cesium-data-group'}}) → TOCTreeItem.emitAction 平铺 {type,nodeId} → handleCesiumLayerTreeAction 识别组头 → records 逐个 remove ✅
- removeRemoteServiceSublayer 对已触碰记录行为不变（effectiveSelectedIds 原样返回 ids）✅

**待用户实机验证**：
1. 进 3D 再切回 2D，注册一个直连失败的内网 WMS，确认 TILE_PROXY_MODE=off 时不走代理（此前会绕过）；
2. 3D 模式上传 ≥2 个数据，TOC「三维数据」组头右键「清空全部数据」，确认场景与树同时清空；
3. WMS 服务不勾选任何子图层直接注册（存量语义），右键移除其中一个叶子，确认其余仍显示。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/basemap/capabilitiesProxy.ts` | 单例改按 owner 注册表 + 合成链读取 |
| `frontend/src/domains/cesium/layers/toc-adapters/cesiumTocActions.js` | 组头节点识别 + nodeId 兼容 + 清空 case 前移 |
| `frontend/src/domains/ol/components/MapContainer.vue` | 注册点补 owner 'ol' |
| `frontend/src/domains/cesium/composables/layers/useCesiumLayers.js` | 注册点补 owner 'cesium' + cleanupLayers 注销 |
| `frontend/src/domains/common/basemap/remoteServices.ts` | 子图层移除先展开有效选择集；重注册保护已触碰选择集 |
| `frontend/src/domains/common/basemap/xyzWmtsCapabilities.js` | import 移至文件头 |
| `Docs/LLM_record/26-08/2026-08-26/2026-08-26-v3531-postcommit-fixes.md` | 本日志 |

## 遗留与风险

- contextMenu.js 及 node builders 的中文硬编码 label（三维菜单项/『二维数据』组名等）为存量惯例，i18n 化需另立任务（规范上属硬伤但涉及面广，未在本批扩权处理）。
- remoteServices 重注册保护仅在「已触碰+空选」分支生效；若上游未来传入非空但不完整的 selectedIds 仍会覆盖——当前调用方均为全量勾选集，无此场景。
- 本批 6 个代码文件修改均未暂存，等待用户审阅。

---

## 零散修补（同日追加）

### SSE 实时统计流 CORS 凭据冲突（2026-08-26 20:05）

- **症状**：生产环境 `webgis.negiao.cn` 建立 `/api/statistics/stream` SSE 连接被浏览器 CORS 拦截——`The value of the 'Access-Control-Allow-Credentials' header in the response is '' which must be 'true' when the request's credentials mode is 'include'`。
- **根因**：前端 [useRealtimeStats.js:171] 以 `new EventSource(url, { withCredentials: true })` 建连（凭据模式），浏览器强制要求响应带 `Access-Control-Allow-Credentials: true`；而后端 app.py CORSMiddleware 为 `allow_credentials=False` → 响应缺失该头 → 连接 401 化失败（net::ERR_FAILED 200）。
- **修复**（用户明确指示「后端默认 allow all」）：app.py 改为 `allow_credentials=True`；白名单缺省仍为 `["*"]`（allow all）——Starlette 在 credentials 模式下自动把通配来源回显为具体请求 Origin，浏览器判定通过。移除「白名单已启用」条件日志（allow all 为默认态不再特殊提示）。nginx 各段无 CORS 头注入，响应头全部来自 FastAPI 层，改动即全链生效。
- **说明**：后端鉴权实际走 Authorization header + query ticket，不依赖 cookie；前端 `withCredentials: true` 属防御性声明（未来若引入 cookie 会话可直接工作），保留不动。
- **验证**：ast 语法检查 ✅ / CheckConfigRegistry ✅ / 待部署 HF Space 后实机确认 SSE onopen。
- **变更文件**：`backend/app.py`（CORS 中间件段）。
