"""
认证数据库路径解析、连接工厂、时间工具函数。
包含数据库损坏自动检测与恢复机制。
"""

import logging
import os
import shutil
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone

# 北京时间时区（UTC+8）
BEIJING_TZ = timezone(timedelta(hours=8))
from pathlib import Path
from typing import Optional

from config import get_settings, get_str
from core.sqlite_recovery import (
    SQLiteRecoveryError,
    is_sqlite_database_corrupted,
    recover_sqlite_database,
    validate_sqlite_database,
)

logger = logging.getLogger(__name__)


# ─── 数据库路径 ───
def _default_auth_db_path() -> Path:
    """默认路径策略：HF 使用 /data；本地开发优先项目 data 目录。"""
    space_id = get_str("SPACE_ID", "") or get_str("HF_SPACE_ID", "")
    if space_id:
        logger.info("检测到 HuggingFace Space 环境 (SPACE_ID=%s)，使用 /data/webgis_auth.db", space_id)
        return Path("/data/webgis_auth.db")

    if os.name != "nt":
        data_root = Path("/data")
        try:
            if data_root.exists() and os.access(str(data_root), os.W_OK):
                return data_root / "webgis_auth.db"
        except Exception:
            pass

    return Path.cwd() / "data" / "webgis_auth.db"


def _resolve_auth_db_path() -> Path:
    configured = get_settings().auth_db_path
    preferred = Path(configured) if configured else _default_auth_db_path()

    try:
        preferred.parent.mkdir(parents=True, exist_ok=True)
        # 验证目录可写
        test_file = preferred.parent / ".write_test"
        test_file.touch()
        test_file.unlink()
        logger.info("数据库路径解析成功: %s", str(preferred))
        return preferred
    except Exception as e:
        logger.warning("AUTH_DB_PATH (%s) 不可写: %s，尝试回退...", str(preferred), str(e))
        fallback = Path.cwd() / "data" / preferred.name
        try:
            fallback.parent.mkdir(parents=True, exist_ok=True)
            logger.info("已回退到本地路径: %s", str(fallback))
            return fallback
        except Exception as e2:
            logger.error("回退路径也不可用: %s，使用 /tmp 兜底", str(e2))
            return Path("/tmp") / preferred.name


AUTH_DB_PATH = _resolve_auth_db_path()
_auth_storage_ready = False
_recovery_lock = threading.RLock()

# ─── 线程本地连接复用（V3.7.7 批次 A）───
# 此前每次调用 _db_connection 都新建连接并重跑 4 条 PRAGMA（synchronous=FULL 下
# 在 HF 网络盘上有真实磁盘往返），高频端点（/me、map-tokens、每条 chat）一次
# 请求串 5–10 个连接。现改为线程本地缓存 + 代际计数器：
#   - 代际在恢复/重建完成时 +1，所有线程下次取连接时自动丢弃指向旧库文件的连接
#     （修复「库重建后误跳 DDL / 复用旧文件句柄」隐患）；
#   - 快路径做 SELECT 1 存活探测（µs 级），损坏在获取时即可检出并走恢复分支；
#   - 审计结论（2026-11-21 维护日志）：98 个开启函数全部零嵌套、.close() 仅 3 处
#     （location.py 的 close 已改 rollback），共享连接的提交纪律成立。
_local = threading.local()
_conn_generation = 0
_generation_lock = threading.Lock()
_migration_backup_done = False


def _cleanup_orphaned_wal_files(db_path: Path) -> None:
    """
    清理孤立的 WAL/SHM 文件。
    只有主库文件不存在时，才认为同名 -wal/-shm 是孤立文件。主库存在时
    不能主动删除 WAL；其中可能包含尚未 checkpoint 的已提交事务，应交给
    SQLite 在连接时自动恢复。
    """
    if db_path.exists():
        return

    for suffix in ("-wal", "-shm"):
        wal_path = Path(str(db_path) + suffix)
        if wal_path.exists():
            try:
                wal_path.unlink()
                logger.info("已清理孤立的 WAL 文件: %s", str(wal_path))
            except Exception as e:
                logger.warning("清理 WAL 文件失败 (%s): %s", str(wal_path), str(e))


