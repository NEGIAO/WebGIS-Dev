"""
实时统计 SSE 推送模块

功能：以 SSE 连接为主信号、鉴权活跃为兜底的实时在线统计与推送（V3.5.25：
统计逻辑完全由后端承担，前端仅维持一条 SSE 长连接，零轮询零心跳）。

在线判定：
- SSE 连接存活时按身份引用计数，同身份多标签页只计一人；
- SSE 不可达时，普通鉴权 API 请求会搭车刷新该身份的兜底活跃时间戳，
  90s 窗口内判在线（浏览页面必然伴随 API 活动，前端无需额外请求）；
- 连接成功时清除同身份旧活跃记录，确保正常断开后不会被过期记录长期保活。

架构：
- OnlineUserTracker：内存记录身份 → 连接引用计数 + 最后活跃时刻。
- StatsBroadcaster：单例管理器，持有客户端 asyncio.Queue 与身份归属。
- ticket 机制：EventSource 无法携带自定义 header，先 GET /api/statistics
  /ticket（正常鉴权）换取一次性短时 ticket，再以 ?ticket= 连接 stream。
- /api/statistics/stream：SSE 端点；状态变化即时广播（合并窗口防风暴），
  另有低频保底周期广播与心跳过期扫描协程。

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
import hashlib
import json
import logging
import secrets
import time as _time
from collections import OrderedDict
from threading import Lock as _ThreadLock
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from api.auth.constants import (
    ROLE_GUEST,
    _build_guest_uid,
    _normalize_guest_device_id,
    normalize_role,
)
from api.auth.dependencies import require_admin, require_login

logger = logging.getLogger(__name__)

# ─── 兜底活跃窗口 ───
# SSE 不可达期间以"最近鉴权 API 活动"判定在线；90s 窗口容忍页面短暂空闲。
HEARTBEAT_INTERVAL_SECONDS = 30  # 兼容旧前端心跳间隔参考值（当前前端已不发送）
HEARTBEAT_WINDOW_SECONDS = 90

# SSE 连接空闲 TTL：代理/半开连接在 disconnect 探测失灵时的兜底剔除。
# 正常客户端每 10s 收 keep-alive，连接侧 last_seen 会被广播/探活路径刷新；
# 超过 TTL 仍无任何写活动的连接视为幽灵，剔除并广播。
SSE_CONNECTION_TTL_SECONDS = 75

# ─── 广播策略 ───
# 事件驱动为主（连接/断开/心跳过期即刻触发），经 COALESCE 窗口合并防风暴；
# 周期广播仅作保底（防丢消息 + 刷新 DB 统计字段），无变化也推送的频率降低。
BROADCAST_INTERVAL_SECONDS = 30
BROADCAST_COALESCE_SECONDS = 1.0

# ─── 心跳过期扫描间隔 ───
# 兜底心跳过期后由该扫描即时剔除并广播，消除"等下一个周期才掉线"的静默期。
HEARTBEAT_EXPIRY_SCAN_SECONDS = 5

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
    2) 活跃窗口（mark_authenticated_activity / mark_heartbeat）：SSE 不可达
       时的兜底信号源。普通鉴权 API 请求搭车刷新（前端零额外请求）；
       显式 heartbeat 端点仅向后兼容保留。

    设计动机（V3.5.25）：原模型以 5s POST 心跳为唯一信号，前端每 5s 必
    须打一次后端（穿透 require_login 做一次会话 DB 查询），长期运行 +
    后台标签节流回前台后高频轮询，在受限后端上形成持续读取压力并拖垮
    响应。现由后端全权判定：连接为主、鉴权活跃兜底、过期扫描即时剔除。
    """

    def __init__(self, window: int = HEARTBEAT_WINDOW_SECONDS):
        self._active_window = window
        # 心跳时间戳（兜底信号）：presence_id → 最近心跳单调时刻
        self._users: OrderedDict[str, float] = OrderedDict()
        # SSE 连接引用计数（主信号）：presence_id → 存活连接数
        self._conns: Dict[str, int] = {}
        # 连接侧最近活动时刻：presence_id → monotonic（TTL 剔除幽灵连接）
        self._conn_seen: Dict[str, float] = {}
        self._lock = _ThreadLock()
        self._last_cleanup = _time.monotonic()

    def mark_connection(self, user_id: str) -> None:
        """SSE 连接建立时调用：presence_id 引用计数 +1；新身份上线触发即时广播。"""
        if not user_id:
            return
        is_new = False
        now = _time.monotonic()
        with self._lock:
            is_new = user_id not in self._conns and user_id not in self._users
            # ticket 鉴权会先记一次活跃心跳；连接接管后删除该旧信号，
            # 避免 SSE 正常断开仍被心跳窗口幽灵保活。
            self._users.pop(user_id, None)
            self._conns[user_id] = self._conns.get(user_id, 0) + 1
            self._conn_seen[user_id] = now
        if is_new:
            request_immediate_broadcast()

    def drop_connection(self, user_id: str) -> None:
        """SSE 连接断开时调用：presence_id 引用计数 -1（归零即移除，立即广播更新）。"""
        if not user_id:
            return
        with self._lock:
            cnt = self._conns.get(user_id, 0) - 1
            if cnt <= 0:
                self._conns.pop(user_id, None)
                self._conn_seen.pop(user_id, None)
            else:
                self._conns[user_id] = cnt
                self._conn_seen[user_id] = _time.monotonic()
        request_immediate_broadcast()

    def touch_connection(self, user_id: str) -> None:
        """刷新连接侧活跃时刻（广播/keep-alive 路径调用，供 TTL 剔除幽灵连接）。"""
        if not user_id:
            return
        with self._lock:
            if user_id in self._conns:
                self._conn_seen[user_id] = _time.monotonic()

    def prune_stale_connections(self, ttl: int = SSE_CONNECTION_TTL_SECONDS) -> bool:
        """剔除超过 TTL 无活动的 SSE 连接；有剔除返回 True。"""
        now = _time.monotonic()
        stale = []
        with self._lock:
            for pid, seen_at in list(self._conn_seen.items()):
                if now - seen_at > ttl:
                    stale.append(pid)
            for pid in stale:
                self._conns.pop(pid, None)
                self._conn_seen.pop(pid, None)
        return bool(stale)

    def mark_authenticated_activity(self, user_id: str) -> None:
        """记录普通鉴权活跃；已有 SSE 连接时不创建兜底心跳。"""
        if not user_id:
            return
        now = _time.monotonic()
        is_new = False
        with self._lock:
            # 健康 SSE 已是更强的在线信号；不要创建会在连接断开后
            # 继续存活一个完整窗口的兜底时间戳。
            if user_id in self._conns:
                self._conn_seen[user_id] = now
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
        if not user_id:
            return
        now = _time.monotonic()
        is_new = False
        with self._lock:
            is_new = user_id not in self._conns and user_id not in self._users
            # 显式心跳来自 SSE 降级路径；即使服务端尚未感知代理旧连接
            # 已断开，也要保留这一合法兜底信号。
            self._users.pop(user_id, None)
            self._users[user_id] = now
            if user_id in self._conns:
                self._conn_seen[user_id] = now
            # 每分钟至多清理一次过期兜底记录。
            if now - self._last_cleanup > 60:
                self._cleanup(now)
        if is_new:
            # 新身份上线时尽力触发即时广播。
            request_immediate_broadcast()

    def drop_presence(self, user_id: str) -> None:
        """离线 beacon：立即撤销该身份的连接计数与兜底心跳。"""
        if not user_id:
            return
        with self._lock:
            self._conns.pop(user_id, None)
            self._conn_seen.pop(user_id, None)
            self._users.pop(user_id, None)
        request_immediate_broadcast()

    def snapshot_debug(self) -> Dict[str, Any]:
        """管理员排查用：当前 tracker 内部状态快照。"""
        with self._lock:
            now = _time.monotonic()
            self._cleanup(now)
            conns = {pid: cnt for pid, cnt in self._conns.items()}
            beats = {
                pid: round(now - ts, 1)
                for pid, ts in self._users.items()
                if now - ts <= self._active_window
            }
            conn_age = {
                pid: round(now - ts, 1) for pid, ts in self._conn_seen.items()
            }
            online = self._online_names()
        return {
            "online_count": len(online),
            "online_presence_ids": sorted(online),
            "sse_connections": conns,
            "sse_conn_age_seconds": conn_age,
            "fallback_heartbeat_age_seconds": beats,
            "window_seconds": self._active_window,
            "conn_ttl_seconds": SSE_CONNECTION_TTL_SECONDS,
        }

    def _online_names(self) -> set:
        """当前在线身份集合（有存活连接 ∪ 窗口内有心跳）。须持锁调用。"""
        now = _time.monotonic()
        self._cleanup(now)
        beat_ids = {u for u, ts in self._users.items() if now - ts <= self._active_window}
        raw = set(self._conns.keys()) | beat_ids
        return {pid for pid in raw if _is_countable_presence(pid)}

    def get_online_count(self) -> int:
        """返回当前在线独立用户数。"""
        with self._lock:
            return len(self._online_names())

    def get_online_users(self) -> list:
        """返回当前在线用户名列表。"""
        with self._lock:
            return list(self._online_names())

    def prune_expired(self) -> bool:
        """剔除已过期的兜底心跳；有剔除动作返回 True（供过期扫描协程判断是否广播）。"""
        now = _time.monotonic()
        removed_any = False
        with self._lock:
            while self._users and next(iter(self._users.values())) < now - self._active_window:
                self._users.popitem(last=False)
                removed_any = True
        return removed_any

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
    """
    记录普通鉴权活跃（兼容旧签名：可直接传 presence_id 或裸 username）。

    推荐调用方改用 mark_presence_active(session) 以获得稳定身份键。
    """
    _online_tracker.mark_authenticated_activity(username)


