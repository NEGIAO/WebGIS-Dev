# WebGIS 三层配置架构 — 分阶段执行计划

> 日期：2026-07-26  
> 状态：**全部阶段已落地** —— 0/1/2（V3.4.6）、3（V3.4.8）、4（V3.4.10）、5（V3.4.11 compose/LocalDev + V3.4.13 HF 清单）、6（V3.4.13 门禁脚本，持续执行）  
> 目标：别人 clone 后只看**一个根目录配置清单**即可部署；密钥分级存放；管理员面板管常变项；HF Secrets 只管绝密。

---

## 0. 架构定稿（你确认的模型）

```text
安全等级从低到高

L1  根目录 .env / .env.example
    - 罗列 L1+L2+L3 全部配置项（全集目录）
    - 实际写入：不涉密 / 低密 / 持久常量
    - 安全等级：最低
    - 作用：clone-and-run 的唯一入口说明

L2  管理员面板 + 数据库（system_config / api_keys 等）
    - 只写：常变、运营可改、安全等级较高的参数
    - 前后端通过 API 动态读写
    - 安全等级：较高
    - 不写绝密明文

L3  Hugging Face Space Secrets
    - 只写：绝密
    - 后端 os.getenv / 统一 config loader 运行时读取
    - 安全等级：最高
    - 不进 git、不进前端、不进公开 API
```

### 硬性边界

| 允许 | 禁止 |
|------|------|
| `.env.example` 罗列全部 key + 分层注释 | 把 L3 真值提交进 git |
| 本地未提交 `.env` 填 L1（开发可临时含 L3） | `VITE_*` 写入任何 secret |
| Admin 面板改 L2（token 池、Agent 参数、底图等） | Admin/DB 明文存 SUPER_USER / OAuth secret / SMTP 密码 |
| HF Secrets 只放 L3 | 业务文件私自新增 env key 却不登记根 `.env.example` |
| 后端统一 config 模块读 env/DB | 前端浏览器直接读绝密 |

### 读取优先级（按字段类型）

```text
L3 绝密字段：
  仅环境变量（HF Secrets / 本地私密 env）
  禁止 DB 明文覆盖
  禁止返回前端

L2 运营字段：
  DB（Admin 写入）
  > L1 .env 中的非密默认（若有）
  > 代码默认常量

L1 低密常量：
  根目录 .env
  > 代码默认常量（constants / defaults）
```

### 前端特殊说明

根目录 `.env` **不是**浏览器可读文件。  
前端只能：

1. 构建期读 `VITE_*` 公开项（由 `frontend/.env*` 或 CI 注入，与根清单同源登记）；  
2. 运行期读后端公开 API（如 `/api/runtime-config/*`）。

后端才是 `os.environ` 的唯一敏感读取端。

---

## 1. 现状问题（为何要改）

配置目前至少散落在：

| 位置 | 典型内容 |
|------|----------|
| `frontend/.env.example` | `VITE_BACKEND_URL`、瓦片代理 |
| `backend/.env.example` | OAuth、SMTP、Supabase（不完整） |
| 各 py 文件 `os.getenv` | Agent、Amap、monitor、proxy、auth… |
| 代码硬编码 | basemap 写死 `negiao-webgis.hf.space` |
| `system_config` / Admin 面板 | Agent、底图、公告、联系方式 |
| `api_keys` + runtime-config | 天地图 / Cesium token 池 |
| HF Secrets | 部分密钥（文档与清单不统一） |

结果：clone 用户不知道先配哪、绝密与常量混谈、改一处漏三处。

---

## 2. 目标文件布局（最终态）

