# -*- coding: utf-8 -*-
"""瓦片域（domains.tiles）：纠偏 + 直通代理 + 磁盘缓存清理（VPS 迁移单元）。

⚠️ 路由挂载顺序是正确性的一部分：纠偏路由（`/proxy/gcj2wgs/…` 等具体路径）
必须先于通用流式代理（`/proxy/{target_url:path}` 通配）注册，否则纠偏请求
会被通配路由吞掉。宿主只从本包取聚合后的 router，不得打散挂载。

- `tiles_router`：纠偏 + 直通代理
- `build_http_client`：出站 httpx 单例工厂
- `cache_cleanup_loop`：GCJRE_CACHE 磁盘缓存周期清理（lifespan 挂载）

## 一次性迁移（整夹拷走）

**拷贝本目录 `domains/tiles/`，但排除 `download/`。**

```
domains/tiles/                 ← 迁移单元根（整夹拷贝）
  __init__.py                  包出口 + 本说明
  _router.py                   路由聚合（纠偏 → 通配，顺序不可打乱）
  routes_rectify.py            /proxy/{gcj2wgs,wgs2gcj,bd2wgs,wgs2bd}/…
  routes_passthrough.py        /proxy/{target_url:path} + ships66
  proxy_shared.py              内存 TTL 缓存 / 限流 / SSRF / 出站客户端
  cache_cleanup.py             磁盘缓存按龄+按容量清理 + 后台 loop
  infra/                       SSRF 护栏 + 浏览器出站头
  rectify/                     GCJ/BD 纠偏库（写缓存的唯一位置）
  download/                    ❌ 不迁：依赖 rasterio/numpy/sqlmodel
```

宿主最小接入：

```python
from domains.tiles import tiles_router, build_http_client, cache_cleanup_loop
# app.include_router(tiles_router)
# app.state.http_client = build_http_client()
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
