"""
用户 CRUD、访客身份管理、用户指标记录。
"""

import re
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
            SELECT id, username, display_name, password_hash, role, avatar_index, avatar_url, email, email_verified, created_at
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
            SELECT id, username, display_name, password_hash, role, avatar_index, avatar_url, email, email_verified, created_at
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


def _guest_username_from_uid(guest_uid: str) -> str:
    """由 guest_uid 派生稳定用户名，避免 MAX(id)+1 并发撞名。"""
    uid = str(guest_uid or "").strip()
    if not uid:
        return "guest_anon"
    # guest_uid 形如 guest_{hex16}；压成合法用户名字符并截断
    compact = re.sub(r"[^A-Za-z0-9_]", "", uid)[:24]
    return compact or "guest_anon"


def _get_or_create_guest_username_sync(guest_uid: str) -> Dict[str, Any]:
    """
    获取或创建游客记录，返回用户名与展示序号。

    - username：由 guest_uid 确定性派生（同设备恒同、不同设备不撞名）；
    - no：guest_identity_records.id 自增列，即该游客在库内的真序号，
      登录 payload 以 guest_no 回传，前端展示为 guest_<no>。
    """
    resolved = _guest_username_from_uid(guest_uid)
    now_iso = _iso(_utc_now())

    with _db_connection() as conn:
        existing = conn.execute(
            "SELECT id, username FROM guest_identity_records WHERE guest_uid = ?",
            (guest_uid,),
        ).fetchone()
        if existing:
            row = dict(existing)
            return {"username": str(row.get("username") or resolved), "no": int(row.get("id") or 0)}

        try:
            conn.execute(
                """
                INSERT INTO guest_identity_records (
                    guest_uid,
                    username,
                    role,
                    visit_count,
                    first_seen_at,
                    last_seen_at
                ) VALUES (?, ?, 'guest', 0, ?, ?)
                ON CONFLICT(guest_uid) DO UPDATE SET
                    last_seen_at = excluded.last_seen_at
                """,
                (guest_uid, resolved, now_iso, now_iso),
            )
            conn.commit()
        except Exception:
            pass

        row = conn.execute(
            "SELECT id, username FROM guest_identity_records WHERE guest_uid = ?",
            (guest_uid,),
        ).fetchone()
        if row:
            data = dict(row)
            return {"username": str(data.get("username") or resolved), "no": int(data.get("id") or 0)}
        return {"username": resolved, "no": 0}


def _get_guest_no_sync(guest_uid: str) -> int:
    """
    按 guest_uid 查游客展示序号（guest_identity_records.id 自增真序号）。
    记录不存在返回 0，由调用方兜底（如按 username 再查或取 0）。
    """
    normalized = str(guest_uid or "").strip()
    if not normalized:
        return 0
    with _db_connection() as conn:
        row = conn.execute(
            "SELECT id FROM guest_identity_records WHERE guest_uid = ?",
            (normalized,),
        ).fetchone()
        if not row:
            return 0
        return int(dict(row).get("id") or 0)


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
