"""
Agent Chat 配额管理：检查、消耗、快照。
"""

from typing import Any, Dict, Optional

from api.auth import ROLE_ADMIN, normalize_role

from .constants import (
    AGENT_CHAT_GUEST_DAILY_QUOTA,
    AGENT_CHAT_REGISTERED_DAILY_QUOTA,
    logger,
)
from .db import _db_connection, _ensure_agent_chat_tables_sync, _get_agent_chat_quota_policy_sync
from .utils import _utc_date_str, _iso_now


def _get_agent_chat_daily_limit(role: str, username: str) -> Optional[int]:
    normalized_role = normalize_role(role, username)
    quota_policy = _get_agent_chat_quota_policy_sync()
    if normalized_role == ROLE_ADMIN:
        return None
    if normalized_role == "guest":
        return int(quota_policy.get("guest") or AGENT_CHAT_GUEST_DAILY_QUOTA)
    return int(quota_policy.get("registered") or AGENT_CHAT_REGISTERED_DAILY_QUOTA)


def _check_agent_chat_quota_sync(username: str, role: str, quota_subject: str) -> Dict[str, Any]:
    _ensure_agent_chat_tables_sync()

    normalized_role = normalize_role(role, username)
    normalized_subject = str(quota_subject or "").strip() or str(username or "").strip() or "unknown"
    usage_date = _utc_date_str()
    daily_limit = _get_agent_chat_daily_limit(role, username)

    if normalized_role == ROLE_ADMIN:
        return {
            "allowed": True,
            "limit": None,
            "used": 0,
            "remaining": None,
            "usage_date": usage_date,
            "quota_subject": normalized_subject,
        }

    used = 0
    try:
        with _db_connection() as conn:
            row = conn.execute(
                """
                SELECT calls FROM agent_chat_usage_daily
                WHERE quota_subject = ? AND usage_date = ?
                """,
                (normalized_subject, usage_date),
            ).fetchone()
        used = int((dict(row).get("calls") if row else 0) or 0)
    except Exception as e:
        logger.error(f"Failed to precheck quota for {username}: {e}")

    remaining = None if daily_limit is None else max(0, daily_limit - used)
    allowed = bool(daily_limit is None or used < daily_limit)

    return {
        "allowed": allowed,
        "limit": daily_limit,
        "used": used,
        "remaining": remaining,
        "usage_date": usage_date,
        "quota_subject": normalized_subject,
    }


def _consume_agent_chat_quota_sync(username: str, role: str, quota_subject: str) -> Dict[str, Any]:
    _ensure_agent_chat_tables_sync()

    normalized_role = normalize_role(role, username)
    normalized_subject = str(quota_subject or "").strip() or str(username or "").strip() or "unknown"
    usage_date = _utc_date_str()
    now_iso = _iso_now()

    daily_limit = _get_agent_chat_daily_limit(role, username)
    if normalized_role == ROLE_ADMIN:
        logger.debug(f"Admin {username} has unlimited quota")
        return {
            "allowed": True,
            "limit": None,
            "used": 0,
            "remaining": None,
            "usage_date": usage_date,
            "quota_subject": normalized_subject,
        }

    try:
        with _db_connection() as conn:
            row = conn.execute(
                """
                SELECT calls FROM agent_chat_usage_daily
                WHERE quota_subject = ? AND usage_date = ?
                """,
                (normalized_subject, usage_date),
            ).fetchone()

            used = int((dict(row).get("calls") if row else 0) or 0)
            if daily_limit is not None and used >= daily_limit:
                logger.warning(f"User {username} quota exceeded: {used}/{daily_limit}")
                return {
                    "allowed": False,
                    "limit": daily_limit,
                    "used": used,
                    "remaining": 0,
                    "usage_date": usage_date,
                    "quota_subject": normalized_subject,
                }

            conn.execute(
                """
                INSERT INTO agent_chat_usage_daily (quota_subject, role, usage_date, calls, updated_at)
                VALUES (?, ?, ?, 1, ?)
                ON CONFLICT(quota_subject, usage_date)
                DO UPDATE SET
                    role = excluded.role,
                    calls = agent_chat_usage_daily.calls + 1,
                    updated_at = excluded.updated_at
                """,
                (normalized_subject, normalized_role, usage_date, now_iso),
            )
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to consume quota for {username}: {e}")
        raise

    next_used = used + 1
    remaining = None if daily_limit is None else max(0, daily_limit - next_used)

    logger.debug(f"User {username} quota after consume: {next_used}/{daily_limit}")

    return {
        "allowed": True,
        "limit": daily_limit,
        "used": next_used,
        "remaining": remaining,
        "usage_date": usage_date,
        "quota_subject": normalized_subject,
    }


def _get_agent_chat_quota_snapshot_sync(username: str, role: str, quota_subject: str) -> Dict[str, Any]:
    _ensure_agent_chat_tables_sync()

    normalized_subject = str(quota_subject or "").strip() or str(username or "").strip() or "unknown"
    usage_date = _utc_date_str()
    daily_limit = _get_agent_chat_daily_limit(role, username)

    if normalize_role(role, username) == ROLE_ADMIN:
        logger.debug(f"Admin {username} quota snapshot: unlimited")
        return {
            "limit": None,
            "used": 0,
            "remaining": None,
            "usage_date": usage_date,
            "quota_subject": normalized_subject,
        }

    try:
        with _db_connection() as conn:
            row = conn.execute(
                """
                SELECT calls FROM agent_chat_usage_daily
                WHERE quota_subject = ? AND usage_date = ?
                """,
                (normalized_subject, usage_date),
            ).fetchone()

        used = int((dict(row).get("calls") if row else 0) or 0)
    except Exception as e:
        logger.error(f"Failed to get quota snapshot for {username}: {e}")
        used = 0

    remaining = None if daily_limit is None else max(0, daily_limit - used)

    logger.debug(f"User {username} quota snapshot: {used}/{daily_limit} remaining={remaining}")

    return {
        "limit": daily_limit,
        "used": used,
        "remaining": remaining,
        "usage_date": usage_date,
        "quota_subject": normalized_subject,
    }
