# V3.5.12 综合改动（代理瓦片缓存 + 日志重构 + 下载取消 + 缩放修正 + Star History）

**日期与时间**：2026-08-04 15:30 ~ 2026-08-05 09:45
**任务等级**：L2（合并 5 项独立改动为一次发布）

---

## 问题分析

### 核心症状（代理瓦片缓存）
当前代理模块（`backend/api/proxy.py`）4 个端点均为无缓存的纯转发模式。用户每次请求瓦片都触发：网络请求上游 →（纠偏端点还要）像素级纠偏计算 → 返回。HF 部署有 16GB ROM，完全空闲，CPU 和网络却反复做功。

### 根本原因
- `ships66_tile`：每次都直连 `g3.ships66.com`，即使同一瓦片 1 秒内重复请求
- `gcj2wgs_proxy` / `wgs2gcj_proxy`：虽有磁盘缓存（`rectify.py` 的 `_get_tile_cached`），但每次仍需磁盘 I/O + 缓存未命中时完整纠偏计算
- `universal_stream_proxy`：纯流式透传，无任何缓存

### 受影响模块
- 后端代理链路（`backend/api/proxy.py`）
- 纠偏计算链路（`backend/gcj_rectify/rectify.py`）—— 内存缓存命中时可跳过整个纠偏流程
- 日志系统（`backend/app.py`、`backend/utils/time_utils.py`、`backend/api/monitor.py`）
- 下载任务链路（`backend/download_xyz/download.py`、`tile_engine.py`、`task_scheduler.py` + 前端 store）
- 前端缩放显示（`MapControlsBar.vue`、`useMapEventHandlers.js`、`MapContainer.vue`）

### 候选方案对比（仅代理缓存部分）

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| A. 纯磁盘缓存（现状） | 持久化，重启不丢 | 每次仍需磁盘 I/O；纠偏端点缓存未命中时仍需完整计算 | 保留作为 L2 兜底 |
| B. 内存 TTL 缓存（选中） | 零 I/O / 零计算；μs 级响应；TTL 自动清理无泄漏 | 重启丢失（HF 容器重启可接受） | ✅ 作为 L1 加速层 |
| C. LRU 容量淘汰 | 精确控制内存 | 实现复杂；TTL 已足够 | 过度设计 |

**选定方案**：B —— 内存 TTL 缓存作为 L1 加速层，磁盘缓存保留为 L2 持久层，双层互补。

---

## 修改内容

### 1. 后端：代理瓦片内存 TTL 缓存（仅纠偏端点）
- 新增 `_TileCacheEntry` dataclass + `_TileCache` 类（TTL 过期惰性淘汰 + 满员批量清理 + 命中率统计）
- **仅 `/proxy/gcj2wgs/`、`/proxy/wgs2gcj/` 集成内存缓存**——命中时跳过纠偏计算（主要价值为省 CPU）
- ships66 / 通用代理保持纯中转（ships66 访问概率极低；`/proxy/{url}` 用途杂，缓存非瓦片响应风险大于收益）

### 2. 后端：日志系统重构（序号化 + 本地时区）
- 删除 `BeijingTimeFormatter`，新增 `_SeqFormatter`（线程安全的全局递增序号 `[000001]` 前缀）
- uvicorn logger 同步补丁，所有日志格式统一
- `time_utils.py`：`get_beijing_now` → `get_local_now`（Docker 容器本地时区）；`hourly_chime_task` 新增 `startup_time` 参数
- `monitor.py`：HF 日志代理新增 `_convert_utc_to_local()` 将 UTC 转本地时间

### 3. 后端：下载任务可取消
- 新增 `POST /api/download/tasks/{id}/cancel` 端点
- `_process_download_task` 执行前检查取消状态；`report_progress` 每次回写前检查取消并抛 `CancelledError`
- `tile_engine.py`：捕获 `CancelledError` 后先取消所有子任务再向上传播，避免使用已关闭的 client
- 前端 `useDownloadStore.ts`：`dispose()` / `resetTask()` 时调用取消端点