def mark_presence_active(session: Dict[str, Any]) -> None:
    """按会话字段计算 presence_id 并记录鉴权活跃。"""
    pid = presence_id_from_session(session)
    if pid:
        _online_tracker.mark_authenticated_activity(pid)


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

    经 COALESCE 合并窗口去重：短时间内多次状态变化只产生一次计算+广播，
    防止批量上下线（如服务启动恢复、代理抖动）触发广播风暴。
    主事件循环未绑定或无 SSE 客户端时静默跳过；异常不影响调用方。
    """
    try:
        loop = _event_loop
        if loop is None or loop.is_closed():
            return
        if get_broadcaster().client_count == 0:
            return
        asyncio.run_coroutine_threadsafe(_schedule_coalesced_broadcast(), loop)
    except Exception:
        pass


# 仅在主事件循环线程内读写的合并标志（_schedule_coalesced_broadcast 是唯一读写点）
_coalescing = False


async def _schedule_coalesced_broadcast() -> None:
    """合并窗口内的多次广播请求收敛为一次（须在主事件循环内执行）。"""
    global _coalescing
    if _coalescing:
        return
    _coalescing = True
    try:
        await asyncio.sleep(BROADCAST_COALESCE_SECONDS)
    finally:
        _coalescing = False
    await _compute_and_broadcast_once()


# ─── 心跳过期扫描协程 ───
async def _heartbeat_expiry_watch_loop() -> None:
    """
    周期扫描兜底心跳过期项 + SSE 幽灵连接：有剔除即刻广播。

    语义：断网/关页用户停止心跳后，最迟 window + SCAN 秒内从在线数消失，
    而不是等下一次任意请求或保底周期才被发现（消除下线显示滞后）。
    另剔除超过 SSE_CONNECTION_TTL_SECONDS 无写活动的半开连接。
    即使暂无 SSE 客户端也要清扫，避免无人订阅时 tracker 积压幽灵身份。
    """
    while True:
        try:
            await asyncio.sleep(HEARTBEAT_EXPIRY_SCAN_SECONDS)
            expired = _online_tracker.prune_expired()
            stale_conn = _online_tracker.prune_stale_connections()
            if (expired or stale_conn) and get_broadcaster().client_count > 0:
                await _compute_and_broadcast_once()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning("心跳过期扫描异常: %s", e)


# ─── 统计快照计算与广播（定时器与即时触发共用）───
async def _compute_and_broadcast_once() -> None:
    """
    计算一次最新统计快照并广播（仅供事件循环内调用）。

    _get_realtime_global_stats_sync 为同步阻塞函数（多表查询），统一经
    asyncio.to_thread 执行；该函数自身维护全局 10 秒缓存，避免双层缓存
    把最坏陈旧时间叠加到 20 秒。在线人数始终基于内存 tracker 实时计算。
    """
    from api.statistics import _get_realtime_global_stats_sync, _merge_online_tracker

    stats = dict(await asyncio.to_thread(_get_realtime_global_stats_sync))
    # 统一 presence 口径：online_users 与 realtime_online_users 同源 tracker
    stats = _merge_online_tracker(stats)
    await get_broadcaster().broadcast("online_stats", stats)


# ─── 定时广播任务 ───
_broadcast_task: Optional[asyncio.Task] = None
_expiry_watch_task: Optional[asyncio.Task] = None


async def _periodic_broadcast_loop() -> None:
    """保底周期广播：即使无状态变化也定期推送最新快照（防消息丢失/刷新 DB 字段）。"""
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
    """启动保底周期广播 + 心跳过期扫描后台任务（app startup 中调用）。"""
    global _broadcast_task, _expiry_watch_task
    loop = asyncio.get_running_loop()
    if _broadcast_task is None or _broadcast_task.done():
        _broadcast_task = loop.create_task(_periodic_broadcast_loop())
        logger.info("实时统计保底广播已启动（间隔 %ds）", BROADCAST_INTERVAL_SECONDS)
    if _expiry_watch_task is None or _expiry_watch_task.done():
        _expiry_watch_task = loop.create_task(_heartbeat_expiry_watch_loop())
        logger.info(
            "心跳过期扫描已启动（间隔 %ds）", HEARTBEAT_EXPIRY_SCAN_SECONDS
        )


def stop_periodic_broadcast() -> None:
    """停止统计相关后台任务（在 app shutdown 中调用）。"""
    global _broadcast_task, _expiry_watch_task
    for task_attr in ("_broadcast_task", "_expiry_watch_task"):
        task = globals()[task_attr]
        if task and not task.done():
            task.cancel()
        globals()[task_attr] = None


# ─── SSE 流 ticket（一次性、短时，替代 URL 中的完整会话 token）───
# 背景（V3.5.19）：EventSource 不支持自定义 header。旧实现把完整会话
# token 放 query param，会进入代理 access log / 浏览器历史，泄漏面过大。
# 现改为：先经 /api/statistics/ticket 正常鉴权换取一次性短时 ticket。
_stream_tickets: Dict[str, Tuple[str, float]] = {}  # ticket → (username, 过期时刻)
_tickets_lock = _ThreadLock()


def create_stream_ticket(username: str, presence_id: str = "") -> str:
    """生成一次性 SSE ticket（STREAM_TICKET_TTL_SECONDS 秒有效）。

    ticket 载荷 = (presence_id 或回退 username, username)，stream 侧用
    presence_id 做在线计数，username 仅作日志/兼容展示。
    """
    ticket = secrets.token_urlsafe(24)
    expires_at = _time.monotonic() + STREAM_TICKET_TTL_SECONDS
    key = (presence_id or username or "").strip() or username
    with _tickets_lock:
        _stream_tickets[ticket] = (key, expires_at)
        _prune_tickets_locked()
    return ticket


def consume_stream_ticket(ticket: str) -> Optional[str]:
    """
    消费 ticket：有效则返回 presence_id（或旧格式 username）并删除；无效返回 None。
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


