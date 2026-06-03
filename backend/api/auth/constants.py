"""
认证模块常量、角色定义、正则验证、纯工具函数。

本模块为叶子依赖，不依赖数据库或 FastAPI。
"""

import hashlib
import logging
import os
import re
import secrets
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request, status

logger = logging.getLogger(__name__)

# ─── 角色常量 ───
ROLE_GUEST = "guest"
ROLE_REGISTERED = "registered"
ROLE_ADMIN = "admin"

# ─── 账号常量 ───
GUEST_USERNAME = "user"
GUEST_PASSWORD = "123"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD_ENV_NAME = "SUPER_USER"
DEFAULT_ADMIN_PASSWORD_LOCAL = "123456"
MAX_AVATAR_INDEX = 11

# ─── 偏好默认值 ───
DEFAULT_USER_LANGUAGE = "zh-CN"
DEFAULT_USER_UNIT_SYSTEM = "metric"

SUPPORTED_USER_LANGUAGES = {
    "zh-cn": "zh-CN",
    "en-us": "en-US",
}

SUPPORTED_UNIT_SYSTEMS = {
    "metric": "metric",
    "imperial": "imperial",
}

# ─── 会话/安全配置 ───
SESSION_EXPIRE_HOURS = int(os.getenv("AUTH_SESSION_EXPIRE_HOURS", "72"))
PASSWORD_HASH_ITERATIONS = int(os.getenv("AUTH_PASSWORD_HASH_ITERATIONS", "120000"))

# ─── 配额常量 ───
GUEST_DAILY_API_QUOTA = 100
REGISTERED_DAILY_API_QUOTA = 1000

# ─── 验证正则 ───
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{3,24}$")
PASSWORD_PATTERN = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).{6,64}$")
GUEST_DEVICE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]{6,128}$")

# ─── 保留名 ───
RESERVED_USERNAMES = {
    GUEST_USERNAME,
    ADMIN_USERNAME,
    "super_admin",
}


# ─── 游客设备 ID 规范化 ───
def _normalize_guest_device_id(raw_value: Optional[str]) -> str:
    value = str(raw_value or "").strip()
    if not value:
        return ""

    if len(value) > 128:
        value = value[:128]

    if GUEST_DEVICE_ID_PATTERN.fullmatch(value):
        return value

    compact = re.sub(r"[^A-Za-z0-9_.:-]", "", value)
    if len(compact) < 6:
        return ""

    return compact[:128]


# ─── 游客 UID 构建 ───
def _build_guest_uid(ip: str, user_agent: str, guest_device_id: str) -> str:
    seed_device_id = _normalize_guest_device_id(guest_device_id)
    if not seed_device_id:
        seed_device_id = secrets.token_urlsafe(10)

    seed = "|".join(
        [
            str(ip or "unknown").strip(),
            str(user_agent or "unknown").strip(),
            seed_device_id,
        ]
    )
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return f"guest_{digest[:16]}"


# ─── 角色标准化 ───
def normalize_role(raw_role: Optional[str], username: Optional[str]) -> str:
    """角色标准化：仅以账号身份决定权限，不信任数据库中的管理员角色字段。"""
    lowered_username = str(username or "").strip().lower()
    lowered_role = str(raw_role or "").strip().lower()

    if lowered_username == ADMIN_USERNAME:
        return ROLE_ADMIN

    if lowered_username == GUEST_USERNAME or lowered_role == ROLE_GUEST:
        return ROLE_GUEST

    return ROLE_REGISTERED


# ─── 配额主体解析 ───
def resolve_quota_subject(
    username: Optional[str],
    role: Optional[str],
    guest_uid: Optional[str] = None,
) -> str:
    resolved_username = str(username or "").strip()
    normalized_role = normalize_role(role, resolved_username)

    if normalized_role == ROLE_GUEST:
        normalized_guest_uid = str(guest_uid or "").strip()
        if normalized_guest_uid:
            return normalized_guest_uid

    return resolved_username or "unknown"


# ─── 角色配额映射 ───
def get_role_daily_quota(role: Optional[str]) -> Optional[int]:
    normalized = normalize_role(role, None)
    if normalized == ROLE_GUEST:
        return max(1, int(GUEST_DAILY_API_QUOTA))
    if normalized == ROLE_REGISTERED:
        return max(1, int(REGISTERED_DAILY_API_QUOTA))
    return None  # 管理员不限额


