# 后端三层配置统一 loader 全面落地（配置架构计划·阶段 2 完成）

## 日期和时间

2026-07-26 18:16（北京时间）

## 事件逻辑链条分析

- **核心症状**：`backend/config` 包处于半成品状态——`__init__.py` 导入 `load.py` 中不存在的名称（`settings/get_str/get_int/...`），`from config import ...` 必然 ImportError；`runtime.py`、`public.py` 缺失；全后端 20+ 处仍散落 `os.getenv` 直读；`oauth.py` 强制要求 `*_OAUTH_REDIRECT_URI` 否则 503，`build_frontend_redirect` 生产环境缺省回跳 `localhost:5173`。
- **根本原因**：上一会话执行阶段 2 时中断，`load.py` 与 `__init__.py` 由两次不同尝试写入且未对齐；业务模块尚未接入 loader；旧 OAuth 实现先于「URL 推导」设计落地。
- **受影响模块**：配置加载（backend/config）、认证/OAuth/SMTP（api/auth）、Agent（api/agent_chat）、位置与 IP 定位（location/ip_geo）、统计（statistics/Supabase）、瓦片与外部代理（proxy/external_proxy）、监控（monitor）、运行时配置（api_keys_management）、下载任务、GCJ 纠偏、应用入口 app.py。
- **解决思路**：先修包一致性 → 补 runtime/public → 按计划顺序（Auth/OAuth/SMTP → Agent → 其余）收敛读取 → 启动脱敏摘要与缺 L3 明确报错 → 全量验证 → 文档同步。

## 修改内容

1. **backend/config 包修复与补齐**
   - `__init__.py` 重写：导出与实现对齐（`get_settings/reload_settings/settings 惰性代理/get_str/get_int/get_float/get_bool/is_development_env/masked_summary/build_public_config/get_effective_str` 等），导入时自动加载根 `.env` + `backend/.env`（系统环境变量优先，保证 HF Secrets 不被覆盖）。
   - `load.py` 扩展：公开取值 helper（缺省 default 时回退 catalog 登记默认；数值越界按边界钳制）；`BackendSettings` 新增 `supabase_url/supabase_key/supabase_visits_table`（内置 `NEXT_PUBLIC_/SERVICE_ROLE_/ANON_` 等别名链）与 `AGENT_TOKEN`、`AMAP_KEY/GAODE_KEY` 兼容名解析；URL 默认值改由 `catalog.py` 常量单源提供；新增 `masked_summary()` 脱敏摘要。
   - `runtime.py` 新增：`get_system_config_value()`（懒导入 system_config，DB 不可用安静回退）与 `get_effective_str()`（L2 DB > L1 env > default）；**绝密 key（catalog secret=True）走 DB 覆盖直接抛 ValueError**，从机制上执行「绝密不进 DB」边界。
   - `public.py` 新增：`build_public_config()` 仅输出非密值与「是否已配置」布尔（oauth_google/oauth_github/email_verification/agent_env_key/amap/supabase），供前端公开端点使用。
   - `catalog.py` 补登记：`PROXY_ALLOW_PRIVATE_HOSTS`、`PROXY_VERIFY_SSL`、`WEBGIS_ASSUME_HF_SPACE`、`WEBGIS_ASSUME_IN_CONTAINER`（L1）；`AMAP_KEY`、`GAODE_KEY`、`LOG`（L3 绝密）。
2. **Auth/OAuth/SMTP 收敛（计划优先级 1）**
   - `auth/constants.py`：删除硬编码生产/开发域名常量；`SESSION_EXPIRE_HOURS`、`PASSWORD_HASH_ITERATIONS`、`OAUTH_*_TTL` 改由 settings（默认值不变，均已在根 `.env.example` 登记）；`is_development_env/get_oauth_backend_base_url/get_oauth_redirect_uri/get_oauth_frontend_redirect_url/_get_admin_password` 全部委托统一 loader；文件不再 import os。
   - `auth/oauth.py`：`_get_state_secret` 走 `settings.get_oauth_state_secret()`（生产缺失 503）；`_oauth_config` 的 client_id/secret 读 settings，`redirect_uri` 由 `BACKEND_PUBLIC_URL` 推导（`GOOGLE/GITHUB_OAUTH_REDIRECT_URI` 仍可覆盖），缺失项 503 精确到 `GOOGLE_OAUTH_CLIENT_SECRET` 级别；`build_frontend_redirect` 改由 `FRONTEND_PUBLIC_URL` 推导，修复生产缺省 localhost 缺口；删除 `_provider_env` 与未使用导入。
   - `auth/email_service.py`：移除 `load_dotenv` 与模块级 env 快照，改为调用时 `_smtp_config()` 读 settings（HF Secrets 注入即时生效）；`check_smtp_configured` 同步。
   - `auth/db.py`：`AUTH_DB_PATH` 走 settings；`SPACE_ID/HF_SPACE_ID` 平台探测经 `get_str`。