def backup_auth_db_for_migration(reason: str) -> Optional[Path]:
    """
    在兼容性 schema 迁移前备份现有 auth 数据库。

    SQLite 新增列采用原地 ALTER TABLE，无需重建整库；但生产旧库首次迁移前
    仍保留主库与 WAL/SHM 的文件级备份，方便异常时人工回滚。
    """
    global _migration_backup_done

    if _migration_backup_done or not AUTH_DB_PATH.exists():
        return None

    timestamp = datetime.now(BEIJING_TZ).strftime("%Y%m%d%H%M%S")
    backup_dir = AUTH_DB_PATH.parent / "migration_backups"
    try:
        backup_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        logger.error("创建迁移备份目录失败 (%s): %s", str(backup_dir), str(e))
        return None

    backup_base = backup_dir / f"{AUTH_DB_PATH.name}.pre_email_account_v333.{timestamp}"
    copied_any = False
    for suffix in ("", "-wal", "-shm"):
        source = Path(str(AUTH_DB_PATH) + suffix)
        if not source.exists():
            continue
        target = Path(str(backup_base) + suffix)
        try:
            shutil.copy2(str(source), str(target))
            copied_any = True
        except Exception as e:
            logger.error("迁移备份文件失败 (%s -> %s): %s", str(source), str(target), str(e))

    if copied_any:
        _migration_backup_done = True
        logger.warning("邮箱账号迁移前已备份认证数据库: %s (reason=%s)", str(backup_base), reason)
        return backup_base

    return None

# ─── 数据库损坏恢复 ───
_AUTH_REQUIRED_TABLES = ("users", "sessions", "system_config")
_AUTH_REQUIRED_COLUMNS = {
    "users": ("id", "username", "password_hash"),
    "sessions": ("token", "username"),
    "system_config": ("key", "value"),
}


def _attempt_db_recovery(db_path: Path) -> bool:
    """
    Recover from an immutable snapshot. If logical recovery fails after the
    corrupt bundle is safely archived, activate a verified empty schema so auth
    endpoints remain available while the original data stays repairable.
    """
    global _auth_storage_ready

    with _recovery_lock:
        if not db_path.exists():
            return False
        if not _db_file_is_corrupted(db_path):
            return False

        logger.error("Corrupt auth database detected; starting conservative rebuild: %s", db_path)

        from .schema import init_auth_tables_sync

        def initialize_empty_fallback(conn: sqlite3.Connection) -> None:
            """Create the full auth schema in a container-local fallback candidate."""
            init_auth_tables_sync(conn)

        try:
            result = recover_sqlite_database(
                db_path,
                required_tables=_AUTH_REQUIRED_TABLES,
                required_columns=_AUTH_REQUIRED_COLUMNS,
                minimum_total_rows=1,
                require_foreign_key_clean=False,
                activate=True,
                empty_fallback_initializer=initialize_empty_fallback,
                allowed_base_dir=db_path.parent,
            )
        except SQLiteRecoveryError:
            _auth_storage_ready = False
            logger.critical(
                "Automatic auth DB recovery and verified empty fallback both failed. "
                "The corrupt archive is retained, but auth cannot start safely: %s",
                db_path,
                exc_info=True,
            )
            raise

        _auth_storage_ready = False
        if result.method == "empty_fallback":
            logger.critical(
                "Auth DB entered degraded empty mode: users must re-register until the "
                "archived corrupt DB is repaired. archive=%s binary_backup=%s "
                "sql_backup=%s manifest=%s",
                result.snapshot_path,
                result.binary_backup_path,
                result.sql_backup_path,
                result.manifest_path,
            )
        else:
            logger.warning(
                "Auth DB recovery succeeded: method=%s rows=%d binary_backup=%s "
                "sql_backup=%s manifest=%s",
                result.method,
                result.validation.total_rows,
                result.binary_backup_path,
                result.sql_backup_path,
                result.manifest_path,
            )
        return True


def _db_file_is_corrupted(db_path: Path) -> bool:
    """Run read-only quick_check without changing journal mode or creating a DB."""
    try:
        corrupted = is_sqlite_database_corrupted(db_path)
        if corrupted:
            logger.warning("quick_check reported corruption: %s", db_path)
        return corrupted
    except OSError as exc:
        logger.error("Database file check failed with a filesystem error: %s", exc)
        raise


