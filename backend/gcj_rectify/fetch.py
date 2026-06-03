import logging
from typing import Optional

import httpx
from httpx import AsyncClient

logger = logging.getLogger(__name__)

_async_client: Optional[AsyncClient] = None

# 最大重试次数，避免递归导致栈溢出
MAX_RETRIES = 2


def get_async_client() -> AsyncClient:
    """Get or create a module-level async HTTP client."""
    global _async_client
    if _async_client is None:
        # 超时配置：
        # - connect=8s: 连接建立超时（网络问题时快速失败）
        # - read=12s: 读取超时（瓦片通常 <5s 返回）
        # - write=10s: 写入超时
        # - pool=5s: 连接池等待超时
        _async_client = AsyncClient(
            timeout=httpx.Timeout(connect=8.0, read=12.0, write=10.0, pool=5.0),
            limits=httpx.Limits(max_connections=80, max_keepalive_connections=15)
        )
    return _async_client


def reset_async_client() -> None:
    """Reset the module-level HTTP client."""
    global _async_client
    _async_client = None


async def close_async_client_async() -> None:
    """Close the module-level HTTP client if it exists."""
    global _async_client
    if _async_client is not None:
        await _async_client.aclose()
        _async_client = None


def close_async_client() -> None:
    """Close the module-level HTTP client (sync wrapper)."""
    global _async_client
    if _async_client is not None:
        try:
            import asyncio

            try:
                loop = asyncio.get_running_loop()
                # Event loop is running; just drop the reference for GC
            except RuntimeError:
                loop = asyncio.new_event_loop()
                try:
                    loop.run_until_complete(_async_client.aclose())
                finally:
                    loop.close()
        except Exception:
            pass
        finally:
            _async_client = None


async def fetch_tile(url: str, client: Optional[AsyncClient] = None) -> bytes:
    """Fetch a tile image from the upstream URL.

    Uses loop-based retry instead of recursion to avoid stack overflow.
    Retries on timeout and event loop errors.

    Args:
        url: Upstream tile URL
        client: Optional HTTP client to use. If None, uses module-level client.

    Returns:
        Tile image bytes

    Raises:
        RuntimeError: If upstream returns non-200 status
        httpx.HTTPError: If request fails after all retries
    """
    last_exception = None

    for attempt in range(MAX_RETRIES + 1):
        active_client = client or get_async_client()
        try:
            async with active_client.stream("GET", url) as response:
                if response.status_code != 200:
                    raise RuntimeError(
                        f"upstream returned {response.status_code} for {url}"
                    )
                return await response.aread()
        except Exception as exc:
            last_exception = exc
            message = str(exc)

            # 判断是否需要重试的错误类型
            is_timeout = isinstance(exc, (httpx.TimeoutException, httpx.ConnectTimeout))
            is_remote_error = isinstance(exc, httpx.RemoteProtocolError)
            is_event_loop_error = (
                "Event loop is closed" in message
                or "Cannot run the event loop while another loop is running" in message
            )

            # 超时或远程协议错误：重试（使用指数退避）
            # RemoteProtocolError 表示服务器关闭了连接（限流）
            if (is_timeout or is_remote_error) and attempt < MAX_RETRIES:
                wait_time = 0.5 * (attempt + 1)  # 0.5s, 1.0s
                logger.debug("Request failed (%s), retrying in %.1fs (%d/%d): %s",
                           "timeout" if is_timeout else "remote_error",
                           wait_time, attempt + 1, MAX_RETRIES, url)
                import asyncio
                await asyncio.sleep(wait_time)
                continue

            # 事件循环错误：重置客户端并重试
            if client is None and is_event_loop_error and attempt < MAX_RETRIES:
                logger.debug("Event loop closed, resetting client and retrying (%d/%d)",
                           attempt + 1, MAX_RETRIES)
                reset_async_client()
                continue

            # 其他异常直接抛出
            raise

    # 不应该到达这里，但作为安全兜底
    raise last_exception or RuntimeError(f"Failed to fetch tile after {MAX_RETRIES} retries: {url}")
