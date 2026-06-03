"""
会话管理：创建、读取、删除会话，用户密码/头像更新。
"""

import secrets
from datetime import timedelta
from typing import Any, Dict, Optional

from .constants import (
    SESSION_EXPIRE_HOURS,
    _normalize_avatar_index,
    _normalize_guest_device_id,
    normalize_role,
)
from .db import _db_connection, _iso, _safe_parse_iso, _utc_now
from .password import _hash_password
from .user import _ensure_user_metric_row_sync


def _apply_logout_duration_sync(
    conn,
    username: str,
    session_created_at_text: str,
    logout_at,
) -> None:
    created_dt = _safe_parse_iso(session_created_at_text)
    if created_dt is None:
        return

    seconds = max(0, int((logout_at - created_dt).total_seconds()))
    now_iso = _iso(logout_at)

    _ensure_user_metric_row_sync(conn, username)
    conn.execute(
        """
        UPDATE user_metrics
        SET total_login_seconds = total_login_seconds + ?,
            last_logout_at = ?,
            updated_at = ?
        WHERE username = ?
        """,
        (seconds, now_iso, now_iso, username),
    )


def _create_session_sync(
    username: str,
    role: str,
    ip: str,
    user_agent: str,
    guest_uid: str = "",
    guest_device_id: str = "",
) -> Dict[str, Any]:
    now = _utc_now()
    expires_at = now + timedelta(hours=SESSION_EXPIRE_HOURS)
    token = secrets.token_urlsafe(32)
    resolved_role = normalize_role(role, username)

    with _db_connection() as conn:
        conn.execute(
            """
            INSERT INTO sessions (
                token,
                username,
                role,
                guest_uid,
                guest_device_id,
                ip,
                user_agent,
                created_at,
                expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                token,
                username,
                resolved_role,
                str(guest_uid or "").strip(),
                _normalize_guest_device_id(guest_device_id),
                ip,
                user_agent,
                _iso(now),
                _iso(expires_at),
            ),
        )
        conn.commit()

    return {
        "token": token,
        "username": username,
        "role": resolved_role,
        "guest_uid": str(guest_uid or "").strip(),
        "guest_device_id": _normalize_guest_device_id(guest_device_id),
        "created_at": _iso(now),
        "expires_at": _iso(expires_at),
    }


def _get_session_sync(token: str) -> Optional[Dict[str, Any]]:
    with _db_connection() as conn:
        row = conn.execute(
            """
            SELECT token, username, role, guest_uid, guest_device_id, ip, user_agent, created_at, expires_at
            FROM sessions
            WHERE token = ?
            """,
            (token,),
        ).fetchone()

        if row is None:
            return None

        data = dict(row)
        now = _utc_now()
        expires_at = _safe_parse_iso(str(data.get("expires_at") or ""))
        if expires_at is None or expires_at <= now:
            _apply_logout_duration_sync(
                conn,
                str(data.get("username") or ""),
                str(data.get("created_at") or ""),
                now,
            )
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
            return None

        old_role = str(data.get("role") or "")
        resolved_role = normalize_role(old_role, str(data.get("username") or ""))
        data["role"] = resolved_role
        if old_role != resolved_role:
            conn.execute(
                "UPDATE sessions SET role = ? WHERE token = ?",
                (resolved_role, token),
            )
            conn.commit()

        return data


def _delete_session_sync(token: str) -> None:
    now = _utc_now()

    with _db_connection() as conn:
        row = conn.execute(
            "SELECT username, created_at FROM sessions WHERE token = ?",
            (token,),
        ).fetchone()
        if row is None:
            return

        data = dict(row)
        _apply_logout_duration_sync(
            conn,
            str(data.get("username") or ""),
            str(data.get("created_at") or ""),
            now,
        )
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()


def _delete_sessions_by_username_sync(username: str) -> None:
    now = _utc_now()

    with _db_connection() as conn:
        rows = conn.execute(
            "SELECT token, username, created_at FROM sessions WHERE username = ?",
            (username,),
        ).fetchall()

        for row in rows:
            data = dict(row)
            _apply_logout_duration_sync(
                conn,
                str(data.get("username") or ""),
                str(data.get("created_at") or ""),
                now,
            )

        conn.execute("DELETE FROM sessions WHERE username = ?", (username,))
        conn.commit()


def _update_user_password_sync(username: str, new_password: str) -> bool:
    next_password_hash = _hash_password(new_password)

    with _db_connection() as conn:
        cursor = conn.execute(
            "UPDATE users SET password_hash = ? WHERE username = ?",
            (next_password_hash, username),
        )
        conn.commit()
        return int(cursor.rowcount or 0) > 0


def _update_user_avatar_index_sync(username: str, avatar_index: int) -> bool:
    normalized_avatar_index = _normalize_avatar_index(avatar_index)

    with _db_connection() as conn:
        cursor = conn.execute(
            "UPDATE users SET avatar_index = ? WHERE username = ?",
            (normalized_avatar_index, username),
        )
        conn.commit()
        return int(cursor.rowcount or 0) > 0


def _get_user_by_email_sync(email: str) -> Optional[Dict[str, Any]]:
    """
    通过邮箱查询用户信息。

    参数：
    - email: 邮箱地址

    返回：
    - 用户字典（username, password_hash, role, avatar_index, email, email_verified, created_at），未找到返回 None
    """
    normalized_email = email.lower().strip()
    with _db_connection() as conn:
        row = conn.execute(
            "SELECT username, password_hash, role, avatar_index, email, email_verified, created_at FROM users WHERE email = ?",
            (normalized_email,),
        ).fetchone()
        return dict(row) if row else None


def _check_email_taken_sync(email: str) -> bool:
    """
    检查邮箱是否已被其他用户绑定。

    参数：
    - email: 邮箱地址

    返回：
    - True 已被占用，False 可用
    """
    normalized_email = email.lower().strip()
    if not normalized_email:
        return False
    with _db_connection() as conn:
        row = conn.execute(
            "SELECT id FROM users WHERE email = ? AND email != ''",
            (normalized_email,),
        ).fetchone()
        return row is not None


def _update_user_password_by_email_sync(email: str, new_password: str) -> bool:
    """
    通过邮箱更新用户密码（用于密码重置流程）。

    参数：
    - email: 用户绑定的邮箱
    - new_password: 新的明文密码（内部自动哈希）

    返回：
    - True 更新成功，False 未找到用户或更新失败
    """
    normalized_email = email.lower().strip()
    password_hash = _hash_password(new_password)

    try:
        with _db_connection() as conn:
            cursor = conn.execute(
                "UPDATE users SET password_hash = ? WHERE email = ? AND email != ''",
                (password_hash, normalized_email),
            )
            conn.commit()
            return cursor.rowcount > 0
    except Exception:
        return False


def _update_user_email_sync(username: str, email: str, email_verified: int = 1) -> bool:
    """
    更新用户的绑定邮箱。

    参数：
    - username: 用户名
    - email: 新邮箱地址
    - email_verified: 是否已验证（默认 1）

    返回：
    - True 更新成功，False 更新失败
    """
    normalized_email = email.lower().strip()
    try:
        with _db_connection() as conn:
            conn.execute(
                "UPDATE users SET email = ?, email_verified = ? WHERE username = ?",
                (normalized_email, email_verified, username),
            )
            conn.commit()
            return True
    except Exception:
        return False


def _delete_sessions_by_email_sync(email: str) -> None:
    """
    通过邮箱查找用户并注销该账号全部会话（用于密码重置后安全注销）。

    参数：
    - email: 用户绑定的邮箱
    """
    user = _get_user_by_email_sync(email)
    if user:
        _delete_sessions_by_username_sync(str(user.get("username", "")))
