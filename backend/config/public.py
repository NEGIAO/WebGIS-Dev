"""
前端可安全消费的公开配置。

原则：
- 只输出非密信息与「是否已配置」布尔，绝不回显 L3 明文；
- 供 /api/runtime-config/* 或未来 /api/config/public 端点使用；
- Admin 面板展示「AGENT_API_KEY 是否已配置（来自环境）」也从这里取。
"""

from __future__ import annotations

from typing import Any, Dict

from .load import get_settings


def build_public_config() -> Dict[str, Any]:
    """构建前端安全公开配置字典（无任何 secret 明文）。"""
    s = get_settings()
    return {
        "app_env": s.app_env,
        "backend_public_url": s.backend_public_url,
        "frontend_public_url": s.frontend_public_url,
        "agent": {
            # 非密默认；常变项以 L2 Admin（system_config）为准
            "base_url": s.agent_base_url,
            "model": s.agent_model,
        },
        "features": {
            "oauth_google": bool(s.google_oauth_client_id and s.google_oauth_client_secret),
            "oauth_github": bool(s.github_oauth_client_id and s.github_oauth_client_secret),
            "email_verification": bool(s.smtp_user and s.smtp_password),
            "agent_env_key": bool(s.agent_api_key),
            "amap": bool(s.amap_web_service_key),
            "supabase": bool(s.supabase_url and s.supabase_key),
        },
    }
