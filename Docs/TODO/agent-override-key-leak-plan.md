# Agent `override_base_url` 平台 Key 外泄修复方案（L3 · 待批准）

- **日期**：2026-07-27
- **任务等级**：L3（安全行为变更 + 新增 L1 配置 key，按 Force_command §3 阶段二须先批准）
- **来源**：`bugfix-optimization-plan.md` P1-4「[P0 安全] agent `override_base_url` 致平台 Key 外泄」
- **状态**：✅ 已批准（口径「a+c，白名单默认关」）→ **已实施 V3.4.63**
  · 日志 `Docs/LLM_record/26-07/2026-07-27/2026-07-27-agent-override-base-url-key-leak-fix.md`
  · 实施差异：清单第 3 项 `allow_key_rotation` 参数**未采纳**（成对校验落地后 candidates 恒为单元素，属死参数，理由见日志）

---

## 一、问题分析（事件逻辑链条）

### 核心症状

任意**登录用户或游客**（端点依赖 `require_api_access_or_guest`，游客亦放行）向后端发一个带
`override_base_url` 但**不带** `override_api_key` 的请求，即可让后端把**平台 API Key**
以 `Authorization: Bearer <key>` 明文发往攻击者控制的服务器。

### 根本原因（逐行核实，非推断）

`backend/api/agent_chat/routes.py`：

| 端点 | 行 | 现状 |
|------|----|------|
| `POST /api/agent/chat/completions` | 140–151 | `api_key` 与 `base_url` **各自独立**回退：`api_key = override_api_key if override_api_key else runtime.api_key`；`base_url = _normalize_base_url(override_base_url) if override_base_url else runtime.base_url`。二者无耦合校验 → **只给 base_url、不给 key** 时，平台/个人 Key 配上攻击者 base_url 发出 |
| `GET /api/agent/models` | 604–626 | 同构（且为 **GET query 参数**，一条 URL 即可触发，更易被诱导点击/CSRF 式利用），且**不消耗配额** |

放大链路（`upstream.py`）：

1. `api_key_candidates` 在无 override key 时取 `runtime.api_key_candidates` ——即**平台主 Key + 全部备用 Key**（`db.py:743`）；
2. `_call_upstream_chat_with_key_candidates`（366–415）在上游返回 401/403 时，`_is_agent_key_retryable_error`
   因 detail 含 "key" 判定可重试（302–306、359–363）→ **逐个换 Key 重发**；
3. 攻击者服务器只需对每次请求恒返回 401，即可在**单次业务请求内收割整个 Key 池**。
   `_call_upstream_models_with_key_candidates` 同理。
4. 凭据落地位置：`upstream.py:270–273`（chat）与 `564–567`（models）的 `Authorization: Bearer {api_key}`。

### 📌 规划口径纠偏（Force_command §2.6「禁止臆造」，逐行核实后修正）

规划原文列了三个端点，实测**只有两个**成立：

- ✅ `/chat/completions`、`/models`：成立，如上。
- ❌ `/chat/default-proxy`（routes.py:400–436）：**不成立**。该端点只从 DB 读 `api_key/base_url/model`，
  仅接受 `override_model`（428–430，且源码注释已写明"不允许覆盖 api_key 和 base_url"）。无泄漏路径。
- ➕ 规划未列的 `/chat/proxy`（795–813）：调用方**必须自带** `api_key + base_url + model`，
  后端从不附平台 Key → **无 Key 泄漏**；但仍是「后端向任意 URL 发 POST」的 SSRF 面（见下）。

### 受影响模块

`backend/api/agent_chat/routes.py`（两端点参数解析段）、`backend/api/agent_chat/upstream.py`（可选：Key 轮换守卫）、
`backend/config/catalog.py` + 根 `.env.example`（新增 L1 key）、前端 `useChatAgentConfig.js`（**行为核对**：现有调用是否已成对传参）。

### 前端现状核对（决定是否会破坏功能）

`frontend/src/composables/chat/useChatAgentConfig.js`：

- 个人 Key 模式（`isDirectMode`）：227/345 行 **base_url 与 api_key 成对传**；
- 草稿模式：357–358、607–608 行为 `if (draftBaseUrl) …; if (draftApiKey) …` 两条**独立** if
  → 用户只填 Base URL 不填 Key 时会命中泄漏路径（把平台 Key 发往用户填的地址）。

**结论**：修复后需前端同步——只填 base_url 不填 key 时不再传 base_url（或提示补 Key）。属本方案范围内的配套改动。

---

