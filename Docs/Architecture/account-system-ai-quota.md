# 账号体系与 AI 配额架构说明

日期：2026-07-21

适用范围：`backend/api/auth/`、`backend/api/agent_chat/`、`backend/api/admin.py`、`backend/api/api_keys_management.py` 及 `frontend/src/` 中对应的认证与 AI 对话模块。

本文是长期参考文档，说明 WebGIS 3.0 中"账号体系与 AI 配额"功能的身份模型、注册登录与会话管理、双配额机制、AI 模型选取优先级链、动态配置、备用密钥池与管理员安全加固，供后续维护、权限扩展与配额策略调整时对照。

## 1. 功能定位

本功能为 WebGIS 3.0 提供完整的用户身份管理与 AI 对话资源控制能力：

- **邮箱注册登录**：以邮箱为唯一登录账号，配合 6 位数字验证码完成注册、密码重置与旧账号邮箱绑定迁移。
- **三级身份体系**：访客（guest）/ 注册用户（registered）/ 管理员（admin），权限逐级递增。
- **分级 AI 对话配额**：通用 API 配额与 AI 对话配额独立计量，按角色设定每日上限，管理员不限额。
- **管理员后台动态配置**：通过 `system_config` 表在线调整 LLM 参数（模型、温度、max_tokens 等）与配额策略，无需重启服务。
- **备用密钥池**：上游 LLM API Key 支持主 + 备用轮询容灾，单 key 失效时自动切换。

**重要边界**：本系统是**应用层配额控制**，不是计费系统。它不追踪 token 消耗量或费用，仅按"调用次数"做每日限额。若需按 token 计费或细粒度用量统计，应接入上游 LLM 平台的 usage 数据。

## 2. 文件结构

### 2.1 后端

| 文件 | 职责 |
|------|------|
| `backend/api/auth/routes.py` | 认证路由：注册、登录、登出、修改密码/头像/昵称、绑定邮箱、重置密码、偏好设置 |
| `backend/api/auth/dependencies.py` | FastAPI 依赖注入：`require_login`、`require_api_access`、`require_api_access_or_guest`、`require_admin` |
| `backend/api/auth/session.py` | 会话 CRUD：创建/读取/删除 session，密码与邮箱更新 |
| `backend/api/auth/quota.py` | 通用 API 配额：`_consume_api_quota_sync`（原子递增 + 超限回滚）、`get_user_quota_snapshot_sync` |
| `backend/api/auth/constants.py` | 角色常量、`normalize_role`、`resolve_quota_subject`、配额映射、输入校验、管理员密码获取 |
| `backend/api/auth/schema.py` | DDL 建表与迁移：`init_auth_tables_sync` 幂等创建全部认证相关表 |
| `backend/api/auth/db.py` | 数据库路径解析、连接工厂、WAL 损坏自动检测与恢复 |
| `backend/api/auth/email_service.py` | SMTP 邮件发送 |
| `backend/api/auth/verification.py` | 验证码生成、存储、频率限制、校验 |
| `backend/api/auth/password.py` | PBKDF2 密码哈希与校验 |
| `backend/api/auth/user.py` | 用户记录 CRUD、游客用户名分配 |
| `backend/api/auth/preferences.py` | 用户偏好（底图、语言、单位制、首选模型）读写 |
| `backend/api/auth/system_config.py` | `system_config` 表通用 KV 读写（管理员头像、默认底图索引等） |
| `backend/api/agent_chat/routes.py` | AI 对话路由：`/chat/completions`、`/chat/proxy`、`/chat/default-proxy`、用户配置、管理员配置 |
| `backend/api/agent_chat/quota.py` | AI 对话配额：`_check_agent_chat_quota_sync`、`_consume_agent_chat_quota_sync`、快照 |
| `backend/api/agent_chat/db.py` | Agent 表 schema、`system_config` 配置 CRUD、`_resolve_effective_agent_runtime_sync` 运行时解析 |
| `backend/api/agent_chat/upstream.py` | 上游 LLM HTTP 调用、`_call_upstream_chat_with_key_candidates` 多 key 轮询 |
| `backend/api/agent_chat/utils.py` | 纯工具函数：`_pick_runtime_model` 模型选取优先级链 |
| `backend/api/agent_chat/constants.py` | Agent 模块常量、环境变量默认值、`system_config` 键名 |
| `backend/api/admin.py` | 管理员后台：数据库 CRUD、公告发布、联系方式配置、默认底图索引 |
| `backend/api/api_keys_management.py` | API 密钥管理：主密钥 + `api_key_backups` 备用密钥池 CRUD |

