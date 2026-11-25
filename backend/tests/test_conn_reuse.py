"""
线程本地连接复用单测（V3.7.7 批次 A）。

覆盖：同线程复用同一连接、代际推进后旧连接丢弃、存活探测失败（malformed）
转入恢复分支后返回新连接、auth_db_generation 反映代际。
全部通过 mock _try_connect / _ensure_schema / validate_sqlite_database 进行，
不触碰真实 AUTH_DB_PATH；db 模块全局状态在 tearDown 恢复，避免污染同进程其他用例。
"""

import sys
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import api.auth.db as db  # noqa: E402

SQLITE_MALFORMED = "database disk image is malformed"


class FakeConn:
    """最小连接假件：记录 close 与 liveness 行为。"""

    def __init__(self, name: str, fail_liveness: bool = False):
        self.name = name
        self.closed = False
        self.fail_liveness = fail_liveness

    def execute(self, sql: str, *args, **kwargs):
        if self.fail_liveness:
            raise db.sqlite3.DatabaseError(SQLITE_MALFORMED)
        return None

    def close(self):
        self.closed = True


class ConnReuseTests(unittest.TestCase):
    def setUp(self):
        self._saved_ready = db._auth_storage_ready
        self._saved_gen = db._conn_generation
        db._drop_thread_conn()
        db._auth_storage_ready = True
        self.addCleanup(self._restore)

    def _restore(self):
        db._drop_thread_conn()
        db._auth_storage_ready = self._saved_ready
        with db._generation_lock:
            db._conn_generation = self._saved_gen

    def test_same_thread_reuses_same_connection(self):
        made = [FakeConn("a"), FakeConn("b")]
        with mock.patch.object(db, "_try_connect", side_effect=lambda *a, **k: made.pop(0)):
            c1 = db._get_thread_conn()
            c2 = db._get_thread_conn()
        self.assertIs(c1, c2)
        self.assertEqual(len(made), 1)  # 两次调用只创建一次（复用命中）

    def test_generation_bump_drops_old_connection(self):
        made = [FakeConn("a"), FakeConn("b")]
        with mock.patch.object(db, "_try_connect", side_effect=lambda *a, **k: made.pop(0)):
            c1 = db._get_thread_conn()
            gen = db._bump_conn_generation()
            c2 = db._get_thread_conn()
        self.assertIsNot(c1, c2)
        self.assertTrue(c1.closed)  # 旧连接被主动关闭
        self.assertEqual(db.auth_db_generation(), gen)

    def test_thread_local_isolation(self):
        made = [FakeConn(f"c{i}") for i in range(2)]
        lock = threading.Lock()
        with lock:
            queue = list(made)
        conns = []

        def worker():
            with mock.patch.object(db, "_try_connect", side_effect=lambda *a, **k: queue.pop(0)):
                conns.append(db._get_thread_conn())

        t1 = threading.Thread(target=worker)
        t1.start()
        t1.join()
        t2 = threading.Thread(target=worker)
        t2.start()
        t2.join()
        self.assertIsNot(conns[0], conns[1])  # 线程间不共享连接
        self.assertFalse(queue)

    def test_liveness_failure_routes_to_recovery(self):
        broken = FakeConn("broken", fail_liveness=True)
        good = FakeConn("good")
        db._local.conn = broken
        db._local.gen = db._conn_generation

        recovered = {"schema": False}
        with mock.patch.object(db, "_try_connect", side_effect=lambda *a, **k: good), \
                mock.patch.object(db, "_db_file_is_corrupted", return_value=False), \
                mock.patch.object(db, "_ensure_schema", side_effect=lambda: recovered.update(schema=True)), \
                mock.patch.object(db, "validate_sqlite_database",
                                  return_value=SimpleNamespace(valid=True, tables=[], total_rows=0)):
            conn = db._db_connection()

        self.assertIs(conn, good)
        self.assertTrue(broken.closed)      # 损坏连接被丢弃
        self.assertTrue(recovered["schema"])  # 走过了恢复/初始化分支
        self.assertTrue(db._auth_storage_ready)
        # 恢复完成时代际已推进
        self.assertEqual(db._local.gen, db._conn_generation)

    def test_externally_closed_connection_self_heals(self):
        """V3.7.7 hotfix 回归：调用方关闭共享连接（如历史影像 closing 包装）后，
        _db_connection 必须自愈重建而非抛 ProgrammingError 500。"""
        class ClosedConn(FakeConn):
            def execute(self, sql: str, *args, **kwargs):
                raise db.sqlite3.ProgrammingError("Cannot operate on a closed database")

        closed = ClosedConn("closed")
        good = FakeConn("good")
        db._local.conn = closed
        db._local.gen = db._conn_generation
        db._auth_storage_ready = True
        try:
            with mock.patch.object(db, "_try_connect", side_effect=lambda *a, **k: good):
                conn = db._db_connection()
            self.assertIs(conn, good)
            self.assertTrue(closed.closed)   # 旧连接被显式回收
            self.assertIs(db._local.conn, good)
        finally:
            db._drop_thread_conn()

    def test_full_validation_failure_forces_recovery(self):
        """快速损坏探测漏报时，完整校验失败必须绕过探测强制恢复，而不能永久降级。"""
        good = FakeConn("good")
        invalid = SimpleNamespace(
            valid=False,
            tables=[],
            total_rows=0,
            error="integrity_check 未返回 ok",
        )
        valid = SimpleNamespace(valid=True, tables=["users"], total_rows=1)
        db._auth_storage_ready = False
        calls = []

        with mock.patch.object(db, "_db_file_is_corrupted", return_value=False), \
                mock.patch.object(db, "_ensure_schema", return_value=None), \
                mock.patch.object(
                    db,
                    "validate_sqlite_database",
                    side_effect=[invalid, valid],
                ), \
                mock.patch.object(
                    db,
                    "_attempt_db_recovery",
                    side_effect=lambda path, *, force=False: calls.append((path, force)) or True,
                ), \
                mock.patch.object(db, "_try_connect", return_value=good):
            conn = db._db_connection()

        self.assertIs(conn, good)
        self.assertEqual(calls, [(db.AUTH_DB_PATH, True)])
        self.assertTrue(db._auth_storage_ready)

    def test_not_a_database_routes_to_recovery(self):
        """V3.7.7：'file is not a database'（不含 malformed/corrupt 字样）必须同样
        转入恢复分支——HF 2026-11-22 10:04:51 瞬态 500 的直接根因。"""
        class NotDbConn(FakeConn):
            def execute(self, sql: str, *args, **kwargs):
                raise db.sqlite3.DatabaseError("file is not a database")

        broken = NotDbConn("notdb")
        good = FakeConn("good")
        db._local.conn = broken
        db._local.gen = db._conn_generation
        db._auth_storage_ready = True
        try:
            with mock.patch.object(db, "_try_connect", side_effect=lambda *a, **k: good),                     mock.patch.object(db, "_db_file_is_corrupted", return_value=False),                     mock.patch.object(db, "_ensure_schema", side_effect=lambda: None),                     mock.patch.object(db, "validate_sqlite_database",
                                      return_value=SimpleNamespace(valid=True, tables=[], total_rows=0)):
                conn = db._db_connection()
            self.assertIs(conn, good)
            self.assertTrue(broken.closed)
            self.assertEqual(db._local.gen, db._conn_generation)
        finally:
            db._drop_thread_conn()

    def test_non_corrupt_liveness_error_propagates(self):
        broken = FakeConn("locked")
        db._local.conn = broken
        db._local.gen = db._conn_generation

        class LockedConn(FakeConn):
            def execute(self, sql: str, *args, **kwargs):
                raise db.sqlite3.OperationalError("database is locked")

        db._local.conn = LockedConn("locked")
        with mock.patch.object(db, "_try_connect", side_effect=AssertionError("不应新建")):
            with self.assertRaises(db.sqlite3.OperationalError):
                db._db_connection()


if __name__ == "__main__":
    unittest.main()
