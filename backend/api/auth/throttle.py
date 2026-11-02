"""
登录失败节流（进程内滑动窗口，单 worker 部署适用）。

参数全部走 L1 环境变量（登记于 `backend/config/catalog.py` 与 `deploy/.env.example`），
启动时读取一次，修改后需重启服务：
- LOGIN_THROTTLE_ACCOUNT_MAX_FAILURES  账号维度失败阈值（默认 5）
- LOGIN_THROTTLE_IP_MAX_FAILURES       IP 维度失败阈值（默认 30）
- LOGIN_THROTTLE_WINDOW_SECONDS        统计窗口（默认 60 秒）
- LOGIN_THROTTLE_LOCK_SECONDS          触发后的锁定时长（默认 60 秒）

设计取舍：
- 不落库：登录失败状态是短周期、可重建的；建表属数据库结构变更（L3）。
  当前镜像以单进程 uvicorn 运行（`deploy/Dockerfile` 的 start.sh 无 --workers），
  进程内计数即为全局计数；若将来改为多 worker，需换成共享存储。
- 账号维度优先：请求头里的 IP（X-Client-IP / X-Forwarded-For）可由客户端任意
  伪造，只按 IP 限流等于没有限流。账号名是攻击者必须命中的目标，无法靠改头绕过。
- IP 维度仅作次级约束：压制单源批量撞库，阈值显著高于账号维度。

对外接口：
- check_login_allowed(account, ip) -> (allowed, retry_after_seconds, reason)
- record_login_failure(account, ip) -> None
- clear_login_failures(account) -> None
"""

import threading
import time
from typing import Dict, List, Tuple

from config import get_int

# ─── 可配置阈值（L1 环境变量）───
ACCOUNT_MAX_FAILURES = get_int("LOGIN_THROTTLE_ACCOUNT_MAX_FAILURES", 5, minimum=1, maximum=1000)
IP_MAX_FAILURES = get_int("LOGIN_THROTTLE_IP_MAX_FAILURES", 30, minimum=1, maximum=10000)
WINDOW_SECONDS = get_int("LOGIN_THROTTLE_WINDOW_SECONDS", 60, minimum=5, maximum=86400)
LOCK_SECONDS = get_int("LOGIN_THROTTLE_LOCK_SECONDS", 60, minimum=5, maximum=86400)

# 桶数量上限，超过后清理陈旧条目，避免长期运行内存缓慢增长
_MAX_TRACKED_BUCKETS = 20000

_lock = threading.Lock()
_buckets: Dict[str, Dict[str, object]] = {}


def _now() -> float:
    """单调时钟，避免系统时间回拨导致窗口判断错乱。"""
    return time.monotonic()


def _account_key(account: str) -> str:
    return f"acct:{account}"


def _ip_key(ip: str) -> str:
    return f"ip:{ip}"


def _prune_failures(bucket: Dict[str, object], window_seconds: int) -> List[float]:
    """丢弃窗口外的失败时间戳，返回窗口内的列表。"""
    cutoff = _now() - window_seconds
    raw = bucket.get("fails") or []
    fails = [float(t) for t in raw if float(t) >= cutoff]
    bucket["fails"] = fails
    return fails


def _check_bucket(key: str, max_failures: int) -> Tuple[bool, int, str]:
    """检查单个维度是否放行；达到阈值时就地升级为锁定。"""
    bucket = _buckets.get(key)
    if not bucket:
        return True, 0, ""

    now = _now()
    locked_until = float(bucket.get("locked_until") or 0.0)
    if locked_until > now:
        return False, int(locked_until - now) + 1, "locked"

    fails = _prune_failures(bucket, WINDOW_SECONDS)
    if len(fails) >= max_failures:
        bucket["locked_until"] = now + LOCK_SECONDS
        return False, LOCK_SECONDS, "window_exceeded"

    return True, 0, ""


def _record_bucket(key: str, max_failures: int) -> None:
    """记一次失败；达到阈值立即上锁。"""
    bucket = _buckets.setdefault(key, {"fails": [], "locked_until": 0.0})
    fails = _prune_failures(bucket, WINDOW_SECONDS)
    fails.append(_now())
    bucket["fails"] = fails
    if len(fails) >= max_failures:
        bucket["locked_until"] = _now() + LOCK_SECONDS


def _sweep_if_needed() -> None:
    """桶数量超限时清理无失败记录且未锁定的条目（调用方需持锁）。"""
    if len(_buckets) <= _MAX_TRACKED_BUCKETS:
        return
    now = _now()
    stale = [
        key
        for key, bucket in _buckets.items()
        if not bucket.get("fails") and float(bucket.get("locked_until") or 0.0) <= now
    ]
    for key in stale:
        _buckets.pop(key, None)


def check_login_allowed(account: str, ip: str) -> Tuple[bool, int, str]:
    """判断本次登录尝试是否放行。

    参数：
    - account: 规范化后的账号（小写）；空串表示无法确定目标账号，仅按 IP 判。
    - ip: 客户端 IP；空串表示不参与判定。

    返回：
    - (allowed, retry_after_seconds, reason)；被拒时 reason 为 locked / window_exceeded。
    """
    normalized_account = str(account or "").strip().lower()
    client_ip = str(ip or "").strip()

    with _lock:
        _sweep_if_needed()

        if normalized_account:
            allowed, retry_after, reason = _check_bucket(
                _account_key(normalized_account), ACCOUNT_MAX_FAILURES
            )
            if not allowed:
                return False, retry_after, reason

        if client_ip:
            allowed, retry_after, reason = _check_bucket(_ip_key(client_ip), IP_MAX_FAILURES)
            if not allowed:
                return False, retry_after, reason

    return True, 0, ""


def record_login_failure(account: str, ip: str) -> None:
    """记录一次登录失败（账号维度 + IP 维度）。"""
    normalized_account = str(account or "").strip().lower()
    client_ip = str(ip or "").strip()

    with _lock:
        if normalized_account:
            _record_bucket(_account_key(normalized_account), ACCOUNT_MAX_FAILURES)
        if client_ip:
            _record_bucket(_ip_key(client_ip), IP_MAX_FAILURES)


def clear_login_failures(account: str) -> None:
    """登录成功后清空该账号的失败计数（不清 IP 维度，避免顺带放过同源其他人的失败）。"""
    normalized_account = str(account or "").strip().lower()
    if not normalized_account:
        return
    with _lock:
        _buckets.pop(_account_key(normalized_account), None)
