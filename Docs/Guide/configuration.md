# WebGIS 配置指南（Clone 必读）

> 权威配置清单：仓库根目录 [`.env.example`](../../.env.example)  
> 分阶段架构计划：[configuration-architecture-plan.md](configuration-architecture-plan.md)  
> 返回 [根 README](../../README.md)

---

## 三层模型（必须遵守）

| 层 | 位置 | 放什么 | 安全等级 |
|----|------|--------|----------|
| **L1** | 根目录 `.env`（由 `.env.example` 复制） | 不涉密/低密常量、公开 URL、前端 `VITE_*` | 最低 |
| **L2** | 管理员面板 + 数据库 | 常变运营项：地图 token、Agent 参数、底图、公告 | 较高 |
| **L3** | Hugging Face Space **Secrets**（本地可进未提交 `.env`） | 绝密：管理员密码、OAuth secret、SMTP 密码、API Key | 最高 |

**根目录 `.env.example` = L1+L2+L3 的全集目录**（所有 key 都出现并带注释）。  
**已提交文件不得包含 L3 真值。**

### 前端不能读绝密

- 浏览器只使用 `VITE_*` 公开项，或后端 `/api/runtime-config/*` 下发的公开数据。  
- 禁止 `VITE_SUPER_USER`、`VITE_*_SECRET`、`VITE_TIANDITU_TK` 等。

### 后端读取

- 统一由 `backend/config` 包加载（**已落地**，V3.4.6）：`catalog.py` 登记全集，`load.py` 提供 `get_settings()` 快照与 `get_str/get_int/get_float/get_bool`，`runtime.py` 提供 L2（system_config）覆盖读取，`public.py` 生成前端安全公开配置。  
- 业务代码禁止直接 `os.getenv`（仅 `backend/config` 内部允许），CR 时以 `grep os.getenv backend --exclude-dir=config` 为门禁。  
- 加载顺序：系统环境变量（HF Secrets/Docker 注入，优先） > 根 `.env` > `backend/.env`（兼容）。  
- 生产 L3 只从环境变量注入（HF Secrets）；启动日志输出脱敏配置摘要与 L3 配置状态。

---

## 5 分钟上手

### 1. 复制清单

```bash
# 在仓库根目录 WebGIS-Dev/
cp .env.example .env
```

Windows 也可手动复制 `.env.example` → `.env`。

### 2. 本地最低配置（L1）

`.env` 中确认：

```env
APP_ENV=development
BACKEND_PUBLIC_URL=http://localhost:7860
FRONTEND_PUBLIC_URL=http://localhost:5173
```

前端 `VITE_*` **同样写在根 `.env`**（Vite 的 envDir 已指向仓库根，无需再维护 frontend/.env.*）：

```env
VITE_BASE_URL=./
VITE_BACKEND_URL=http://localhost:7860
VITE_TILE_PROXY_BASE_URL=http://localhost:7860
VITE_TILE_PROXY_MODE=fallback
```

生产构建读根 `.env.production`（提交 git，clone 必改 `VITE_BACKEND_URL`）。

### 3. 启动

- 推荐：`LocalDev.bat`  
- 或：后端 `backend/docker-compose.yml` + 前端 `npm run dev`

### 4. 默认账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 游客 | `user` | `123` |
| 管理员 | `admin` | 本地未设 `SUPER_USER` 且 `APP_ENV=development` 时为 `123456`；否则为 L3 `SUPER_USER` |

> 文档中的 `super_admin` 若仍出现在旧段落，以代码为准：**管理员用户名是 `admin`**。

### 5. 登录 admin 后配置 L2

用户中心 → 管理员 / API 密钥：

- 天地图 TK、Cesium Ion（地图与三维）  
- Agent 模型、额度、base_url 等  
- 默认底图、公告、联系方式  

### 6. 需要邮箱注册 / OAuth / AI 时再配 L3

见下文「功能 → 必配项」。

---

## Hugging Face 生产

### HF Secrets 最小集合（按功能勾选，可直接复制 key 名）

与根 `.env.example` **[L3]** 段一一对应；不需要的功能可整组不配。

