"""
实时统计 SSE 推送模块

功能：基于 SSE 连接主信号 + 断线心跳兜底的实时在线统计与推送。

在线判定：
- SSE 连接存活时按身份引用计数，同身份多标签页只计一人；
- SSE 不可达时，前端每 30s 上报一次兜底心跳，后端在 90s 窗口内判在线；
- 连接成功时清除同身份旧心跳，确保正常断开后不会被过期心跳长期保活。

架构：
- OnlineUserTracker：内存记录身份 → 最后心跳时间，去重统计窗口内身份数。
- StatsBroadcaster：单例管理器，持有客户端 asyncio.Queue 与身份归属。
- ticket 机制：EventSource 无法携带自定义 header，先 GET /api/statistics
  /ticket（正常鉴权）换取一次性短时 ticket，再以 ?ticket= 连接 stream。
- /api/statistics/stream：SSE 端点；连接后由定时器每 15s 广播在线统计。

线程模型：
- 鉴权路径（asyncio.to_thread worker 线程）调用 mark_user_active：仅在该身份
  没有 SSE 连接时刷新兜底时间戳，避免健康连接期间产生幽灵心跳；
- 显式 /statistics/heartbeat 始终调用 mark_heartbeat，并在新身份出现时
  请求立即广播。
- request_immediate_broadcast 使用 init_broadcaster 绑定的主事件循环
  （bind_main_event_loop）执行 run_coroutine_threadsafe，避免
  asyncio.get_event_loop() 在 worker 线程拿不到运行中循环而静默失效。
"""

import asyncio
import json
import logging
import secrets
import time as _time
from collections import OrderedDict
from threading import Lock as _ThreadLock
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from api.auth.dependencies import require_login

logger = logging.getLogger(__name__)

# ─── 断线兜底心跳模型 ───
# 前端仅在 SSE 不可用时每 30s 上报；窗口 = 3 × 间隔，容忍两次丢失。
HEARTBEAT_INTERVAL_SECONDS = 30
HEARTBEAT_WINDOW_SECONDS = 90

# ─── 广播间隔（秒）：后端每周期将在线人数推送给所有前端展示 ───
BROADCAST_INTERVAL_SECONDS = 15

# ─── SSE 流 ticket 有效期（秒）───
# ticket 仅用于建立 SSE 连接、一次性消费；窗口 60s ≫ 连接建立耗时。
STREAM_TICKET_TTL_SECONDS = 60

# ─── SSE 连接 keep-alive 探测间隔（秒）───
# SSE 仅承担"实时数据推送"通道，不再参与在线判定（在线只看心跳）；
# keep-alive 仍用于防止代理空闲切断推送通道。
SSE_KEEPALIVE_SECONDS = 10

