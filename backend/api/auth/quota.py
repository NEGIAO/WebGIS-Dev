"""
API 配额追踪：消耗、快照查询。
"""

from typing import Any, Dict, Optional

from .constants import ROLE_ADMIN, get_role_daily_quota, normalize_role
from .db import _db_connection, _iso, _utc_date_str, _utc_now
from .user import _ensure_user_metric_row_sync


def _consume_api_quota_sync(
    username: str,
    role: str,
    quota_subject: Optional[str] = None,
) -> Dict[str, Any]:
    normalized_role = normalize_role(role, username)
    resolved_quota_subject = str(quota_subject or "").strip() or str(username or "").strip() or "unknown"

    # 管理员不受配额限制
    if normalized_role == ROLE_ADMIN:
        return {
            "allowed": True,
            "limit": None,
            "used": 0,
            "remaining": None,
            "usage_date": _utc_date_str(),
            "quota_subject": resolved_quota_subject,
        }

    daily_limit = get_role_daily_quota(normalized_role)
    usage_date = _utc_date_str()
    now_iso = _iso(_utc_now())

    with _db_connection() as conn:
        # 原子递增：先插入或更新配额计数，再读取结果
        # 使用单条 SQL 的 ON CONFLICT DO UPDATE 保证原子性
        conn.execute(
            """
            INSERT INTO api_usage_daily (username, role, usage_date, calls, updated_at)
            VALUES (?, ?, ?, 1, ?)
            ON CONFLICT(username, usage_date)
            DO UPDATE SET
                role = excluded.role,
                calls = api_usage_daily.calls + 1,
                updated_at = excluded.updated_at
            """,
            (resolved_quota_subject, normalized_role, usage_date, now_iso),
        )

        # 读取递增后的实际值，用于配额判断
        row = conn.execute(
            "SELECT calls FROM api_usage_daily WHERE username = ? AND usage_date = ?",
            (resolved_quota_subject, usage_date),
        ).fetchone()
        current_used = int((dict(row).get("calls") if row else 0) or 0)

        # 如果超限，回滚递增操作
        if daily_limit is not None and current_used > daily_limit:
            conn.execute(
                "UPDATE api_usage_daily SET calls = calls - 1 WHERE username = ? AND usage_date = ?",
                (resolved_quota_subject, usage_date),
            )
            conn.commit()
            return {
                "allowed": False,
                "limit": daily_limit,
                "used": current_used - 1,
                "remaining": 0,
                "usage_date": usage_date,
                "quota_subject": resolved_quota_subject,
            }

        _ensure_user_metric_row_sync(conn, username)
        conn.execute(
            """
            UPDATE user_metrics
            SET total_api_calls = total_api_calls + 1,
                updated_at = ?
            WHERE username = ?
            """,
            (now_iso, username),
        )
        conn.commit()

    remaining = None if daily_limit is None else max(0, daily_limit - current_used)

    return {
        "allowed": True,
        "limit": daily_limit,
        "used": current_used,
        "remaining": remaining,
        "usage_date": usage_date,
        "quota_subject": resolved_quota_subject,
    }


def get_user_quota_snapshot_sync(
    username: str,
    role: str,
    quota_subject: Optional[str] = None,
) -> Dict[str, Any]:
    normalized_role = normalize_role(role, username)
    resolved_quota_subject = str(quota_subject or "").strip() or str(username or "").strip() or "unknown"
    usage_date = _utc_date_str()
    daily_limit = get_role_daily_quota(normalized_role)

    with _db_connection() as conn:
        row = conn.execute(
            "SELECT calls FROM api_usage_daily WHERE username = ? AND usage_date = ?",
            (resolved_quota_subject, usage_date),
        ).fetchone()

    used = int((dict(row).get("calls") if row else 0) or 0)
    remaining = None if daily_limit is None else max(0, daily_limit - used)

    return {
        "limit": daily_limit,
        "used": used,
        "remaining": remaining,
        "usage_date": usage_date,
        "quota_subject": resolved_quota_subject,
    }
