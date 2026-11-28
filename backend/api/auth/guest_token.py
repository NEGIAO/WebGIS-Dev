"""
游客身份签名 token：签发、验签、签发限频（V3.7.6 游客身份治理）。

设计要点（方案 Docs/TODO/guest-identity-governance-plan.md §3.2）：
- token = gt1_<b64url(uid|exp)>.<b64url(HMAC-SHA256)>，密钥 GUEST_TOKEN_SECRET（L3）；
- secret 未配置时签发通道整体关闭（端点 503），验签路径自然回落确定性派生桶；
- 签发限频按 (身份IP, UA哈希) 进程内滑动窗口，与 LOGIN_THROTTLE 同为单 worker 语义；
- 限频键刻意不含 device_id：轮换设备头无法绕开新身份铸造上限。
"""

import base64
import hashlib
import hmac
import logging
import threading
import time
from collections import deque
from typing import Any, Deque, Dict, Optional, Tuple

from config import get_int, get_str

logger = logging.getLogger(__name__)

# token 版本前缀：算法/语义变更时递增，旧版本验签直接失败落派生兜底
GUEST_TOKEN_PREFIX = "gt1_"
# 游客身份 Cookie 名（尽力而为通道：仅同源部署/本地开发可靠，生产跨站不可依赖）
GUEST_TOKEN_COOKIE_NAME = "webgis_guest"

# 单条 token 的密文段上限（uid≤64 + exp≤16 + 分隔符；超长必为伪造，直接拒绝）
_MAX_TOKEN_LENGTH = 256
_MAX_TOKEN_AGE_SECONDS = 90 * 24 * 3600  # 硬上限：即便配置错误也不签发超过 90 天


def _secret() -> str:
    """读取 HMAC 密钥（L3 GUEST_TOKEN_SECRET），空值 = 签发通道关闭。"""
    return str(get_str("GUEST_TOKEN_SECRET", "") or "").strip()


def guest_token_issuance_enabled() -> bool:
    """签发通道是否可用（GUEST_TOKEN_SECRET 已配置）。"""
    return bool(_secret())


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(data: str) -> Optional[bytes]:
    try:
        padding = "=" * (-len(data) % 4)
        return base64.urlsafe_b64decode(data + padding)
    except Exception:
        return None


def sign_guest_token(guest_uid: str, ttl_hours: Optional[int] = None) -> Optional[str]:
    """为游客 uid 签发签名 token。

    Args:
        guest_uid: 游客身份 uid（guest_<hex16>）
        ttl_hours: 覆盖有效期（测试用）；None 时读 GUEST_TOKEN_TTL_HOURS

    Returns:
        token 字符串；GUEST_TOKEN_SECRET 未配置时返回 None（调用方须走 503）。
    """
    secret = _secret()
    if not secret:
        return None

    ttl = int(ttl_hours) if ttl_hours is not None else get_int(
        "GUEST_TOKEN_TTL_HOURS", 4, minimum=1, maximum=4
    )
    # 会话/身份 token 统一硬上限 4 小时；这里再钳一次防止调用方显式传大值。
    ttl = max(1, min(int(ttl), 4))
    exp = int(time.time()) + ttl * 3600

    payload = f"{guest_uid}|{exp}".encode("utf-8")
    signature = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).digest()
    return f"{GUEST_TOKEN_PREFIX}{_b64url_encode(payload)}.{_b64url_encode(signature)}"


def _decode_guest_token(token: str, *, ignore_expiry: bool = False) -> Optional[str]:
    """验签并返回游客 uid；任何失败（格式/签名，默认含过期）返回 None。"""
    raw = str(token or "").strip()
    if not raw.startswith(GUEST_TOKEN_PREFIX) or len(raw) > _MAX_TOKEN_LENGTH:
        return None

    body = raw[len(GUEST_TOKEN_PREFIX):]
    payload_part, _, signature_part = body.partition(".")
    if not payload_part or not signature_part:
        return None

    payload_bytes = _b64url_decode(payload_part)
    signature_bytes = _b64url_decode(signature_part)
    if not payload_bytes or not signature_bytes:
        return None

    secret = _secret()
    if not secret:
        return None

    expected = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).digest()
    if not hmac.compare_digest(expected, signature_bytes):
        return None

    try:
        payload_text = payload_bytes.decode("utf-8")
        guest_uid, _, exp_text = payload_text.partition("|")
        exp = int(exp_text)
    except (ValueError, UnicodeDecodeError):
        return None

    if not guest_uid.startswith("guest_") or len(guest_uid) > 128:
        return None
    if not ignore_expiry and exp < int(time.time()):
        return None
    return guest_uid


