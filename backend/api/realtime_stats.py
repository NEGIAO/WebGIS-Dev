"""
实时统计 SSE 推送模块

功能：基于内存心跳模型的实时在线用户统计 + SSE 实时推送。

在线判定（单一信号源）：
- 前端每个在线客户端每 5s 上报一次心跳（POST /api/statistics/heartbeat，
  唯一标识 = 登录 username / 游客 uid），后端在 15s 窗口内收到即在线；
  下线/断网/关页 → 心跳停止 → 窗口过期自动剔除 → 每 15s 定时广播人数。

架构：
- OnlineUserTracker：内存记录身份 → 最后心跳时间，去重统计窗口内身份数。
- StatsBroadcaster：单例管理器，持有所有客户端 asyncio.Queue（SSE 仅
  承担推送通道，不再参与在线判定）。
- ticket 机制：EventSource 无法携带自定义 header，先 GET /api/statistics
  /ticket（正常鉴权）换取一次性短时 ticket，再以 ?ticket= 连接 stream。
- /api/statistics/stream：SSE 端点；连接后由定时器每 15s 广播在线统计。

线程模型：
- 鉴权路径（asyncio.to_thread worker 线程）调用 mark_user_active —— 与
  心跳等价地刷新身份时间戳；mark_heartbeat 对"新身份"调用
  request_immediate_broadcast()；
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

# ─── 心跳统计模型 ───
# 前端每个在线客户端每 HEARTBEAT_INTERVAL_SECONDS 秒主动上报一次活跃
# 心跳（唯一标识 = 登录 username / 游客 device_id 派生 uid，同身份多
# 标签页心跳去重为 1 人）。后端在 HEARTBEAT_WINDOW_SECONDS 内收到该
# 身份的心跳即视为在线；下线/断网/关页后心跳停止，窗口过期自动剔除。
# 窗口 = 3 × 心跳间隔，容忍 2 次心跳丢失（网络抖动不闪断）。
HEARTBEAT_INTERVAL_SECONDS = 5
HEARTBEAT_WINDOW_SECONDS = 15

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
    内存中的实时在线用户追踪器（线程安全，心跳模型）。

    在线判定（唯一信号源）：
    - 身份在最近 HEARTBEAT_WINDOW_SECONDS 秒内上报过心跳（mark_heartbeat）
    - 身份 = 登录 username 或游客 uid（请求活跃触发的"伪心跳"同样刷新
      时间戳，等价：任何成功的鉴权请求也证明用户活跃）

    对比旧模型：删除"请求活跃 ∪ SSE 连接保活"双信号与断开宽限
    判定——SSE 连接/断开不再影响在线，心跳停止即自动下线（≤ 窗口 + 广播
    周期反映），无闪断误杀，无 offline 上报依赖。
    """

    def __init__(self, window: int = HEARTBEAT_WINDOW_SECONDS):
        self._active_window = window
        self._users: OrderedDict[str, float] = OrderedDict()
        self._lock = _ThreadLock()
        self._last_cleanup = _time.monotonic()

    def mark_heartbeat(self, user_id: str) -> None:
        """记录身份心跳（每次心跳/鉴权请求时调用）；新身份出现触发即时广播。"""
        now = _time.monotonic()
        is_new = False
        with self._lock:
            is_new = user_id not in self._users
            # 移到末尾（最新活跃）并更新时间戳
            self._users.pop(user_id, None)
            self._users[user_id] = now
            # 每 60s 清理一次过期条目
            if now - self._last_cleanup > 60:
                self._cleanup(now)
        if is_new:
            # 新身份上线，立即广播（尽力而为，不阻塞心跳线路）
            request_immediate_broadcast()

    def _online_names(self) -> set:
        """当前在线身份集合（窗口内有心跳）。须持锁调用。"""
        now = _time.monotonic()
        self._cleanup(now)
        return {u for u, ts in self._users.items() if now - ts <= self._active_window}

    def get_online_count(self) -> int:
        """返回当前在线独立用户数。"""
        with self._lock:
            return len(self._online_names())

    def get_online_users(self) -> list:
        """返回当前在线用户名列表。"""
        with self._lock:
            return list(self._online_names())

    def _cleanup(self, now: float) -> None:
        """清理超过心跳窗口的过期条目。"""
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
    """暴露给外部调用（如鉴权中间件）的记录活跃接口。

    心跳模型下等价于一次心跳：任何成功的鉴权请求都证明
    用户活跃，刷新其在线时间戳（高频请求者在线更稳，无损）。
    """
    _online_tracker.mark_heartbeat(username)


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
        1. 广播永远不会阻塞
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
            for q in dead_queues:
                self._queues.discard(q)


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

    _get_realtime_global_stats_sync 为同步阻塞函数（多表查询），
    统一经 asyncio.to_thread 执行，避免阻塞事件循环。
    """
    from api.statistics import _get_realtime_global_stats_sync

    stats = await asyncio.to_thread(_get_realtime_global_stats_sync)
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

    # SSE 仅承担实时推送通道，连接建立/断开不再影响在线判定
    #（在线只看心跳）。ticket 消费即放行，无需标记连接保活。
    broadcaster = get_broadcaster()
    queue = await broadcaster.register()

    async def event_generator():
        try:
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
            await broadcaster.unregister(queue)
            # 在线判定与连接无关（心跳模型），无需额外处理

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
    客户端活跃心跳（心跳模型核心端点）。

    前端（登录/游客）每 HEARTBEAT_INTERVAL_SECONDS 秒上报一次；
    require_login 内部已触发 mark_user_active（等价心跳，刷新在线时间戳）。
    窗口过期未收到下次心跳 → 自动剔除（下线/断网/关页即停心跳）。

    响应携带当前在线数，使客户端即使没有 SSE 推送通道也能展示实时人数
    （心跳=信号通道 + 数据通道双合一）。
    """
    return {"ok": True, "online": _online_tracker.get_online_count()}
