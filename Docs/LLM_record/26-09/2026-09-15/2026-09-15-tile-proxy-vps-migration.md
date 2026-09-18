# 2026-09-15 瓦片代理迁出 HF Space → VPS

## 日期与时间

2026-09-15 09:50

## 任务等级

L2

## 问题分析

- **核心症状**：HF 邮件认定 Space 上的 `/proxy/*` 属禁止的第三方内容中转，要求整段移除。
- **根本原因**：后端 `tiles_router` / `download` 在 Space 内拉取上游瓦片并回传。
- **受影响模块**：`backend/app.py`、前端所有拼 `/proxy/` 的构造点、生产 env。

## 修改内容

1. `app.py` 卸载 `tiles_router`、`download_router`、`cache_cleanup_loop`；保留 `domains/tiles/rectify` 纯数学（`location.wgs2gcj`）。
2. 前端：`VITE_TILE_PROXY_BASE_URL=https://vpn.negiao.cn`（`.env` / `.env.local` / `.env.example` / Dockerfile ARG / 文档）。
3. `useCesiumLayers.js`：Google 影像与能力文档兜底改 `tileProxyUrl()`。
4. `SidePanel.vue`：新闻代理改 `tileProxyUrl()`。
5. VPS 侧（`vpn.negiao.cn` 仓库）：`backend/tile-proxy/` + systemd :9002 + nginx `location /proxy/` + CORS。

## 修改原因

账号合规：再犯将被封禁且不再复审。

## 影响范围

Space 不再提供瓦片中转；浏览器瓦片/能力文档请求打 `vpn.negiao.cn`。`/api/proxy/amap|nominatim` 仍在 Space（API 代理，非瓦片；**残留风险**）。

## 解决方案

见上。实测 VPS：`127.0.0.1:9002` LISTEN、`/proxy/gcj2wgs/...` 与直通均 200 PNG。

## 性能指标

未实测（代理迁机）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| VPS health / 纠偏瓦片 / 直通瓦片 200 | 打开 webgis.negiao.cn 加载高德纠偏底图 |
| 无残留 `BACKEND_BASE_URL/proxy` 字面量 | Cesium Google 影像、新闻面板 |
| `py_compile app.py` | HF 部署后确认 Space 无 `/proxy` 路由 |

## 变更文件清单

见 git status：`backend/app.py`、`deploy/.env*`、`deploy/Dockerfile`、`frontend/src/.../useCesiumLayers.js`、`SidePanel.vue`、文档。

## 遗留与风险

1. **同批清理（并入 V3.6.5）**：`backend/domains/` 整目录删除；`api/external_proxy.py` 删除；开源实现 `tile-proxy` + 线上 `https://vpn.negiao.cn/proxy/*`。前端 `/api/proxy/amap|nominatim` 将 404，需前端直连或自备 key。
2. 前端需重新 build/Pages 发布后 `VITE_*` 才生效。
3. 开源仓本地已初始化；是否推 GitHub 由用户决定。

## 追加（V3.6.5 后回滚）

- 用户反馈 `/api/proxy/amap/place/text` 404：`external_proxy` 被同批误删。
- **已从 `1b731917^` 恢复** `backend/api/external_proxy.py` 并在 `app.py` 重新 `include_router`。
- 路由前缀仍为 `/api/proxy`，与前端调用一致。
- 说明：该模块为 JSON API 代理（高德/Nominatim/EPSG/IP），与已迁出的**瓦片**代理分离；是否继续跑在 HF Space 由用户部署决策（政策上同属「第三方中转」灰区）。
