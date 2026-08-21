# 实时在线统计零轮询重构（V3.5.25）

- **日期与时间**：2026-08-21 09:30
- **任务等级**：L2
- **统一版本号**：V3.5.25（与双引擎底图共享合并为单一版本）

## 问题分析

**核心症状**：页面后台挂起（约 30 分钟）后切回前台，系统严重卡顿、不可用，必须关闭重新打开才能恢复。用户怀疑是前后端数据接口（实时在线统计）长期运行导致。

**排查链路**（全前端定时器/SSE/轮询扫描 + 后端统计模块逐行）：
- 前端全局仅有 `useRealtimeStats` 一处常驻轮询：每 **5s** `POST /api/statistics/heartbeat`。
- 该端点穿透 `require_login` → `_get_session_sync`（一次完整会话 **DB 查询**）+ `mark_user_active`。即每个在线客户端每 5s 对受限后端（SQLite / Hugging Face Spaces）产生一次 DB 读取。
- SSE 流 `statistics_stream` 每次连接建立都会调用 `_compute_and_broadcast_once` → `_get_realtime_global_stats_sync`（**7 表聚合查询**），且**无缓存**。
- 后台挂起时浏览器节流 `setInterval` 并可能由代理杀掉 SSE 长连接；回前台时重连风暴 + 重复重查，叠加常态 5s 轮询，在 CPU 受限部署上拖垮响应（表现为前端卡顿）。
- `es.onerror` 连续失败 5 次即 `return` 停止重连，统计模块进入半残状态、须刷新页面才能恢复——与"必须关闭重新打开"高度吻合。
- 浏览器后台节流与代理断连可能使 `online_stats` 在恢复时积压或批量投递，但确切数量未做实测；前端需要合并同一帧内的重复响应式更新。
- Cesium 已启用 `requestRenderMode`，降低其在空闲时持续渲染成为主因的可能；但本次未做浏览器性能采样，不能完全排除 WebGL 上下文恢复成本。

**受影响模块**：实时在线统计（`backend/api/realtime_stats.py`、`frontend/.../useRealtimeStats.js`）、SSE 推送、会话 DB 查询、前端响应式更新。

## 修改内容

1. **在线判定改由后端基于 SSE 连接计数**：`OnlineUserTracker` 新增 `_conns` 引用计数（`mark_connection` / `drop_connection`），在线 = 存活连接 ∪ 心跳窗口内的并集；`StatsBroadcaster.register(username)` 记录连接归属，并在响应生成器内部完成登记，使登记与 `finally` 清理属于同一生命周期。
2. **心跳降级为兜底并统一时间契约**：前端心跳 5s → 30s，仅 SSE 断开时启用（`onopen` 即停）；后端窗口同步调整为 90s，容忍两次心跳丢失，SSE 存活期间前端零轮询。
3. **DB 快照查询保留单层 10s 缓存**：缓存只由 `backend/api/statistics.py` 的 `_get_realtime_global_stats_sync` 维护；`realtime_stats.py` 通过 `asyncio.to_thread` 调用，避免同步聚合阻塞事件循环及双层缓存叠加陈旧时间。
4. **去除"5 次失败永久断连"**：改为永久指数退避重试（上限 30s）。
5. **回前台消息积压合并**：`online_stats` 经 `requestAnimationFrame` 合并为单次更新。

**修改原因**：消除常态 5s 轮询对后端的 DB 读取压力与重连风暴重查，修复半残需刷新的断连逻辑，避免回前台响应式更新爆发导致卡顿。符合用户"主要靠后端统计、前端少交互"的指令。

## 影响范围

- 实时在线人数统计口径（连接为主、心跳兜底），游客/登录用户均覆盖。
- 前端网络交互量（常态零轮询，仅 SSE 长连接 + 断开兜底心跳）。
- 后端 SSE 端点（`statistics/stream`）新增连接登记/撤销；`statistics/heartbeat` 保留作兜底。

## 解决方案

原 5s 心跳单一信号 → 重构为"SSE 长连接引用计数（主）+ 30s 心跳（兜底）"双信号并集；DB 重查询加缓存；断连永久重试；回前台 rAF 合并。选此方案因对前端侵入最小、后端计数更稳、直接消除轮询压力。

## 性能指标

未实测（受限部署无压测环境）；理论：前端常态网络请求由 ~12/min（5s 心跳+15s SSE 推送）降为仅 1 条 SSE 长连接 + 断开兜底 2/min；后端每客户端会话 DB 查询由 ~12/min 降为 0（SSE 连接期间）。

## 测试方案

**Agent 已执行**：
- `python -c "ast.parse(...)"` 校验 `backend/api/realtime_stats.py` 语法通过。
- `npx tsc --noEmit`（frontend）退出码 0，无类型错误。

**待用户实机验证**：
1. 打开网站，观察账号面板"在线人数"是否正常实时变化。
2. 开两个标签页（同账号），关闭其一，在线人数应即时 -1（连接引用计数）。
3. 后台挂起页面 ≥30 分钟，切回前台：确认无卡顿、在线人数仍正确、无需刷新。
4. 断网后恢复：SSE 应自动重连（不再需刷新页面），在线人数恢复。
5. 游客（未登录）模式同理验证在线计数。

## 变更文件清单

- `backend/api/realtime_stats.py` — 连接引用计数计数、SSE register 归属、DB 快照缓存。
- `frontend/src/domains/common/user/composables/useRealtimeStats.js` — SSE 主通道、心跳降频兜底、永久重试、rAF 合并。
- `README.md` — 版本号三处（V3.5.25）。
- `Docs/Guide/CHANGELOG.md` — V3.5.25 条目。
- `Docs/LLM_record/26-08/2026-08-21/2026-08-21-realtime-online-zero-polling.md` — 本日志。

## 遗留与风险

- WebGL 上下文在后台被浏览器丢弃导致 Cesium 需重载的极端情况未覆盖（按需渲染已缓解，非本次主因）；若仍偶发，需另行加 `webglcontextlost` 恢复逻辑。
- 快照缓存 10s 内 `online_users`（DB 会话口径）有最多 10s 延迟，可接受；实时 `realtime_online_users`（内存）不受影响。
- 前端心跳兜底在 SSE 长期不可达时仍每 30s 一次，属预期的轻量保活。
