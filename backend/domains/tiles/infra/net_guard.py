# -*- coding: utf-8 -*-
"""SSRF 护栏兼容 shim（domains.tiles.infra.net_guard）。

背景：原真源即本文件（V3.4.63 收敛三处出站面为单点）。
V3.6.5 移除瓦片域时只保留 `core/net_guard.py`（agent SSRF 用）在仓内；
V3.6.18 恢复瓦片域（纠偏 + 下载）时不再复制第二份护栏，改为本 shim 转接
`core.net_guard`，保证全仓只有一份 SSRF 实现。

瓦片域名下原有 `from ..infra.net_guard import ...` 用法保持不变。
"""

from core.net_guard import (  # noqa: F401  （转接导出，供瓦片域名使用）
    LOCAL_HOSTNAMES,
    LOCAL_HOST_SUFFIXES,
    _DNS_GUARD_TTL_SECONDS,
    coerce_ip_literal,
    host_matches_allowlist,
    is_disallowed_host,
    is_loopback_host,
    is_private_ip,
    normalize_host,
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
    "normalize_host",
    "parse_host_allowlist",
    "resolve_host_has_private_ip",
]
