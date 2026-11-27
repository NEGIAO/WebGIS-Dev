"""
FastAPI 依赖注入：require_login、require_account、require_api_access、require_admin、
require_api_access_or_guest。
"""

import asyncio
import logging
import secrets
from datetime import timedelta
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request, status

from .constants import (
    ROLE_ADMIN,
    ROLE_GUEST,
    _derive_uid_from_ip_ua,
    _extract_client_ip,
    _extract_identity_ip,
    _extract_token,
    _normalize_guest_device_id,
    normalize_role,
    resolve_quota_subject,
)
from .db import _iso, _utc_now
from .guest_token import (
    GUEST_TOKEN_COOKIE_NAME,
    peek_guest_token_uid,
    verify_guest_token_active,
)
from .quota import _consume_api_quota_sync
from .session import _create_session_sync, _get_session_sync
from .user import _get_or_create_guest_username_sync

logger = logging.getLogger(__name__)


# ==================== 活跃追踪辅助 ====================

def _mark_active_safe(session: Dict[str, Any], request: Optional[Request] = None) -> None:
    """安全地标记用户活跃（不阻塞认证流程），透传标签页 client_id 与设备 ID。"""
    try:
        from api.realtime_stats import (
            device_presence_id,
            mark_presence_active,
            normalize_client_id,
            session_signature,
        )

        client_id = ""
        dev_pid = ""
        raw_guest_device_id = session.get("guest_device_id")
        token = str(session.get("token") or "")
        if request is not None:
            client_id = normalize_client_id(
                request.headers.get("X-Presence-Client-Id")
                or request.query_params.get("client_id")
            )
            raw_guest_device_id = (
                request.headers.get("X-Guest-Device-Id")
                or request.query_params.get("guest_device_id")
                or session.get("guest_device_id")
            )
            dev_pid = device_presence_id(raw_guest_device_id)
            if not token:
                token = _extract_token(request)
        elif session.get("guest_device_id"):
            dev_pid = device_presence_id(session.get("guest_device_id"))

        mark_presence_active(
            session,
            client_id=client_id,
            session_sig=session_signature(token),
            device_presence_id_val=dev_pid,
            guest_device_id=raw_guest_device_id,
        )
    except Exception:
        pass


# ==================== 结构化错误 detail ====================

def _auth_error_detail(code: str, message: str) -> Dict[str, Any]:
    """构建结构化认证错误响应体，前端根据 code 字段做差异化处理。"""
    return {"code": code, "message": message}


def _extract_guest_token(request: Request) -> str:
    """提取游客身份签名 token：优先 X-Guest-Token 头，其次 webgis_guest Cookie。

    V3.7.6 游客身份治理：token 由 POST /auth/guest/session 签发（HMAC），
    是无登录会话下唯一受信任的稳定身份来源；无效/过期由 verify_guest_token
    统一返回 None，调用方回落确定性派生桶。
    """
    header_token = str(request.headers.get("X-Guest-Token") or "").strip()
    if header_token:
        return header_token
    try:
        return str(request.cookies.get(GUEST_TOKEN_COOKIE_NAME) or "").strip()
    except Exception:
        return ""