## 二、候选方案对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|------|------|------|------|------|
| **a. 成对校验**（核心） | `override_base_url` 存在但 `override_api_key` 缺失 → **400 拒绝**；有 override key 时 candidates 只含该 key（现状已如此） | 直接切断泄漏、零配置维护、不影响「自带 Key + 自带服务商」的既有能力 | 不防 SSRF（后端仍会连任意外网地址，但只带调用方自己的 Key） | ✅ 必选 |
| **b. host 白名单** | 新增 L1 `AGENT_ALLOWED_BASE_URL_HOSTS`，非白名单 host 一律 400 | 同时防 SSRF | **会砍掉产品能力**：个人 Key 模式的卖点就是接任意 OpenAI 兼容服务商；白名单需持续维护 | ⚠️ 降级为**可选开关**（默认空=不启用），不作为默认行为 |
| **c. 私网/协议护栏** | 仅允许 `https://`（本地开发放行 `http://127.0.0.1`），解析后拒私网/回环/链路本地地址 | 防「拿后端当内网跳板」，不伤 BYO 服务商 | 需复用/加固 `proxy.py:_is_private_host`（该函数目前不解析 DNS，且 P1-4 另列了它的绕过问题） | ✅ 选（本次只做**不依赖 DNS 解析**的字面量+协议护栏，DNS 解析加固与 P1-4 SSRF 项一并做，避免两处分叉） |
| d. 平台 Key 永不出站 | 任何 override 存在即拒绝用平台 Key | 最严格 | 与 a 等价但更粗暴（override_model 单独出现属正常用法，不应拒） | ✖ |

**选定 = a + c，b 作为默认关闭的可选加固。** 理由：a 根治本条 P0；c 顺手堵内网跳板且零功能损失；
b 若默认开启会破坏「个人 Key 接任意服务商」这一既有产品能力，交由部署方按需启用。

---

## 三、实施清单（批准后执行）

1. **新增单点校验函数** `agent_chat/utils.py::_validate_override_base_url(raw, *, has_override_key) -> str`
   （新增函数带「功能/参数/返回/核心逻辑」注释，符合规范阶段三）：
   - `has_override_key=False` → 抛 `HTTPException(400, "override_base_url 必须与 override_api_key 同时提供…")`；
   - 协议非 `https`（例外：host 为 `localhost`/`127.0.0.1` 且 `AGENT_ALLOW_INSECURE_BASE_URL=true`）→ 400；
   - host 为 IP 字面量且属私网/回环/链路本地/保留段（`ipaddress` 判定，含 `2130706433` 这类整数字面量：先试 `ip_address(int)`）→ 400；
   - 可选白名单：`AGENT_ALLOWED_BASE_URL_HOSTS` 非空时，host 不在其中 → 400；
   - 通过则返回 `_normalize_base_url` 结果。
2. **`routes.py` 两处接入**：`/chat/completions`（151 行处）、`/models`（616–619 行处）改调该函数。
3. **`upstream.py` 防御性二道闸**（可选但建议）：`_call_upstream_chat_with_key_candidates` /
   `..._models_...` 增 `allow_key_rotation: bool = True`，override 路径传 `False`——即便未来有人绕过 routes
   校验，也不会把整个 Key 池逐个送出。
4. **前端配套**（`useChatAgentConfig.js` 357–358 / 607–608）：改为**成对传参**——
   `if (draftBaseUrl && draftApiKey) { …两项都传 }`，只填其一时不传 base_url 并给出 UI 提示。
5. **配置登记（顺序恒为「先登记后写码」）**：`backend/config/catalog.py` + 根 `.env.example` 新增
   - `AGENT_ALLOWED_BASE_URL_HOSTS`（L1，默认空=不启用白名单，逗号分隔）
   - `AGENT_ALLOW_INSECURE_BASE_URL`（L1，默认 `false`，仅本地开发放行 http://localhost）
6. **验收**：`python CheckConfigRegistry.py` / `CheckStructureTree.py` 双门禁 + 单测断言四类拒绝
   （无 key、http、私网字面量含整数形式、白名单外 host）+ 一类放行（成对 https）。

### 不在本次范围（避免越权扩大）

`/chat/proxy` 的 SSRF 面、`proxy.py` 的 DNS 解析加固与限流 → 归 P1-4「代理 SSRF 加固」独立方案。

## 四、风险与回归

- **行为变更**：只填 Base URL 不填 Key 的用户将收到 400（此前是"能用但泄漏平台 Key"）。属**有意收紧**，
  日志与 CHANGELOG 需显式声明，前端配套提示同步。
- **实机验证欠账**：沙盒无 uvicorn，Agent 端点全链路须用户本机回归（默认模式对话、个人 Key 模式对话与模型列表、
  草稿只填 base_url 应报 400）。
- ⚠️ 已核实排除的疑点：`httpx` 锁定 0.28.1（`backend/uv.lock:803`），`_redirect_headers` 在跨源重定向时
  **会剥离 Authorization**（仅 http→https 同 host 升级除外）→ 「白名单 host 302 跳转偷 Key」路径不成立，无需额外处理。
