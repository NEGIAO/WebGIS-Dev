# 2026-08-24 nginx 瓦片磁盘缓存（deploy/nginx.conf）

**日期与时间**：2026-08-24 12:40
**任务等级**：L2

---

## 问题分析

- **核心症状**：`/proxy/gcj2wgs`、`/proxy/wgs2gcj` 两个纠偏接口与 `/proxy/{url}` 通用瓦片代理、`/tiles/ships66` 海图代理，每次用户浏览地图都穿透到 FastAPI 进程重复处理；后端虽有内部缓存（免重算），但请求仍需完整走一遍 Python 事件循环 + 序列化 + 传输。
- **根本原因**：nginx 对 `/tiles/ /proxy/` 段显式 `proxy_cache off`，无边缘缓存层。
- **受影响模块**：`deploy/nginx.conf`（唯一改动文件）；下游受益模块为 `backend/api/proxy.py`。
- **候选方案对比**：
  - ① 短 TTL 自愈（1h 过期）——零维护成本，接受最长 1h 陈旧 ✅ **选定**
  - ② URL 版本化——前端需携带数据版本号，侵入业务代码 ❌
  - ③ 主动清缓存——开源版 nginx 无 purge 模块 ❌
- **选定理由**：纠偏结果对同一瓦片是确定性的，短 TTL 的陈旧窗口可接受；零代码侵入。

## 修改内容

1. http 块新增 `proxy_cache_path /tmp/nginx_cache/tiles`（2GB LRU 上限、7 天未访问淘汰、keys_zone 16m）。
2. 原四合一透传段拆分为两段：
   - `~ ^/(tiles|proxy)(/|$)`：开启 `proxy_cache tiles`，仅缓存 200 且 TTL 1h；`proxy_ignore_headers Cache-Control Expires` 保证不受上游瓦片服务响应头影响；`proxy_buffering on`（缓存前提）；新增 `X-Cache` 响应头暴露命中状态。
   - `~ ^/(api|monitor)(/|$)`：保持原样（SSE 关缓冲、不缓存）。

## 修改原因

多人访问场景下热点区域瓦片重复穿透后端；nginx 边缘缓存命中时 Python 进程零占用，与后端内部缓存形成互补分层（nginx 省传输+进程占用，后端省计算）。

## 影响范围

- 部署链路：`deploy/Dockerfile` 构建的镜像（nginx 配置 COPY 进镜像），HF Space 与本地全容器共用此配置
- 后端：`backend/api/proxy.py` 各接口行为不变，仅被 nginx 减负；`/api/` `/monitor/` 接口完全不受影响

## 解决方案

见上。关键事实核验（禁止臆造项已实测）：三个代理接口路由来自 `backend/api/proxy.py:415-587` 实测（gcj2wgs/wgs2gcj/通用代理均 GET 幂等）；`Cache-Control: no-cache` 为发往上游的**请求头**而非响应头（proxy.py:422），不阻止 nginx 缓存。

## 性能指标

未实测（需线上流量对比 X-Cache: HIT 比例与后端 QPS 变化；预期热门区域命中率 >60%）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `docker run --tmpfs /tmp/nginx_cache ... nginx:1.27-alpine nginx -t` → syntax ok / test successful | ① 本地起全栈容器后连续两次加载同一区域地图，第二次响应头出现 `X-Cache: HIT`；② 修改纠偏参数后 ≤1h 内自动生效（短 TTL 自愈）；③ `/api/*` SSE 流式接口行为不变 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `deploy/nginx.conf` | 新增 proxy_cache_path 与瓦片缓存段；透传段按缓存性拆分 |
| `README.md` | 版本号三处同步 V3.5.29 → V3.5.30 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.5.30 条目 |
| 本日志 | L2 记录 |

## 遗留与风险

- 缓存目录在容器 /tmp（非持久卷），容器重建后冷启动重新回源——符合预期，无需处理
- ships66 海图上游若返回 Set-Cookie 类响应，该条目不会被缓存（nginx 安全默认），属正确行为
