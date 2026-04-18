"""
用户认证、角色权限与调用配额管理模块。

核心约束：
1) 管理员账号固定为 admin。
2) 管理员密码优先使用环境变量 SUPER_USER（本地未配置时默认 123456），不写入数据库。
3) 访客(guest) / 注册用户(registered) / 管理员(admin) 使用分级 API 配额。
"""

import asyncio
import hashlib
import hmac
import logging
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

ROLE_GUEST = "guest"
ROLE_REGISTERED = "registered"
ROLE_ADMIN = "admin"

GUEST_USERNAME = "user"
GUEST_PASSWORD = "123"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD_ENV_NAME = "SUPER_USER"
DEFAULT_ADMIN_PASSWORD_LOCAL = "123456"
MAX_AVATAR_INDEX = 11

SESSION_EXPIRE_HOURS = int(os.getenv("AUTH_SESSION_EXPIRE_HOURS", "72"))
PASSWORD_HASH_ITERATIONS = int(os.getenv("AUTH_PASSWORD_HASH_ITERATIONS", "120000"))

GUEST_DAILY_API_QUOTA = 5
REGISTERED_DAILY_API_QUOTA = 50

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{3,24}$")
PASSWORD_PATTERN = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).{6,64}$")

# 兼容历史项目中提到的保留名。
RESERVED_USERNAMES = {
    GUEST_USERNAME,
    ADMIN_USERNAME,
    "super_admin",
}


def normalize_role(raw_role: Optional[str], username: Optional[str]) -> str:
    """角色标准化：仅以账号身份决定权限，不信任数据库中的管理员角色字段。"""
    lowered_username = str(username or "").strip().lower()
    lowered_role = str(raw_role or "").strip().lower()

    if lowered_username == ADMIN_USERNAME:
        return ROLE_ADMIN

    if lowered_username == GUEST_USERNAME or lowered_role == ROLE_GUEST:
        return ROLE_GUEST

    return ROLE_REGISTERED


def get_role_daily_quota(role: Optional[str]) -> Optional[int]:
    normalized = normalize_role(role, None)
    if normalized == ROLE_GUEST:
        return max(1, int(GUEST_DAILY_API_QUOTA))
    if normalized == ROLE_REGISTERED:
        return max(1, int(REGISTERED_DAILY_API_QUOTA))
    return None  # 管理员不限额


def _resolve_auth_db_path() -> Path:
    configured = str(os.getenv("AUTH_DB_PATH", "/data/webgis_auth.db")).strip()
    preferred = Path(configured or "/data/webgis_auth.db")

    try:
        preferred.parent.mkdir(parents=True, exist_ok=True)
        return preferred
    except Exception:
        fallback = Path.cwd() / "data" / preferred.name
        fallback.parent.mkdir(parents=True, exist_ok=True)
        logger.warning(
            "AUTH_DB_PATH 不可写，已回退到本地路径: %s",
            str(fallback),
        )
        return fallback


AUTH_DB_PATH = _resolve_auth_db_path()
_auth_storage_ready = False
_auth_storage_lock = asyncio.Lock()


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=24)
    password: str = Field(..., min_length=6, max_length=64)
    avatar_index: int = Field(default=0, ge=0, le=MAX_AVATAR_INDEX)


class LoginRequest(BaseModel):
    username: Optional[str] = Field(default=None, max_length=24)
    password: str = Field(..., min_length=1, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=6, max_length=64)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _parse_iso(text: str) -> datetime:
    parsed = datetime.fromisoformat(str(text))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _utc_date_str() -> str:
    return _utc_now().date().isoformat()


def _safe_parse_iso(text: str) -> Optional[datetime]:
    if not text:
        return None
    try:
        return _parse_iso(text)
    except Exception:
        return None


def _db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(AUTH_DB_PATH), timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def get_auth_db_connection() -> sqlite3.Connection:
    """暴露给其它模块的数据库连接工厂（同一份 auth 数据库）。"""
    return _db_connection()