### 4. 前端：缩放级别显示修正
- `MapControlsBar.vue`：新增 `displayZoom` 计算属性，统一 `Math.ceil(zoom)`
- `useMapEventHandlers.js`：跟随 `tileHDRendering` 开关——开启时 `Math.ceil`，关闭时 `Math.floor`
- `MapContainer.vue`：总览图源包裹 `buildRasterBasemapSource()` 与底图 SSOT 对齐

### 5. 其他
- `.github/workflows/traffic-counter.yml`：替换为 Star History 图表生成工作流
- `LogMonitor.vue`：SSE `onmessage` 新增 JSON 解析分支
- `index.html`：GitHub 链接修正
- `README.md`：新增 Star History 章节

### 2. 代理端点缓存策略
- `/proxy/gcj2wgs/{url}`：cache key = `gcj2wgs:{template.cache_key}:{z}/{x}/{y}`
- `/proxy/wgs2gcj/{url}`：cache key = `wgs2gcj:{template.cache_key}:{z}/{x}/{y}`
- `/tiles/ships66/{z}/{x}/{y}.png`：纯中转，不缓存（访问概率极低）
- `/proxy/{url}`：纯流式中转，不缓存（通用代理用途杂，不全是瓦片）

### 3. 配置登记
- `catalog.py`：新增 `PROXY_TILE_CACHE_TTL_SECONDS`（默认 300s）、`PROXY_TILE_CACHE_MAX_SIZE`（默认 100000）
- `.env.example` / `.env` / `.env.local` / `backend/.env` / `backend/.env.local`：同步登记

---

## 修改背景
- HF 单用户部署，16GB ROM 充裕，内存缓存零成本
- 用户明确预期：请求过的瓦片在内存中驻留 5 分钟，重复请求直接返回内存副本
- 减轻上游服务压力（ships66、高德等第三方瓦片服务）

---

## 影响范围
- 后端代理链路（纠偏端点集成内存缓存）
- 纠偏计算链路（内存命中时跳过纠偏）
- 日志系统（全部日志改用序号化格式 + 本地时区）
- 下载任务链路（支持取消，前端 dispose/reset 自动通知后端）
- 前端缩放显示（与 tileHDRendering 开关同步）
- 内存占用：单瓦片 ~20KB × 100000 条目 ≈ 2GB 峰值（TTL 到期自动回落）

---

## 解决方案
- 内存 TTL 缓存作为 L1 加速层（5 分钟 TTL）
- 磁盘缓存保留为 L2 持久层（纠偏端点）
- 双层结构：请求 → L1 内存命中 → 返回；L1 miss → L2 磁盘命中 → 写回 L1 → 返回；L2 miss → 网络拉取 → 纠偏计算 → 写入 L1+L2 → 返回

---

## 性能指标
- 未实测（需部署后观察）
- 预期：5 分钟内重复请求延迟从 50-200ms（网络+纠偏）降至 <1ms（内存直接返回）

---

## 测试方案

### Agent 已执行
- `CheckConfigRegistry.py`：B2/B3/B4 通过（新 key 合规登记）
- `CheckStructureTree.py`：无新增文件，结构树无需更新

### 待用户实机验证
1. 部署后观察 HF Space 进程内存：浏览区域时 RSS 应持续上升（瓦片积累），5 分钟后稳定/回落（TTL 清理）
2. 重复浏览同一区域：第二次浏览时网络流量应显著低于第一次
3. 浏览器 DevTools Network 面板：同一瓦片第二次请求应看到极短的响应时间（cache hit）

