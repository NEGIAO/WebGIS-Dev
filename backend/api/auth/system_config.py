"""
system_config 表的读写操作。
"""

from .constants import _normalize_avatar_index
from .db import _db_connection, _iso, _utc_now

__all__ = [
    "_get_system_config_value_sync",
    "_set_system_config_value_sync",
    "_set_admin_avatar_index_sync",
    "_get_admin_avatar_index_sync",
    "_get_default_basemap_index_sync",
    "_set_default_basemap_index_sync",
]


def _get_system_config_value_sync(key: str, default: str = "") -> str:
    with _db_connection() as conn:
        row = conn.execute(
            "SELECT value FROM system_config WHERE key = ?",
            (str(key or "").strip(),),
        ).fetchone()

    if not row:
        return str(default or "")
    return str(dict(row).get("value") or default or "")


def _set_system_config_value_sync(key: str, value: str) -> None:
    now_iso = _iso(_utc_now())
    with _db_connection() as conn:
        conn.execute(
            """
            INSERT INTO system_config (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key)
            DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            """,
            (str(key or "").strip(), str(value or ""), now_iso),
        )
        conn.commit()


def _set_admin_avatar_index_sync(new_avatar_index: int) -> int:
    normalized = _normalize_avatar_index(new_avatar_index)
    _set_system_config_value_sync("admin_avatar_index", str(normalized))
    return normalized


def _get_admin_avatar_index_sync() -> int:
    """读取管理员头像索引，缺省保持原有 admin 头像 1。"""
    return _normalize_avatar_index(_get_system_config_value_sync("admin_avatar_index", "1"))


def _get_default_basemap_index_sync() -> int | None:
    """从 system_config 读取默认底图索引，无记录返回 None"""
    raw = _get_system_config_value_sync("default_basemap_index", "")
    if not raw:
        return None
    try:
        return int(raw)
    except (ValueError, TypeError):
        return None


def _set_default_basemap_index_sync(index: int) -> None:
    """将默认底图索引写入 system_config 表"""
    _set_system_config_value_sync("default_basemap_index", str(index))
