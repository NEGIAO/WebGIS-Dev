"""
日志流监控：
- local：广播本进程 Python logging（无需 Token，适合本地开发）
- hf：代理 Hugging Face Space 运行日志（需 SUPER_USER，适合线上部署）

模式由 WEBGIS_LOG_STREAM_MODE 或运行环境自动选择，详见 effective_log_stream_mode()。
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
from typing import Literal, Set
import sys

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/monitor",
    tags=["系统监控"],
)

DEFAULT_HF_LOGS_URL = "https://huggingface.co/api/spaces/NEGIAO/WebGIS/logs/run"

# ---------- 本地日志广播（多订阅者）----------

_subscribers: Set[asyncio.Queue[str]] = set()
_subscriber_thread_lock = threading.Lock()
_loop_ref: asyncio.AbstractEventLoop | None = None
_broadcast_handler: logging.Handler | None = None
_handler_attached = False

SUBSCRIBER_QUEUE_MAX = 800


def _hf_logs_url() -> str:
    return os.getenv("HF_SPACE_LOGS_URL", DEFAULT_HF_LOGS_URL).strip() or DEFAULT_HF_LOGS_URL


def _super_user_token() -> str:
    return os.getenv("SUPER_USER", "").strip()


def _sse_escape_data(line: str) -> str:
    return line.replace("\r\n", " ").replace("\n", " ").replace("\r", " ")


def _running_on_huggingface_space() -> bool:
    """Spaces 运行时通常会注入与 Space 相关的环境变量（具体以平台为准）。"""
    if os.getenv("SPACE_REPO_NAME") or os.getenv("SPACE_AUTHOR_NAME"):
        return True
    if os.getenv("WEBGIS_ASSUME_HF_SPACE", "").strip().lower() in ("1", "true", "yes"):
        return True
    return False


def _running_in_container() -> bool:
    """Detect running inside a container (docker/other) by common heuristics."""
    try:
        if os.path.exists("/.dockerenv"):
            return True
        # Check cgroup (works on many linux container runtimes)
        if os.path.exists("/proc/1/cgroup"):
            with open("/proc/1/cgroup", "r", encoding="utf-8", errors="ignore") as fh:
                txt = fh.read()
            if "docker" in txt or "kubepods" in txt or "containerd" in txt:
                return True
    except Exception:
        pass
    # Allow manual override via env var
    if os.getenv("WEBGIS_ASSUME_IN_CONTAINER", "").strip().lower() in ("1", "true", "yes"):
        return True
    return False


def effective_log_stream_mode() -> Literal["local", "hf"]:
    """
    - WEBGIS_LOG_STREAM_MODE=local|hf|auto（默认 auto）
    - auto：在检测到 Hugging Face Space 环境时用 hf，否则 local
    """
    raw = os.getenv("WEBGIS_LOG_STREAM_MODE", "auto").strip().lower()
    if raw == "local":
        return "local"
    if raw == "hf":
        return "hf"
    return "hf" if _running_on_huggingface_space() else "local"


def init_monitor_log_streaming() -> Literal["local", "hf"]:
    """
    在 FastAPI startup（async 内）调用：记录模式，并在 local 模式下挂载 logging Handler。
    """
    global _loop_ref

    mode = effective_log_stream_mode()
    try:
        _loop_ref = asyncio.get_running_loop()
    except RuntimeError:
        _loop_ref = None

    # Always try to ensure we have broadcast handlers in local mode.
    # The handler will fallback to synchronous fanout if no running event loop.
    if mode == "local":
        _ensure_broadcast_handler()

    logger.info("WebGIS 日志流模式: %s", mode)
    return mode


def _fanout_line(line: str) -> None:
    for q in list(_subscribers):
        try:
            q.put_nowait(line)
        except asyncio.QueueFull:
            try:
                q.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                q.put_nowait(line)
            except Exception:
                pass
        except Exception:
            pass


def _schedule_fanout(line: str) -> None:
    loop = _loop_ref
    if loop is None or not loop.is_running():
        # No running loop - fallback to direct fanout on current thread
        try:
            _fanout_line(line)
        except Exception:
            pass
        return
    loop.call_soon_threadsafe(_fanout_line, line)


class _LogBroadcastHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            # Prefer scheduling via event loop when available, otherwise fanout synchronously.
            loop = _loop_ref
            if loop is not None and loop.is_running():
                _schedule_fanout(msg)
            else:
                try:
                    _fanout_line(msg)
                except Exception:
                    pass
        except Exception:
            self.handleError(record)


def _ensure_broadcast_handler() -> None:
    global _broadcast_handler, _handler_attached
    if _handler_attached:
        return
    handler = _LogBroadcastHandler()
    handler.setLevel(logging.DEBUG)
    handler.setFormatter(
        logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    )
    root = logging.getLogger()
    root.addHandler(handler)
    _broadcast_handler = handler
    _handler_attached = True
    logger.info("已启用本地日志广播（logging → SSE）")
    # Also attach to common server loggers (uvicorn/gunicorn/hypercorn) which may not
    # propagate to root or may run with different logger configurations inside containers.
    common_logger_names = [
        "uvicorn",
        "uvicorn.error",
        "uvicorn.access",
        "gunicorn.error",
        "gunicorn.access",
        "hypercorn.error",
        "hypercorn.access",
    ]
    for name in common_logger_names:
        try:
            lg = logging.getLogger(name)
            # Avoid duplicate handler instances
            if not any(isinstance(h, _LogBroadcastHandler) for h in lg.handlers):
                lg.addHandler(handler)
        except Exception:
            pass

    # Intercept stdout/stderr so that prints and other direct writes are also streamed.
    # Keep originals to avoid disrupting other behavior.
    try:
        global _orig_stdout, _orig_stderr, _stdout_interceptor_attached
        if not globals().get("_stdout_interceptor_attached", False):
            _orig_stdout = sys.stdout
            _orig_stderr = sys.stderr

            class _StdoutInterceptor:
                def __init__(self, orig):
                    self.orig = orig
                    self._buf = ""

                def write(self, s):
                    try:
                        self.orig.write(s)
                    except Exception:
                        pass
                    try:
                        # Accumulate and emit complete lines
                        self._buf += str(s or "")
                        while "\n" in self._buf:
                            line, self._buf = self._buf.split("\n", 1)
                            if line:
                                _schedule_fanout(line)
                    except Exception:
                        pass

                def flush(self):
                    try:
                        self.orig.flush()
                    except Exception:
                        pass

                def isatty(self):
                    try:
                        return self.orig.isatty()
                    except Exception:
                        return False

            sys.stdout = _StdoutInterceptor(_orig_stdout)
            sys.stderr = _StdoutInterceptor(_orig_stderr)
            _stdout_interceptor_attached = True
            logger.info("已拦截 stdout/stderr，用于日志流广播（container friendly）")
    except Exception:
        logger.exception("初始化 stdout/stderr 拦截失败")


async def _register_subscriber() -> asyncio.Queue[str]:
    q: asyncio.Queue[str] = asyncio.Queue(maxsize=SUBSCRIBER_QUEUE_MAX)
    with _subscriber_thread_lock:
        _subscribers.add(q)
    return q


async def _unregister_subscriber(q: asyncio.Queue[str]) -> None:
    with _subscriber_thread_lock:
        _subscribers.discard(q)


@router.get("/logs/config")
async def logs_stream_config():
    """供前端展示当前日志来源（本进程 / Space 代理）。"""
    mode = effective_log_stream_mode()
    return {
        "source": mode,
        "hf": mode == "hf",
        "local": mode == "local",
    }


@router.get("/logs/stream")
async def stream_logs():
    mode = effective_log_stream_mode()

    if mode == "local":
        return StreamingResponse(
            _local_log_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    token = _super_user_token()
    if not token:
        raise HTTPException(
            status_code=503,
            detail="部署环境未配置 SUPER_USER，无法代理 Hugging Face 运行日志。",
        )

    target_url = _hf_logs_url()
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "text/event-stream, text/plain, */*",
    }

    async def hf_generator():
        try:
            async with httpx.AsyncClient(timeout=None, follow_redirects=True) as client:
                async with client.stream("GET", target_url, headers=headers) as response:
                    if not response.is_success:
                        body = await response.aread()
                        snippet = body.decode("utf-8", errors="replace")[:800]
                        logger.warning(
                            "HF logs upstream error: %s %s",
                            response.status_code,
                            snippet,
                        )
                        yield f"data: [upstream {response.status_code}] {_sse_escape_data(snippet)}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        line = line.strip("\r")
                        if line:
                            yield f"data: {_sse_escape_data(line)}\n\n"
        except httpx.HTTPError as exc:
            logger.exception("HF logs stream HTTP error")
            yield f"data: [proxy error] {_sse_escape_data(str(exc))}\n\n"
        except Exception as exc:  # noqa: BLE001
            logger.exception("HF logs stream failed")
            yield f"data: [proxy error] {_sse_escape_data(str(exc))}\n\n"

    return StreamingResponse(
        hf_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _local_log_generator():
    q = await _register_subscriber()
    try:
        yield "data: [monitor] source=local (本进程 logging)\n\n"
        while True:
            line = await q.get()
            yield f"data: {_sse_escape_data(line)}\n\n"
    finally:
        await _unregister_subscriber(q)
