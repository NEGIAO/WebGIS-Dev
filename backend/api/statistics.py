"""
访客统计、用户中心数据、公告与留言模块。
"""

import asyncio
import logging
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
import pytz
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from api.auth import (
    get_auth_db_connection,
    get_user_quota_snapshot_sync,
    normalize_role,
    require_admin,
    require_api_access,
    require_login,
    resolve_quota_subject,
)

logger = logging.getLogger(__name__)

SUPABASE_URL = str(
    os.getenv("SUPABASE_URL")
    or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    or ""
).strip()
SUPABASE_KEY = str(
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_SERVICE_KEY")
    or os.getenv("SUPABASE_KEY")
    or os.getenv("SUPABASE_ANON_KEY")
    or ""
).strip()
SUPABASE_VISITS_TABLE = str(
    os.getenv("SUPABASE_VISITS_TABLE")
    or os.getenv("SUPABASE_TABLE_NAME")
    or "visit_tracking_events"
).strip()

IPAPI_ENDPOINT = "https://ipapi.co"
SHANGHAI_TZ = pytz.timezone("Asia/Shanghai")
HTTP_CLIENT_TIMEOUT = httpx.Timeout(connect=3.0, read=8.0, write=8.0, pool=3.0)
HTTP_CLIENT_LIMITS = httpx.Limits(max_connections=100, max_keepalive_connections=50)

COORD_SCALE = 10**6
LNG_OFFSET_SCALED = 180 * COORD_SCALE
LAT_OFFSET_SCALED = 90 * COORD_SCALE
LNG_MAX_SCALED = 360 * COORD_SCALE
LAT_MAX_SCALED = 180 * COORD_SCALE
LAT_BITS = 28
LAT_MASK = (1 << LAT_BITS) - 1
MAX_PACKED = (LNG_MAX_SCALED << LAT_BITS) | LAT_MAX_SCALED
BASE62_ALPHABET = "4CiHUu0oP7ahIA29xNQtgbOMDs6V3nREfw1mGlvWeqSjFT8dJXpBLYKr5kzyZc"
BASE = 62
MIN_CODE_LENGTH = 8
BASE62_INDEX_MAP = {ch: idx for idx, ch in enumerate(BASE62_ALPHABET)}
GEO_PERMISSION_ALLOWED = {"granted", "denied", "prompt", "unsupported", "unknown", "error"}
COORD_SOURCE_ALLOWED = {"gps", "ip", "unknown"}


class VisitLogResponse(BaseModel):
    status: str
    message: str
    data: Optional[dict] = None


class UserMessageCreateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=500)


class DismissAnnouncementRequest(BaseModel):
    announcement_id: int = Field(..., ge=1)


class VisitLogRequest(BaseModel):
    gps_lng: Optional[float] = Field(default=None, ge=-180, le=180)
    gps_lat: Optional[float] = Field(default=None, ge=-90, le=90)
    gps_accuracy: Optional[float] = Field(default=None, ge=0)
    gps_timestamp: Optional[str] = Field(default=None, max_length=64)
    geo_permission: Optional[str] = Field(default="unknown", max_length=32)
    gps_error: Optional[str] = Field(default=None, max_length=300)


class AdminVisitEventCreateRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    role: str = Field(default="guest", max_length=32)
    guest_uid: Optional[str] = Field(default=None, max_length=64)
    quota_subject: Optional[str] = Field(default=None, max_length=96)
    ip: Optional[str] = Field(default=None, max_length=64)
    ip_city: Optional[str] = Field(default=None, max_length=128)
    ip_region: Optional[str] = Field(default=None, max_length=128)
    ip_country: Optional[str] = Field(default=None, max_length=128)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    coord_source: Optional[str] = Field(default="unknown", max_length=32)
    geo_permission: Optional[str] = Field(default="unknown", max_length=32)
    gps_accuracy: Optional[float] = Field(default=None, ge=0)
    gps_error: Optional[str] = Field(default=None, max_length=300)
    gps_timestamp: Optional[str] = Field(default=None, max_length=64)
    encoded_pos: Optional[str] = Field(default=None, max_length=64)
    visit_time: Optional[str] = Field(default=None, max_length=64)
    user_agent: Optional[str] = Field(default=None, max_length=512)
    supabase_sync_status: Optional[str] = Field(default="pending", max_length=32)
    supabase_sync_error: Optional[str] = Field(default=None, max_length=512)


