# -*- coding: utf-8 -*-
"""兼容入口：实现见 `domains.tiles.infra.net_guard`。

`domains/tiles/__init__.py` 为轻量惰性入口（PEP 562），import 本模块
不会拉起完整代理路由栈。瓦片域内部请直接 `from domains.tiles.infra import ...`。
"""

from __future__ import annotations

from domains.tiles.infra.net_guard import (
    LOCAL_HOSTNAMES,
    LOCAL_HOST_SUFFIXES,
    coerce_ip_literal,
    host_matches_allowlist,
    is_disallowed_host,
    is_loopback_host,
    is_private_ip,
    parse_host_allowlist,
    resolve_host_has_private_ip,
)

__all__ = [
    "LOCAL_HOSTNAMES",
    "LOCAL_HOST_SUFFIXES",
    "coerce_ip_literal",
    "host_matches_allowlist",
    "is_disallowed_host",
    "is_loopback_host",
    "is_private_ip",
    "parse_host_allowlist",
    "resolve_host_has_private_ip",
]
