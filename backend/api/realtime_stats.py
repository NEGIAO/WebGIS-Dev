"""
实时统计 SSE 推送模块

功能：以 SSE 连接为主信号、鉴权活跃为兜底的实时在线统计与推送（V3.5.25：
统计逻辑完全由后端承担，前端仅维持一条 SSE 长连接，零轮询零心跳）。

在线判定：
- SSE 连接存活时按身份引用计数，同身份多标签页只计一人；
- SSE 不可达时，普通鉴权 API 请求会搭车刷新该身份的兜底活跃时间戳，
  150s 窗口内判在线（容忍后台标签页定时器被浏览器节流到 60-120s）；
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
import re
import secrets
import time as _time
from collections import OrderedDict
from threading import Lock as _ThreadLock
from typing import Any, Dict, Iterable, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from api.auth.constants import (
    ROLE_ADMIN,
    ROLE_GUEST,
    ROLE_REGISTERED,
    _build_guest_uid,
    _normalize_guest_device_id,
    normalize_role,
)
from api.auth.dependencies import (
    require_admin,
    require_api_access_or_guest_noconsume,
    require_api_access_or_guest_readonly,
)

logger = logging.getLogger(__name__)

# ─── 兜底活跃窗口 ───
# SSE 不可达期间以"最近鉴权 API 活动"判定在线；150s 窗口容忍后台节流与短暂空闲。
HEARTBEAT_INTERVAL_SECONDS = 30  # 兼容旧前端心跳间隔参考值（当前前端已不发送）
# 后台标签页的 setInterval 会被 Chrome 节流到 ~60s，深度节流下可达 ~90-120s；
# 窗口必须留出至少 1 个节流周期的冗余，否则同一个真实在线标签会反复“掉线/复现”，
# 用户中心人数随即在 N-1 / N 之间震荡（线上 2026-11-25 12:07 实测）。
# 正常关页由 offline beacon 即时撤销；只有进程被强杀/断网才需要等该窗口兜底。
HEARTBEAT_WINDOW_SECONDS = 150

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

_CLIENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{6,64}$")


def normalize_client_id(raw: Optional[str]) -> str:
    """规范化前端标签页实例 ID（per-document，非持久化）。"""
    val = str(raw or "").strip()
    if not val or not _CLIENT_ID_PATTERN.match(val):
        return ""
    return val


def session_signature(token: Optional[str]) -> str:
    """计算会话令牌短指纹，用于在注销时精确定位并剔除对应连接。"""
    raw = str(token or "").strip()
    if not raw:
        return ""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def device_presence_id(guest_device_id: Optional[str]) -> str:
    """从浏览器设备 ID 推导关联游客 presence_id（同浏览器登录/游客去重用）。"""
    normalized = _normalize_guest_device_id(guest_device_id)
    if not normalized:
        return ""
    return f"g:{_build_guest_uid('', '', normalized)}"


def normalize_presence_role(role: Optional[str], presence_id: str) -> str:
    """把会话角色归一为统计口径的 admin / registered / guest 三类。

    会话缺少 role（旧调用方只传 presence_id）时按前缀推断：
    `u:admin` → admin，其他 `u:` → registered，`g:` → guest。
    """
    resolved = str(role or "").strip().lower()
    if resolved in (ROLE_ADMIN, ROLE_REGISTERED, ROLE_GUEST):
        return resolved
    if presence_id.startswith("u:"):
        return ROLE_ADMIN if presence_id == "u:admin" else ROLE_REGISTERED
    return ROLE_GUEST


class OnlineUserTracker:
    """
    内存中的实时在线用户追踪器（线程安全）。

    在线判定 = 两类信号的并集（按真实身份 presence_id 去重）：
    1) SSE 连接保活（mark_connection / drop_connection）：按独立 conn_id 记录每条
       连接（支持同一标签页 client_id 重连时原子接管旧连接、单标签关闭不误杀同用户
       其余标签页）。
    2) 活跃窗口（mark_authenticated_activity / mark_heartbeat）：SSE 不可达时的
       兜底信号源，同样按 client_id 细分以支持单标签精准下线。

    同浏览器去重：若已登录身份 u:xxx 活跃且携带同一浏览器的 device_presence_id
    （g:guest_...），则压制同一浏览器尚未登录的其他游客标签页，避免 1 人被计为 2 人。
    """

    def __init__(self, window: int = HEARTBEAT_WINDOW_SECONDS):
        self._active_window = window
        # 心跳时间戳（兜底信号）：presence_id → 最近心跳单调时刻
        self._users: OrderedDict[str, float] = OrderedDict()
        # 细粒度兜底心跳：presence_id → {client_key: {ts, session_sig, device_presence_id}}
        self._beat_clients: Dict[str, Dict[str, Dict[str, Any]]] = {}
        # 每条 SSE 连接明细：conn_id → {presence_id, client_id, session_sig, device_presence_id, last_seen}
        self._connections: Dict[str, Dict[str, Any]] = {}
        # 身份 → 活跃 conn_id 集合
        self._pid_conns: Dict[str, set[str]] = {}
        # 兼容视图：presence_id → 存活连接数 / 最近活动时刻
        self._conns: Dict[str, int] = {}
        self._conn_seen: Dict[str, float] = {}
        # 身份 → 角色（admin / registered / guest），仅供 online_by_role 分类展示
        self._roles: Dict[str, str] = {}
        self._lock = _ThreadLock()
        self._last_cleanup = _time.monotonic()

    def _sync_pid_conn_summary_locked(self, pid: str) -> None:
        conn_ids = self._pid_conns.get(pid)
        if not conn_ids:
            self._pid_conns.pop(pid, None)
            self._conns.pop(pid, None)
            self._conn_seen.pop(pid, None)
            return
        # 只统计仍存活于 _connections 的连接；若无存活项则视为该身份已无连接。
        # （直接对空序列取 max 会抛 ValueError，故先收集再判空）
        live_seen = [
            float(self._connections[cid]["last_seen"])
            for cid in conn_ids
            if cid in self._connections
        ]
        if not live_seen:
            self._pid_conns.pop(pid, None)
            self._conns.pop(pid, None)
            self._conn_seen.pop(pid, None)
            return
        self._conns[pid] = len(live_seen)
        self._conn_seen[pid] = max(live_seen)

    def _sync_pid_beat_summary_locked(self, pid: str) -> None:
        clients = self._beat_clients.get(pid)
        self._users.pop(pid, None)
        if not clients:
            self._beat_clients.pop(pid, None)
            return
        latest_ts = max(float(meta["ts"]) for meta in clients.values())
        self._users[pid] = latest_ts
        # OrderedDict 按最近更新排到末尾
        self._users = OrderedDict(sorted(self._users.items(), key=lambda kv: kv[1]))

    def _remove_conn_locked(self, conn_id: str) -> Optional[str]:
        rec = self._connections.pop(conn_id, None)
        if rec is None:
            return None
        pid = rec["presence_id"]
        cids = self._pid_conns.get(pid)
        if cids is not None:
            cids.discard(conn_id)
        self._sync_pid_conn_summary_locked(pid)
        return pid

    def _drop_client_id_locked(self, client_id: str) -> Tuple[List[str], bool]:
        if not client_id:
            return [], False
        removed_conns = [
            cid
            for cid, rec in self._connections.items()
            if rec.get("client_id") == client_id
        ]
        changed = False
        for cid in removed_conns:
            if self._remove_conn_locked(cid) is not None:
                changed = True
        for pid in list(self._beat_clients.keys()):
            clients = self._beat_clients[pid]
            if client_id in clients:
                clients.pop(client_id, None)
                self._sync_pid_beat_summary_locked(pid)
                changed = True
        return removed_conns, changed

    def _drop_session_beats_locked(
        self,
        session_sig: str,
        *,
        only_default: bool = False,
        only_if_no_active_conns: bool = False,
    ) -> None:
        """清理指定 session_sig 对应的兜底心跳；须持锁调用。"""
        if not session_sig:
            return
        if only_if_no_active_conns and any(
            rec.get("session_sig") == session_sig for rec in self._connections.values()
        ):
            return
        for pid in list(self._beat_clients.keys()):
            clients = self._beat_clients[pid]
            removed = False
            for ck, meta in list(clients.items()):
                if only_default and ck != "_default":
                    continue
                if meta.get("session_sig") == session_sig:
                    clients.pop(ck, None)
                    removed = True
            if removed:
                self._sync_pid_beat_summary_locked(pid)

    def mark_connection(
        self,
        user_id: str,
        conn_id: str = "",
        client_id: str = "",
        session_sig: str = "",
        device_presence_id: str = "",
        role: str = "",
    ) -> str:
        """SSE 连接建立时调用：登记 conn_id；同 client_id 重连时原子接管旧连接。"""
        if not user_id:
            return ""
        resolved_conn_id = conn_id or f"conn_{secrets.token_hex(8)}"
        resolved_client_id = normalize_client_id(client_id)
        resolved_device_pid = (
            device_presence_id
            if user_id.startswith("u:") and device_presence_id.startswith("g:")
            else ""
        )
        now = _time.monotonic()
        superseded_conns: List[str] = []
        changed = False

        with self._lock:
            before_online = self._online_names_locked(now)
            # 同一标签页重建 SSE：只接管旧连接；同身份心跳是 ticket 换取时写入的
            # 有效 liveness，不能删除，否则建连后到首次 ping 之间会短暂离线。
            # 身份切换（guest→user）时，旧身份同 client_id 的心跳必须清理。
            if resolved_client_id:
                superseded_conns = [
                    cid
                    for cid, rec in self._connections.items()
                    if rec.get("client_id") == resolved_client_id
                ]
                for cid in superseded_conns:
                    self._remove_conn_locked(cid)
                for pid in list(self._beat_clients.keys()):
                    if pid == user_id:
                        continue
                    clients = self._beat_clients[pid]
                    if resolved_client_id in clients:
                        clients.pop(resolved_client_id, None)
                        self._sync_pid_beat_summary_locked(pid)

            self._connections[resolved_conn_id] = {
                "presence_id": user_id,
                "client_id": resolved_client_id,
                "session_sig": session_sig,
                "device_presence_id": resolved_device_pid,
                "last_seen": now,
            }
            self._roles[user_id] = normalize_presence_role(role, user_id)
            self._pid_conns.setdefault(user_id, set()).add(resolved_conn_id)
            self._sync_pid_conn_summary_locked(user_id)
            after_online = self._online_names_locked(now)
            changed = before_online != after_online

        if superseded_conns:
            request_evict_conn_ids(superseded_conns)
        if changed:
            request_immediate_broadcast()
        return resolved_conn_id

    def drop_connection(self, user_id: str, conn_id: str = "") -> None:
        """SSE 连接断开时调用：按 conn_id 精确移除（无 conn_id 时移除最早一条）。"""
        if not user_id and not conn_id:
            return
        changed = False
        with self._lock:
            before_online = self._online_names_locked(_time.monotonic())
            target_cid = conn_id
            if not target_cid:
                cids = self._pid_conns.get(user_id)
                if cids:
                    target_cid = min(
                        cids,
                        key=lambda cid: self._connections.get(cid, {}).get("last_seen", 0.0),
                    )
            if target_cid and target_cid in self._connections:
                self._remove_conn_locked(target_cid)
            after_online = self._online_names_locked(_time.monotonic())
            changed = before_online != after_online
        if changed:
            request_immediate_broadcast()

    def drop_stream_connection(
        self,
        user_id: str,
        conn_id: str,
        client_id: str = "",
        session_sig: str = "",
    ) -> None:
        """SSE 生成器退出时的精准清理（V3.7.11 竞态修复）。

        只撤销本条 conn_id；只有当该 client_id 已无任何存活 SSE 连接时，才撤销
        对应的显式心跳。旧实现直接用 drop_presence(client_id=...) 会在“旧 SSE
        退出晚于新 SSE 建连”时把新连接和新心跳一并误杀，造成在线人数震荡/归零。
        """
        resolved_client_id = normalize_client_id(client_id)
        now = _time.monotonic()
        changed = False
        with self._lock:
            before_online = self._online_names_locked(now)
            rec = self._connections.get(conn_id)
            if rec is None:
                # 已被同 client_id 重连接管/TTL 剔除，不能反向撤销新连接心跳。
                return
            self._remove_conn_locked(conn_id)
            if resolved_client_id:
                has_live_client_conn = any(
                    live.get("client_id") == resolved_client_id
                    for live in self._connections.values()
                )
                if not has_live_client_conn:
                    for pid in list(self._beat_clients.keys()):
                        clients = self._beat_clients[pid]
                        if resolved_client_id in clients:
                            clients.pop(resolved_client_id, None)
                            self._sync_pid_beat_summary_locked(pid)
            elif session_sig:
                self._drop_session_beats_locked(session_sig)
            after_online = self._online_names_locked(now)
            changed = before_online != after_online
        if changed:
            request_immediate_broadcast()

    def touch_connection(self, user_id: str, conn_id: str = "") -> None:
        """刷新连接侧活跃时刻（仅由显式客户端心跳路径调用）。

        V3.7.11：SSE 写出成功与 keep-alive 不再调用本方法，避免代理下半开连接被无限保活。
        """
        if not user_id and not conn_id:
            return
        now = _time.monotonic()
        with self._lock:
            if conn_id:
                rec = self._connections.get(conn_id)
                if rec is not None:
                    rec["last_seen"] = now
                    self._sync_pid_conn_summary_locked(rec["presence_id"])
                return
            cids = self._pid_conns.get(user_id)
            if not cids:
                return
            for cid in cids:
                if cid in self._connections:
                    self._connections[cid]["last_seen"] = now
            self._sync_pid_conn_summary_locked(user_id)

    def prune_stale_connections_with_ids(self, ttl: int = SSE_CONNECTION_TTL_SECONDS) -> List[str]:
        """剔除超过 TTL 无活动的 SSE 连接，返回被剔除的 conn_id 列表。"""
        now = _time.monotonic()
        stale_conns: List[str] = []
        with self._lock:
            for cid, rec in list(self._connections.items()):
                pid = rec["presence_id"]
                effective_seen = rec["last_seen"]
                # 兼容测试直接回拨 _conn_seen[pid] 的写法
                ext_seen = self._conn_seen.get(pid)
                if ext_seen is not None and ext_seen < effective_seen:
                    effective_seen = ext_seen
                if now - effective_seen > ttl:
                    stale_conns.append(cid)
            for cid in stale_conns:
                self._remove_conn_locked(cid)
        return stale_conns

    def prune_stale_connections(self, ttl: int = SSE_CONNECTION_TTL_SECONDS) -> bool:
        """剔除超过 TTL 无活动的 SSE 连接；有剔除返回 True。"""
        return bool(self.prune_stale_connections_with_ids(ttl=ttl))

    def mark_authenticated_activity(
        self,
        user_id: str,
        client_id: str = "",
        session_sig: str = "",
        device_presence_id: str = "",
        role: str = "",
    ) -> None:
        """记录普通鉴权活跃；对应标签页/身份已有存活 SSE 连接时不创建兜底心跳。"""
        if not user_id:
            return
        now = _time.monotonic()
        resolved_client_id = normalize_client_id(client_id)
        # V3.7.11：在线 liveness 必须有明确标签页标识。无 client_id 的请求
        # 不再写 _default，避免脚本/诊断请求制造无法精确撤销的幽灵在线。
        if not resolved_client_id:
            return
        resolved_device_pid = (
            device_presence_id
            if user_id.startswith("u:") and device_presence_id.startswith("g:")
            else ""
        )
        changed = False
        with self._lock:
            # 已有健康 SSE 连接：只接受显式 client_id 的刷新，避免无标签页请求误保活
            cids = self._pid_conns.get(user_id)
            if cids:
                matched = False
                for cid in cids:
                    rec = self._connections.get(cid)
                    if rec is None:
                        continue
                    if rec.get("client_id") == resolved_client_id:
                        rec["last_seen"] = now
                        if resolved_device_pid and not rec.get("device_presence_id"):
                            rec["device_presence_id"] = resolved_device_pid
                        matched = True
                if matched:
                    self._roles[user_id] = normalize_presence_role(role, user_id)
                    self._sync_pid_conn_summary_locked(user_id)
                    return

            before_online = self._online_names_locked(now)
            if resolved_client_id:
                for pid in list(self._beat_clients.keys()):
                    if pid != user_id and resolved_client_id in self._beat_clients[pid]:
                        self._beat_clients[pid].pop(resolved_client_id, None)
                        self._sync_pid_beat_summary_locked(pid)

            beat_key = resolved_client_id
            self._beat_clients.setdefault(user_id, {})[beat_key] = {
                "ts": now,
                "session_sig": session_sig,
                "device_presence_id": resolved_device_pid,
            }
            self._roles[user_id] = normalize_presence_role(role, user_id)
            self._sync_pid_beat_summary_locked(user_id)
            if now - self._last_cleanup > 60:
                self._cleanup(now)
            after_online = self._online_names_locked(now)
            changed = before_online != after_online

        if changed:
            request_immediate_broadcast()

    def mark_heartbeat(
        self,
        user_id: str,
        client_id: str = "",
        session_sig: str = "",
        device_presence_id: str = "",
        role: str = "",
    ) -> None:
        """记录显式降级心跳；在线集合变更时触发即时广播。"""
        if not user_id:
            return
        now = _time.monotonic()
        resolved_client_id = normalize_client_id(client_id)
        # 同 mark_authenticated_activity：所有心跳必须带标签页标识，禁止 _default 兜底。
        if not resolved_client_id:
            return
        resolved_device_pid = (
            device_presence_id
            if user_id.startswith("u:") and device_presence_id.startswith("g:")
            else ""
        )
        changed = False
        with self._lock:
            before_online = self._online_names_locked(now)
            if resolved_client_id:
                for pid in list(self._beat_clients.keys()):
                    if pid != user_id and resolved_client_id in self._beat_clients[pid]:
                        self._beat_clients[pid].pop(resolved_client_id, None)
                        self._sync_pid_beat_summary_locked(pid)

            beat_key = resolved_client_id
            self._beat_clients.setdefault(user_id, {})[beat_key] = {
                "ts": now,
                "session_sig": session_sig,
                "device_presence_id": resolved_device_pid,
            }
            self._roles[user_id] = normalize_presence_role(role, user_id)
            self._sync_pid_beat_summary_locked(user_id)

            cids = self._pid_conns.get(user_id)
            if cids:
                for cid in cids:
                    rec = self._connections.get(cid)
                    if rec is None:
                        continue
                    if rec.get("client_id") == resolved_client_id:
                        rec["last_seen"] = now
                self._sync_pid_conn_summary_locked(user_id)

            if now - self._last_cleanup > 60:
                self._cleanup(now)
            after_online = self._online_names_locked(now)
            changed = before_online != after_online

        if changed:
            request_immediate_broadcast()

    def drop_presence(
        self,
        user_id: str,
        client_id: str = "",
        session_sig: str = "",
    ) -> List[str]:
        """
        离线/注销信号：
        - 传 client_id：仅撤销该标签页对应的连接与心跳（不误杀同用户其他标签页）；
        - 传 session_sig：撤销该登录令牌对应的全部连接与心跳；
        - 两者皆空：全量撤销 user_id 的连接与心跳。
        """
        resolved_client_id = normalize_client_id(client_id)
        if not user_id and not resolved_client_id and not session_sig:
            return []

        evicted_conns: List[str] = []
        changed = False
        now = _time.monotonic()
        with self._lock:
            before_online = self._online_names_locked(now)
            if resolved_client_id:
                evicted_conns, _ = self._drop_client_id_locked(resolved_client_id)
                # 带 client_id 的关页信号只撤销该标签页；同 session 其他标签必须保留。
                # 无 client_id 的整会话注销才无条件撤销该 session_sig 的全部心跳。
                if session_sig and not resolved_client_id:
                    self._drop_session_beats_locked(session_sig)
            elif session_sig:
                for cid, rec in list(self._connections.items()):
                    if rec.get("session_sig") == session_sig and (
                        not user_id or rec["presence_id"] == user_id
                    ):
                        if self._remove_conn_locked(cid) is not None:
                            evicted_conns.append(cid)
                for pid in list(self._beat_clients.keys()):
                    if user_id and pid != user_id:
                        continue
                    clients = self._beat_clients[pid]
                    for ck, meta in list(clients.items()):
                        if meta.get("session_sig") == session_sig:
                            clients.pop(ck, None)
                    self._sync_pid_beat_summary_locked(pid)
            elif user_id:
                for cid in list(self._pid_conns.get(user_id, set())):
                    if self._remove_conn_locked(cid) is not None:
                        evicted_conns.append(cid)
                self._beat_clients.pop(user_id, None)
                self._users.pop(user_id, None)
                self._roles.pop(user_id, None)

            after_online = self._online_names_locked(now)
            changed = before_online != after_online or bool(evicted_conns)

        if evicted_conns:
            request_evict_conn_ids(evicted_conns)
        if changed:
            request_immediate_broadcast()
        return evicted_conns

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
            online, suppressed = self._resolve_online_and_suppressed_locked(now)
        return {
            "online_count": len(online),
            "online_presence_ids": sorted(online),
            "suppressed_guest_ids": sorted(suppressed),
            "sse_connections": conns,
            "sse_conn_count_total": sum(conns.values()),
            "sse_conn_age_seconds": conn_age,
            # 身份去重排查：每条 SSE 连接实际携带的 device_presence_id
            "sse_device_presence_ids": {
                cid: rec.get("device_presence_id", "")
                for cid, rec in self._connections.items()
            },
            "sse_client_ids": {
                cid: rec.get("client_id", "")
                for cid, rec in self._connections.items()
            },
            "fallback_heartbeat_age_seconds": beats,
            "window_seconds": self._active_window,
            "conn_ttl_seconds": SSE_CONNECTION_TTL_SECONDS,
        }

    def _resolve_online_and_suppressed_locked(self, now: float) -> Tuple[set, set]:
        """计算有效在线身份集合与被同浏览器已登录账号去重压制的游客 ID。须持锁调用。"""
        self._cleanup(now)
        # V3.7.11：在线人数只认窗口内有显式客户端心跳/API 活跃的身份。
        # 裸 SSE 连接（尤其反复重连但无 presence ping 的幽灵）只用于广播下发，
        # 不再单独计入在线，避免“连接存在但客户端已不在”导致人数虚高。
        raw = {u for u, ts in self._users.items() if now - ts <= self._active_window}

        # 同一浏览器同时开登录页签（u:）与未登录访客页签（g:）时，两者共享同一 device_presence_id，
        # 现实中属同一人的不同标签页，只保留已登录账号口径避免 +1 虚高。
        suppressed_guests = set()
        logged_in_clients = set()
        for rec in self._connections.values():
            if not rec["presence_id"].startswith("u:"):
                continue
            if rec.get("device_presence_id"):
                suppressed_guests.add(rec["device_presence_id"])
            if rec.get("client_id"):
                logged_in_clients.add(rec["client_id"])
        for pid, clients in self._beat_clients.items():
            if not pid.startswith("u:"):
                continue
            for client_id, meta in clients.items():
                if now - float(meta["ts"]) > self._active_window:
                    continue
                if meta.get("device_presence_id"):
                    suppressed_guests.add(meta["device_presence_id"])
                if client_id and client_id != "_default":
                    logged_in_clients.add(client_id)

        # 同一标签页从游客切到登录时，设备 ID 可能缺失/变更导致 g: 与 u: 无法
        # 通过 device_presence_id 对齐。client_id 是单页签实例 ID，既然该页签
        # 已出现已登录身份，其遗留游客信号必然是同一人的旧状态，不应再计 1 人。
        if logged_in_clients:
            for pid in raw:
                if not pid.startswith("g:"):
                    continue
                guest_clients = {
                    rec.get("client_id")
                    for rec in self._connections.values()
                    if rec.get("presence_id") == pid and rec.get("client_id")
                }
                guest_clients.update(
                    cid for cid in self._beat_clients.get(pid, {}) if cid != "_default"
                )
                if guest_clients & logged_in_clients:
                    suppressed_guests.add(pid)

        countable = {
            pid for pid in raw if _is_countable_presence(pid) and pid not in suppressed_guests
        }
        return countable, suppressed_guests & raw

    def _online_names_locked(self, now: float) -> set:
        countable, _ = self._resolve_online_and_suppressed_locked(now)
        return countable

    def _online_names(self) -> set:
        """当前在线身份集合（仅窗口内有显式心跳/API 活跃，已排除 e: 与同浏览器重复游客）。须持锁调用。"""
        return self._online_names_locked(_time.monotonic())

    def get_online_count(self) -> int:
        """返回当前在线独立用户数。

        读路径先剔除超过 TTL 的 SSE 幽灵连接；在线身份本身只取窗口内
        有显式心跳/API 活跃的集合，裸 SSE 不再直接计入在线。
        这里只清 tracker 计数，广播队列的 evict 仍由后台扫描负责。
        """
        self.prune_stale_connections_with_ids()
        with self._lock:
            return len(self._online_names())

    def get_online_users(self) -> list:
        """返回当前在线用户名列表。"""
        with self._lock:
            return list(self._online_names())

    def snapshot_online(self) -> Tuple[int, list]:
        """一次加锁返回 (在线数, 在线名单)，避免 count/list 两次读取竞态。"""
        with self._lock:
            ids = sorted(self._online_names())
        return len(ids), ids

    def snapshot_online_with_roles(self) -> Tuple[int, list, Dict[str, int]]:
        """一次加锁返回 (在线数, 在线名单, 三类角色分布)。

        角色取自身份登记的真实 role（admin / registered / guest），不再用
        `u:admin` 字符串硬编码；缺登记时按 presence_id 前缀兜底推断。
        """
        with self._lock:
            now = _time.monotonic()
            countable, _ = self._resolve_online_and_suppressed_locked(now)
            ids = sorted(countable)
            by_role = {ROLE_ADMIN: 0, ROLE_REGISTERED: 0, ROLE_GUEST: 0}
            for pid in ids:
                by_role[normalize_presence_role(self._roles.get(pid), pid)] += 1
        return len(ids), ids, by_role

    def snapshot_details(self) -> List[Dict[str, Any]]:
        """一次加锁返回当前在线身份的明细（供管理员在线表镜像使用）。

        只返回通过 _resolve_online_and_suppressed_locked 计数的身份，
        被同浏览器去重压制、e: 临时身份与过期心跳都不会进入镜像表。
        """
        now = _time.monotonic()
        details: List[Dict[str, Any]] = []
        with self._lock:
            countable, _ = self._resolve_online_and_suppressed_locked(now)
            for pid in sorted(countable):
                beat_clients = self._beat_clients.get(pid, {})
                conn_ids = [
                    cid
                    for cid, rec in self._connections.items()
                    if rec.get("presence_id") == pid
                ]
                timestamps = [float(meta["ts"]) for meta in beat_clients.values()]
                timestamps.extend(
                    float(self._connections[cid]["last_seen"]) for cid in conn_ids
                )
                last_seen = max(timestamps) if timestamps else now
                details.append(
                    {
                        "presence_id": pid,
                        "client_ids": sorted(
                            cid for cid in beat_clients if cid and cid != "_default"
                        ),
                        "session_count": len(beat_clients),
                        "sse_connections": len(conn_ids),
                        "device_presence_ids": sorted(
                            {
                                rec.get("device_presence_id", "")
                                for cid in conn_ids
                                for rec in [self._connections[cid]]
                                if rec.get("device_presence_id")
                            }
                            | {
                                str(meta.get("device_presence_id") or "")
                                for meta in beat_clients.values()
                                if meta.get("device_presence_id")
                            }
                        ),
                        "last_seen_age_seconds": max(0.0, now - last_seen),
                    }
                )
        return details

    def prune_expired(self) -> bool:
        """剔除已过期的兜底心跳；有剔除动作返回 True（供过期扫描协程判断是否广播）。"""
        now = _time.monotonic()
        cutoff = now - self._active_window
        removed_any = False
        with self._lock:
            for pid in list(self._beat_clients.keys()):
                clients = self._beat_clients[pid]
                expired_keys = [ck for ck, meta in clients.items() if float(meta["ts"]) < cutoff]
                if expired_keys:
                    for ck in expired_keys:
                        clients.pop(ck, None)
                    self._sync_pid_beat_summary_locked(pid)
                    removed_any = True
            while self._users and next(iter(self._users.values())) < cutoff:
                pid, _ = self._users.popitem(last=False)
                self._beat_clients.pop(pid, None)
                removed_any = True
            self._last_cleanup = now
        return removed_any

    def _cleanup(self, now: float) -> None:
        """清理超过心跳窗口的过期条目（仅清理心跳侧；连接侧即时或由 TTL 扫描移除）。"""
        cutoff = now - self._active_window
        for pid in list(self._beat_clients.keys()):
            clients = self._beat_clients[pid]
            expired_keys = [ck for ck, meta in clients.items() if float(meta["ts"]) < cutoff]
            if expired_keys:
                for ck in expired_keys:
                    clients.pop(ck, None)
                self._sync_pid_beat_summary_locked(pid)
        if self._users:
            while self._users and next(iter(self._users.values())) < cutoff:
                pid, _ = self._users.popitem(last=False)
                self._beat_clients.pop(pid, None)
        # 角色缓存跟随身份生命周期，避免无限增长
        for pid in list(self._roles.keys()):
            if pid not in self._users and pid not in self._conns:
                self._roles.pop(pid, None)
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


def mark_presence_active(
    session: Dict[str, Any],
    *,
    client_id: str = "",
    session_sig: str = "",
    device_presence_id_val: str = "",
    guest_device_id: Optional[str] = None,
) -> None:
    """按会话字段计算 presence_id 并记录鉴权活跃（携带真实 role 供分类统计）。"""
    pid = presence_id_from_session(session, guest_device_id=guest_device_id)
    if pid:
        _online_tracker.mark_authenticated_activity(
            pid,
            client_id=client_id or str(session.get("client_id") or ""),
            session_sig=session_sig or str(session.get("session_sig") or ""),
            device_presence_id=device_presence_id_val or str(session.get("device_presence_id") or ""),
            role=str(session.get("role") or ""),
        )


class StatsBroadcaster:
    """
    统计广播管理器（单例模式，挂载到 app.state.stats_broadcaster）

    每个客户端连接注册一个 asyncio.Queue；broadcast 时向所有 Queue 写入事件。
    Queue 满时丢弃最旧事件（非阻塞），保证心跳侧永远不被 IO 阻塞。
    """

    def __init__(self, queue_size: int = 4):
        self._queues: set[asyncio.Queue] = set()
        self._queue_owner: Dict[asyncio.Queue, str] = {}
        self._queue_conn_id: Dict[asyncio.Queue, str] = {}
        self._conn_queues: Dict[str, asyncio.Queue] = {}
        self._queue_size = queue_size
        self._lock = asyncio.Lock()

    async def register(self, username: str, conn_id: str = "") -> asyncio.Queue:
        """注册新客户端，返回其专属 Queue 并记录归属身份与 conn_id。"""
        queue: asyncio.Queue = asyncio.Queue(maxsize=self._queue_size)
        async with self._lock:
            self._queues.add(queue)
            self._queue_owner[queue] = username
            if conn_id:
                self._queue_conn_id[queue] = conn_id
                self._conn_queues[conn_id] = queue
        logger.debug("SSE 客户端注册（当前 %d 个）", len(self._queues))
        return queue

    async def unregister(self, queue: asyncio.Queue) -> Tuple[Optional[str], str]:
        """注销客户端并返回 (身份, conn_id)；已移除的 Queue 返回 (None, "")。"""
        async with self._lock:
            self._queues.discard(queue)
            owner = self._queue_owner.pop(queue, None)
            conn_id = self._queue_conn_id.pop(queue, "")
            if conn_id and self._conn_queues.get(conn_id) is queue:
                self._conn_queues.pop(conn_id, None)
        logger.debug("SSE 客户端注销（剩余 %d 个）", len(self._queues))
        return owner, conn_id

    async def evict_conn_ids(self, conn_ids: Iterable[str]) -> int:
        """同步注销并唤醒被踢除/过期的连接队列（投放 None 哨兵促发立即退出）。"""
        targets = [str(cid) for cid in conn_ids if cid]
        if not targets:
            return 0
        evicted_queues: List[asyncio.Queue] = []
        async with self._lock:
            for cid in targets:
                q = self._conn_queues.pop(cid, None)
                if q is None:
                    continue
                self._queues.discard(q)
                self._queue_owner.pop(q, None)
                self._queue_conn_id.pop(q, None)
                evicted_queues.append(q)
        for q in evicted_queues:
            try:
                if q.full():
                    try:
                        q.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                q.put_nowait(None)
            except Exception:
                pass
        return len(evicted_queues)

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
        dead_items: List[Tuple[str, str]] = []
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
                conn_id = self._queue_conn_id.pop(q, "")
                if conn_id and self._conn_queues.get(conn_id) is q:
                    self._conn_queues.pop(conn_id, None)
                if owner or conn_id:
                    dead_items.append((owner or "", conn_id))
        for owner, conn_id in dead_items:
            _online_tracker.drop_connection(owner, conn_id=conn_id)


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


def request_evict_conn_ids(conn_ids: Iterable[str]) -> None:
    """线程安全地请求 broadcaster 唤醒并注销已剔除的 conn_id 队列。"""
    targets = [str(cid) for cid in conn_ids if cid]
    if not targets:
        return
    try:
        loop = _event_loop
        if loop is None or loop.is_closed():
            return
        asyncio.run_coroutine_threadsafe(get_broadcaster().evict_conn_ids(targets), loop)
    except Exception:
        pass


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
    周期扫描兜底心跳过期项 + SSE 幽灵连接：有剔除即刻广播并回收广播队列。

    语义：断网/关页用户停止心跳后，最迟 window + SCAN 秒内从在线数消失，
    而不是等下一次任意请求或保底周期才被发现（消除下线显示滞后）。
    另剔除超过 SSE_CONNECTION_TTL_SECONDS 无写活动的半开连接，并从 broadcaster
    注销对应队列，防止 client_count 虚高。
    """
    while True:
        try:
            await asyncio.sleep(HEARTBEAT_EXPIRY_SCAN_SECONDS)
            expired = _online_tracker.prune_expired()
            stale_conn_ids = _online_tracker.prune_stale_connections_with_ids()
            if stale_conn_ids:
                await get_broadcaster().evict_conn_ids(stale_conn_ids)
            if (expired or stale_conn_ids) and get_broadcaster().client_count > 0:
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
_stream_tickets: Dict[str, Tuple[str, float, str, str, str]] = {}
_tickets_lock = _ThreadLock()


