# 2026-07-27 Agent `override_base_url` 平台 Key 外泄修复（规划 P1-4 [P0 安全]）+ 07-26 版本账目对账补录

- **日期与时间**：2026-07-27 15:20
- **所属版本**：V3.4.63（⏭️ 顺延说明：会话期间并行会话连续占用 V3.4.59–V3.4.62，按 Force_command §5 后完成者顺延；写入前已 grep 复核 README 实际版本为 V3.4.62）
- **任务等级**：L3（安全行为变更 + 新增 2 个 L1 配置 key）
- **方案文档**：`Docs/TODO/agent-override-key-leak-plan.md`（本会话产出，用户批准口径「a+c，白名单默认关」）
- **附带**：07-26 五会话并行连环撞号导致的 CHANGELOG 记录空洞对账补录（L1 文档修补，不单独占版本号）

---

## 问题分析（事件逻辑链条）

### 核心症状

任意**游客或登录用户**（两端点依赖 `require_api_access_or_guest`，游客亦放行）发一个带
`override_base_url` 但**不带** `override_api_key` 的请求，后端即把**平台 API Key** 以
`Authorization: Bearer <key>` 明文发往调用方指定的服务器。

### 根本原因

`routes.py` 中 `api_key` 与 `base_url` 的回退**各自独立、无耦合校验**：

| 端点 | 原行号 | 现状 |
|------|--------|------|
| `POST /api/agent/chat/completions` | 144–151 | `api_key = override_api_key if … else runtime.api_key`；`base_url = _normalize_base_url(override_base_url) if … else runtime.base_url` |
| `GET /api/agent/models` | 613–626 | 同构；且为 **query 参数**形式，一条 URL 即可触发，**不消耗配额** |

**放大链路**（`upstream.py`）：无 override key 时 `api_key_candidates` = 平台主 Key + **全部备用 Key**（`db.py:743`）；
`_call_upstream_chat_with_key_candidates`（366–415）在上游 401/403 时经 `_is_agent_key_retryable_error`
（detail 含 "key" → True）**逐个换 Key 重发** → 攻击者服务器恒返 401 即可在**单次请求内收割整个 Key 池**。
凭据出站位置：`upstream.py:270–273`（chat）、`564–567`（models）。

### 规划口径纠偏（Force_command §2.6，逐行核实后修正规划原文）

- ❌ `/chat/default-proxy` **不成立**：只接受 `override_model`（routes.py:428–430），key/base_url 恒读 DB，源码注释已写明不允许覆盖；
- ➕ 规划漏列的 `/chat/proxy`：调用方**必须自带** api_key+base_url+model，后端从不附平台 Key → 无 Key 泄漏，但属 SSRF 面 → 归 P1-4「代理 SSRF 加固」；
- ✅ 实际成立面 = `/chat/completions` + `/models` 两处。

### 已核实排除的疑点

`httpx` 锁定 **0.28.1**（`backend/uv.lock:803`），其 `_redirect_headers` 在跨源重定向时**剥离 Authorization**
（仅 http→https 同 host 升级例外）→ 「白名单 host 用 302 跳转偷 Key」路径不成立，本次无需处理。

### 受影响模块

Agent 对话链（两端点参数解析）、配置登记面（catalog + 根 `.env.example`）、前端 Agent 配置草稿透传逻辑。

## 修改内容

1. **新增单点护栏** `api/agent_chat/utils.py`（3 个新函数，均带「功能/参数/返回/核心逻辑」注释）：
   - `_validate_override_base_url(raw, *, has_override_key)`：① **成对校验**（无 key 即 400，fail-closed）→
     ② 协议仅 https（http 仅在 `AGENT_ALLOW_INSECURE_BASE_URL=true` 且指向回环时放行）→ ③ 私网/回环/链路本地/保留段拒绝 →
     ④ 白名单（`AGENT_ALLOWED_BASE_URL_HOSTS` 非空时才生效）→ 通过则返回 `_normalize_base_url` 结果；
   - `_coerce_ip_literal(hostname)`：按 C 库 `inet_aton` 语义归一 IP 字面量——`2130706433` / `0x7f000001` /
     `127.1` / `0177.0.0.1` 全部还原为 `127.0.0.1`（**只按点分十进制过滤会被这些写法绕过**，即规划中 P1-4 点名的绕过手法）；
   - `_is_disallowed_override_host` / `_is_loopback_host`：本机名与内网后缀（`.local`/`.internal`/`.home.arpa`/`.localhost`）字面量拒绝 + IP 属性判定。
2. **`routes.py` 两处接入**：`/chat/completions` 与 `/models` 的 base_url 解析改调护栏函数并传 `has_override_key`。
3. **前端成对透传**（`useChatAgentConfig.js` 两处）：草稿模式原为两条独立 `if`（只填 Base URL 不填 Key 即命中泄漏路径），
   改为 `base_url && api_key` 才成对透传；只有 api_key 时仅传 key（沿用后端默认上游）。