---

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/api/proxy.py` | 新增 `_TileCache` / `_TileCacheEntry`，仅 gcj2wgs / wgs2gcj 集成缓存；ships66 切为 buffered 响应 |
| `backend/config/catalog.py` | 新增 2 个配置 key 登记 |
| `backend/app.py` | 日志重构：`_SeqFormatter` 替代 `BeijingTimeFormatter`；uvicorn logger 补丁；shutdown 异常隔离 |
| `backend/utils/time_utils.py` | `BeijingTimeFormatter` → `get_local_now`；`hourly_chime_task` 新增 `startup_time` |
| `backend/api/monitor.py` | HF 日志 UTC→本地时间转换；移除 `BeijingTimeFormatter` |
| `backend/download_xyz/download.py` | 新增 cancel 端点 + 执行前/进度回写时取消检查 + 半成品清理 |
| `backend/download_xyz/tile_engine.py` | `CancelledError` 捕获后先取消子任务再传播 |
| `backend/download_xyz/task_scheduler.py` | `cleanup_expired_tasks` 新增轻量预判 |
| `frontend/src/api/download.js` | 新增 `apiDownloadCancelTask` |
| `frontend/src/domains/common/data-import/stores/useDownloadStore.ts` | dispose/reset 时调用取消端点 |
| `frontend/src/domains/ol/components/MapControlsBar.vue` | 新增 `displayZoom` 计算属性（`Math.ceil`） |
| `frontend/src/domains/ol/composables/useMapEventHandlers.js` | zoom 取整跟随 `tileHDRendering` 开关 |
| `frontend/src/domains/ol/components/MapContainer.vue` | 总览图源包裹 `buildRasterBasemapSource` |
| `frontend/src/domains/ol/components/LogMonitor.vue` | SSE onmessage 新增 JSON 解析 |
| `frontend/index.html` | GitHub 链接修正 |
| `frontend/stats.html` | 清理构建产物注释分隔符 |
| `.github/workflows/traffic-counter.yml` | 替换为 Star History 图表工作流 |
| `.env.example` / `.env` / `.env.local` | 新增缓存配置 key 登记 |
| `README.md` | Star History 章节 + 版本演进表更新 |
| `Docs/Guide/CHANGELOG.md` | 完整 V3.5.12 条目 |

---

## 遗留与风险
1. **纠偏端点双层缓存冗余**：内存+磁盘同时存在，内存缓存主要价值为免纠偏计算（CPU）而非免网络。行为正确但值得记录。
2. **多 worker 部署时缓存不共享**：当前 HF 单 worker 部署无影响，未来扩展时需注意。
3. **ships66 切 buffered 模式**：从 `StreamingResponse(aiter_raw())` 改为 `Response(content=body)`，大瓦片增加一次全量内存拷贝。当前 ships66 不缓存，等于只加成本未获益。
4. **cache hit 日志高频输出**：每次命中/写入均 `logger.info`，高流量时可能产生大量日志。
5. **下载取消 TOCTOU 竞争**：执行前检查 `status == 'cancelled'` 后仍可能有窗口，cancel 请求在检查通过后、`update_task(downloading)` 前到达。当前概率极低，暂不处理。

---

## 设计决策记录

### 为什么只缓存纠偏端点？
- `gcj2wgs` / `wgs2gcj`：纠偏一张瓦片需要请求 4 张周边瓦片 + 像素级计算，**缓存命中省的是 CPU**（主要价值）
- `ships66`：纯中转，访问概率极低，缓存收益几乎为零
- `/proxy/{url}`：通用代理用途杂（WMTS/ArcGIS/XYZ），不全是瓦片；缓存非瓦片响应（JSON/XML/错误页）会导致意外行为，风险大于收益

### 为什么日志从北京时间硬编码改为本地时区？
- Docker 容器时区已配置为 `Asia/Shanghai`，硬编码 `UTC+8` 在跨时区部署时会出错
- 本地时区自动适配，无需代码层再维护时区偏移

---

## 下一步建议
- 部署后观察内存增长曲线，验证纠偏缓存实际工作
- 如需可观测性，可在 `monitor.py` 增加 `/monitor/cache-stats` 端点暴露 `_tile_cache.stats`
- 高流量场景下降级 cache hit 日志为 `logger.debug`
