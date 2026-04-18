"""
访客统计、用户中心数据、公告与留言模块。
"""

import asyncio
import logging
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
import pytz
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from api.auth import (
    get_auth_db_connection,
    get_user_quota_snapshot_sync,
    normalize_role,
    require_admin,
    require_api_access,
    require_login,
)

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

IPAPI_ENDPOINT = "https://ipapi.co"
SHANGHAI_TZ = pytz.timezone("Asia/Shanghai")
HTTP_CLIENT_TIMEOUT = httpx.Timeout(connect=3.0, read=8.0, write=8.0, pool=3.0)
HTTP_CLIENT_LIMITS = httpx.Limits(max_connections=100, max_keepalive_connections=50)


class VisitLogResponse(BaseModel):
    status: str
    message: str
    data: Optional[dict] = None


class UserMessageCreateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=500)


class DismissAnnouncementRequest(BaseModel):
    announcement_id: int = Field(..., ge=1)


class SupabaseClient:
    """可选的 Supabase 异步写入客户端（失败不影响主流程）。"""

    def __init__(self, url: str, key: str):
        self.url = str(url or "").strip()
        self.key = str(key or "").strip()
        self.table_name = "user_visits"

    async def insert(self, data: dict) -> bool:
        if not self.url or not self.key:
            return False

        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
        endpoint = f"{self.url}/rest/v1/{self.table_name}"

        try:
            async with httpx.AsyncClient(
                timeout=HTTP_CLIENT_TIMEOUT,
                limits=HTTP_CLIENT_LIMITS,
            ) as client:
                response = await client.post(endpoint, json=data, headers=headers)
                return response.status_code in (200, 201)
        except Exception as exc:
            logger.warning("Supabase 写入失败: %s", str(exc))
            return False


def _db_connection() -> sqlite3.Connection:
    return get_auth_db_connection()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _safe_parse_iso(text: str) -> Optional[datetime]:
    try:
        parsed = datetime.fromisoformat(str(text or ""))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def extract_client_ip(request: Request) -> str:
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()

    x_real_ip = request.headers.get("X-Real-IP")
    if x_real_ip:
        return x_real_ip

    return request.client.host if request.client else "unknown"


