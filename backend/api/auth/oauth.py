"""
Google/GitHub OAuth 登录、自动注册与账号绑定服务。

本模块只在后端保存 provider 配置与签名 state，不向前端暴露 client secret。
OAuth access token 仅用于换取 profile，不写入数据库。
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import threading
from typing import Any, Dict, Optional
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, Request, status

from .constants import (
    ADMIN_USERNAME,
    GUEST_USERNAME,
    OAUTH_PASSWORD_MARKER_PREFIX,
    OAUTH_STATE_TTL_SECONDS,
    OAUTH_TICKET_TTL_SECONDS,
    RESERVED_USERNAMES,
    ROLE_ADMIN,
    ROLE_GUEST,
    ROLE_REGISTERED,
    SUPPORTED_OAUTH_PROVIDERS as AUTH_SUPPORTED_OAUTH_PROVIDERS,
    get_oauth_frontend_redirect_url,
    get_oauth_redirect_uri,
    is_development_env,
    _normalize_display_name,
    normalize_role,
)
from .db import _db_connection, _iso, _utc_now
from .session import _get_user_by_email_sync
from .user import _generate_account_username_sync, _get_user_by_id_sync

logger = logging.getLogger(__name__)

SUPPORTED_OAUTH_PROVIDERS = set(AUTH_SUPPORTED_OAUTH_PROVIDERS)
_ticket_lock = threading.Lock()
_oauth_tickets: Dict[str, Dict[str, Any]] = {}


OAuthProfile = Dict[str, Any]


def _urlsafe_b64encode(raw: bytes) -> str:
    """将二进制内容编码为无 padding 的 URL-safe Base64 字符串。"""
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _urlsafe_b64decode(raw: str) -> bytes:
    """解码无 padding 的 URL-safe Base64 字符串。"""
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode((raw + padding).encode("ascii"))


def _get_state_secret() -> str:
    """读取 OAuth state 签名密钥；生产环境必须显式配置。"""
    secret = str(os.getenv("OAUTH_STATE_SECRET") or "").strip()
    if secret:
        return secret
    if is_development_env():
        # 仅本地开发兜底，生产环境缺失 secret 必须失败。
        return "webgis-oauth-dev-state-secret"
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="OAuth state secret 未配置，请设置 OAUTH_STATE_SECRET",
    )


def _sign_payload(payload_text: str) -> str:
    """使用 HMAC-SHA256 给 state payload 签名。"""
    digest = hmac.new(
        _get_state_secret().encode("utf-8"),
        payload_text.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return _urlsafe_b64encode(digest)


def _provider_env(provider: str, key: str) -> str:
    """读取 provider 专属环境变量。"""
    return str(os.getenv(f"{provider.upper()}_OAUTH_{key}") or "").strip()


def _ensure_supported_provider(provider: str) -> str:
    """校验并规范化 provider 名称。"""
    normalized = str(provider or "").strip().lower()
    if normalized not in SUPPORTED_OAUTH_PROVIDERS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="不支持的第三方登录提供商")
    return normalized


def _oauth_config(provider: str) -> Dict[str, str]:
    """返回 OAuth provider 配置，缺失必要配置时抛出可读错误。"""
    provider = _ensure_supported_provider(provider)
    client_id = _provider_env(provider, "CLIENT_ID")
    client_secret = _provider_env(provider, "CLIENT_SECRET")
    redirect_uri = _provider_env(provider, "REDIRECT_URI")

    if provider == "google":
        auth_url = "https://accounts.google.com/o/oauth2/v2/auth"
        token_url = "https://oauth2.googleapis.com/token"
        profile_url = "https://www.googleapis.com/oauth2/v3/userinfo"
        scope = "openid email profile"
    else:
        auth_url = "https://github.com/login/oauth/authorize"
        token_url = "https://github.com/login/oauth/access_token"
        profile_url = "https://api.github.com/user"
        scope = "read:user user:email"

    missing = [name for name, value in {
        "CLIENT_ID": client_id,
        "CLIENT_SECRET": client_secret,
        "REDIRECT_URI": redirect_uri,
    }.items() if not value]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{provider} OAuth 未配置：缺少 {', '.join(missing)}",
        )

    return {
        "provider": provider,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "auth_url": auth_url,
        "token_url": token_url,
        "profile_url": profile_url,
        "scope": scope,
    }


def create_oauth_state(provider: str, mode: str = "login", username: str = "") -> str:
    """
    创建带签名的 OAuth state。

    参数：
    - provider: google/github
    - mode: login 或 bind
    - username: 绑定模式下的当前本地用户名

    返回：
    - 可直接传给第三方授权 URL 的 state 字符串。
    """
    provider = _ensure_supported_provider(provider)
    normalized_mode = "bind" if str(mode or "").strip().lower() == "bind" else "login"
    now_ts = int(_utc_now().timestamp())
    payload = {
        "provider": provider,
        "mode": normalized_mode,
        "username": str(username or "").strip() if normalized_mode == "bind" else "",
        "nonce": secrets.token_urlsafe(18),
        "iat": now_ts,
        "exp": now_ts + OAUTH_STATE_TTL_SECONDS,
    }
    payload_text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    encoded_payload = _urlsafe_b64encode(payload_text.encode("utf-8"))
    return f"{encoded_payload}.{_sign_payload(encoded_payload)}"


def parse_oauth_state(state: str, expected_provider: str) -> Dict[str, Any]:
    """校验 OAuth state 签名、provider 与过期时间并返回 payload。"""
    expected_provider = _ensure_supported_provider(expected_provider)
    try:
        encoded_payload, signature = str(state or "").split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth state 无效") from exc

    expected_signature = _sign_payload(encoded_payload)
    if not hmac.compare_digest(signature, expected_signature):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth state 校验失败")

    try:
        payload = json.loads(_urlsafe_b64decode(encoded_payload).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth state 解析失败") from exc

    if str(payload.get("provider") or "") != expected_provider:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth provider 不匹配")
    if int(payload.get("exp") or 0) < int(_utc_now().timestamp()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth state 已过期，请重新发起登录")
    return payload


def build_authorization_url(provider: str, *, mode: str = "login", username: str = "") -> str:
    """构建第三方 OAuth 授权 URL。"""
    config = _oauth_config(provider)
    state = create_oauth_state(provider, mode=mode, username=username)
    params = {
        "client_id": config["client_id"],
        "redirect_uri": config["redirect_uri"],
        "response_type": "code",
        "scope": config["scope"],
        "state": state,
    }
    if provider == "google":
        params.update({"access_type": "online", "prompt": "select_account"})
    return f"{config['auth_url']}?{urlencode(params)}"


async def _exchange_code_for_token(provider: str, code: str) -> str:
    """使用授权码向 provider 换取一次性 access token。"""
    config = _oauth_config(provider)
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            config["token_url"],
            data={
                "client_id": config["client_id"],
                "client_secret": config["client_secret"],
                "code": code,
                "redirect_uri": config["redirect_uri"],
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
        )
    if response.status_code >= 400:
        logger.warning("OAuth token exchange failed: provider=%s status=%s", provider, response.status_code)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="第三方授权码换取失败")

    payload = response.json()
    token = str(payload.get("access_token") or "").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="第三方授权响应缺少 access_token")
    return token


async def _fetch_google_profile(access_token: str) -> OAuthProfile:
    """拉取并规范化 Google 用户资料。"""
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google 用户资料获取失败")
    data = response.json()
    provider_user_id = str(data.get("sub") or "").strip()
    if not provider_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google 用户资料缺少 sub")
    return {
        "provider": "google",
        "provider_user_id": provider_user_id,
        "email": str(data.get("email") or "").strip().lower(),
        "email_verified": bool(data.get("email_verified")),
        "display_name": _normalize_display_name(data.get("name") or data.get("email") or "Google User"),
        "avatar_url": str(data.get("picture") or "").strip(),
    }


async def _fetch_github_profile(access_token: str) -> OAuthProfile:
    """拉取并规范化 GitHub 用户资料，补充 primary verified email。"""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        profile_response = await client.get("https://api.github.com/user", headers=headers)
        emails_response = await client.get("https://api.github.com/user/emails", headers=headers)

    if profile_response.status_code >= 400:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="GitHub 用户资料获取失败")

    profile = profile_response.json()
    emails = emails_response.json() if emails_response.status_code < 400 else []
    verified_email = ""
    if isinstance(emails, list):
        primary = [item for item in emails if item.get("primary") and item.get("verified")]
        verified = primary or [item for item in emails if item.get("verified")]
        if verified:
            verified_email = str(verified[0].get("email") or "").strip().lower()

    provider_user_id = str(profile.get("id") or "").strip()
    if not provider_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="GitHub 用户资料缺少 id")

    display_name = profile.get("name") or profile.get("login") or verified_email or "GitHub User"
    return {
        "provider": "github",
        "provider_user_id": provider_user_id,
        "email": verified_email,
        "email_verified": bool(verified_email),
        "display_name": _normalize_display_name(display_name),
        "avatar_url": str(profile.get("avatar_url") or "").strip(),
    }


async def fetch_oauth_profile(provider: str, code: str) -> OAuthProfile:
    """完成 code 换 token 并获取规范化 profile。"""
    provider = _ensure_supported_provider(provider)
    access_token = await _exchange_code_for_token(provider, str(code or "").strip())
    if provider == "google":
        return await _fetch_google_profile(access_token)
    return await _fetch_github_profile(access_token)


def _get_oauth_account_sync(provider: str, provider_user_id: str) -> Optional[Dict[str, Any]]:
    """按 provider 身份查找已绑定的 OAuth 账号。"""
    with _db_connection() as conn:
        row = conn.execute(
            """
            SELECT id, user_id, provider, provider_user_id, email, email_verified, display_name, avatar_url, created_at, updated_at
            FROM oauth_accounts
            WHERE provider = ? AND provider_user_id = ?
            """,
            (provider, provider_user_id),
        ).fetchone()
        return dict(row) if row else None


def list_user_oauth_accounts_sync(username: str) -> list[Dict[str, Any]]:
    """列出当前本地用户已绑定的第三方账号（不含任何 token）。"""
    user = _get_user_by_username_sync(username)
    if not user:
        return []
    with _db_connection() as conn:
        rows = conn.execute(
            """
            SELECT provider, provider_user_id, email, email_verified, display_name, avatar_url, created_at, updated_at
            FROM oauth_accounts
            WHERE user_id = ?
            ORDER BY provider ASC
            """,
            (int(user.get("id") or 0),),
        ).fetchall()
        return [dict(row) for row in rows]


def _is_oauth_bindable_user(user: Dict[str, Any]) -> bool:
    """判断本地用户是否允许自动/手动绑定第三方账号。"""
    username = str(user.get("username") or "").strip()
    lowered_username = username.lower()
    role = normalize_role(str(user.get("role") or ""), username)
    reserved = {ADMIN_USERNAME, GUEST_USERNAME, "guest", "user", "admin", *RESERVED_USERNAMES}
    return bool(role == ROLE_REGISTERED and lowered_username not in reserved)


def _assert_oauth_bindable_user(user: Dict[str, Any]) -> None:
    """拒绝管理员、游客和保留名账号绑定 OAuth。"""
    if not _is_oauth_bindable_user(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="该账号不支持绑定第三方账号")


def _cleanup_expired_tickets_locked(now_ts: int) -> None:
    """清理内存中的过期 OAuth ticket。调用方需持有 _ticket_lock。"""
    expired = [ticket for ticket, data in _oauth_tickets.items() if int(data.get("exp") or 0) <= now_ts]
    for ticket in expired:
        _oauth_tickets.pop(ticket, None)


def create_oauth_ticket(kind: str, provider: str, payload: Dict[str, Any]) -> str:
    """创建短期一次性 OAuth ticket，明文只通过前端 URL 传递一次。"""
    normalized_kind = "bind" if str(kind or "").strip().lower() == "bind" else "login"
    normalized_provider = _ensure_supported_provider(provider)
    now_ts = int(_utc_now().timestamp())
    ticket = secrets.token_urlsafe(32)
    with _ticket_lock:
        _cleanup_expired_tickets_locked(now_ts)
        _oauth_tickets[ticket] = {
            "kind": normalized_kind,
            "provider": normalized_provider,
            "payload": payload,
            "exp": now_ts + OAUTH_TICKET_TTL_SECONDS,
        }
    return ticket


def consume_oauth_ticket(kind: str, provider: str, ticket: str) -> Dict[str, Any]:
    """原子消费一次性 OAuth ticket，重复使用或过期均失败。"""
    normalized_kind = "bind" if str(kind or "").strip().lower() == "bind" else "login"
    normalized_provider = _ensure_supported_provider(provider)
    now_ts = int(_utc_now().timestamp())
    with _ticket_lock:
        _cleanup_expired_tickets_locked(now_ts)
        data = _oauth_tickets.get(str(ticket or "").strip())
        if not data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth ticket 无效或已过期")
        if data.get("kind") != normalized_kind or data.get("provider") != normalized_provider:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth ticket 类型不匹配")
        _oauth_tickets.pop(str(ticket or "").strip(), None)
    return dict(data.get("payload") or {})


def _get_user_by_username_sync(username: str) -> Optional[Dict[str, Any]]:
    """按 username 查询本地用户，避免 oauth 模块反向依赖 routes。"""
    with _db_connection() as conn:
        row = conn.execute(
            """
            SELECT id, username, display_name, password_hash, role, avatar_index, email, email_verified, created_at
            FROM users
            WHERE username = ?
            """,
            (str(username or "").strip(),),
        ).fetchone()
        return dict(row) if row else None


def _create_oauth_user_sync(profile: OAuthProfile) -> Dict[str, Any]:
    """为首次 OAuth 登录创建本地 registered 用户并返回用户记录。"""
    now_iso = _iso(_utc_now())
    email = str(profile.get("email") or "").strip().lower()
    display_name = _normalize_display_name(profile.get("display_name") or email.split("@", 1)[0] or "OAuth User")
    provider = str(profile.get("provider") or "").strip().lower()
    provider_user_id = str(profile.get("provider_user_id") or "").strip()
    password_marker = f"{OAUTH_PASSWORD_MARKER_PREFIX}:{provider}:{provider_user_id}"

    with _db_connection() as conn:
        username = _generate_account_username_sync(conn, email, display_name)
        cursor = conn.execute(
            """
            INSERT INTO users (username, display_name, password_hash, role, avatar_index, email, email_verified, created_at)
            VALUES (?, ?, ?, 'registered', ?, ?, ?, ?)
            """,
            (
                username,
                display_name,
                password_marker,
                0,
                email,
                1 if profile.get("email_verified") else 0,
                now_iso,
            ),
        )
        user_id = int(cursor.lastrowid)
        _insert_oauth_account_with_conn(conn, user_id, profile, now_iso)
        conn.commit()
    user = _get_user_by_id_sync(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="OAuth 用户创建后读取失败")
    return user


def _insert_oauth_account_with_conn(conn, user_id: int, profile: OAuthProfile, now_iso: str) -> None:
    """在已有事务中插入 OAuth 绑定记录。"""
    conn.execute(
        """
        INSERT INTO oauth_accounts (
            user_id, provider, provider_user_id, email, email_verified, display_name, avatar_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            int(user_id),
            str(profile.get("provider") or "").strip().lower(),
            str(profile.get("provider_user_id") or "").strip(),
            str(profile.get("email") or "").strip().lower(),
            1 if profile.get("email_verified") else 0,
            _normalize_display_name(profile.get("display_name") or ""),
            str(profile.get("avatar_url") or "").strip(),
            now_iso,
            now_iso,
        ),
    )


