# SQLite 损坏恢复数据丢失修复

**日期**: 2026-06-09 10:30
**版本**: 3.0.x
**类型**: Bug Fix / 数据安全

---

## 问题核心症状

当认证数据库 (`webgis_auth.db`) 发生损坏时，自动恢复机制虽然触发，但**恢复后的新数据库是空白的**——所有原有用户数据、会话、访问记录等全部丢失。

## 事件逻辑链路分析

### 原始恢复流程（有缺陷）

```
_db_connection() 检测到 "malformed" 错误
    ↓
_auth_storage_ready = False
    ↓
_db_file_is_corrupted() → quick_check 返回异常 → True
    ↓
_attempt_db_recovery()
    ├── 备份损坏文件（只是复制 .db → .db.corrupted.xxx）
    ├── _try_dump_database() → sqlite3 .dump 命令
    │   └── 损坏时 .dump 返回 exitcode=0 但输出只有错误注释，无 INSERT
    ├── 删除主文件、WAL、SHM
    └── _auth_storage_ready = False
    ↓
_ensure_schema() → CREATE TABLE IF NOT EXISTS → 创建空表
    ↓
重试连接 → 全新的空白数据库！数据全部丢失
```

### 根本原因（共 3 个）

| # | 问题 | 位置 | 严重度 |
|---|------|------|--------|
| 1 | **`.dump` 输出未校验 INSERT 内容** | `_try_dump_database` | 严重 |
| 2 | **恢复数据从未被导入** | `_attempt_db_recovery` / `_db_connection` | 严重 |
| 3 | **dump 导入时 CREATE TABLE 冲突** | `_import_recovered_data` | 中等 |

#### 根因 1：`.dump` 输出未校验

原始代码：
```python
if result.returncode == 0 and result.stdout:
    # 认为 dump 成功
```

**问题**：SQLite 的 `.dump` 命令即使在数据库完全损坏时也返回 `exitcode=0`，但输出内容只是错误注释：
```sql
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
/**** ERROR: (26) file is not a database *****/
ROLLBACK; -- due to errors
```

没有任何 INSERT 语句，但代码仍认为"dump 成功"并保存了这个无用的 SQL 文件。

#### 根因 2：恢复数据从未被导入

原始 `_attempt_db_recovery()` 只做了三件事：
1. 备份损坏文件
2. 删除损坏文件
3. 重置 `_auth_storage_ready = False`

**完全没有存储恢复的数据**，也没有任何机制将恢复的数据传递给后续的 `_ensure_schema()` 步骤。

#### 根因 3：dump 导入时 CREATE TABLE 冲突

即使有 dump 文件，`_ensure_schema()` 先运行创建了空表，然后 `_import_recovered_data` 尝试执行整个 dump SQL（包含 `CREATE TABLE`），导致 "table already exists" 错误，后续的 INSERT 语句可能因事务状态异常而失败。

---

## 修复方案

### 修复 1：`.dump` 输出校验

**新增 INSERT 计数验证**：只有 dump 输出中包含真正的 INSERT 语句时才认为有效。

```python
# 旧代码
if result.returncode == 0 and result.stdout:
    return recovered_data  # 可能只有错误注释

# 新代码
dump_insert_count = sum(1 for line in dump_content.splitlines()
                        if line.strip().upper().startswith('INSERT '))
if dump_insert_count > 0:
    recovered_data['_dump_sql'] = dump_content  # 直接存 SQL 字符串，不用临时文件
    recovered_data['_dump_insert_count'] = dump_insert_count
```

### 修复 2：恢复数据暂存与导入

**新增全局变量 `_pending_recovery_data`**，在 `_attempt_db_recovery()` 中暂存恢复数据，在 `_db_connection()` 中 schema 重建后导入。

```python
# _attempt_db_recovery() 中：
global _pending_recovery_data
if has_recovered_data:
    _pending_recovery_data = recovered_data

# _db_connection() 中：
if _pending_recovery_data:
    import_stats = _import_recovered_data(conn, _pending_recovery_data)
    _pending_recovery_data = None  # 清除暂存
```

### 修复 3：dump 导入仅提取 INSERT

**跳过 DDL 语句**，只执行 INSERT 语句（schema 已由 `_ensure_schema()` 重建）：

```python
# 旧代码：执行整个 dump SQL（包含 CREATE TABLE）
for stmt in statements:
    conn.execute(stmt)

# 新代码：仅提取 INSERT 语句
insert_statements = [
    line.strip() for line in dump_sql.splitlines()
    if line.strip().upper().startswith('INSERT ')
]
for stmt in insert_statements:
    conn.execute(stmt)
```

---

## 测试验证

### 测试 1：部分损坏恢复（sqlite3 CLI）

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| users 恢复 | 0 行 | 200 行 |
| logs 恢复 | 0 行 | 0 行（数据在损坏页面，预期丢失） |
| 导入成功 | N/A | 200/200 |

### 测试 2：Python 逐表降级恢复（无 sqlite3 CLI）

| 指标 | 结果 |
|------|------|
| users 恢复 | 50 行 |
| logs 恢复 | 0 行（损坏页面） |
| 导入成功 | 50/50 |

### 测试 3：生产数据库完整性

```
quick_check: ok
users: 43, sessions: 42, user_visits: 1038, ...
```

---

## 影响范围

- **模块**: `backend/api/auth/db.py`（认证数据库连接工厂）
- **函数**: `_try_dump_database`, `_import_recovered_data`, `_attempt_db_recovery`, `_db_connection`
- **数据安全**: 修复前数据库损坏 = 数据全丢；修复后可恢复未损坏页面的数据

---

## 修改的文件路径

- `d:\Dev\GitHub\WebGIS_Dev\backend\api\auth\db.py`

---

## 恢复策略总结

修复后的完整恢复流程：

```
_db_connection() 检测到损坏
    ↓
_attempt_db_recovery()
    ├── 备份损坏文件 → .db.corrupted.{timestamp}
    ├── _try_dump_database()
    │   ├── 策略1: sqlite3 .dump → 校验 INSERT 数量 → 有效则存入 _dump_sql
    │   └── 策略2: Python 逐表 SELECT → 存入 {table: {columns, rows}}
    ├── 删除损坏文件
    └── 暂存恢复数据到 _pending_recovery_data
    ↓
_ensure_schema() → CREATE TABLE IF NOT EXISTS（幂等建空表）
    ↓
_import_recovered_data()
    ├── dump 模式: 仅提取 INSERT 语句执行
    └── 逐表模式: INSERT OR IGNORE 逐行导入
    ↓
清除暂存 → 返回连接
```

**关键改进**：损坏页面的数据无法恢复（SQLite 物理限制），但未损坏页面的数据现在可以完整保留。
