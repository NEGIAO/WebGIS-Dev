"""
用户 CRUD、访客身份管理、用户指标记录。
"""

import sqlite3
from typing import Any, Dict, Optional

from .constants import _normalize_avatar_index
from .db import _db_connection, _iso, _utc_now
from .password import _hash_password


def _get_user_sync(username: str) -> Optional[Dict[str, Any]]:
    with _db_connection() as conn:
        row = conn.execute(
            "SELECT username, password_hash, role, avatar_index, created_at FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        return dict(row) if row else None


def _create_user_sync(username: str, password: str, avatar_index: int = 0) -> bool:
    created_at = _iso(_utc_now())
    password_hash = _hash_password(password)
    normalized_avatar_index = _normalize_avatar_index(avatar_index)

    try:
        with _db_connection() as conn:
            conn.execute(
                "INSERT INTO users (username, password_hash, role, avatar_index, created_at) VALUES (?, ?, 'registered', ?, ?)",
                (username, password_hash, normalized_avatar_index, created_at),
            )
            conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False


def _get_or_create_guest_username_sync(guest_uid: str) -> str:
    """
    获取或创建游客用户名。如果游客记录存在，返回其用户名；
    否则创建新记录并返回基于 ID 的用户名（如 'user_1'）。
    使用数据库事务和 UNIQUE 约束避免并发竞态。
    """
    with _db_connection() as conn:
        existing = conn.execute(
            "SELECT id, username FROM guest_identity_records WHERE guest_uid = ?",
            (guest_uid,),
        ).fetchone()

        if existing:
            return str(dict(existing).get("username") or "user")

        now_iso = _iso(_utc_now())
        try:
            cursor = conn.execute(
                """
                INSERT INTO guest_identity_records (
                    guest_uid,
                    username,
                    role,
                    visit_count,
                    first_seen_at,
                    last_seen_at
                ) VALUES (?, 'user_' || (SELECT COALESCE(MAX(id), 0) + 1 FROM guest_identity_records), 'guest', 0, ?, ?)
                """,
                (guest_uid, now_iso, now_iso),
            )
            conn.commit()
            row = conn.execute(
                "SELECT username FROM guest_identity_records WHERE guest_uid = ?",
                (guest_uid,),
            ).fetchone()
            return str(dict(row).get("username") or "user") if row else "user"
        except Exception:
            row = conn.execute(
                "SELECT username FROM guest_identity_records WHERE guest_uid = ?",
                (guest_uid,),
            ).fetchone()
            return str(dict(row).get("username") or "user") if row else "user"


def _ensure_user_metric_row_sync(conn: sqlite3.Connection, username: str) -> None:
    conn.execute(
        """
        INSERT INTO user_metrics (username, updated_at)
        VALUES (?, ?)
        ON CONFLICT(username) DO NOTHING
        """,
        (username, _iso(_utc_now())),
    )


def _record_login_sync(username: str) -> None:
    now_iso = _iso(_utc_now())

    with _db_connection() as conn:
        _ensure_user_metric_row_sync(conn, username)
        conn.execute(
            """
            UPDATE user_metrics
            SET login_count = login_count + 1,
                last_login_at = ?,
                updated_at = ?
            WHERE username = ?
            """,
            (now_iso, now_iso, username),
        )
        conn.commit()