# ─── 在线身份（presence_id）───
# 统计键必须稳定且全局唯一：
# - 登录用户：u:{username}
# - 有 device_id 的游客：g:{guest_uid}（uid 仅由设备 ID 派生）
# - 无 device_id 的临时请求：e:{ip_ua_hash}（脚本/探针，不计入在线人数）
# 禁止直接用 username：游客 username=user_N 存在并发撞名，分享模式假 token
# 还会把 device-id 头吞掉，导致同一人被拆成多个身份或多人挤成一个。


def presence_id_from_fields(
    username: Optional[str] = None,
    role: Optional[str] = None,
    guest_uid: Optional[str] = None,
    guest_device_id: Optional[str] = None,
    client_ip: str = "",
    user_agent: str = "",
) -> str:
    """从会话/请求字段计算稳定的在线身份键。

    修复：临时游客会话也会带上随机 guest_uid（device_id 缺失时 uid 每请求一变）。
    若无 device_id 则一律 e: 前缀、不计入在线，避免脚本/无头请求把 tracker 抬高。
    """
    name = str(username or "").strip()
    uid = str(guest_uid or "").strip()
    device_id = _normalize_guest_device_id(guest_device_id)
    resolved_role = normalize_role(role, name)

    # 账号身份优先：注册用户/管理员即使会话里残留 device_id 也计入 u:name，
    # 避免「登录前后双身份」被 device-id 分支吞成 g:。
    if name and resolved_role not in (ROLE_GUEST,):
        return f"u:{name}"

    if device_id:
        return f"g:{uid or _build_guest_uid('', '', device_id)}"

    if resolved_role == ROLE_GUEST or uid:
        seed = uid or f"eph|{client_ip or ''}|{user_agent or ''}"
        return f"e:{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:16]}"

    return ""