class OnlineUserTracker:
    """
    内存中的实时在线用户追踪器（线程安全）。

    在线判定 = 两类信号的并集（任一满足即在线）：
    1) SSE 连接保活（mark_connection / drop_connection）：后端以"长连接
       是否存活"判定在线，按身份引用计数（同身份多标签页共存时不误杀）。
       前端正常态仅维持这一条 SSE 长连接，无需任何轮询请求。
    2) 心跳窗口（mark_heartbeat）：SSE 不可达时的兜底信号源。前端仅在
       SSE 断开时才以低频心跳保活，避免常态 5s 轮询打满后端。

    设计动机（V3.5.25）：原模型以 5s POST 心跳为唯一信号，前端每 5s 必
    须打一次后端（穿透 require_login 做一次会话 DB 查询），长期运行 +
    后台标签节流回前台后高频轮询，在受限后端上形成持续读取压力并拖垮
    响应。改为"SSE 连接为主、心跳兜底"后，正常态前端零轮询。
    """

    def __init__(self, window: int = HEARTBEAT_WINDOW_SECONDS):
        self._active_window = window
        # 心跳时间戳（兜底信号）：身份 → 最近心跳单调时刻
        self._users: OrderedDict[str, float] = OrderedDict()
        # SSE 连接引用计数（主信号）：身份 → 存活连接数
        self._conns: Dict[str, int] = {}
        self._lock = _ThreadLock()
        self._last_cleanup = _time.monotonic()

    def mark_connection(self, user_id: str) -> None:
        """SSE 连接建立时调用：身份引用计数 +1；新身份上线触发即时广播。"""
        is_new = False
        with self._lock:
            is_new = user_id not in self._conns and user_id not in self._users
            # ticket 鉴权会先记一次活跃心跳；连接接管后删除该旧信号，
            # 避免 SSE 正常断开仍被心跳窗口幽灵保活。
            self._users.pop(user_id, None)
            self._conns[user_id] = self._conns.get(user_id, 0) + 1
        if is_new:
            request_immediate_broadcast()

    def drop_connection(self, user_id: str) -> None:
        """SSE 连接断开时调用：身份引用计数 -1（归零即移除，立即广播更新）。"""
        with self._lock:
            cnt = self._conns.get(user_id, 0) - 1
            if cnt <= 0:
                self._conns.pop(user_id, None)
            else:
                self._conns[user_id] = cnt
        request_immediate_broadcast()

    def mark_authenticated_activity(self, user_id: str) -> None:
        """记录普通鉴权活跃；已有 SSE 连接时不创建兜底心跳。"""
        now = _time.monotonic()
        is_new = False
        with self._lock:
            # 健康 SSE 已是更强的在线信号；不要创建会在连接断开后
            # 继续存活一个完整窗口的兜底时间戳。
            if user_id in self._conns:
                return
            is_new = user_id not in self._users
            self._users.pop(user_id, None)
            self._users[user_id] = now
            if now - self._last_cleanup > 60:
                self._cleanup(now)
        if is_new:
            request_immediate_broadcast()

    def mark_heartbeat(self, user_id: str) -> None:
        """记录显式降级心跳；新身份出现时触发即时广播。"""
        now = _time.monotonic()
        is_new = False
        with self._lock:
            is_new = user_id not in self._conns and user_id not in self._users
            # 显式心跳来自 SSE 降级路径；即使服务端尚未感知代理旧连接
            # 已断开，也要保留这一合法兜底信号。
            self._users.pop(user_id, None)
            self._users[user_id] = now
            # 每分钟至多清理一次过期兜底记录。
            if now - self._last_cleanup > 60:
                self._cleanup(now)
        if is_new:
            # 新身份上线时尽力触发即时广播。
            request_immediate_broadcast()

    def _online_names(self) -> set:
        """当前在线身份集合（有存活连接 ∪ 窗口内有心跳）。须持锁调用。"""
        now = _time.monotonic()
        self._cleanup(now)
        beat_ids = {u for u, ts in self._users.items() if now - ts <= self._active_window}
        return set(self._conns.keys()) | beat_ids

    def get_online_count(self) -> int:
        """返回当前在线独立用户数。"""
        with self._lock:
            return len(self._online_names())

    def get_online_users(self) -> list:
        """返回当前在线用户名列表。"""
        with self._lock:
            return list(self._online_names())

    def _cleanup(self, now: float) -> None:
        """清理超过心跳窗口的过期条目（仅清理心跳侧；连接侧即时移除）。"""
        if self._users:
            # OrderedDict 按插入顺序，最早的在前
            while self._users and next(iter(self._users.values())) < now - self._active_window:
                self._users.popitem(last=False)
        self._last_cleanup = now


# ─── 全局单例 ───
_online_tracker = OnlineUserTracker()


def get_online_tracker() -> OnlineUserTracker:
    """获取全局 OnlineUserTracker 实例。"""
    return _online_tracker


def mark_user_active(username: str) -> None:
    """记录普通鉴权活跃，但不覆盖健康 SSE 主信号。"""
    _online_tracker.mark_authenticated_activity(username)


class StatsBroadcaster:
    """
    统计广播管理器（单例模式，挂载到 app.state.stats_broadcaster）

    每个客户端连接注册一个 asyncio.Queue；broadcast 时向所有 Queue 写入事件。
    Queue 满时丢弃最旧事件（非阻塞），保证心跳侧永远不被 IO 阻塞。
    """

    def __init__(self, queue_size: int = 4):
        self._queues: set[asyncio.Queue] = set()
        self._queue_owner: Dict[asyncio.Queue, str] = {}
        self._queue_size = queue_size
        self._lock = asyncio.Lock()

    async def register(self, username: str) -> asyncio.Queue:
        """注册新客户端，返回其专属 Queue 并记录归属身份（用于在线计数）。"""
        queue: asyncio.Queue = asyncio.Queue(maxsize=self._queue_size)
        async with self._lock:
            self._queues.add(queue)
            self._queue_owner[queue] = username
        logger.debug("SSE 客户端注册（当前 %d 个）", len(self._queues))
        return queue

    async def unregister(self, queue: asyncio.Queue) -> Optional[str]:
        """注销客户端并返回其身份；已移除的 Queue 返回 None。"""
        async with self._lock:
            self._queues.discard(queue)
            owner = self._queue_owner.pop(queue, None)
        logger.debug("SSE 客户端注销（剩余 %d 个）", len(self._queues))
        return owner

    @property
    def client_count(self) -> int:
        """当前连接的客户端数。"""
        return len(self._queues)

    async def broadcast(self, event: str, data: Dict[str, Any]) -> None:
        """
        广播事件到所有已注册客户端。

        Queue 满时丢弃最旧一条（put 前先 get_nowait），保证：
        1. 广播永远不会阻塞
        2. 客户端永远收到最新数据（旧数据无意义）
        """
        payload = f"event: {event}\ndata: {json.dumps(data)}\n\n"
        dead_owners = []
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
            for q in dead_queues:
                self._queues.discard(q)
                owner = self._queue_owner.pop(q, None)
                if owner:
                    dead_owners.append(owner)
        for owner in dead_owners:
            _online_tracker.drop_connection(owner)


