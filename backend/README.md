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

WebGIS 后端服务，当前包含五大核心能力：
- Google 瓦片代理：GET /api/tile/{z}/{x}/{y}
- 通用流式代理：GET /proxy/{target_url:path}（Provider Agnostic）
- 访客地理统计：POST /api/log-visit
- 真实用户登录系统：/api/auth/*（邮箱账号、旧用户绑定迁移、三类身份）
- Agent 对话后端代理：/api/agent/chat/*（按身份配额）
- 运行时地图 Token 配置：GET /api/runtime-config/map-tokens 下发天地图/Cesium 主备 token 池，前端直连第三方服务
- 🆕 在线底图下载：POST /api/download/tasks（异步任务 + GeoTIFF 输出）
- 🆕 GCJ-02 实时纠偏：GET /proxy/gcj2wgs/* 和 /proxy/wgs2gcj/*
- 🆕 空间分析 API：POST /api/v1/spatial/analysis（缓冲区/叠加/凸包/泰森多边形/空间聚合/多环缓冲区/几何简化/渔网分析），统一 EPSG:3857 平面坐标系，基于 Shapely 2.x + pyproj

> 🧭 **文档导航**：项目总览见 [根 README](../README.md) · 完整版本历史见 [更新日志 CHANGELOG](../Docs/Guide/CHANGELOG.md) · 八大功能架构见 [Docs/Architecture/](../Docs/Architecture/) · 开发约定见 [dev-conventions.md](../Docs/Guide/dev-conventions.md)

## 数据库损坏-挽救措施(Git Bash 运行)
### 1、dump
```bash
sqlite3 webgis_auth.db.corrupted ".dump" > repair.sql
```
**作用原理：**
该命令会绕过损坏的 B-Tree 索引，直接以行级扫描模式（Scan Mode）死磕底层的二进制数据页。它会将所有没损坏的表结构（CREATE TABLE）和能抢救出来的每一行数据（INSERT）全部翻译并抽离成一个纯文本的 .sql 脚本。
### 2、recover
```bash
sqlite3 webgis_auth.db.corrupted ".recover" > repair.sql
```
**作用原理：**
这是 SQLite 专门针对“严重文件损坏”推出的高级恢复指令。它的容错率比 `.dump` 更高，它甚至会去深度扫描那些被标记为已删除、但还没有被新数据物理覆盖的底层碎片数据，尽可能多地把孤立的数据页拼接还原出来。

**适用场景：**
- 数据库严重损坏，`.dump` 无法导出或导出数据极少
- 需要最大程度找回已删除但未覆盖的历史数据
- SQLite 版本 ≥ 3.29.0（现代 Linux 发行版/容器均满足）

## 🏛️ 架构文档

平台八大核心功能的架构说明统一沉淀于 [`Docs/Architecture/`](../Docs/Architecture/)，完整跳转索引表见根 [README「架构文档」章节](../README.md#-架构文档)。

后端重点相关（含实现详解）：

- 📐 [空间分析后端](../Docs/Architecture/spatial-analysis-backend.md) · 🧰 [实用工具（底图下载 download_xyz）](../Docs/Architecture/utility-tools.md) · 🔐 [账号体系与 AI 配额](../Docs/Architecture/account-system-ai-quota.md)
- 🌐 [丰富底图源（含 GCJ-02 纠偏代理）](../Docs/Architecture/basemap-source-system.md) · 🛣️ [路径规划](../Docs/Architecture/route-planning.md)

---

## 0. 项目结构

后端完整文件树（`backend/` 全部文件及注释）统一维护于 [`Docs/Guide/backend-structure.md`](../Docs/Guide/backend-structure.md)，本 README 不再重复维护，避免多处同步。

> 后端完整版本历史与每次结构变更说明已统一维护于根目录 [更新日志 CHANGELOG](../Docs/Guide/CHANGELOG.md) 及 [`Docs/`](../Docs/) 下按日期归档的维护日志，本 README 不再逐版本记录。

## 1. 认证系统

### 1.1 三类登录身份

1. 游客
- 用户名：user
- 密码：123
- 角色：guest
- 说明：必须手动输入密码 123 才能登录

2. 注册用户
- 用户自行注册邮箱账号、昵称和密码
- 角色：registered
- 说明：新账号必须完成邮箱验证码校验；昵称仅用于展示，可重复、可修改

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
  -d '{"email":"demo@example.com","email_code":"123456","display_name":"Demo","password":"abc12345"}'
```

2) 邮箱账号登录
```bash
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"abc12345"}'
```

3) 旧用户名登录并绑定邮箱
```bash
# 仅适用于无已验证邮箱的旧用户；返回 requires_email_binding=true 的受限 session
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"old_username","password":"<old_password>"}'

# 使用受限 session 绑定邮箱，成功后返回新 token
curl -X POST "http://localhost:8000/api/auth/bind-email" \
  -H "Authorization: Bearer <restricted_token>" \
  -H "Content-Type: application/json" \
  -d '{"email":"old-user@example.com","code":"123456","current_password":"<old_password>"}'
```

4) 游客登录
```bash
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"123"}'
```

5) 超级管理员登录
```bash
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"super_admin","password":"<admin_password_from_db>"}'
```

6) 查询当前登录用户
```bash
curl "http://localhost:8000/api/auth/me" \
  -H "Authorization: Bearer <token>"
```

7) 退出登录
```bash
curl -X POST "http://localhost:8000/api/auth/logout" \
  -H "Authorization: Bearer <token>"
```

8) 修改当前账号密码
```bash
curl -X POST "http://localhost:8000/api/auth/change-password" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"current_password":"<old_password>","new_password":"<new_password>"}'
```

9) 修改昵称
```bash
curl -X POST "http://localhost:8000/api/auth/change-display-name" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"display_name":"新的昵称"}'
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

### 2.1.1 GCJ/WGS 纠偏瓦片代理

接口：
- GET /proxy/gcj2wgs/{target_url:path}
- GET /proxy/wgs2gcj/{target_url:path}

示例：
```bash
# GCJ02 -> WGS84
curl "http://localhost:8000/proxy/gcj2wgs/mt1.google.com/vt?x=53576&y=25999&z=16&lyrs=s"

# WGS84 -> GCJ02
curl "http://localhost:8000/proxy/wgs2gcj/mt1.google.com/vt?x=53576&y=25999&z=16&lyrs=s"
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
- POST /api/auth/send-code
- POST /api/auth/verify-code
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/reset-password

受限绑定 session 可访问：
- POST /api/auth/bind-email

登录后可访问：
- GET /api/auth/me
- POST /api/auth/logout
- POST /api/auth/change-password
- POST /api/auth/change-avatar
- POST /api/auth/change-display-name

## 4. 环境变量

最少需要：
- SUPABASE_URL
- SUPABASE_KEY

认证与登录可选配置：
- AUTH_DB_PATH=/data/webgis_auth.db
- AUTH_SESSION_EXPIRE_HOURS=72
- AUTH_PASSWORD_HASH_ITERATIONS=120000

Agent 对话可选配置：
- AGENT_API_KEY=your_agent_key (optional env fallback; prefer admin panel/database)
- AGENT_BASE_URL=https://api.qnaigc.com/v1
- AGENT_MODEL=deepseek-V3-0324
- AGENT_CHAT_GUEST_DAILY_QUOTA=10
- AGENT_CHAT_REGISTERED_DAILY_QUOTA=100

代理安全可选配置：
- PROXY_VERIFY_SSL=true
- PROXY_ALLOW_PRIVATE_HOSTS=false

运行时地图 Token 可选配置：
- RUNTIME_CONFIG_ALLOWED_ORIGINS=https://negiao.github.io,https://your-domain.com

示例（.env）：
```bash
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-anon-public-key
AUTH_DB_PATH=/data/webgis_auth.db
```

## 5. 🆕 在线底图下载 API

### 功能概述
支持从任意 Web Mercator (EPSG:3857) 瓦片源异步下载指定范围的底图，并输出为地理参考的 GeoTIFF 格式。

#### API 端点

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/download/tasks` | 创建下载任务 |
| GET | `/api/download/tasks/{task_id}` | 查询任务状态 |
| GET | `/api/download/tasks/{task_id}/file` | 下载生成的 GeoTIFF 文件 |

#### 请求示例

```bash
# 1. 创建下载任务
curl -X POST http://localhost:8000/api/download/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "tile_url_template": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    "bbox": {
      "minLon": 114.2,
      "minLat": 29.5,
      "maxLon": 114.3,
      "maxLat": 29.6
    },
    "crs": "EPSG:4326",
    "resolution_m": 30,
    "format": "GeoTIFF"
  }'

# 返回
{
  "task_id": "abc123",
  "status": "pending",
  "progress": 0,
  "message": "Task created"
}

# 2. 轮询任务状态
curl http://localhost:8000/api/download/tasks/abc123

# 3. 下载 GeoTIFF
curl -O http://localhost:8000/api/download/tasks/abc123/file
```

#### 核心实现细节

- **并发控制**：使用 `asyncio.Semaphore(10)` 限制并发瓦片下载数
- **内存优化**：Rasterio Window streaming，无需一次性加载全部瓦片
- **坐标转换**：自动支持 EPSG:3857 (Web Mercator) 范围计算
- **任务持久化**：SQLite 数据库记录任务历史
- **自动清理**：后台调度器每分钟清理超过 30 分钟的过期任务

---

## 6. 🆕 GCJ-02 实时纠偏代理

### 功能概述
针对中国境内地图数据的坐标系转换代理，支持实时转换请求。

#### API 端点

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/proxy/gcj2wgs/{lon}/{lat}` | GCJ-02 → WGS84（火星坐标 → 真实坐标）|
| GET | `/proxy/wgs2gcj/{lon}/{lat}` | WGS84 → GCJ-02（真实坐标 → 火星坐标）|

#### 使用场景

1. **GCJ-02 瓦片转 WGS84**：
   ```javascript
   // 高德地图瓦片 → 标准 GPS
   fetch('/proxy/gcj2wgs/116.4074/39.9042')
     .then(r => r.json())
     .then(data => console.log(data)) 
     // { lon: 116.3974, lat: 39.8932 }
   ```

2. **WGS84 数据上传至高德地图**：
   ```javascript
   // 用户标记的 GPS 点 → 高德坐标系
   fetch('/proxy/wgs2gcj/116.3974/39.8932')
     .then(r => r.json())
     .then(data => {
       // 用转换后的坐标添加到高德地图
       amap.add(new AMap.Marker({
         position: [data.lon, data.lat]
       }))
     })
   ```

#### 技术细节

- 采用 Everyhing 算法或等效坐标系转换库
- 前端透明调用，无需修改业务逻辑
- 支持单点转换和批量转换（后期扩展）

---

## 7. 本地启动

```bash
cd backend
uv sync
uv run uvicorn app:app --reload --port 8000
```

文档地址：
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 8. Docker Compose 一键启动（推荐）

```bash
# 项目根目录执行
docker-compose up -d

# 检查服务状态
docker-compose ps

# 查看日志
docker-compose logs -f backend
docker-compose logs -f frontend

# 停止服务
docker-compose down
```

服务地址：
- 前端：http://localhost:5173
- 后端 API：http://localhost:8000
- 后端文档：http://localhost:8000/docs

---

## 9. 前端联调要点

前端请求受保护接口时，请在请求头中带上 token：
```http
Authorization: Bearer <token>
```

当前前端已接入：
- 登录页真实调用 /api/auth/login 和 /api/auth/register
- 路由守卫拦截未登录访问 /home
- API 客户端自动附加 Authorization 头


---

> 📜 更早的后端版本记录（含 V3.0.2 Agent Chat 配置同步修复、零配置模型选取设计等历史说明）已归档：完整版本历史见根目录 [更新日志 CHANGELOG](../Docs/Guide/CHANGELOG.md)，逐项变更见 [`Docs/`](../Docs/) 下按日期归档的维护日志。Agent Chat 与账号配额的当前架构见 [account-system-ai-quota.md](../Docs/Architecture/account-system-ai-quota.md)。
