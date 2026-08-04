# 代理瓦片内存 TTL 缓存

**日期与时间**：2026-08-04 15:30
**任务等级**：L2

---

## 问题分析

### 核心症状
当前代理模块（`backend/api/proxy.py`）4 个端点均为无缓存的纯转发模式。用户每次请求瓦片都触发：网络请求上游 →（纠偏端点还要）像素级纠偏计算 → 返回。HF 部署有 16GB ROM，完全空闲，CPU 和网络却反复做功。

### 根本原因
- `ships66_tile`：每次都直连 `g3.ships66.com`，即使同一瓦片 1 秒内重复请求
- `gcj2wgs_proxy` / `wgs2gcj_proxy`：虽有磁盘缓存（`rectify.py` 的 `_get_tile_cached`），但每次仍需磁盘 I/O + 缓存未命中时完整纠偏计算
- `universal_stream_proxy`：纯流式透传，无任何缓存

### 受影响模块
- 后端代理链路（`backend/api/proxy.py`）
- 纠偏计算链路（`backend/gcj_rectify/rectify.py`）—— 内存缓存命中时可跳过整个纠偏流程

### 候选方案对比

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| A. 纯磁盘缓存（现状） | 持久化，重启不丢 | 每次仍需磁盘 I/O；纠偏端点缓存未命中时仍需完整计算 | 保留作为 L2 兜底 |
| B. 内存 TTL 缓存（选中） | 零 I/O / 零计算；μs 级响应；TTL 自动清理无泄漏 | 重启丢失（HF 容器重启可接受） | ✅ 作为 L1 加速层 |
| C. LRU 容量淘汰 | 精确控制内存 | 实现复杂；TTL 已足够 | 过度设计 |

**选定方案**：B —— 内存 TTL 缓存作为 L1 加速层，磁盘缓存保留为 L2 持久层，双层互补。

---

## 修改内容

### 1. 新增 `_TileCache` 类 + `_TileCacheEntry` dataclass（`backend/api/proxy.py`）
- TTL 过期自动清理（`get()` 时惰性淘汰 + `set()` 满员时批量清理）
- 满员驱逐策略：先清过期，仍满则驱逐最旧条目（近似 LRU）
- 命中率统计（`stats` 属性：hits / misses / hit_rate / size）

### 2. 4 个端点集成内存缓存
- `/tiles/ships66/{z}/{x}/{y}`：cache key = `ships66:{z}/{x}/{y}`
- `/proxy/gcj2wgs/{url}`：cache key = `gcj2wgs:{template.cache_key}:{z}/{x}/{y}`
- `/proxy/wgs2gcj/{url}`：cache key = `wgs2gcj:{template.cache_key}:{z}/{x}/{y}`
- `/proxy/{url}`：cache key = 完整 upstream_url（仅对 image/ 内容类型缓存）

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
- 后端代理链路（4 个端点全部受益）
- 纠偏计算链路（内存命中时跳过纠偏）
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
| `backend/api/proxy.py` | 新增 `_TileCache` / `_TileCacheEntry`，4 个端点集成缓存 |
| `backend/config/catalog.py` | 新增 2 个配置 key 登记 |
| `.env.example` | 配置登记 |
| `.env` | 生产配置（用户已改为 600s/200000 条） |
| `.env.local` | 本地开发配置（用户已同步改为 600s/200000 条） |

---

## 遗留与风险
1. **通用代理缓存判断逻辑脆弱**（Code Review 发现）：`target_url.endswith((".png", ...))` 对带查询参数的 URL 失效。当前瓦片场景通常无查询参数，影响有限，但后续若前端传 token 等参数会导致缓存漏判。待后续优化。
2. **多 worker 部署时缓存不共享**：当前 HF 单 worker 部署无影响，未来扩展时需注意。
3. **纠偏端点双层缓存冗余**：内存+磁盘同时存在，内存缓存主要价值为免纠偏计算（CPU）而非免网络。行为正确但值得记录。

---

## 下一步建议
- 部署后观察内存增长曲线，验证缓存实际工作
- 如需可观测性，可在 `monitor.py` 增加 `/monitor/cache-stats` 端点暴露 `_tile_cache.stats`
- 缓存判断逻辑优化：改为基于响应 Content-Type 而非请求 URL 扩展名
