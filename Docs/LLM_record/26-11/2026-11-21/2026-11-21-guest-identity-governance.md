# 2026-11-21 游客身份治理：require_login fail-closed + 服务端签发游客身份 + 废随机 uid

- **日期与时间**：2026-11-21 12:20
- **任务等级**：L3（方案已获用户批准：按默认参数实施、合并单会话一次交付）
- **版本**：V3.7.6
- **方案文档**：`Docs/TODO/guest-identity-governance-plan.md`（含 Mermaid 图，批准记录见 §8 决策点）

## 问题分析

### 核心症状（P1-4 三项，2026-07-26 登记）

1. **分享模式旁路**：`require_login` 无 token 时凭 `?s=1` / `X-Share-Mode` / `X-Guest-Device-Id` 即铸造临时游客会话（fail-open），全部 18 个 `require_login` 端点实际语义为「登录或游客」。
2. **配额主体伪造**：游客配额桶 = `H(guest|device_id)`，device_id 纯客户端可控 → 每请求轮换即新桶，「每日限额」对故意绕过者无效（AI 对话走平台 Key，直接资金流失面）。
3. **随机 uid 回退**：无 device-id 时 `secrets.token_urlsafe` 每请求新身份 → `guest_identity_records` 无界增长 + 配额形同虚设 + 在线统计灌垃圾身份。

### 根本原因

匿名身份的信任锚完全在客户端：身份种子（device_id 头）可任意轮换、铸造入口（require_login 兜底）开在所有端点、无任何限频。

### 受影响模块

`backend/api/auth/*`、`backend/api/statistics.py`、`backend/api/realtime_stats.py`、`backend/app.py`、`backend/config/catalog.py`、`deploy/.env.example`；前端 `client.ts`、`services/auth.ts`、`router/index.ts`、`main.ts` 及新增身份服务两件。

## 解决方案（已批准方案要点）

| 措施 | 落地 |
|---|---|
| ① require_login fail-closed | 删除两处游客兜底分支，无 token 一律 401 `LOGIN_REQUIRED`（原 `GUEST_NO_TOKEN` 仅作前端兼容码保留） |
| ② 端点重分类 | 11 个端点转 `require_api_access_or_guest_noconsume`（游客可达、不扣配额），8 个收紧为严格登录 |
| ③ 服务端签发 | 新增 `POST /api/auth/guest/session`：HMAC-SHA256 token（gt1_ 前缀，TTL 24h）+ 尽力而为 SameSite=None Cookie；按 (XFF末跳IP, UA哈希) 限频 6 次/h（持 token 续期不计） |
| ④ 确定性派生桶 | 无 token 请求 `uid = H(XFF末跳IP \| UA)`（`_derive_uid_from_ip_ua`）；**device_id 不参与桶派生** → 轮换设备头不再产生新桶；废除随机回退 |
| ⑤ 记录有界化 | `guest_identity_records` 90 天保留期清理（启动 + 每 24h 后台任务，CancelledError 安全） |
| ⑥ 前端适配 | `X-Guest-Token` 头（无登录态时）、`ensureGuestSession()` 预签发（main.ts 非阻塞）、分享模式伪 token 铸造废除改真实签发、401 码分支兼容 |

### 方案实施中的偏差与决策（如实）

1. **重分类表 +2**：方案 §3.1 表列 9 个转宽松端点；实施中发现 `FloatingAccountPanel` 未登录挂载即调 `GET /auth/preferences` 与 `GET /auth/oauth/accounts`（面板 onMounted 触发），fail-closed 会把访客踢去登录页 → 这两个 **GET 读端点**一并转 `or_guest_noconsume`（写操作仍严格）。共 11 个。
2. **`_build_guest_uid` 不改内部**：方案原述「改造 `_build_guest_uid`」，实施发现 `realtime_stats.device_presence_id`（在线去重）依赖其 device 派生语义 → 保留原函数不动（加警告注释），新增 `_derive_uid_from_ip_ua` / `_extract_identity_ip` 承担桶派生。
3. **游客快速登录（user/user）同治**：`/auth/login` 游客分支的桶派生同步改为「验签 token 优先，否则 H(末跳IP|UA)」（原按可轮换 device_id，属同源伪造面）。

## 修改内容