```text
WebGIS-Dev/
├── .env.example                 # 【唯一全集清单】L1+L2+L3 全 key + 注释（提交 git）
├── .env                         # 本地私密/低密实值（不提交）
├── Docs/Guide/
│   ├── configuration.md         # 给人看的配置说明书（与 .env.example 同步）
│   └── configuration-architecture-plan.md  # 本执行计划
├── backend/
│   ├── config/                  # 【新增】统一配置加载
│   │   ├── __init__.py
│   │   ├── catalog.py           # 所有 key 元数据：层、说明、默认、是否绝密
│   │   ├── load.py              # 解析 env + 默认
│   │   ├── runtime.py           # 合并 L2 DB 覆盖
│   │   └── public.py            # 生成前端安全公开配置
│   ├── .env.example             # 可保留为「指向根目录」的短文件，避免双源分叉
│   └── api/...                  # 逐步改为 from backend.config import ...
├── frontend/
│   ├── .env.example             # 仅 VITE_* 公开项，内容与根清单 L1 前端段一致
│   └── src/config/              # 可选：公开 runtime 类型与兜底
└── .gitignore                   # 确保忽略根 .env、frontend/.env.local 等
```

---

## 3. 分层登记表（实施时写入根 `.env.example`）

### L1 — 根 `.env` 可写实值（不涉密 / 低密）

| Key | 说明 | 默认建议 |
|-----|------|----------|
| `APP_ENV` | development / production | `development`（本地 docker-compose 已设） |
| `BACKEND_PUBLIC_URL` | 后端对外基址 | 本地 `http://localhost:7860`；生产 HF 域名 |
| `FRONTEND_PUBLIC_URL` | 前端对外基址 | 本地 `http://localhost:5173`；生产 Pages |
| `AUTH_DB_PATH` | 认证库路径 | HF 用 `/data/webgis_auth.db`；本地可空走默认 |
| `AUTH_SESSION_EXPIRE_HOURS` | 会话小时 | `72`（可改为代码常量，清单仍登记） |
| `OAUTH_STATE_TTL_SECONDS` | OAuth state TTL | `600` |
| `OAUTH_TICKET_TTL_SECONDS` | 一次性 ticket TTL | `120` |
| `SMTP_HOST` / `SMTP_PORT` | 邮件主机端口 | 阿里云默认 |
| `AGENT_BASE_URL` | Agent 默认上游（非 key） | 可有默认；常变时 L2 覆盖 |
| `AGENT_MODEL` 等非 key 默认 | 默认模型/超时等 | 可被 Admin L2 覆盖 |
| `VITE_BACKEND_URL` | 前端 API 基址 | 与 BACKEND_PUBLIC_URL 对齐 |
| `VITE_TILE_PROXY_BASE_URL` | 瓦片代理基址 | 默认同后端 |
| `VITE_TILE_PROXY_MODE` | fallback/always/off | `fallback` |
| `VITE_BASE_URL` | Pages 路径 | `./` 或 `/WebGIS-Dev/` |
| `PROXY_RATE_LIMIT` 等 | 非密运维开关 | 按需 |
| `LOG_LEVEL` | 日志级别 | `INFO` |

OAuth **回调完整 URL** 优先由 `BACKEND_PUBLIC_URL` / `FRONTEND_PUBLIC_URL` **推导**，清单中注释说明 Google/GitHub 控制台应填的路径；不必强迫用户再手写 4 个 redirect env（若保留兼容 env，也标为可选）。

### L2 — 仅登记在 `.env.example`，真值进 Admin + DB

| 逻辑名 / DB key | 说明 | 现有能力 |
|-----------------|------|----------|
| 天地图 TK 主备 | 地图 token 池 | Admin API keys + `/api/runtime-config/map-tokens` |
| Cesium Ion Token 主备 | 三维 token 池 | 同上 |
| `agent_*` / 默认 AI 配置 | 模型、base_url、额度、温度等 | AdminControlPanel + system_config |
| `default_basemap_index` | 默认底图 | Admin 已有 |
| Agent 主密钥（`agent_api_key` / 旧 `agent_token`） | LLM 主密钥 | 已迁 L2；旧 env `AGENT_API_KEY`/`AGENT_TOKEN` 仅兼容存量兜底 |
| 高德 Web 服务 Key（`amap_key`） | 搜索/定位 | 已迁 L2；旧 env `AMAP_WEB_SERVICE_KEY`/`AMAP_KEY`/`GAODE_KEY` 仅兼容存量兜底 |

`.env.example` 对 L2 只写：

