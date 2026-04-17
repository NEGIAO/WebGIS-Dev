"""
Google 卫星图瓦片代理模块

功能：代理 Google Maps 卫星图瓦片请求，支持动态 lyrs 参数，
包含完善的错误处理和透明 PNG 回退机制。

接口使用示例：
1) 默认卫星图层（s）
    curl "http://localhost:8000/api/tile/16/53576/25999"

2) 混合图层（y）
    curl "http://localhost:8000/api/tile/16/53576/25999?lyrs=y"

3) 前端模板 URL（Leaflet/OpenLayers）
    http://localhost:8000/api/tile/{z}/{x}/{y}?lyrs=s
"""

import httpx
import struct
import zlib
from fastapi import APIRouter, Query, Request, Response
from typing import Optional

# ==================== 常量定义 ====================
GOOGLE_TILE_ENDPOINT = "https://mt1.google.com/vt"
GOOGLE_TILE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.google.com/",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
}
TILE_CACHE_CONTROL = "public, max-age=86400"
HTTP_CLIENT_TIMEOUT = httpx.Timeout(connect=3.0, read=8.0, write=8.0, pool=3.0)
HTTP_CLIENT_LIMITS = httpx.Limits(max_connections=200, max_keepalive_connections=80)

# ==================== 工具函数 ====================


def build_http_client() -> httpx.AsyncClient:
    """
    创建异步 HTTP 客户端，支持 HTTP/2 降级到 HTTP/1.1。
    如果 h2 包未安装，自动降级到 HTTP/1.1。
    """
    try:
        return httpx.AsyncClient(
            timeout=HTTP_CLIENT_TIMEOUT,
            limits=HTTP_CLIENT_LIMITS,
            http2=True,
            follow_redirects=True,
        )
    except ImportError:
        return httpx.AsyncClient(
            timeout=HTTP_CLIENT_TIMEOUT,
            limits=HTTP_CLIENT_LIMITS,
            follow_redirects=True,
        )


def _png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    """生成 PNG 数据块"""
    payload = chunk_type + data
    return (
        len(data).to_bytes(4, "big")
        + payload
        + zlib.crc32(payload).to_bytes(4, "big")
    )


def build_transparent_png_tile(size: int = 256) -> bytes:
    """生成透明的 PNG 瓦片作为回退占位符（256x256，完全透明）"""
    width = int(size)
    height = int(size)
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack("!IIBBBBB", width, height, 8, 6, 0, 0, 0)

    # 每行以过滤字节 0 开头，后跟 RGBA 零字节（完全透明）
    row = b"\x00" + (b"\x00" * (width * 4))
    raw = row * height
    compressed = zlib.compress(raw, 9)

    return (
        signature
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", compressed)
        + _png_chunk(b"IEND", b"")
    )


# 预生成透明占位符瓦片
TRANSPARENT_PLACEHOLDER_TILE = build_transparent_png_tile(256)


def tile_placeholder_response(
    reason: str,
    upstream_status: Optional[int] = None,
    lyrs: Optional[str] = None,
) -> Response:
    """
    返回透明 PNG 占位符响应，包含调试头信息。
    """
    headers = {
        "Cache-Control": TILE_CACHE_CONTROL,
        "X-Tile-Fallback": "placeholder",
        "X-Tile-Fallback-Reason": reason,
    }
    if upstream_status is not None:
        headers["X-Tile-Upstream-Status"] = str(int(upstream_status))
    if lyrs is not None:
        headers["X-Tile-Lyrs"] = str(lyrs)

    return Response(
        content=TRANSPARENT_PLACEHOLDER_TILE,
        status_code=200,
        media_type="image/png",
        headers=headers,
    )


def resolve_lyrs(raw_lyrs: Optional[str]) -> str:
    """
    解析并验证 lyrs 参数。
    默认值为 "s"（卫星图）。
    """
    value = str(raw_lyrs or "").strip()
    return value if value else "s"


# ==================== APIRouter 定义 ====================

router = APIRouter(prefix="/api", tags=["proxy"])


@router.get("/tile/{z}/{x}/{y}")
async def proxy_google_satellite_tile(
    request: Request,
    z: int,
    x: int,
    y: int,
    lyrs: Optional[str] = Query(default="s"),
):
    """
    Google 卫星图瓦片代理接口

    参数：
    - z: 缩放级别 (0-22)
    - x: 瓦片 X 坐标
    - y: 瓦片 Y 坐标
    - lyrs: 图层参数 (s=卫星, y=混合, h=地形等)

    返回：
    - 瓦片图片数据 (image/jpeg)
    - 失败时返回透明 PNG 占位符
    """
    # 验证坐标范围
    if z < 0 or z > 22 or x < 0 or y < 0:
        return tile_placeholder_response("invalid-coordinates", 400, lyrs)

    resolved_lyrs = resolve_lyrs(lyrs)

    http_client = getattr(request.app.state, "http_client", None)
    should_close_client = False
    if http_client is None:
        # 启动钩子未执行时兜底，确保接口在边缘场景可用。
        http_client = build_http_client()
        should_close_client = True

    try:
        upstream = await http_client.get(
            GOOGLE_TILE_ENDPOINT,
            params={"lyrs": resolved_lyrs, "x": x, "y": y, "z": z},
            headers=GOOGLE_TILE_HEADERS,
        )
    except httpx.TimeoutException:
        return tile_placeholder_response("timeout", 504, resolved_lyrs)
    except httpx.RequestError:
        return tile_placeholder_response("request-error", 502, resolved_lyrs)
    except Exception:
        return tile_placeholder_response("unexpected-error", 500, resolved_lyrs)
    finally:
        if should_close_client:
            await http_client.aclose()

    # 验证上游响应
    if upstream.status_code != 200:
        return tile_placeholder_response("upstream-status", upstream.status_code, resolved_lyrs)

    content_type = str(upstream.headers.get("Content-Type", "")).lower()
    if not upstream.content or not content_type.startswith("image/"):
        return tile_placeholder_response("invalid-image", 502, resolved_lyrs)

    return Response(
        content=upstream.content,
        media_type="image/jpeg",
        headers={
            "Cache-Control": TILE_CACHE_CONTROL,
            "X-Tile-Lyrs": resolved_lyrs,
        },
    )