def create_stream_ticket(
    username: str,
    presence_id: str = "",
    *,
    client_id: str = "",
    session_sig: str = "",
    device_presence_id_val: str = "",
) -> str:
    """生成一次性 SSE ticket（STREAM_TICKET_TTL_SECONDS 秒有效）。"""
    ticket = secrets.token_urlsafe(24)
    expires_at = _time.monotonic() + STREAM_TICKET_TTL_SECONDS
    key = (presence_id or username or "").strip() or username
    meta = (
        key,
        expires_at,
        normalize_client_id(client_id),
        str(session_sig or "").strip(),
        str(device_presence_id_val or "").strip(),
    )
    with _tickets_lock:
        _stream_tickets[ticket] = meta
        _prune_tickets_locked()
    return ticket


def consume_stream_ticket_with_meta(
    ticket: str,
) -> Optional[Tuple[str, Dict[str, str]]]:
    """消费 ticket：有效则返回 (presence_id, {client_id, session_sig, device_presence_id})。"""
    if not ticket:
        return None
    with _tickets_lock:
        entry = _stream_tickets.pop(ticket, None)
        if entry is None:
            return None
        key = entry[0]
        expires_at = entry[1]
        if _time.monotonic() > expires_at:
            return None
        meta = {
            "client_id": entry[2] if len(entry) > 2 else "",
            "session_sig": entry[3] if len(entry) > 3 else "",
            "device_presence_id": entry[4] if len(entry) > 4 else "",
        }
        return key, meta