3. **Agent 收敛（优先级 2）**：`agent_chat/constants.py` 删除自带 `_safe_env_*`，全部默认经 `get_int/get_float/get_str/settings`；`db.py` env 兜底 key 用 `settings.agent_api_key`（含 AGENT_TOKEN 兼容）；`upstream.py` 高德 key 用 settings。L2（system_config/api_keys）覆盖逻辑保持不变。
4. **其余模块收敛（优先级 3）**：`location.py`、`services/ip_geo.py`（AMAP）、`statistics.py`（Supabase 三元组）、`proxy.py`（限流/私网/SSL 开关）、`external_proxy.py`（高德 env 候选链）、`monitor.py`（LOG 令牌、HF/容器探测、日志流模式）、`api_keys_management.py`（runtime-config CORS 白名单）、`download_task.py`、`gcj_rectify/utils.py` 全部改经 config helper；业务代码 `os.getenv/os.environ` 直读清零（仅 `backend/config` 内部允许）。
5. **启动可观测（app.py）**：日志级别接入 `LOG_LEVEL`；启动打印 `masked_summary()`（URL/SMTP 主机/Agent 默认 + 全部 L3「已配置/未配置」状态，绝不输出明文）；`_mask_smtp_user` 改读 settings。
6. **清单同步（根 .env.example）**：新增 `PROXY_ALLOW_PRIVATE_HOSTS/PROXY_VERIFY_SSL` 注释项；`LOG` 从 L1 注释移至 L3 段（监控令牌属绝密）；`AMAP_WEB_SERVICE_KEY` 注明兼容旧名。

## 修改原因

执行 `Docs/Guide/configuration-architecture-plan.md` 第 2 步（阶段 2）：配置读取收敛到统一入口，绝密只认 L3，OAuth 回调由公开 URL 推导，消除「改一处漏三处」与 clone 用户必须手配 4 个 redirect env 的负担；同时修复上会话中断遗留的坏包（导入即崩）。

## 影响范围

后端全部配置读取路径（认证、OAuth、邮件、Agent、地图代理、统计、监控、下载、纠偏）、应用启动日志、根配置清单。**不改变**：L2 Admin 面板与 system_config/api_keys 的既有读写逻辑、前端代码、数据库 schema、docker-compose（阶段 5 处理）。

行为差异说明（有意为之）：
- 开发环境判定统一为 `development/dev/local/test`（原 constants 为前三者、`_get_admin_password` 仅 `development`）；
- `SESSION_EXPIRE_HOURS` 等原代码常量现可经已登记 env 调整，默认值不变；
- OAuth 不再要求 `*_REDIRECT_URI`/`FRONTEND_OAUTH_*`（保留为可选覆盖）。

## 优化解决方案

分层职责：`catalog.py` 唯一登记（与根 `.env.example` 一一对应）→ `load.py` 只管 L1/L3 与快照 → `runtime.py` 只管 L2 覆盖且拒绝绝密 → `public.py` 只出安全字典。业务模块单向依赖 config 包；`runtime.py` 对 `api.auth.system_config` 采用函数内懒导入避免循环依赖。门禁约定：新增 key 必须先登记根 `.env.example` + `catalog.py`，CR 以 `grep -rn "os.getenv" backend --exclude-dir=config` 为零残留检查。

## 性能指标

非性能任务。启动新增一次配置摘要日志（6 行，微秒级）；`get_settings()` 为 lru_cache 快照，业务热路径读取成本低于原先每次 `os.getenv` 字符串处理。

## 测试方案

