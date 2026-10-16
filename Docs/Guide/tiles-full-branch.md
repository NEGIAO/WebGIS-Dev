# tiles-full-v3.6.18 分支：全功能版（仅本地 / 自建 VPS / 二开）

> ## ⚠️ 合规警示（先读这条）
>
> 本分支包含**第三方瓦片抓取与回传层**（`/proxy/*` 瓦片纠偏/直通代理、`/api/download/*` 底图下载）。
> **禁止将本分支部署到 Hugging Face Spaces**——HF Content Policy 明令禁止 Space 代理模式
> （本账号 2026-09-14 收到的 HF 书面禁令原文：*"Using tools like Cloudflare Tunnel, TOR, proxies,
> VNC, Chrome Remote Server, etc., to bypass restrictions."*，HF 同时明确 "A VPS or your own
> infrastructure is appropriate for this"）。
>
> - HF Space 部署基线**恒为 `main`**（当前 V3.6.17，无任何中转路由）。
> - 本分支适用场景：本地开发学习、部署到自有 VPS/服务器、二次开发。
> 公网部署 `/proxy/*` 时请注意自行添加访问控制（本分支的代理路由默认仅有限流，无登录门槛）。

## 这个分支是什么

`main`（V3.6.17）是为 HF Space 合规而精简的版本：瓦片纠偏/代理/下载已迁出，前端地图走外部
VPS 代理。本分支把 **V3.6.4（tag `tile-download-last`）的完整瓦片域**恢复回来，功能最全，

适合：

- **学习/查阅**：一套完整的「瓦片纠偏 + 直通代理 + 磁盘缓存 + 底图下载（GeoTIFF 拼装）+ 配额」
  前后端实现；
- **自建部署**：部署到自己的 VPS（HF 明示允许的场所），前端 `VITE_TILE_PROXY_BASE_URL` /
  下载 API 基址指向自建后端即可；
- **二开基座**：在此基础上改造。

## 版本信息

| 项 | 值 |
|---|---|
| 版本号 | V3.6.18 |
| 基线 | `main` V3.6.17 + 本地 tag `tile-download-last`（V3.6.4）恢复 |
| 日期 | 2026-10-16 |
| Tag | `tiles-full-v3.6.18`（annotated，含功能清单） |
| 对应日志 | [`Docs/LLM_record/26-10/2026-10-16/2026-10-16-restore-tiles-domain-download.md`](../LLM_record/26-10/2026-10-16/2026-10-16-restore-tiles-domain-download.md) |

## 重要功能清单

1. **瓦片纠偏代理**（4 条路由）：`/proxy/gcj2wgs/`、`/proxy/wgs2gcj/`、`/proxy/bd2wgs/`、`/proxy/wgs2bd/`
   —— GCJ-02 / BD-09 ↔ WGS-84 逐瓦片纠偏，内存 TTL 缓存 + 磁盘缓存（按龄/按容量清理）。
2. **通用直通代理**：`/proxy/{target_url:path}`（任意公网瓦片源流式转发，SSRF 护栏拦截内网目标）、
   `/tiles/ships66/{z}/{x}/{y}.png`（仓库自带瓦片）。
3. **底图下载**（`/api/download/*`，需登录 + 配额）：
   - `POST /tasks` 创建任务（瓦片模板 + bbox + 分辨率）
   - `GET /tasks/{id}` 进度轮询 / `POST /tasks/{id}/cancel` 取消
   - `GET /tasks/{id}/file` 下载拼装好的 GeoTIFF（rasterio，可按 bbox 精确裁剪）
   - `GET /estimate-tiles` 瓦片数预估 / `GET /tasks` 我的任务列表
   - APScheduler 任务过期清理（TTL 默认 30 分钟，管理后台可调）
4. **配额链路**：`/api/auth/download-quota/estimate` 成本估算；`api/auth/quota.py` 扣减/退还；
   管理端 `/api/admin/config/download-ttl`。
5. **基础设施**：`infra/http_headers.py` 浏览器兼容出站头；`infra/net_guard.py` 转接
   `core/net_guard.py` 的 SSRF 单点；`proxy_shared.py` 限流（默认 600 次/分/IP）。

## 本地快速开始

```bash
# 后端（Python 3.10+，依赖见 backend/pyproject.toml：rasterio/numpy/apscheduler/sqlmodel）
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e .
python -c "import app"                              # 导入自检
uvicorn app:app --reload --port 7860

# 前端
cd frontend
npm install
# .env.local 示例：
#   VITE_BACKEND_URL=http://localhost:7860
#   VITE_TILE_PROXY_BASE_URL=http://localhost:7860   # 用本分支自带的纠偏代理
npm run dev
```

## 与 main 的差异

```
git diff main..tiles-full-v3.6.18 --stat
```

主要为：`backend/domains/**`（28 文件，瓦片域）、`backend/app.py`（路由/lifespan 接线）、
`backend/scripts/check_app_import.py`（门禁放行，附部署侧决策注释）、前端 4 个下载相关文件
（注释清理）、文档（README/CHANGELOG/结构树/架构/marker）。

## 已知限制

- `/proxy/{target_url:path}` 为通用代理，公网部署务必自加访问控制；
- 下载任务的瓦片数/并发上限沿用 V3.6.4  sizing，超大规模下载建议自行调参
  （`MAX_CONCURRENCY`、`DOWNLOAD_TASK_TTL_MINUTES` 等）；
- 迁移到 VPS 时如不复用本仓 auth DB，需自备鉴权与配额机制。
