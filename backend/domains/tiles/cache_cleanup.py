# -*- coding: utf-8 -*-
"""纠偏磁盘缓存自动清理（GCJRE_CACHE）。属 domains/tiles 迁移单元，随整夹拷走。

背景：`grid.py` 的两级文件缓存只写不删，模板源/输出瓦片会持续累积。
本模块提供「按龄 + 按容量」双维清理，并挂到 app lifespan 周期执行。

策略（两阶段，先龄后容）：
1. 龄：删除 mtime 早于 `max_age_days` 的文件（0=关闭该维）
2. 容：若总字节仍超 `max_size_mb`，按 mtime 从旧到新继续删，直到达标
   （0=关闭该维）
3. 收尾：自底向上删除空目录

安全：只删 cache_dir 解析后真实子路径下的普通文件；符号链接指向
外部的目标不会被跟随删除。清理跑在线程池，不阻塞事件循环。
"""

from __future__ import annotations

import asyncio
import logging
import os
import stat as stat_mod
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

from config import get_int

from .rectify.common.geo import get_cache_dir

logger = logging.getLogger(__name__)

__all__ = [
    "CleanupStats",
    "cleanup_rectify_cache",
    "cache_cleanup_loop",
]


@dataclass
class CleanupStats:
    """单次清理结果（供日志与后续可观测性）。"""

    cache_dir: str = ""
    scanned_files: int = 0
    deleted_by_age: int = 0
    deleted_by_size: int = 0
    bytes_freed: int = 0
    remaining_files: int = 0
    remaining_bytes: int = 0
    pruned_dirs: int = 0
    errors: int = 0
    duration_s: float = 0.0
    notes: List[str] = field(default_factory=list)

    @property
    def deleted_files(self) -> int:
        return self.deleted_by_age + self.deleted_by_size

    def summary(self) -> str:
        return (
            f"dir={self.cache_dir} scanned={self.scanned_files} "
            f"del_age={self.deleted_by_age} del_size={self.deleted_by_size} "
            f"freed={self.bytes_freed}B remain={self.remaining_files}files/"
            f"{self.remaining_bytes}B pruned_dirs={self.pruned_dirs} "
            f"errors={self.errors} took={self.duration_s:.2f}s"
        )


def _is_under(path: Path, root: Path) -> bool:
    """path 解析后是否位于 root 之下（防路径穿越/符号链接逃逸）。"""
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except (ValueError, OSError):
        return False


def _iter_cache_files(cache_dir: Path) -> List[Tuple[Path, int, float]]:
    """列出 cache_dir 下全部普通文件 → [(path, size, mtime), ...]。

    使用 os.walk(followlinks=False)，避免跟随目录符号链接；
    文件本身若是符号链接，用 lstat 取元数据、仅普通文件收录。
    `_is_under` 为纵深防御（walk 已不跟目录链接），大缓存树下会多一次 resolve。
    """
    results: List[Tuple[Path, int, float]] = []
    if not cache_dir.is_dir():
        return results

    for dirpath, dirnames, filenames in os.walk(cache_dir, followlinks=False):
        # 不进入符号链接目录
        dirnames[:] = [d for d in dirnames if not Path(dirpath, d).is_symlink()]
        base = Path(dirpath)
        for name in filenames:
            fp = base / name
            try:
                st = fp.lstat()
            except OSError:
                continue
            if not _stat_is_regular(st.st_mode):
                continue
            if not _is_under(fp, cache_dir):
                continue
            results.append((fp, int(st.st_size), float(st.st_mtime)))
    return results


def _stat_is_regular(mode: int) -> bool:
    """S_ISREG（lstat 后判断普通文件；符号链接不会被当成缓存文件删除）。"""
    return stat_mod.S_ISREG(mode)


def _delete_file(path: Path) -> int:
    """删除单个文件，返回释放字节数；失败返回 0。"""
    try:
        size = path.lstat().st_size
    except OSError:
        size = 0
    try:
        path.unlink()
        return int(size)
    except OSError as exc:
        logger.warning("清理缓存文件失败 %s: %s", path, exc)
        return 0


def _prune_empty_dirs(cache_dir: Path) -> int:
    """自底向上删除空目录，返回删除的目录数。保留 cache_dir 本身。"""
    pruned = 0
    if not cache_dir.is_dir():
        return pruned
    for dirpath, dirnames, filenames in os.walk(cache_dir, topdown=False, followlinks=False):
        p = Path(dirpath)
        if p.resolve() == cache_dir.resolve():
            continue
        # 不删符号链接目录
        if p.is_symlink():
            continue
        try:
            if not any(p.iterdir()):
                p.rmdir()
                pruned += 1
        except OSError:
            continue
    return pruned


