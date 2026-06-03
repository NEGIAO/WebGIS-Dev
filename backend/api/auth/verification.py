"""
验证码生成、存储、校验与频率限制。

核心逻辑：
- 使用 secrets 模块安全生成 6 位数字验证码
- 验证码存入 SQLite email_verification_codes 表
- 支持频率限制（60秒/次，每天10次）和暴力破解防护（最多5次尝试）
"""

import logging
import secrets
from datetime import timedelta
from typing import Any, Dict, Optional

from .db import _db_connection, _iso, _utc_now
from .constants import (
    VERIFICATION_CODE_LENGTH,
    VERIFICATION_CODE_EXPIRE_MINUTES,
    VERIFICATION_RATE_LIMIT_SECONDS,
    VERIFICATION_DAILY_LIMIT,
    VERIFICATION_MAX_ATTEMPTS,
)

logger = logging.getLogger(__name__)


def generate_code() -> str:
    """
    安全生成数字验证码。

    返回：
    - 固定长度的数字字符串（如 "038274"）
    """
    upper_bound = 10 ** VERIFICATION_CODE_LENGTH
    code_num = secrets.randbelow(upper_bound)
    return str(code_num).zfill(VERIFICATION_CODE_LENGTH)


def store_code(
    email: str,
    code: str,
    purpose: str,
    username: Optional[str] = None,
) -> bool:
    """
    将验证码存入数据库。

    参数：
    - email: 目标邮箱地址
    - code: 6 位数字验证码
    - purpose: 用途标识（register/reset_password/bind_email）
    - username: 关联用户名（注册时填充）

    返回：
    - True 存储成功
    """
    now = _utc_now()
    expires_at = _iso(now + timedelta(minutes=VERIFICATION_CODE_EXPIRE_MINUTES))
    created_at = _iso(now)

    try:
        with _db_connection() as conn:
            conn.execute(
                """
                INSERT INTO email_verification_codes
                    (email, code, purpose, username, attempt_count, expires_at, used, created_at)
                VALUES (?, ?, ?, ?, 0, ?, 0, ?)
                """,
                (email.lower().strip(), code, purpose, username, expires_at, created_at),
            )
            conn.commit()
        return True
    except Exception as e:
        logger.error("验证码存储失败: %s", str(e), exc_info=True)
        return False


def rate_limit_check(email: str) -> Dict[str, Any]:
    """
    频率限制检查。

    规则：
    1. 同一邮箱 60 秒内仅允许发送 1 次
    2. 同一邮箱每天最多发送 10 次

    参数：
    - email: 目标邮箱地址

    返回：
    - allowed: bool 是否允许发送
    - message: str 提示信息
    - retry_after: int 需等待的秒数（仅在不允许时有值）
    """
    normalized_email = email.lower().strip()
    now = _utc_now()
    # 在 Python 侧计算时间边界（纯 UTC 格式，避免 SQLite datetime() 不支持时区后缀）
    cutoff_60s = _iso(now - timedelta(seconds=VERIFICATION_RATE_LIMIT_SECONDS))
    today_start = _iso(now.replace(hour=0, minute=0, second=0, microsecond=0))

    with _db_connection() as conn:
        # 检查 60 秒内是否有发送记录
        count_recent = conn.execute(
            """
            SELECT COUNT(*) as cnt FROM email_verification_codes
            WHERE email = ? AND created_at > ?
            """,
            (normalized_email, cutoff_60s),
        ).fetchone()

        if count_recent and dict(count_recent).get("cnt", 0) > 0:
            return {
                "allowed": False,
                "message": f"验证码发送过于频繁，请 {VERIFICATION_RATE_LIMIT_SECONDS} 秒后再试",
                "retry_after": VERIFICATION_RATE_LIMIT_SECONDS,
            }

        # 检查每日发送上限
        count_today = conn.execute(
            """
            SELECT COUNT(*) as cnt FROM email_verification_codes
            WHERE email = ? AND created_at >= ?
            """,
            (normalized_email, today_start),
        ).fetchone()

        if count_today and dict(count_today).get("cnt", 0) >= VERIFICATION_DAILY_LIMIT:
            return {
                "allowed": False,
                "message": f"今日验证码发送次数已达上限（{VERIFICATION_DAILY_LIMIT} 次），请明天再试",
                "retry_after": 0,
            }

    return {"allowed": True, "message": "", "retry_after": 0}


