# 2026-11-22 P0 紧急修复：共享连接被 closing 关闭导致全站登录 500

- **日期与时间**：2026-11-22 10:05
- **任务等级**：P0 紧急修复（生产事故，L2 流程从简加速、文档事后补全）
- **版本**：V3.7.7（hotfix）

## 事故经过

V3.7.7 批次 A（线程本地连接复用）部署到 HF 后，用户登录/`/api/auth/me`/访问追踪大面积 500：`sqlite3.ProgrammingError: Cannot operate on a closed database`（`db.py:348` 快路径 `SELECT 1` 处）。HF 日志确认首爆点：`services/historical_imagery.py` 的 `with closing(get_auth_db_connection()) as conn:`（启动时 Wayback 同步任务即触发）。

## 根因（两个叠加缺陷）

1. **调用方关闭共享连接**：`historical_imagery.py` 4 处使用 `contextlib.closing(...)` 包装 `_db_connection()` 返回的共享连接——`closing` 退出时 `close()` 该连接。而**该文件无 `.close()` 字面量，恰好绕过了批次 A 实施前的 close 审计**（审计 grep 只匹配 `.close()` 文本形式，`closing()` 包装是盲区）——审计失误归我。
2. **快路径对「closed」抛错而非自愈**：`ProgrammingError("Cannot operate on a closed database")` 不含 malformed/corrupt → 走 re-raise 分支 → 500。被 close 的连接滞留在 `threading.local`，同线程后续请求持续 500，直到连接代际被推进或线程销毁——造成长时间大范围不可用。

## 修复

1. **根修**：`historical_imagery.py` 4 处 `with closing(get_auth_db_connection()) as conn:` → `with get_auth_db_connection() as conn:`——sqlite3 连接的 `with` 是**事务语义**（成功 commit / 失败 rollback），不关闭连接，与共享连接生命周期契约一致；移除 `contextlib.closing` 导入。
2. **防御纵深**：`db.py` 快路径新增 `ProgrammingError` + "closed" 分支 → `_drop_thread_conn()` + 重建连接返回（自愈而非 500）——未来任何新的外部关闭点都只会自愈。
3. 全仓 `closing(` 扫描清零（仅 historical_imagery 4 处，已全部改写）。

## 测试

- 新增回归用例 `test_externally_closed_connection_self_heals`（外部 close → `_db_connection` 返回新连接而非抛错）；
- 相关域 **87/87 全绿**（含 historical_imagery 既有测试——其只测 `_normalize_entries` 不触连接，这正是本机测试盲区：连接生命周期无既有覆盖，本批已补）；
- `py_compile` 全过；`closing(` 残留清零。

## 待用户执行（立即部署止血）

```bash
git add backend/services/historical_imagery.py backend/api/auth/db.py backend/tests/test_conn_reuse.py Docs/...
git commit && git push   # HF 自动重建后 /api/auth/me 恢复 200
```

## 遗留与风险

1. **审计方法学修正**：close 审计必须覆盖 `closing()` 包装与任何对连接对象的方法转发——已在本日志与 db.py 注释写明契约「连接生命周期由工厂全权管理，调用方禁止关闭」；建议 dev-conventions 增补该约定（待办）。
2. 连接复用方案的收益保留（PRAGMA 摊销），自愈兜底使「外部关闭」从 500 降级为一次重建。
3. 在线计数诊断任务（上一会话）暂停中——待此 P0 部署恢复后继续，仍等 `/statistics/admin/online-debug` 现场 JSON。
