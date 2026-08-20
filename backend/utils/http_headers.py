"""瓦片出站面共享的浏览器特征请求头。

三处瓦片出站面（download_xyz / gcj_rectify / api.proxy）共用本模块，
规避天地图等瓦片源对「非浏览器特征请求」的 418 反爬拦截（见
Docs/LLM_record/26-08/2026-08-17/2026-08-17-tianditu-418-download-fix.md）。
新增瓦片源反爬适配只需改本文件白名单，无需改动消费方。
"""

from __future__ import annotations

import re

# 浏览器 UA：部分瓦片源（如天地图）对非浏览器出站请求返回 418 拦截，
# 注入浏览器特征以正常拉取（与 PROXY_USER_AGENT 配置同级别语义）
BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

# 与 BROWSER_USER_AGENT 的 Chrome 版本号必须一致：反爬服务会交叉校验
# UA 与 sec-ch-ua 中的版本号，不一致反而暴露非浏览器特征
SEC_CH_UA = '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"'


def build_sec_ch_ua(user_agent: str) -> str:
    """从 UA 字符串解析 Chrome 版本号，生成版本号一致的 sec-ch-ua。

    反爬服务会交叉校验 UA 与 sec-ch-ua 中的 Chrome 版本号；
    当出站 UA 被配置覆盖（如 PROXY_USER_AGENT）时，必须同步推导 sec-ch-ua，
    否则版本不一致反而暴露非浏览器特征。

    Args:
        user_agent: 实际出站 User-Agent。

    Returns:
        与 UA 版本号一致的 sec-ch-ua；UA 中无 Chrome 版本时回退默认 SEC_CH_UA。
    """
    match = re.search(r"Chrome/(\d+)", user_agent or "")
    if not match:
        return SEC_CH_UA
    version = match.group(1)
    return (
        f'"Not/A)Brand";v="8", "Chromium";v="{version}", '
        f'"Google Chrome";v="{version}"'
    )


# 需附加 Referer 防盗链特征的瓦片源域名白名单（value 为 Referer 值）。
# 匹配为子串包含判断（domain in url），注意覆盖同名子域时别误伤其他源
REFERER_BY_DOMAIN = {
    "tianditu.gov.cn": "https://www.tianditu.gov.cn/",
    # 天地图企业/移动域名（omap.map-world.com.cn 等），同一官网 Referer
    "map-world.com.cn": "https://www.tianditu.gov.cn/",
}

# 出站请求的浏览器特征默认头（api.proxy 通用代理与 gcj_rectify 纠偏代理共用），
# 与真实浏览器请求对齐（Accept: */*、Accept-Encoding 含 br/zstd 等）。
# ⚠️ br/zstd 版本仅可用于「流式原样转发、不解压」的面（api.proxy 通用代理）；
# 需要 httpx 解压响应体的面（纠偏 / 下载）必须用 build_browser_headers_no_br()——
# backend 未安装 brotli/zstandard 解码库，上游真以 br/zstd 编码响应时
# httpx 会抛 DecodingError，瓦片拉取直接失败。
DEFAULT_BROWSER_HEADERS = {
    "User-Agent": BROWSER_USER_AGENT,
    "Accept": "*/*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "sec-ch-ua": SEC_CH_UA,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
}


def build_browser_headers() -> dict[str, str]:
    """返回一份可安全修改的浏览器特征默认头副本（含 br/zstd，仅流式转发面使用）。"""
    return dict(DEFAULT_BROWSER_HEADERS)


def build_browser_headers_no_br() -> dict[str, str]:
    """返回不含 br/zstd 的浏览器特征头副本（供需要 httpx 解压响应体的面使用）。"""
    headers = build_browser_headers()
    headers["Accept-Encoding"] = "gzip, deflate"
    return headers


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