class AdminVisitEventUpdateRequest(BaseModel):
    guest_uid: Optional[str] = Field(default=None, max_length=64)
    quota_subject: Optional[str] = Field(default=None, max_length=96)
    role: Optional[str] = Field(default=None, max_length=32)
    ip: Optional[str] = Field(default=None, max_length=64)
    ip_city: Optional[str] = Field(default=None, max_length=128)
    ip_region: Optional[str] = Field(default=None, max_length=128)
    ip_country: Optional[str] = Field(default=None, max_length=128)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    coord_source: Optional[str] = Field(default=None, max_length=32)
    geo_permission: Optional[str] = Field(default=None, max_length=32)
    gps_accuracy: Optional[float] = Field(default=None, ge=0)
    gps_error: Optional[str] = Field(default=None, max_length=300)
    gps_timestamp: Optional[str] = Field(default=None, max_length=64)
    encoded_pos: Optional[str] = Field(default=None, max_length=64)
    visit_time: Optional[str] = Field(default=None, max_length=64)
    user_agent: Optional[str] = Field(default=None, max_length=512)
    supabase_sync_status: Optional[str] = Field(default=None, max_length=32)
    supabase_sync_error: Optional[str] = Field(default=None, max_length=512)


class SupabaseClient:
    """可选的 Supabase 异步写入客户端（失败不影响主流程）。"""

    def __init__(self, url: str, key: str, table_name: str):
        self.url = str(url or "").strip()
        self.key = str(key or "").strip()
        self.table_name = str(table_name or "visit_tracking_events").strip()

    async def insert(self, data: dict) -> Tuple[bool, str]:
        if not self.url or not self.key:
            return False, "missing SUPABASE_URL or SUPABASE_KEY"

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
                if response.status_code in (200, 201):
                    return True, ""

                text = str(response.text or "").strip()
                error_text = text[:500] if text else "empty response body"
                return False, f"supabase status={response.status_code}, detail={error_text}"
        except Exception as exc:
            logger.warning("Supabase 写入失败: %s", str(exc))
            return False, str(exc)


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


def _normalize_geo_permission(raw_value: Any) -> str:
    value = str(raw_value or "unknown").strip().lower()
    if value in GEO_PERMISSION_ALLOWED:
        return value
    return "unknown"


def _normalize_coord_source(raw_value: Any) -> str:
    value = str(raw_value or "unknown").strip().lower()
    if value in COORD_SOURCE_ALLOWED:
        return value
    return "unknown"


def _coerce_float(value: Any) -> Optional[float]:
    try:
        num = float(value)
    except Exception:
        return None
    if not (num == num):
        return None
    return num


def _is_valid_lng_lat(lng: Any, lat: Any) -> bool:
    lng_num = _coerce_float(lng)
    lat_num = _coerce_float(lat)
    if lng_num is None or lat_num is None:
        return False
    return -180 <= lng_num <= 180 and -90 <= lat_num <= 90


def _encode_base62(value: int) -> str:
    current = int(value)
    if current < 0:
        return ""
    if current == 0:
        return BASE62_ALPHABET[0]

    chars: List[str] = []
    while current > 0:
        current, remainder = divmod(current, BASE)
        chars.append(BASE62_ALPHABET[remainder])

    chars.reverse()
    return "".join(chars)


