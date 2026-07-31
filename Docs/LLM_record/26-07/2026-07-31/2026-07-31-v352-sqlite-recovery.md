# 2026-07-31 V3.5.2 HF 挂载 SQLite 保守恢复、备份与维护审计

- **日期与时间**：2026-07-31 21:17
- **任务等级**：L3（数据库结构与恢复架构变更；实施方向已由用户在本次任务前明确批准）
- **版本号**：V3.5.2

---

## 问题分析

### 核心症状
Hugging Face Space 重启后，挂载 Bucket 中的鉴权 SQLite 数据库可能损坏。旧自动修复流程曾出现后端启动崩溃、恢复后数据库被清空、直接改写动态挂载源文件等问题；同一损坏库在本地通过 `sqlite3 .dump` 导出 SQL、把末尾事务回滚改为提交、再导入新库时则多次恢复成功。

### 根本原因
1. HF Persistent Storage/Bucket 通常以网络文件系统语义挂载，SQLite WAL 对共享内存、文件锁、mmap 和 sidecar 同步要求较高，Space 重启会放大 `-wal`/`-shm` 状态不一致风险。
2. 旧流程把恢复、源文件替换、schema 初始化和数据回填耦合在同一模块，失败路径可能继续执行空库建表。
3. 恢复过程中直接在挂载源文件附近进行 SQLite 读写，缺少不可变损坏备份、候选库分层校验、源指纹并发检查和激活失败回滚。
4. 损坏日期、恢复阶段、备份位置和失败原因没有统一的持久化审计记录，人工接管时缺少证据链。

### 受影响模块
- FastAPI 鉴权数据库连接与启动初始化
- SQLite 损坏检测、恢复、备份、激活和回滚
- 数据库 schema 与维护事件审计
- Hugging Face Docker 运行环境与配置注册

---

## 修改内容

1. 重写 `backend/api/auth/db.py` 的损坏检测与恢复编排：逻辑恢复失败但损坏 bundle 已安全备份时，创建、校验并激活完整空 schema，使 auth 子系统降级可用；只有备份或空库激活也失败时才抛错。
2. 新增 `backend/utils/sqlite_recovery.py`，实现只读检测、时间戳 bundle 备份、容器临时目录重建、多重校验、staging 激活和失败回滚。
3. 新增 `backend/utils/sqlite_maintenance.py`，定义 `database_maintenance_events` 表并把恢复 JSON manifest 幂等同步进数据库。
4. 更新 `backend/api/auth/schema.py`，初始化维护事件表并移除强制启用 WAL 的语句。
5. 更新 `backend/Dockerfile`，安装 `sqlite3` CLI。
6. 新增 `backend/tests/test_sqlite_recovery.py`，覆盖恢复成功与关键失败路径。
7. 在根 `.env.example` 与 `backend/config/catalog.py` 登记 `AUTH_DB_JOURNAL_MODE=DELETE`。
8. 更新 README 三处版本信息、CHANGELOG 和后端 SSOT 文件树。

---

## 修改原因

- 保证任何自动恢复尝试前都有按具体日期时间命名的完整损坏备份，用户仍可下载后人工修复。
- 复用已被本地多次验证的 `.dump` → 清理事务结尾 → 新库导入流程，但将所有重建操作限制在容器本地临时目录。
- 避免恢复失败、并发变更或挂载盘短暂异常导致原始数据被覆盖或静默清空。
- 为线上排障提供数据库内事件表、外部 JSON manifest 和后端日志三层记录。

---

## 影响范围

| 范围 | 影响 |
|---|---|
| 鉴权数据库启动 | 启动时先只读检测；逻辑恢复失败后安全激活空 schema，避免 auth 整体持续 500；损坏原库保留在时间戳归档中 |
| 数据库存储 | HF 网络挂载默认使用 DELETE journal + FULL synchronous，不再强制 WAL |
| 数据库 schema | 新增 `database_maintenance_events` 维护审计表 |
| 备份目录 | 在数据库同级 `recovery_backups/<库名>.corrupt.<UTC时间>/` 保留损坏 bundle、manifest、人工说明及恢复产物 |
| Docker 镜像 | 增加 Debian `sqlite3` CLI 包 |
| 配置 | 新增 L1 非密配置 `AUTH_DB_JOURNAL_MODE`，默认 `DELETE` |

---

## 解决方案

### 方案对比

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| 直接在挂载源库上执行修复/建表 | 实现简单 | 极易二次破坏；失败后无法人工接管 | 不采用 |
| 读取可见行后逐表写回空库 | 不依赖 CLI | 容易丢 schema、索引、触发器、约束和不可枚举行 | 不采用 |
| 先备份，容器本地 `.dump`/`.recover` 重建，校验后 staging 激活 | 最大限度保留源证据；复用已验证流程；可回滚 | 流程更复杂，依赖临时空间和 sqlite3 CLI | 采用 |

