# -*- coding: utf-8 -*-
"""瓦片域（domains.tiles）：纠偏路由 + 直通代理路由 + 底图下载 + 纠偏底座库。

⚠️ 路由挂载顺序是正确性的一部分：纠偏路由（`/proxy/gcj2wgs/…` 等具体路径）
必须先于通用流式代理（`/proxy/{target_url:path}` 通配）注册，否则纠偏请求
会被通配路由吞掉。`app.py` 只从本包取聚合后的 router，不得打散挂载。

- `tiles_router`：纠偏 + 直通代理（挂在原 `proxy_router` 位置，URL 零变化）
- 下载路由 intentionally 不在此聚合：`download/` 依赖重型三方库
  （sqlmodel/rasterio/apscheduler），保持 `app.py` 单独按原位置挂载，
  避免轻量调用方（测试、纠偏）被拖入重依赖。
"""

from fastapi import APIRouter

from domains.tiles.proxy_shared import build_http_client
from domains.tiles.routes_passthrough import router as passthrough_router
from domains.tiles.routes_rectify import router as rectify_router

tiles_router = APIRouter()
tiles_router.include_router(rectify_router)  # 先纠偏（具体路径）
tiles_router.include_router(passthrough_router)  # 后通配（/proxy/{target_url:path}）

__all__ = ["build_http_client", "tiles_router"]
