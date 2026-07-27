# 2026-07-27 L1 env 配置与硬编码常量收敛

## 日期和时间

2026-07-27 16:19

## 修改内容

- 将仓库根目录 `.env` 明确为已提交的 L1 非涉密默认配置，`.env.example` 调整为 L1/L2/L3 全集 registry。
- 从 `.gitignore` 移除根 `.env` 忽略规则，保留 `.env.local`、`backend/.env` 等私密覆盖入口忽略。
- 新增并登记 L1 配置：HF 日志端点、下载输出目录、代理连接池/超时、ships66 模板、Amap/Nominatim/EPSG/IP 定位/OAuth provider 端点、前端请求超时与 Cesium CDN 候选链等。
- 后端业务模块改用 `backend/config` 的 `get_str/get_int` 读取部署相关端点和超时，避免在 Python 业务代码写死 Space 路径和第三方服务 URL。
- 前端通过 `src/config/publicRuntime.ts` 统一派生公开 `VITE_*` 配置，替换部分请求超时、瓦片超时、Cesium CDN 与天地图端点硬编码。
- 同步 README、配置指南、CHANGELOG、前后端 README 与项目结构文档中的配置说明。

## 修改原因

当前 `LOG` 只配置监控令牌，但 HF 日志接口的 Space owner/name/path 硬编码在 `backend/api/monitor.py`，迁移到其他 Space 时必须改代码。与此同时，根 `.env` 实际已被 Git 跟踪，但 `.gitignore` 和文档仍描述为“复制 `.env.example` 后忽略”的本地实值文件，导致 L1/L2/L3 配置边界不清晰。

## 影响范围

- 配置系统：根 `.env`、`.env.example`、`backend/config/catalog.py`。
- 后端：监控日志流、下载任务、通用代理、外部服务代理、IP 定位、反向地理编码、Agent IP 定位上下文、OAuth provider 访问。
- 前端：后端请求超时、Agent/空间分析超时、瓦片请求超时、Cesium CDN 候选链、天地图公开端点。
- 文档：根 README、配置指南、CHANGELOG、项目结构说明、前后端 README。

## 优化解决方案

1. 明确三层配置边界：
   - L1：tracked root `.env`，只放非涉密默认值。
   - L2：Admin + DB，继续存放 Agent/LLM Key、高德 Key、地图 token、运营参数。
   - L3：HF Secrets / 系统环境变量，继续存放 `SUPER_USER`、OAuth secret、SMTP 密码、Supabase Key、`LOG` 令牌。
2. 将 HF 日志 `LOG` 令牌和日志 URL 拆分：`LOG` 属 L3，`HF_RUN_LOGS_URL/HF_BUILD_LOGS_URL` 属 L1。
3. 使用现有 `get_str/get_int/get_bool/get_float` 配置 helper，不新增裸 `os.getenv` 或散落前端 `import.meta.env`。
4. 通过 `CheckConfigRegistry.py` 保证新增后端 key 已登记 catalog，catalog 已登记 `.env.example`，前端 `VITE_*` 仅从 `publicRuntime.ts` 单点读取。

## 性能指标

本次主要是配置治理与可部署性修复，不涉及可量化运行时性能优化。前端新增请求/CDN 超时配置有助于不同网络环境按需调参。

## 测试方案

- 运行 `python CheckConfigRegistry.py`，期望 7 项配置门禁全绿。
- 对改动后端 Python 文件运行 `py_compile`。
- 运行前端构建 `npm run build`，验证 Vite/TS/打包链路。
- 使用 `git check-ignore -v .env` 和 `git check-ignore -v backend/.env` 验证根 `.env` 不再忽略、`backend/.env` 仍忽略。
- 运行日志流时确认 `/api/monitor/logs/stream?type=run|build` 读取 `HF_RUN_LOGS_URL/HF_BUILD_LOGS_URL`。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\.gitignore`
- `D:\Dev\GitHub\WebGIS-Dev\.env`
- `D:\Dev\GitHub\WebGIS-Dev\.env.example`
- `D:\Dev\GitHub\WebGIS-Dev\.env.production`
- `D:\Dev\GitHub\WebGIS-Dev\backend\config\catalog.py`
- `D:\Dev\GitHub\WebGIS-Dev\backend\config\load.py`
- `D:\Dev\GitHub\WebGIS-Dev\backend\api\monitor.py`
- `D:\Dev\GitHub\WebGIS-Dev\backend\download_xyz\download.py`
- `D:\Dev\GitHub\WebGIS-Dev\backend\download_xyz\download_task.py`
- `D:\Dev\GitHub\WebGIS-Dev\backend\api\proxy.py`
- `D:\Dev\GitHub\WebGIS-Dev\backend\api\external_proxy.py`
- `D:\Dev\GitHub\WebGIS-Dev\backend\services\ip_geo.py`
- `D:\Dev\GitHub\WebGIS-Dev\backend\api\location.py`
- `D:\Dev\GitHub\WebGIS-Dev\backend\api\agent_chat\upstream.py`
- `D:\Dev\GitHub\WebGIS-Dev\backend\api\auth\oauth.py`
- `D:\Dev\GitHub\WebGIS-Dev\backend\api\agent_chat\constants.py`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\config\publicRuntime.ts`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\api\backend\client.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\api\backend\agent.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\api\backend\spatial.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\tileSource\types.ts`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\cesium-shim.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\api\geocoding.js`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\configuration.md`
- `D:\Dev\GitHub\WebGIS-Dev\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\project-structure.md`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\backend\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\.env.example`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\.env.production`
- `D:\Dev\GitHub\WebGIS-Dev\backend\.env.example`
