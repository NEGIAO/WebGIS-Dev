# 2026-11-22 修复瞬态数据库损坏窗口内的在途请求 500（执行期自愈重试）

- **日期与时间**：2026-11-22 12:35 前后（实施中补记）
- **任务等级**：L2（P0 级 Bug 修复）
- **版本**：V3.7.8（曾用号 V3.7.9，按用户「整合为一个统一的版本：V3.7.8」指令归并，见 CHANGELOG 归并注）

## 问题分析

### 核心症状（HF 生产日志 2026-11-22 12:29:56–12:30:01）

`GET /api/statistics/realtime`、`/center`、`/messages` 连续 500：
`sqlite3.DatabaseError: database disk image is malformed` / `file is not a database`；
**5 秒后同端点自然恢复 200，期间无任何 rebuild 日志**。

### 根本原因（事件逻辑链条）

1. 现有防线只在**借出时**：`_db_connection()` 快路径 `SELECT 1` 探测（db.py:348）——该探测只触页头，**页级损坏 / 提交中途的撕裂读探测不到**；异常在执行期（statistics.py:880/:708/:296 `conn.execute`）才暴露 → 直接 500。
2. 「500→5 秒后自愈且无 rebuild」实证为**瞬态撕裂**而非持久损坏：HF /data 为网络挂载存储（db.py:240 注释「HF Bucket/NFS/FUSE」+ journal=DELETE），并发写事务的提交窗口（写页 → 删日志之间）被并发读看到中间态，即报 malformed / not a database；写方提交完成后下一次读自然恢复正常。
3. 既有恢复机制（archive + rebuild，V3.7.7④）只覆盖**持久**损坏；瞬态窗口内没有任何防线。启动日志「数据库 schema 重建完成 rows=16880」说明该库此前已有一次持久损坏被恢复机制重建，本例为同一环境因素的再次瞬态发作。

### 受影响模块

`backend/api/auth/db.py`（连接工厂 `_try_connect`）——auth、statistics、agent_chat/db、historical_imagery 等全部 `get_auth_db_connection()` 调用方统一受益，**零调用点改动**。

### 候选方案对比

| 方案 | 做法 | 取舍 |
|---|---|---|
| A（选定） | 连接工厂改用自定义 Connection 子类：只读语句遇损坏类错误退避重试（3 次、0.15s 递增），持久损坏仍走既有恢复分支 | 集中于 db.py、零调用点改动、幂等安全（只重试读）；重试日志顺带补齐可观测性 |
| B | 逐调用点包 try/except 重试 | statistics 一处 15+ 调用点、auth 域更多，diff 面大且易漏 |
| C | 全局写串行化 / 更换 VFS（unix-dotfile）| 触及并发架构，本地无法验证网络盘行为，风险高 |
| D | 改 WAL | db.py:246 注释明确网络挂载存储不建议，放弃 |

### 解决方案（选定 A）

1. db.py 新增 `_is_corruption_message()` 分类器（malformed / corrupt / not a database，与借出时探测的判定全集一致，探测分支同步去重引用）。
2. 新增 `_execute_with_corruption_retry(exec_fn, sql)`：语句头为 `select` / `with`（只读）且错误属损坏类时重试，最多 3 次、退避 0.15s×attempt，每次打 WARNING（含错误与 SQL 摘要——生产可观测）；重试耗尽仍损坏则抛出，由下一次借出探测路由到既有恢复分支。写语句与非损坏错误（如 no such table）直接透传，不重试（幂等安全）。
3. `_SelfHealingConnection(sqlite3.Connection)` 子类：`execute` 经上述重试；`_try_connect` 以 `factory=` 启用。`SELECT 1` 借出探测同样受益——瞬态探测失败自愈，避免误触发整库恢复；持久探测失败仍转恢复分支，语义不变。
4. 附带闭环：`Docs/Guide/backend-structure.md` tests/ 小节补登记 `test_agent_stream.py`（前会话遗漏，TODO 已有记录）与本次新增测试文件。

## 修改内容

