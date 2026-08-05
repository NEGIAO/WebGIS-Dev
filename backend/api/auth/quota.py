"""
API 配额追踪：消耗、快照查询。

配额模型：统一的每日 API 额度池，不同操作消耗不同权重。
  - 普通 API 调用：消耗 1
  - Agent 对话：消耗 1
  - 底图下载：消耗 = ceil(tile_count / tiles_per_unit)

管理员不受配额限制。
"""

from typing import Any, Dict, Optional

from .constants import ROLE_ADMIN, get_role_daily_quota, normalize_role
from .db import _db_connection, _iso, _utc_date_str, _utc_now
from .user import _ensure_user_metric_row_sync

# 默认每份额度可下载的瓦片数（L2 配置，管理员可调）
DEFAULT_TILES_PER_UNIT = 100


def _get_tiles_per_unit() -> int:
    """从 L2 system_config 读取每额度瓦片数，默认 100"""
    try:
        from .system_config import _get_system_config_value_sync
        raw = _get_system_config_value_sync("download_tiles_per_unit", "")
        if raw:
            value = int(raw)
            if value > 0:
                return value
    except (ValueError, TypeError, Exception):
        pass
    return DEFAULT_TILES_PER_UNIT


def estimate_download_cost(tile_count: int) -> int:
    """根据瓦片数估算所需额度（tile_count<=0 返回 0，表示仅查询不消耗）"""
    if tile_count <= 0:
        return 0
    tiles_per_unit = _get_tiles_per_unit()
    return max(1, (tile_count + tiles_per_unit - 1) // tiles_per_unit)


def _consume_api_quota_sync(
    username: str,
    role: str,
    quota_subject: Optional[str] = None,
    cost: int = 1,
    action: str = "api_call",
) -> Dict[str, Any]:
    """消耗 API 配额（支持不同操作消耗不同权重）

    Args:
        username: 用户名
        role: 用户角色
        quota_subject: 配额主体（默认同 username）
        cost: 本次消耗额度（默认 1）
        action: 操作类型（api_call / agent / download），仅用于日志追踪，不影响扣减逻辑
    """
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
        # 原子递增 + 超限检查：使用单条 SQL 避免 TOCTOU 竞争
        # 先尝试递增，再通过 RETURNING 子句读取当前值（SQLite 3.35+ 支持 RETURNING）
        row = conn.execute(
            """
            INSERT INTO api_usage_daily (username, role, usage_date, calls, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(username, usage_date)
            DO UPDATE SET
                role = excluded.role,
                calls = api_usage_daily.calls + ?,
                updated_at = excluded.updated_at
            RETURNING calls
            """,
            (resolved_quota_subject, normalized_role, usage_date, cost, now_iso, cost),
        ).fetchone()
        current_used = int((dict(row).get("calls") if row else 0) or 0)

        # 如果超限，回滚递增操作
        if daily_limit is not None and current_used > daily_limit:
            conn.execute(
                "UPDATE api_usage_daily SET calls = calls - ? WHERE username = ? AND usage_date = ?",
                (cost, resolved_quota_subject, usage_date),
            )
            conn.commit()
            return {
                "allowed": False,
                "limit": daily_limit,
                "used": current_used - cost,
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


def _refund_api_quota_sync(
    username: str,
    role: str,
    amount: int,
    quota_subject: Optional[str] = None,
) -> None:
    """退还 API 配额（用于下载失败/取消时退回预扣额度）

    与 _consume_api_quota_sync 的回滚逻辑保持一致：
    UPDATE ... SET calls = MAX(0, calls - amount)
    """
    if amount <= 0:
        return
    resolved_subject = str(quota_subject or "").strip() or str(username or "").strip() or "unknown"
    usage_date = _utc_date_str()
    now_iso = _iso(_utc_now())
    with _db_connection() as conn:
        conn.execute(
            """
            UPDATE api_usage_daily
            SET calls = MAX(0, calls - ?),
                updated_at = ?
            WHERE username = ? AND usage_date = ?
            """,
            (amount, now_iso, resolved_subject, usage_date),
        )
        conn.commit()