```text
# 必配（admin 后台）
SUPER_USER

# OAuth 登录（Google / GitHub，任一都需要 state 密钥）
OAUTH_STATE_SECRET
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GITHUB_OAUTH_CLIENT_ID
GITHUB_OAUTH_CLIENT_SECRET

# 邮箱验证码（注册/重置/绑定）—— 账号 SMTP_USER 属 L1（Variables 或代码默认），凭证必进 Secrets
SMTP_PASSWORD

# AI 对话主密钥：不进 HF Secrets；登录 admin 后在 L2 API 密钥管理 → Agent 配置 agent_api_key
# 高德搜索 / IP 定位：不进 HF Secrets；登录 admin 后在 L2 API 密钥管理 → 高德 配置 amap_key

# 访客统计
SUPABASE_URL
SUPABASE_KEY

# 可选：监控日志流访问令牌
LOG
```

Variables（非密，可选）：`APP_ENV=production`、`BACKEND_PUBLIC_URL`、`FRONTEND_PUBLIC_URL`、`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`。
配好后看启动日志「[配置] [L3] ...」行或 admin 控制台「环境密钥状态」卡片自检。

1. Space **Secrets** 只添加根 `.env.example` 中 **[L3]** 段（上表）。  
2. 公开 URL 用 L1（代码常量或 Space Variables，与 Secrets 分离）：  
   - 后端：`https://<your-space>.hf.space`  
   - 前端 Pages：`https://negiao.github.io/WebGIS-Dev`（按你的仓库路径）  
3. Google / GitHub 控制台回调必须与后端一致：  

```text
https://<your-space>.hf.space/api/auth/oauth/google/callback
https://<your-space>.hf.space/api/auth/oauth/github/callback
```

4. 不要把 Client Secret 放进前端或 git。

> 📘 OAuth 生产配置的**逐步操作手册**（Google/GitHub 控制台逐字段申请步骤、Secrets 配置、验收自检、排错速查表）见 [oauth-deployment.md](oauth-deployment.md)。

---

## L2 对照表（配置项 ↔ Admin 菜单 ↔ 存储位置）

> 运营改 token / 模型 / 底图 / 公告只走 Admin 面板，无需动 HF Secrets。
> 入口：登录 `admin` → 用户中心。绝密（L3）不进面板，面板只显示「是否已配置」布尔。

| L2 项 | Admin 菜单位置 | 存储（表 / 键） | 后端读取 |
|-------|----------------|-----------------|----------|
| 天地图 TK（主备池） | API 密钥管理 → 天地图 | `api_keys.tianditu_tk`（备用在 `api_key_backups`） | `GET /api/runtime-config/map-tokens` 下发前端 |
| Cesium Ion Token（主备池） | API 密钥管理 → Cesium | `api_keys.cesium_ion_token` | 同上 |
| 高德 Web 服务 Key（池） | API 密钥管理 → 高德 | `api_keys.amap_key` | external_proxy / IP 定位候选链：DB 池 → 旧 env 兼容兜底（不再新增 HF Secrets） |
| Agent 主密钥（池） | API 密钥管理 → Agent | `api_keys.agent_api_key`（旧 `agent_token` 兼容） | agent_chat 解析链：DB 池 → 旧 env 兼容兜底（不再新增 HF Secrets） |
| 默认 AI 直连配置 | API 密钥管理 → 默认 AI | `system_config.default_ai_api_key / _base_url / _model` | `/api/agent/default-ai-config`（api_key 不下发普通用户） |
| Agent 对话参数（base_url/model/可用模型/提示词/超时/max_tokens/温度/top_p/extra_body） | 管理员控制台 → LLM 对话参数配置 | `system_config.agent_*` | `/api/admin/agent/config`，运行时动态读取 |
| AI 对话配额（游客/注册） | 管理员控制台 → LLM 对话参数配置 | `system_config.agent_chat_*_daily_quota` | 同上；L1 env 仅作缺省 |
| 默认底图索引 | 管理员控制台 → 地图默认配置 | `system_config.default_basemap_index` | `/api/admin/config/default-basemap-index` |
| 管理员联系方式 | 管理员控制台 → 系统配置 | `system_config.admin_contact` | 公开接口下发 |
| 顶部公告 | 管理员控制台 → 系统配置 | `announcements` 表 | 公开接口下发 |
| 管理员头像 | 账号中心 → 头像（admin 登录） | `system_config.admin_avatar_index` | 登录/资料接口 |