```env
# [L2-Admin] MAP_TIANDITU_TK — 勿写真实值到 git；登录 admin 后在「API 密钥管理」配置
```

### L3 — HF Secrets 必配（`.env.example` 留空 + 说明）

| Key | 说明 |
|-----|------|
| `SUPER_USER` | 管理员密码（账号固定 `admin`） |
| `OAUTH_STATE_SECRET` | OAuth state 签名密钥 |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth（ID 可视为半公开，仍建议 Secrets） |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google 绝密 |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub 绝密 |
| `SMTP_USER` / `SMTP_PASSWORD` | 邮件账号与凭证（密码必须 L3；账号建议 L3） |
| `SUPABASE_URL` / `SUPABASE_KEY` 等 | 统计/外部库密钥 |

平台注入、一般不手写：`SPACE_ID` / `HF_SPACE_ID` 等。

---

## 4. 分阶段执行计划

### 阶段 0 — 约定与保护（0.5 天）【✅ 已完成 2026-07-26】

**产出**

- 本计划文档（已完成）
- `.gitignore` 明确忽略：
  - 根目录 `.env`
  - `frontend/.env.local`、`frontend/.env.*.local`
  - 保持 `backend/.env` 已忽略
- 约定：新增任何配置 key 必须先改根 `.env.example`，再写代码

**验收**

- `git check-ignore -v .env` 能命中
- 文档中 L1/L2/L3 定义与本文一致

**风险**

- 当前 `.gitignore` 里根 `.env` 曾被注释；必须打开忽略，防止误提交

---

### 阶段 1 — 根目录配置全集清单（1 天）【✅ 已完成 2026-07-26】

**产出**

1. `WebGIS-Dev/.env.example`  
   - 按 L1 / L2 / L3 三大段  
   - 每个 key：层级标签、用途、默认值、谁读取、HF 是否必配  
2. `Docs/Guide/configuration.md`  
   - clone 用户 5 分钟上手：复制、填 L1、HF 配 L3、admin 配 L2  
3. `backend/.env.example`、`frontend/.env.example`  
   - 顶部改为「权威清单见仓库根目录 `.env.example`」  
   - 避免双源长期分叉（短文件 + 链接）

**不做**

- 暂不改业务读取逻辑  
- 暂不迁 Admin 面板字段

**验收**

- 新用户只打开根 `.env.example` 能列出部署所需全部项  
- L3 项全部标注「仅 HF Secrets / 本地未提交 .env，禁止提交」  
- L2 项全部标注「Admin 面板 + DB」

---

### 阶段 2 — 后端统一配置加载入口（2–3 天）【✅ 已完成 2026-07-26，V3.4.6】

> 落地记录：`backend/config`（catalog/load/runtime/public）全部就位；Auth/OAuth/SMTP/Agent/Amap/Supabase/proxy/monitor/下载/纠偏收敛完毕，业务代码零裸 `os.getenv`；OAuth 回调/回跳由 PUBLIC_URL 推导；启动打印脱敏配置摘要。详见 `Docs/LLM_record/26-07-26/2026-07-26-backend-unified-config-loader-phase2.md`。

**产出**

```text
backend/config/
  catalog.py   # KEY 元数据（与 .env.example 一一对应）
  load.py      # get_str/get_int、APP_ENV、推导 OAuth URL
  runtime.py   # 读 system_config 覆盖 L2
  public.py    # 公开给前端的安全字典
```

**改造顺序（由易到难）**

1. **Auth / OAuth / SMTP / SUPER_USER**  
   - `oauth.py`、`email_service.py`、`constants.py` 管理员密码  
   - redirect / frontend 回调 URL 用 `BACKEND_PUBLIC_URL` + `FRONTEND_PUBLIC_URL` 推导  
   - 删除或降级对零散 `FRONTEND_OAUTH_*`、`*_REDIRECT_URI` 的强制依赖  
2. **Agent**  
   - `agent_chat/constants.py`、`AGENT_API_KEY` 走统一 loader  
   - L2 仍以 DB 为准覆盖模型/额度  
3. **Amap / Supabase / proxy / monitor**  
   - 逐步替换直接 `os.getenv`  
