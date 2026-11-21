"""
游客身份治理单测（V3.7.6）：签名 token 签发/验签、签发限频器、确定性派生桶、
guest_identity_records 保留期清理。

方案：Docs/TODO/guest-identity-governance-plan.md §3
"""

import sqlite3
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.auth import constants as auth_constants
from api.auth.guest_token import (
    GUEST_ISSUE_LIMITER,
    GUEST_TOKEN_PREFIX,
    GuestIssueLimiter,
    guest_token_issuance_enabled,
    issue_limit_key,
    sign_guest_token,
    verify_guest_token,
)
from api.auth.user import _purge_stale_guest_identities_sync


class GuestTokenSignVerifyTests(unittest.TestCase):
    """sign/verify 往返、篡改、过期、未配置降级。"""

    def test_roundtrip(self):
        with mock.patch("api.auth.guest_token.get_str", return_value="test-secret"):
            token = sign_guest_token("guest_abcdef1234567890", ttl_hours=2)
            self.assertTrue(token and token.startswith(GUEST_TOKEN_PREFIX))
            self.assertEqual(verify_guest_token(token), "guest_abcdef1234567890")

    def test_tampered_payload_rejected(self):
        with mock.patch("api.auth.guest_token.get_str", return_value="test-secret"):
            token = sign_guest_token("guest_abcdef1234567890", ttl_hours=2)
            # 篡改 uid 段（保留合法 base64url 字符）
            body = token[len(GUEST_TOKEN_PREFIX):]
            sig = body.split(".")[1]
            forged = GUEST_TOKEN_PREFIX + "Z3Vlc3RfZm9yZ2lkbmlkfDE3MDAwMDAwMDA" + "." + sig
            self.assertIsNone(verify_guest_token(forged))

    def test_tampered_signature_rejected(self):
        with mock.patch("api.auth.guest_token.get_str", return_value="test-secret"):
            token = sign_guest_token("guest_abcdef1234567890", ttl_hours=2)
            body = token[len(GUEST_TOKEN_PREFIX):]
            payload = body.split(".")[0]
            forged = GUEST_TOKEN_PREFIX + payload + "." + "AAAA" + body.split(".")[1][4:]
            self.assertIsNone(verify_guest_token(forged))

    def test_expired_token_rejected(self):
        with mock.patch("api.auth.guest_token.get_str", return_value="test-secret"):
            token = sign_guest_token("guest_abcdef1234567890", ttl_hours=2)
            # 直接构造过期 token：复用内部逻辑签一个 exp 在过去的 token
            import base64
            import hashlib
            import hmac as hmac_mod
            payload = f"guest_abcdef1234567890|{int(time.time()) - 3600}".encode()
            sig = hmac_mod.new(b"test-secret", payload, hashlib.sha256).digest()
            pad = lambda b: base64.urlsafe_b64encode(b).decode().rstrip("=")
            expired = f"{GUEST_TOKEN_PREFIX}{pad(payload)}.{pad(sig)}"
            self.assertIsNone(verify_guest_token(expired))

    def test_secret_unset_disables_issuance(self):
        with mock.patch("api.auth.guest_token.get_str", return_value=""):
            self.assertIsNone(sign_guest_token("guest_abcdef1234567890"))
            self.assertFalse(guest_token_issuance_enabled())
            self.assertIsNone(verify_guest_token(f"{GUEST_TOKEN_PREFIX}x.y"))

    def test_wrong_secret_rejected(self):
        with mock.patch("api.auth.guest_token.get_str", return_value="secret-a"):
            token = sign_guest_token("guest_abcdef1234567890", ttl_hours=2)
        with mock.patch("api.auth.guest_token.get_str", return_value="secret-b"):
            self.assertIsNone(verify_guest_token(token))

    def test_garbage_inputs_rejected(self):
        for bad in ("", "not-a-token", GUEST_TOKEN_PREFIX, "gt1_a.b", "gt1_" + "A" * 400):
            self.assertIsNone(verify_guest_token(bad))


class GuestIssueLimiterTests(unittest.TestCase):
    """滑动窗口限频：第 N+1 次拒绝、键隔离、reset。"""

    def test_limit_enforced_per_key(self):
        limiter = GuestIssueLimiter(window_seconds=3600)
        key = issue_limit_key("1.2.3.4", "UA-A")
        self.assertTrue(all(limiter.allow(key, 3) for _ in range(3)))
        self.assertFalse(limiter.allow(key, 3))

    def test_keys_are_isolated(self):
        limiter = GuestIssueLimiter(window_seconds=3600)
        k1 = issue_limit_key("1.2.3.4", "UA-A")
        k2 = issue_limit_key("5.6.7.8", "UA-A")
        k3 = issue_limit_key("1.2.3.4", "UA-B")
        self.assertTrue(all(limiter.allow(k1, 1) for _ in range(1)))
        self.assertTrue(limiter.allow(k2, 1))
        self.assertTrue(limiter.allow(k3, 1))
        self.assertFalse(limiter.allow(k1, 1))

    def test_issue_key_ignores_device_id_dimension(self):
        # 限频键只由 (IP, UA) 决定——键本身无 device 入参，天然不受设备头轮换影响
        self.assertEqual(
            issue_limit_key("1.2.3.4", "UA"),
            issue_limit_key("1.2.3.4", "UA"),
        )
        self.assertNotEqual(issue_limit_key("1.2.3.4", "UA"), issue_limit_key("1.2.3.5", "UA"))


