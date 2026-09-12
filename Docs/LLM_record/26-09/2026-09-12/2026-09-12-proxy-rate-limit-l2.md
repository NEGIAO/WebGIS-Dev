# 2026-09-12 瓦片代理限流 L1→L2（管理员面板可配）

## 日期与时间

2026-09-12 14:40

## 任务等级

L2（跨后端配置/限流/管理 API + 管理面板 UI + 文档版本）

## 问题分析

- **核心症状**：浏览 Google 水系等纠偏瓦片时 `/proxy/gcj2wgs/*` 批量 429。
- **根本原因**：`PROXY_RATE_LIMIT=300`（每 IP 每分钟）滑动窗口限流；地图一次平移即可打满。
- **原配置层**：L1，`proxy_shared` **模块 import 时**读入常量，改 env 必须重启/重建才生效。
- **受影响模块**：瓦片纠偏与直通代理、管理后台配置、配置三层登记。

## 规范冲突与裁决（§0 / §11）

| 诉求 | 规范 | 裁决 |
|---|---|---|
| 升为 L2 管理员可配 | L2 合法路径 | **执行** |
| **默认无限流（0）写进生产 env** | §11.1.9：`deploy/.env` 恒 `PROXY_RATE_LIMIT>0`，**用户口头要求也不得豁免** | **拒绝**将仓库生产基线改为 0 |
| 运行时管理员设 0 | 不改仓库基线，属运营操作 | 允许代码支持 0=不限流 |

**依据**：Force_command 优先级 1（用户）**不可**临时豁免第 11 节。

## 修改内容

1. `config/catalog.py`：`PROXY_RATE_LIMIT` layer L1→**L2**，default **0→600**，描述更新。
2. `config/runtime.py`：新增 `get_effective_int`；`config/__init__.py` 导出。
3. `domains/tiles/proxy_shared.py`：删除启动时常量；`_rate_limit_check` 每次 `_effective_rate_limit()`（DB > env > 600）。
4. `api/admin.py`：`GET/POST /api/admin/config/proxy-rate-limit`（`ge=0`，0=不限流）。
5. `frontend/src/api/backend/admin.js` + `AdminControlPanel.vue` + `zh-CN`/`en-US`：管理面板字段。
6. `deploy/.env` / `.env.example`：注释标明 L2 与 §11.1.9；**值 600（>0）**。
7. README 三处 + CHANGELOG → **V3.6.2**。

## 影响范围

- 瓦片代理 429 行为可被管理员即时调整，无需重建 HF 镜像。
- 未写 DB 时行为与 env=300 一致。

## 解决方案

优先级：`system_config.proxy_rate_limit` → `PROXY_RATE_LIMIT` env → catalog 默认 600。

## Code Review 补记（同版本）

- `CesiumToolPanel` 完整菜单 `Globe :size="20"` 与兄弟 16 不一致 → 改回 **16**。
- 代码/文案默认值与 catalog **600** 对齐（生产 env 用户已改为 600）。
- **Git**：本地曾落后 origin `63e3b262`（同主题 debug 提交），push 前须 `git pull --ff-only`。

## 追加（L1）：前端瓦片 429 message 提醒

- 新增 `common/utils/tileRateLimitNotify.ts`：`notifyTileRateLimited`（15s 防抖 warning toast）+ `extractTileErrorDetail`。
- `ol/tile-source/tileLifecycle.ts`：`requestTileAsBlobUrl` 识别 **HTTP 429**，解析 JSON `detail` 后 toast。
- Cesium `basemapProviderFactory.ts`：provider `errorEvent` 若带 `statusCode===429` 则同样提示（尽力而为）。
- 结构树已登记；门禁通过。

## 追加（L1 实验）：Worker README 统计卡片 SVG

- `workers/github-stats/src/index.js`：新增 `GET /api/readme-stats.svg`（自绘 tokyo-night 卡片：Stars/Forks/Followers/Repos/版本徽章；边缘缓存 10 分钟）。
- 本地预览：`workers/github-stats/scripts/render-readme-stats-preview.mjs` → `preview/readme-stats-sample.svg`。
- **未部署**：需在 `workers/github-stats` 执行 `npx wrangler deploy` 后才能从 `api.negiao.cn` 访问。
- 是否写入主 README 由用户看完效果后决定。

## 性能指标

未实测（每请求多一次 system_config 读；表小、SQLite，可接受。若热点可加短 TTL 缓存）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `py_compile` runtime/proxy_shared/admin | 部署后管理员面板改限流，无需重启 |
| `CheckConfigRegistry.py` | 拨图确认 429 是否按新阈值出现 |
| 本地 grep：`deploy/.env` 仍为 `PROXY_RATE_LIMIT=300` | 管理员设 0 后批量瓦片不再 429（注意滥用风险） |

### 平台红线自查（11.2）

| 项 | 结果 |
|---|---|
| REDLINE-1/2/3 内容检索 | CLEAN |
| REDLINE-4 `deploy/.env` `RATE_LIMIT=0` | **未命中**（保持 300）✅ |

## 变更文件清单

| 路径 | 说明 |
|---|---|
| `backend/config/catalog.py` | L2 + default 300 |
| `backend/config/runtime.py` | `get_effective_int` |
| `backend/config/__init__.py` | 导出 |
| `backend/domains/tiles/proxy_shared.py` | 请求时读限流 |
| `backend/api/admin.py` | 配置 API |
| `frontend/src/api/backend/admin.js` | API 封装 |
| `frontend/src/domains/common/user/components/AdminControlPanel.vue` | 面板 |
| `frontend/src/locales/zh-CN.js` / `en-US.js` | 文案 |
| `deploy/.env` / `.env.example` | 注释 |
| `README.md` / `CHANGELOG.md` | V3.6.2 |
| 本文件 | L2 日志 |

## 遗留与风险

1. 生产 env **不能**按「默认无限制」改为 0（§11.1.9）；若确需全站放开，请在管理面板设 0 并知晓滥用/HF 合规风险。
2. 管理员设 0 后无 IP 限流，开放代理 + 第三方瓦片源被爬风险上升。
3. system_config 每请求读库，后续可加 5–10s 进程内缓存。
4. 日志中多段 `10.16.x.x` 可能是网关 IP，限流会误伤；应另查 nginx XFF（未在本任务改动）。