def consume_stream_ticket(ticket: str) -> Optional[str]:
    """兼容旧签名：消费 ticket 并返回 presence_id；无效返回 None。"""
    consumed = consume_stream_ticket_with_meta(ticket)
    return consumed[0] if consumed is not None else None


def _prune_tickets_locked() -> None:
    """清理过期 ticket（须持有 _tickets_lock 调用）。"""
    now = _time.monotonic()
    expired = [t for t, entry in _stream_tickets.items() if now > entry[1]]
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
        # 游客存在稳定设备 ID 时一律归并到设备派生主键（与 device_presence_id 完全一致），
        # 避免历史/缺省会话的随机 guest_uid 与请求头 X-Guest-Device-Id 裂成两个 g: 并逃脱 u: 压制。
        return f"g:{_build_guest_uid('', '', device_id)}"

    if resolved_role == ROLE_GUEST or uid:
        seed = uid or f"eph|{client_ip or ''}|{user_agent or ''}"
        return f"e:{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:16]}"

    return ""


def presence_id_from_session(
    session: Dict[str, Any],
    *,
    guest_device_id: Optional[str] = None,
) -> str:
    """鉴权会话 → presence_id；游客会话允许透传请求侧设备 ID 统一身份键。"""
    resolved_device_id = session.get("guest_device_id") or guest_device_id
    return presence_id_from_fields(
        username=session.get("username"),
        role=session.get("role"),
        guest_uid=session.get("guest_uid"),
        guest_device_id=resolved_device_id,
        client_ip=str(session.get("ip") or ""),
        user_agent=str(session.get("user_agent") or ""),
    )