### 2.2 前端

| 文件 | 职责 |
|------|------|
| `frontend/src/api/backend/client.js` | axios 实例 + 请求拦截器（自动附加 `Authorization: Bearer`、游客 `X-Share-Mode` / `X-Guest-Device-Id`） |
| `frontend/src/stores/useAuthStore.ts` | Pinia 认证状态：`ensureValidSession` 校验 token、`requiresEmailBinding` 计算属性 |
| `frontend/src/views/RegisterView.vue` | 注册页面：邮箱 + 验证码 + 密码 + 昵称 |
| `frontend/src/components/UserCenter/` | 用户中心面板：`FloatingAccountPanel.vue`、`AdminControlPanel.vue`、`ApiKeysManagementPanel.vue` |
| `frontend/src/components/Chat/ChatPanelContent.vue` | AI 对话面板：配额展示、模型选择、消息收发 |

## 3. 三级身份体系

### 3.1 角色定义

| 角色 | 常量 | 来源 | 通用 API 日限额 | AI 对话日限额 |
|------|------|------|----------------|--------------|
| 访客 | `ROLE_GUEST = "guest"` | 游客登录（`user/123`）或无 token 自动创建临时 session | 100 次 | 10 次（环境变量 `AGENT_CHAT_GUEST_DAILY_QUOTA`） |
| 注册用户 | `ROLE_REGISTERED = "registered"` | 邮箱注册 + 验证码 | 1000 次 | 100 次（环境变量 `AGENT_CHAT_REGISTERED_DAILY_QUOTA`） |
| 管理员 | `ROLE_ADMIN = "admin"` | 用户名 `admin` + `SUPER_USER` 环境变量密码 | 不限 | 不限 |

### 3.2 `normalize_role` 判定逻辑

```python
def normalize_role(raw_role: Optional[str], username: Optional[str]) -> str:
    """角色标准化：仅以账号身份决定权限，不信任数据库中的管理员角色字段。"""
    lowered_username = str(username or "").strip().lower()
    lowered_role = str(raw_role or "").strip().lower()

    if lowered_username == ADMIN_USERNAME:       # "admin"
        return ROLE_ADMIN

    if lowered_username == GUEST_USERNAME or lowered_role == ROLE_GUEST:  # "user"
        return ROLE_GUEST

    return ROLE_REGISTERED
```

**设计意图**：数据库中 `users.role` 字段可能因历史迁移或手动修改而不可信。`normalize_role` 以**用户名**为唯一权威来源——用户名为 `"admin"` 则判定管理员，用户名为 `"user"` 或原始 role 为 `"guest"` 则判定访客，其余一律为注册用户。这避免了通过篡改数据库 role 字段提权的风险。

### 3.3 配额主体解析

`resolve_quota_subject` 决定配额计量的唯一标识：

- 访客：使用 `guest_uid`（由 IP + User-Agent + 设备 ID 的 SHA-256 前 16 位构成），保证同一设备/浏览器共享配额。
- 注册用户 / 管理员：使用 `username`。

## 4. 注册登录与会话管理

### 4.1 邮箱注册流程

```
前端 RegisterView.vue
  → POST /api/auth/send-code {email, purpose:"register"}
    → 校验邮箱格式 → 检查邮箱唯一性 → 频率限制（30s/次，10次/天）
    → 生成 6 位验证码 → 存入 email_verification_codes 表 → SMTP 发送
  → POST /api/auth/register {email, email_code, password, display_name, avatar_index}
    → 校验验证码 → 创建 users 记录（username 自动生成）→ 返回用户信息
```

