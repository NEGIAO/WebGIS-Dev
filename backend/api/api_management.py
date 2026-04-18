"""
API 管理与调用统计模块 - 仅管理员可访问

功能：
1. 查看所有用户的 API 调用统计（按用户/按 API 类型）
2. 查看外部 API 的实时调用日志
3. 查看/配置各角色的 API 配额
4. API 调用趋势分析
"""

import asyncio
import logging
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from api.auth import (
    get_auth_db_connection,
    get_role_daily_quota,
    normalize_role,
    require_admin,
    ROLE_ADMIN,
    ROLE_REGISTERED,
    ROLE_GUEST,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["API Management"])


class ApiQuotaConfig(BaseModel):
    role: str = Field(..., description="角色: guest, registered, admin")
    daily_limit: Optional[int] = Field(None, description="每日限额, null 表示无限制")


class ApiUsageStats(BaseModel):
    username: str
    role: str
    date: str
    total_calls: int
    remaining_quota: Optional[int]


class ExternalApiLog(BaseModel):
    timestamp: str
    username: str
    role: str
    api_endpoint: str
    status_code: int
    response_time_ms: float


def _db_connection() -> sqlite3.Connection:
    return get_auth_db_connection()


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _utc_date_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _ensure_api_log_table_sync() -> None:
    """确保 API 调用日志表存在"""
    with _db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS api_call_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                username TEXT NOT NULL,
                role TEXT NOT NULL,
                api_endpoint TEXT NOT NULL,
                status_code INTEGER,
                response_time_ms REAL,
                request_params TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        # 为常用查询添加索引
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_api_logs_timestamp
            ON api_call_logs(timestamp DESC)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_api_logs_username
            ON api_call_logs(username)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint
            ON api_call_logs(api_endpoint)
            """
        )
        conn.commit()


def _record_api_call_sync(
    username: str,
    role: str,
    endpoint: str,
    status_code: int,
    response_time_ms: float,
    request_params: Optional[str] = None,
) -> None:
    """记录外部 API 调用"""
    _ensure_api_log_table_sync()
    
    with _db_connection() as conn:
        conn.execute(
            """
            INSERT INTO api_call_logs
            (timestamp, username, role, api_endpoint, status_code, response_time_ms, request_params)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                _iso_now(),
                username,
                role,
                endpoint,
                status_code,
                response_time_ms,
                request_params,
            ),
        )
        conn.commit()


def _get_api_usage_by_user_sync(days: int = 7, limit: int = 100) -> List[Dict[str, Any]]:
    """按用户查看 API 调用统计（最近 N 天）"""
    _ensure_api_log_table_sync()
    
    cutoff_time = datetime.now(timezone.utc) - timedelta(days=days)
    cutoff_iso = cutoff_time.isoformat()

    with _db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                username,
                role,
                COUNT(*) as call_count,
                COUNT(DISTINCT DATE(timestamp)) as active_days,
                AVG(CAST(response_time_ms AS FLOAT)) as avg_response_time_ms,
                MAX(timestamp) as last_called_at
            FROM api_call_logs
            WHERE timestamp > ?
            GROUP BY username, role
            ORDER BY call_count DESC, username ASC
            LIMIT ?
            """,
            (cutoff_iso, limit),
        ).fetchall()

    return [dict(row) for row in rows]


def _get_api_usage_by_endpoint_sync(days: int = 7, limit: int = 50) -> List[Dict[str, Any]]:
    """按 API 端点查看调用统计"""
    _ensure_api_log_table_sync()
    
    cutoff_time = datetime.now(timezone.utc) - timedelta(days=days)
    cutoff_iso = cutoff_time.isoformat()

    with _db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                api_endpoint,
                COUNT(*) as call_count,
                SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count,
                AVG(CAST(response_time_ms AS FLOAT)) as avg_response_time_ms,
                MAX(response_time_ms) as max_response_time_ms,
                MIN(response_time_ms) as min_response_time_ms
            FROM api_call_logs
            WHERE timestamp > ?
            GROUP BY api_endpoint
            ORDER BY call_count DESC
            LIMIT ?
            """,
            (cutoff_iso, limit),
        ).fetchall()

    return [dict(row) for row in rows]