def presence_id_from_request(
    request: Request,
    *,
    guest_device_id: Optional[str] = None,
) -> str:
    """未登录请求（presence ping/offline）→ presence_id（支持头/查询参数/beacon body）。"""
    from api.auth.constants import _extract_client_ip

    device_id = _normalize_guest_device_id(
        guest_device_id
        or request.headers.get("X-Guest-Device-Id")
        or request.query_params.get("guest_device_id")
    )
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


async def _parse_presence_beacon(request: Request) -> Dict[str, str]:
    """解析 /presence/{ping,offline} 附带的 client_id 与 guest_device_id（兼容 sendBeacon JSON body）。"""
    client_id = normalize_client_id(
        request.headers.get("X-Presence-Client-Id")
        or request.query_params.get("client_id")
    )
    guest_device_id = _normalize_guest_device_id(
        request.headers.get("X-Guest-Device-Id")
        or request.query_params.get("guest_device_id")
    )
    if not client_id or not guest_device_id:
        try:
            raw = await request.body()
            if raw and len(raw) <= 4096:
                parsed = json.loads(raw.decode("utf-8", errors="ignore"))
                if isinstance(parsed, dict):
                    if not client_id:
                        client_id = normalize_client_id(parsed.get("client_id"))
                    if not guest_device_id:
                        guest_device_id = _normalize_guest_device_id(parsed.get("guest_device_id"))
        except Exception:
            pass
    return {
        "client_id": client_id,
        "guest_device_id": guest_device_id,
    }


