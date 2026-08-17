# WebGIS 配置指南（Clone 必读）

> 权威配置清单：仓库根目录 [`.env.example`](../../.env.example)  
> 分阶段架构计划：[configuration-architecture-plan.md](configuration-architecture-plan.md)  
> 返回 [根 README](../../README.md)

---

## 双 env 文件架构（L1 不涉密）

| 文件 | 用途 | git 状态 | 读取时机 | `APP_ENV` | 典型值 |
|------|------|----------|----------|-----------|--------|
| **`.env`** | 部署环境（生产基线） | **git 追踪** | `npm run build` + 线上部署 | `production` | 线上 URL（HF Space / GitHub Pages） |
| **`.env.local`** | 本地开发环境 | **git 追踪** | `npm run dev` + 本地后端启动 | `development` | localhost |

**核心规则**：
- `.env` = 部署环境配置（git 追踪），Vite 在 `npm run build` 时读取，后端在线上部署时读取
- `.env.local` = 本地开发环境配置（git 追踪），Vite 在 `npm run dev` 时读取，后端在本地开发时读取
- 后端加载顺序：`.env`（始终）→ `.env.local`（始终存在，本地覆盖生产值）→ `backend/.env`（容器兼容）
- 前端通过 `selectiveEnvPlugin`（`vite.config.js`）实现按 mode 二选一：production 读 `.env`，development 读 `.env.local`

### 后端读取

- 统一由 `backend/config` 包加载：`catalog.py` 登记全集，`load.py` 提供 `get_settings()` 快照与 `get_str/get_int/get_float/get_bool`，`runtime.py` 提供 L2（system_config）覆盖读取，`public.py` 生成前端安全公开配置。
- 业务代码禁止直接 `os.getenv`（仅 `backend/config` 内部允许），CR 时以 `grep os.getenv backend --exclude-dir=config` 为门禁。
- 加载顺序：系统环境变量（HF Secrets/Docker 注入，优先） > 根 `.env` > 根 `.env.local` > `backend/.env`（兼容）。
- 生产 L3 只从环境变量注入（HF Secrets）；启动日志输出脱敏配置摘要与 L3 配置状态。
- 后端 URL 推导（`BACKEND_PUBLIC_URL` / `FRONTEND_PUBLIC_URL` 留空时）：
  - `APP_ENV=production` → `https://negiao-webgis.hf.space` / `https://negiao.github.io/WebGIS-Dev`
  - `APP_ENV=development` → `http://localhost:7860` / `http://localhost:5173`

---

## 三层安全模型（L1 / L2 / L3）

> 所有配置 key 按**安全等级**分层存储，不同层有不同的存储位置、读取方式和可见性约束。

| 层级 | 名称 | 存储位置 | 典型内容 | 谁改 | 可见性约束 |
|------|------|----------|----------|------|------------|
| **L1** | 公开常量 | 根 `.env`（部署）+ 根 `.env.local`（本地），均 git 追踪 | URL、端口、超时、`VITE_*` 前端变量、非密默认值 | 开发者 / 部署者 | 完全公开，可进 git，不涉密 |
| **L2** | 运营密钥 | SQLite（`api_keys` 表 / `system_config` 表） | 天地图 TK、Cesium Ion Token、Agent 主密钥、高德 Key、模型/配额/提示词参数、默认底图、公告 | 运营（登录 `admin` → 用户中心） | 不进 git、不进 HF Secrets；Admin 面板可读写；前端仅接收非密功能布尔 |
| **L3** | 平台绝密 | HF Space **Secrets**（生产环境变量，本地不提交） | `SUPER_USER`、OAuth Client Secret、`SMTP_PASSWORD`、Supabase Key、`LOG` 监控令牌 | 部署者（仅平台侧） | **严禁进 git / DB / 前端**；Admin 面板只显示「是否已配置」布尔，不回显明文 |

**核心安全规则**：

1. **L1 可落 git**：`.env` 和 `.env.local` 都是 L1 不涉密，全部追踪提交；clone 即可用，无需额外模板复制。
2. **L2 走 DB 不走 env**：运营密钥（地图 token、Agent Key 等）存储在 SQLite，通过 Admin 面板动态管理，旧 env 兼容兜底但**不再新增 HF Secrets**。
3. **L3 只进平台 Secrets**：绝密凭证只能以 HF Space Secrets（或生产环境变量）注入，本地开发不提交任何 L3 真值；生产缺 L3 时快速失败 + 精确报错。
4. **前端永不含 L3**：Vite 只注入 `VITE_` 前缀变量（L1），`VITE_*` 永远不承载 secret；根 `.env` 中的 L3 变量不会泄漏到前端构建产物。
5. **DB 覆盖 L3 直接抛错**：`runtime.py` 对 catalog 标记为绝密的 key 拒绝从 `system_config` 覆盖，代码层硬约束。

**典型分层示例（邮箱 / LLM）**：见文末「邮箱拆分示例」与「LLM 拆分示例」。

---

## 5 分钟上手

### 1. 确认 L1 默认配置

```bash
# 在仓库根目录 WebGIS-Dev/：.env 已随仓库提交，无需复制模板
# 只修改不涉密 L1 值；L2/L3 真值不要写入 tracked .env
```

如需本地私密覆盖，优先使用系统环境变量 / HF Secrets；后端兼容入口 `backend/.env` 仍被 `.gitignore` 忽略。

### 2. 本地最低配置（L1）

`.env.local` 中确认（本地开发覆盖）：

