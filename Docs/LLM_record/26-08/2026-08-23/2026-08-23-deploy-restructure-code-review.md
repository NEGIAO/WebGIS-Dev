# 2026-08-23 部署架构重组 Code Review 与修复

## 日期与时间

2026-08-23 19:20

## 任务等级

L2（暂存区变更审查 + 缺陷修复 + 文档同步；重组本身为用户已完成的 L3 方案，本次为其验收与修复）

## 问题分析

### 核心症状

暂存区包含一次部署架构大重组：单容器全栈镜像 + 环境文件收敛 `deploy/` + 脚本归档 `Scripts/`。需全面 Code Review 并修复发现的问题。

### 变更全貌（18 文件，+552/−284）

| 类别 | 内容 |
|---|---|
| 新增 | `deploy/Dockerfile`（nginx + FastAPI 单容器）、`Dockerfile.dockerignore`、`docker-compose.yml`、`nginx.conf` |
| 迁移 | 根 `.env` / `.env.local` / `.env.example` → `deploy/`；根三脚本 → `Scripts/` |
| 删除 | `backend/Dockerfile`、`backend/.dockerignore`、`backend/docker-compose.yml`（旧后端独立镜像链路） |
| 修改 | `.github/workflows/deploy.yml`（Job 5 subtree→git archive 全栈推送）、`LocalDev.bat`（全容器化）、`README.md`、`backend/config/load.py`（env 三级回退）、`frontend/vite.config.js`（envDir→deploy/、代理四段透传、轮询 watch） |

### 审查方法与验证点

1. **构建期 env 一致性**：vite `selectiveEnvPlugin` 的 envDir = `<frontend>/../deploy`；Dockerfile 阶段一 WORKDIR=/src/frontend → 容器内期望路径 `/src/deploy/.env`。
2. **运行时 env 链路**：compose api 服务挂载 `../deploy/.env:/app/.env:ro` + `../deploy/.env.local`；`load.py._resolve_env_file` 三级回退 deploy/ → 根 → BACKEND_DIR，两侧均命中。
3. **nginx 透传段 vs 后端路由**（逐段 grep 实测）：`/api/*`（auth/statistics/admin/download/agent/spatial 等 prefix 全部 `/api...`）、`/proxy/*` 与 `/tiles/*`（proxy.py 无前缀 APIRouter，路由字面量 `/proxy/gcj2wgs`、`/tiles/ships66`）、`/monitor/*`（monitor.py prefix）——正则 `^/(api|proxy|tiles|monitor)(/|$)` 完整覆盖，无遗漏路由。SSE（realtime_stats `/statistics/stream`）落在 `/api` 段且 nginx 已关缓冲 ✅。
4. **HF 推送体积**：`git archive HEAD deploy backend frontend` 只取追踪文件；实测追踪体积 frontend 93.4MB（含 tileset 33.6MB、cloud-atmosphere .bin 8MB×3）+ backend 1.3MB，均在 HF 可接受范围。
5. **门禁脚本**：迁移后 ROOT 解析正确（parent.parent），LocalDev.bat 引用同步更新。
6. **文档残留**：全仓 grep 旧路径引用（subtree split / backend/Dockerfile / 根 .env / CheckConfigRegistry.py 仓库根）。

### 发现的问题（按严重度）