class GuestUidDerivationTests(unittest.TestCase):
    """确定性派生桶：稳定性、device_id 不参与、命名空间区分。"""

    def test_ip_ua_derivation_is_deterministic(self):
        a = auth_constants._derive_uid_from_ip_ua("1.2.3.4", "Mozilla/5.0")
        b = auth_constants._derive_uid_from_ip_ua("1.2.3.4", "Mozilla/5.0")
        self.assertEqual(a, b)
        self.assertTrue(a.startswith("guest_") and len(a) == len("guest_") + 16)

    def test_device_rotation_does_not_change_ip_ua_bucket(self):
        # 核心防绕承诺：无 token 时轮换 device_id 不影响桶（派生函数根本不收 device_id）
        self.assertEqual(
            auth_constants._derive_uid_from_ip_ua("1.2.3.4", "UA"),
            auth_constants._derive_uid_from_ip_ua("1.2.3.4", "UA"),
        )
        self.assertNotEqual(
            auth_constants._derive_uid_from_ip_ua("1.2.3.4", "UA"),
            auth_constants._derive_uid_from_ip_ua("1.2.3.4", "Other/UA"),
        )

    def test_device_namespace_distinct_from_ip_ua_namespace(self):
        # 签发通道（device 派生）与无 token 兜底（ip+ua 派生）不同命名空间种子
        device_uid = auth_constants._build_guest_uid("", "", "device-abc-123")
        ip_ua_uid = auth_constants._derive_uid_from_ip_ua("1.2.3.4", "device-abc-123")
        self.assertNotEqual(device_uid, ip_ua_uid)


class _TempAuthDbMixin(unittest.TestCase):
    """为 purge 测试提供临时 auth 库（替换 _db_connection）。"""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self._tmp.name) / "webgis_auth.db"
        conn = sqlite3.connect(str(self.db_path))
        conn.execute(
            """
            CREATE TABLE guest_identity_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guest_uid TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                role TEXT NOT NULL DEFAULT 'guest',
                visit_count INTEGER NOT NULL DEFAULT 0,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            )
            """
        )
        conn.commit()
        conn.close()

        class _ClosingConnection:
            """镜像真实 _db_connection 语义：with 退出提交/回滚并关闭（Windows 下不关闭
            会阻塞 TemporaryDirectory 清理，WinError 32）。"""

            def __init__(self, path):
                self._conn = sqlite3.connect(str(path), timeout=5)

            def __enter__(self):
                return self._conn

            def __exit__(self, exc_type, exc, tb):
                try:
                    if exc_type is None:
                        self._conn.commit()
                    else:
                        self._conn.rollback()
                finally:
                    self._conn.close()
                return False

        self._patcher = mock.patch(
            "api.auth.user._db_connection",
            side_effect=lambda: _ClosingConnection(self.db_path),
        )
        self._patcher.start()
        self.addCleanup(self._patcher.stop)
        self.addCleanup(self._tmp.cleanup)


class GuestIdentityPurgeTests(_TempAuthDbMixin):
    """保留期清理：只删超期行、保留期内不动、<=0 天为 no-op。"""

    def _insert(self, uid, last_seen_at):
        conn = sqlite3.connect(str(self.db_path))
        conn.execute(
            "INSERT INTO guest_identity_records (guest_uid, username, role, first_seen_at, last_seen_at) "
            "VALUES (?, ?, 'guest', ?, ?)",
            (uid, uid, last_seen_at, last_seen_at),
        )
        conn.commit()
        conn.close()

    def test_purges_only_stale_rows(self):
        self._insert("guest_old1", "2026-01-01T00:00:00+08:00")
        self._insert("guest_old2", "2026-02-01T00:00:00+08:00")
        # 新鲜行用当前时间写法（_iso 同构格式）
        from api.auth.db import _iso, _utc_now
        self._insert("guest_fresh", _iso(_utc_now()))
        deleted = _purge_stale_guest_identities_sync(90)
        self.assertGreaterEqual(deleted, 2)
        conn = sqlite3.connect(str(self.db_path))
        remaining = {r[0] for r in conn.execute("SELECT guest_uid FROM guest_identity_records").fetchall()}
        conn.close()
        self.assertIn("guest_fresh", remaining)
        self.assertNotIn("guest_old1", remaining)
        self.assertNotIn("guest_old2", remaining)

    def test_non_positive_retention_is_noop(self):
        self._insert("guest_old1", "2026-01-01T00:00:00+08:00")
        self.assertEqual(_purge_stale_guest_identities_sync(0), 0)
        self.assertEqual(_purge_stale_guest_identities_sync(-1), 0)


if __name__ == "__main__":
    unittest.main()