async def fetch_geolocation(ip: str) -> Optional[dict]:
    endpoint = f"{IPAPI_ENDPOINT}/{ip}/json/"

    try:
        async with httpx.AsyncClient(
            timeout=HTTP_CLIENT_TIMEOUT,
            limits=HTTP_CLIENT_LIMITS,
        ) as client:
            response = await client.get(
                endpoint,
                headers={"User-Agent": "WebGIS-Backend/1.0"},
            )

        if response.status_code != 200:
            logger.warning("ipapi.co 返回非 200 状态: %s", response.status_code)
            return None

        data = response.json()
        return {
            "ip": data.get("ip", ip),
            "city": data.get("city", "Unknown"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
        }
    except Exception as exc:
        logger.warning("获取地理位置失败 (IP=%s): %s", ip, str(exc))
        return None


def get_current_shanghai_time() -> str:
    now_shanghai = datetime.now(SHANGHAI_TZ)
    return now_shanghai.strftime("%Y-%m-%d %H:%M:%S")


def _get_admin_contact_sync() -> str:
    with _db_connection() as conn:
        row = conn.execute(
            "SELECT value FROM system_config WHERE key = 'admin_contact'"
        ).fetchone()

    if row is None:
        return "管理员联系方式：请联系系统管理员"

    return str(dict(row).get("value") or "管理员联系方式：请联系系统管理员")


def _normalize_avatar_index(raw_avatar_index: Any) -> int:
    try:
        value = int(raw_avatar_index)
    except Exception:
        return 0

    if value < 0:
        return 0

    if value > 11:
        return 11

    return value


def _get_user_avatar_index_sync(username: str, role: str) -> int:
    lowered_username = str(username or "").strip().lower()
    lowered_role = str(role or "").strip().lower()

    if lowered_username == "admin" or lowered_role == "admin":
        return 1

    if lowered_username == "user" or lowered_role == "guest":
        return 0

    with _db_connection() as conn:
        row = conn.execute(
            "SELECT avatar_index FROM users WHERE username = ?",
            (username,),
        ).fetchone()

    return _normalize_avatar_index((dict(row) if row else {}).get("avatar_index"))


def _record_visit_sync(username: str, visit_record: Dict[str, Any]) -> None:
    now_iso = _iso(_utc_now())

    with _db_connection() as conn:
        conn.execute(
            """
            INSERT INTO user_visits (
                username,
                ip,
                city,
                latitude,
                longitude,
                visit_time,
                user_agent,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                username,
                str(visit_record.get("ip") or "unknown"),
                str(visit_record.get("city") or "Unknown"),
                visit_record.get("latitude"),
                visit_record.get("longitude"),
                str(visit_record.get("visit_time") or get_current_shanghai_time()),
                str(visit_record.get("user_agent") or "Unknown"),
                now_iso,
            ),
        )

        conn.execute(
            """
            INSERT INTO user_metrics (username, updated_at)
            VALUES (?, ?)
            ON CONFLICT(username) DO NOTHING
            """,
            (username, now_iso),
        )

        conn.execute(
            """
            UPDATE user_metrics
            SET total_visit_count = total_visit_count + 1,
                updated_at = ?
            WHERE username = ?
            """,
            (now_iso, username),
        )
        conn.commit()


def _list_recent_messages_sync(limit: int = 30) -> List[Dict[str, Any]]:
    safe_limit = max(1, min(int(limit), 100))

    with _db_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, username, content, created_at
            FROM user_messages
            WHERE is_visible = 1
            ORDER BY id DESC
            LIMIT ?
            """,
            (safe_limit,),
        ).fetchall()

    return [dict(row) for row in rows]


def _create_user_message_sync(username: str, content: str) -> int:
    now_iso = _iso(_utc_now())

    with _db_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO user_messages (username, content, created_at, is_visible)
            VALUES (?, ?, ?, 1)
            """,
            (username, content, now_iso),
        )
        conn.commit()
        return int(cursor.lastrowid or 0)


def _get_active_announcement_sync(username: str) -> Optional[Dict[str, Any]]:
    with _db_connection() as conn:
        row = conn.execute(
            """
            SELECT id, message, created_by, created_at, updated_at
            FROM announcements
            WHERE is_active = 1
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
            """
        ).fetchone()

        if row is None:
            return None

        announcement = dict(row)
        dismissed = conn.execute(
            """
            SELECT 1 FROM announcement_dismissals
            WHERE username = ? AND announcement_id = ?
            """,
            (username, int(announcement.get("id") or 0)),
        ).fetchone()

    if dismissed is not None:
        return None

    return announcement


def _dismiss_announcement_sync(username: str, announcement_id: int) -> None:
    now_iso = _iso(_utc_now())

    with _db_connection() as conn:
        conn.execute(
            """
            INSERT INTO announcement_dismissals (username, announcement_id, dismissed_at)
            VALUES (?, ?, ?)
            ON CONFLICT(username, announcement_id)
            DO UPDATE SET dismissed_at = excluded.dismissed_at
            """,
            (username, announcement_id, now_iso),
        )
        conn.commit()


def _get_self_stats_sync(username: str, token: str) -> Dict[str, Any]:
    with _db_connection() as conn:
        metrics_row = conn.execute(
            """
            SELECT
                login_count,
                total_login_seconds,
                total_api_calls,
                total_visit_count,
                last_login_at,
                last_logout_at,
                updated_at
            FROM user_metrics
            WHERE username = ?
            """,
            (username,),
        ).fetchone()

        created_row = conn.execute(
            "SELECT created_at FROM users WHERE username = ?",
            (username,),
        ).fetchone()

        session_row = conn.execute(
            "SELECT created_at FROM sessions WHERE token = ?",
            (token,),
        ).fetchone()

    metrics = dict(metrics_row) if metrics_row else {}
    session_started_at = str((dict(session_row).get("created_at") if session_row else "") or "")

    current_session_seconds = 0
    session_start_dt = _safe_parse_iso(session_started_at)
    if session_start_dt is not None:
        current_session_seconds = max(0, int((_utc_now() - session_start_dt).total_seconds()))

    return {
        "registered_at": str((dict(created_row).get("created_at") if created_row else "") or ""),
        "login_count": int(metrics.get("login_count") or 0),
        "total_login_seconds": int(metrics.get("total_login_seconds") or 0),
        "total_api_calls": int(metrics.get("total_api_calls") or 0),
        "total_visit_count": int(metrics.get("total_visit_count") or 0),
        "last_login_at": metrics.get("last_login_at"),
        "last_logout_at": metrics.get("last_logout_at"),
        "metrics_updated_at": metrics.get("updated_at"),
        "current_session_seconds": current_session_seconds,
    }


def _get_realtime_global_stats_sync() -> Dict[str, Any]:
    now_iso = _iso(_utc_now())

    with _db_connection() as conn:
        online_users = conn.execute(
            "SELECT COUNT(DISTINCT username) AS cnt FROM sessions WHERE expires_at > ?",
            (now_iso,),
        ).fetchone()

        online_sessions = conn.execute(
            "SELECT COUNT(*) AS cnt FROM sessions WHERE expires_at > ?",
            (now_iso,),
        ).fetchone()

        total_registered_users = conn.execute(
            "SELECT COUNT(*) AS cnt FROM users"
        ).fetchone()

        total_visits = conn.execute(
            "SELECT COUNT(*) AS cnt FROM user_visits"
        ).fetchone()

        total_api_calls = conn.execute(
            "SELECT COALESCE(SUM(total_api_calls), 0) AS total FROM user_metrics"
        ).fetchone()

        total_messages = conn.execute(
            "SELECT COUNT(*) AS cnt FROM user_messages WHERE is_visible = 1"
        ).fetchone()

        role_rows = conn.execute(
            """
            SELECT role, COUNT(*) AS cnt
            FROM sessions
            WHERE expires_at > ?
            GROUP BY role
            """,
            (now_iso,),
        ).fetchall()

    role_online: Dict[str, int] = {}
    for row in role_rows:
        row_data = dict(row)
        normalized = normalize_role(row_data.get("role"), None)
        role_online[normalized] = int(role_online.get(normalized, 0) + int(row_data.get("cnt") or 0))

    return {
        "online_users": int((dict(online_users).get("cnt") if online_users else 0) or 0),
        "online_sessions": int((dict(online_sessions).get("cnt") if online_sessions else 0) or 0),
        "total_registered_users": int((dict(total_registered_users).get("cnt") if total_registered_users else 0) or 0),
        "total_visit_count": int((dict(total_visits).get("cnt") if total_visits else 0) or 0),
        "total_api_calls": int((dict(total_api_calls).get("total") if total_api_calls else 0) or 0),
        "total_messages": int((dict(total_messages).get("cnt") if total_messages else 0) or 0),
        "online_by_role": role_online,
        "snapshot_at": now_iso,
    }


def _list_all_user_stats_sync(limit: int = 500) -> List[Dict[str, Any]]:
    safe_limit = max(1, min(int(limit), 1000))

    with _db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                username,
                login_count,
                total_login_seconds,
                total_api_calls,
                total_visit_count,
                last_login_at,
                last_logout_at,
                updated_at
            FROM user_metrics
            ORDER BY total_api_calls DESC, login_count DESC, username ASC
            LIMIT ?
            """,
            (safe_limit,),
        ).fetchall()

    return [dict(row) for row in rows]


