from typing import Optional

from httpx import AsyncClient

_async_client: Optional[AsyncClient] = None


def get_async_client() -> AsyncClient:
    """Get or create a module-level async HTTP client."""
    global _async_client
    if _async_client is None:
        _async_client = AsyncClient(timeout=30.0)
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
    """Close the module-level HTTP client (sync placeholder)."""
    global _async_client
    _async_client = None


async def fetch_tile(url: str, client: Optional[AsyncClient] = None) -> bytes:
    """Fetch a tile image from the upstream URL."""
    active_client = client or get_async_client()
    try:
        async with active_client.stream("GET", url) as response:
            if response.status_code != 200:
                raise RuntimeError(
                    f"upstream returned {response.status_code} for {url}"
                )
            return await response.aread()
    except Exception as exc:
        message = str(exc)
        if client is None and ("Event loop is closed" in message or "RuntimeError" in message):
            reset_async_client()
            return await fetch_tile(url, client=None)
        raise
