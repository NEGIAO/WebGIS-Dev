"""
用户认证、角色权限与调用配额管理模块（门面）。

本文件 re-export 所有外部依赖的符号，保持 `from api.auth import ...` 路径完全兼容。
"""

# ─── 角色与常量 ───
from .constants import (
    GUEST_PASSWORD,
    GUEST_USERNAME,
    MAX_AVATAR_INDEX,
    ROLE_ADMIN,
    ROLE_GUEST,
    ROLE_REGISTERED,
    _extract_client_ip,
    _extract_token,
    _normalize_avatar_index,
    get_role_daily_quota,
    normalize_role,
    resolve_quota_subject,
)

# ─── 数据库 ───
from .db import AUTH_DB_PATH, _iso, _safe_parse_iso, _utc_now, get_auth_db_connection

# ─── Schema / 初始化 ───
from .schema import init_auth_storage

# ─── Pydantic 模型 ───
from .models import (
    BindEmailRequest,
    ChangeAvatarRequest,
    ChangeDisplayNameRequest,
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    SendCodeRequest,
    UpdatePreferencesRequest,
    VerifyCodeRequest,
)

# ─── 密码 ───
from .password import _hash_password, _verify_password

# ─── System Config ───
from .system_config import (
    _get_admin_avatar_index_sync,
    _get_system_config_value_sync,
    _set_admin_avatar_index_sync,
    _set_system_config_value_sync,
)

# ─── 用户偏好 ───
from .preferences import (
    _ensure_user_preferences_row_sync,
    _get_user_preferences_sync,
    _upsert_user_preferences_sync,
)

# ─── 用户管理 ───
from .user import (
    _create_user_sync,
    _get_or_create_guest_username_sync,
    _get_user_by_id_sync,
    _get_user_sync,
    _record_login_sync,
    _update_user_display_name_sync,
)

# ─── 会话管理 ───
from .session import (
    _check_email_taken_sync,
    _create_session_sync,
    _delete_session_sync,
    _delete_sessions_by_email_sync,
    _delete_sessions_by_username_sync,
    _get_session_sync,
    _get_user_by_email_sync,
    _update_user_avatar_index_sync,
    _update_user_email_sync,
    _update_user_password_by_email_sync,
    _update_user_password_sync,
)

# ─── 配额 ───
from .quota import _consume_api_quota_sync, get_user_quota_snapshot_sync

# ─── FastAPI 依赖 ───
from .dependencies import require_admin, require_api_access, require_api_access_or_guest, require_login

# ─── 路由 ───
from .routes import router

__all__ = [
    # 角色与常量
    "ROLE_GUEST",
    "ROLE_REGISTERED",
    "ROLE_ADMIN",
    "GUEST_USERNAME",
    "GUEST_PASSWORD",
    "MAX_AVATAR_INDEX",
    "normalize_role",
    "resolve_quota_subject",
    "get_role_daily_quota",
    "_extract_client_ip",
    "_extract_token",
    # 数据库
    "AUTH_DB_PATH",
    "get_auth_db_connection",
    # 初始化
    "init_auth_storage",
    # 模型
    "RegisterRequest",
    "LoginRequest",
    "BindEmailRequest",
    "ChangePasswordRequest",
    "ChangeDisplayNameRequest",
    "ChangeAvatarRequest",
    "UpdatePreferencesRequest",
    # 密码
    "_hash_password",
    "_verify_password",
    # System Config
    "_get_admin_avatar_index_sync",
    "_get_system_config_value_sync",
    "_set_system_config_value_sync",
    "_set_admin_avatar_index_sync",
    # 偏好
    "_ensure_user_preferences_row_sync",
    "_get_user_preferences_sync",
    "_upsert_user_preferences_sync",
    # 用户
    "_get_user_sync",
    "_get_user_by_id_sync",
    "_create_user_sync",
    "_get_or_create_guest_username_sync",
    "_record_login_sync",
    "_update_user_display_name_sync",
    # 会话
    "_create_session_sync",
    "_get_session_sync",
    "_delete_session_sync",
    "_delete_sessions_by_username_sync",
    "_update_user_password_sync",
    "_update_user_avatar_index_sync",
    # 配额
    "_consume_api_quota_sync",
    "get_user_quota_snapshot_sync",
    # 依赖
    "require_login",
    "require_api_access",
    "require_api_access_or_guest",
    "require_admin",
    # 路由
    "router",
]
