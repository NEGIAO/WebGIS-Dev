"""瓦片出站面共享的浏览器特征请求头。

三处瓦片出站面（download_xyz / gcj_rectify / api.proxy）共用本模块，
规避天地图等瓦片源对「非浏览器特征请求」的 418 反爬拦截（见
Docs/LLM_record/26-08/2026-08-17/2026-08-17-tianditu-418-download-fix.md）。
新增瓦片源反爬适配只需改本文件白名单，无需改动消费方。
"""

from __future__ import annotations

# 浏览器 UA：部分瓦片源（如天地图）对非浏览器出站请求返回 418 拦截，
# 注入浏览器特征以正常拉取（与 PROXY_USER_AGENT 配置同级别语义）
BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

# 需附加 Referer 防盗链特征的瓦片源域名白名单（value 为 Referer 值）
REFERER_BY_DOMAIN = {
    "tianditu.gov.cn": "https://www.tianditu.gov.cn/",
}


def referer_headers_for(url: str) -> dict[str, str] | None:
    """按瓦片源域名白名单返回防盗链 Referer 头；非白名单源不附加。

    Args:
        url: 出站请求 URL。

    Returns:
        需要附加的请求头字典；白名单外返回 None（不附加 Referer）。
    """
    for domain, referer in REFERER_BY_DOMAIN.items():
        if domain in url:
            return {"Referer": referer}
    return None
