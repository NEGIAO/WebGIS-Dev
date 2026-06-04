"""
空间分析模块（门面）。

本文件 re-export router，保持 `from api.spatial import router` 路径完全兼容。
"""

from .router import router

__all__ = ["router"]