router = APIRouter(prefix="/api", tags=["statistics"])


@router.post("/log-visit")
async def log_visit(
    request: Request,
    session: Dict[str, Any] = Depends(require_api_access),
) -> VisitLogResponse:
    username = str(session.get("username") or "unknown")

    try:
        client_ip = extract_client_ip(request)
        user_agent = request.headers.get("User-Agent", "Unknown")
        visit_time = get_current_shanghai_time()

        geo_data = await fetch_geolocation(client_ip)

        visit_record = {
            "username": username,
            "ip": (geo_data or {}).get("ip", client_ip),
            "city": (geo_data or {}).get("city", "Unknown"),
            "latitude": (geo_data or {}).get("latitude"),
            "longitude": (geo_data or {}).get("longitude"),
            "visit_time": visit_time,
            "user_agent": user_agent,
        }

        _record_visit_sync(username, visit_record)

        # 可选写入 Supabase，不影响主流程
        supabase = SupabaseClient(SUPABASE_URL, SUPABASE_KEY)
        await supabase.insert(visit_record)

        if geo_data is None:
            return VisitLogResponse(
                status="partial_success",
                message="访问已记录，地理位置获取失败",
                data=visit_record,
            )

        return VisitLogResponse(
            status="success",
            message="访问记录成功保存",
            data=visit_record,
        )

    except Exception as exc:
        logger.error("log_visit 异常: %s", str(exc))
        return VisitLogResponse(
            status="failed",
            message=f"记录访问失败: {str(exc)}",
            data=None,
        )


