"""
system_config 表的读写操作。
"""

from .constants import _normalize_avatar_index
from .db import _db_connection, _iso, _utc_now


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
