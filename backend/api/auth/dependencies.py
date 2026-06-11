"""
FastAPI 依赖注入：require_login、require_api_access、require_admin、require_api_access_or_guest。
"""

import asyncio
import logging
import secrets
from datetime import timedelta
from typing import Any, Dict

from fastapi import HTTPException, Request, status

from .constants import (
    ROLE_ADMIN,
    ROLE_GUEST,
    _build_guest_uid,
    _extract_client_ip,
    _extract_token,
    _is_guest_allow_request,
    _normalize_guest_device_id,
    normalize_role,
    resolve_quota_subject,
)
from .db import _iso, _utc_now
from .quota import _consume_api_quota_sync
from .session import _create_session_sync, _get_session_sync
from .user import _get_or_create_guest_username_sync

logger = logging.getLogger(__name__)


# ==================== 结构化错误 detail ====================

def _auth_error_detail(code: str, message: str) -> Dict[str, Any]:
    """构建结构化认证错误响应体，前端根据 code 字段做差异化处理。"""
    return {"code": code, "message": message}


async def _build_temporary_guest_session_async(request: Request) -> Dict[str, Any]:
    request_ip = _extract_client_ip(request)
    request_user_agent = str(request.headers.get("User-Agent", "unknown"))
    guest_device_id = _normalize_guest_device_id(
        request.headers.get("X-Guest-Device-Id")
        or request.query_params.get("guest_device_id")
    )
    guest_uid = _build_guest_uid(request_ip, request_user_agent, guest_device_id)
    username = await asyncio.to_thread(_get_or_create_guest_username_sync, guest_uid)

    now = _utc_now()
    expires_at = now + timedelta(hours=2)
    temporary_credential = f"guest_tmp_{secrets.token_urlsafe(12)}"

    return {
        "token": "",
        "username": username,
        "role": ROLE_GUEST,
        "guest_uid": guest_uid,
        "guest_device_id": guest_device_id,
        "ip": request_ip,
        "user_agent": request_user_agent,
        "created_at": _iso(now),
        "expires_at": _iso(expires_at),
        "is_temporary": True,
        "guest_allow": True,
        "temporary_credential": temporary_credential,
    }


async def require_login(request: Request) -> Dict[str, Any]:
    token = _extract_token(request)
    if not token:
        if _is_guest_allow_request(request):
            return await _build_temporary_guest_session_async(request)

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_auth_error_detail("GUEST_NO_TOKEN", "游客身份权限不足，请登录或注册后使用完整功能"),
        )

    try:
        session = await asyncio.to_thread(_get_session_sync, token)
    except Exception as e:
        logger.error("require_login: 会话查询失败: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_auth_error_detail("SESSION_ERROR", "会话验证失败，请重新登录"),
        )

    if session is None:
        if _is_guest_allow_request(request):
            return await _build_temporary_guest_session_async(request)

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_auth_error_detail("SESSION_EXPIRED", "登录状态已失效，请重新登录"),
        )

    return session


async def require_api_access(request: Request) -> Dict[str, Any]:
    session = await require_login(request)

    if bool(session.get("requires_email_binding")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_auth_error_detail("EMAIL_BINDING_REQUIRED", "请先绑定并验证邮箱后再使用完整功能"),
        )

    quota = await asyncio.to_thread(
        _consume_api_quota_sync,
        str(session.get("username") or ""),
        str(session.get("role") or ""),
        resolve_quota_subject(
            session.get("username"),
            session.get("role"),
            session.get("guest_uid"),
        ),
    )

    if not bool(quota.get("allowed")):
        limit = quota.get("limit")
        used = quota.get("used")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"今日 API 调用额度已用完（{used}/{limit}），请明日再试或使用更高权限账号",
        )

    session["quota"] = quota
    session["quota_subject"] = quota.get("quota_subject")
    return session


async def require_api_access_or_guest(request: Request) -> Dict[str, Any]:
    """与 require_api_access 相同，但无 token 时自动创建 guest session 而非 401。
    适用于允许游客有限使用的端点（天气、搜索、AI 等）。"""
    token = _extract_token(request)
    session = None

    if token:
        try:
            session = await asyncio.to_thread(_get_session_sync, token)
        except Exception as e:
            logger.error("require_api_access_or_guest: 会话查询失败: %s", str(e), exc_info=True)

    # 无有效 session 时，自动创建临时 guest session
    if session is None:
        session = await _build_temporary_guest_session_async(request)

    if bool(session.get("requires_email_binding")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_auth_error_detail("EMAIL_BINDING_REQUIRED", "请先绑定并验证邮箱后再使用完整功能"),
        )

    # 统一走配额检查
    quota = await asyncio.to_thread(
        _consume_api_quota_sync,
        str(session.get("username") or ""),
        str(session.get("role") or ""),
        resolve_quota_subject(
            session.get("username"),
            session.get("role"),
            session.get("guest_uid"),
        ),
    )

    if not bool(quota.get("allowed")):
        limit = quota.get("limit")
        used = quota.get("used")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_auth_error_detail(
                "QUOTA_EXCEEDED",
                f"今日 API 调用额度已用完（{used}/{limit}），请明日再试或注册使用更多额度",
            ),
        )

    session["quota"] = quota
    session["quota_subject"] = quota.get("quota_subject")
    return session


async def require_admin(request: Request) -> Dict[str, Any]:
    session = await require_api_access(request)

    if normalize_role(session.get("role"), session.get("username")) != ROLE_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="仅管理员可访问此接口",
        )

    return session