def presence_id_from_session(session: Dict[str, Any]) -> str:
    """鉴权会话 → presence_id。"""
    return presence_id_from_fields(
        username=session.get("username"),
        role=session.get("role"),
        guest_uid=session.get("guest_uid"),
        guest_device_id=session.get("guest_device_id"),
        client_ip=str(session.get("ip") or ""),
        user_agent=str(session.get("user_agent") or ""),
    )


def presence_id_from_request(request: Request) -> str:
    """未登录请求（presence ping/offline）→ presence_id。"""
    from api.auth.constants import _extract_client_ip

    device_id = _normalize_guest_device_id(request.headers.get("X-Guest-Device-Id"))
    client_ip = _extract_client_ip(request)
    user_agent = str(request.headers.get("User-Agent") or "")
    return presence_id_from_fields(
        username="",
        role=ROLE_GUEST,
        guest_uid="",
        guest_device_id=device_id,
        client_ip=client_ip,
        user_agent=user_agent,
    )


def _is_countable_presence(presence_id: str) -> bool:
    """临时 e: 身份（无 device_id 的脚本/探针）不计入在线人数。"""
    return bool(presence_id) and not presence_id.startswith("e:")


# ==================== SSE 端点 ====================

router = APIRouter(prefix="/api", tags=["realtime-stats"])


