"""
认证库连接执行期瞬态损坏自愈单测（V3.7.9）：
分类器全集、只读语句退避重试、写语句不重试、重试耗尽抛出、工厂连接冒烟。
"""

import sys
import unittest
from pathlib import Path
from unittest import mock

import sqlite3
import threading
import time as _time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.auth.db import (  # noqa: E402
    _SelfHealingConnection,
    _TRANSIENT_CORRUPTION_MAX_RETRIES,
    _db_access_lock,
    _execute_with_corruption_retry,
    _is_corruption_message,
)

MALFORMED = "database disk image is malformed"
NOT_A_DB = "file is not a database"


class CorruptionMessageTests(unittest.TestCase):
    def test_positive_markers(self):
        self.assertTrue(_is_corruption_message(MALFORMED))
        self.assertTrue(_is_corruption_message(NOT_A_DB))
        self.assertTrue(_is_corruption_message("database disk image is corrupt"))
        self.assertTrue(_is_corruption_message("FILE IS NOT A DATABASE"))  # 大小写不敏感

    def test_negative_errors(self):
        self.assertFalse(_is_corruption_message("no such table: users"))
        self.assertFalse(_is_corruption_message("database or disk is full"))
        self.assertFalse(_is_corruption_message("cannot operate on a closed database"))
        self.assertFalse(_is_corruption_message(""))
        self.assertFalse(_is_corruption_message(None))


class ExecuteRetryTests(unittest.TestCase):
    """_execute_with_corruption_retry：只读重试 / 写透传 / 非损坏透传 / 耗尽抛出。"""

    def _run(self, sql, side_effects, **kwargs):
        exec_fn = mock.Mock(side_effect=side_effects)
        with mock.patch("api.auth.db.time.sleep") as sleep_mock:
            result = _execute_with_corruption_retry(exec_fn, sql, **kwargs)
        return result, exec_fn, sleep_mock

    def test_read_retries_then_succeeds(self):
        sentinel = object()
        result, exec_fn, sleep_mock = self._run(
            "SELECT 1", [sqlite3.DatabaseError(MALFORMED), sentinel]
        )
        self.assertIs(result, sentinel)
        self.assertEqual(exec_fn.call_count, 2)
        sleep_mock.assert_called_once()  # 0.15s * attempt

    def test_with_statement_retryable(self):
        sentinel = object()
        result, exec_fn, _ = self._run(
            "WITH t AS (SELECT 1 AS x) SELECT x FROM t",
            [sqlite3.DatabaseError(MALFORMED), sentinel],
        )
        self.assertIs(result, sentinel)
        self.assertEqual(exec_fn.call_count, 2)

    def test_read_exhausted_raises_last_error(self):
        exec_fn = mock.Mock(side_effect=sqlite3.DatabaseError(NOT_A_DB))
        with mock.patch("api.auth.db.time.sleep"):
            with self.assertRaisesRegex(sqlite3.DatabaseError, "not a database"):
                _execute_with_corruption_retry(exec_fn, "SELECT 1")
        # 1 次原始执行 + 3 次重试
        self.assertEqual(exec_fn.call_count, _TRANSIENT_CORRUPTION_MAX_RETRIES + 1)

    def test_write_statement_never_retried(self):
        exec_fn = mock.Mock(side_effect=sqlite3.DatabaseError(MALFORMED))
        with mock.patch("api.auth.db.time.sleep") as sleep_mock:
            with self.assertRaisesRegex(sqlite3.DatabaseError, "malformed"):
                _execute_with_corruption_retry(exec_fn, "INSERT INTO users VALUES (1)")
        self.assertEqual(exec_fn.call_count, 1)  # 直接透传
        sleep_mock.assert_not_called()

    def test_non_corruption_error_never_retried(self):
        exec_fn = mock.Mock(side_effect=sqlite3.OperationalError("no such table: users"))
        with mock.patch("api.auth.db.time.sleep") as sleep_mock:
            with self.assertRaisesRegex(sqlite3.OperationalError, "no such table"):
                _execute_with_corruption_retry(exec_fn, "SELECT 1")
        self.assertEqual(exec_fn.call_count, 1)
        sleep_mock.assert_not_called()


class SelfHealingConnectionTests(unittest.TestCase):
    """工厂连接冒烟：正常读写直通、PRAGMA 不重试、垃圾文件重试耗尽后如实抛出。"""

    def test_normal_read_write_roundtrip(self):
        conn = sqlite3.connect(":memory:", factory=_SelfHealingConnection)
        try:
            conn.execute("CREATE TABLE t (v TEXT)")
            conn.execute("INSERT INTO t VALUES ('ok')")
            row = conn.execute("SELECT v FROM t").fetchone()
            self.assertEqual(row[0], "ok")
        finally:
            conn.close()

    def test_garbage_file_retries_exhausted_then_raises(self):
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as fh:
            fh.write(b"this is not a sqlite database at all")
            garbage_path = fh.name
        conn = sqlite3.connect(garbage_path, factory=_SelfHealingConnection)
        try:
            exec_fn = mock.Mock(side_effect=sqlite3.DatabaseError(NOT_A_DB))
            with mock.patch("api.auth.db.time.sleep"):
                with self.assertRaisesRegex(sqlite3.DatabaseError, "not a database"):
                    _execute_with_corruption_retry(exec_fn, "SELECT 1")
        finally:
            conn.close()
            Path(garbage_path).unlink(missing_ok=True)


class AccessSerializationTests(unittest.TestCase):
    """V3.7.11：with 块访问级串行化——并发峰值恒为 1、异常路径放锁、同线程可重入。"""

    def test_with_block_serializes_concurrent_access(self):
        conn = sqlite3.connect(":memory:", factory=_SelfHealingConnection)
        try:
            stats = {"active": 0, "peak": 0}
            stats_lock = threading.Lock()

            def worker():
                for _ in range(25):
                    with conn:
                        with stats_lock:
                            stats["active"] += 1
                            stats["peak"] = max(stats["peak"], stats["active"])
                        _time.sleep(0.001)
                        with stats_lock:
                            stats["active"] -= 1

            threads = [threading.Thread(target=worker) for _ in range(4)]
            for th in threads:
                th.start()
            for th in threads:
                th.join(timeout=10)
            self.assertFalse(any(th.is_alive() for th in threads), "疑似死锁")
            self.assertEqual(stats["peak"], 1)
        finally:
            conn.close()

    def test_lock_released_after_exception_in_block(self):
        conn = sqlite3.connect(":memory:", factory=_SelfHealingConnection)
        try:
            with self.assertRaises(RuntimeError):
                with conn:
                    raise RuntimeError("boom")
            # 异常路径（回滚后）锁必须已释放
            self.assertTrue(_db_access_lock.acquire(blocking=False))
            _db_access_lock.release()
        finally:
            conn.close()

    def test_nested_with_blocks_reentrant(self):
        conn = sqlite3.connect(":memory:", factory=_SelfHealingConnection)
        try:
            with conn:
                with conn:
                    pass
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main()