4. 启动时可选：打印「已加载配置项（脱敏）」便于排障

**验收**

- 业务模块不再新增裸 `os.getenv("NEW_KEY")`（CR 检查）  
- 本地 `APP_ENV=development` 时 admin/`123456` 与 OAuth 开发 URL 正常  
- 生产未设 L3 时失败信息明确（503 + 缺哪项）

**风险**

- OAuth redirect 推导后必须与 Google/GitHub 控制台 URI **字节级一致**  
- 多 worker 下内存 ticket 仍是已知限制（本阶段可不改存储）

---

### 阶段 3 — 对齐 L2 管理员面板（1–2 天）【✅ 已完成 2026-07-26，V3.4.8】

> 落地记录：`configuration.md` 新增 L2 对照表（项 ↔ Admin 菜单 ↔ DB 表/键 ↔ 读取端点）；
> `/api/admin/overview` 新增 `l3_env_status` 布尔，管理员控制台只读展示 8 项 L3 配置状态（不回显明文）；
> API 密钥管理 / LLM 参数面板文案与根 `.env.example` [L2] 段交叉链接。
> 详见 `Docs/LLM_record/26-07-26/2026-07-26-admin-panel-l2-alignment-phase3.md`。

**产出**

- 文档列出「所有 L2 项 ↔ Admin 菜单位置 ↔ DB 表/key」  
- 缺口补齐（若有 key 只在 env、应迁面板则迁）  
- 明确：**绝密不进面板**；Agent/高德这类第三方业务 Key 走 L2 密钥池，HF Secrets 仅保留平台侧绝密
- `AdminControlPanel` / API keys 文案与根 `.env.example` L2 段交叉链接

**已有可保留**

- 地图 token 池 + runtime-config  
- Agent 配置  
- 默认底图、公告、联系方式  

**验收**

- 运营改 token/模型只走 Admin，无需改 HF Secrets  
- 前端仍只消费公开 runtime API

---

### 阶段 4 — 前端公开配置收敛（1–2 天）【✅ 已完成 2026-07-26，V3.4.10】

> 落地记录：新增 `src/config/publicRuntime.ts` 单点基址派生（4 个拼接 helper）；
> basemapConfig/sourceDescriptors 12 处硬编码域名 + tileLifecycle/client.js env 直读全部收敛，src 域名残留 0；
> 后端挂 `GET /api/config/public`；`.env.production` 补 clone 必改说明。
> 详见 `Docs/LLM_record/26-07-26/2026-07-26-frontend-public-config-phase4.md`。

**产出**

1. `frontend/.env.example` 与根清单 L1 前端段同步  
2. 减少硬编码 `https://negiao-webgis.hf.space`：  
   - basemap / tile proxy 统一依赖 `VITE_BACKEND_URL` 或 `VITE_TILE_PROXY_BASE_URL`  
3. （可选）`GET /api/config/public` 一次下发公开 defaults，减少多处硬编码  

**验收**

- clone 用户改 `VITE_BACKEND_URL` 后，API 与代理不再打到你的 HF  
- 构建产物中无 secret 字符串  

**风险**

- basemap 文件多，建议先改 factory/基址拼接，再扫残留域名

---

### 阶段 5 — HF 部署清单与本地 compose（0.5–1 天）【✅ 已完成 2026-07-26，V3.4.11 + V3.4.13】

> 落地记录：compose 根 `.env` env_file 注入 + LocalDev.bat 自动生成根 `.env`（V3.4.11）；
> `configuration.md`「HF Secrets 最小集合」按功能分组复制清单 + Variables 建议 + 自检指引（V3.4.13）。

**产出**

1. `Docs/Guide/configuration.md` 增加「HF Secrets 最小集合」复制清单  
2. `backend/docker-compose.yml`  
   - 保持 `APP_ENV=development`  
   - 可选：`env_file: - ../.env` 使根目录 `.env` 注入容器  
3. README 快速开始增加 3 行：  
   - 复制根 `.env.example`  
   - 本地填 L1、HF 填 L3  
   - admin 配 L2  

**验收**