def verify_guest_token(token: str) -> Optional[str]:
    """验签并返回未过期游客 uid；过期/伪造一律返回 None。"""
    return _decode_guest_token(token)


def peek_guest_token_uid(token: str) -> Optional[str]:
    """仅验签、忽略过期时间，取回原游客 uid。

    用途：token 过期续期时必须复用原身份，只重签 token，不能给同一浏览器
    分配新的 guest_uid（否则配额桶、历史统计和在线 presence 全部断裂）。
    """
    return _decode_guest_token(token, ignore_expiry=True)


def guest_token_expiry_seconds(token: str) -> Optional[int]:
    """读取 token 剩余秒数（供前端判断是否需要续期；无效返回 None）。"""
    raw = str(token or "").strip()
    if not raw.startswith(GUEST_TOKEN_PREFIX):
        return None
    payload_bytes = _b64url_decode(raw[len(GUEST_TOKEN_PREFIX):].partition(".")[0])
    if not payload_bytes:
        return None
    try:
        exp = int(payload_bytes.decode("utf-8").partition("|")[2])
    except (ValueError, UnicodeDecodeError):
        return None
    return exp - int(time.time())


# ─── 游客会话统一落在 sessions 表 ───
# 三类身份（admin / registered / guest）共用 sessions 作为唯一会话真值：
# 游客 HMAC token 签发时同时写一行 role='guest' 的 sessions 记录；
# 管理员删行即失效，验签路径按 token 查表，不再维护第二张撤销表/内存集合。


def _guest_session_expiry_iso(token: str) -> str:
    """把 token 内的 exp 转成与 sessions.expires_at 同格式的本地 ISO 字符串。"""
    from datetime import datetime

    from .db import _iso

    remaining = guest_token_expiry_seconds(token)
    if remaining is None:
        remaining = 0
    exp_ts = int(time.time()) + max(0, int(remaining))
    return _iso(datetime.fromtimestamp(exp_ts).astimezone())


def register_guest_session(
    token: str,
    guest_uid: str,
    ip: str = "",
    user_agent: str = "",
    guest_device_id: str = "",
    geo: Optional[Any] = None,
) -> None:
    """游客 token 签发后同步登记 sessions 行（管理员可在一张表里维护/删除）。

    V3.7.12：登记新 token 前先归档并删除同一 `guest_uid` 的旧 token，
    sessions 表只保留该游客当前唯一有效 token（历史回源见 expired_sessions）。
    """
    from .db import _iso, _utc_now, get_auth_db_connection
    from .session_archive import supersede_sessions_locked

    uid = str(guest_uid or "").strip()
    if not token or not uid:
        return
    now_iso = _iso(_utc_now())
    try:
        with get_auth_db_connection() as conn:
            supersede_sessions_locked(conn, keep_token=token, guest_uid=uid)
            conn.execute(
                """
                INSERT OR REPLACE INTO sessions (
                    token, username, role, guest_uid, guest_device_id, ip,
                    user_agent, requires_email_binding, created_at, expires_at, last_seen_at,
                    ip_city, ip_region, ip_country
                ) VALUES (?, ?, 'guest', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
                """,
                (
                    token,
                    uid,
                    uid,
                    str(guest_device_id or "")[:128],
                    str(ip or "")[:128],
                    str(user_agent or "")[:512],
                    now_iso,
                    _guest_session_expiry_iso(token),
                    now_iso,
                    str(getattr(geo, "city", "") or "") if geo is not None else "",
                    str(getattr(geo, "region", "") or "") if geo is not None else "",
                    str(getattr(geo, "country", "") or "") if geo is not None else "",
                ),
            )
            conn.commit()
    except Exception as exc:
        logger.warning("登记游客 session 失败: %s", exc)


def revoke_guest_uid(guest_uid: str, reason: str = "") -> None:
    """撤销游客身份：归档并删除该 uid 的全部 sessions 行（含续签产生的多条 token）。"""
    from .db import get_auth_db_connection
    from .session_archive import (
        ARCHIVE_REASON_REVOKED,
        _row_to_session_dict,
    )

    uid = str(guest_uid or "").strip()
    if not uid:
        return
    try:
        with get_auth_db_connection() as conn:
            rows = conn.execute(
                "SELECT token, username, role, guest_uid, guest_device_id, ip, user_agent, "
                "requires_email_binding, created_at, expires_at, last_seen_at "
                "FROM sessions WHERE role = 'guest' AND (guest_uid = ? OR username = ?)",
                (uid, uid),
            ).fetchall()
            archived_rows = [_row_to_session_dict(row) for row in rows]
            if archived_rows:
                from .session_archive import archive_session_rows_locked

                archive_session_rows_locked(conn, archived_rows, ARCHIVE_REASON_REVOKED)
                conn.executemany(
                    "DELETE FROM sessions WHERE token = ?",
                    [(str(row.get("token") or ""),) for row in archived_rows],
                )
            conn.commit()
    except Exception as exc:
        logger.warning("撤销游客 session 失败: %s", exc)