async def _build_temporary_guest_session_async(request: Request) -> Dict[str, Any]:
    request_ip = _extract_client_ip(request)
    request_user_agent = str(request.headers.get("User-Agent", "unknown"))
    guest_device_id = _normalize_guest_device_id(
        request.headers.get("X-Guest-Device-Id")
        or request.query_params.get("guest_device_id")
    )
    # V3.7.6 游客身份治理：身份优先取已验签 guest token（签发通道下发）；
    # 无 token 时按确定性桶 H(身份IP|UA) 派生。device_id 不再参与无 token
    # 场景的桶派生——轮换设备头无法绕过配额（展示/在线去重仍用 device_id）。
    presented_token = _extract_guest_token(request)
    guest_uid = verify_guest_token_active(presented_token) if presented_token else None
    if not guest_uid and presented_token and peek_guest_token_uid(presented_token):
        # 签名有效但已过期/被撤销：不能再静默回落派生桶（那会让被管理员删除的
        # 游客继续以“新身份”浏览），必须返回结构化 401 让前端统一登出并跳注册页。
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_auth_error_detail("SESSION_EXPIRED", "会话过期，请重新登陆"),
        )
    if not guest_uid:
        guest_uid = _derive_uid_from_ip_ua(_extract_identity_ip(request), request_user_agent)
    guest_record = await asyncio.to_thread(_get_or_create_guest_username_sync, guest_uid)
    # _get_or_create_guest_username_sync 返回 {username, no}：no 为游客展示序号
    # （guest_identity_records.id 自增）。随会话对象内存传递，
    # _public_user_payload 优先读它，避免每次构造 payload 都回查库
    username = str(guest_record.get("username") or "") if isinstance(guest_record, dict) else str(guest_record)
    guest_no = int(guest_record.get("no") or 0) if isinstance(guest_record, dict) else 0

    now = _utc_now()
    expires_at = now + timedelta(hours=2)
    temporary_credential = f"guest_tmp_{secrets.token_urlsafe(12)}"

    return {
        "token": "",
        "username": username,
        "role": ROLE_GUEST,
        "guest_uid": guest_uid,
        "guest_device_id": guest_device_id,
        "guest_no": max(0, guest_no),
        "ip": request_ip,
        "user_agent": request_user_agent,
        "created_at": _iso(now),
        "expires_at": _iso(expires_at),
        "is_temporary": True,
        "guest_allow": True,
        "temporary_credential": temporary_credential,
    }


async def _resolve_session_with_options(
    request: Request,
    *,
    touch_presence: bool,
    update_last_seen: bool,
) -> Dict[str, Any]:
    token = _extract_token(request)
    if not token:
        # V3.7.6 游客身份治理：require_login 恢复 fail-closed。游客可达端点已显式
        # 声明 or_guest 系依赖；本依赖不再凭 ?s=1 / X-Share-Mode / 设备头铸造临时
        # 游客会话（原 GUEST_NO_TOKEN 通道曾被任意匿名请求借用为身份铸造口）。
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_auth_error_detail("LOGIN_REQUIRED", "该功能需要登录后使用，请登录或注册"),
        )

    try:
        session = await asyncio.to_thread(_get_session_sync, token, False, update_last_seen)
    except Exception as e:
        logger.error("require_login: 会话查询失败: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_auth_error_detail("SESSION_ERROR", "会话验证失败，请重新登录"),
        )

    if session is None:
        # V3.7.6：过期/无效 token 一律 401 提示重新登录，不再静默降级游客
        # （游客兜底已收敛到 or_guest 系依赖 + /auth/guest/session 签发通道）。
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_auth_error_detail("SESSION_EXPIRED", "登录状态已失效，请重新登录"),
        )

    if touch_presence:
        _mark_active_safe(session, request)
    return session


async def require_login(request: Request) -> Dict[str, Any]:
    return await _resolve_session_with_options(
        request,
        touch_presence=True,
        update_last_seen=True,
    )


async def require_login_for_logout(request: Request) -> Dict[str, Any]:
    """注销专用登录校验：校验当前会话但不触发在线标活或 last_seen_at 写入。"""
    return await _resolve_session_with_options(
        request,
        touch_presence=False,
        update_last_seen=False,
    )


async def resolve_optional_session(request: Request) -> Optional[Dict[str, Any]]:
    """可选鉴权：token 有效返回会话；无 token/会话失效/查询异常一律返回 None。
    供访问追踪等"有身份更好、没身份也行"的端点使用，不消耗配额，不触发在线标活。"""
    token = _extract_token(request)
    if not token:
        return None
    try:
        return await asyncio.to_thread(_get_session_sync, token, False, False)
    except Exception:
        logger.debug("可选鉴权：会话查询失败", exc_info=True)
        return None


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
            detail=_auth_error_detail(
                "QUOTA_EXCEEDED",
                f"今日 API 调用额度已用完（{used}/{limit}），请明日再试或使用更高权限账号",
            ),
        )

    session["quota"] = quota
    session["quota_subject"] = quota.get("quota_subject")
    return session


