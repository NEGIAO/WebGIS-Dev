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

logger = logging.getLogger(__name__)


# ─── 数据库路径 ───
def _default_auth_db_path() -> Path:
    """默认路径策略：HF 使用 /data；本地开发优先项目 data 目录。"""
    space_id = str(os.getenv("SPACE_ID") or os.getenv("HF_SPACE_ID") or "").strip()
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
    configured = str(os.getenv("AUTH_DB_PATH", "")).strip()
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
_recovery_lock = threading.Lock()

# ─── 数据库损坏恢复 ───
def _attempt_db_recovery(db_path: Path) -> None:
    """
    数据库损坏恢复：备份损坏文件 → 删除 → 重置初始化标志。
    使用 threading.Lock 保证同一进程内只执行一次恢复。
    """
    global _auth_storage_ready

    with _recovery_lock:
        # 二次检查：可能另一个线程已完成恢复
        if not db_path.exists():
            return

        backup_path = db_path.with_suffix(
            f"{db_path.suffix}.corrupted.{int(datetime.now(timezone.utc).timestamp())}"
        )

        # 备份损坏的数据库主文件（WAL 模式下备份不包含 WAL 数据，仅供事后分析）
        try:
            if db_path.exists():
                shutil.copy2(str(db_path), str(backup_path))
                logger.warning("已备份损坏的数据库文件: %s → %s", str(db_path), str(backup_path))
        except Exception as backup_err:
            logger.error("备份损坏数据库失败: %s", str(backup_err))

        # 删除损坏的主文件、WAL 和 SHM
        for suffix in ("", "-wal", "-shm"):
            target = Path(str(db_path) + suffix)
            try:
                if target.exists():
                    target.unlink()
                    logger.info("已删除损坏文件: %s", str(target))
            except Exception as del_err:
                logger.error("删除损坏文件失败 (%s): %s", str(target), str(del_err))

        # 重置初始化标志
        _auth_storage_ready = False
        logger.warning("数据库损坏恢复完成，等待 schema 重建")


def _db_file_is_corrupted(db_path: Path) -> bool:
    """通过 PRAGMA quick_check 快速检测数据库文件是否损坏。"""
    try:
        if not db_path.exists():
            return False
        conn = sqlite3.connect(str(db_path), timeout=5)
        try:
            result = conn.execute("PRAGMA quick_check(1)").fetchone()
            is_bad = result is None or str(result[0]).lower() != "ok"
            if is_bad:
                logger.warning("quick_check 检测到数据库异常: %s", result)
            return is_bad
        finally:
            conn.close()
    except sqlite3.DatabaseError:
        return True
    except Exception:
        return False


# ─── 连接工厂 ───
def _try_connect(db_path: Path) -> sqlite3.Connection:
    """尝试连接数据库，执行基本 PRAGMA 设置。"""
    conn = sqlite3.connect(str(db_path), timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def _ensure_schema() -> None:
    """
    确保数据库表结构存在（幂等）。
    直接使用 _try_connect 建立连接，避免通过 _db_connection() 造成无限递归。
    """
    from .schema import init_auth_tables_sync

    conn = _try_connect(AUTH_DB_PATH)
    try:
        init_auth_tables_sync(conn)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    global _auth_storage_ready
    _auth_storage_ready = True
    logger.info("数据库 schema 重建完成: %s", str(AUTH_DB_PATH))


def _db_connection() -> sqlite3.Connection:
    """
    创建数据库连接。每次调用创建新连接，支持多线程并发访问。
    内置损坏自动检测与恢复：
      1. 检测到 malformed/corrupt → 备份 → 删除 → 重建 schema → 重试
      2. schema 未初始化 → 重建 → 重试
    """
    global _auth_storage_ready

    # 正常路径：schema 已就绪
    if _auth_storage_ready:
        try:
            return _try_connect(AUTH_DB_PATH)
        except sqlite3.DatabaseError as e:
            error_msg = str(e).lower()
            if "malformed" not in error_msg and "corrupt" not in error_msg:
                logger.error("数据库连接失败 (path=%s): %s", str(AUTH_DB_PATH), str(e))
                raise
            # 损坏：进入恢复流程（不 return，继续往下走）
            logger.error("数据库损坏检测 (path=%s): %s，启动自动恢复...", str(AUTH_DB_PATH), str(e))
            _auth_storage_ready = False
        except Exception as e:
            logger.error("数据库连接失败 (path=%s): %s", str(AUTH_DB_PATH), str(e))
            raise

    # 恢复路径：_auth_storage_ready == False（首次启动或损坏恢复后）
    # 检测并修复损坏文件（_attempt_db_recovery 内部有锁保护，防止并发恢复）
    if _db_file_is_corrupted(AUTH_DB_PATH):
        _attempt_db_recovery(AUTH_DB_PATH)

    # 重建 schema（CREATE TABLE IF NOT EXISTS 天然幂等）
    try:
        _ensure_schema()
    except Exception as e:
        logger.error("数据库 schema 重建失败: %s", str(e), exc_info=True)
        raise

    # 重试连接
    try:
        return _try_connect(AUTH_DB_PATH)
    except sqlite3.DatabaseError as e:
        logger.error("恢复后仍无法连接数据库 (path=%s): %s", str(AUTH_DB_PATH), str(e))
        raise


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