1. **feat**：游客身份签名 token 体系（`guest_token.py`：签发/验签/滑动窗口限频器，单 worker 语义与 LOGIN_THROTTLE 一致，限频键刻意不含 device_id）。
2. **feat**：`POST /api/auth/guest/session` 签发端点（503 降级：`GUEST_TOKEN_SECRET` 未配置时签发关闭、验签回落派生桶，可用性优先）。
3. **fix**：`require_login` fail-closed + 11 端点显式游客化（语义显式化，无行为回退——这些端点此前就在被游客使用）。
4. **fix**：无 token 派生桶确定性化 + XFF 末跳提取（不读客户端可写的 `X-Client-IP`/首跳）。
5. **fix**：游客快速登录配额桶收敛（同 4）。
6. **feat**：游客身份记录 90 天保留期后台清理。
7. **feat**：前端 `X-Guest-Token` 通道 + `ensureGuestSession` 预签发 + 分享模式真实签发（伪 token 铸造废除）。
8. **fix（交付修补）**：`apiAuthGuestSession` 补 `{ silent: true }` —— 交付后用户实机即见「503 游客身份签发未启用」全局 toast，暴露签发失败未静默的缺陷（拦截器 `error.config?.silent` 契约漏传）。修复后 503/429/网络失败均静默降级，与设计一致；eslint / vue-tsc 复验 0 问题。
8. **chore**：4 个配置 key 登记（L3 `GUEST_TOKEN_SECRET`；L2 TTL/限频/保留期）。

## 影响范围

- 鉴权依赖链（require_login 语义）、游客配额口径、在线统计身份源、分享模式、AI 对话游客限额；
- 登录用户路径零变化（session 校验、配额主体、OAuth 均未动）；管理员路径零变化；
- 统计口径唯一跳变：无 device-id 访客从「每请求一身份」收敛为「每 (IP,UA) 一身份」——该流量本就是垃圾洪泛，跳变即修复效果。

## 性能指标