4. **配置登记（顺序：先登记后写码）**：`backend/config/catalog.py` + 根 `.env.example` 新增
   `AGENT_ALLOWED_BASE_URL_HOSTS`（L1，默认空=不启用白名单）与 `AGENT_ALLOW_INSECURE_BASE_URL`（L1，默认 false）；
   常量在 `constants.py` 经统一 loader 读取（`get_str`/`get_bool`，无裸 `os.getenv`）。
5. **文档**：新增方案文档并登记 `project-structure.md`；规划 P1-4 该条勾选。

### 补充修复（收尾复核审计发现的第二道门，非方案文档原列项）

护栏落地后另起一次只读审计（覆盖 `backend/api/` 全部「出站 + 附后端凭据」组合），发现**同一泄漏语义的持久化入口**——
方案文档只盯了请求体/query 的 `override_base_url`，漏了「写库再读回」这条：

6. **`POST /user-config` 写入侧校验**（`routes.py`）：`AgentUserConfigUpdateRequest.base_url` 原仅限长度
   （`schemas.py:69`、`db.py:250` 只 strip+截断），且与 `api_key` **互相独立**——用户可只存 base_url 不存 Key；
   随后 `_resolve_effective_agent_runtime_sync`（`db.py:731`）以用户行优先返回该 base_url，而个人 Key 为空时
   `api_key_candidates` 落到**平台 Key 全池**（`db.py:742–743`）→ 与 override 完全等价的泄漏，且**一次写入长期生效**。
   现改为：提交含非空 base_url 时，用**同一护栏函数**校验（`has_override_key` 取「本次提交的 api_key」或「库中已存个人 Key」）。
7. **runtime 读回侧兜底**（`db.py`）：个人 base_url **仅在同时配了个人 Key 时生效**，否则回退平台上游——
   覆盖护栏上线前**已存库的历史行**（写入侧校验管不到存量数据）。
8. **`/models` 全局缓存污染**（`routes.py`）：原无条件把上游返回写入全局 `system_config.agent_available_models`
   （`db.py:751–782`），调用方用自选服务商查询即可污染**其他用户**的 fallback 列表与 `/chat/config` 展示；
   改为仅在**未使用 override** 时缓存。

### 未采纳的方案条目（诚实记录）

方案文档第 3 项「`upstream.py` 增 `allow_key_rotation` 参数」**未实施**：成对校验落地后 override 路径的
`api_key_candidates` 恒为**单元素**（`[override_api_key]`），该参数在现有代码中不可能为 True 之外的取值发挥作用，
属死参数；防御价值仅对「未来有人绕过 routes 校验」的假想场景，权衡后不引入。

## 修改原因

规划 P1-4 自注「建议下一会话最高优先级」的 [P0 安全] 项：平台 Key 泄漏 = 攻击者可无限量消耗项目 LLM 额度，
且备用 Key 池一并失守；`/models` 为 GET 且不耗配额，利用成本极低。

## 影响范围

- **鉴权/凭据面**：平台 Key 不再随调用方 base_url 出站；
- **行为变更（有意收紧）**：只填 Base URL 不填 API Key 的调用now 返回 400（此前"能用但泄漏 Key"）；
- **能力保留**：个人 Key 模式接任意 OpenAI 兼容服务商**不受影响**（白名单默认关闭，仅要求成对提供 Key）；
- **不受影响**：`/chat/default-proxy`、`/chat/proxy`、默认模式对话（未传 override 时护栏不介入，空值直接返回空串）。

## 解决方案（候选对比见方案文档）

选定 **a（成对校验）+ c（协议/私网护栏）**，b（host 白名单）降级为默认关闭的可选开关——
默认开启会砍掉「个人 Key 接任意服务商」这一既有产品能力。

## 性能指标

无（每请求增加一次 URL 解析与 IP 判定，微秒级；未使用 override 时零开销）。

## 测试方案

**Agent 已执行（沙盒静态 + 单测）**：

| 项 | 结果 |
|---|---|
| `py_compile`（utils/routes/constants/catalog 四文件） | ✅ |
| 护栏定向单测 **23/23 通过** | A 成对校验（无 key 拒 / 成对放行）；B 协议（http 拒、非 http(s) 拒）；C 私网 11 例全拒（含 `2130706433`/`0x7f000001`/`127.1`/`0177.0.0.1`/`[::1]`/`169.254.169.254`/`foo.internal`）+ 公网域名与公网 IP 放行；D 白名单开启后仅白名单及其子域放行；E `http+回环` 仅开关开启时放行、内网非回环恒拒；F 空值透传 |
| `CheckConfigRegistry.py` | ✅ 7/7 全绿（58 key，含新增 2 个） |
| `CheckStructureTree.py` | ✅ 390/390，漏登记 0 幽灵 0 |
| ESLint（`useChatAgentConfig.js`） | ✅ 零问题 |
| `tsc --noEmit`（全前端） | ✅ 业务代码零错误（12 项均为 cesium 模块解析环境噪音）——连带销项 P0-2 疑虑 |

**待用户实机验证（沙盒无 uvicorn/vite，Agent 端点未起服务）**：

