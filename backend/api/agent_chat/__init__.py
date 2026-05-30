"""
Agent chat proxy and admin configuration endpoints（门面）。

本文件 re-export router 和 admin_router，保持 `from api.agent_chat import ...` 路径完全兼容。
"""

from .routes import admin_router, router

__all__ = ["router", "admin_router"]