未实测（本机无完整运行环境）。预期：`/auth/guest/session` 为新增低频端点；派生为纯内存哈希；限频器 O(1) 摊还 + 10 分钟增量清理；无额外每请求 DB 开销。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `pytest tests/test_guest_identity.py tests/test_sqlite_recovery.py tests/test_config_env_loading.py` → **28/28 绿**（15 新测：签发/验签往返、篡改载荷/签名、过期、错 secret、垃圾输入、未配置降级、限频 per-key 隔离、device 轮换不影响桶、双命名空间不撞、purge 只删超期行/0 天 no-op） | ① `GUEST_TOKEN_SECRET` 配置后：清 localStorage 访问站点 → DevTools 见 `POST /api/auth/guest/session` 200 且 localStorage 出现 `webgis_guest_token` → 15s 统计轮询请求头带 `X-Guest-Token` |
| `unittest tests.test_guest_identity tests.test_sqlite_recovery tests.test_config_env_loading tests.test_agent_map_context tests.test_historical_imagery` → **40/40 绿** | ② 匿名伪造：脚本轮换 `X-Guest-Device-Id` 调 AI 对话 100 次 → `api_usage_daily` 桶不增长（派生桶恒定）、`guest_identity_records` 不增行 |
| `vue-tsc --noEmit` → **0 错误**（前后基线一致） | ③ 签发限频：同 (IP,UA) 第 7 次新签发/小时内 → 429 `GUEST_ISSUE_LIMITED`；持 token 续期不受限 |
| `eslint`（7 个触碰文件）→ **0 problems** | ④ 未登录访客全链路：首页加载/用户中心面板/公告/留言/偏好读取无 401 弹窗、无跳转登录 |
| `CheckStructureTree.py` → **738/738** | ⑤ 分享模式：`?s=1` 链接打开 → 真实签发身份、在线统计计入、AI 对话受游客限额 |
| `CheckConfigRegistry.py` → **全绿（catalog 138 key）** | ⑥ 登录用户回归：登录/`/auth/me`/偏好/改密/OAuth 绑定行为与改造前一致 |
| §11.2 红线扫描 → 仅命中已知假阳性 `maxRayDistance`（体积云 raymarch 参数，逐条核实非禁项）；生产基线三项无破坏 | ⑦ secret 未配置环境：签发 503、浏览正常（派生桶）、启动日志无异常堆栈 |
| 全量 pytest 受本机缺依赖限制：`pyproj` 缺失致 `test_cors_middleware` 导入链断、`pytest-asyncio` 缺失致 webhook 异步测试无法收集——**均为既有环境限制，与本改动无关**（相关域 40 测试已全绿） | ⑧ HF 部署后 Secrets 增加 `GUEST_TOKEN_SECRET`（随机 32+ 字符）并重启 Space |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/api/auth/guest_token.py` | **新增**：HMAC 签发/验签/限频器（单一职责新文件） |
| `backend/api/auth/constants.py` | 新增 `_derive_uid_from_ip_ua` / `_extract_identity_ip`；`_build_guest_uid` 加限用警告注释；移除已无引用的 `_is_guest_allow_request` |
| `backend/api/auth/dependencies.py` | require_login fail-closed；`_extract_guest_token`；临时游客会话改「验签 token → 派生桶」；删除 `_has_auth_credential_header` |
| `backend/api/auth/routes.py` | 新增 `POST /guest/session`；游客快速登录桶收敛；`/me` `/oauth/accounts` `GET /preferences` `/download-quota/estimate` 转宽松 |
| `backend/api/statistics.py` | center/realtime/messages/announcement×2 转 `or_guest_noconsume` |
| `backend/api/realtime_stats.py` | ticket/heartbeat 转宽松 |
| `backend/api/auth/user.py` | `_purge_stale_guest_identities_sync` + `guest_identity_retention_task` |
| `backend/app.py` | lifespan 启动/停止清理任务 |
| `backend/config/catalog.py` | 4 个新 key 登记 |
| `deploy/.env.example` | 4 个新 key + L3 注释 |
| `backend/tests/test_guest_identity.py` | **新增**：15 个单测 |
| `frontend/src/domains/common/user/services/guestTokenStore.ts` | **新增**：token 本地存储（叶子模块） |
| `frontend/src/domains/common/user/services/guestIdentity.ts` | **新增**：ensureGuestSession / injectGuestTokenForShareMode / resetGuestIdentity |
| `frontend/src/api/backend/auth.ts` | + `apiAuthGuestSession` |
| `frontend/src/api/backend/client.ts` | X-Guest-Token 附加；401 分支兼容 `LOGIN_REQUIRED` |
| `frontend/src/domains/common/user/services/auth.ts` | 伪 token 铸造废除（职责移 guestIdentity）；+ `setGuestUserSnapshot`；移除 useMessage 死导入 |
| `frontend/src/router/index.ts` | 分享模式注入改 await + 新导入源 |
| `frontend/src/main.ts` | 非阻塞预签发 |
| `Docs/Guide/frontend-structure.md` / `backend-structure.md` | 结构树补录 4 个新文件 |
| `Docs/TODO/guest-identity-governance-plan.md` | 方案文档（🟡→🔵） |
| `README.md` / `Docs/Guide/CHANGELOG.md` / `Docs/TODO/bugfix-optimization-plan.md` | 版本三处 / 条目 / P1-4 三项销项 |
| `Docs/LLM_record/26-11/2026-11-21/2026-11-21-guest-identity-governance.md` | 本日志 |

## 遗留与风险

1. **待用户配置**：HF Secrets 新增 `GUEST_TOKEN_SECRET`（未配置 = 签发 503，功能自动降级到派生桶，不阻塞上线）。
2. **限频误伤共享网络**（校园/CGNAT）：同出口多人首次集中访问可能 429；文案已引导登录，阈值 L2 可调（`GUEST_ISSUE_RATE_PER_HOUR`）。
3. **匿名绕过未根绝**（方案 §2 非目标已声明）：换 UA+出口 IP 仍可低成本造桶；Phase 2（同域部署 Cookie 信任锚 / per-IP 全局备选闸）另行立项。
4. **本地伪 token 存量**：旧 sessionStorage 中 `guest_<ts>_` 形态 token 由 `getBackendBearerToken` 守卫兼容拦截，用户清缓存后自然消失。
5. **暂存区异常观察**：本会话部分文件在 `git status` 中显示已暂存（A/M 首列），Agent 未执行任何 git add——疑似 IDE/并行会话行为，提交前请人工复核暂存区。
6. **后续项登记**：管理员接口掩码化（P2）、代理 SSRF 加固（L3）仍按台账另行推进。