def _configured_journal_mode() -> str:
    """Default to DELETE journal for HF Bucket/NFS/FUSE mounted storage."""
    mode = (get_str("AUTH_DB_JOURNAL_MODE", "DELETE") or "DELETE").strip().upper()
    allowed = {"DELETE", "TRUNCATE", "PERSIST", "MEMORY", "WAL", "OFF"}
    if mode not in allowed:
        logger.warning("Invalid AUTH_DB_JOURNAL_MODE=%s; falling back to DELETE", mode)
        return "DELETE"
    if mode == "WAL":
        logger.warning(
            "WAL is enabled for the auth DB. Use AUTH_DB_JOURNAL_MODE=DELETE on "
            "network-mounted persistent storage."
        )
    return mode


# ─── 执行期瞬态损坏自愈（V3.7.8）───
# 借出时的 SELECT 1 探测只触页头，页级损坏 / 并发写提交窗口的撕裂读探测不到：
# 异常在执行期（conn.execute 于 statistics 等调用方）才暴露并直接 500。
# HF 生产日志 2026-11-22 12:29:56 四连 500（malformed / not a database）后 5 秒
# 无 rebuild 自然恢复 200——瞬态撕裂实证。为只读语句加退避重试即可零 500 自愈；
# 持久损坏重试耗尽后仍抛出，由下一次借出探测路由到既有恢复分支。
_CORRUPTION_MARKERS = ("malformed", "corrupt", "not a database")
_TRANSIENT_CORRUPTION_MAX_RETRIES = 3
_TRANSIENT_CORRUPTION_BACKOFF_SECONDS = 0.15

# ─── 进程内访问串行化（V3.7.8，撕裂读根治层）───
# V3.7.8 部署后生产日志（13:46:44）实证：撕裂窗口可持续 ~10s——HF /data 网络盘
# POSIX 文件锁不可靠，且写入持续发生（sessions 心跳每 ~5s、visit_tracking 每访问），
# 读随时撞上写提交的页落盘中间态；重试只能赌瞬时窗口，赌不过持续写入。
# 单 worker 进程内以访问级互斥根治：连接 with 块全程持锁（__enter__ 取锁 →
# __exit__ 提交/回滚后放锁——提交必须发生在锁内），读与写提交在物理上不再重叠。
# 前提：全部调用方均为 `with conn:` 用法（V3.7.7 审计 98 函数零嵌套；唯一例外
# location.py 的 visit_tracking 已同步改为 with 块）；RLock 容忍同线程嵌套。
# 不经 with 的执行（借出探测 SELECT 1、恢复流程内部）不受锁保护——由瞬态重试 /
# 恢复分支兜底；恢复流程自身串行于 _recovery_lock。
_db_access_lock = threading.RLock()


def _is_corruption_message(message: str) -> bool:
    """损坏类错误消息判定（与借出时探测共用同一全集）。"""
    lowered = str(message or "").lower()
    return any(marker in lowered for marker in _CORRUPTION_MARKERS)


def _execute_with_corruption_retry(exec_fn, sql: str):
    """执行一条语句并对「只读语句 + 损坏类错误」做退避重试（V3.7.8）。

    - 仅重试 SELECT / WITH 开头的只读语句（幂等安全；写语句失败直接透传，
      避免重试导致重复写入）；
    - 非损坏类错误（如 no such table）不重试；
    - 重试耗尽仍损坏则抛出最后一异常，由下一次借出探测路由到恢复分支；
    - 每次重试打 WARNING：瞬态撕裂事件自此在生产日志可见。
    """
    sql_head = str(sql or "").lstrip().lower()
    if not sql_head.startswith(("select", "with")):
        return exec_fn()

    for attempt in range(1, _TRANSIENT_CORRUPTION_MAX_RETRIES + 2):
        try:
            return exec_fn()
        except sqlite3.DatabaseError as exc:
            if not _is_corruption_message(str(exc)):
                raise
            if attempt > _TRANSIENT_CORRUPTION_MAX_RETRIES:
                raise
            logger.warning(
                "Transient corruption on read statement (attempt %d/%d), retrying: "
                "%s | SQL: %s",
                attempt,
                _TRANSIENT_CORRUPTION_MAX_RETRIES,
                str(exc)[:160],
                str(sql)[:80],
            )
            time.sleep(_TRANSIENT_CORRUPTION_BACKOFF_SECONDS * attempt)