# ─── 输入规范化函数 ───
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


def _normalize_default_basemap(raw_value: Any) -> str:
    value = str(raw_value or "").strip()
    if not value:
        return ""

    if len(value) > 80:
        value = value[:80]

    if re.fullmatch(r"[A-Za-z0-9_.:-]{1,80}", value):
        return value

    compact = re.sub(r"[^A-Za-z0-9_.:-]", "", value)
    return compact[:80]


def _normalize_language(raw_value: Any) -> str:
    value = str(raw_value or "").strip()
    if not value:
        return DEFAULT_USER_LANGUAGE

    token = value.replace("_", "-").lower()
    return SUPPORTED_USER_LANGUAGES.get(token, DEFAULT_USER_LANGUAGE)


def _normalize_unit_system(raw_value: Any) -> str:
    value = str(raw_value or "").strip().lower()
    if not value:
        return DEFAULT_USER_UNIT_SYSTEM
    return SUPPORTED_UNIT_SYSTEMS.get(value, DEFAULT_USER_UNIT_SYSTEM)


def _normalize_preferred_agent_model(raw_value: Any) -> str:
    value = str(raw_value or "").strip()
    if not value:
        return ""
    return value[:160]


def _safe_username_for_path(username: str) -> str:
    compact = re.sub(r"[^A-Za-z0-9_.-]", "_", str(username or "").strip())
    compact = compact.strip("._-")
    return compact[:64] or "user"


def _default_preferences() -> Dict[str, str]:
    return {
        "default_basemap": "",
        "language": DEFAULT_USER_LANGUAGE,
        "unit_system": DEFAULT_USER_UNIT_SYSTEM,
        "preferred_agent_model": "",
    }


# ─── 注册校验 ───
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


# ─── 请求工具函数 ───
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


def _normalize_binary_flag(raw_value: Any, fallback: str = "0") -> str:
    raw = str(raw_value or "").strip().lower()
    if raw in {"1", "true"}:
        return "1"
    if raw in {"0", "false"}:
        return "0"
    return "1" if fallback == "1" else "0"


def _is_guest_allow_request(request: Request) -> bool:
    query_share_flag = request.query_params.get("s")
    header_share_flag = request.headers.get("X-Share-Mode") or request.headers.get("X-Guest-Allow")
    normalized = _normalize_binary_flag(query_share_flag or header_share_flag, "0")
    return normalized == "1"


def _get_admin_password() -> str:
    configured = str(os.getenv(ADMIN_PASSWORD_ENV_NAME, "")).strip()
    return configured or DEFAULT_ADMIN_PASSWORD_LOCAL


# ─── 邮箱验证码常量 ───
VERIFICATION_CODE_LENGTH = 6
VERIFICATION_CODE_EXPIRE_MINUTES = 5
VERIFICATION_RATE_LIMIT_SECONDS = 60
VERIFICATION_DAILY_LIMIT = 10
VERIFICATION_MAX_ATTEMPTS = 5

# 邮箱格式校验正则
EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")

# 验证码用途枚举
VERIFICATION_PURPOSES = {"register", "reset_password", "bind_email"}


def _normalize_email(raw_email: Optional[str]) -> str:
    """
    规范化邮箱地址：去空格、转小写、截断超长输入。

    参数：
    - raw_email: 原始邮箱字符串

    返回：
    - 规范化后的邮箱地址，无效时返回空字符串
    """
    value = str(raw_email or "").strip().lower()
    if not value:
        return ""
    if len(value) > 120:
        value = value[:120]
    if EMAIL_PATTERN.fullmatch(value):
        return value
    return ""


def _validate_email(email: str) -> None:
    """
    校验邮箱格式，无效时抛出 HTTP 400 异常。

    参数：
    - email: 已规范化的邮箱地址
    """
    if not email or not EMAIL_PATTERN.fullmatch(email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请输入有效的邮箱地址",
        )


def _validate_verification_purpose(purpose: str) -> None:
    """
    校验验证码用途，无效时抛出 HTTP 400 异常。

    参数：
    - purpose: 用途标识
    """
    if purpose not in VERIFICATION_PURPOSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无效的验证码用途: {purpose}",
        )