# ─── 全局 broadcaster 单例 + 主事件循环绑定 ───
_broadcaster: Optional[StatsBroadcaster] = None
# 主事件循环引用：lifespan startup 绑定，供 worker 线程桥接广播调度
_event_loop: Optional[asyncio.AbstractEventLoop] = None


def get_broadcaster() -> StatsBroadcaster:
    """获取全局 StatsBroadcaster 实例（惰性创建）。"""
    global _broadcaster
    if _broadcaster is None:
        _broadcaster = StatsBroadcaster()
    return _broadcaster


def init_broadcaster() -> StatsBroadcaster:
    """
    初始化全局 StatsBroadcaster 并绑定主事件循环（app lifespan startup 中调用）。

    必须在事件循环运行中调用（FastAPI lifespan 内），此后 worker 线程
    可通过 request_immediate_broadcast() 安全调度广播协程。
    """
    global _broadcaster, _event_loop
    _broadcaster = StatsBroadcaster()
    _event_loop = asyncio.get_running_loop()
    return _broadcaster


def request_immediate_broadcast() -> None:
    """
    线程安全地请求一次"立即广播"（worker 线程 / tracker 均可调用）。

    主事件循环未绑定或无 SSE 客户端时静默跳过（广播无意义）；
    否则将计算+广播协程调度到主循环执行。任何异常不影响调用方（尽力而为）。
    """
    try:
        loop = _event_loop
        if loop is None or loop.is_closed():
            return
        if get_broadcaster().client_count == 0:
            return
        asyncio.run_coroutine_threadsafe(_compute_and_broadcast_once(), loop)
    except Exception:
        pass


# ─── 统计快照计算与广播（定时器与即时触发共用）───
async def _compute_and_broadcast_once() -> None:
    """
    计算一次最新统计快照并广播（仅供事件循环内调用）。

    _get_realtime_global_stats_sync 为同步阻塞函数（多表查询），统一经
    asyncio.to_thread 执行；该函数自身维护全局 10 秒缓存，避免双层缓存
    把最坏陈旧时间叠加到 20 秒。在线人数始终基于内存 tracker 实时计算。
    """
    from api.statistics import _get_realtime_global_stats_sync

    stats = dict(await asyncio.to_thread(_get_realtime_global_stats_sync))
    stats["realtime_online_users"] = _online_tracker.get_online_count()
    stats["realtime_online_userlist"] = _online_tracker.get_online_users()
    await get_broadcaster().broadcast("online_stats", stats)


# ─── 定时广播任务 ───
_broadcast_task: Optional[asyncio.Task] = None


async def _periodic_broadcast_loop() -> None:
    """每 BROADCAST_INTERVAL_SECONDS 秒计算在线统计并广播到所有 SSE 客户端。"""
    broadcaster = get_broadcaster()
    while True:
        try:
            await asyncio.sleep(BROADCAST_INTERVAL_SECONDS)
            if broadcaster.client_count > 0:
                await _compute_and_broadcast_once()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning("定时广播异常: %s", e)
            # 异常后继续循环，不退出


def start_periodic_broadcast() -> None:
    """启动定时广播后台任务（在 app startup 中调用，须在事件循环运行中）。"""
    global _broadcast_task
    if _broadcast_task is None or _broadcast_task.done():
        loop = asyncio.get_running_loop()
        _broadcast_task = loop.create_task(_periodic_broadcast_loop())
        logger.info("实时统计定时广播已启动（间隔 %ds）", BROADCAST_INTERVAL_SECONDS)


def stop_periodic_broadcast() -> None:
    """停止定时广播任务（在 app shutdown 中调用）。"""
    global _broadcast_task
    if _broadcast_task and not _broadcast_task.done():
        _broadcast_task.cancel()
        _broadcast_task = None