注册成功后用户需使用邮箱 + 密码登录。邮箱是唯一登录凭证，`username` 仅为内部标识。

### 4.2 登录分支

`POST /api/auth/login` 根据凭证分三条路径：

1. **游客**：用户名 `"user"` + 密码 `"123"` → 生成 `guest_uid` → 分配递增用户名（`user_1`, `user_2`...）→ 创建 guest session。
2. **管理员**：用户名 `"admin"` → 读取 `SUPER_USER` 环境变量 → `hmac.compare_digest` 比对 → 创建 admin session。若 `SUPER_USER` 未设置且非开发环境，返回 **HTTP 503**（管理员登录被禁用）。
3. **注册用户**：邮箱 + 密码 → 查询 `users` 表 → 校验 `email_verified=1` + 密码哈希 → 创建 registered session。

### 4.3 旧账号邮箱绑定迁移

历史用户（无邮箱绑定）可用旧 username 登录，但 session 标记 `requires_email_binding=True`。此后访问任何需要 `require_api_access` 的端点均返回 **HTTP 403**，`detail.code = "EMAIL_BINDING_REQUIRED"`。前端据此引导用户完成 `POST /api/auth/bind-email`（需当前密码 + 邮箱验证码），绑定成功后注销旧 session 并签发完整 session。

### 4.4 会话机制

- **存储**：`sessions` 表，token 为 `secrets.token_urlsafe(32)`。
- **有效期**：`SESSION_EXPIRE_HOURS = 72`（环境变量 `AUTH_SESSION_EXPIRE_HOURS` 可覆盖）。
- **读取时自动维护**：`_get_session_sync` 在每次读取时执行 `normalize_role` 修正 role、同步 `requires_email_binding` 状态、过期自动删除并记录在线时长到 `user_metrics`。
- **无 token 游客降级**：`require_login` 在请求携带 `X-Share-Mode: 1` 或 `?s=1` 时，自动创建 2 小时临时 guest session（`is_temporary=True`），不返回 401。

### 4.5 依赖注入层级

```
require_login          → 仅校验 token 有效（或游客降级）
require_api_access     → require_login + 拒绝 requires_email_binding + 消耗通用 API 配额
require_api_access_or_guest → 同上，但无 token 时自动创建 guest session（AI 对话等端点使用）
require_admin          → require_api_access + normalize_role == "admin"
```

## 5. 双配额系统

### 5.1 通用 API 配额（`api_usage_daily`）

| 字段 | 说明 |
|------|------|
| `username` | 配额主体（`quota_subject`） |
| `role` | 角色 |
| `usage_date` | UTC 日期（`YYYY-MM-DD`） |
| `calls` | 当日已用次数 |

消耗逻辑（`_consume_api_quota_sync`）：

1. 管理员直接放行（`limit=None`）。
2. `INSERT ... ON CONFLICT DO UPDATE SET calls = calls + 1` 原子递增。
3. 读取递增后的值，若超限则 `calls - 1` 回滚并返回 `allowed=False`。
4. 未超限则同步更新 `user_metrics.total_api_calls`。

### 5.2 AI 对话配额（`agent_chat_usage_daily`）

| 字段 | 说明 |
|------|------|
| `quota_subject` | 配额主体 |
| `role` | 角色 |
| `usage_date` | UTC 日期 |
| `calls` | 当日 AI 对话次数 |

消耗逻辑（`_consume_agent_chat_quota_sync`）：

1. 先 `SELECT calls` 预检是否已达上限。
2. 未超限则 `INSERT ... ON CONFLICT DO UPDATE SET calls = calls + 1`。
3. 管理员不限额。

**配额策略动态可调**：`_get_agent_chat_daily_limit` 从 `system_config` 表读取 `agent_chat_guest_daily_quota` / `agent_chat_registered_daily_quota`，管理员可通过 `POST /api/admin/agent/config` 在线修改，无需重启。