async def _authenticate_login_or_guest(
    request: Request, *, touch_presence: bool = True
) -> Dict[str, Any]:
    """认证核心：登录 token 有效则用登录身份，否则自动创建临时 guest session。不消耗配额。

    touch_presence=False 专供只读统计端点：查询人数本身不得反过来制造“有人在线”，
    否则管理端诊断/对账拉取会把幽灵身份计入在线。
    """
    token = _extract_token(request)
    session = None
    expired_login_token = False
    session_query_failed = False

    if token:
        try:
            session = await asyncio.to_thread(_get_session_sync, token, False, True)
        except Exception as e:
            # DB 暂不可用不是“token 过期”，不能据此把用户强制登出。
            session_query_failed = True
            logger.error("require_api_access_or_guest: 会话查询失败: %s", str(e), exc_info=True)
        if session is None and not session_query_failed:
            expired_login_token = True

    if session is None:
        if expired_login_token:
            # 管理员/注册用户 token 过期或被删：绝不能在游客可达端点静默降级为游客，
            # 否则 /auth/me、/statistics/realtime 等永远拿不到 401，前端无法触发
            # 统一的“会话过期 → 提示 → 跳 /register”流程。三类身份在此统一失败。
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=_auth_error_detail("SESSION_EXPIRED", "会话过期，请重新登陆"),
            )
        # 真正无登录 token 时才创建临时 guest session
        session = await _build_temporary_guest_session_async(request)

    if bool(session.get("requires_email_binding")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_auth_error_detail("EMAIL_BINDING_REQUIRED", "请先绑定并验证邮箱后再使用完整功能"),
        )

    if touch_presence:
        _mark_active_safe(session, request)
    return session


async def require_api_access_or_guest(request: Request) -> Dict[str, Any]:
    """与 require_api_access 相同，但无 token 时自动创建 guest session 而非 401。
    适用于允许游客有限使用的端点（天气、搜索、AI 等）。每次调用消耗配额。"""
    session = await _authenticate_login_or_guest(request)

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


async def require_api_access_or_guest_noconsume(request: Request) -> Dict[str, Any]:
    """认证但不消耗配额：适用于只读状态查询端点（chat config / models / user-config）。
    与 require_api_access_or_guest 的唯一差异是不调用 _consume_api_quota_sync。"""
    return await _authenticate_login_or_guest(request)


async def require_api_access_or_guest_readonly(request: Request) -> Dict[str, Any]:
    """纯只读统计端点专用：既不消耗配额，也不写入在线 tracker。

    在线 liveness 只能由 /statistics/presence/ping 的显式客户端心跳产生；
    SSE ticket、统计对账拉取等读操作不得反向标活，避免诊断请求/脚本抬高人数。
    """
    return await _authenticate_login_or_guest(request, touch_presence=False)


async def require_account(request: Request) -> Dict[str, Any]:
    """账号级端点依赖：必须是登录会话且**不是游客**。

    背景（V3.7.12）：游客 token 也登记在 sessions 表，`require_login` 只看表里
    有没有行、不看 role，导致游客 Bearer 能穿过账号级端点（改密、绑邮箱、
    个人 Agent 配置等）。账号级语义一律用本依赖，游客访问返回 403。
    """
    session = await require_login(request)
    if normalize_role(session.get("role"), session.get("username")) == ROLE_GUEST:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_auth_error_detail("ACCOUNT_REQUIRED", "该功能需要注册账号后使用"),
        )
    return session


async def require_admin(request: Request) -> Dict[str, Any]:
    session = await require_api_access(request)

    if normalize_role(session.get("role"), session.get("username")) != ROLE_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="仅管理员可访问此接口",
        )

    return session
