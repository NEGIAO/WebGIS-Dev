"""
用户 CRUD、访客身份管理、用户指标记录。
"""

import secrets
import sqlite3
from typing import Any, Dict, Optional

from .constants import (
    _normalize_avatar_index,
    _normalize_display_name,
    _safe_username_for_path,
)
from .db import _db_connection, _iso, _utc_now
from .password import _hash_password


def _get_user_sync(username: str) -> Optional[Dict[str, Any]]:
    with _db_connection() as conn:
        row = conn.execute(
            """
            SELECT id, username, display_name, password_hash, role, avatar_index, email, email_verified, created_at
            FROM users
            WHERE username = ?
            """,
            (username,),
        ).fetchone()
        return dict(row) if row else None


def _get_user_by_id_sync(user_id: int) -> Optional[Dict[str, Any]]:
    with _db_connection() as conn:
        row = conn.execute(
            """
            SELECT id, username, display_name, password_hash, role, avatar_index, email, email_verified, created_at
            FROM users
            WHERE id = ?
            """,
            (int(user_id),),
        ).fetchone()
        return dict(row) if row else None


def _generate_account_username_sync(conn, email: str, display_name: str) -> str:
    """为邮箱账号生成内部兼容 username，避免昵称重复影响历史关联键。"""
    local_part = str(email or "").split("@", 1)[0]
    base = _safe_username_for_path(display_name or local_part or "user").lower()
    if len(base) < 3:
        base = f"user_{base}"
    base = base[:18].strip("._-") or "user"

    for index in range(20):
        suffix = secrets.token_hex(3) if index == 0 else secrets.token_hex(4)
        candidate = f"{base}_{suffix}"[:24]
        row = conn.execute("SELECT 1 FROM users WHERE username = ?", (candidate,)).fetchone()
        if row is None:
            return candidate

    return f"user_{secrets.token_hex(9)}"[:24]


def _create_user_sync(
    username: str,
    password: str,
    avatar_index: int = 0,
    email: str = "",
    email_verified: int = 0,
    display_name: str = "",
) -> str:
    """
    创建注册用户。

    参数：
    - username: 兼容用户名，为空时自动生成内部键
    - password: 明文密码（内部自动哈希）
    - avatar_index: 头像索引
    - email: 绑定邮箱（可为空）
    - email_verified: 邮箱是否已验证（0/1）

    返回：
    - "ok" 创建成功
    - "username_taken" 用户名已存在
    - "email_taken" 邮箱已被绑定
    """
    created_at = _iso(_utc_now())
    password_hash = _hash_password(password)
    normalized_avatar_index = _normalize_avatar_index(avatar_index)
    normalized_email = email.lower().strip() if email else ""
    normalized_display_name = _normalize_display_name(display_name or username or normalized_email.split("@", 1)[0])

    try:
        with _db_connection() as conn:
            resolved_username = str(username or "").strip()
            if not resolved_username:
                resolved_username = _generate_account_username_sync(conn, normalized_email, normalized_display_name)

            conn.execute(
                """
                INSERT INTO users (
                    username,
                    display_name,
                    password_hash,
                    role,
                    avatar_index,
                    email,
                    email_verified,
                    created_at
                )
                VALUES (?, ?, ?, 'registered', ?, ?, ?, ?)
                """,
                (
                    resolved_username,
                    normalized_display_name,
                    password_hash,
                    normalized_avatar_index,
                    normalized_email,
                    email_verified,
                    created_at,
                ),
            )
            conn.commit()
        return "ok"
    except sqlite3.IntegrityError as e:
        error_msg = str(e).lower()
        if "email" in error_msg:
            return "email_taken"
        return "username_taken"


def _update_user_display_name_sync(username: str, display_name: str) -> Optional[Dict[str, Any]]:
    """更新注册用户昵称并返回最新用户记录。"""
    normalized_display_name = _normalize_display_name(display_name)
    with _db_connection() as conn:
        cursor = conn.execute(
            "UPDATE users SET display_name = ? WHERE username = ?",
            (normalized_display_name, username),
        )
        conn.commit()
        if int(cursor.rowcount or 0) <= 0:
            return None

    return _get_user_sync(username)


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
