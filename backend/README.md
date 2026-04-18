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
│   ├── agent_chat.py           # Agent 对话代理与配置
│   └── __init__.py
├── app.py                      # FastAPI 应用入口
├── Dockerfile                  # 容器化部署
├── pyproject.toml              # 依赖与项目配置（uv）
├── uv.lock                     # 锁文件
├── .env.example                # 环境变量示例
├── .python-version             # Python 版本
├── data/                       # 运行数据目录（AUTH_DB 可落盘到此）
├── frontend_example.html       # 前端调用示例
├── test_location_apis.py       # 位置接口测试脚本
└── README.md
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