def encode_pos(lng: Any, lat: Any) -> str:
    """按前端 urlCrypto 规则编码经纬度，保持互通。"""
    lng_num = _coerce_float(lng)
    lat_num = _coerce_float(lat)

    if lng_num is None or lat_num is None:
        return "0"

    if lng_num < -180 or lng_num > 180 or lat_num < -90 or lat_num > 90:
        return "0"

    lng_scaled = round((lng_num + 180) * COORD_SCALE)
    lat_scaled = round((lat_num + 90) * COORD_SCALE)

    if (
        lng_scaled < 0
        or lng_scaled > LNG_MAX_SCALED
        or lat_scaled < 0
        or lat_scaled > LAT_MAX_SCALED
    ):
        return "0"

    packed = (int(lng_scaled) << LAT_BITS) | int(lat_scaled)
    if packed < 0 or packed > MAX_PACKED:
        return "0"

    encoded = _encode_base62(packed)
    if not encoded:
        return "0"

    if len(encoded) >= MIN_CODE_LENGTH:
        return encoded

    return encoded.rjust(MIN_CODE_LENGTH, BASE62_ALPHABET[0])


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
        latitude = _coerce_float(data.get("latitude"))
        longitude = _coerce_float(data.get("longitude"))
        return {
            "ip": data.get("ip", ip),
            "city": data.get("city", "Unknown"),
            "region": data.get("region") or data.get("region_name") or "Unknown",
            "country": data.get("country_name") or data.get("country") or "Unknown",
            "latitude": latitude,
            "longitude": longitude,
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


def _insert_visit_tracking_event_sync(event_record: Dict[str, Any]) -> int:
    now_iso = _iso(_utc_now())

    with _db_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO visit_tracking_events (
                username,
                role,
                guest_uid,
                quota_subject,
                ip,
                ip_city,
                ip_region,
                ip_country,
                latitude,
                longitude,
                coord_source,
                geo_permission,
                gps_accuracy,
                gps_error,
                gps_timestamp,
                encoded_pos,
                visit_time,
                user_agent,
                created_at,
                supabase_sync_status,
                supabase_sync_error,
                supabase_synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(event_record.get("username") or "unknown"),
                str(event_record.get("role") or "guest"),
                str(event_record.get("guest_uid") or ""),
                str(event_record.get("quota_subject") or str(event_record.get("username") or "unknown")),
                str(event_record.get("ip") or "unknown"),
                str(event_record.get("ip_city") or "Unknown"),
                str(event_record.get("ip_region") or "Unknown"),
                str(event_record.get("ip_country") or "Unknown"),
                event_record.get("latitude"),
                event_record.get("longitude"),
                _normalize_coord_source(event_record.get("coord_source")),
                _normalize_geo_permission(event_record.get("geo_permission")),
                event_record.get("gps_accuracy"),
                str(event_record.get("gps_error") or ""),
                str(event_record.get("gps_timestamp") or ""),
                str(event_record.get("encoded_pos") or "0"),
                str(event_record.get("visit_time") or get_current_shanghai_time()),
                str(event_record.get("user_agent") or "Unknown"),
                str(event_record.get("created_at") or now_iso),
                str(event_record.get("supabase_sync_status") or "pending"),
                str(event_record.get("supabase_sync_error") or ""),
                event_record.get("supabase_synced_at"),
            ),
        )
        conn.commit()
        return int(cursor.lastrowid or 0)


def _update_visit_tracking_sync_status_sync(
    event_id: int,
    status_text: str,
    error_text: str = "",
    synced_at: Optional[str] = None,
) -> None:
    normalized_status = str(status_text or "pending").strip().lower()
    if normalized_status not in {"pending", "success", "failed", "skipped"}:
        normalized_status = "failed"

    with _db_connection() as conn:
        conn.execute(
            """
            UPDATE visit_tracking_events
            SET supabase_sync_status = ?,
                supabase_sync_error = ?,
                supabase_synced_at = ?
            WHERE id = ?
            """,
            (
                normalized_status,
                str(error_text or "")[:500],
                synced_at,
                int(event_id),
            ),
        )
        conn.commit()


