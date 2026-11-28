"""
FastAPI 依赖注入：require_login、require_account、require_api_access、require_admin、
require_api_access_or_guest。
"""

import asyncio
import logging
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request, status

from .constants import (
    ROLE_ADMIN,
    ROLE_GUEST,
    _extract_token,
    normalize_role,
    resolve_quota_subject,
)
from .db import _iso, _utc_now
from .guest_token import (
    GUEST_TOKEN_COOKIE_NAME,
    GuestTokenDbUnavailable,
    verify_guest_token_active_strict,
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
    是无登录会话下唯一受信任的稳定身份来源；缺失或无效一律由调用方
    fail-closed 返回 401，不再回落确定性派生桶。
    """
    header_token = str(request.headers.get("X-Guest-Token") or "").strip()
    if header_token:
        return header_token
    try:
        return str(request.cookies.get(GUEST_TOKEN_COOKIE_NAME) or "").strip()
    except Exception:
        return ""


async def _build_temporary_guest_session_async(request: Request) -> Dict[str, Any]:
    """V3.7.16：游客身份必须来自 sessions 有效 token；无 token 一律拒绝。

    身份铸造唯一入口是 POST /auth/guest/session（受 (身份IP, UA) 限频），
    前端仅在 ?s=1 分享模式无感签发。原 H(身份IP|UA) 派生临时桶（token=""）
    不写 sessions、管理员不可撤销，已废除。
    """
    presented_token = _extract_guest_token(request)
    if not presented_token:
        # 无 token：不派生、不落库。前端在 s=1 场景据此自动签发后重试；
        # 其它场景提示需要登录（结构码由前端区分，不跳 register）。
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_auth_error_detail("GUEST_TOKEN_REQUIRED", "请先获取访客身份或登录"),
        )
    try:
        guest_uid = verify_guest_token_active_strict(presented_token)
    except GuestTokenDbUnavailable:
        # V3.7.16：DB 抖动不是 token 失效，禁止误判为 SESSION_EXPIRED 强制登出。
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_auth_error_detail("AUTH_DB_UNAVAILABLE", "认证服务暂时不可用，请稍后重试"),
        )
    if not guest_uid:
        # 签名有效但已过期/sessions 无行（被管理员撤销）→ 强制登出跳注册页。
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_auth_error_detail("SESSION_EXPIRED", "会话过期，请重新登陆"),
        )
    # 从 sessions 读取该 token 的真实会话字段（唯一真值），不再内存虚构凭据。
    try:
        session = await asyncio.to_thread(
            _get_session_sync, presented_token, False, True
        )
    except Exception as exc:
        logger.error("读取游客 session 失败: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_auth_error_detail("AUTH_DB_UNAVAILABLE", "认证服务暂时不可用，请稍后重试"),
        )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_auth_error_detail("SESSION_EXPIRED", "会话过期，请重新登陆"),
        )
    guest_record = await asyncio.to_thread(_get_or_create_guest_username_sync, guest_uid)
    guest_no = int(guest_record.get("no") or 0) if isinstance(guest_record, dict) else 0

    # token 保留真实值：_mark_active_safe 据此算 session_sig，P1 镜像刷新才能按指纹匹配。
    session["token"] = presented_token
    session["guest_no"] = max(0, guest_no)
    session["guest_allow"] = True
    # 兼容契约：/auth/me 与在线镜像仍读取这两个字段。游客现在来自 sessions
    # 有效 token，已不是旧「内存临时桶」，故显式输出 false / 空凭证，
    # 避免字段静默缺失导致下游读到与历史不同的 payload 形状。
    session["is_temporary"] = False
    session["temporary_credential"] = ""
    return session


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
    """认证核心：登录/游客 token 都必须命中 sessions 有效行，无 token 一律拒绝。

    V3.7.16：原「无 token 自动创建临时 guest session」通道已废除——该身份不写库、
    管理员不可撤销。身份铸造唯一入口是 POST /auth/guest/session（s=1 前端无感签发）。
    touch_presence=False 专供只读统计端点：查询人数本身不得反过来制造在线。
    """
    token = _extract_token(request)
    session = None
    expired_login_token = False
    session_query_failed = False

    if token:
        try:
            session = await asyncio.to_thread(_get_session_sync, token, False, True)
        except Exception as e:
            session_query_failed = True
            logger.error("require_api_access_or_guest: 会话查询失败: %s", str(e), exc_info=True)
        if session is None and not session_query_failed:
            expired_login_token = True

    if session is None:
        if expired_login_token:
            # 管理员/注册用户 token 过期或被删：强制登出跳 /register。
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=_auth_error_detail("SESSION_EXPIRED", "会话过期，请重新登陆"),
            )
        if session_query_failed:
            # DB 暂不可用既不是「token 过期」也不是「无 token」：返回 503 让前端稍后重试，
            # 绝不降级为匿名身份（那会绕开 sessions 唯一真值）。
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=_auth_error_detail("AUTH_DB_UNAVAILABLE", "认证服务暂时不可用，请稍后重试"),
            )
        # 无登录 token：校验游客 token（必须命中 sessions），否则 401。
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
