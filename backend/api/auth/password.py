"""
密码哈希与验证（PBKDF2-SHA256）。
"""

import hashlib
import hmac
import os
from typing import Optional

from .constants import PASSWORD_HASH_ITERATIONS


def _hash_password(password: str, salt: Optional[bytes] = None) -> str:
    raw = str(password or "")
    salt_bytes = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        raw.encode("utf-8"),
        salt_bytes,
        PASSWORD_HASH_ITERATIONS,
    )
    return f"{salt_bytes.hex()}${digest.hex()}"


def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_hex, digest_hex = str(stored_hash).split("$", 1)
        expected = _hash_password(password, bytes.fromhex(salt_hex)).split("$", 1)[1]
        return hmac.compare_digest(expected, digest_hex)
    except Exception:
        return False