class GuestTokenDbUnavailable(RuntimeError):
    """游客 token 校验期间认证库不可用（与「token 无效」严格区分）。

    V3.7.16：认证层的游客分支据此返回 503，避免 DB 抖动被误判为
    SESSION_EXPIRED 而强制登出。原 verify_guest_token_active 保持
    fail-closed 语义不变（供非认证路径使用）。
    """


def verify_guest_token_active_strict(token: str) -> Optional[str]:
    """验签 + 有效期 + sessions 表存在性；DB 故障抛 GuestTokenDbUnavailable。

    与 verify_guest_token_active 的唯一区别：后者把 DB 异常 fail-closed 为
    None（= token 无效），本函数将其上抛，让调用方区分 401 与 503。
    """
    uid = verify_guest_token(token)
    if not uid:
        return None
    try:
        from .db import _iso, _utc_now, get_auth_db_connection

        with get_auth_db_connection() as conn:
            row = conn.execute(
                "SELECT 1 FROM sessions WHERE token = ? AND role = 'guest' "
                "AND expires_at > ? LIMIT 1",
                (token, _iso(_utc_now())),
            ).fetchone()
    except Exception as exc:
        logger.warning("校验游客 session 失败（DB 不可用）: %s", exc)
        raise GuestTokenDbUnavailable(str(exc)) from exc
    return uid if row else None


def verify_guest_token_active(token: str) -> Optional[str]:
    """验签 + 有效期 + sessions 表存在性；删行即失效，无第二套状态。

    DB 不可用时 fail-closed 返回 None（不把无 session 行的签名字串当有效身份）。
    认证路径请用 verify_guest_token_active_strict 以区分 DB 故障与 token 失效。
    """
    try:
        return verify_guest_token_active_strict(token)
    except GuestTokenDbUnavailable:
        return None


class GuestIssueLimiter:
    """进程内滑动窗口限频器（游客身份新签发专用）。

    与 LOGIN_THROTTLE 同为「进程内、单 worker 生效」语义（HF 部署 workers=1）；
    重启清零属可接受行为——重启同时会清攻击者的历史计数，但配额桶仍受
    确定性派生约束，不构成绕过面。
    """

    def __init__(self, window_seconds: int = 3600, max_keys: int = 100_000):
        self._window_seconds = int(window_seconds)
        self._max_keys = int(max_keys)
        self._events: Dict[str, Deque[int]] = {}
        self._lock = threading.Lock()
        self._last_prune = 0.0

    def _prune_expired_locked(self, now: float) -> None:
        """清理过期窗口与超容键（调用方须已持锁）。"""
        expired_keys = [
            key for key, times in self._events.items()
            if not times or times[-1] < now - self._window_seconds
        ]
        for key in expired_keys:
            self._events.pop(key, None)
        # 超容保护：按最后事件时间淘汰最旧一半，防恶意键撑爆内存
        if len(self._events) > self._max_keys:
            ordered = sorted(self._events.items(), key=lambda kv: kv[1][-1] if kv[1] else 0)
            for key, _ in ordered[: len(ordered) // 2]:
                self._events.pop(key, None)

    def allow(self, key: str, limit: int) -> bool:
        """窗口内第 limit+1 次返回 False（不含本次）；limit<=0 恒 False。"""
        now = time.time()
        with self._lock:
            if now - self._last_prune > 600:
                self._prune_expired_locked(now)
                self._last_prune = now

            times = self._events.setdefault(key, deque())
            cutoff = now - self._window_seconds
            while times and times[0] < cutoff:
                times.popleft()

            if len(times) >= max(0, int(limit)):
                return False
            times.append(now)
            return True

    def reset(self) -> None:
        """清空全部计数（测试用）。"""
        with self._lock:
            self._events.clear()


def issue_limit_key(identity_ip: str, user_agent: str) -> str:
    """构造限频键：哈希(身份IP | UA)。刻意不含 device_id。身份 IP 为
    `_extract_identity_ip` 的结果（XFF 最右侧公网跳）。"""
    digest = hashlib.sha256(f"{identity_ip}|{user_agent}".encode("utf-8")).hexdigest()
    return f"issue_{digest[:24]}"


# 模块级单例（依赖注入不便的 FastAPI 依赖树内直接消费）
GUEST_ISSUE_LIMITER = GuestIssueLimiter()
