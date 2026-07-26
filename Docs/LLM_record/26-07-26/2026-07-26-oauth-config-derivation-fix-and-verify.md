# OAuth 配置统一收尾与回调推导验证（V3.4.6）

## 日期和时间

2026-07-26 18:10

## 修改内容

- 完成 `backend/api/auth/oauth.py` 向 `backend/config` 三层统一配置的迁移收尾：清理迁移后遗留的未使用导入（`fastapi.Request`），确认模块内已无 `os.getenv` 直读。
- 修复 OAuth 回调地址配置缺口：`GOOGLE/GITHUB_OAUTH_REDIRECT_URI` 不再是必配项，缺省时由 `BACKEND_PUBLIC_URL` 自动推导为 `{base}/api/auth/oauth/{provider}/callback`；前端成功/失败回跳 URL 同理由 `FRONTEND_PUBLIC_URL` 推导（`#/oauth/callback` 与 `#/register`），二者均可用显式环境变量覆盖。
- 对推导链路做了 6 场景 12 断言的自动化验证（全部通过，详见「测试方案」）。
- 文档同步：根 README 版本升至 V3.4.6、CHANGELOG 新增版本段、`backend-structure.md` 与 `project-structure.md` 补录 `backend/config/` 包、后端 README 补充 OAuth 环境变量说明。
- 新增 `Docs/Guide/oauth-deployment.md`：Hugging Face 生产环境 Google/GitHub OAuth 完整配置操作手册（工作原理、GitHub OAuth App 与 Google Cloud 控制台逐步申请、HF Secrets/Variables 配置、启动日志与 curl 验收自检、本地开发配置、11 条常见错误排错速查表、安全要点），并接入根 README 文档导航、后端 README 与 Guide 文档树。

> 说明：`backend/config` 包（catalog/load/runtime/public）与 `oauth.py`/`constants.py` 的主体迁移代码于同日并行会话中落盘（规划见同目录 `2026-07-26-configuration-three-layer-plan-and-env-catalog.md`）；本日志记录该方案在 OAuth 链路上的收尾、验证与文档定版。

## 修改原因

用户配置 GitHub OAuth（已取得 Client ID/Secret）时发现登录链路未生效。排查发现配置文档（根 `.env.example`）承诺「REDIRECT_URI 留空则由 BACKEND_PUBLIC_URL 推导」，但旧版 `_oauth_config()` 将 `*_OAUTH_REDIRECT_URI` 列为硬性必配项，缺失即抛 503「OAuth 未配置」；`build_frontend_redirect()` 亦硬编码 `localhost:5173` 默认值，生产环境若未显式配置会把用户跳回本地地址。文档与代码行为不一致，需按文档承诺补齐推导回退。

## 事件逻辑链条分析

### 核心症状

- 仅配置 `GITHUB_OAUTH_CLIENT_ID/SECRET` 时，点击「使用 GitHub 继续」返回 503：`github OAuth 未配置：缺少 REDIRECT_URI`。
- `.env.example` 注释声称四个 URL 项「留空则用 BACKEND/FRONTEND_PUBLIC_URL 推导」，与实际行为矛盾。
- `config/load.py` 已实现 `get_oauth_redirect_uri()` 推导逻辑，但 `oauth.py` 只 import 未调用（死代码），仍直读环境变量。

### 根本原因

- `oauth.py` 早于三层配置架构（L1 env / L2 Admin+DB / L3 Secrets）成型，配置读取散落 `os.getenv`，重构后未同步接入 `BackendSettings` 的推导方法。

### 受影响模块

- 后端鉴权 OAuth 链路：`backend/api/auth/oauth.py`（授权 URL 构建、code 换 token、前端回跳）
- 统一配置层：`backend/config/load.py`（`BackendSettings.get_oauth_redirect_uri / get_oauth_frontend_redirect_url / get_oauth_state_secret`）
- 配置文档：根 `.env.example`、后端 README「环境变量」章节

### 优化处理

- `_oauth_config()`：client_id/secret/redirect_uri 全部改经 `get_settings()` 读取，redirect_uri 走「显式覆盖 → BACKEND_PUBLIC_URL 推导」链路；缺失项报错信息精确到环境变量名（如 `GITHUB_OAUTH_CLIENT_SECRET`）。
- `build_frontend_redirect()`：改用 `get_settings().get_oauth_frontend_redirect_url(success)`，移除 localhost 硬编码，保留 hash router 参数拼接逻辑。
- `_get_state_secret()`：改经 `get_settings().get_oauth_state_secret()`，开发环境保留内置兜底，生产缺失抛 503 并提示配置 `OAUTH_STATE_SECRET`。
- 清理未使用导入（`Request` 及旧 constants 辅助函数引用），`api/` 目录下确认无 OAUTH 相关 `os.getenv` 残留。