# ─── SSE 流 ticket（一次性、短时，替代 URL 中的完整会话 token）───
# 背景（V3.5.19）：EventSource 不支持自定义 header。旧实现把完整会话
# token 放 query param，会进入代理 access log / 浏览器历史，泄漏面过大。
# 现改为：先经 /api/statistics/ticket 正常鉴权换取一次性短时 ticket。
_stream_tickets: Dict[str, Tuple[str, float]] = {}  # ticket → (username, 过期时刻)
_tickets_lock = _ThreadLock()


def create_stream_ticket(username: str) -> str:
    """生成一次性 SSE ticket（STREAM_TICKET_TTL_SECONDS 秒有效）。"""
    ticket = secrets.token_urlsafe(24)
    expires_at = _time.monotonic() + STREAM_TICKET_TTL_SECONDS
    with _tickets_lock:
        _stream_tickets[ticket] = (username, expires_at)
        _prune_tickets_locked()
    return ticket


def consume_stream_ticket(ticket: str) -> Optional[str]:
    """
    消费 ticket：有效则返回用户名并删除（一次性）；为空/无效/过期返回 None。
    """
    if not ticket:
        return None
    with _tickets_lock:
        entry = _stream_tickets.pop(ticket, None)
        if entry is None:
            return None
        username, expires_at = entry
        if _time.monotonic() > expires_at:
            return None
        return username


def _prune_tickets_locked() -> None:
    """清理过期 ticket（须持有 _tickets_lock 调用）。"""
    now = _time.monotonic()
    expired = [t for t, (_, exp) in _stream_tickets.items() if now > exp]
    for t in expired:
        _stream_tickets.pop(t, None)


# ==================== SSE 端点 ====================

router = APIRouter(prefix="/api", tags=["realtime-stats"])


@router.get("/statistics/ticket")
async def statistics_ticket(session: Dict[str, Any] = Depends(require_login)):
    """
    换取 SSE 实时统计流的一次性 ticket（60s 有效，仅 /statistics/stream 消费）。

    动机（V3.5.19）：避免完整会话 token 以 query param 形式进入 URL/日志；
    ticket 短时、一次性、仅能建立统计流连接，不作为任意 API 的凭据。
    """
    username = str(session.get("username") or "")
    return {
        "ticket": create_stream_ticket(username),
        "expires_in": STREAM_TICKET_TTL_SECONDS,
    }


@router.get("/statistics/stream")
async def statistics_stream(
    request: Request,
    ticket: str = Query("", description="一次性 SSE 流 ticket（由 /statistics/ticket 换取）"),
):
    """
    SSE 实时统计流（V3.5.19）。

    客户端连接后：
    1. 立即推送一次当前快照
    2. 每 15s 自动推送最新在线统计（由后端定时器驱动）；
       新用户上线时由 tracker 触发即时广播，无需等待下一个定时周期
    3. 额外 keep-alive 防止代理超时
    """
    username = consume_stream_ticket(ticket)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="流凭据无效、已过期或已被使用，请重新换取",
        )

    broadcaster = get_broadcaster()

    async def event_generator():
        queue = None
        try:
            # 在响应体真正开始迭代时才登记，确保登记与 finally 清理属于
            # 同一生成器生命周期；客户端过早断开不会留下幽灵连接。
            queue = await broadcaster.register(username)
            _online_tracker.mark_connection(username)

            # 初始快照：连接建立后立即推送
            try:
                await _compute_and_broadcast_once()
            except Exception as e:
                logger.warning("SSE 初始快照失败: %s", e)

            # 持续监听 Queue（定时/即时广播会自动写入事件）
            while True:
                try:
                    payload = await asyncio.wait_for(
                        queue.get(), timeout=SSE_KEEPALIVE_SECONDS
                    )
                    yield payload
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning("SSE 连接异常断开: %s", e)
        finally:
            if queue is not None:
                owner = await broadcaster.unregister(queue)
                if owner:
                    # 连接断开即撤销该客户端在线信号（引用计数归零剔除）
                    _online_tracker.drop_connection(owner)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/statistics/heartbeat")
async def statistics_heartbeat(session: Dict[str, Any] = Depends(require_login)):
    """
    SSE 断开时的低频兜底心跳端点。

    前端（登录/游客）每 HEARTBEAT_INTERVAL_SECONDS 秒上报一次；
    普通鉴权在 SSE 健康时不会创建兜底记录，因此本端点显式写入心跳。
    窗口过期未收到下次心跳 → 自动剔除（下线/断网/关页即停心跳）。

    响应携带当前在线数，使客户端即使没有 SSE 推送通道也能展示实时人数
    （心跳=信号通道 + 数据通道双合一）。
    """
    username = str(session.get("username") or "").strip()
    if username:
        _online_tracker.mark_heartbeat(username)
    return {"ok": True, "online": _online_tracker.get_online_count()}