@router.get("/statistics/ticket")
async def statistics_ticket(session: Dict[str, Any] = Depends(require_login)):
    """
    换取 SSE 实时统计流的一次性 ticket（60s 有效，仅 /statistics/stream 消费）。

    动机（V3.5.19）：避免完整会话 token 以 query param 形式进入 URL/日志；
    ticket 短时、一次性、仅能建立统计流连接，不作为任意 API 的凭据。

    V3.6.6：ticket 载荷改为 presence_id（登录 u:name / 游客 g:guest_uid），
    避免用 username 计数时的游客撞名与登录前后双身份。
    """
    username = str(session.get("username") or "")
    pid = presence_id_from_session(session)
    return {
        "ticket": create_stream_ticket(username, presence_id=pid),
        "presence_id": pid,
        "expires_in": STREAM_TICKET_TTL_SECONDS,
    }


@router.get("/statistics/stream")
async def statistics_stream(
    request: Request,
    ticket: str = Query("", description="一次性 SSE 流 ticket（由 /statistics/ticket 换取）"),
):
    """
    SSE 实时统计流（V3.5.19，V3.5.25 重构广播策略）。

    客户端连接后：
    1. 立即推送一次当前快照
    2. 事件驱动推送：连接/断开/心跳过期即刻触发（经合并窗口防风暴）；
       另有低频保底周期广播刷新全量快照
    3. 空闲时周期 keep-alive + 读路径 disconnect 探测，防代理超时并
       及时感知半开连接
    """
    username = consume_stream_ticket(ticket)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="流凭据无效、已过期或已被使用，请重新换取",
        )

    # ticket 载荷已是 presence_id（旧格式可能仍是 username）
    presence_id = username
    broadcaster = get_broadcaster()

    async def event_generator():
        queue = None
        try:
            # 在响应体真正开始迭代时才登记，确保登记与 finally 清理属于
            # 同一生成器生命周期；客户端过早断开不会留下幽灵连接。
            queue = await broadcaster.register(presence_id)
            _online_tracker.mark_connection(presence_id)

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
                    _online_tracker.touch_connection(presence_id)
                    yield payload
                except asyncio.TimeoutError:
                    # 读路径探活：uvicorn 在 socket EOF/RST 时会向 receive 通道
                    # 投递 disconnect；is_disconnected 为同步非阻塞轮询，
                    # 比等待写失败更早感知半开连接。
                    if request.is_disconnected():
                        logger.debug("SSE 客户端已断开（disconnect 探测）")
                        break
                    _online_tracker.touch_connection(presence_id)
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
    兜底活跃心跳端点（V3.5.25 起前端不再调用，向后兼容保留）。

    显式调用始终写入活跃记录（区别于普通鉴权搭车路径的连接感知判断），
    用于旧客户端或外部探针在 SSE 不可达时保活。窗口过期未再活跃 →
    由过期扫描协程剔除并广播。

    响应携带当前在线数。
    """
    pid = presence_id_from_session(session)
    if pid:
        _online_tracker.mark_heartbeat(pid)
    return {"ok": True, "online": _online_tracker.get_online_count()}


@router.post("/statistics/presence/ping")
async def statistics_presence_ping(request: Request):
    """
    轻量在线保活：游客凭 X-Guest-Device-Id 即可，登录用户走 session 鉴权。

    不查统计 DB、不消耗配额；仅刷新内存 tracker。用于 SSE 断开时的
    比鉴权搭车更稳的兜底，以及关页 beacon 之前的保活。
    """
    from api.auth.constants import _extract_token

    pid = ""
    token = _extract_token(request)
    if token:
        from api.auth.session import _get_session_sync

        try:
            session = await asyncio.to_thread(_get_session_sync, token)
        except Exception:
            session = None
        if session:
            pid = presence_id_from_session(session)
    if not pid:
        pid = presence_id_from_request(request)
    if pid:
        _online_tracker.mark_heartbeat(pid)
    return {"ok": True, "online": _online_tracker.get_online_count(), "presence_id": pid}


@router.post("/statistics/presence/offline")
async def statistics_presence_offline(request: Request):
    """
    关页/注销 beacon：立即撤销该身份的在线信号。

    EventSource 关闭在代理半开场景下后端可能感知不到；pagehide 时
    sendBeacon 到本端点，可把「幽灵在线」窗口压到接近 0。
    """
    from api.auth.constants import _extract_token

    pid = ""
    token = _extract_token(request)
    if token:
        from api.auth.session import _get_session_sync

        try:
            session = await asyncio.to_thread(_get_session_sync, token)
        except Exception:
            session = None
        if session:
            pid = presence_id_from_session(session)
    if not pid:
        pid = presence_id_from_request(request)
    if pid:
        _online_tracker.drop_presence(pid)
    return {"ok": True, "online": _online_tracker.get_online_count()}


@router.get("/statistics/admin/online-debug")
async def statistics_online_debug(
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """管理员排查：内存 tracker 在线身份明细（presence_id / SSE 计数 / 心跳年龄）。"""
    return {
        "status": "success",
        "data": _online_tracker.snapshot_debug(),
    }
