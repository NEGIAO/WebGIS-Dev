# 本地 admin 登录回归修复：APP_ENV 注入链路（V3.4.11）

## 日期和时间

2026-07-26 18:43

## 修改内容

- 修复本地调试 `admin/123456` 无法登录（`POST /api/auth/login` 返回 503「管理员密码未配置」）的回归。
- 新增 `backend/.env` 开发桥接文件（git 忽略）：仅含 `APP_ENV=development` 与本地 URL。经既有 `.:/app` 目录挂载即时进入容器 `/app/.env`，由 `load_project_env()` 读取——**无需重建容器，`docker compose restart` 即生效**，且与 Docker Compose 版本无关。
- `backend/docker-compose.yml`：新增单文件挂载 `../.env:/app/.env:ro`，重建容器后根目录 `.env`（含 OAuth 密钥、SMTP 等本地实值）成为容器内配置源（覆盖桥接文件）；保留 `environment: APP_ENV=development`（系统环境变量优先级最高）。初版曾用 `env_file` long syntax（`required: false`），因要求 Compose v2.24+ 且旧版本会硬报错阻断启动，改为版本无关的挂载方案。
- `LocalDev.bat`：启动时若根 `.env` 缺失，自动从 `.env.example` 复制生成（内含 `APP_ENV=development`）。
- `backend/config/load.py`：`get_admin_password()` 在非开发环境缺 `SUPER_USER` 时的错误日志补充当前 `APP_ENV` 值与本地排查指引（需重建容器）。
- 生成本机根 `.env`（git 已忽略）：`APP_ENV=development` + 本地 URL + L3 占位注释。

## 修改原因

用户本地调试时 admin 登录 503，后端日志：`SUPER_USER 未配置（HF Secrets / L3），非开发环境管理员登录已禁用`。本地环境被误判为生产环境，`admin/123456` 开发兜底密码被禁用。

## 事件逻辑链条分析

### 核心症状

- 登录页 admin + 123456 → 503 Service Unavailable。
- 后端日志显示「非开发环境管理员登录已禁用」——本地被判为生产。

### 根本原因

三个条件叠加：

1. 配置统一 loader（V3.4.6）将 `APP_ENV` 缺省值定为 `production`（生产安全默认，本身正确）；
2. 根目录 `.env` 为空（用户未执行 `cp .env.example .env`），无法提供 `APP_ENV=development`；即使填了，旧 compose 也没有把根 `.env` 注入容器的通道（容器内 `PROJECT_ROOT=/`，宿主机根 `.env` 不可见）；
3. compose 的 `environment: APP_ENV=development` 只在**容器创建/重建**时生效，而本地用 uvicorn `--reload` 热重载：当天配置重构的新代码被热加载进旧容器，环境变量却仍是旧的——新代码按 `production` 缺省运行。

### 受影响模块

- 登录链路：`backend/api/auth/routes.py` admin 分支（`_get_admin_password()` 为空 → 503）
- 配置层：`backend/config/load.py` `get_admin_password()` / `is_development`
- 本地启动链路：`backend/docker-compose.yml`、`LocalDev.bat`、根 `.env`
- 连带影响：本地 OAuth 调试——根 `.env` 中的 GitHub/Google 密钥此前同样无法进入容器

### 优化处理

- 打通「根 `.env` → 容器环境变量」通道（compose `env_file` + `required: false` 容错缺失）；
- 保证本地 compose 场景 `APP_ENV` 恒为 `development`（`environment` 优先于 `env_file`）；
- clone 后零配置自愈（LocalDev.bat 自动生成 `.env`）；
- 错误日志可自诊断（打印当前 `APP_ENV` 与处置指引）。

## 优化解决方案（实施步骤）

1. 定位 503 来源与日志出处，确认 `is_development=False` 为根因；
2. 排查 compose/LocalDev/`.env` 三处注入链路，确认根 `.env` 空 + 容器不可见 + 热重载不刷新环境的叠加；
3. 按「优化处理」实施四处修改；
4. 沙盒三场景断言验证 + compose YAML 解析校验 + `py_compile`。

## 性能指标

不涉及性能路径；env_file 仅在容器创建时读取一次，无运行时开销。

## 测试方案

**沙盒自动化（全部 PASS）**：

| 场景 | 条件 | 预期 |
|------|------|------|
| 1 | 进程无 APP_ENV，仅根 `.env`（新内容） | `app_env=development`，`get_admin_password()=123456`，`BACKEND_PUBLIC_URL=http://localhost:7860` |
| 2 | 无 `.env`、无环境变量 | `app_env=production`，admin 禁用，错误日志含「当前 APP_ENV=production + 排查指引」 |
| 3 | 环境变量注入 `APP_ENV=development`（模拟 compose） | development，admin=123456 |

另：`docker-compose.yml` YAML 解析校验（env_file long syntax 结构正确）、`load.py` 编译通过。

**本机验收步骤（需用户执行一次）**：

```bash
cd D:\Dev\GitHub\WebGIS-Dev\backend
docker compose restart          # 桥接文件经 .:/app 挂载已可见，重启进程即生效
docker compose logs --tail 20 api
```

日志「[配置] APP_ENV=development ...」出现后，登录页 admin/123456 可登录（桥接文件由代码读取，不体现在 `printenv`）。下次重建容器（LocalDev.bat 或 `up -d`）后，根 `.env` 挂载接管，无 Compose 版本要求。

补充：容器模拟验证（/app 下 config/ + 桥接 .env、进程无 APP_ENV）断言 `development` + `admin=123456` 通过；compose YAML 解析校验通过。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\.env（本机生成，git 忽略，不提交）
- D:\Dev\GitHub\WebGIS-Dev\backend\.env（开发桥接文件，git 忽略，不提交）
- D:\Dev\GitHub\WebGIS-Dev\backend\docker-compose.yml
- D:\Dev\GitHub\WebGIS-Dev\LocalDev.bat
- D:\Dev\GitHub\WebGIS-Dev\backend\config\load.py
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.11）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.11 版本段）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-fix-local-admin-login-app-env.md（本日志）
