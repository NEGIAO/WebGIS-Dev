# -*- coding: utf-8 -*-
"""兼容入口：实现见 `domains.tiles.infra.http_headers`。

与 `core/net_guard.py` 同理：`domains/tiles/__init__.py` 已轻量化，
不会因本入口拉起完整代理路由。瓦片域内部请直接 `from domains.tiles.infra import ...`。
"""

from __future__ import annotations

from domains.tiles.infra.http_headers import (
    BROWSER_USER_AGENT,
    SEC_CH_UA,
    build_browser_headers,
    build_browser_headers_no_br,
    build_sec_ch_ua,
    referer_headers_for,
)

__all__ = [
    "BROWSER_USER_AGENT",
    "SEC_CH_UA",
    "build_browser_headers",
    "build_browser_headers_no_br",
    "build_sec_ch_ua",
    "referer_headers_for",
]