### 实施流程
1. 记录首次检测 UTC 时间和源文件 mtime，以只读 URI 执行 `quick_check(1)`。
2. 把主库及 `-wal`、`-shm`、`-journal` 复制到时间戳损坏目录，逐文件校验 SHA256，并原子写入 JSON manifest 与 `MANUAL_RECOVERY.txt`。
3. 将损坏 bundle 复制到容器 `TemporaryDirectory`，全程不在源库上执行 dump/import。
4. 优先执行 `.dump`；只匹配独立的 `ROLLBACK;` 事务行并替换为 `COMMIT;`，避免误改业务 SQL 文本。若候选无效，再尝试 `.recover --ignore-freelist`。
5. 对候选执行 quick/integrity/foreign-key 检查，并验证鉴权必需表、必需列和最低行数。
6. 生成验证后的二进制备份和 SQL 备份，再复制为挂载目录 staging 文件并复检。
7. 激活前比较在线源 bundle 指纹；确认未变化后用 `os.replace` 切换。激活后再次校验，失败则恢复原始 bundle。
8. 若 `.dump` 与 `.recover` 均失败且损坏 bundle 已验证落盘，则在容器临时目录创建完整空 schema，校验并备份后原子激活，以 `recovery_degraded_empty` 标记降级状态。
9. 可用数据库启动后，将 JSON manifest 同步到 `database_maintenance_events`，同时输出结构化后端日志。

---

## 性能指标

未实测。恢复流程仅在检测到损坏时触发，正常连接路径不会执行 dump/rebuild；实际耗时和临时磁盘占用取决于线上数据库体积与 HF 挂载吞吐。

---

## 测试方案

### Agent 已执行
- `python -m py_compile`：恢复、维护、数据库连接、schema 与测试文件语法检查通过。
- `python -m unittest discover -s backend\tests`：共 20 项测试通过。
- 自动化覆盖：CRLF `ROLLBACK` 清理、SQL 字符串防误替换、维护事件 UPSERT、manifest 同步、dump 重建成功、失败保留源字节、初始备份失败记录、激活后校验失败回滚。
- 测试全部使用系统临时目录中的合成 SQLite 数据库，未读取、写入或替换项目 `backend/data/webgis_auth.db`。
- 文档与配置门禁结果见本文末尾“门禁结果”。

### 待用户实机验证
1. 在 HF Space 测试副本中准备一份可复现损坏的鉴权库并重启容器。
2. 预期日志先输出损坏检测时间、时间戳备份目录和恢复阶段，且不会直接对源库执行重建。
3. 检查 `recovery_backups/`：应保留损坏主库/sidecar、SHA256 信息、JSON manifest、`MANUAL_RECOVERY.txt`、恢复后的 DB 与 SQL 备份。
4. 恢复成功时验证用户、会话及系统配置数据仍存在，并查询 `database_maintenance_events` 对应 success 记录。
5. 人为让 `.dump`/`.recover` 失败：应保留原损坏归档并激活完整空 schema，auth 接口不应因恢复异常持续 500；若连归档或空库激活也失败，后端才明确报错。

---

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/api/auth/db.py` | 只读损坏检测、保守恢复编排与网络挂载连接策略 |
| `backend/api/auth/schema.py` | 初始化维护事件表、同步 manifest、移除强制 WAL |
| `backend/utils/sqlite_recovery.py` | 完整 SQLite 备份/重建/校验/激活/回滚实现 |
| `backend/utils/sqlite_maintenance.py` | 维护事件表定义、manifest UPSERT 与目录同步 |
| `backend/tests/test_sqlite_recovery.py` | SQLite 恢复与失败安全回归测试 |
| `backend/Dockerfile` | 安装 sqlite3 CLI |
| `.env.example` | 登记 `AUTH_DB_JOURNAL_MODE=DELETE` |
| `backend/config/catalog.py` | 登记日志模式配置元数据 |
| `README.md` | 更新 V3.5.2 当前版本、三条摘要和页脚 |
| `Docs/Guide/CHANGELOG.md` | 新增 V3.5.2 完整版本记录 |
| `Docs/Guide/backend-structure.md` | 同步新增恢复/维护/测试文件与职责注释 |
| `Docs/LLM_record/26-07/2026-07-31/2026-07-31-v352-sqlite-recovery.md` | 本次 L3 维护日志 |

---

## 遗留与风险

1. HF Bucket/NFS/FUSE 的锁与一致性语义仍由平台决定；DELETE journal 降低 WAL/SHM 风险，但不能消除网络存储中断。
2. 自动恢复依赖镜像内 `sqlite3` CLI、足够的容器临时空间和备份目录可写权限。
3. `.recover` 属尽力而为兜底，可能恢复出不完整或重命名对象；因此仍以严格校验和人工备份为最终安全边界。
4. 线上真实损坏样本尚未在 HF Space 实机演练；当前结论来自合成库验证与用户已验证的本地 CLI 流程。空库降级会丢失当前在线账号视图，既有用户需等待人工恢复原库或重新注册。
5. 若同一挂载目录存在多个 Space 实例并发写入，SQLite 仍不是理想的共享数据库；中长期可评估迁移到受管 PostgreSQL。

---

## 门禁结果
- CheckStructureTree：通过（文档条目 415、磁盘文件 415、漏登记 0、幽灵条目 0）
- CheckConfigRegistry：全部通过（catalog 109 key、前端使用 VITE_ 11 个）
- Python 语法检查：通过
- Python 单元测试：此前 20 项全量通过；本轮按用户要求不再继续执行全量测试
- `git diff --check` 与 `git diff --cached --check`：通过
- Git 写操作：未执行
- 项目数据库文件：未修改