- **环境**：沙盒 Python 3.x（无 fastapi 依赖，config 包为纯标准库可独立测试）。
- **静态**：后端全树 `python -m py_compile` 通过；改动文件 AST 未定义名检查通过（2 处字典推导式误报已人工确认）；被删名称（`OAUTH_BACKEND_BASE_URL_*`、`_provider_env`、`_parse_env_flag`、`_safe_env_*`）全库零残留；`from .constants import` 名称与 constants 现有定义交叉校验通过；业务目录 `os.getenv/os.environ` 残留 0。
- **功能冒烟（30+ 断言全过）**：dev 模式 admin/123456、state secret 兜底、`http://localhost:7860/api/auth/oauth/google/callback` 推导、前端成功/失败回跳；`GOOGLE_OAUTH_REDIRECT_URI` 显式覆盖生效；`AGENT_TOKEN→AGENT_API_KEY` 优先级、Supabase/AMAP 别名链、表名默认 `visit_tracking_events`；`get_bool("off")=False`、`get_int` 越界钳制 9999→180、catalog 默认回退；prod 模式无 SUPER_USER 禁用管理员、state secret 不兜底、HF/Pages 默认 URL 与回跳推导；`masked_summary()`/`build_public_config()` 输出经明文泄漏断言（密码/密钥字符串不出现）；`get_effective_str("SUPER_USER")` 抛 ValueError。
- **待实机回归**（沙盒无 PyPI 无法启动 uvicorn）：`LocalDev.bat` 或 `docker-compose up` 后验证 ①启动日志出现「[配置]」摘要 6 行；②admin/123456 登录（dev）；③邮箱验证码发送；④OAuth 授权 URL 的 redirect_uri 与控制台一致；⑤HF 生产部署后 L3 状态行全部「已配置」。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\backend\config\__init__.py（重写修复）
- D:\Dev\GitHub\WebGIS-Dev\backend\config\load.py（重写扩展）
- D:\Dev\GitHub\WebGIS-Dev\backend\config\catalog.py（补登记）
- D:\Dev\GitHub\WebGIS-Dev\backend\config\runtime.py（新增）
- D:\Dev\GitHub\WebGIS-Dev\backend\config\public.py（新增）
- D:\Dev\GitHub\WebGIS-Dev\backend\app.py
- D:\Dev\GitHub\WebGIS-Dev\backend\api\auth\constants.py
- D:\Dev\GitHub\WebGIS-Dev\backend\api\auth\oauth.py
- D:\Dev\GitHub\WebGIS-Dev\backend\api\auth\email_service.py
- D:\Dev\GitHub\WebGIS-Dev\backend\api\auth\db.py
- D:\Dev\GitHub\WebGIS-Dev\backend\api\agent_chat\constants.py
- D:\Dev\GitHub\WebGIS-Dev\backend\api\agent_chat\db.py
- D:\Dev\GitHub\WebGIS-Dev\backend\api\agent_chat\upstream.py
- D:\Dev\GitHub\WebGIS-Dev\backend\api\location.py
- D:\Dev\GitHub\WebGIS-Dev\backend\services\ip_geo.py
- D:\Dev\GitHub\WebGIS-Dev\backend\api\statistics.py
- D:\Dev\GitHub\WebGIS-Dev\backend\api\proxy.py
- D:\Dev\GitHub\WebGIS-Dev\backend\api\external_proxy.py
- D:\Dev\GitHub\WebGIS-Dev\backend\api\monitor.py
- D:\Dev\GitHub\WebGIS-Dev\backend\api\api_keys_management.py
- D:\Dev\GitHub\WebGIS-Dev\backend\download_xyz\download_task.py
- D:\Dev\GitHub\WebGIS-Dev\backend\gcj_rectify\utils.py
- D:\Dev\GitHub\WebGIS-Dev\.env.example
- D:\Dev\GitHub\WebGIS-Dev\README.md（V3.4.6 版本记录扩写）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.6 条目扩写、修正日志引用）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\configuration.md（后端读取已落地说明、相关文件表）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\configuration-architecture-plan.md（阶段 0–2 状态标注）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-backend-unified-config-loader-phase2.md（本日志）

> 备注：文件树（project-structure.md / backend-structure.md / backend/README.md）在前次会话已补录 `backend/config/` 五文件，本次核对无需变更；未执行任何 git 操作，提交由用户决策。
