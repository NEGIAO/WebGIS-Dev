# 底图下载功能：代码位置标记（V3.6.18 已整域恢复）

日期：2026-09-15（初记） → 2026-10-16（恢复）
状态：**已恢复**。2026-10-16 起瓦片域（纠偏 + 直通代理 + 底图下载）整域回到本仓（版本 **V3.6.18**）；原"搁置"结论作废。

## 历史沿革（保留备查）

| 项 | 值 |
|---|---|
| **本地 tag** | `tile-download-last` |
| **指向 commit** | `4a701dad`（**V3.6.4**，最后一个带下载的版本） |
| **路径** | `backend/domains/tiles/download/` |
| **相关** | `download.py` / `tile_engine.py` / `download_task.py` / `task_scheduler.py` |
| **删除时点** | V3.6.5（`1b731917`）起因瓦片域迁出 HF 被移除 |
| **搁置原因** | HF 禁止 Space 上第三方瓦片中转；VPS 小内存上大范围 GeoTIFF 风险高 |
| **恢复时点** | V3.6.18（2026-10-16）从 `tile-download-last` 整域恢复 |

## 恢复后的架构分工（V3.6.18）

- **前端底图显示**：仍走香港 VPS `vpn.negiao.cn/proxy/*`（`VITE_TILE_PROXY_BASE_URL` 未变）。
- **后端瓦片域**：`/proxy/*`（纠偏 + 直通）、`/tiles/ships66/*`、`/api/download/*` 整域挂载。
  - 纠偏/通配路由**不面向前端地图**，服务于下载管线：下载时后端按瓦片模板抓取
    （模板可粘贴 VPS 纠偏地址或原始源站），按需纠偏、拼装 GeoTIFF。
  - 配额链路：`/api/auth/download-quota/estimate` + `api/auth/quota.py` 扣减/退还；
    TTL 配置：`/api/admin/config/download-ttl`。
- **SSRF 护栏**：`domains/tiles/infra/net_guard.py` 为转接 shim，真源在 `core/net_guard.py`（全仓一份）。
- **合规**：是否在 HF Space 暴露中转路由属部署侧决策（同 external_proxy 先例）；
  严守"Space 无三方中转"的环境可不挂 `tiles_router` / `download_router`。

## 验证记录（2026-10-16，本地）

- `python scripts/check_app_import.py`：通过（131 条路由，无三方桩）。
- E2E（TestClient + 高德瓦片源）：estimate-tiles → create task → 瓦片抓取 → GeoTIFF 拼装（成功，progress 100%，"已裁剪到精确范围"）→ 文件下载（TIFF 魔数 `II*\0` 校验通过）→ cancel 链路正常；配额估算（cost=1, limit=1000）正常。

## 以后若再迁移（自建 VPS，勿挂 HF）

```bash
# 查看
git show tile-download-last:backend/domains/tiles/download/download.py

# 导出到工作区（示例）
git checkout tile-download-last -- backend/domains/tiles/download
```

迁出自建时务必：

1. 去掉对 `api.auth` / WebGIS 配额的硬依赖（或自备鉴权）
2. 限制单任务瓦片数与并发（小内存机）
3. 前端下载基址指向自有域名，**不要**指向 HF Space

旧方案记录见同目录 `plan-download-async-l2-ttl.md`。