def _link_oauth_to_user_sync(user: Dict[str, Any], profile: OAuthProfile) -> Dict[str, Any]:
    """将 provider 身份绑定到指定本地用户，并返回最新用户记录。"""
    now_iso = _iso(_utc_now())
    user_id = int(user.get("id") or 0)
    if user_id <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="本地用户无效，无法绑定第三方账号")

    with _db_connection() as conn:
        _insert_oauth_account_with_conn(conn, user_id, profile, now_iso)
        conn.commit()
    refreshed = _get_user_by_id_sync(user_id)
    if not refreshed:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="OAuth 绑定后读取用户失败")
    return refreshed


def resolve_oauth_login_user_sync(profile: OAuthProfile) -> Dict[str, Any]:
    """
    OAuth 登录/自动注册入口。

    处理顺序：已绑定 identity → verified email 自动绑定已有用户 → 创建新 registered 用户。
    """
    provider = str(profile.get("provider") or "").strip().lower()
    provider_user_id = str(profile.get("provider_user_id") or "").strip()
    account = _get_oauth_account_sync(provider, provider_user_id)
    if account:
        user = _get_user_by_id_sync(int(account.get("user_id") or 0))
        if user:
            return user
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="第三方账号绑定的本地用户不存在")

    email = str(profile.get("email") or "").strip().lower()
    if email and profile.get("email_verified"):
        existing_user = _get_user_by_email_sync(email)
        if existing_user:
            _assert_oauth_bindable_user(existing_user)
            return _link_oauth_to_user_sync(existing_user, profile)

    if not email or not profile.get("email_verified"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="第三方账号缺少已验证邮箱，无法自动注册或绑定")

    return _create_oauth_user_sync(profile)


