"""
管理面敏感值掩码单测（V3.7.6）。

覆盖：mask_secret 各形态、敏感列判定（精确 + 子串 + 大小写）、
mask_sensitive_row 行级掩码、掩码占位值写回拦截。
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.secret_masking import (
    MASK,
    assert_no_masked_writeback,
    has_masked_placeholder,
    is_sensitive_column,
    mask_secret,
    mask_sensitive_row,
)


class MaskSecretTests(unittest.TestCase):
    def test_long_value_keeps_ends(self):
        self.assertEqual(mask_secret("sk-abcdefghij1234567890"), "sk-a" + MASK + "7890")

    def test_short_value_fully_masked(self):
        self.assertEqual(mask_secret("short"), MASK)
        self.assertEqual(mask_secret("12345678"), MASK)  # 恰好 8 位 = keep*2 → 整体打码

    def test_empty_values_return_empty(self):
        self.assertEqual(mask_secret(""), "")
        self.assertEqual(mask_secret(None), "")

    def test_non_string_input_coerced(self):
        self.assertTrue(mask_secret(12345678901).startswith("1234"))


class SensitiveColumnTests(unittest.TestCase):
    def test_exact_names(self):
        for name in ("token", "password_hash", "key_value", "secret", "guest_token",
                     "temporary_credential", "access_token", "refresh_token"):
            self.assertTrue(is_sensitive_column(name), name)

    def test_case_insensitive(self):
        self.assertTrue(is_sensitive_column("Key_Value"))
        self.assertTrue(is_sensitive_column("TOKEN"))

    def test_substring_match(self):
        self.assertTrue(is_sensitive_column("oauth_access_token"))
        self.assertTrue(is_sensitive_column("smtp_secret_value"))
        self.assertTrue(is_sensitive_column("agent_credential"))

    def test_non_sensitive_columns(self):
        for name in ("", None, "username", "display_name", "created_at", "avatar_index", "user_agent"):
            self.assertFalse(is_sensitive_column(name), str(name))


class MaskSensitiveRowTests(unittest.TestCase):
    def test_sensitive_cells_masked_others_untouched(self):
        row = {
            "__rowid": 7,
            "username": "alice",
            "token": "tok_abcdef1234567890",
            "password_hash": "pbkdf2$100000$deadbeef",
            "created_at": "2026-11-21T00:00:00+08:00",
        }
        masked = mask_sensitive_row(row)
        self.assertEqual(masked["__rowid"], 7)
        self.assertEqual(masked["username"], "alice")
        self.assertEqual(masked["created_at"], "2026-11-21T00:00:00+08:00")
        self.assertEqual(masked["token"], "tok_" + MASK + "7890")
        self.assertEqual(masked["password_hash"], "pbkd" + MASK + "beef")
        # 原行不被就地修改
        self.assertEqual(row["token"], "tok_abcdef1234567890")

    def test_none_values_left_alone(self):
        masked = mask_sensitive_row({"token": None, "username": "bob"})
        self.assertIsNone(masked["token"])


class MaskedWritebackGuardTests(unittest.TestCase):
    def test_masked_sensitive_writeback_rejected(self):
        with self.assertRaises(ValueError):
            assert_no_masked_writeback({"key_value": "sk-ab****7890"})

    def test_partial_mask_in_value_rejected(self):
        with self.assertRaises(ValueError):
            assert_no_masked_writeback({"password_hash": "a****b"})

    def test_real_values_accepted(self):
        assert_no_masked_writeback({
            "key_value": "sk-realvalue123456",
            "display_name": "	manager **** test",  # 非敏感列即便含 **** 也不拦
            "avatar_index": 3,
        })

    def test_empty_payload_accepted(self):
        assert_no_masked_writeback({})
        assert_no_masked_writeback(None)

    def test_has_masked_placeholder(self):
        self.assertTrue(has_masked_placeholder("x****y"))
        self.assertFalse(has_masked_placeholder("x*y"))


if __name__ == "__main__":
    unittest.main()