def _upsert_guest_identity_record_sync(record: Dict[str, Any]) -> None:
    guest_uid = str(record.get("guest_uid") or "").strip()
    if not guest_uid:
        return

    now_iso = _iso(_utc_now())
    username = str(record.get("username") or "user")
    role = normalize_role(record.get("role"), username)
    guest_device_id = str(record.get("guest_device_id") or "").strip()
    ip = str(record.get("ip") or "unknown")
    coord_source = _normalize_coord_source(record.get("coord_source"))
    geo_permission = _normalize_geo_permission(record.get("geo_permission"))
    encoded_pos = str(record.get("encoded_pos") or "0")
    latitude = _coerce_float(record.get("latitude"))
    longitude = _coerce_float(record.get("longitude"))
    user_agent = str(record.get("user_agent") or "")

    with _db_connection() as conn:
        existing = conn.execute(
            "SELECT guest_uid, id FROM guest_identity_records WHERE guest_uid = ?",
            (guest_uid,),
        ).fetchone()

        if existing is None:
            # 获取下一个 id 用于生成用户名
            max_id_row = conn.execute("SELECT MAX(id) FROM guest_identity_records").fetchone()
            next_id = (dict(max_id_row).get("MAX(id)") or 0) + 1
            # 使用 id 生成用户名，格式为 "user_1", "user_2" 等
            generated_username = f"user_{next_id}"
            
            conn.execute(
                """
                INSERT INTO guest_identity_records (
                    guest_uid,
                    username,
                    role,
                    guest_device_id,
                    ip,
                    coord_source,
                    geo_permission,
                    encoded_pos,
                    last_latitude,
                    last_longitude,
                    user_agent,
                    visit_count,
                    first_seen_at,
                    last_seen_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    guest_uid,
                    generated_username,
                    role,
                    guest_device_id,
                    ip,
                    coord_source,
                    geo_permission,
                    encoded_pos,
                    latitude,
                    longitude,
                    user_agent,
                    now_iso,
                    now_iso,
                ),
            )
        else:
            # 获取现有的用户名和 id
            existing_dict = dict(existing)
            existing_id = existing_dict.get("id")
            existing_username = existing_dict.get("username") or username
            
            conn.execute(
                """
                UPDATE guest_identity_records
                SET role = ?,
                    guest_device_id = ?,
                    ip = ?,
                    coord_source = ?,
                    geo_permission = ?,
                    encoded_pos = ?,
                    last_latitude = ?,
                    last_longitude = ?,
                    user_agent = ?,
                    visit_count = visit_count + 1,
                    last_seen_at = ?
                WHERE guest_uid = ?
                """,
                (
                    role,
                    guest_device_id,
                    ip,
                    coord_source,
                    geo_permission,
                    encoded_pos,
                    latitude,
                    longitude,
                    user_agent,
                    now_iso,
                    guest_uid,
                ),
            )

        conn.commit()


def _get_visit_tracking_event_sync(event_id: int) -> Optional[Dict[str, Any]]:
    with _db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM visit_tracking_events WHERE id = ?",
            (int(event_id),),
        ).fetchone()
    return dict(row) if row else None


def _list_visit_tracking_events_sync(
    limit: int = 100,
    offset: int = 0,
    username: str = "",
    coord_source: str = "",
    geo_permission: str = "",
    sync_status: str = "",
) -> List[Dict[str, Any]]:
    safe_limit = max(1, min(int(limit), 500))
    safe_offset = max(0, int(offset))

    clauses = ["1=1"]
    values: List[Any] = []

    if str(username or "").strip():
        clauses.append("username = ?")
        values.append(str(username).strip())

    if str(coord_source or "").strip():
        clauses.append("coord_source = ?")
        values.append(_normalize_coord_source(coord_source))

    if str(geo_permission or "").strip():
        clauses.append("geo_permission = ?")
        values.append(_normalize_geo_permission(geo_permission))

    if str(sync_status or "").strip():
        clauses.append("supabase_sync_status = ?")
        values.append(str(sync_status).strip().lower())

    where_sql = " AND ".join(clauses)
    query = f"""
        SELECT *
        FROM visit_tracking_events
        WHERE {where_sql}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
    """
    values.extend([safe_limit, safe_offset])

    with _db_connection() as conn:
        rows = conn.execute(query, values).fetchall()

    return [dict(row) for row in rows]


def _create_visit_tracking_event_admin_sync(payload: AdminVisitEventCreateRequest) -> int:
    if hasattr(payload, "model_dump"):
        raw = payload.model_dump()
    else:
        raw = payload.dict()
    lng = raw.get("longitude")
    lat = raw.get("latitude")

    encoded_pos = str(raw.get("encoded_pos") or "").strip()
    if not encoded_pos:
        encoded_pos = encode_pos(lng, lat)

    normalized_username = str(raw.get("username") or "unknown")
    normalized_role = normalize_role(raw.get("role"), raw.get("username"))
    guest_uid = str(raw.get("guest_uid") or "").strip()
    quota_subject = str(raw.get("quota_subject") or "").strip()
    if not quota_subject:
        quota_subject = resolve_quota_subject(normalized_username, normalized_role, guest_uid)

    event_record = {
        "username": normalized_username,
        "role": normalized_role,
        "guest_uid": guest_uid,
        "quota_subject": quota_subject,
        "ip": raw.get("ip"),
        "ip_city": raw.get("ip_city"),
        "ip_region": raw.get("ip_region"),
        "ip_country": raw.get("ip_country"),
        "latitude": lat,
        "longitude": lng,
        "coord_source": _normalize_coord_source(raw.get("coord_source")),
        "geo_permission": _normalize_geo_permission(raw.get("geo_permission")),
        "gps_accuracy": raw.get("gps_accuracy"),
        "gps_error": raw.get("gps_error"),
        "gps_timestamp": raw.get("gps_timestamp"),
        "encoded_pos": encoded_pos,
        "visit_time": raw.get("visit_time") or get_current_shanghai_time(),
        "user_agent": raw.get("user_agent") or "admin-manual-entry",
        "created_at": _iso(_utc_now()),
        "supabase_sync_status": str(raw.get("supabase_sync_status") or "pending").strip().lower(),
        "supabase_sync_error": raw.get("supabase_sync_error") or "",
        "supabase_synced_at": None,
    }
    return _insert_visit_tracking_event_sync(event_record)


def _update_visit_tracking_event_admin_sync(
    event_id: int,
    payload: AdminVisitEventUpdateRequest,
) -> int:
    current = _get_visit_tracking_event_sync(event_id)
    if current is None:
        return 0

    values: Dict[str, Any] = {}
    if hasattr(payload, "model_dump"):
        raw = payload.model_dump(exclude_unset=True)
    else:
        raw = payload.dict(exclude_unset=True)

    for key, value in raw.items():
        if key in {"coord_source", "geo_permission"}:
            continue
        values[key] = value

    if "coord_source" in raw:
        values["coord_source"] = _normalize_coord_source(raw.get("coord_source"))
    if "geo_permission" in raw:
        values["geo_permission"] = _normalize_geo_permission(raw.get("geo_permission"))

    # 若经纬度更新且未显式给 encoded_pos，则自动重算编码
    next_lng = values.get("longitude", current.get("longitude"))
    next_lat = values.get("latitude", current.get("latitude"))
    if "encoded_pos" not in values and _is_valid_lng_lat(next_lng, next_lat):
        values["encoded_pos"] = encode_pos(next_lng, next_lat)

    if not values:
        return 0

    set_clause = ", ".join([f"{column} = ?" for column in values.keys()])
    params = list(values.values()) + [int(event_id)]

    with _db_connection() as conn:
        cursor = conn.execute(
            f"UPDATE visit_tracking_events SET {set_clause} WHERE id = ?",
            params,
        )
        conn.commit()
        return int(cursor.rowcount or 0)


def _delete_visit_tracking_event_sync(event_id: int) -> int:
    with _db_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM visit_tracking_events WHERE id = ?",
            (int(event_id),),
        )
        conn.commit()
        return int(cursor.rowcount or 0)


def _build_supabase_visit_payload(event_row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "event_id": int(event_row.get("id") or 0),
        "username": str(event_row.get("username") or "unknown"),
        "role": str(event_row.get("role") or "guest"),
        "guest_uid": str(event_row.get("guest_uid") or ""),
        "quota_subject": str(event_row.get("quota_subject") or str(event_row.get("username") or "unknown")),
        "ip": str(event_row.get("ip") or "unknown"),
        "ip_city": str(event_row.get("ip_city") or "Unknown"),
        "ip_region": str(event_row.get("ip_region") or "Unknown"),
        "ip_country": str(event_row.get("ip_country") or "Unknown"),
        "latitude": event_row.get("latitude"),
        "longitude": event_row.get("longitude"),
        "coord_source": str(event_row.get("coord_source") or "unknown"),
        "geo_permission": str(event_row.get("geo_permission") or "unknown"),
        "gps_accuracy": event_row.get("gps_accuracy"),
        "gps_error": str(event_row.get("gps_error") or ""),
        "gps_timestamp": str(event_row.get("gps_timestamp") or ""),
        "encoded_pos": str(event_row.get("encoded_pos") or "0"),
        "visit_time": str(event_row.get("visit_time") or ""),
        "user_agent": str(event_row.get("user_agent") or ""),
        "created_at": str(event_row.get("created_at") or _iso(_utc_now())),
    }


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
    visit_payload: Optional[VisitLogRequest] = None,
    session: Dict[str, Any] = Depends(require_api_access),
) -> VisitLogResponse:
    """
    功能：记录访问日志（IP/GPS）并写入本地统计表，可选同步 Supabase。

    参数：
    - visit_payload: 前端上报的 GPS 与权限信息（可选）。
    - session: 当前登录会话（包含角色、游客标识等）。

    返回：
    - success/partial_success/failed 以及事件明细数据。

    处理过程：
    1. 聚合 IP 与 GPS，选择优先坐标源；
    2. 写入 visit_tracking_events 与用户访问统计；
    3. 根据配置尝试同步 Supabase 并返回同步状态。
    """
    username = str(session.get("username") or "unknown")
    role = normalize_role(session.get("role"), username)
    guest_uid = str(session.get("guest_uid") or "").strip()
    guest_device_id = str(session.get("guest_device_id") or "").strip()
    quota_subject = resolve_quota_subject(username, role, guest_uid)

    try:
        client_ip = extract_client_ip(request)
        user_agent = request.headers.get("User-Agent", "Unknown")
        visit_time = get_current_shanghai_time()

        geo_data = await fetch_geolocation(client_ip)

        gps_lng = visit_payload.gps_lng if visit_payload else None
        gps_lat = visit_payload.gps_lat if visit_payload else None
        gps_accuracy = visit_payload.gps_accuracy if visit_payload else None
        gps_error = (visit_payload.gps_error if visit_payload else "") or ""
        gps_timestamp = (visit_payload.gps_timestamp if visit_payload else "") or ""
        geo_permission = _normalize_geo_permission(
            (visit_payload.geo_permission if visit_payload else "unknown")
        )

        has_valid_gps = _is_valid_lng_lat(gps_lng, gps_lat)
        ip_lng = (geo_data or {}).get("longitude")
        ip_lat = (geo_data or {}).get("latitude")
        has_valid_ip_lng_lat = _is_valid_lng_lat(ip_lng, ip_lat)

        selected_lng: Optional[float]
        selected_lat: Optional[float]

        if has_valid_gps:
            selected_lng = _coerce_float(gps_lng)
            selected_lat = _coerce_float(gps_lat)
            coord_source = "gps"
            if geo_permission in {"unknown", "prompt", "unsupported", "error"}:
                geo_permission = "granted"
        elif has_valid_ip_lng_lat:
            selected_lng = _coerce_float(ip_lng)
            selected_lat = _coerce_float(ip_lat)
            coord_source = "ip"
        else:
            selected_lng = None
            selected_lat = None
            coord_source = "unknown"

        encoded_pos = (
            encode_pos(selected_lng, selected_lat)
            if selected_lng is not None and selected_lat is not None
            else "0"
        )

        visit_record = {
            "username": username,
            "ip": (geo_data or {}).get("ip", client_ip),
            "city": (geo_data or {}).get("city", "Unknown"),
            "latitude": selected_lat,
            "longitude": selected_lng,
            "visit_time": visit_time,
            "user_agent": user_agent,
        }

        event_record = {
            "username": username,
            "role": role,
            "guest_uid": guest_uid,
            "quota_subject": quota_subject,
            "ip": (geo_data or {}).get("ip", client_ip),
            "ip_city": (geo_data or {}).get("city", "Unknown"),
            "ip_region": (geo_data or {}).get("region", "Unknown"),
            "ip_country": (geo_data or {}).get("country", "Unknown"),
            "latitude": selected_lat,
            "longitude": selected_lng,
            "coord_source": coord_source,
            "geo_permission": geo_permission,
            "gps_accuracy": gps_accuracy,
            "gps_error": gps_error,
            "gps_timestamp": gps_timestamp,
            "encoded_pos": encoded_pos,
            "visit_time": visit_time,
            "user_agent": user_agent,
            "created_at": _iso(_utc_now()),
            "supabase_sync_status": "pending",
            "supabase_sync_error": "",
            "supabase_synced_at": None,
        }

        await asyncio.to_thread(_record_visit_sync, username, visit_record)
        event_id = await asyncio.to_thread(_insert_visit_tracking_event_sync, event_record)

        if role == "guest" and guest_uid:
            await asyncio.to_thread(
                _upsert_guest_identity_record_sync,
                {
                    "guest_uid": guest_uid,
                    "username": username,
                    "role": role,
                    "guest_device_id": guest_device_id,
                    "ip": (geo_data or {}).get("ip", client_ip),
                    "coord_source": coord_source,
                    "geo_permission": geo_permission,
                    "encoded_pos": encoded_pos,
                    "latitude": selected_lat,
                    "longitude": selected_lng,
                    "user_agent": user_agent,
                },
            )

        supabase_status = "skipped"
        supabase_error = ""

        supabase = SupabaseClient(SUPABASE_URL, SUPABASE_KEY, SUPABASE_VISITS_TABLE)
        if not SUPABASE_URL or not SUPABASE_KEY:
            supabase_status = "skipped"
            supabase_error = "Supabase 未配置，已仅写入本地 visit_tracking_events 表"
            await asyncio.to_thread(
                _update_visit_tracking_sync_status_sync,
                event_id,
                supabase_status,
                supabase_error,
                None,
            )
        else:
            supabase_payload = _build_supabase_visit_payload({
                **event_record,
                "id": event_id,
            })

            synced, sync_error = await supabase.insert(supabase_payload)
            if synced:
                supabase_status = "success"
                await asyncio.to_thread(
                    _update_visit_tracking_sync_status_sync,
                    event_id,
                    supabase_status,
                    "",
                    _iso(_utc_now()),
                )
            else:
                supabase_status = "failed"
                supabase_error = str(sync_error or "Supabase 写入失败")
                await asyncio.to_thread(
                    _update_visit_tracking_sync_status_sync,
                    event_id,
                    supabase_status,
                    supabase_error,
                    None,
                )

        response_data = {
            **visit_record,
            "event_id": event_id,
            "role": role,
            "guest_uid": guest_uid,
            "quota_subject": quota_subject,
            "coord_source": coord_source,
            "geo_permission": geo_permission,
            "gps_accuracy": gps_accuracy,
            "encoded_pos": encoded_pos,
            "supabase_sync_status": supabase_status,
            "supabase_sync_error": supabase_error,
            "storage_table": "visit_tracking_events",
        }

        if coord_source == "unknown":
            return VisitLogResponse(
                status="partial_success",
                message="访问已记录，但未获取到可用经纬度",
                data=response_data,
            )

        return VisitLogResponse(
            status="success",
            message="访问记录成功保存",
            data=response_data,
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
    """
    功能：获取用户中心聚合数据。

    返回：
    - 当前用户信息、配额、个人统计、全站实时统计、公告、留言等。
    """
    username = str(session.get("username") or "")
    role = normalize_role(session.get("role"), username)
    quota_subject = resolve_quota_subject(username, role, session.get("guest_uid"))
    token = str(session.get("token") or "")

    quota = await asyncio.to_thread(get_user_quota_snapshot_sync, username, role, quota_subject)
    self_stats = await asyncio.to_thread(_get_self_stats_sync, username, token)
    realtime = await asyncio.to_thread(_get_realtime_global_stats_sync)
    admin_contact = await asyncio.to_thread(_get_admin_contact_sync)
    messages = await asyncio.to_thread(_list_recent_messages_sync, 30)
    announcement = await asyncio.to_thread(_get_active_announcement_sync, username)

    return {
        "status": "success",
        "user": {
            "username": username,
            "role": role,
            "avatar_index": 0,
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
    """功能：获取全站实时统计快照。"""
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
    """
    功能：发布用户留言。

    参数：
    - payload.content: 留言内容（1~500 字）。

    返回：
    - 新留言 ID 与基础字段。
    """
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
    """功能：查询最近留言列表。"""
    messages = await asyncio.to_thread(_list_recent_messages_sync, 50)
    return {
        "status": "success",
        "data": messages,
    }


@router.get("/announcement/current")
async def get_current_announcement(
    session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
    """功能：读取当前用户可见的有效公告。"""
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
    """功能：将指定公告标记为“当前用户已忽略”。"""
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
    """功能：管理员查看全体用户统计指标列表。"""
    rows = await asyncio.to_thread(_list_all_user_stats_sync, 800)
    return {
        "status": "success",
        "data": rows,
    }


@router.get("/statistics/admin/visit-events")
async def admin_list_visit_events(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    username: str = Query(default=""),
    coord_source: str = Query(default=""),
    geo_permission: str = Query(default=""),
    sync_status: str = Query(default=""),
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """
    功能：管理员分页查询访问事件。

    参数：
    - limit/offset: 分页。
    - username/coord_source/geo_permission/sync_status: 可选过滤条件。
    """
    rows = await asyncio.to_thread(
        _list_visit_tracking_events_sync,
        limit,
        offset,
        username,
        coord_source,
        geo_permission,
        sync_status,
    )
    return {
        "status": "success",
        "data": rows,
    }


@router.get("/statistics/admin/visit-events/{event_id}")
async def admin_get_visit_event(
    event_id: int,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """功能：管理员按 ID 查询单条访问事件。"""
    row = await asyncio.to_thread(_get_visit_tracking_event_sync, event_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到访问记录",
        )
    return {
        "status": "success",
        "data": row,
    }


@router.post("/statistics/admin/visit-events")
async def admin_create_visit_event(
    payload: AdminVisitEventCreateRequest,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """功能：管理员手工创建访问事件。"""
    row_id = await asyncio.to_thread(_create_visit_tracking_event_admin_sync, payload)
    return {
        "status": "success",
        "message": "访问记录创建成功",
        "data": {"id": row_id},
    }


@router.put("/statistics/admin/visit-events/{event_id}")
async def admin_update_visit_event(
    event_id: int,
    payload: AdminVisitEventUpdateRequest,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """功能：管理员更新指定访问事件。"""
    affected = await asyncio.to_thread(_update_visit_tracking_event_admin_sync, event_id, payload)
    if affected <= 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到访问记录或没有可更新字段",
        )
    return {
        "status": "success",
        "message": "访问记录更新成功",
        "data": {"affected": affected},
    }


@router.delete("/statistics/admin/visit-events/{event_id}")
async def admin_delete_visit_event(
    event_id: int,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """功能：管理员删除指定访问事件。"""
    affected = await asyncio.to_thread(_delete_visit_tracking_event_sync, event_id)
    if affected <= 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到访问记录",
        )
    return {
        "status": "success",
        "message": "访问记录删除成功",
        "data": {"affected": affected},
    }


@router.post("/statistics/admin/visit-events/{event_id}/sync-supabase")
async def admin_sync_visit_event_to_supabase(
    event_id: int,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """
    功能：管理员手工触发单条访问事件同步到 Supabase。

    返回：
    - success/partial_success 以及同步结果明细。
    """
    row = await asyncio.to_thread(_get_visit_tracking_event_sync, event_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到访问记录",
        )

    if not SUPABASE_URL or not SUPABASE_KEY:
        await asyncio.to_thread(
            _update_visit_tracking_sync_status_sync,
            event_id,
            "skipped",
            "Supabase 未配置，无法同步",
            None,
        )
        return {
            "status": "partial_success",
            "message": "Supabase 未配置，已保留本地记录",
            "data": {
                "event_id": event_id,
                "synced": False,
                "reason": "missing supabase config",
            },
        }

    supabase = SupabaseClient(SUPABASE_URL, SUPABASE_KEY, SUPABASE_VISITS_TABLE)
    payload = _build_supabase_visit_payload(row)
    synced, sync_error = await supabase.insert(payload)

    if synced:
        await asyncio.to_thread(
            _update_visit_tracking_sync_status_sync,
            event_id,
            "success",
            "",
            _iso(_utc_now()),
        )
        return {
            "status": "success",
            "message": "已同步到 Supabase",
            "data": {
                "event_id": event_id,
                "synced": True,
            },
        }

    await asyncio.to_thread(
        _update_visit_tracking_sync_status_sync,
        event_id,
        "failed",
        str(sync_error or "Supabase 同步失败"),
        None,
    )
    return {
        "status": "partial_success",
        "message": "Supabase 同步失败，已保留本地记录",
        "data": {
            "event_id": event_id,
            "synced": False,
            "error": str(sync_error or "Supabase sync failed"),
        },
    }
