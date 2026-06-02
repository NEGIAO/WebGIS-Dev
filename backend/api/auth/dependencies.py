"""
FastAPI 依赖注入：require_login、require_api_access、require_admin。
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
from .schema import init_auth_storage
from .session import _create_session_sync, _get_session_sync
from .user import _get_or_create_guest_username_sync

logger = logging.getLogger(__name__)


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
    try:
        await init_auth_storage()
    except Exception as e:
        logger.error("require_login: 数据库初始化失败: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="数据库服务暂时不可用，请稍后重试",
        )

    token = _extract_token(request)
    if not token:
        if _is_guest_allow_request(request):
            return await _build_temporary_guest_session_async(request)

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="请先登录后再访问",
        )

    try:
        session = await asyncio.to_thread(_get_session_sync, token)
    except Exception as e:
        logger.error("require_login: 会话查询失败: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="会话验证失败，请重新登录",
        )

    if session is None:
        if _is_guest_allow_request(request):
            return await _build_temporary_guest_session_async(request)

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


async def require_admin(request: Request) -> Dict[str, Any]:
    session = await require_api_access(request)

    if normalize_role(session.get("role"), session.get("username")) != ROLE_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="仅管理员可访问此接口",
        )

    return session
