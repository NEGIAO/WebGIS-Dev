# 2026-09-01 移除 HF Space 防休眠双向保活机制（合规整改）

## 日期与时间

2026-09-01 11:30

## 任务等级

L2（功能删除，跨文件协同）

## 问题分析

- **核心症状**：HF 账号 NEGIAO 被平台锁定（违反 ToS），`negiao-webgis` 与 `negiao/apps` 两个 Space 全部下线，WebGIS 后端服务中断。
- **根本原因**：Space 内部署了防休眠双向保活体系——`backend/api/keepalive.py`（心跳接收路由 + asyncio 随机间隔发送端）、Dockerfile 内 cron 兜底探活脚本（随机 UA 拟人化请求对端）。该机制属于"模拟真人流量规避平台休眠检测"，违反 HF ToS。
- **受影响模块**：后端 API（keepalive 路由）、应用入口（app.py 路由挂载/lifespan）、部署镜像（Dockerfile cron + sudoers）、文档体系（架构文档/README/结构树）。

## 修改内容

1. 删除 `backend/api/keepalive.py`（心跳接收 POST/GET 路由 + asyncio 后台发送端）
2. `backend/app.py`：移除 keepalive 导入、lifespan 中 `start_keepalive_sender` 启动钩子、`app.include_router(keepalive_router)` 挂载、鉴权 allowlist 中的 `/api/heartbeat` 与 `/api/keepalive/ping`
3. `deploy/Dockerfile`：删除 cron 兜底探活脚本（keepalive_send.sh heredoc）、crontab 写入、sudoers keepalive 白名单（USER root/USER user 三明治结构），并移除 apt 中的 `cron`、`sudo` 依赖；`/opt/start.sh` 移除 cron 启动行
4. 删除 `Docs/Architecture/keepalive-hf-space.md`
5. `README.md`：移除目录项、架构文档链接中的保活文档、「🔁 双向保活机制」整章
6. `Docs/Guide/backend-structure.md`：移除 `keepalive.py` 条目
7. `deploy/docker-compose.yml`：两处注释移除 cron 保活描述

## 修改原因

平台合规整改：账号申诉中承诺"已移除全部保活代码及相关文档"，仓库内容必须与承诺一致。

## 影响范围

- 后端 API 路由（`/api/heartbeat`、`/api/keepalive/ping` 端点消失，无前端调用方，前端 `useRealtimeStats.js` 的 SSE 在线统计与本模块无关，不受影响）
- 部署镜像（依赖减少 cron/sudo，启动脚本简化为 nginx + uvicorn）
- 文档体系（README / 架构文档 / 结构树）

## 解决方案

直接全量删除而非特性开关：保活机制本身即违规点，保留开关代码无意义且影响申诉可信度。`proxy.py`/`external_proxy.py`/`catalog.py` 中的 `max_keepalive_connections` 等为 httpx 连接池合法配置，予以保留。

## 性能指标

未实测（删除型变更，无性能路径变化；镜像体积因移除 cron/sudo 略有减小）

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `python -m py_compile backend/app.py` 通过 | push 后 GitHub Actions 构建成功 |
| `CheckStructureTree.py` 通过（结构树 0 漂移） | 本地 `docker compose -f deploy/docker-compose.yml --profile prod up -d --build` 容器正常启动 |
| `CheckConfigRegistry.py` 通过（配置登记 0 漂移） | `GET /health` 返回 200 |
| `grep` 全仓确认无保活残留（.venv/dist 的 HTTP keep-alive 头为合法误报，已排除） | WebGIS 前端（GitHub Pages）功能回归正常 |

## 变更文件清单

- `backend/api/keepalive.py` — 删除（心跳接收 + 发送端模块）
- `backend/app.py` — 移除导入/挂载/lifespan 钩子/allowlist 两项
- `deploy/Dockerfile` — 删除 cron 探活脚本块、sudoers 块、cron/sudo 依赖、start.sh cron 行
- `deploy/docker-compose.yml` — 注释更新
- `Docs/Architecture/keepalive-hf-space.md` — 删除
- `Docs/Guide/backend-structure.md` — 移除 keepalive.py 条目
- `README.md` — 版本号三处 + 目录/链接/章节移除
- `Docs/Guide/CHANGELOG.md` — 新增 V3.5.37 条目

## 遗留与风险

- HF 账号仍处锁定状态，等待申诉结果；后端服务恢复依赖申诉通过或迁移 VPS（Plan B）
- 若走 VPS 迁移，`deploy/.env` 的 `VITE_BACKEND_URL` 需改为新域名并重新构建前端
- 同项目 Multi-Apps-Deployment 已同步清理（本会话内完成）