async def _resolve_presence_context(
    request: Request, *, require_identity: bool = False
) -> Tuple[str, str, str, str, str]:
    """
    从请求解析 (presence_id, client_id, session_sig, device_presence_id, role)。

    身份来源优先级：登录会话（Authorization）→ 已验签游客 token（X-Guest-Token /
    Cookie）→ 裸设备头派生（require_identity 时降级为不可数 e:）。
    注意：内部以 touch_presence=False 查会话，避免 offline beacon 反写 DB 活跃时刻。
    """
    from api.auth.constants import _extract_token
    from api.auth.session import _get_session_sync

    beacon = await _parse_presence_beacon(request)
    client_id = beacon["client_id"]
    guest_device_id = beacon["guest_device_id"]
    device_pid = device_presence_id(guest_device_id)

    token = _extract_token(request)
    sig = session_signature(token)
    pid = ""
    role = ""
    if token:
        try:
            session = await asyncio.to_thread(_get_session_sync, token, False, False)
        except Exception:
            session = None
        if session:
            pid = presence_id_from_session(session, guest_device_id=guest_device_id)
            role = str(session.get("role") or "")

    if not pid:
        # 游客身份与登录同口径：验签通过且 sessions 行仍在，才视为真实在线用户。
        # 只有这类已签发身份允许计入 online 统计，裸设备头仍降级为 e:。
        guest_token = ""
        try:
            from api.auth.dependencies import _extract_guest_token

            guest_token = _extract_guest_token(request)
        except Exception:
            guest_token = ""
        if guest_token:
            try:
                from api.auth.guest_token import verify_guest_token_active

                guest_uid = await asyncio.to_thread(verify_guest_token_active, guest_token)
            except Exception:
                guest_uid = None
            if guest_uid:
                pid = presence_id_from_session(
                    {
                        "username": guest_uid,
                        "role": ROLE_GUEST,
                        "guest_uid": guest_uid,
                        "guest_device_id": guest_device_id,
                    },
                    guest_device_id=guest_device_id,
                )
                sig = session_signature(guest_token)
                role = ROLE_GUEST

    if not pid:
        pid = presence_id_from_request(request, guest_device_id=guest_device_id)
        # presence/ping 必须来自已签发的会话；裸 device_id 只允许用于 offline 撤销。
        # 匿名注入的 g: 改判为不可数 e:，避免任意脚本伪造游客在线。
        if require_identity and pid.startswith("g:"):
            pid = f"e:{pid[2:]}"
    return pid, client_id, sig, device_pid, role