def cleanup_rectify_cache(
    cache_dir: Optional[Path] = None,
    *,
    max_age_days: Optional[int] = None,
    max_size_mb: Optional[int] = None,
) -> CleanupStats:
    """同步执行一轮纠偏磁盘缓存清理。

    参数为 None 时从配置读取：
    - `GCJRE_CACHE_MAX_AGE_DAYS`（默认 7，0=不按龄删）
    - `GCJRE_CACHE_MAX_MB`（默认 2048，0=不按容量删）

    返回 :class:`CleanupStats`。两维都关闭时直接空跑返回。
    """
    started = time.monotonic()
    if cache_dir is None:
        cache_dir = get_cache_dir()
    if max_age_days is None:
        max_age_days = get_int("GCJRE_CACHE_MAX_AGE_DAYS", 7, minimum=0)
    if max_size_mb is None:
        max_size_mb = get_int("GCJRE_CACHE_MAX_MB", 2048, minimum=0)

    stats = CleanupStats(cache_dir=str(cache_dir))
    if max_age_days <= 0 and max_size_mb <= 0:
        stats.notes.append("age+size limits both disabled; skip")
        stats.duration_s = time.monotonic() - started
        return stats

    files = _iter_cache_files(cache_dir)
    stats.scanned_files = len(files)
    total_bytes = sum(size for _, size, _ in files)
    now = time.time()

    # --- 阶段 1：按龄 ---
    remaining: List[Tuple[Path, int, float]] = []
    if max_age_days > 0:
        cutoff = now - max_age_days * 86400.0
        for fp, size, mtime in files:
            if mtime < cutoff:
                freed = _delete_file(fp)
                if freed or not fp.exists():
                    stats.deleted_by_age += 1
                    stats.bytes_freed += freed
                    total_bytes -= size
                else:
                    stats.errors += 1
            else:
                remaining.append((fp, size, mtime))
    else:
        remaining = list(files)

    # --- 阶段 2：按容量（从旧到新） ---
    if max_size_mb > 0:
        limit_bytes = max_size_mb * 1024 * 1024
        if total_bytes > limit_bytes:
            remaining.sort(key=lambda item: item[2])  # mtime 升序，最旧先删
            still: List[Tuple[Path, int, float]] = []
            for fp, size, mtime in remaining:
                if total_bytes <= limit_bytes:
                    still.append((fp, size, mtime))
                    continue
                freed = _delete_file(fp)
                if freed or not fp.exists():
                    stats.deleted_by_size += 1
                    stats.bytes_freed += freed
                    total_bytes -= size
                else:
                    stats.errors += 1
                    still.append((fp, size, mtime))
            remaining = still

    stats.remaining_files = len(remaining)
    stats.remaining_bytes = sum(size for _, size, _ in remaining)

    # --- 阶段 3：空目录 ---
    stats.pruned_dirs = _prune_empty_dirs(cache_dir)
    stats.duration_s = time.monotonic() - started
    return stats


async def cache_cleanup_loop(interval_s: Optional[int] = None) -> None:
    """周期清理后台任务（挂在 app lifespan；可取消）。

    启动后先等 `min(30, interval)` 秒再跑首轮，避免拖慢启动；
    每轮异常只记日志，不终止循环。
    """
    if interval_s is None:
        interval_s = get_int("GCJRE_CACHE_CLEANUP_INTERVAL_S", 3600, minimum=0)
    if interval_s <= 0:
        logger.info("纠偏磁盘缓存周期清理已禁用（GCJRE_CACHE_CLEANUP_INTERVAL_S=%s）", interval_s)
        return

    first_delay = min(30, interval_s)
    logger.info(
        "纠偏磁盘缓存清理任务已启动：interval=%ss，首轮约 %ss 后",
        interval_s,
        first_delay,
    )
    await asyncio.sleep(first_delay)
    while True:
        try:
            stats = await asyncio.to_thread(cleanup_rectify_cache)
            if stats.deleted_files or stats.pruned_dirs or stats.errors:
                logger.info("纠偏磁盘缓存清理：%s", stats.summary())
            else:
                logger.debug("纠偏磁盘缓存清理（无变更）：%s", stats.summary())
        except asyncio.CancelledError:
            logger.info("纠偏磁盘缓存清理任务已取消")
            raise
        except Exception:
            logger.exception("纠偏磁盘缓存清理失败")
        await asyncio.sleep(interval_s)
