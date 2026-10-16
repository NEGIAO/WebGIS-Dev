# -*- coding: utf-8 -*-
"""瓦片代理/纠偏专用基础设施（SSRF 护栏 + 出站请求头）。

聚合目的：迁移独立瓦片服务时，整目录 `domains/tiles/` 即可带走。
相对导入，避免在 `core` 兼容 shim 场景下触发父包路由栈。
"""

from .http_headers import (
    BROWSER_USER_AGENT,
    SEC_CH_UA,
    build_browser_headers,
    build_browser_headers_no_br,
    build_sec_ch_ua,
    referer_headers_for,
)
from .net_guard import (
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
    "BROWSER_USER_AGENT",
    "SEC_CH_UA",
    "build_browser_headers",
    "build_browser_headers_no_br",
    "build_sec_ch_ua",
    "referer_headers_for",
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