def bind_oauth_account_to_username_sync(username: str, profile: OAuthProfile) -> Dict[str, Any]:
    """将 OAuth 账号绑定到当前已登录本地用户。"""
    user = _get_user_by_username_sync(username)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="当前用户不存在，无法绑定第三方账号")

    _assert_oauth_bindable_user(user)

    provider = str(profile.get("provider") or "").strip().lower()
    provider_user_id = str(profile.get("provider_user_id") or "").strip()
    account = _get_oauth_account_sync(provider, provider_user_id)
    if account:
        if int(account.get("user_id") or 0) == int(user.get("id") or 0):
            return user
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该第三方账号已绑定其他 WebGIS 用户")

    if not profile.get("email_verified"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="第三方账号邮箱未验证，无法绑定")

    email = str(profile.get("email") or "").strip().lower()
    if email:
        email_owner = _get_user_by_email_sync(email)
        if email_owner and int(email_owner.get("id") or 0) != int(user.get("id") or 0):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该第三方邮箱已属于其他 WebGIS 用户")

    return _link_oauth_to_user_sync(user, profile)


def unlink_oauth_account_sync(username: str, provider: str) -> None:
    """解绑当前用户的指定第三方账号。"""
    provider = _ensure_supported_provider(provider)
    user = _get_user_by_username_sync(username)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="当前用户不存在")
    _assert_oauth_bindable_user(user)
    with _db_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM oauth_accounts WHERE user_id = ? AND provider = ?",
            (int(user.get("id") or 0), provider),
        )
        conn.commit()
    if int(cursor.rowcount or 0) <= 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="尚未绑定该第三方账号")


def build_frontend_redirect(success: bool, params: Dict[str, Any]) -> str:
    """构建固定前端 OAuth 回调跳转 URL，兼容 hash router。"""
    default_success = "http://localhost:5173/#/oauth/callback"
    default_failure = "http://localhost:5173/#/register"
    base_url = str(
        os.getenv("FRONTEND_OAUTH_SUCCESS_URL" if success else "FRONTEND_OAUTH_FAILURE_URL")
        or (default_success if success else default_failure)
    ).strip()
    safe_params = {key: value for key, value in params.items() if value is not None and str(value) != ""}
    query = urlencode(safe_params)
    if not query:
        return base_url

    if "#" in base_url:
        prefix, hash_part = base_url.split("#", 1)
        separator = "&" if "?" in hash_part else "?"
        return f"{prefix}#{hash_part}{separator}{query}"
    separator = "&" if "?" in base_url else "?"
    return f"{base_url}{separator}{query}"


def serialize_oauth_user_payload(user: Dict[str, Any]) -> str:
    """将公开用户信息 JSON 序列化为 URL 参数可承载字符串。"""
    return json.dumps(user, ensure_ascii=False, separators=(",", ":"))
