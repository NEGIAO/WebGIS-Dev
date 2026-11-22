# 2026-11-22 认证库进程内访问串行化（根治网络盘撕裂读）

- **日期与时间**：2026-11-22 13:55 前后（实施中补记）
- **任务等级**：L2（P0 级可靠性修复）
- **版本**：V3.7.11

## 问题分析

### 核心症状（HF 生产日志 13:44–13:47，V3.7.9 部署后首个撕裂窗口）

1. ✅ V3.7.9 防线部分生效：13:46:44 六条 `Transient corruption (attempt 1/3)` WARNING 可观测，其中 4 条第 1 次重试即自愈（messages/realtime 200）。
2. ❌ 两个热点查询（`sessions` 表在线数、`system_config`）**3 次重试全部落空** → 仍 2 个 500；~10s 后同端点恢复 200。

### 根本原因（证据链升级）

撕裂窗口本次持续 **~10 秒**（上次 5 秒）——远超单次 commit 的毫秒级窗口。结论：HF /data 网络盘 POSIX 文件锁不可靠 + **写入持续发生**（`sessions` 表心跳每 ~5s 写入、visit_tracking 每次访问写入），读操作随时可能撞上任意一次写提交的页落盘中间态。V3.7.9 的退避重试本质是「赌下一次读落在窗口外」，对持续写入的赌胜率随窗口变长而崩塌——**重试防线已到天花板，须根治**。

另：启动时再次出现「schema 重建完成 rows=16979」（数据保全 ✓）——锁失效环境下并发写也可能造成真实文件损坏，同样受益于写互斥。

### 受影响模块

`backend/api/auth/db.py`（连接工厂子类加锁）；`backend/api/location.py`（唯一非 `with` 用法的调用点，19 处中 18 处已为 `with conn:`，V3.7.7 审计「98 函数零嵌套」）。

### 候选方案对比

| 方案 | 做法 | 取舍 |
|---|---|---|
| A（选定） | 进程内访问级互斥：`_SelfHealingConnection` 重写 `__enter__/__exit__`，with 块（含提交）全程持进程级 RLock，读写互斥 | 单 worker 下确定性消灭撕裂读；零调用点改动（唯一例外 location.py 同步改 with）；流量轻、DB 操作 µs–ms 级，串行化代价可忽略 |
| B | 加大重试预算（6 次 / 2s+） | 10s 窗口仍会 500，只是赌更久；不采纳 |
| C | 换 WAL / unix-dotfile VFS | WAL 在网络挂载存储明确不建议（db.py:246 注释）；VFS 行为本地无法验证；不采纳 |

### 解决方案（选定 A）

1. db.py：新增 `_db_access_lock = threading.RLock()`；`_SelfHealingConnection` 重写 `__enter__`（取锁）/ `__exit__`（先提交/回滚再放锁——提交必须发生在锁内）。
2. location.py：`visit_tracking` 保存路径由「手动 commit + finally rollback」改为标准 `with conn:` 块（退出即提交、异常即回滚），纳入串行化。
3. 既有 V3.7.9 瞬态重试**保留**作为纵深防御（借出探测 SELECT 1、恢复流程内部等不经 with 的执行不受锁保护，由重试/恢复分支兜底）。

## 修改内容

1. `backend/api/auth/db.py`：新增 `_db_access_lock = threading.RLock()`（含完整机制注释）；`_SelfHealingConnection` 重写 `__enter__`（取锁）/ `__exit__`（先按原语义提交/回滚、finally 放锁——提交必须发生在锁内）。
2. `backend/api/location.py`：`track-visit` 的 visit_tracking 保存路径由「手动 `conn.commit()` + finally `rollback()`」改为标准 `with get_auth_db_connection() as conn:` 块（with 退出即提交、异常即回滚），纳入串行化；外部响应契约不变（失败仍返回 200 + tracked:false）。
3. `backend/tests/test_db_transient_corruption.py`：新增 `AccessSerializationTests` 3 例——4 线程 × 25 次 with 块并发峰值恒为 1、块内异常后锁已释放（`acquire(blocking=False)` 断言）、同线程嵌套可重入。

## 影响范围

- 全部 `get_auth_db_connection()` 的 `with conn:` 用法（19 处调用点中的 18 处）自动持锁，读写互斥；location.py 第 19 处本次同步纳入。
- V3.7.9 瞬态重试**原样保留**：借出探测 `SELECT 1`、恢复流程内部等不经 with 块的执行不受锁保护，由重试/恢复分支兜底（纵深防御双层化）。
- 外部行为契约零变化（响应结构、状态码、回滚语义均不变）；不涉及配置 key、结构树、前端。

## 性能指标

串行化代价 = DB 访问失去并发（单 worker 内按序执行）。本应用 DB 操作为 µs–ms 级、流量为个人站点量级，可忽略；statistics 的 6 路 gather 变为串行聚合，总耗时 ≈ 各查询之和（实测本地全量测试套件无感知差异）。生产 TTFB 对比待下次部署后观察。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| 新增 3 单测 + 相关域（conn_reuse / sqlite_recovery / guest_identity / realtime_stats / corruption）pytest **67/67 全绿**；py_compile 通过；结构树门禁（前端 739/739）与配置登记通过；红线扫描仅已知假阳性 | ① 常规使用无回归（登录/对话/统计页/位置追踪）；② 再次出现写入高峰时：HF 日志**不应再有** malformed / not a database 500；WARNING 重试行应趋近于零（仅剩探测/恢复路径兜底）；③ 若仍出现 500，留存日志段（那将是锁覆盖不到的路径或多进程因素，需再排查） |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/api/auth/db.py` | 访问级互斥锁 + 连接 with 块加锁 |
| `backend/api/location.py` | visit_tracking 写路径改标准 with 块 |
| `backend/tests/test_db_transient_corruption.py` | 新增串行化 3 单测 |
| `README.md` | 版本号三处 |
| `Docs/Guide/CHANGELOG.md` | 顶部追加 V3.7.11 条目 |
| `Docs/LLM_record/26-11/2026-11-22/2026-11-22-fix-db-access-serialization.md` | 本日志（**新建**） |

## 遗留与风险

1. **多 worker 部署不受进程内锁保护**（当前 uvicorn 单 worker 实证）——若未来扩 worker，需改文件锁/分布式锁方案（而文件锁正是网络盘上失效的东西），届时需重新评估架构。
2. 不经 with 块的执行（借出探测、`_ensure_schema`、恢复流程内部）不在锁内——探测失败由 V3.7.9 重试兜底；恢复流程自身串行于 `_recovery_lock`，启动期无并发流量。
3. Python 锁非公平锁，理论存在写者长期持锁饿死读者的极端场景——本应用写操作极短，风险可忽略。
4. 日志中的 Aliyun MaaS key 401 仍为未处理运维项（管理面更新 key 即可）。
5. 上轮评审 P1（流式候选轮换外层缺 break）仍未修复，在 TODO 等待授权。