- 文档中的 HF 列表与 `.env.example` L3 段一致  
- 新环境按文档可完成：游客登录 / admin 登录 /（配齐后）OAuth  

---

### 阶段 6 — 清理与门禁（持续）【✅ 门禁已建立 2026-07-26，V3.4.13；持续执行】

> 落地记录：根目录 `CheckConfigRegistry.py` 七项扫描（裸 getenv / 未登记 key / catalog↔清单双向 /
> 散落 import.meta.env / VITE 未登记 / 硬编码域名），违规 exit 1；backend/README super_admin
> 过时段落清理 + 端口修正。新增配置 key 前先登记，提交前跑一次脚本。

**产出**

- 删除过时双写文档（如仍写 super_admin 当唯一管理员入口）  
- CI 或脚本（可选）：扫描 py/js 新增 `getenv`/`VITE_` 是否在 catalog  
- 维护日志按次任务写入 `Docs/LLM_record/`  

---

## 5. 建议实施顺序（你说「分部走」的默认路线）

```text
第 1 步  阶段 0 + 阶段 1
         根 .env.example 全集 + gitignore + configuration.md
         ← 立刻提升 clone 体验，几乎不改运行逻辑

第 2 步  阶段 2（Auth/OAuth/SMTP 优先）
         统一 loader + URL 推导 + 绝密只认 L3

第 3 步  阶段 3
         L2 与 Admin 面板对照表 + 文案

第 4 步  阶段 4
         前端硬编码域名清理

第 5 步  阶段 5–6
         HF/compose/门禁与文档收尾
```

**不建议**一上来大重构 Admin 或一次性改完所有 `os.getenv`。  
先「清单统一」，再「读取收敛」。

---

## 6. 每阶段完成定义（DoD）

| 阶段 | DoD |
|------|-----|
| 0 | gitignore 正确；计划文档入库 |
| 1 | 根 `.env.example` 含当前已知全部关键 key，分层注释完整 |
| 2 | Auth/OAuth/SMTP/Admin 密码经统一 loader；缺 L3 有明确错误 |
| 3 | L2 项均可在 Admin 找到配置入口或明确「仅 env」例外 |
| 4 | 前端无 secret；后端基址可配置且 basemap 代理不绑死原 HF |
| 5 | 按文档可在新机器/HF 走通主路径 |
| 6 | 无过时管理员账号说明；新增 key 有登记习惯 |

---

## 7. 与当前 OAuth / admin 的关系（避免返工）

- 管理员登录名：**`admin`**（不是 super_admin）  
- 密码：L3 `SUPER_USER`；本地 `APP_ENV=development` 且未设 SUPER_USER 时可用 `123456`  
- OAuth：标准授权码跳转已实现；Google One Tap **不在本配置计划内**（后续增强）  
- `admin`/`guest` **禁止** OAuth 绑定（安全策略，保持）  
- docker-compose 已加 `APP_ENV=development`，阶段 5 再挂根 `env_file`

---

## 8. 立即开始的第 1 个可执行任务清单

1. 修正 `.gitignore`：忽略根目录 `.env`  
2. 创建 `WebGIS-Dev/.env.example`（L1/L2/L3 全集）  
3. 创建 `Docs/Guide/configuration.md`（clone 指南）  
4. 缩短 `backend/.env.example` / `frontend/.env.example` 并指向根清单  
5. （可选）根 README「快速开始」加配置三层各 1 句  

完成本阶段后**暂停大改业务代码**，你确认清单 key 无遗漏，再进阶段 2。

---

## 9. 成功标准（项目级）

1. **Clone**：只打开根 `.env.example` 即知全部配置。  
2. **安全**：仓库与前端产物无 L3 真值。  
3. **运营**：换地图 token / 调 Agent 只开 Admin。  
4. **部署**：HF 只配 L3 Secrets + 少量公开 Variables（可选）。  
5. **开发**：本地 `APP_ENV=development` + 根 `.env` 可跑通主流程。

---

*本计划是配置架构的执行路线图；具体代码改造按阶段开独立维护日志（`Docs/LLM_record/`）。*
