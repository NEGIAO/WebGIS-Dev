"""
认证数据库路径解析、连接工厂、时间工具函数。
包含数据库损坏自动检测与恢复机制。
"""

import logging
import os
import shutil
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from config import get_settings, get_str
from utils.sqlite_recovery import (
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

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
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


def _try_connect(db_path: Path) -> sqlite3.Connection:
    """Create a connection with conservative settings for mounted storage."""
    conn = sqlite3.connect(str(db_path), timeout=15, check_same_thread=False)
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


def _db_connection() -> sqlite3.Connection:
    """
    Create an auth DB connection. Initialization and recovery are serialized.
    Recovery first preserves the corrupt bundle; unrecoverable data degrades to
    a verified empty schema instead of taking the whole auth subsystem offline.
    """
    global _auth_storage_ready

    if _auth_storage_ready:
        try:
            return _try_connect(AUTH_DB_PATH)
        except sqlite3.DatabaseError as exc:
            message = str(exc).lower()
            if "malformed" not in message and "corrupt" not in message:
                raise
            logger.error("Database connection detected corruption: %s", exc)
            _auth_storage_ready = False

    with _recovery_lock:
        if _auth_storage_ready:
            return _try_connect(AUTH_DB_PATH)

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
        logger.info(
            "Auth DB ready: path=%s journal_mode=%s tables=%d rows=%d",
            AUTH_DB_PATH,
            _configured_journal_mode(),
            len(validation.tables),
            validation.total_rows,
        )
        return _try_connect(AUTH_DB_PATH)


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


# ─── 时间工具 ───
def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _parse_iso(text: str) -> datetime:
    parsed = datetime.fromisoformat(str(text))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _utc_date_str() -> str:
    return _utc_now().date().isoformat()


def _safe_parse_iso(text: str) -> Optional[datetime]:
    if not text:
        return None
    try:
        return _parse_iso(text)
    except Exception:
        return None