class _SelfHealingConnection(sqlite3.Connection):
    """V3.7.8：借出后执行期瞬态损坏自愈连接；V3.7.8：with 块访问级串行化。

    - execute 层：只读语句遇损坏类错误退避重试（见 V3.7.8 注）；
      仅覆盖 execute 阶段（生产 traceback 实证异常均抛自 conn.execute）；
      cursor 惰性取数阶段的页读取错误不在本防线内（见日志遗留项）。
      PRAGMA / DDL / 写语句不重试，语义与原生连接一致。
    - with 块层：全程持有 _db_access_lock（RLock）——提交发生在锁内，
      读与写提交在进程内互斥，根治网络盘撕裂读（V3.7.8）。
    """

    def execute(self, sql, parameters=()):
        def _exec():
            return sqlite3.Connection.execute(self, sql, parameters)

        try:
            return _execute_with_corruption_retry(_exec, sql)
        except sqlite3.DatabaseError as exc:
            if _is_corruption_message(str(exc)):
                # V3.7.8：执行期损坏重试耗尽 → 复位就绪标志，下一次借出强制走恢复分支。
                # 页级损坏时借出探测（SELECT 1 只触页头）仍会通过，若不复位标志，
                # 恢复分支永远不会被触发（生产 16:41:37 实证：重试耗尽 → 1×500 →
                # 14s 后 FS 缓存自愈，全程无 rebuild）。复位后下一次借出以新鲜句柄
                # quick_check：文件真损坏 → 重建；瞬态 → 仅换新句柄即恢复。
                global _auth_storage_ready
                _auth_storage_ready = False
            raise

    def __enter__(self):
        _db_access_lock.acquire()
        return super().__enter__()

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            # 先按原语义提交/回滚，再放锁——提交必须发生在锁内
            return super().__exit__(exc_type, exc_val, exc_tb)
        finally:
            _db_access_lock.release()


