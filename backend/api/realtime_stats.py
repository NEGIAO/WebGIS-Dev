"""
实时统计 SSE 推送模块（V3.4.63 R1）

功能：维护全站 SSE 客户端连接池，在心跳触达 last_seen_at 后主动广播在线统计快照，
使前端无需轮询即可实时看到在线人数变化。

架构：
- StatsBroadcaster：单例管理器，持有所有客户端 asyncio.Queue，提供 broadcast 方法
- /api/statistics/stream：SSE 端点，客户端连接后注册 Queue， yield 事件流
- broadcast_stats()：供 session.py 心跳触发，计算最新统计并推送到所有客户端
"""

import asyncio
import json
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from api.auth.dependencies import require_login
from api.statistics import _get_realtime_global_stats_sync

logger = logging.getLogger(__name__)


class StatsBroadcaster:
    """
    统计广播管理器（单例模式，挂载到 app.state.stats_broadcaster）

    每个客户端连接注册一个 asyncio.Queue；broadcast 时向所有 Queue 写入事件。
    Queue 满时丢弃最旧事件（非阻塞），保证心跳侧永远不被 IO 阻塞。
    """

    def __init__(self, queue_size: int = 4):
        self._queues: set[asyncio.Queue] = set()
        self._queue_size = queue_size
        self._lock = asyncio.Lock()

    async def register(self) -> asyncio.Queue:
        """注册新客户端，返回其专属 Queue。"""
        queue: asyncio.Queue = asyncio.Queue(maxsize=self._queue_size)
        async with self._lock:
            self._queues.add(queue)
        logger.debug("SSE 客户端注册（当前 %d 个）", len(self._queues))
        return queue

    async def unregister(self, queue: asyncio.Queue) -> None:
        """注销客户端（连接断开时调用）。"""
        async with self._lock:
            self._queues.discard(queue)
        logger.debug("SSE 客户端注销（剩余 %d 个）", len(self._queues))

    @property
    def client_count(self) -> int:
        """当前连接的客户端数。"""
        return len(self._queues)

    async def broadcast(self, event: str, data: Dict[str, Any]) -> None:
        """
        广播事件到所有已注册客户端。

        Queue 满时丢弃最旧一条（put 前先 get_nowait），保证：
        1. 广播永远不会阻塞心跳链路
        2. 客户端永远收到最新数据（旧数据无意义）
        """
        payload = f"event: {event}\ndata: {json.dumps(data)}\n\n"
        async with self._lock:
            dead_queues = []
            for queue in self._queues:
                try:
                    if queue.full():
                        try:
                            queue.get_nowait()
                        except asyncio.QueueEmpty:
                            pass
                    queue.put_nowait(payload)
                except Exception:
                    dead_queues.append(queue)
            # 清理已失效的 Queue
            for q in dead_queues:
                self._queues.discard(q)


# 模块级单例占位符（在 app.py lifespan 中初始化并挂载到 app.state）
_broadcaster: Optional[StatsBroadcaster] = None


def get_broadcaster() -> StatsBroadcaster:
    """获取全局 StatsBroadcaster 实例（须在 lifespan 初始化后调用）。"""
    global _broadcaster
    if _broadcaster is None:
        _broadcaster = StatsBroadcaster()
    return _broadcaster


def init_broadcaster() -> StatsBroadcaster:
    """初始化全局 StatsBroadcaster（在 app startup 中调用一次）。"""
    global _broadcaster
    _broadcaster = StatsBroadcaster()
    return _broadcaster


# ==================== SSE 端点 ====================

router = APIRouter(tags=["realtime-stats"])


@router.get("/statistics/stream")
async def statistics_stream(
    request: Request,
    _session: Dict[str, Any] = Depends(require_login),
):
    """
    SSE 实时统计流。

    客户端连接后持续推送 online_stats 事件，数据源为 _get_realtime_global_stats_sync。
    初始连接时立即推送一次当前快照，后续由心跳侧主动触发广播。
    """
    broadcaster = get_broadcaster()
    queue = await broadcaster.register()

    async def event_generator():
        try:
            # 初始快照：连接建立后立即推送一次当前数据
            try:
                initial_stats = _get_realtime_global_stats_sync()
                yield f"event: online_stats\ndata: {json.dumps(initial_stats)}\n\n"
            except Exception as e:
                logger.warning("SSE 初始快照失败: %s", e)

            # 持续监听 Queue， yield 新事件
            while True:
                # 定期检查客户端是否已断开（每 30s 超时）
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield payload
                except asyncio.TimeoutError:
                    # 发送 keep-alive 注释，防止代理/Nginx 关闭空闲连接
                    yield ": keep-alive\n\n"
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning("SSE 连接异常断开: %s", e)
        finally:
            await broadcaster.unregister(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # 禁用 Nginx 缓冲，保证实时性
        },
    )
