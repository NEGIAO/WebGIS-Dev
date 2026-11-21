# 2026-11-21 SQLite 线程本地连接复用 + 代际失效 + 热路径 DDL 守卫

- **日期与时间**：2026-11-21 20:15
- **任务等级**：L2（性能与稳定）
- **版本**：V3.7.7（批次 A）

## 问题分析

### 核心症状（bugfix-plan P1-4 [P2 性能] 项）

`get_auth_db_connection()` 每次调用都新建 sqlite3 连接并重跑 4 条 PRAGMA（busy_timeout / journal_mode / **synchronous=FULL** / foreign_keys）——在 HF 网络挂载盘上每条 PRAGMA 都有真实磁盘往返；`/api/auth/me`、map-tokens、每条 chat 消息一次请求串 5–10 个连接。另有多处 `CREATE TABLE IF NOT EXISTS` 每请求重跑（api_keys ×9 调用点、agent_chat ×8、api_log ×3、location）。

### 根本原因

连接工厂无缓存层；DDL 就绪标志不存在（或存在但无库重建失效机制——location 的 `_visit_tracking_table_ready` 正是台账警告的「库重建后误跳 DDL」隐患实例）。

### 受影响模块

`api/auth/db.py`（工厂核心）、`api/location.py`、`api/api_keys_management.py`、`api/api_management.py`、`api/agent_chat/db.py`。

### 实施前安全审计（关键前置，证据见维护日志）

1. **嵌套审计**：全仓 98 个连接开启函数、全部 `with _db_connection()` 块逐一扫描，**零嵌套调用**（块内无再次开启连接——参数复用模式如 `_ensure_user_metric_row_sync(conn,…)` 贯彻良好）→ 同线程共享连接不会出现「内层 with 提交外层半截事务」。
2. **`.close()` 审计**：仅 3 处——`db.py` 内部两处（合法）、`location.py:415`（共享化后必须改，已处理）。

## 解决方案

**线程本地连接复用 + 代际计数器**（台账建议方案）：

1. `_local`（threading.local）缓存每线程连接；快路径代际匹配 + `SELECT 1` 存活探测（µs 级）直接复用——PRAGMA 只在连接建立时执行一次。
2. **代际计数器** `_conn_generation`：恢复/重建完成时 `_bump_conn_generation()` 推进，所有线程下次取连接自动丢弃指向旧库文件的连接（含本线程）——与损坏恢复的正确配合，修复「重建后误跳 DDL / 复用旧句柄」。
3. 快路径检出 `malformed/corrupt` → 丢弃本线程连接 + `_auth_storage_ready=False` → 走既有恢复分支（原逻辑保留）；非损坏类错误（如 locked）照常抛出。
4. **DDL 就绪守卫**：`auth_db_generation()` 暴露给四个热路径 ensure 函数（api_keys / agent_chat / api_log / location），模块级 `_gen` 标志与代际比对——库重建后自动重跑 DDL。
5. `location.py` finally 的 `conn.close()` 改为显式 `rollback()`（成功路径已手动 commit；共享连接不再由调用方关闭）。

## 修改内容

1. **feat**：`db.py` 线程本地连接 + 代际 + 存活探测 + `auth_db_generation()` 导出（`api/auth/__init__.py` 同步导出）。
2. **perf**：四个热路径 ensure 函数加代际守卫；location 访客追踪表标志接入代际。
3. **fix**：location finally close → rollback。

## 影响范围

认证库全消费方（透明替换：`_db_connection()` 返回签名不变）；不触碰恢复流程本体与 schema 初始化。

## 性能指标

未实测（本机无 HF 网络盘环境）。预期：高频端点每请求省 4–36 次 PRAGMA 磁盘往返（5–10 连接 × 4 PRAGMA → 1 次建连摊销）；`SELECT 1` 探测开销 µs 级。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| 新增 `tests/test_conn_reuse.py` 5 用例：同线程复用同一连接 / 代际推进丢弃旧连接（含 close 断言）/ 线程间隔离 / liveness malformed 走恢复分支（schema 重跑 + 代际推进断言）/ 非损坏错误照常抛出 | ① 部署后观察启动日志「Auth DB ready」仅一次；② 聊天/统计/登录高频操作无 500 / database is locked；③ 人为损坏库文件 → 自动恢复后功能正常（代际失效生效） |
| 相关域 86/86 测试全绿（含 sqlite_recovery / realtime_stats / guest_identity / secret_masking 全量回归） | ④ HF 多实例（若未来改多 worker）需重新评估——当前方案基于单 worker 前提 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/api/auth/db.py` | 线程本地连接 + 代际 + 存活探测 + `auth_db_generation()` |
| `backend/api/auth/__init__.py` | 导出 `auth_db_generation` |
| `backend/api/location.py` | close → rollback；就绪标志接入代际 |
| `backend/api/api_keys_management.py` / `api_management.py` / `agent_chat/db.py` | 热路径 DDL 代际守卫 |
| `backend/tests/test_conn_reuse.py` | **新增** 5 单测 |
| `Docs/LLM_record/26-11/2026-11-21/2026-11-21-sqlite-conn-reuse.md` | 本日志 |

## 遗留与风险

1. 嵌套审计为**静态启发式**（正则扫 with 块体），非编译期保证；未来新增代码若出现嵌套开启，共享连接会引入「内层提交外层半截事务」——建议后续在 dev-conventions 写明「连接开启函数不得在 with 块内互调，需复用一律参数传 conn」。
2. 方案基于 HF **单 worker** 前提（与 LOGIN_THROTTLE 同前提）；多 worker 部署形态变化时需重估（台账已有 OAuth ticket 同类先例）。
3. `SELECT 1` 探测对「文件被外部删除但句柄存活」场景同样触发恢复分支，行为与旧版一致。