### 5.3 配额触发点

| 端点 | 配额类型 | 依赖 |
|------|---------|------|
| 天气、搜索等通用 API | `api_usage_daily` | `require_api_access` / `require_api_access_or_guest` |
| `POST /api/agent/chat/completions` | `agent_chat_usage_daily` | 先 `_check_agent_chat_quota_sync` 预检，成功后 `_consume_agent_chat_quota_sync` |
| `POST /api/agent/chat/proxy` | 不消耗平台配额 | 用户个人 Key 模式，仅记录调用日志 |
| `POST /api/agent/chat/default-proxy` | 不消耗平台配额 | 使用管理员配置的默认 AI Key |

## 6. AI 模型选取优先级链

`_pick_runtime_model`（`agent_chat/utils.py`）决定每次对话使用的模型：

| 优先级 | 来源 | `model_source` 标识 | `model_locked` | 说明 |
|--------|------|---------------------|----------------|------|
| 1 | 用户个人配置 `agent_user_config.model` | `"user-config"` | `True` | 用户在"我的 Agent 配置"中显式设定的模型 |
| 2 | 用户偏好 `user_preferences.preferred_agent_model` | `"user-preference"` | `True` | 用户在模型列表中点选的偏好模型 |
| 3 | 管理员平台配置 `system_config["agent_model"]` | `"provider-config"` | `False` | 管理员在后台设定的平台默认模型 |
| 4 | 环境变量 `AGENT_MODEL` | `"env-default"` | `False` | 部署时的兜底默认值 |
| 5 | 均无 | `"missing"` | `False` | 服务不可用，返回 503 |

`model_locked=True` 表示前端不应自动切换模型（用户已明确选择）；`False` 表示前端可在 `available_models` 列表中展示并允许用户切换。

完整运行时解析由 `_resolve_effective_agent_runtime_sync` 完成，它合并以下层级：

```
用户个人配置（agent_user_config）
  → 覆盖 → 管理员平台配置（system_config）
    → 覆盖 → 环境变量默认值（constants.py）
```

对 `base_url`、`timeout_seconds`、`max_tokens`、`temperature`、`top_p`、`extra_body`、`system_prompt` 均采用相同的"用户 > 平台 > 环境"三级合并策略。

## 7. `system_config` 动态配置

`system_config` 表为全局 KV 存储（`key TEXT PRIMARY KEY, value TEXT, updated_at TEXT`），管理员通过 `POST /api/admin/agent/config` 写入以下键：

| 键名 | 含义 | 默认值来源 |
|------|------|-----------|
| `agent_base_url` | 上游 LLM API 基址 | 环境变量 `AGENT_BASE_URL`（默认 `https://api.qnaigc.com/v1`） |
| `agent_model` | 平台默认模型 | 环境变量 `AGENT_MODEL` |
| `agent_available_models` | 可用模型列表（JSON 数组） | 上游 `/models` 缓存 |
| `agent_system_prompt` | 系统提示词 | 环境变量 `AGENT_SYSTEM_PROMPT` |
| `agent_timeout_seconds` | 请求超时（5~180s） | 环境变量 `AGENT_TIMEOUT_SECONDS`（默认 45） |
| `agent_max_tokens` | 最大生成 token 数（1~32768） | 环境变量 `AGENT_MAX_TOKENS`（默认 32768） |
| `agent_temperature` | 温度（0.0~2.0） | 环境变量 `AGENT_TEMPERATURE`（默认 1.0） |
| `agent_top_p` | Top-P（0.0~1.0） | 环境变量 `AGENT_TOP_P`（默认 0.95） |
| `agent_extra_body` | 额外请求体（JSON） | 默认 `{"chat_template_kwargs":{"enable_thinking":true},"reasoning_budget":16384}` |
| `agent_chat_guest_daily_quota` | 访客 AI 对话日限额 | 环境变量 `AGENT_CHAT_GUEST_DAILY_QUOTA`（默认 10） |
| `agent_chat_registered_daily_quota` | 注册用户 AI 对话日限额 | 环境变量 `AGENT_CHAT_REGISTERED_DAILY_QUOTA`（默认 100） |
| `default_ai_api_key` | 默认 AI 专属 Key | 管理员配置 |
| `default_ai_base_url` | 默认 AI 专属 Base URL | 管理员配置 |
| `default_ai_model` | 默认 AI 专属模型 | 管理员配置 |

