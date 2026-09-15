# -*- coding: utf-8 -*-
"""纠偏磁盘缓存清理单测（domains/tiles/cache_cleanup.py）。"""

from __future__ import annotations

import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from domains.tiles.cache_cleanup import (
    CleanupStats,
    _iter_cache_files,
    _prune_empty_dirs,
    cleanup_rectify_cache,
)


def _touch(path: Path, size: int, mtime: float) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x" * size)
    os.utime(path, (mtime, mtime))


class TestCleanupAge(unittest.TestCase):
    def test_deletes_only_expired_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            now = time.time()
            old = root / "tpl" / "source-gcj" / "16" / "1" / "2.png"
            fresh = root / "tpl" / "gcj2wgs" / "16" / "1" / "3.png"
            _touch(old, 100, now - 10 * 86400)  # 10 天前
            _touch(fresh, 50, now - 1 * 86400)  # 1 天前

            stats = cleanup_rectify_cache(root, max_age_days=7, max_size_mb=0)

            self.assertFalse(old.exists())
            self.assertTrue(fresh.exists())
            self.assertEqual(stats.deleted_by_age, 1)
            self.assertEqual(stats.deleted_by_size, 0)
            self.assertEqual(stats.remaining_files, 1)
            self.assertEqual(stats.bytes_freed, 100)

    def test_age_zero_skips_age_phase(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = root / "a" / "1.png"
            _touch(old, 10, time.time() - 30 * 86400)
            stats = cleanup_rectify_cache(root, max_age_days=0, max_size_mb=0)
            self.assertTrue(old.exists())
            self.assertEqual(stats.deleted_files, 0)
            self.assertIn("disabled", "".join(stats.notes))


class TestCleanupSize(unittest.TestCase):
    def test_evicts_oldest_until_under_limit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            now = time.time()
            # 三个 1MB 文件共 3MB；上限 2MB → 删最旧 1 个
            f1 = root / "a" / "1.png"  # 最旧
            f2 = root / "b" / "2.png"
            f3 = root / "c" / "3.png"  # 最新
            _touch(f1, 1024 * 1024, now - 300)
            _touch(f2, 1024 * 1024, now - 200)
            _touch(f3, 1024 * 1024, now - 100)

            stats = cleanup_rectify_cache(root, max_age_days=0, max_size_mb=2)

            self.assertFalse(f1.exists())
            self.assertTrue(f2.exists())
            self.assertTrue(f3.exists())
            self.assertEqual(stats.deleted_by_size, 1)
            self.assertEqual(stats.deleted_by_age, 0)
            self.assertLessEqual(stats.remaining_bytes, 2 * 1024 * 1024)

    def test_under_limit_noop(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _touch(root / "x.png", 100, time.time())
            stats = cleanup_rectify_cache(root, max_age_days=0, max_size_mb=10)
            self.assertEqual(stats.deleted_files, 0)
            self.assertEqual(stats.remaining_files, 1)


class TestCleanupBothAndPrune(unittest.TestCase):
    def test_age_then_size_and_prune_empty_dirs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            now = time.time()
            expired = root / "old_tpl" / "source-gcj" / "10" / "0" / "0.png"
            keep_new = root / "new_tpl" / "source-gcj" / "10" / "0" / "1.png"
            _touch(expired, 1000, now - 20 * 86400)
            _touch(keep_new, 1000, now - 1 * 86400)

            stats = cleanup_rectify_cache(root, max_age_days=7, max_size_mb=100)

            self.assertFalse(expired.exists())
            self.assertTrue(keep_new.exists())
            self.assertEqual(stats.deleted_by_age, 1)
            # 过期文件所在空目录链应被剪掉
            self.assertFalse((root / "old_tpl").exists())
            self.assertTrue((root / "new_tpl" / "source-gcj" / "10" / "0").is_dir())
            self.assertGreaterEqual(stats.pruned_dirs, 1)


class TestSafety(unittest.TestCase):
    def test_iter_ignores_symlink_escape(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "cache"
            outside = Path(tmp) / "outside"
            root.mkdir()
            outside.mkdir()
            secret = outside / "secret.png"
            secret.write_bytes(b"s" * 10)
            link = root / "escape.png"
            try:
                link.symlink_to(secret)
            except (OSError, NotImplementedError):
                self.skipTest("symlink not supported on this platform")

            files = _iter_cache_files(root)
            # lstat 对符号链接返回 S_ISLNK，非 S_ISREG → 不收录、不删除
            paths = [p for p, _, _ in files]
            self.assertNotIn(link, paths)

            stats = cleanup_rectify_cache(root, max_age_days=1, max_size_mb=0)
            self.assertTrue(secret.exists())

    def test_missing_dir_is_safe(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "nope"
            stats = cleanup_rectify_cache(missing, max_age_days=7, max_size_mb=10)
            self.assertEqual(stats.scanned_files, 0)
            self.assertEqual(stats.deleted_files, 0)

    def test_prune_keeps_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "empty_cache"
            root.mkdir()
            pruned = _prune_empty_dirs(root)
            self.assertTrue(root.is_dir())
            self.assertEqual(pruned, 0)


class TestStatsShape(unittest.TestCase):
    def test_summary_fields(self):
        stats = CleanupStats(cache_dir="/tmp/x", deleted_by_age=1, deleted_by_size=2)
        self.assertEqual(stats.deleted_files, 3)
        self.assertIn("del_age=1", stats.summary())
        self.assertIn("del_size=2", stats.summary())


if __name__ == "__main__":
    unittest.main()
