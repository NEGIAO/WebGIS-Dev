"""
会话历史归档与过期清理（V3.7.12）。

设计要点：
- 有效会话只保存在 `sessions` 表；`expired_sessions` 只存历史副本，任何鉴权路径都
  不读取它，删不改鉴权语义。
- 三类身份（admin / registered / guest）同口径：
  1) 签发新 token 时，同一身份（游客按 guest_uid，账号按同设备指纹）的旧 token
     先归档再删除，`sessions` 表只保留最新一枚有效 token；
  2) 过期（expires_at 到期或 created_at + SESSION_EXPIRE_HOURS 硬上限）会话由后台
     定时任务搬运到 `expired_sessions` 后删除；
  3) 主动注销 / 被撤销的会话同样归档，保留回源与排查依据。
- 归档表按 token 主键幂等写入（INSERT OR REPLACE），重复搬运不会产生多行。
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from .constants import SESSION_EXPIRE_HOURS
from .db import _db_connection, _iso, _utc_now

logger = logging.getLogger(__name__)

# 归档原因：便于回源时区分「自然过期 / 被新 token 取代 / 主动注销或撤销」
ARCHIVE_REASON_EXPIRED = "expired"
ARCHIVE_REASON_SUPERSEDED = "superseded"
ARCHIVE_REASON_REVOKED = "revoked"

# 单轮清理上限：避免启动瞬间在网络盘上一次搬运过多行阻塞请求
SESSION_ARCHIVE_BATCH_LIMIT = 1000
# 后台清理周期（秒）：过期会话最长滞留 30 分钟
SESSION_ARCHIVE_INTERVAL_SECONDS = 1800

_SESSION_COLUMNS = (
    "token",
    "username",
    "role",
    "guest_uid",
    "guest_device_id",
    "ip",
    "user_agent",
    "requires_email_binding",
    "created_at",
    "expires_at",
    "last_seen_at",
)

_SESSION_COLUMNS_SQL = ", ".join(_SESSION_COLUMNS)


def archive_session_rows_locked(
    conn,
    rows: List[Dict[str, Any]],
    reason: str,
) -> int:
    """把会话行写入 expired_sessions（须由调用方负责事务提交），返回写入行数。

    归档是**尽力而为**：旧库尚未建表或写入异常时仅告警，绝不阻塞调用方删除
    会话——注销/过期删除属安全动作，优先级高于历史留痕。
    """
    if not rows:
        return 0
    archived_at = _iso(_utc_now())
    payload = [
        (
            str(row.get("token") or ""),
            str(row.get("username") or ""),
            str(row.get("role") or ""),
            str(row.get("guest_uid") or ""),
            str(row.get("guest_device_id") or ""),
            str(row.get("ip") or ""),
            str(row.get("user_agent") or ""),
            int(row.get("requires_email_binding") or 0),
            str(row.get("created_at") or ""),
            str(row.get("expires_at") or ""),
            str(row.get("last_seen_at") or ""),
            archived_at,
            str(reason or ARCHIVE_REASON_REVOKED),
        )
        for row in rows
        if str(row.get("token") or "")
    ]
    if not payload:
        return 0
    try:
        conn.executemany(
            f"""
            INSERT OR REPLACE INTO expired_sessions (
                {_SESSION_COLUMNS_SQL}, archived_at, archive_reason
            ) VALUES ({", ".join("?" for _ in range(len(_SESSION_COLUMNS) + 2))})
            """,
            payload,
        )
    except Exception as exc:
        logger.warning("会话归档写入失败（继续执行删除）: %s", exc)
        return 0
    return len(payload)


def _row_to_session_dict(row: Any) -> Dict[str, Any]:
    """把 sqlite 行（Row / tuple / dict）统一转成会话字段字典。"""
    if isinstance(row, dict):
        return dict(row)
    try:
        return dict(row)
    except Exception:
        return dict(zip(_SESSION_COLUMNS, tuple(row)))


def _select_session_rows_locked(conn, where_sql: str, params: tuple) -> List[Dict[str, Any]]:
    """按条件读取待归档会话行（须持连接调用）。"""
    rows = conn.execute(
        f"SELECT {_SESSION_COLUMNS_SQL} FROM sessions WHERE {where_sql}",
        params,
    ).fetchall()
    return [_row_to_session_dict(row) for row in rows]


def archive_and_delete_tokens_locked(
    conn,
    tokens: List[str],
    reason: str,
) -> int:
    """归档并删除指定 token（须由调用方提交事务），返回归档行数。"""
    clean_tokens = [str(token) for token in tokens if str(token or "").strip()]
    if not clean_tokens:
        return 0
    placeholders = ", ".join("?" for _ in clean_tokens)
    rows = _select_session_rows_locked(conn, f"token IN ({placeholders})", tuple(clean_tokens))
    archived = archive_session_rows_locked(conn, rows, reason)
    conn.execute(f"DELETE FROM sessions WHERE token IN ({placeholders})", tuple(clean_tokens))
    return archived


def supersede_sessions_locked(
    conn,
    *,
    keep_token: str,
    guest_uid: str = "",
    username: str = "",
    ip: str = "",
    user_agent: str = "",
    duration_recorder: Optional[Any] = None,
) -> int:
    """签发新 token 时归档并删除同一身份的旧 token（须由调用方提交事务）。

    匹配口径：
    - 游客：同一 `guest_uid` 的全部旧行（同一浏览器重复签发只保留最新 token）；
    - 账号：同一 `username` + 同一 IP + 同一 UA（同一设备重复登录只保留最新 token，
      不同设备的多端登录互不影响）。

    `duration_recorder(row)` 可选：在归档前为每行回写在线时长指标，避免被取代的
    会话漏记 `user_metrics.total_login_seconds`。
    """
    keep = str(keep_token or "").strip()
    normalized_uid = str(guest_uid or "").strip()
    normalized_name = str(username or "").strip()

    if normalized_uid:
        where_sql = "role = 'guest' AND (guest_uid = ? OR username = ?)"
        params: tuple = (normalized_uid, normalized_uid)
    elif normalized_name:
        if not str(ip or "").strip() or not str(user_agent or "").strip():
            # 缺少设备指纹时不做跨会话清理，避免把用户其他设备的登录一并踢掉
            return 0
        where_sql = "username = ? AND ip = ? AND user_agent = ?"
        params = (normalized_name, str(ip or ""), str(user_agent or ""))
    else:
        return 0

    rows = _select_session_rows_locked(conn, where_sql, params)
    targets: List[str] = []
    for row in rows:
        token = str(row.get("token") or "")
        if token == keep:
            continue
        targets.append(token)
        if duration_recorder is not None:
            try:
                duration_recorder(row)
            except Exception:
                logger.warning("回写被取代会话在线时长失败（继续归档）", exc_info=True)
    return archive_and_delete_tokens_locked(conn, targets, ARCHIVE_REASON_SUPERSEDED)


def archive_expired_sessions_sync(
    now: Optional[datetime] = None,
    *,
    limit: int = SESSION_ARCHIVE_BATCH_LIMIT,
) -> int:
    """把已过期会话搬运到 expired_sessions 后删除，返回归档行数。

    过期判定与 `_get_session_sync` 完全一致：库里 expires_at 到期，或按
    created_at + SESSION_EXPIRE_HOURS 的硬上限到期（兼容历史 72h token）。
    """
    now_dt = now or _utc_now()
    now_iso = _iso(now_dt)
    hard_cutoff_iso = _iso(now_dt - timedelta(hours=SESSION_EXPIRE_HOURS))

    try:
        with _db_connection() as conn:
            rows = conn.execute(
                f"""
                SELECT {_SESSION_COLUMNS_SQL} FROM sessions
                WHERE expires_at <= ? OR created_at <= ?
                LIMIT ?
                """,
                (now_iso, hard_cutoff_iso, int(limit)),
            ).fetchall()
            session_rows = [_row_to_session_dict(row) for row in rows]
            if not session_rows:
                return 0
            archived = archive_session_rows_locked(conn, session_rows, ARCHIVE_REASON_EXPIRED)
            conn.executemany(
                "DELETE FROM sessions WHERE token = ?",
                [(str(row.get("token") or ""),) for row in session_rows],
            )
            conn.commit()
            return archived
    except Exception as exc:
        logger.warning("过期会话归档失败: %s", exc)
        return 0


async def session_archive_task() -> None:
    """后台任务：启动即清一次，此后每 SESSION_ARCHIVE_INTERVAL_SECONDS 秒一轮。

    取消安全（CancelledError 原样上抛供 lifespan 收尾）；单轮失败仅告警，
    下个周期自然重试。
    """
    while True:
        try:
            archived = await asyncio.to_thread(archive_expired_sessions_sync)
            if archived:
                logger.info("过期会话清理完成：归档并删除 %d 条", archived)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("过期会话清理失败，等待下个周期重试", exc_info=True)
        await asyncio.sleep(SESSION_ARCHIVE_INTERVAL_SECONDS)