@router.get("/statistics/center")
async def get_center_statistics(
    session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
    username = str(session.get("username") or "")
    role = normalize_role(session.get("role"), username)
    token = str(session.get("token") or "")

    quota = await asyncio.to_thread(get_user_quota_snapshot_sync, username, role)
    self_stats = await asyncio.to_thread(_get_self_stats_sync, username, token)
    realtime = await asyncio.to_thread(_get_realtime_global_stats_sync)
    admin_contact = await asyncio.to_thread(_get_admin_contact_sync)
    avatar_index = await asyncio.to_thread(_get_user_avatar_index_sync, username, role)
    messages = await asyncio.to_thread(_list_recent_messages_sync, 30)
    announcement = await asyncio.to_thread(_get_active_announcement_sync, username)

    return {
        "status": "success",
        "user": {
            "username": username,
            "role": role,
            "avatar_index": avatar_index,
            "session_created_at": session.get("created_at"),
            "expires_at": session.get("expires_at"),
        },
        "quota": quota,
        "self_stats": self_stats,
        "realtime": realtime,
        "admin_contact": admin_contact,
        "messages": messages,
        "announcement": announcement,
    }


@router.get("/statistics/realtime")
async def get_realtime_statistics(
    _session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
    realtime = await asyncio.to_thread(_get_realtime_global_stats_sync)
    return {
        "status": "success",
        "data": realtime,
    }


@router.post("/statistics/messages")
async def create_user_message(
    payload: UserMessageCreateRequest,
    session: Dict[str, Any] = Depends(require_api_access),
) -> Dict[str, Any]:
    username = str(session.get("username") or "")
    content = str(payload.content or "").strip()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="留言内容不能为空",
        )

    if len(content) > 500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="留言内容不能超过 500 字",
        )

    message_id = await asyncio.to_thread(_create_user_message_sync, username, content)

    return {
        "status": "success",
        "message": "留言已发布",
        "data": {
            "id": message_id,
            "username": username,
            "content": content,
        },
    }


@router.get("/statistics/messages")
async def list_user_messages(
    _session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
    messages = await asyncio.to_thread(_list_recent_messages_sync, 50)
    return {
        "status": "success",
        "data": messages,
    }


@router.get("/announcement/current")
async def get_current_announcement(
    session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
    username = str(session.get("username") or "")
    announcement = await asyncio.to_thread(_get_active_announcement_sync, username)
    return {
        "status": "success",
        "data": announcement,
    }


@router.post("/announcement/dismiss")
async def dismiss_announcement(
    payload: DismissAnnouncementRequest,
    session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
    username = str(session.get("username") or "")
    announcement_id = int(payload.announcement_id)

    await asyncio.to_thread(_dismiss_announcement_sync, username, announcement_id)

    return {
        "status": "success",
        "message": "公告已隐藏",
    }


@router.get("/statistics/users")
async def list_all_user_statistics(
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    rows = await asyncio.to_thread(_list_all_user_stats_sync, 800)
    return {
        "status": "success",
        "data": rows,
    }
