# -*- coding: utf-8 -*-
"""瓦片域（domains.tiles）：纠偏 + 直通代理 + 磁盘缓存清理 + 底图下载。

⚠️ 路由挂载顺序是正确性的一部分：纠偏路由（`/proxy/gcj2wgs/…` 等具体路径）
必须先于通用流式代理（`/proxy/{target_url:path}` 通配）注册，否则纠偏请求
会被通配路由吞掉。宿主只从本包取聚合后的 router，不得打散挂载。

- `tiles_router`：纠偏 + 直通代理
- `download_router`：底图下载（`/api/download/*`，见 `download/download.py`）
- `build_http_client`：出站 httpx 单例工厂
- `cache_cleanup_loop`：GCJRE_CACHE 磁盘缓存周期清理（lifespan 挂载）

## 2026-09 迁移与恢复的格局（V3.6.5 迁出 → V3.6.18 恢复）

- 前端底图显示仍走香港 VPS（`vpn.negiao.cn/proxy/*`，`VITE_TILE_PROXY_BASE_URL`），
  瓦片域名未变；本仓 `/proxy/*` 不面向前端地图。
- 本仓 `/proxy/*`、`/tiles/*`、`/api/download` 的启用场景是**下载管线**：
  下载时后端按瓦片模板直接抓取（可粘贴 VPS 纠偏地址或原始源站模板），
  拼装 GeoTIFF 并经 `/api/auth/download-quota` 配额链路扣减/退还。
- HF Space 合规灰区由部署方决策（同 external_proxy 先例）；若要严守
  "Space 无第三方中转"，可在宿主侧不挂 `tiles_router`，仅保留下载直连抓取。

## 目录

```
domains/tiles/                 ← 瓦片域根
  __init__.py                  包出口 + 本说明
  _router.py                   路由聚合（纠偏 → 通配，顺序不可打乱）
  routes_rectify.py            /proxy/{gcj2wgs,wgs2gcj,bd2wgs,wgs2bd}/…
  routes_passthrough.py        /proxy/{target_url:path} + ships66
  proxy_shared.py              内存 TTL 缓存 / 限流 / SSRF / 出站客户端
  cache_cleanup.py             磁盘缓存按龄+按容量清理 + 后台 loop
  infra/                       SSRF 护栏 shim（转接 core/net_guard）+ 浏览器出站头
  rectify/                     GCJ/BD 纠偏库（写缓存的唯一位置）
  download/                    底图下载（rasterio/numpy/sqlmodel）
```

宿主最小接入：

```python
from domains.tiles import tiles_router, build_http_client, cache_cleanup_loop
from domains.tiles.download.download import router as download_router
# app.include_router(tiles_router)
# app.include_router(download_router)
# asyncio.create_task(cache_cleanup_loop())
```

外部依赖仅：`fastapi` / `httpx` / `pillow` / 宿主 `config`（`get_int/get_str/get_bool`）。
配置键：`PROXY_*`、`GCJRE_*`（含 `GCJRE_CACHE`、`GCJRE_CACHE_MAX_AGE_DAYS`、
`GCJRE_CACHE_MAX_MB`、`GCJRE_CACHE_CLEANUP_INTERVAL_S`）。

旧说明中的 `core/net_guard.py`、`core/http_headers.py` 仅为兼容 re-export，
新宿主不要拷；真源在 `infra/`。

## 轻量包入口（防循环导入）

`tiles_router` / `build_http_client` / `cache_cleanup_loop` 经 PEP 562
`__getattr__` 惰性加载，import 本包不会拉起完整路由栈。
"""

from typing import Any

__all__ = [
    "build_http_client",
    "cache_cleanup_loop",
    "cleanup_rectify_cache",
    "tiles_router",
]

_LAZY = {
    "build_http_client": ("domains.tiles._router", "build_http_client"),
    "tiles_router": ("domains.tiles._router", "tiles_router"),
    "cache_cleanup_loop": ("domains.tiles.cache_cleanup", "cache_cleanup_loop"),
    "cleanup_rectify_cache": ("domains.tiles.cache_cleanup", "cleanup_rectify_cache"),
}


def __getattr__(name: str) -> Any:
    """惰性导出：首次访问才加载对应子模块。"""
    target = _LAZY.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_path, attr = target
    import importlib

    return getattr(importlib.import_module(module_path), attr)