def _get_api_logs_sync(
    limit: int = 500,
    offset: int = 0,
    username_filter: Optional[str] = None,
    endpoint_filter: Optional[str] = None,
    days: int = 7,
) -> List[Dict[str, Any]]:
    """获取 API 调用日志"""
    _ensure_api_log_table_sync()
    
    cutoff_time = datetime.now(timezone.utc) - timedelta(days=days)
    cutoff_iso = cutoff_time.isoformat()

    where_clauses = ["timestamp > ?"]
    params = [cutoff_iso]

    if username_filter:
        safe_filter = str(username_filter).strip()
        where_clauses.append("username LIKE ?")
        params.append(f"%{safe_filter}%")

    if endpoint_filter:
        safe_filter = str(endpoint_filter).strip()
        where_clauses.append("api_endpoint LIKE ?")
        params.append(f"%{safe_filter}%")

    where_sql = " AND ".join(where_clauses)
    safe_limit = max(1, min(int(limit), 1000))
    safe_offset = max(0, int(offset))

    with _db_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                timestamp,
                username,
                role,
                api_endpoint,
                status_code,
                response_time_ms
            FROM api_call_logs
            WHERE {where_sql}
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?
            """,
            params + [safe_limit, safe_offset],
        ).fetchall()

    return [dict(row) for row in rows]


def _get_api_quota_summary_sync() -> Dict[str, Any]:
    """获取当前配额配置摘要"""
    return {
        "guest": {
            "role": ROLE_GUEST,
            "daily_limit": get_role_daily_quota(ROLE_GUEST),
        },
        "registered": {
            "role": ROLE_REGISTERED,
            "daily_limit": get_role_daily_quota(ROLE_REGISTERED),
        },
        "admin": {
            "role": ROLE_ADMIN,
            "daily_limit": get_role_daily_quota(ROLE_ADMIN),
        },
    }


def _get_user_today_usage_sync(username: str) -> Dict[str, Any]:
    """获取用户今日的 API 调用统计"""
    today = _utc_date_str()

    with _db_connection() as conn:
        usage_row = conn.execute(
            """
            SELECT calls FROM api_usage_daily
            WHERE username = ? AND usage_date = ?
            """,
            (username, today),
        ).fetchone()

        user_row = conn.execute(
            "SELECT role FROM users WHERE username = ?",
            (username,),
        ).fetchone()

    calls = int((dict(usage_row).get("calls") if usage_row else 0) or 0)
    role = str((dict(user_row).get("role") if user_row else "") or "registered")
    normalized_role = normalize_role(role, username)
    daily_limit = get_role_daily_quota(normalized_role)
    remaining = None if daily_limit is None else max(0, daily_limit - calls)

    return {
        "username": username,
        "role": normalized_role,
        "today": today,
        "used": calls,
        "limit": daily_limit,
        "remaining": remaining,
    }


# ==================== 管理员 API 端点 ====================


@router.get("/api-management/usage/by-user")
async def get_api_usage_by_user(
    days: int = Query(7, ge=1, le=90, description="统计天数"),
    limit: int = Query(100, ge=1, le=500, description="返回用户数"),
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """获取所有用户的 API 调用统计（按用户排序）"""
    stats = await asyncio.to_thread(_get_api_usage_by_user_sync, days, limit)
    return {
        "status": "success",
        "data": stats,
        "period_days": days,
        "total_records": len(stats),
    }


@router.get("/api-management/usage/by-endpoint")
async def get_api_usage_by_endpoint(
    days: int = Query(7, ge=1, le=90, description="统计天数"),
    limit: int = Query(50, ge=1, le=200, description="返回端点数"),
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """获取所有 API 端点的调用统计"""
    stats = await asyncio.to_thread(_get_api_usage_by_endpoint_sync, days, limit)
    return {
        "status": "success",
        "data": stats,
        "period_days": days,
        "total_records": len(stats),
    }


@router.get("/api-management/logs")
async def get_api_logs(
    limit: int = Query(500, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    username: Optional[str] = Query(None, description="按用户名过滤"),
    endpoint: Optional[str] = Query(None, description="按 API 端点过滤"),
    days: int = Query(7, ge=1, le=90),
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """获取 API 调用日志（支持过滤和分页）"""
    logs = await asyncio.to_thread(
        _get_api_logs_sync,
        limit,
        offset,
        username,
        endpoint,
        days,
    )
    return {
        "status": "success",
        "data": logs,
        "pagination": {
            "limit": limit,
            "offset": offset,
            "total_records": len(logs),
        },
    }


@router.get("/api-management/quota-config")
async def get_quota_config(
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """获取当前配额配置"""
    config = await asyncio.to_thread(_get_api_quota_summary_sync)
    return {
        "status": "success",
        "data": config,
        "note": "配额通过环境变量配置，如需修改请编辑后端环境变量后重启",
    }


@router.get("/api-management/user/{username}/today-usage")
async def get_user_today_usage(
    username: str,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """获取指定用户今日的 API 使用情况"""
    usage = await asyncio.to_thread(_get_user_today_usage_sync, username)
    return {
        "status": "success",
        "data": usage,
    }


# ==================== 导出函数供外部模块调用 ====================


async def record_api_call(
    username: str,
    role: str,
    endpoint: str,
    status_code: int,
    response_time_ms: float,
    request_params: Optional[str] = None,
) -> None:
    """异步记录 API 调用（供外部模块使用）"""
    await asyncio.to_thread(
        _record_api_call_sync,
        username,
        role,
        endpoint,
        status_code,
        response_time_ms,
        request_params,
    )