1. 默认模式对话正常（不传 override → 护栏不介入）；
2. 个人 Key 模式：填 Base URL + API Key → 模型列表加载 + 对话正常；
3. 草稿只填 Base URL 不填 Key → 前端不再透传（后端若被直接调用应返回 400 且提示成对提供）；
4. 攻击面验证（可选）：`curl` 直呼 `GET /api/agent/models?override_base_url=https://example.com` 应得 400 而非向该地址发起请求；
5. 本地自建上游（如 ollama `http://127.0.0.1:11434/v1`）：需在 `.env` 置 `AGENT_ALLOW_INSECURE_BASE_URL=true` 方可使用。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/api/agent_chat/utils.py` | 新增 4 个护栏函数（含 IP 字面量归一）与相关 import |
| `backend/api/agent_chat/routes.py` | `/chat/completions`、`/models` 两处 base_url 解析接入护栏；import 补 `_validate_override_base_url` |
| `backend/api/agent_chat/constants.py` | 新增两个配置常量（经统一 loader 读取）；import 补 `get_bool` |
| `backend/config/catalog.py` | 登记 `AGENT_ALLOWED_BASE_URL_HOSTS`、`AGENT_ALLOW_INSECURE_BASE_URL` |
| `.env.example` | 同上两 key + 用法注释（默认即安全，通常无需改） |
| `frontend/src/composables/chat/useChatAgentConfig.js` | 草稿模式 base_url/api_key 成对透传（两处） |
| `Docs/TODO/agent-override-key-leak-plan.md` | 新增 L3 方案文档 |
| `Docs/Guide/project-structure.md` | 登记上述新文件 |
| `Docs/TODO/bugfix-optimization-plan.md` | P1-4 该条勾选；P0-2、CHANGELOG 空洞两条顺带发现销项；B1 状态补录 |
| `Docs/Guide/CHANGELOG.md` | 本条目 + 07-26 空洞补录（V3.4.52/55/56/57/58 + V3.4.48 空号注记） |
| `README.md` | 版本三处 + 版本演进表 |
| `Docs/LLM_record/26-07/2026-07-26/*.md`（4 份） | 日志头版本号对账注记（原记版本 → 重排后版本） |

## 与并行会话的交叉（V3.4.64 P1-4 SSRF S1）

收尾期间并行会话把本次新增的 `_coerce_ip_literal` / `_is_disallowed_override_host` / `_is_loopback_host`
及两个常量**抽取到 `backend/utils/net_guard.py` 单点共用**（proxy/download_xyz 三处出站面共享同一判定），
`agent_chat/utils.py` 原位保留同名别名不改调用点。**已在抽取后重跑本次 23 项断言：仍 23/23 全绿**，语义无漂移。
本日志描述的判定逻辑现物理位于 `utils/net_guard.py`，`_validate_override_base_url` 本体仍在 `agent_chat/utils.py`。

## 遗留与风险

- **DNS 解析未做**：域名解析后指向内网（如攻击者把自有域名 A 记录指到 `169.254.169.254`）本轮**不拦截**——
  须与 P1-4「代理 SSRF 加固」的 `getaddrinfo` 方案统一实现，避免两处各写一套判定；本次已在函数注释中标注。
  ⚠️ 但注意：即便打到内网，Key 也已因成对校验而是调用方自己的 Key，**无平台凭据泄漏**。
  📌 后续：并行会话 V3.4.64 已落地 `PROXY_DNS_GUARD`（net_guard 单点），**建议下一会话把 agent 侧
  `_validate_override_base_url` 也接上同一 DNS 复判**，即可闭合本条。
- **护栏无自动化测试沉淀**：本次 23 项断言在沙盒临时脚本中执行，仓库 `tests/` 无对应用例（全仓亦无
  引用 `_validate_override_base_url` 的测试）；建议随 P3「TS 化/门禁」批次一并补后端单测目录。
- **实机回归欠账**：见测试方案第二栏，须用户本机执行。
- **顺带发现（未改，按 §2.5 登记）**：`Docs/TODO/` 下 `next-sprint-bugfix-and-optimization.md` 等 4 份文件未登记
  `project-structure.md` 的 Docs 树（门禁不覆盖该目录故未报警）；`next-sprint-…` 文件本身规划已宣告删除但仍存在（删除需用户执行）。

## 附：07-26 版本账目对账补录（L1 文档修补）

07-26 五个会话并行，出现连环撞号与 CHANGELOG 记录空洞。按 §5「后完成者顺延」以完成时序统一重排：

| 日志 | 原记 | 重排后 |
|---|---|---|
| account-panel-height-fix | V3.4.53（与后端安全批次撞号） | **V3.4.55** |
| b1-stable-feature-id-writeback | V3.4.54（与加载性能撞号） | **V3.4.56** |
| account-panel-header-blurbg-fix | V3.4.55 | **V3.4.57** |
| cesium-tool-panel-token-merge | V3.4.56（自注"以 README 为准"） | **V3.4.58** |

另补 V3.4.52 条目（README 有摘要、CHANGELOG 漏写），并为 **V3.4.48 登记空号说明**
（全仓库无日志认领，系并行期误判占号跳号所致，永久空置）。四份日志头已同步注记，规划文档三条顺带发现销项。