def verify_code(email: str, code: str, purpose: str) -> Dict[str, Any]:
    """
    校验验证码。

    规则：
    1. 查找未过期、未使用的最新验证码
    2. 比对验证码是否匹配
    3. 超过最大尝试次数后验证码失效
    4. 验证成功后标记为已使用

    参数：
    - email: 目标邮箱地址
    - code: 用户输入的验证码
    - purpose: 用途标识

    返回：
    - valid: bool 是否验证通过
    - message: str 提示信息
    - username: str 验证关联的用户名（注册时有值）
    """
    normalized_email = email.lower().strip()
    now_iso = _iso(_utc_now())

    with _db_connection() as conn:
        # 查找最新的未使用且未过期的验证码
        row = conn.execute(
            """
            SELECT id, code, attempt_count, username, expires_at, used
            FROM email_verification_codes
            WHERE email = ? AND purpose = ? AND used = 0 AND expires_at > ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (normalized_email, purpose, now_iso),
        ).fetchone()

        if not row:
            return {
                "valid": False,
                "message": "验证码已过期或不存在，请重新发送",
                "username": None,
            }

        record = dict(row)
        record_id = record["id"]
        stored_code = str(record["code"])
        attempt_count = int(record.get("attempt_count", 0))
        associated_username = record.get("username")

        # 检查尝试次数
        if attempt_count >= VERIFICATION_MAX_ATTEMPTS:
            # 标记为已使用（作废）
            conn.execute(
                "UPDATE email_verification_codes SET used = 1 WHERE id = ?",
                (record_id,),
            )
            conn.commit()
            return {
                "valid": False,
                "message": f"验证码已失效（尝试次数超过 {VERIFICATION_MAX_ATTEMPTS} 次），请重新发送",
                "username": None,
            }

        # 增加尝试次数
        conn.execute(
            "UPDATE email_verification_codes SET attempt_count = attempt_count + 1 WHERE id = ?",
            (record_id,),
        )
        conn.commit()

        # 比对验证码
        if not secrets.compare_digest(stored_code, code.strip()):
            remaining = VERIFICATION_MAX_ATTEMPTS - attempt_count - 1
            return {
                "valid": False,
                "message": f"验证码错误，还可尝试 {remaining} 次",
                "username": None,
            }

        # 验证成功，标记为已使用
        conn.execute(
            "UPDATE email_verification_codes SET used = 1 WHERE id = ?",
            (record_id,),
        )
        conn.commit()

        return {
            "valid": True,
            "message": "验证成功",
            "username": associated_username,
        }


def is_email_verified_for_purpose(email: str, purpose: str) -> bool:
    """
    检查邮箱是否已通过指定用途的验证（用于注册流程中二次确认）。

    参数：
    - email: 目标邮箱地址
    - purpose: 用途标识

    返回：
    - True 已通过验证，False 未验证
    """
    normalized_email = email.lower().strip()
    # 在 Python 侧计算 5 分钟前的时间（纯 UTC 格式，避免 SQLite datetime() 时区问题）
    cutoff = _iso(_utc_now() - timedelta(minutes=5))

    with _db_connection() as conn:
        row = conn.execute(
            """
            SELECT id FROM email_verification_codes
            WHERE email = ? AND purpose = ? AND used = 1 AND expires_at > ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (normalized_email, purpose, cutoff),
        ).fetchone()

    return row is not None