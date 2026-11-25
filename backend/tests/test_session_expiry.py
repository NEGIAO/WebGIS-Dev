"""Regression tests for the hard 4-hour session token lifetime."""

import sys
import unittest
from datetime import timedelta
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.auth import guest_token as guest_token_module
from api.auth import session as session_module
from api.auth.constants import SESSION_EXPIRE_HOURS
from api.auth.db import _iso, _utc_now


class _FakeContext:
    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        return self.conn

    def __exit__(self, *args):
        return False


class _FakeConn:
    def __init__(self, row):
        self.row = row
        self.deleted = []

    def execute(self, sql, params=()):
        if "DELETE FROM sessions" in sql:
            self.deleted.append(params)
        return self

    def fetchone(self):
        return self.row

    def commit(self):
        pass


class SessionExpiryTests(unittest.TestCase):
    def test_configured_expiry_is_capped_at_four_hours(self):
        self.assertLessEqual(SESSION_EXPIRE_HOURS, 4)

    def test_legacy_long_lived_token_is_forced_expired(self):
        now = _utc_now()
        row = {
            "token": "legacy-token",
            "username": "alice",
            "role": "registered",
            "guest_uid": "",
            "guest_device_id": "",
            "ip": "",
            "user_agent": "",
            "requires_email_binding": 0,
            # 旧库里的 expires_at 仍是 72 小时之后
            "created_at": _iso(now - timedelta(hours=5)),
            "expires_at": _iso(now + timedelta(hours=67)),
            "last_seen_at": _iso(now),
        }
        conn = _FakeConn(row)
        with mock.patch.object(session_module, "_db_connection", return_value=_FakeContext(conn)):
            with mock.patch.object(session_module, "_apply_logout_duration_sync"):
                result = session_module._get_session_sync(
                    "legacy-token", touch_presence=False, update_last_seen=False
                )

        self.assertIsNone(result)
        self.assertEqual(conn.deleted, [("legacy-token",)])

    def test_fresh_token_still_valid(self):
        now = _utc_now()
        row = {
            "token": "fresh-token",
            "username": "alice",
            "role": "registered",
            "guest_uid": "",
            "guest_device_id": "",
            "ip": "",
            "user_agent": "",
            "requires_email_binding": 0,
            "created_at": _iso(now - timedelta(hours=1)),
            "expires_at": _iso(now + timedelta(hours=3)),
            "last_seen_at": _iso(now),
        }
        conn = _FakeConn(row)
        with mock.patch.object(session_module, "_db_connection", return_value=_FakeContext(conn)):
            result = session_module._get_session_sync(
                "fresh-token", touch_presence=False, update_last_seen=False
            )

        self.assertEqual(result["token"], "fresh-token")
        self.assertEqual(conn.deleted, [])


class GuestTokenRenewalTests(unittest.TestCase):
    def test_expired_guest_token_reuses_same_identity(self):
        with mock.patch.object(guest_token_module, "_secret", return_value="test-secret"):
            with mock.patch.object(guest_token_module.time, "time", return_value=1000):
                token = guest_token_module.sign_guest_token("guest_abc123", ttl_hours=1)
            with mock.patch.object(guest_token_module.time, "time", return_value=5000):
                self.assertIsNone(guest_token_module.verify_guest_token(token))
                self.assertEqual(
                    guest_token_module.peek_guest_token_uid(token), "guest_abc123"
                )

    def test_guest_token_ttl_is_capped_at_four_hours(self):
        with mock.patch.object(guest_token_module, "_secret", return_value="test-secret"):
            with mock.patch.object(guest_token_module.time, "time", return_value=1000):
                token = guest_token_module.sign_guest_token("guest_abc123", ttl_hours=72)
            with mock.patch.object(guest_token_module.time, "time", return_value=1000 + 4 * 3600 + 60):
                self.assertIsNone(guest_token_module.verify_guest_token(token))


if __name__ == "__main__":
    unittest.main()
