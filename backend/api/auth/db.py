"""
认证数据库路径解析、连接工厂、时间工具函数。
"""

import logging
import os
import sqlite3
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

# ─── 连接工厂 ───
def _db_connection() -> sqlite3.Connection:
    """创建数据库连接。每次调用创建新连接，支持多线程并发访问。"""
    try:
        conn = sqlite3.connect(str(AUTH_DB_PATH), timeout=15, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        # 启用 WAL 模式（每次连接设置，确保一致）
        conn.execute("PRAGMA journal_mode=WAL;")
        # 启用外键约束
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn
    except Exception as e:
        logger.error("数据库连接失败 (path=%s): %s", str(AUTH_DB_PATH), str(e))
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
