"""
认证路由处理函数。
"""

import asyncio
import hmac
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request, status

from .constants import (
    ADMIN_USERNAME,
    GUEST_PASSWORD,
    GUEST_USERNAME,
    PASSWORD_PATTERN,
    RESERVED_USERNAMES,
    ROLE_ADMIN,
    ROLE_GUEST,
    ROLE_REGISTERED,
    USERNAME_PATTERN,
    _build_guest_uid,
    _extract_client_ip,
    _get_admin_password,
    _normalize_avatar_index,
    _normalize_guest_device_id,
    _normalize_username,
    _validate_register_payload,
    normalize_role,
    resolve_quota_subject,
)
from .db import AUTH_DB_PATH
from .dependencies import require_login
from .models import (
    ChangeAvatarRequest,
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    UpdatePreferencesRequest,
)
from .preferences import _get_user_preferences_sync, _upsert_user_preferences_sync
from .quota import get_user_quota_snapshot_sync
from .schema import init_auth_storage
from .session import (
    _create_session_sync,
    _delete_session_sync,
    _delete_sessions_by_username_sync,
    _update_user_avatar_index_sync,
    _update_user_password_sync,
)
from .system_config import _set_admin_avatar_index_sync
from .password import _verify_password
from .user import _create_user_sync, _get_or_create_guest_username_sync, _get_user_sync, _record_login_sync

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register")
async def register_user(payload: RegisterRequest) -> Dict[str, Any]:
    """
    功能：注册普通用户账号。

    参数：
    - payload.username: 用户名（3-24 位，字母数字下划线）。
    - payload.password: 密码（6-64 位，需含字母和数字）。
    - payload.avatar_index: 初始头像索引。

    返回：
    - 注册结果、用户基础信息（username/role/avatar_index）。
    """
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

    preferences = await asyncio.to_thread(_get_user_preferences_sync, username)

    return {
        "status": "success",
        "message": "注册成功，请使用新账号登录",
        "user": {
            "username": username,
            "role": ROLE_REGISTERED,
            "avatar_index": avatar_index,
        },
        "preferences": preferences,
    }


@router.get("/check-username")
async def check_username_availability(username: str = "") -> Dict[str, Any]:
    """
    功能：检查用户名是否可注册。

    参数：
    - username: 待检测用户名。

    返回：
    - available: 是否可用。
    - message: 可读原因（保留名/格式错误/已存在等）。
    """
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
    """
    功能：用户登录（游客 / 注册用户 / 管理员）。

    参数：
    - payload.username/password: 登录凭证。
    - payload.guest_device_id: 游客设备标识（游客模式可选）。

    返回：
    - token: 会话令牌。
    - user: 登录后用户信息。
    - quota: 当前角色配额快照。

    处理过程：
    1. 根据用户名分支鉴权（guest/admin/registered）；
    2. 创建会话并记录登录；
    3. 返回 token 与配额信息。
    """
    await init_auth_storage()

    username = _normalize_username(payload.username)
    password = str(payload.password or "")

    if not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请输入密码",
        )

    normalized_username = username.lower()
    request_ip = _extract_client_ip(request)
    request_user_agent = str(request.headers.get("User-Agent", "unknown"))
    guest_uid = ""
    guest_device_id = ""

    if normalized_username == GUEST_USERNAME and hmac.compare_digest(password, GUEST_PASSWORD):
        guest_device_id = _normalize_guest_device_id(payload.guest_device_id)
        guest_uid = _build_guest_uid(request_ip, request_user_agent, guest_device_id)

        # 获取或创建游客记录，获得实际的用户名（如 "user_1", "user_2" 等）
        resolved_username = await asyncio.to_thread(_get_or_create_guest_username_sync, guest_uid)
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
        request_ip,
        request_user_agent,
        guest_uid,
        guest_device_id,
    )

    await asyncio.to_thread(_record_login_sync, resolved_username)
    quota_subject = resolve_quota_subject(
        resolved_username,
        resolved_role,
        session.get("guest_uid"),
    )
    quota = await asyncio.to_thread(
        get_user_quota_snapshot_sync,
        resolved_username,
        resolved_role,
        quota_subject,
    )
    preferences = await asyncio.to_thread(_get_user_preferences_sync, resolved_username)

    return {
        "status": "success",
        "message": "登录成功",
        "token": session["token"],
        "user": {
            "username": resolved_username,
            "role": resolved_role,
            "guest_uid": str(session.get("guest_uid") or ""),
            "avatar_index": resolved_avatar_index,
            "created_at": session["created_at"],
            "expires_at": session["expires_at"],
        },
        "preferences": preferences,
        "quota": quota,
    }