所有配置修改即时生效（下次请求读取时即为新值），无需重启后端进程。

## 8. 备用密钥池（`api_key_backups`）

### 8.1 表结构

```sql
CREATE TABLE IF NOT EXISTS api_key_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_name TEXT NOT NULL,
    key_value TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    updated_by TEXT,
    UNIQUE(key_name, priority)
)
```

### 8.2 候选列表构建

`_get_api_key_candidates_sync(key_name)` 按以下顺序返回候选 key 列表：

1. 主密钥（`api_keys` 表中对应 `key_name` 的值）
2. 备用密钥（`api_key_backups` 表，按 `priority ASC` 排序，仅 `enabled=1`）

去重后返回完整候选列表。

### 8.3 上游调用轮询

`_call_upstream_chat_with_key_candidates` 按候选列表顺序依次尝试：

```python
for index, api_key in enumerate(candidates):
    try:
        return await _call_upstream_chat(...)
    except HTTPException as exc:
        if index < len(candidates) - 1 and _is_agent_key_retryable_error(exc):
            continue  # key 无效或限流 → 尝试下一个
        raise
```

仅当错误为 **HTTP 503 且 detail 包含 "key" 或 "rate-limit"** 时才切换到下一个候选 key（`_is_agent_key_retryable_error`）。其他错误（超时、上游 5xx 等）直接抛出，不做轮询。

### 8.4 管理端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/admin/api-keys/{key_name}/backups` | GET | 列出备用 token 元数据（不返回明文） |
| `/api/admin/api-keys/{key_name}/backups` | PUT | 整体替换备用 token 列表 |
| `/api/admin/api-keys/{key_name}/backups` | POST | 追加一个备用 token |
| `/api/admin/api-keys/{key_name}/backups/{backup_id}` | DELETE | 删除指定备用 token |

支持的 `key_name`：`amap_key`、`agent_api_key`、`agent_token`、`tianditu_tk`、`cesium_ion_token`。

## 9. 管理员安全加固

### 9.1 管理员密码注入

```python
def _get_admin_password() -> str:
    configured = os.getenv("SUPER_USER", "").strip()
    if configured:
        return configured

    if os.getenv("APP_ENV", "").strip().lower() == "development":
        return DEV_DEFAULT_ADMIN_PASSWORD  # "123456"，仅本地开发

    return ""  # 生产环境未配置 → 管理员登录被禁用
```

- 生产环境**必须**通过 `SUPER_USER` 环境变量注入管理员密码。
- 未设置时 `_get_admin_password` 返回空字符串，登录路由返回 **HTTP 503**（`"管理员密码未配置，请联系运维设置 SUPER_USER 环境变量"`）。
- 管理员密码**不存储在数据库**中，不支持在线修改（`change-password` 端点对 admin 角色返回 403）。

### 9.2 权限隔离

- 管理员判定仅依赖 `normalize_role`（用户名为 `"admin"`），数据库中无法通过修改 role 字段提权。
- 所有管理端点（`/api/admin/*`）均依赖 `require_admin`，内部先走 `require_api_access`（配额检查）再校验角色。
- API 密钥值仅在管理员端点返回，前端运行时配置端点（`/api/runtime-config/map-tokens`）受 `RUNTIME_CONFIG_ALLOWED_ORIGINS` 来源白名单保护。

### 9.3 会话安全

- 密码哈希：PBKDF2，迭代次数 `PASSWORD_HASH_ITERATIONS = 120000`（环境变量可覆盖）。
- 修改密码 / 重置密码 / 绑定邮箱后，**注销该账号全部 session**，防止旧 token 继续使用。
- 登录比对使用 `hmac.compare_digest`，防止时序攻击。