def _try_connect(db_path: Path) -> sqlite3.Connection:
    """Create a connection with conservative settings for mounted storage."""
    conn = sqlite3.connect(str(db_path), timeout=15, check_same_thread=False, factory=_SelfHealingConnection)
    try:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=15000;")
        journal_mode = _configured_journal_mode()
        actual_row = conn.execute(f"PRAGMA journal_mode={journal_mode};").fetchone()
        actual_mode = str(actual_row[0]).upper() if actual_row else "UNKNOWN"
        if actual_mode != journal_mode:
            raise sqlite3.OperationalError(
                f"Could not set journal_mode={journal_mode}; SQLite returned {actual_mode}"
            )
        conn.execute("PRAGMA synchronous=FULL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn
    except Exception:
        conn.close()
        raise


def _ensure_schema() -> None:
    """
    确保数据库表结构存在（幂等）。
    直接使用 _try_connect 建立连接，避免通过 _db_connection() 造成无限递归。
    """
    from .schema import init_auth_tables_sync

    # 启动时仅清理真正孤立的 WAL/SHM；主库存在时交给 SQLite 恢复 WAL 内容。
    _cleanup_orphaned_wal_files(AUTH_DB_PATH)

    conn = _try_connect(AUTH_DB_PATH)
    try:
        init_auth_tables_sync(conn)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    # 注意：不在此处设置 _auth_storage_ready = True。
    # 由 _db_connection() 在数据恢复导入完成后统一设置，避免并发线程在数据
    # 恢复前拿到空库连接。
    logger.info("数据库 schema 重建完成: %s", str(AUTH_DB_PATH))


def _bump_conn_generation() -> int:
    """库文件被恢复/重建替换后推进代际，通知所有线程丢弃旧连接。"""
    global _conn_generation
    with _generation_lock:
        _conn_generation += 1
        return _conn_generation


def auth_db_generation() -> int:
    """当前连接代际——供各模块 DDL 就绪标志做失效依据（防库重建后误跳 DDL）。"""
    return _conn_generation


def _drop_thread_conn() -> None:
    """关闭并清除本线程缓存连接（异常路径静默：连接可能已失效）。"""
    conn = getattr(_local, "conn", None)
    if conn is not None:
        try:
            conn.close()
        except Exception:
            pass
        _local.conn = None


def _get_thread_conn() -> sqlite3.Connection:
    """取本线程缓存连接；代际不匹配（库被重建）或尚无连接时新建并缓存。"""
    conn = getattr(_local, "conn", None)
    if conn is not None and getattr(_local, "gen", -1) == _conn_generation:
        return conn
    _drop_thread_conn()
    conn = _try_connect(AUTH_DB_PATH)
    _local.conn = conn
    _local.gen = _conn_generation
    return conn


def _db_connection() -> sqlite3.Connection:
    """
    取认证库连接（V3.7.7 起线程本地复用，初始化与恢复仍串行于 _recovery_lock）。
    恢复流程先保全损坏文件束；不可恢复数据降级为「验证过的空库」而非整体下线。
    """
    global _auth_storage_ready

    # 快路径：代际匹配 + 存活探测（SELECT 1，µs 级；损坏在获取时即可检出）
    conn = getattr(_local, "conn", None)
    if conn is not None and _auth_storage_ready and getattr(_local, "gen", -1) == _conn_generation:
        try:
            conn.execute("SELECT 1").fetchone()
            return conn
        except sqlite3.DatabaseError as exc:
            # V3.7.7：损坏类消息全集——「file is not a database」与 malformed/corrupt
            # 同属文件级失效（HF 日志 2026-11-22 10:04:51 瞬态实证），一并转恢复分支
            if _is_corruption_message(str(exc)):
                logger.error("Thread-local connection detected corruption: %s", exc)
                _auth_storage_ready = False
                _drop_thread_conn()
            elif isinstance(exc, sqlite3.ProgrammingError) and "closed" in str(exc).lower():
                # V3.7.7 hotfix：共享连接被调用方关闭（如历史影像的 closing 包装）时
                # 自愈重建，而非抛 500——连接生命周期由本工厂全权管理
                logger.warning("Thread-local connection was closed externally; recreating")
                _drop_thread_conn()
                return _get_thread_conn()
            else:
                raise

    with _recovery_lock:
        conn = getattr(_local, "conn", None)
        if _auth_storage_ready:
            # 其他线程可能刚完成恢复并推进代际：代际一致且连接仍在则直接复用
            if conn is not None and getattr(_local, "gen", -1) == _conn_generation:
                return conn
            return _get_thread_conn()

        if _db_file_is_corrupted(AUTH_DB_PATH):
            _attempt_db_recovery(AUTH_DB_PATH)

        # Missing first-deploy DB, successfully recovered DB, or a deliberately
        # activated empty fallback reaches here. The fallback is never silent: its
        # manifest/event/log retain the corruption and degradation details.
        _ensure_schema()

        validation = validate_sqlite_database(
            AUTH_DB_PATH,
            required_tables=_AUTH_REQUIRED_TABLES,
            required_columns=_AUTH_REQUIRED_COLUMNS,
            minimum_total_rows=0,
            require_foreign_key_clean=False,
        )
        if not validation.valid:
            _auth_storage_ready = False
            raise SQLiteRecoveryError(
                f"Auth database validation failed after initialization: "
                f"{validation.error or 'unknown error'}"
            )

        _auth_storage_ready = True
        # 库文件可能已被恢复流程替换：推进代际让所有线程丢弃旧连接，
        # 本线程也换新连接（旧连接指向已被重命名归档的库文件）
        _bump_conn_generation()
        _drop_thread_conn()
        logger.info(
            "Auth DB ready: path=%s journal_mode=%s tables=%d rows=%d",
            AUTH_DB_PATH,
            _configured_journal_mode(),
            len(validation.tables),
            validation.total_rows,
        )
        return _get_thread_conn()


def get_auth_db_connection() -> sqlite3.Connection:
    """暴露给其它模块的数据库连接工厂（同一份 auth 数据库）。"""
    return _db_connection()


def _safe_execute(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> bool:
    """安全执行 SQL，捕获异常，记录错误但不中断流程。"""
    try:
        if params:
            conn.execute(sql, params)
        else:
            conn.execute(sql)
        return True
    except Exception as e:
        logger.warning("SQL 执行警告：%s | SQL: %s", str(e)[:200], sql[:100])
        return False


# ─── 时间工具（北京时间 UTC+8）───
def _utc_now() -> datetime:
    """当前北京时间（UTC+8）"""
    return datetime.now(BEIJING_TZ)


def _iso(dt: datetime) -> str:
    """格式化为北京时间 ISO 字符串"""
    return dt.astimezone(BEIJING_TZ).isoformat()


def _parse_iso(text: str) -> datetime:
    parsed = datetime.fromisoformat(str(text))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=BEIJING_TZ)
    return parsed.astimezone(BEIJING_TZ)


def _utc_date_str() -> str:
    return _utc_now().date().isoformat()


def _safe_parse_iso(text: str) -> Optional[datetime]:
    if not text:
        return None
    try:
        return _parse_iso(text)
    except Exception:
        return None