| 级别 | 问题 | 后果 |
|---|---|---|
| **P0** | Dockerfile:37 `COPY deploy/.env /src/.env`，vite envDir 实际读 `/src/deploy/.env` | 构建期 env 读空 → API 基址回落 publicRuntime 硬编码默认 `http://localhost:7860` 打进产物 → HF 线上全部 API 请求必挂 |
| P1 | vite.config.js 新增 `VITE_DEV_PROXY_TARGET` / `VITE_WATCH_USEPOLLING` / `VITE_WATCH_INTERVAL` 未登记 | 配置门禁 F2 违规 ×3（实跑确认 exit 报违规） |
| P1 | README「双轨部署」引用已删除的 `backend/Dockerfile` | 用户按 README 手动构建必失败 |
| P2 | CI 未拷 `Dockerfile.dockerignore` 到 Space 根 | BuildKit 按 Dockerfile 路径配对 ignore 文件；缺配对 → 白名单失效 → stats.html(1.7MB)/tileset(33MB)/node_modules 噪音进上下文，HF 构建变慢甚至超限 |
| P2 | 结构树/架构文档大量旧引用（project-structure 补漏、cicd-pipeline Job5 subtree 描述过时等） | 文档与实际部署方式漂移，误导后续会话 |
| P3 | LocalDev.bat 死标签 `ERR_NODE`/`ERR_NPM`/`ERR_NPM_INSTALL`、重复 FRONTEND_DIR 赋值、「root .env」文案 | 死代码与误导提示 |

## 修改内容

1. `deploy/Dockerfile`：COPY 目标改为 `/src/deploy/.env`，sed 同步指向新路径，注释说明 envDir 错位机制。
2. `deploy/.env.example`：新增「前端 dev server 运行时开关」段，登记 3 个 VITE_ 键（含消费方说明）。
3. `.github/workflows/deploy.yml`：Assemble 步补拷 `Dockerfile.dockerignore` 并注释 BuildKit 配对规则。
4. `README.md`：「双轨部署」段改写——删除 backend/Dockerfile 死引用，改为 git archive 组装描述 + 单容器镜像手动等价命令。
5. `LocalDev.bat`：删 3 个死 goto 标签及其 handler 体、合并重复赋值、env 提示文案更正为 deploy/ 路径。
6. 文档同步：
   - `Docs/Guide/project-structure.md`：补 `Write-Color.ps1` 条目（deploy//Scripts/ 树已由并行会话更新到位）
   - `Docs/Guide/backend-structure.md`：死条目已随并行会话移除（核对通过）
   - `Docs/Architecture/cicd-pipeline.md`：Job 5 改写为「全栈单容器部署」（验证资产/git archive 组装/LFS/dockerignore 配对），部署时序图同步
   - `Docs/Architecture/deployment-relationship.md`：后端域名两处「subtree split」→「git archive 全栈 → 单容器镜像」
   - `Docs/Architecture/system-architecture.md`：部署平台表 HF Docker 行更新
   - `Docs/Architecture/configuration-three-tier.md`：Mermaid 图 ENVF/GATE 节点路径、部署拓扑行、第 8 节登记流程、版本足迹后相关代码路径
   - `Docs/Force_command.md`:45,80,98,162-163：门禁命令加 Scripts/ 前缀、「根 .env」→「deploy/.env」

## 修改原因

架构重组后配置读取路径、构建上下文、CI 推送方式全部改变，任何一处路径不同步都会导致「本地能跑、线上挂」或「文档误导」。P0 属于典型的双源路径漂移（vite envDir 是隐式约定，Dockerfile 作者按直觉 COPY 到了错误位置），必须在合并前拦截。

## 影响范围

- 部署链路：GitHub Actions 五 Job、HF Space 构建、本地 compose 编排
- 前端构建：vite envDir / 构建期 VITE_* 注入 / dev proxy / watch 轮询
- 后端配置加载：load.py 三级回退（本次未改动，仅验证）
- 文档体系：结构树 ×2、架构文档 ×4、规范文档 ×1、README

## 解决方案

### 方案对比（P0 修复路径）

| 方案 | 说明 | 结论 |
|---|---|---|
| A. 改 COPY 目标到 `/src/deploy/.env` | 与 vite envDir 隐式约定对齐，改动最小 | ✅ 采用 |
| B. vite envDir 参数化（环境变量覆盖） | 灵活但引入第二配置面，违背 SSOT | ❌ 过度设计 |
| C. 构建期 ARG 直接 define 注入，绕过 env 文件 | 绕开 selectiveEnvPlugin，但 dev/build 双通道分叉，维护成本高 | ❌ |

### 实施步骤