@router.get("/me")
async def get_current_user(session: Dict[str, Any] = Depends(require_login)) -> Dict[str, Any]:
    """
    功能：获取当前登录用户信息与配额快照。

    参数：
    - session: 当前会话（由 `require_login` 注入）。

    返回：
    - user: 用户名、角色、头像、会话时间信息。
    - quota: 当日配额使用情况。
    """
    username = str(session.get("username") or "")
    role = str(session.get("role") or "")
    quota_subject = resolve_quota_subject(username, role, session.get("guest_uid"))

    quota = await asyncio.to_thread(get_user_quota_snapshot_sync, username, role, quota_subject)
    preferences = await asyncio.to_thread(_get_user_preferences_sync, username)

    return {
        "status": "success",
        "user": {
            "username": username,
            "role": normalize_role(role, username),
            "guest_uid": str(session.get("guest_uid") or ""),
            "avatar_index": 0,
            "session_created_at": session.get("created_at"),
            "expires_at": session.get("expires_at"),
            "is_temporary": bool(session.get("is_temporary")),
            "temporary_credential": str(session.get("temporary_credential") or ""),
        },
        "preferences": preferences,
        "quota": quota,
        "guest_allow": bool(session.get("guest_allow")),
    }


@router.post("/logout")
async def logout_user(session: Dict[str, Any] = Depends(require_login)) -> Dict[str, Any]:
    """功能：注销当前登录会话。"""
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
    """
    功能：修改当前注册用户密码。

    参数：
    - payload.current_password: 当前密码。
    - payload.new_password: 新密码。

    返回：
    - 修改成功消息。

    处理过程：
    1. 校验身份与角色（游客/管理员禁止）；
    2. 校验旧密码和新密码规则；
    3. 更新密码并注销该账号全部会话。
    """
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


@router.post("/change-avatar")
async def change_avatar(
    payload: ChangeAvatarRequest,
    session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
    """
    功能：修改当前账号头像索引（注册用户 + 管理员）。

    参数：
    - payload.new_avatar_index: 头像索引（0~MAX_AVATAR_INDEX）。

    返回：
    - 更新结果与 avatar_index。

    处理过程：
    1. 校验登录态与角色；
    2. 校验头像索引范围；
    3. 写库并返回结果。
    """
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
            detail="游客账号不支持修改头像",
        )

    new_avatar_index = _normalize_avatar_index(payload.new_avatar_index)

    if role == ROLE_ADMIN:
        await asyncio.to_thread(_set_admin_avatar_index_sync, new_avatar_index)
        updated = True
    else:
        updated = await asyncio.to_thread(_update_user_avatar_index_sync, username, new_avatar_index)

    if not updated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="头像更新失败，请稍后重试",
        )

    return {
        "status": "success",
        "message": "头像已更新",
        "avatar_index": new_avatar_index,
    }


@router.get("/preferences")
async def get_user_preferences(
    session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
    """功能：读取当前用户偏好设置。"""
    username = str(session.get("username") or "").strip()
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录状态异常，请重新登录",
        )

    preferences = await asyncio.to_thread(_get_user_preferences_sync, username)
    return {
        "status": "success",
        "preferences": preferences,
    }


@router.post("/preferences")
async def update_user_preferences(
    payload: UpdatePreferencesRequest,
    session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
    """功能：更新当前用户偏好设置并持久化。"""
    username = str(session.get("username") or "").strip()
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录状态异常，请重新登录",
        )

    updates: Dict[str, Any] = {}
    if payload.default_basemap is not None:
        updates["default_basemap"] = payload.default_basemap
    if payload.language is not None:
        updates["language"] = payload.language
    if payload.unit_system is not None:
        updates["unit_system"] = payload.unit_system
    if payload.preferred_agent_model is not None:
        updates["preferred_agent_model"] = payload.preferred_agent_model

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="未提供可更新的偏好字段",
        )

    preferences = await asyncio.to_thread(_upsert_user_preferences_sync, username, updates)
    return {
        "status": "success",
        "message": "偏好设置已保存",
        "preferences": preferences,
    }


@router.get("/storage-path")
async def get_auth_storage_path() -> Dict[str, Any]:
    """
    功能：调试接口，返回当前认证数据库路径。

    返回：
    - path: 认证数据库实际文件路径。
    """
    return {
        "status": "success",
        "path": str(AUTH_DB_PATH),
    }
