"""
用户认证与会话管理模块

接口使用示例：
1) 注册普通用户
   curl -X POST "http://localhost:8000/api/auth/register" \
     -H "Content-Type: application/json" \
     -d '{"username":"test_user","password":"abc12345"}'

2) 游客登录（固定账号）
   curl -X POST "http://localhost:8000/api/auth/login" \
     -H "Content-Type: application/json" \
     -d '{"username":"user","password":"123"}'

3) 超级管理员登录（账号由 SQL 写入 users 表）
   curl -X POST "http://localhost:8000/api/auth/login" \
     -H "Content-Type: application/json" \
    -d '{"username":"super_admin","password":"<admin_password_from_db>"}'

4) 携带 token 访问受保护接口
   curl "http://localhost:8000/api/auth/me" \
     -H "Authorization: Bearer <token>"

说明：
- 认证数据默认持久化到 /data/webgis_auth.db（HF Space 重启后不丢失）
- 若 /data 不可写，会自动回退到当前工作目录 data/webgis_auth.db
- 超级管理员密码不在代码中保存，应通过 SQL 将账号写入 users 表并设置 role='super_admin'
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

GUEST_USERNAME = "user"
GUEST_PASSWORD = "123"
SUPER_ADMIN_USERNAME = "super_admin"

SESSION_EXPIRE_HOURS = int(os.getenv("AUTH_SESSION_EXPIRE_HOURS", "72"))
PASSWORD_HASH_ITERATIONS = int(os.getenv("AUTH_PASSWORD_HASH_ITERATIONS", "120000"))

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{3,24}$")
PASSWORD_PATTERN = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).{6,64}$")

RESERVED_USERNAMES = {
    GUEST_USERNAME,
    SUPER_ADMIN_USERNAME,
    "admin",
}


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


def _db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(AUTH_DB_PATH), timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _init_auth_storage_sync() -> None:
    with _db_connection() as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'registered',
                created_at TEXT NOT NULL
            )
            """
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
            "SELECT username, password_hash, role, created_at FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        return dict(row) if row else None


def _create_user_sync(username: str, password: str) -> bool:
    created_at = _iso(_utc_now())
    password_hash = _hash_password(password)

    try:
        with _db_connection() as conn:
            conn.execute(
                "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'registered', ?)",
                (username, password_hash, created_at),
            )
            conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False


def _create_session_sync(
    username: str,
    role: str,
    ip: str,
    user_agent: str,
) -> Dict[str, Any]:
    now = _utc_now()
    expires_at = now + timedelta(hours=SESSION_EXPIRE_HOURS)
    token = secrets.token_urlsafe(32)

    with _db_connection() as conn:
        conn.execute(
            """
            INSERT INTO sessions (token, username, role, ip, user_agent, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                token,
                username,
                role,
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
        "role": role,
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
        expires_at = _parse_iso(str(data.get("expires_at", "")))
        if expires_at <= _utc_now():
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
            return None

        return data


def _delete_session_sync(token: str) -> None:
    with _db_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()


def _delete_sessions_by_username_sync(username: str) -> None:
    with _db_connection() as conn:
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


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register")
async def register_user(payload: RegisterRequest) -> Dict[str, Any]:
    await init_auth_storage()

    username = _normalize_username(payload.username)
    password = str(payload.password or "")

    _validate_register_payload(username, password)

    created = await asyncio.to_thread(_create_user_sync, username, password)
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
            "role": "registered",
        },
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

    if username == GUEST_USERNAME and hmac.compare_digest(password, GUEST_PASSWORD):
        resolved_username = GUEST_USERNAME
        resolved_role = "guest"
    else:
        lookup_username = username or SUPER_ADMIN_USERNAME
        user = await asyncio.to_thread(_get_user_sync, lookup_username)
        if user is None or not _verify_password(password, str(user.get("password_hash", ""))):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户名或密码错误",
            )

        resolved_username = str(user.get("username") or lookup_username)
        resolved_role = str(user.get("role") or "registered")

    session = await asyncio.to_thread(
        _create_session_sync,
        resolved_username,
        resolved_role,
        _extract_client_ip(request),
        str(request.headers.get("User-Agent", "unknown")),
    )

    return {
        "status": "success",
        "message": "登录成功",
        "token": session["token"],
        "user": {
            "username": resolved_username,
            "role": resolved_role,
            "expires_at": session["expires_at"],
        },
    }


@router.get("/me")
async def get_current_user(session: Dict[str, Any] = Depends(require_login)) -> Dict[str, Any]:
    return {
        "status": "success",
        "user": {
            "username": session.get("username"),
            "role": session.get("role"),
            "expires_at": session.get("expires_at"),
        },
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
    role = str(session.get("role") or "")

    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录状态异常，请重新登录",
        )

    if role == "guest":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="游客账号不支持修改密码",
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