审查（全文通读 + 逐段 grep 验证 + 双门禁实跑）→ 按 P0→P3 顺序修复 → 文档全量对齐 → 门禁复跑确认全绿 → 版本号 + CHANGELOG + 本日志。

## 性能指标

未实测（本次为正确性修复；dockerignore 配对修复预期显著缩短 HF 构建上下文传输时间，待 CI 实证）。

## 测试方案

| Agent 已执行 | 结果 |
|---|---|
| `python Scripts/CheckConfigRegistry.py` | ✅ 7 项全绿（catalog 122 key · 前端 VITE 使用 12 个；F2 ×3 修复后由违规转绿） |
| `python Scripts/CheckStructureTree.py` | ✅ 459=459，0 漏登记 0 幽灵 |
| nginx 透传段 vs 后端路由逐段核对 | ✅ `/api /proxy /tiles /monitor` 正则与全部 router prefix 吻合，无遗漏路由 |
| compose env 挂载 ↔ load.py 回退链路推演 | ✅ 两文件均可命中 |
| 全仓 grep 旧路径残留（subtree/backend\/Dockerfile/根 .env/脚本根路径） | ✅ 活文档已清零（TODO/历史日志按规范保持原样不迁移） |

| 待用户实机验证 | 步骤与预期 |
|---|---|
| 本地全栈构建 | `docker compose -f deploy/docker-compose.yml up -d --build` 成功；http://localhost:8080（`--profile prod up`）页面正常、Network 无 localhost:7860 请求 |
| 本地调试双服务 | 默认 `up -d` 后 http://localhost:5173 HMR 生效（改 src 秒级热更）、7860 /docs 正常 |
| CI + HF | push main 后 Actions 五 Job 全绿；HF Space 构建成功；https://negiao-webgis.hf.space 页面 API 走同源相对路径 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `deploy/Dockerfile` | P0 修复：COPY /src/deploy/.env 对齐 vite envDir |
| `deploy/.env.example` | 登记 3 个 VITE_ dev 开关键（F2 修复） |
| `.github/workflows/deploy.yml` | 补拷 Dockerfile.dockerignore（BuildKit 配对） |
| `README.md` | 双轨部署死引用改写 + 三处版本号 V3.5.29 |
| `LocalDev.bat` | 死标签/重复赋值/过时文案清理 |
| `Docs/Guide/project-structure.md` | 补 Write-Color.ps1 条目 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.5.29 条目 |
| `Docs/Architecture/cicd-pipeline.md` | Job 5 全栈单容器化改写 + 时序图 |
| `Docs/Architecture/deployment-relationship.md` | 部署来源矩阵 2 处更新 |
| `Docs/Architecture/system-architecture.md` | 部署平台表 1 处更新 |
| `Docs/Architecture/configuration-three-tier.md` | Mermaid 图 + 登记流程 + 路径引用更新 |
| `Docs/Force_command.md` | 门禁命令与配置 key 登记路径更新 |
| （本日志）`Docs/LLM_record/26-08/2026-08-23/2026-08-23-deploy-restructure-code-review.md` | 审查报告与修复记录 |

## 遗留与风险

1. **HF 构建未实证**：dockerignore 配对、Space 内 npm ci/vite build/uv sync 全流程待首次 CI 推送验证（Agent 无 Docker/网络环境）。⚠️ 未验证
2. **tileset 33MB 进镜像**：`frontend/public/tileset`（663 文件）会随 git archive 进入 HF 构建上下文并打进镜像静态层；若 Space 存储/构建吃紧，可评估 dockerignore 是否排除（当前白名单放行是刻意行为，与 Pages 静态轨删除 tileset 的策略不同，需用户裁决）。
3. **keepalive cron 日志写 /var/log/keepalive.log**：非 root user 对 /var/log 无写权限，cron 兜底探活的日志追加会静默失败（主 asyncio 发送端不受影响）；如需日志可改写到 /tmp。
4. **顺带发现（记入观察，不动手）**：`Scripts/UpdateReadmeTree.py` 的 README 树生成范围未覆盖 deploy//Scripts 新目录，若未来依赖它维护根树需扩展。