def _init_auth_storage_sync() -> None:
    now_iso = _iso(_utc_now())
    default_contact = "管理员联系方式：请联系系统管理员"

    with _db_connection() as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'registered',
                avatar_index INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )

        user_column_rows = conn.execute("PRAGMA table_info(users)").fetchall()
        user_columns = {str(dict(row).get("name") or "") for row in user_column_rows}
        if "avatar_index" not in user_columns:
            conn.execute(
                "ALTER TABLE users ADD COLUMN avatar_index INTEGER NOT NULL DEFAULT 0"
            )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                role TEXT NOT NULL,
                ip TEXT,
                user_agent TEXT,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions(username)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)"
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_metrics (
                username TEXT PRIMARY KEY,
                login_count INTEGER NOT NULL DEFAULT 0,
                total_login_seconds INTEGER NOT NULL DEFAULT 0,
                total_api_calls INTEGER NOT NULL DEFAULT 0,
                total_visit_count INTEGER NOT NULL DEFAULT 0,
                last_login_at TEXT,
                last_logout_at TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS api_usage_daily (
                username TEXT NOT NULL,
                role TEXT NOT NULL,
                usage_date TEXT NOT NULL,
                calls INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (username, usage_date)
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_visits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                ip TEXT,
                city TEXT,
                latitude REAL,
                longitude REAL,
                visit_time TEXT NOT NULL,
                user_agent TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_user_visits_username ON user_visits(username)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_user_visits_created_at ON user_visits(created_at)"
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS announcements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message TEXT NOT NULL,
                created_by TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS announcement_dismissals (
                username TEXT NOT NULL,
                announcement_id INTEGER NOT NULL,
                dismissed_at TEXT NOT NULL,
                PRIMARY KEY (username, announcement_id)
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                is_visible INTEGER NOT NULL DEFAULT 1
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS system_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            INSERT INTO system_config (key, value, updated_at)
            VALUES ('admin_contact', ?, ?)
            ON CONFLICT(key) DO NOTHING
            """,
            (default_contact, now_iso),
        )

        conn.commit()


async def init_auth_storage() -> None:
    global _auth_storage_ready

    if _auth_storage_ready:
        return

    async with _auth_storage_lock:
        if _auth_storage_ready:
            return

        await asyncio.to_thread(_init_auth_storage_sync)
        _auth_storage_ready = True
        logger.info("认证存储已初始化: %s", str(AUTH_DB_PATH))


def _hash_password(password: str, salt: Optional[bytes] = None) -> str:
    raw = str(password or "")
    salt_bytes = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        raw.encode("utf-8"),
        salt_bytes,
        PASSWORD_HASH_ITERATIONS,
    )
    return f"{salt_bytes.hex()}${digest.hex()}"


def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_hex, digest_hex = str(stored_hash).split("$", 1)
        expected = _hash_password(password, bytes.fromhex(salt_hex)).split("$", 1)[1]
        return hmac.compare_digest(expected, digest_hex)
    except Exception:
        return False


def _normalize_username(raw_username: Optional[str]) -> str:
    return str(raw_username or "").strip()


def _normalize_avatar_index(raw_avatar_index: Any) -> int:
    try:
        value = int(raw_avatar_index)
    except Exception:
        return 0

    if value < 0:
        return 0

    if value > MAX_AVATAR_INDEX:
        return MAX_AVATAR_INDEX

    return value


def _validate_register_payload(username: str, password: str) -> None:
    lowered = username.lower()

    if lowered in RESERVED_USERNAMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该用户名为保留账号，请更换用户名",
        )

    if not USERNAME_PATTERN.fullmatch(username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名仅支持字母、数字、下划线，长度 3-24 位",
        )

    if not PASSWORD_PATTERN.fullmatch(password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密码需包含字母和数字，长度 6-64 位",
        )


def _extract_client_ip(request: Request) -> str:
    forwarded = str(request.headers.get("X-Forwarded-For", "")).strip()
    if forwarded:
        return forwarded.split(",")[0].strip()

    real_ip = str(request.headers.get("X-Real-IP", "")).strip()
    if real_ip:
        return real_ip

    return str(getattr(request.client, "host", "unknown") or "unknown")


def _extract_token(request: Request) -> str:
    auth_header = str(request.headers.get("Authorization", "")).strip()
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        if token:
            return token

    header_token = str(request.headers.get("X-Auth-Token", "")).strip()
    if header_token:
        return header_token

    query_token = str(request.query_params.get("token", "")).strip()
    return query_token


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


def _apply_logout_duration_sync(
    conn: sqlite3.Connection,
    username: str,
    session_created_at_text: str,
    logout_at: datetime,
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
) -> Dict[str, Any]:
    now = _utc_now()
    expires_at = now + timedelta(hours=SESSION_EXPIRE_HOURS)
    token = secrets.token_urlsafe(32)
    resolved_role = normalize_role(role, username)

    with _db_connection() as conn:
        conn.execute(
            """
            INSERT INTO sessions (token, username, role, ip, user_agent, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                token,
                username,
                resolved_role,
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
        "created_at": _iso(now),
        "expires_at": _iso(expires_at),
    }


def _get_session_sync(token: str) -> Optional[Dict[str, Any]]:
    with _db_connection() as conn:
        row = conn.execute(
            """
            SELECT token, username, role, ip, user_agent, created_at, expires_at
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


def _get_admin_password() -> str:
    configured = str(os.getenv(ADMIN_PASSWORD_ENV_NAME, "")).strip()
    return configured or DEFAULT_ADMIN_PASSWORD_LOCAL


def _consume_api_quota_sync(username: str, role: str) -> Dict[str, Any]:
    normalized_role = normalize_role(role, username)
    
    # 管理员不受配额限制
    if normalized_role == ROLE_ADMIN:
        return {
            "allowed": True,
            "limit": None,
            "used": 0,
            "remaining": None,
            "usage_date": _utc_date_str(),
        }
    
    daily_limit = get_role_daily_quota(normalized_role)
    usage_date = _utc_date_str()
    now_iso = _iso(_utc_now())

    with _db_connection() as conn:
        row = conn.execute(
            "SELECT calls FROM api_usage_daily WHERE username = ? AND usage_date = ?",
            (username, usage_date),
        ).fetchone()

        used = int((dict(row).get("calls") if row else 0) or 0)

        if daily_limit is not None and used >= daily_limit:
            return {
                "allowed": False,
                "limit": daily_limit,
                "used": used,
                "remaining": 0,
                "usage_date": usage_date,
            }

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
            (username, normalized_role, usage_date, now_iso),
        )

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

    next_used = used + 1
    remaining = None if daily_limit is None else max(0, daily_limit - next_used)

    return {
        "allowed": True,
        "limit": daily_limit,
        "used": next_used,
        "remaining": remaining,
        "usage_date": usage_date,
    }


def get_user_quota_snapshot_sync(username: str, role: str) -> Dict[str, Any]:
    normalized_role = normalize_role(role, username)
    usage_date = _utc_date_str()
    daily_limit = get_role_daily_quota(normalized_role)

    with _db_connection() as conn:
        row = conn.execute(
            "SELECT calls FROM api_usage_daily WHERE username = ? AND usage_date = ?",
            (username, usage_date),
        ).fetchone()

    used = int((dict(row).get("calls") if row else 0) or 0)
    remaining = None if daily_limit is None else max(0, daily_limit - used)

    return {
        "limit": daily_limit,
        "used": used,
        "remaining": remaining,
        "usage_date": usage_date,
    }


async def require_login(request: Request) -> Dict[str, Any]:
    await init_auth_storage()

    token = _extract_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="请先登录后再访问",
        )

    session = await asyncio.to_thread(_get_session_sync, token)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录状态已失效，请重新登录",
        )

    return session


async def require_api_access(request: Request) -> Dict[str, Any]:
    session = await require_login(request)

    quota = await asyncio.to_thread(
        _consume_api_quota_sync,
        str(session.get("username") or ""),
        str(session.get("role") or ""),
    )

    if not bool(quota.get("allowed")):
        limit = quota.get("limit")
        used = quota.get("used")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"今日 API 调用额度已用完（{used}/{limit}），请明日再试或使用更高权限账号",
        )

    session["quota"] = quota
    return session


async def require_admin(request: Request) -> Dict[str, Any]:
    session = await require_api_access(request)

    if normalize_role(session.get("role"), session.get("username")) != ROLE_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="仅管理员可访问此接口",
        )

    return session


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register")
async def register_user(payload: RegisterRequest) -> Dict[str, Any]:
    await init_auth_storage()

    username = _normalize_username(payload.username)
    password = str(payload.password or "")
    avatar_index = _normalize_avatar_index(payload.avatar_index)

    _validate_register_payload(username, password)

    created = await asyncio.to_thread(
        _create_user_sync,
        username,
        password,
        avatar_index,
    )
    if not created:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="用户名已存在，请更换后重试",
        )

    return {
        "status": "success",
        "message": "注册成功，请使用新账号登录",
        "user": {
            "username": username,
            "role": ROLE_REGISTERED,
            "avatar_index": avatar_index,
        },
    }


@router.get("/check-username")
async def check_username_availability(username: str = "") -> Dict[str, Any]:
    await init_auth_storage()

    normalized = _normalize_username(username)
    if not normalized:
        return {
            "status": "success",
            "available": False,
            "message": "请输入用户名",
        }

    lowered = normalized.lower()
    if lowered in RESERVED_USERNAMES:
        return {
            "status": "success",
            "available": False,
            "message": "该用户名为系统保留用户名",
        }

    if not USERNAME_PATTERN.fullmatch(normalized):
        return {
            "status": "success",
            "available": False,
            "message": "用户名仅支持字母、数字、下划线，长度 3-24 位",
        }

    existing = await asyncio.to_thread(_get_user_sync, normalized)
    if existing is not None:
        return {
            "status": "success",
            "available": False,
            "message": "用户名已被注册",
        }

    return {
        "status": "success",
        "available": True,
        "message": "用户名可用",
    }


@router.post("/login")
async def login_user(payload: LoginRequest, request: Request) -> Dict[str, Any]:
    await init_auth_storage()

    username = _normalize_username(payload.username)
    password = str(payload.password or "")

    if not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请输入密码",
        )

    normalized_username = username.lower()

    if normalized_username == GUEST_USERNAME and hmac.compare_digest(password, GUEST_PASSWORD):
        resolved_username = GUEST_USERNAME
        resolved_role = ROLE_GUEST
        resolved_avatar_index = 0
    elif normalized_username == ADMIN_USERNAME:
        super_user_secret = _get_admin_password()
        if not super_user_secret:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="管理员密码未配置，请联系运维设置 SUPER_USER 环境变量",
            )

        if not hmac.compare_digest(password, super_user_secret):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户名或密码错误",
            )

        resolved_username = ADMIN_USERNAME
        resolved_role = ROLE_ADMIN
        resolved_avatar_index = 1
    else:
        if not username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="请输入用户名",
            )

        user = await asyncio.to_thread(_get_user_sync, username)
        if user is None or not _verify_password(password, str(user.get("password_hash", ""))):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户名或密码错误",
            )

        resolved_username = str(user.get("username") or username)
        resolved_role = ROLE_REGISTERED
        resolved_avatar_index = _normalize_avatar_index(user.get("avatar_index"))

    session = await asyncio.to_thread(
        _create_session_sync,
        resolved_username,
        resolved_role,
        _extract_client_ip(request),
        str(request.headers.get("User-Agent", "unknown")),
    )

    await asyncio.to_thread(_record_login_sync, resolved_username)
    quota = await asyncio.to_thread(
        get_user_quota_snapshot_sync,
        resolved_username,
        resolved_role,
    )

    return {
        "status": "success",
        "message": "登录成功",
        "token": session["token"],
        "user": {
            "username": resolved_username,
            "role": resolved_role,
            "avatar_index": resolved_avatar_index,
            "created_at": session["created_at"],
            "expires_at": session["expires_at"],
        },
        "quota": quota,
    }


@router.get("/me")
async def get_current_user(session: Dict[str, Any] = Depends(require_login)) -> Dict[str, Any]:
    username = str(session.get("username") or "")
    role = str(session.get("role") or "")

    quota = await asyncio.to_thread(get_user_quota_snapshot_sync, username, role)

    avatar_index = 0
    lowered_username = username.lower()
    if lowered_username == ADMIN_USERNAME:
        avatar_index = 1
    elif lowered_username == GUEST_USERNAME:
        avatar_index = 0
    else:
        db_user = await asyncio.to_thread(_get_user_sync, username)
        avatar_index = _normalize_avatar_index((db_user or {}).get("avatar_index"))

    return {
        "status": "success",
        "user": {
            "username": username,
            "role": normalize_role(role, username),
            "avatar_index": avatar_index,
            "session_created_at": session.get("created_at"),
            "expires_at": session.get("expires_at"),
        },
        "quota": quota,
    }


@router.post("/logout")
async def logout_user(session: Dict[str, Any] = Depends(require_login)) -> Dict[str, Any]:
    await asyncio.to_thread(_delete_session_sync, str(session.get("token", "")))
    return {
        "status": "success",
        "message": "已退出登录",
    }


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
    username = str(session.get("username") or "").strip()
    role = normalize_role(session.get("role"), username)

    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录状态异常，请重新登录",
        )

    if role == ROLE_GUEST:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="游客账号不支持修改密码",
        )

    if role == ROLE_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="管理员密码由 SUPER_USER 环境变量控制，不支持在线修改",
        )

    current_password = str(payload.current_password or "")
    new_password = str(payload.new_password or "")

    if not current_password or not new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请完整填写当前密码和新密码",
        )

    if current_password == new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码不能与当前密码相同",
        )

    if not PASSWORD_PATTERN.fullmatch(new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码需包含字母和数字，长度 6-64 位",
        )

    user = await asyncio.to_thread(_get_user_sync, username)
    if user is None or not _verify_password(current_password, str(user.get("password_hash", ""))):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="当前密码错误",
        )

    updated = await asyncio.to_thread(_update_user_password_sync, username, new_password)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="密码更新失败，请稍后重试",
        )

    # 修改密码后注销该账号全部会话，要求重新登录。
    await asyncio.to_thread(_delete_sessions_by_username_sync, username)

    return {
        "status": "success",
        "message": "密码已更新，请重新登录",
    }


@router.get("/storage-path")
async def get_auth_storage_path() -> Dict[str, Any]:
    """调试接口：返回当前认证存储路径。"""
    return {
        "status": "success",
        "path": str(AUTH_DB_PATH),
    }
