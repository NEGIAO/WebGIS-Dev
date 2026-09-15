# -*- coding: utf-8 -*-
"""瓦片域聚合路由构建（纠偏 → 通配，顺序不可打乱）。

拆出本模块是为了让 `domains/tiles/__init__.py` 保持轻量：
`core/*` 兼容 shim 在 import 时不触发完整路由/配置加载，避免
`core → domains.tiles.infra` 与 `domains.tiles → proxy_shared` 的循环导入。
"""

from fastapi import APIRouter

from domains.tiles.proxy_shared import build_http_client
from domains.tiles.routes_passthrough import router as passthrough_router
from domains.tiles.routes_rectify import router as rectify_router

tiles_router = APIRouter()
tiles_router.include_router(rectify_router)  # 先纠偏（具体路径）
tiles_router.include_router(passthrough_router)  # 后通配（/proxy/{target_url:path}）

__all__ = ["build_http_client", "tiles_router"]