1. `backend/api/auth/db.py`：
   - `import time`；新增常量 `_TRANSIENT_CORRUPTION_MAX_RETRIES=3` / `_TRANSIENT_CORRUPTION_BACKOFF_SECONDS=0.15`。
   - 新增 `_is_corruption_message()`（malformed / corrupt / not a database 全集，大小写不敏感）；借出时探测分支改为引用该分类器（去重，`closed` 分支顺带修正了原先依赖局部变量 `message` 的写法）。
   - 新增 `_execute_with_corruption_retry(exec_fn, sql)`：语句头 `select` / `with`（只读）且错误属损坏类 → 最多重试 3 次（0.15s×attempt 退避），每次 WARNING 记录错误与 SQL 摘要；写语句 / 非损坏错误直接透传；耗尽后抛最后一异常。
   - 新增 `_SelfHealingConnection(sqlite3.Connection)` 子类，`execute` 经上述重试；`_try_connect` 以 `factory=_SelfHealingConnection` 启用——`SELECT 1` 借出探测同样受益（瞬态探测失败自愈，避免误触发整库恢复；持久探测失败仍转恢复分支）。
2. `backend/tests/test_db_transient_corruption.py`（**新增**）：分类器正反例、只读重试成功、WITH 重试、耗尽抛出（4 次调用断言）、写语句不重试、非损坏错误不重试、工厂连接正常读写冒烟。
3. `Docs/Guide/backend-structure.md`：tests/ 小节补登记 `test_agent_stream.py`（前会话遗漏）与 `test_db_transient_corruption.py`。
4. `Docs/TODO/bugfix-optimization-plan.md`：结构树缺项条目子项闭环（后端树门禁缺口仍开放）。

## 影响范围

- 全部 `get_auth_db_connection()` 调用方（auth、statistics、agent_chat/db、api_keys_management、admin、location、external_proxy、api_management、historical_imagery）——**零调用点改动**，行为仅在「只读语句 + 损坏类错误」时变化（重试而非立即 500）。
- 恢复机制语义不变：持久损坏仍由借出探测/验证路由到 archive + rebuild；降级空库等既有行为不受影响。
- 写路径（INSERT/UPDATE/DELETE/DDL/PRAGMA）完全不加重试——保证幂等安全。

## 性能指标

不适用——正常路径零开销（try 直通，无额外查询）；瞬态窗口单请求最多增加 ~0.9s 延迟（3 次退避）换取成功响应。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| 新增 9 单测 + 相关域（conn_reuse / sqlite_recovery / agent_stream）pytest **38/38 全绿**；py_compile 通过；结构树门禁（前端 739/739）与配置登记通过；红线扫描仅已知假阳性 | ① 部署后正常使用 /statistics/* 等页面无回归；② 若再遇撕裂窗口：HF 日志应出现 `Transient corruption on read statement (attempt N/3), retrying` WARNING 而非 500，页面无感；③ 若出现**持续**损坏（重试耗尽后的 500 + rebuild 日志），属持久损坏，按既有恢复机制处理——如复发请留存日志段 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/api/auth/db.py` | 分类器 + 只读重试 + 自愈连接工厂 |
| `backend/tests/test_db_transient_corruption.py` | **新增** 9 单测 |
| `Docs/Guide/backend-structure.md` | tests/ 小节补登记 2 文件 |
| `Docs/TODO/bugfix-optimization-plan.md` | 结构树条目子项闭环 |
| `README.md` | 版本号三处 |
| `Docs/Guide/CHANGELOG.md` | 顶部追加 V3.7.9 条目（含号段重新启用说明） |
| `Docs/LLM_record/26-11/2026-11-22/2026-11-22-fix-transient-corruption-execute-retry.md` | 本日志（**新建**） |

## 遗留与风险

1. **cursor 惰性取数阶段的页读取错误不在本防线内**（fetchall/fetchone 阶段抛 malformed 仍会 500）——生产 traceback 实证异常均抛自 `conn.execute`，故本覆盖与实测故障面一致；若未来日志出现 fetch 阶段损坏，再扩展 cursor 包装。
2. **网络盘撕裂的根源（文件锁不可靠）未根治**——重试方案对该症状免疫，但写事务的提交窗口依然存在；若 WARNING 频繁出现（可观测量），可再评估全局写串行化或 VFS 调整（本日志方案对比 C 项）。
3. 重试阻塞发生在 `asyncio.to_thread` 工作线程，最长 ~0.9s，不阻塞事件循环。
4. 日志中的 **Aliyun MaaS key 401**（12:29:33「Agent service key is invalid or expired」）为运维项：后端代理通道的 key 已失效，请到管理面更新——代码已有 fallback 缓存兜底，非本次缺陷。
5. 上轮评审 P1（流式候选轮换外层循环缺 break）仍未修复，在 TODO 等待授权。