## 优化解决方案（实施步骤）

1. 梳理前后端 OAuth 全链路（RegisterView → `/oauth/{provider}/start` → 第三方授权 → `/callback` → ticket → `/#/oauth/callback`），定位配置读取点。
2. 对照 `.env.example` 与 `config/load.py`，确认推导逻辑已存在但未接线，属接入缺口而非缺实现。
3. `oauth.py` 三处配置读取全部收敛到 `get_settings()`（见「优化处理」）。
4. 移除迁移后未使用的 `fastapi.Request` 导入。
5. 编写场景化验证脚本（stub `fastapi`/`httpx`、伪造包路径绕过 `api.auth` 门面以避免 pydantic 依赖），逐场景独立进程执行，隔离环境变量与 lru_cache。
6. 同步全部文档（版本三处、CHANGELOG、两份文件树、后端 README）。

## 性能指标

本次为配置正确性修复，无性能敏感路径变更。配置经 `lru_cache` 快照读取，推导仅字符串拼接，无新增 I/O 或每请求开销。

## 测试方案

**测试环境**：Linux 沙盒，Python 3.x，无 fastapi/httpx（以最小 stub 替代，仅覆盖 `HTTPException`/`status`），`AUTH_DB_PATH` 指向临时目录避免污染仓库数据。

**自动化场景（6 场景 12 断言，全部 PASS）**：

| # | 场景 | 环境变量 | 预期结果 |
|---|------|----------|----------|
| 1 | dev 推导 | APP_ENV=development + GITHUB CLIENT_ID/SECRET | redirect_uri=`http://localhost:7860/api/auth/oauth/github/callback`；授权 URL 正常（dev state secret 兜底）；成功/失败回跳为 `localhost:5173/#/oauth/callback`、`#/register` 且 hash 参数拼接正确 |
| 2 | 显式覆盖 | 另加 GITHUB_OAUTH_REDIRECT_URI | 覆盖值原样生效 |
| 3 | prod 推导 | APP_ENV=production + BACKEND/FRONTEND_PUBLIC_URL + OAUTH_STATE_SECRET | 推导出 HF Space 回调与 GitHub Pages 回跳；授权 URL 含 URL 编码后的回调 |
| 4 | prod 缺 state secret | 同上但无 OAUTH_STATE_SECRET | `build_authorization_url` 抛 503，detail 指明 OAUTH_STATE_SECRET |
| 5 | 缺 client secret | 仅 GITHUB_OAUTH_CLIENT_ID | 503，detail 精确指明缺 GITHUB_OAUTH_CLIENT_SECRET |
| 6 | Google 推导 | GOOGLE CLIENT_ID/SECRET | redirect_uri=`http://localhost:7860/api/auth/oauth/google/callback` |

**静态检查**：`python -m py_compile` 通过（oauth.py / constants.py / config/load.py / config/catalog.py）；`grep` 确认 `backend/api/` 无 OAUTH 环境变量直读残留。

**人工验收步骤**：根 `.env` 写入 `APP_ENV=development` + `GITHUB_OAUTH_CLIENT_ID/SECRET` 三行（无需 REDIRECT_URI），GitHub OAuth App 控制台 Authorization callback URL 填 `http://localhost:7860/api/auth/oauth/github/callback`，重启后端 → 登录页点「使用 GitHub 继续」→ 授权后应回跳 `/#/oauth/callback` 并写入会话。生产验收同理：HF Secrets 配置四个 CLIENT 项 + `OAUTH_STATE_SECRET`，控制台回调填 `https://negiao-webgis.hf.space/api/auth/oauth/github/callback`。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\backend\api\auth\oauth.py（配置读取收敛 + 清理未使用导入）
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.6 三处 + 版本表）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（新增 V3.4.6 版本段）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\backend-structure.md（补录 backend/config/ 目录树）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\project-structure.md（backend 段补 config/ + 日志归档注释更新）
- D:\Dev\GitHub\WebGIS-Dev\backend\README.md（结构变更说明 + OAuth 环境变量章节 + 指南链接）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\oauth-deployment.md（新增：HF 生产环境 OAuth 配置操作手册）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-oauth-config-derivation-fix-and-verify.md（本日志）
