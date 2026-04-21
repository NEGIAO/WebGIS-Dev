---
title: WebGIS
emoji: 🌍
colorFrom: blue
colorTo: green
sdk: docker
pinned: false
---

!!!!!!!!!!开头不可以改变，否则服务器罢工！！！！！！！！！！

# WebGIS Backend
Powered by FastAPI and Docker.

WebGIS 后端服务，当前包含三大核心能力：
- Google 瓦片代理：GET /api/tile/{z}/{x}/{y}
- 通用流式代理：GET /proxy/{target_url:path}（Provider Agnostic）
- 访客地理统计：POST /api/log-visit
- 真实用户登录系统：/api/auth/*（含三类身份）
- Agent 对话后端代理：/api/agent/chat/*（按身份配额）

## 0. 项目结构

```text
backend/
├── api/
│   ├── auth.py                 # 认证与会话
│   ├── statistics.py           # 统计中心与实时统计
│   ├── location.py             # 位置服务相关接口
│   ├── proxy.py                # 瓦片代理
│   ├── external_proxy.py       # 外部代理能力
│   ├── admin.py                # 管理端接口
│   ├── api_management.py       # API 管理
│   ├── api_keys_management.py  # API Key 管理
│   ├── agent_chat.py           # Agent 对话代理（V3.0.4 零配置/模型缓存/偏好持久化）
│   └── __init__.py
├── app.py                      # FastAPI 应用入口（含通用流式代理 /proxy/{target_url:path}）
├── Dockerfile                  # 容器化部署
├── pyproject.toml              # 依赖与项目配置（uv）
├── uv.lock                     # 锁文件
├── .env.example                # 环境变量示例
├── .python-version             # Python 版本
├── data/                       # 运行数据目录（AUTH_DB 可落盘到此）
├── frontend_example.html       # 前端调用示例
├── test_location_apis.py       # 位置接口测试脚本
└── README.md                   # 后端文档（2026-04-21 罗盘管理器封装为前端改造，本目录结构无新增/删除）
```

## 1. 认证系统

### 1.1 三类登录身份

1. 游客
- 用户名：user
- 密码：123
- 角色：guest
- 说明：必须手动输入密码 123 才能登录

2. 注册用户
- 用户自行注册用户名和密码
- 角色：registered
- 说明：注册后可长期登录

3. 超级管理员
- 账号与密码由数据库 users 表维护
- 推荐用户名：super_admin
- 角色：super_admin
- 说明：管理员密码不在后端代码和前端提示中出现

### 1.2 持久化存储（HF Space /data）

认证信息存储使用 SQLite，默认路径：
- /data/webgis_auth.db

这意味着在 Hugging Face Space 挂载持久化卷后，容器重启不会丢失注册用户与会话数据。

当 /data 不可写时，服务会自动回退到本地目录：
- ./data/webgis_auth.db

### 1.2.1 管理员账号 SQL 初始化

管理员账号建议通过 SQL 直接写入 users 表，并设置 role='super_admin'。

```sql
INSERT INTO users (username, password_hash, role, created_at)
VALUES ('super_admin', '<pbkdf2_salt_hex$pbkdf2_digest_hex>', 'super_admin', datetime('now'));
```

### 1.3 认证相关接口

1) 注册普通用户
```bash
curl -X POST "http://localhost:8000/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"demo_user","password":"abc12345"}'
```

2) 游客登录
```bash
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"123"}'
```

3) 超级管理员登录
```bash
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"super_admin","password":"<admin_password_from_db>"}'
```

4) 查询当前登录用户
```bash
curl "http://localhost:8000/api/auth/me" \
  -H "Authorization: Bearer <token>"
```

5) 退出登录
```bash
curl -X POST "http://localhost:8000/api/auth/logout" \
  -H "Authorization: Bearer <token>"
```

6) 修改当前账号密码
```bash
curl -X POST "http://localhost:8000/api/auth/change-password" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"current_password":"<old_password>","new_password":"<new_password>"}'
```

## 2. 现有 API 如何使用

这两个接口的使用示例也已写在对应后端文件顶部注释中：
- api/proxy.py
- api/statistics.py

### 2.1 瓦片代理 API

接口：
- GET /api/tile/{z}/{x}/{y}?lyrs=s

示例：
```bash
# 默认卫星图层
curl "http://localhost:8000/api/tile/16/53576/25999"

# 指定混合图层
curl "http://localhost:8000/api/tile/16/53576/25999?lyrs=y"
```

前端模板 URL：
```text
http://localhost:8000/api/tile/{z}/{x}/{y}?lyrs=s
```

### 2.2 访客统计 API

接口：
- POST /api/log-visit
- 需要登录 token（Authorization: Bearer <token>）

示例：
```bash
curl -X POST "http://localhost:8000/api/log-visit" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

可选模拟代理 IP：
```bash
curl -X POST "http://localhost:8000/api/log-visit" \
  -H "Authorization: Bearer <token>" \
  -H "X-Forwarded-For: 8.8.8.8" \
  -H "User-Agent: Mozilla/5.0" \
  -d '{}'
```

## 3. 受保护接口

以下接口已强制登录校验（防止跳过登录直接使用 URL）：
- GET /api/news
- GET /api/process-points
- GET /api/data
- GET /api/info
- POST /api/log-visit
- GET /api/agent/chat/config
- POST /api/agent/chat/completions

公开接口：
- GET /
- GET /health
- GET /api/tile/{z}/{x}/{y}
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/storage-path

## 4. 环境变量

最少需要：
- SUPABASE_URL
- SUPABASE_KEY

认证与登录可选配置：
- AUTH_DB_PATH=/data/webgis_auth.db
- AUTH_SESSION_EXPIRE_HOURS=72
- AUTH_PASSWORD_HASH_ITERATIONS=120000

Agent 对话可选配置：
- AGENT_API_KEY=your_agent_key
- AGENT_BASE_URL=https://api.qnaigc.com/v1
- AGENT_MODEL=deepseek-V3-0324
- AGENT_CHAT_GUEST_DAILY_QUOTA=10
- AGENT_CHAT_REGISTERED_DAILY_QUOTA=100

示例（.env）：
```bash
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-anon-public-key
AUTH_DB_PATH=/data/webgis_auth.db
```

## 5. 本地启动

```bash
cd backend
uv sync
uv run uvicorn app:app --reload --port 8000
```

文档地址：
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 6. 前端联调要点

前端请求受保护接口时，请在请求头中带上 token：
```http
Authorization: Bearer <token>
```

当前前端已接入：
- 登录页真实调用 /api/auth/login 和 /api/auth/register
- 路由守卫拦截未登录访问 /home
- API 客户端自动附加 Authorization 头


---

## ✨ V3.0.2 Agent Chat 配置同步修复（2026-04-19）

### 问题描述

原有实现存在以下问题：
1. 管理员配置了，但普通用户显示"未配置"
2. 身份鉴别失效，权限管理无法生效
3. 用户额度限制无法正确执行

### 修复内容

✅ **配置同步**：统一数据库事务管理，确保管理员配置被所有用户正确读取  
✅ **权限鉴别**：改进权限检查，Admin/Registered/Guest 角色生效  
✅ **额度管理**：增强配额消费的可靠性，日配额限制能正确执行  
✅ **可观测性**：添加详细日志，便于排查问题  

### 核心改进

**文件**：`backend/api/agent_chat.py`

**修复的函数**（共 9 个）：
1. `_ensure_agent_chat_tables_sync()` - 统一事务管理
2. `_ensure_system_config_table_sync()` - 移除内部提交
3. `_ensure_api_keys_table_sync()` - 移除内部提交
4. `_get_system_config_values_sync()` - 异常处理与回退
5. `_set_agent_provider_config_sync()` - 管理员配置改进
6. `_read_agent_user_config_row_sync()` - 用户配置读取安全性
7. `_upsert_agent_user_config_sync()` - 用户配置更新
8. `_consume_agent_chat_quota_sync()` - 配额消费日志
9. `_get_agent_chat_quota_snapshot_sync()` - 配额查询异常处理

### 启用 DEBUG 日志

```bash
LOG_LEVEL=DEBUG uv run uvicorn app:app --reload
```

关键日志消息：
- `Agent config updated with N rows` → Admin 配置已保存 ✅
- `User quota exceeded: N/M` → 用户超过配额（被阻止）✅
- `Admin {user} has unlimited quota` → Admin 权限确认 ✅

### 详细文档

- **快速指南**：`docs/backend-agent-chat-guide.md`
- **完整日志**：`docs/2026-04-19-AgentChat配置同步修复.md`
- **规范执行**：`docs/2026-04-19-版本规范执行记录.md`

### 关键改进

- 对话配额改为**数据库动态读取**（`system_config`），不再依赖硬编码常量。
- 管理员可在后台直接修改 Guest / Registered 每日对话额度。
- 对话链路改为：**先校验额度 -> 成功调用上游后再扣费**。
- 上游失败/超时/异常时，不扣减用户额度。

### 涉及文件

- `backend/api/agent_chat.py`

---


### 核心诉求

**痛点**：新用户使用 Agent Chat 时，若未主动配置模型，首条信息请求必然因模型路径无效而失败。

**目标**：实现**"开箱即用"**体验——新用户无需任何配置，点击"发送"即可立即获得 AI 回复。

### 关键改进

#### 后端增强（`backend/api/agent_chat.py`）

1. **模型列表缓存** → `_cache_available_models_sync()`
   - 将上游返回的模型 ID 列表存储到 `system_config` 数据库
   - 支持离线降级：若上游服务临时不可用，使用缓存列表

2. **智能降级流程** → `get_available_models()` 重构
   - 优先：实时调用上游 `/models`
   - 降级1：上游超时 → 使用缓存列表
   - 降级2：无缓存 → 返回友好错误提示

3. **模型偏好持久化** → `@router.patch("/api/agent/user/preference")`
   - 新端点允许用户保存"偏好模型"到 `user_preferences` 表
   - 跨设备登录后自动应用偏好

#### 前端增强（`frontend/src/components/ChatPanelContent.vue`）

1. **启动时自动加载模型** → `onMounted()` 改进
   - 页面初始化时后台加载模型列表（不阻塞 UI）

2. **自动模型选择** → `loadAvailableModels()` 增强
   - 若用户未选择模型，自动从可用列表中**随机选择一个**
   - 自动保存为用户偏好（后台异步，无额外延迟）

3. **后端信息反馈** → 支持 `fallback_reason` 字段
   - 前端可展示模型加载的降级原因（仅调试用）

#### API 新增

**后端新增**：
- `PATCH /api/agent/user/preference` - 保存用户模型偏好
- `_cache_available_models_sync()` - 缓存模型到数据库
- `_cache_models_async()` - 后台异步缓存

**前端新增**：
- `apiAgentSaveModelPreference(model)` - API 包装器

### 涉及文件

- `backend/api/agent_chat.py` (+130 lines)
- `frontend/src/components/ChatPanelContent.vue` (+45 lines)
- `frontend/src/api/backend.js` (+5 lines)

### 零配置流程图

```
用户点击聊天图标
  ↓
onMounted() 触发
  ↓ ┌─ 后台加载模型列表 (loadAvailableModels)
  │ ├─ 优先: 查询上游 /models
  │ ├─ 降级: 上游失败 → 使用缓存列表
  │ └─ 自动选择: 若用户未配置，从列表中随机挑一个
  │
  ↓ [用户UI展示就绪]
用户输入问题，点击"发送"
  ↓
前后端使用自动选择的模型
  ↓
✅ 首条消息成功获得 AI 回复
```

### 配置举例

无需额外配置！系统自动工作：

```python
# 后端自动监听 agent_available_models（system_config key）
# 前端自动触发 onMounted() 预加载
# 首次发送消息时，自动使用系统选定的模型
```

### 性能提示

- 模型列表缓存不阻塞响应（使用 `asyncio.create_task()` 后台保存）
- 前端预加载模型不阻塞页面渲染
- 用户体验：**立即可用，无感知延迟**