**「仅 env」例外（有意不迁面板）**：`RUNTIME_CONFIG_ALLOWED_ORIGINS`、`PROXY_*`、`WEBGIS_LOG_STREAM_MODE` 等运维开关属 L1；`LOG` 监控令牌属 L3。

**L3 状态可见性**：管理员控制台顶部「环境密钥状态」卡片仅显示 SUPER_USER / OAUTH_STATE_SECRET / Google/GitHub OAuth / SMTP / Supabase 的已配置布尔（来自 `GET /api/admin/overview` 的 `l3_env_status`，不回显明文）。Agent/LLM 主密钥与高德 Web 服务 Key 是 L2 项，请在「API 密钥管理」面板查看和维护。

---

## 功能 → 必配项

| 功能 | 最少配置 |
|------|----------|
| 打开地图（游客） | L1 前端 `VITE_*` + 后端可访问；地图 token 建议 L2 |
| admin 后台 | L3 `SUPER_USER` 或本地 dev 默认密码 |
| 邮箱注册/重置 | L1 `SMTP_HOST/PORT/USER` + L3 `SMTP_PASSWORD`（账号/凭证分开存取） |
| Google 登录 | L3 Google Client ID/Secret + `OAUTH_STATE_SECRET`；控制台 redirect |
| GitHub 登录 | L3 GitHub Client ID/Secret + `OAUTH_STATE_SECRET`；控制台 callback |
| AI 对话 | L2 `api_keys.agent_api_key` + L2 `system_config.agent_*`（base_url/model/额度/提示词等）；旧 env 仅兼容存量 |
| 天地图/Cesium | L2 Admin token 池（不要 VITE 写死 token） |
| 高德搜索/IP | L2 `api_keys.amap_key`；旧 env 仅兼容存量 |
| 访客统计 Supabase | L3 `SUPABASE_URL` + Key |

---

## 邮箱拆分示例（你提的模型）

| 项 | 层 |
|----|-----|
| `SMTP_HOST` / `SMTP_PORT` | L1 |
| `SMTP_USER` | L1（发件账号半公开） |
| `SMTP_PASSWORD` | L3 绝密（凭证单独进 Secrets） |

## LLM 拆分示例

| 项 | 层 |
|----|-----|
| `agent_api_key`（旧 env `AGENT_API_KEY` 仅兼容兜底） | L2 Admin：API 密钥管理 → Agent |
| base_url / model / temperature / quota | L1 默认 + **L2 Admin 覆盖** |

## 后端地址

| 项 | 层 |
|----|-----|
| `BACKEND_PUBLIC_URL` / `VITE_BACKEND_URL` | L1 不涉密 |

---

## 相关文件

| 文件 | 角色 |
|------|------|
| [`.env.example`](../../.env.example) | 全集清单（唯一权威 key 目录） |
| `.env` | 本地实值（git 忽略；前后端共用：后端 loader 与 Vite envDir 都读它） |
| `.env.production` | 生产构建公开 VITE_*（提交 git，clone 必改 VITE_BACKEND_URL） |
| `frontend/.env.example` / `.env.production` | 指路存根（Vite 不再读取 frontend 目录 env） |
| `backend/.env.example` | 后端摘要，指向根清单 |
| `frontend/src/components/UserCenter/AdminControlPanel.vue` | L2 配置 UI |
| `backend/config/` | 统一读取入口：catalog 登记 / load L1+L3 / runtime L2 覆盖 / public 公开配置 |
| `backend/api/auth/constants.py` | 认证常量（已收敛：经 `backend/config` 读取） |

---

## 新增配置时的门禁

1. 先在根 `.env.example` 登记 key + 分层注释。  
2. 再写代码读取。  
3. L3 不得进前端、不得明文进 DB 面板。  
4. 更新本页「功能 → 必配项」如有新用户路径。