# ==================== SSE 端点 ====================

router = APIRouter(prefix="/api", tags=["realtime-stats"])


@router.get("/statistics/ticket")
async def statistics_ticket(
    request: Request,
    session: Dict[str, Any] = Depends(require_api_access_or_guest_readonly),
):
    """
    换取 SSE 实时统计流的一次性 ticket（60s 有效，仅 /statistics/stream 消费）。

    V3.6.6+：ticket 同时绑定 presence_id、标签页 client_id、session_sig 与同浏览器
    device_presence_id，保证重连接管、单标签关页、注销剔除与同浏览器去重精确无误。
    """
    from api.auth.constants import _extract_token

    username = str(session.get("username") or "")
    raw_guest_device_id = (
        request.headers.get("X-Guest-Device-Id")
        or request.query_params.get("guest_device_id")
        or session.get("guest_device_id")
    )
    pid = presence_id_from_session(session, guest_device_id=raw_guest_device_id)
    client_id = normalize_client_id(
        request.query_params.get("client_id")
        or request.headers.get("X-Presence-Client-Id")
    )
    sig = session_signature(_extract_token(request))
    device_pid = device_presence_id(raw_guest_device_id)
    return {
        "ticket": create_stream_ticket(
            username,
            presence_id=pid,
            client_id=client_id,
            session_sig=sig,
            device_presence_id_val=device_pid,
        ),
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
    3. 空闲时周期 keep-alive + 读路径 await is_disconnected 探测，防代理超时并
       及时感知半开连接
    """
    consumed = consume_stream_ticket_with_meta(ticket)
    if not consumed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="流凭据无效、已过期或已被使用，请重新换取",
        )

    presence_id, meta = consumed
    conn_id = f"conn_{secrets.token_hex(8)}"
    broadcaster = get_broadcaster()

    async def event_generator():
        queue = None
        try:
            # 在响应体真正开始迭代时才登记，确保登记与 finally 清理属于
            # 同一生成器生命周期；客户端过早断开不会留下幽灵连接。
            queue = await broadcaster.register(presence_id, conn_id=conn_id)
            _online_tracker.mark_connection(
                presence_id,
                conn_id=conn_id,
                client_id=meta.get("client_id", ""),
                session_sig=meta.get("session_sig", ""),
                device_presence_id=meta.get("device_presence_id", ""),
            )

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
                    if payload is None:
                        # 已被重连接管/注销/TTL 主动剔除
                        break
                    if await request.is_disconnected():
                        logger.debug("SSE 客户端已断开（事件推送前探测）")
                        break
                    # V3.7.11：写出成功不等于客户端仍在线。HF 代理下
                    # is_disconnected() 可能滞后，若在此刷新 last_seen，半开连接
                    # 会被广播事件无限保活，TTL 永远无法清理。客户端改由
                    # presence/ping 每 25s 显式续期（mark_heartbeat 会刷新连接）。
                    yield payload
                except asyncio.TimeoutError:
                    # 读路径探活：is_disconnected 为协程，必须 await
                    if await request.is_disconnected():
                        logger.debug("SSE 客户端已断开（disconnect 探测）")
                        break
                    # keep-alive 同样是服务端写出，不作为存活证据。
                    yield ": keep-alive\n\n"
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning("SSE 连接异常断开: %s", e)
        finally:
            if queue is not None:
                owner, registered_conn_id = await broadcaster.unregister(queue)
                # V3.7.11：只清理本条 SSE；同 client_id 的新连接/心跳不得被旧生成器
                # 的迟到 finally 撤销。真正关页由 offline beacon 或心跳窗口兜底。
                _online_tracker.drop_stream_connection(
                    owner or presence_id,
                    registered_conn_id or conn_id,
                    client_id=meta.get("client_id", ""),
                    session_sig=meta.get("session_sig", ""),
                )

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
async def statistics_heartbeat(
    request: Request,
    session: Dict[str, Any] = Depends(require_api_access_or_guest_noconsume),
):
    """
    兜底活跃心跳端点（V3.5.25 起前端不再调用，向后兼容保留）。

    仅当请求携带显式标签页 `client_id` 时才写入活跃记录；缺少 client_id 的
    调用一律忽略（与 mark_heartbeat 的 liveness 契约一致，避免无标签请求
    制造无法精确撤销的幽灵在线）。窗口过期未再活跃 → 由过期扫描协程剔除并广播。
    """
    from api.auth.constants import _extract_token

    raw_guest_device_id = (
        request.headers.get("X-Guest-Device-Id")
        or session.get("guest_device_id")
    )
    pid = presence_id_from_session(session, guest_device_id=raw_guest_device_id)
    if pid:
        _online_tracker.mark_heartbeat(
            pid,
            client_id=normalize_client_id(
                request.headers.get("X-Presence-Client-Id")
                or request.query_params.get("client_id")
            ),
            session_sig=session_signature(_extract_token(request)),
            device_presence_id=device_presence_id(raw_guest_device_id),
            role=str(session.get("role") or ""),
        )
    return {"ok": True, "online": _online_tracker.get_online_count()}


@router.post("/statistics/presence/ping")
async def statistics_presence_ping(request: Request):
    """
    轻量在线保活：登录用户走 session 鉴权，游客走已验签的 X-Guest-Token。

    三类身份同口径——只要身份已签发且在 sessions 表有效即计入在线，
    与「是否为游客」无关。不写统计/会话 DB、不消耗配额，仅刷新内存 tracker。
    """
    pid, client_id, sig, device_pid, role = await _resolve_presence_context(
        request, require_identity=True
    )
    if pid:
        _online_tracker.mark_heartbeat(
            pid,
            client_id=client_id,
            session_sig=sig,
            device_presence_id=device_pid,
            role=role,
        )
    return {"ok": True, "online": _online_tracker.get_online_count(), "presence_id": pid}


@router.post("/statistics/presence/offline")
async def statistics_presence_offline(request: Request):
    """
    关页/注销 beacon：立即撤销该标签页（或指定身份）的在线信号并回收 SSE 队列。

    同时支持 sendBeacon JSON body 与 fetch Authorization + keepalive，确保游客关页与
    登录用户注销/关页均能准确撤销对应在线信号且不误杀同用户其他标签页。
    """
    pid, client_id, sig, _device_pid, _role = await _resolve_presence_context(request)
    evicted = _online_tracker.drop_presence(pid, client_id=client_id, session_sig=sig)
    if evicted:
        await get_broadcaster().evict_conn_ids(evicted)
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