## 10. 数据库 Schema 概览

认证与配额相关核心表（由 `init_auth_tables_sync` 幂等创建）：

| 表名 | 用途 |
|------|------|
| `users` | 用户账号（username, display_name, password_hash, role, avatar_index, email, email_verified） |
| `sessions` | 登录会话（token, username, role, guest_uid, requires_email_binding, expires_at） |
| `api_usage_daily` | 通用 API 每日配额计数（PK: username + usage_date） |
| `agent_chat_usage_daily` | AI 对话每日配额计数（PK: quota_subject + usage_date） |
| `agent_user_config` | 用户个人 Agent 配置（api_key, base_url, model, temperature 等） |
| `user_preferences` | 用户偏好（default_basemap, language, unit_system, preferred_agent_model） |
| `system_config` | 全局 KV 动态配置 |
| `api_keys` | 主 API 密钥（key_name, key_value） |
| `api_key_backups` | 备用密钥池（key_name, key_value, priority, enabled） |
| `email_verification_codes` | 邮箱验证码（email, code, purpose, expires_at, used） |
| `user_metrics` | 用户统计（login_count, total_login_seconds, total_api_calls） |
| `guest_identity_records` | 游客身份记录（guest_uid, visit_count, last_seen_at） |

数据库为 SQLite（WAL 模式），路径解析优先级：`AUTH_DB_PATH` 环境变量 > HuggingFace Space `/data/` > 项目 `./data/webgis_auth.db`。内置 `PRAGMA quick_check` 损坏检测与 WAL 回放自动恢复。

## 11. 前端集成要点

- **请求拦截**：`client.js` 自动从 `localStorage` 读取 token 附加 `Authorization: Bearer`；无 token 且 URL 含 `?s=1` 时附加 `X-Share-Mode: 1` + `X-Guest-Device-Id`。
- **会话校验**：`useAuthStore.ts` 的 `ensureValidSession` 调用 `GET /api/auth/me` 验证 token 有效性，超时 8 秒自动清除失效 session。
- **邮箱绑定拦截**：`requiresEmailBinding` 计算属性为 `true` 时，前端阻止用户进入 AI 对话等功能，引导至邮箱绑定流程。
- **配额展示**：`ChatPanelContent.vue` 从 `/api/agent/chat/config` 获取当日配额快照并展示剩余次数。

## 12. 局限与升级方向

**现有局限：**

1. **按次计量，非按 token**：配额仅统计调用次数，不区分短问短答与长文生成的资源消耗差异。
2. **SQLite 并发瓶颈**：高并发场景下 SQLite 写锁可能成为配额递增的性能瓶颈（当前 WAL 模式已缓解，但未做连接池）。
3. **游客配额易绕过**：`guest_uid` 基于 IP + UA + 设备 ID 哈希，清除浏览器存储或更换网络即可重置配额。
4. **单管理员模型**：仅支持一个 `admin` 账号，无多管理员、RBAC 细粒度权限。
5. **密钥轮询策略简单**：备用 key 仅在主 key 返回 503 + "key/rate-limit" 时切换，不处理上游 429 直接返回的场景（上游 429 被映射为 503 但 detail 为 "rate-limited upstream"，可触发轮询）。
6. **无审计日志**：管理员配置变更无独立审计追踪（仅 `updated_at` / `updated_by` 字段）。

**升级方向：**

1. 引入 token 级用量统计（读取上游 `usage.total_tokens`），实现按消耗量配额或混合配额（次数 + token）。
2. 迁移至 PostgreSQL / Redis 做配额计数，支持高并发原子递增与过期自动清理。
3. 增加 JWT + Refresh Token 双 token 机制，减少 session 表查询压力。
4. 支持多管理员与 RBAC（如"运营管理员"仅可调配额，不可改密钥）。
5. 密钥池增加健康检查与加权轮询，主动剔除失效 key。
6. 增加配置变更审计表（who / when / what / old_value / new_value）。
