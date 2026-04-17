import httpx
import pandas as pd
import struct
import zlib
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

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


def _tile_error_response(status_code: int) -> Response:
    return Response(
        content=b"",
        status_code=int(status_code),
        media_type="image/jpeg",
        headers={"Cache-Control": TILE_CACHE_CONTROL},
    )


def _png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    payload = chunk_type + data
    return (
        len(data).to_bytes(4, "big")
        + payload
        + zlib.crc32(payload).to_bytes(4, "big")
    )


def _build_transparent_png_tile(size: int = 256) -> bytes:
    width = int(size)
    height = int(size)
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack("!IIBBBBB", width, height, 8, 6, 0, 0, 0)

    # Each row starts with filter byte 0 and then RGBA zeros (fully transparent).
    row = b"\x00" + (b"\x00" * (width * 4))
    raw = row * height
    compressed = zlib.compress(raw, 9)

    return (
        signature
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", compressed)
        + _png_chunk(b"IEND", b"")
    )


TRANSPARENT_PLACEHOLDER_TILE = _build_transparent_png_tile(256)


def _tile_placeholder_response(reason: str, upstream_status: int | None = None) -> Response:
    headers = {
        "Cache-Control": TILE_CACHE_CONTROL,
        "X-Tile-Fallback": "placeholder",
        "X-Tile-Fallback-Reason": reason,
    }
    if upstream_status is not None:
        headers["X-Tile-Upstream-Status"] = str(int(upstream_status))

    return Response(
        content=TRANSPARENT_PLACEHOLDER_TILE,
        status_code=200,
        media_type="image/png",
        headers=headers,
    )


@app.on_event("startup")
async def startup_event():
    # Reuse one async client to reduce connection setup overhead under high tile concurrency.
    app.state.http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=3.0, read=8.0, write=8.0, pool=3.0),
        limits=httpx.Limits(max_connections=200, max_keepalive_connections=80),
        http2=True,
        follow_redirects=True,
    )


@app.on_event("shutdown")
async def shutdown_event():
    client = getattr(app.state, "http_client", None)
    if client is not None:
        await client.aclose()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/tile/{z}/{x}/{y}")
async def proxy_google_satellite_tile(z: int, x: int, y: int):
    if z < 0 or z > 22 or x < 0 or y < 0:
        return _tile_error_response(400)

    client = getattr(app.state, "http_client", None)
    if client is None:
        # Startup may not have executed in some edge runtimes; keep endpoint usable.
        client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=3.0, read=8.0, write=8.0, pool=3.0),
            limits=httpx.Limits(max_connections=200, max_keepalive_connections=80),
            http2=True,
            follow_redirects=True,
        )
        app.state.http_client = client

    try:
        upstream = await client.get(
            GOOGLE_TILE_ENDPOINT,
            params={"lyrs": "y", "x": x, "y": y, "z": z},
            headers=GOOGLE_TILE_HEADERS,
        )
    except httpx.TimeoutException:
        return _tile_placeholder_response("timeout", 504)
    except httpx.RequestError:
        return _tile_placeholder_response("request-error", 502)
    except Exception:
        return _tile_placeholder_response("unexpected-error", 500)

    if upstream.status_code != 200:
        return _tile_placeholder_response("upstream-status", upstream.status_code)

    content_type = str(upstream.headers.get("Content-Type", "")).lower()
    if not upstream.content or not content_type.startswith("image/"):
        return _tile_placeholder_response("invalid-image", 502)

    return Response(
        content=upstream.content,
        media_type="image/jpeg",
        headers={"Cache-Control": TILE_CACHE_CONTROL},
    )

# --- 功能 1：简单的爬虫接口 ---
# 前端请求：/api/news
@app.get("/api/news")
async def get_external_news():
    url = "https://api.example.com/gis-news" # 假设的外部接口
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        # 这里可以对爬取的数据进行清洗
        return response.json()

# --- 功能 2：GIS 数据处理 (用 Pandas) ---
# 前端请求：/api/process-points
@app.get("/api/process-points")
async def process_gis_data():
    # 模拟一些原始坐标数据
    raw_data = [
        {"name": "点A", "lat": 30.5, "lng": 114.3},
        {"name": "点B", "lat": 30.6, "lng": 114.4}
    ]
    df = pd.DataFrame(raw_data)
    
    # 简单处理：比如给所有点加个“已处理”标记
    df['status'] = 'processed'
    
    return df.to_dict(orient="records")

# --- 功能 3：测试数据接口 ---
@app.get("/api/data")
async def get_test_data():
    return {
        "status": "success", 
        "message": "恭喜！后端已经收到请求",
        "data": [
            {"name": "测试点1", "value": 100},
            {"name": "测试点2", "value": 200}
        ]
    }

# --- 功能 4：健康检查 ---
@app.get("/")
@app.get("/health")
async def health_check():
    return {"status": "healthy", "message": "WebGIS Backend is Running!"}

# --- 功能 5：信息接口 ---
@app.get("/api/info")
async def get_api_info():
    return {
        "name": "WebGIS Backend",
        "version": "0.1.0",
        "description": "WebGIS 后端 API 服务",
        "endpoints": [
            "/api/data - 测试数据",
            "/api/news - 新闻爬虫",
            "/api/process-points - GIS 数据处理",
            "/health - 健康检查"
        ]
    }