```env
APP_ENV=development
BACKEND_PUBLIC_URL=http://localhost:7860
FRONTEND_PUBLIC_URL=http://localhost:5173
VITE_BACKEND_URL=http://localhost:7860
VITE_TILE_PROXY_BASE_URL=http://localhost:7860
VITE_TILE_PROXY_MODE=fallback
```

`.env` 中确认（部署环境基线）：

```env
APP_ENV=production
BACKEND_PUBLIC_URL=https://negiao-webgis.hf.space
FRONTEND_PUBLIC_URL=https://negiao.github.io/WebGIS-Dev
VITE_BASE_URL=./
VITE_BACKEND_URL=https://negiao-webgis.hf.space
VITE_TILE_PROXY_BASE_URL=https://negiao-webgis.hf.space
VITE_TILE_PROXY_MODE=fallback
```

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

# OAuth 登录（Google / GitHub / Hugging Face，任一都需要 state 密钥）
OAUTH_STATE_SECRET
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GITHUB_OAUTH_CLIENT_ID
GITHUB_OAUTH_CLIENT_SECRET
HUGGINGFACE_OAUTH_CLIENT_ID
HUGGINGFACE_OAUTH_CLIENT_SECRET

# 邮箱验证码（注册/重置/绑定）—— 账号 SMTP_USER 属 L1（Variables 或代码默认），凭证与回信地址必进 Secrets
SMTP_PASSWORD
SMTP_REPLY

# AI 对话主密钥：不进 HF Secrets；登录 admin 后在 L2 API 密钥管理 → Agent 配置 agent_api_key
# 高德搜索 / IP 定位：不进 HF Secrets；登录 admin 后在 L2 API 密钥管理 → 高德 配置 amap_key

# 访客统计
SUPABASE_URL
SUPABASE_KEY

# 可选：监控日志流访问令牌
LOG
```

Variables（非密，可选）：`APP_ENV=production`、`BACKEND_PUBLIC_URL`、`FRONTEND_PUBLIC_URL`、`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`HF_RUN_LOGS_URL`、`HF_BUILD_LOGS_URL`。
配好后看启动日志「[配置] [L3] ...」行或 admin 控制台「环境密钥状态」卡片自检。

1. Space **Secrets** 只添加根 `.env.example` 中 **[L3]** 段（上表）。  
2. 公开 URL 用 L1（代码常量或 Space Variables，与 Secrets 分离）：  
   - 后端：`https://<your-space>.hf.space`  
   - 前端 Pages：`https://negiao.github.io/WebGIS-Dev`（按你的仓库路径）  
3. Google / GitHub / Hugging Face 控制台回调必须与后端一致：  

```text
https://<your-space>.hf.space/api/auth/oauth/google/callback
https://<your-space>.hf.space/api/auth/oauth/github/callback
https://<your-space>.hf.space/api/auth/oauth/huggingface/callback
```

4. 不要把 Client Secret 放进前端或 git。

> 📘 OAuth 生产配置的**逐步操作手册**（Google/GitHub/Hugging Face 控制台逐字段申请步骤、Secrets 配置、验收自检、排错速查表）见 [oauth-deployment.md](oauth-deployment.md)。

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

**「仅 env」例外（有意不迁面板）**：`RUNTIME_CONFIG_ALLOWED_ORIGINS`、`PROXY_*`、`DOWNLOAD_*`、`HF_RUN_LOGS_URL`、`HF_BUILD_LOGS_URL`、`WEBGIS_LOG_STREAM_MODE` 等运维开关属 L1；`LOG` 监控令牌属 L3。

**L3 状态可见性**：管理员控制台顶部「环境密钥状态」卡片与启动日志 `[L3]` 摘要**自动生成**（V3.5.22）——组定义由 `catalog.py` 元数据驱动（`status_label` 分组 / `layer=L3` 独立 / `status_exclude` 排除历史兼容名），新增 L3 key 只需在 catalog 登记即自动出现在两处监控，无需改任何消费方代码。仅显示 SUPER_USER / OAUTH_STATE_SECRET / Google/GitHub/Hugging Face OAuth / SMTP / SUPABASE 等的已配置布尔（来自 `GET /api/admin/overview` 的 `l3_env_status`，不回显明文）。Agent/LLM 主密钥与高德 Web 服务 Key 是 L2 项，请在「API 密钥管理」面板查看和维护。

---

## 功能 → 必配项

| 功能 | 最少配置 |
|------|----------|
| 打开地图（游客） | L1 前端 `VITE_*` + 后端可访问；地图 token 建议 L2 |
| 日志监控 | L1 `HF_RUN_LOGS_URL/HF_BUILD_LOGS_URL` + L3 `LOG`（本地 local 模式不需要 LOG） |
| admin 后台 | L3 `SUPER_USER` 或本地 dev 默认密码 |
| 邮箱注册/重置 | L1 `SMTP_HOST/PORT/USER` + L3 `SMTP_PASSWORD`/`SMTP_REPLY`（账号/凭证分开存取；回信地址可选） |
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
| `SMTP_REPLY` | L3 绝密（回信地址 Reply-To，HF Secrets；留空则回信到发件账号） |

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
| [`.env.example`](../../.env.example) | 全集 key 目录 / registry（L1/L2/L3 均登记，非复制模板） |
| [`.env`](../../.env) | 部署环境配置（git 追踪）：生产基线值，`npm run build` 与线上部署读取 |
| [`.env.local`](../../.env.local) | 本地开发环境配置（git 追踪）：开发覆盖值，`npm run dev` 与本地后端读取 |
| `backend/.env` | ignored 后端本地兼容覆盖入口；不要提交 |
| `frontend/.env.example` | 指路存根（Vite 不再读取 frontend 目录 env） |
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
