from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from sqlmodel import Session, select

from .download_task import DownloadTask, get_engine
from .download import _get_task_ttl_minutes

# 北京时间（V3.4.63：UTC → UTC+8）
_BEIJING_TZ = timezone(timedelta(hours=8))

logger = logging.getLogger(__name__)

# 终态任务集合：只有这些状态的任务才会被清理
TERMINAL_STATUSES = {"success", "failed", "cancelled", "expired"}

_scheduler: Optional[BackgroundScheduler] = None


def cleanup_expired_tasks(batch_size: int = 100) -> int:
    """Delete terminal tasks older than TTL and return removed count.

    仅清理终态任务（success/failed/cancelled/expired），
    运行中任务（pending/downloading/stitching）不受影响。
    TTL 从 L2 system_config 动态读取。
    分批删除，避免一次性加载大量任务到内存。
    """
    ttl_minutes = _get_task_ttl_minutes()
    cutoff = datetime.now(_BEIJING_TZ) - timedelta(minutes=ttl_minutes)
    engine = get_engine()

    with Session(engine) as session:
        # 仅查询终态且超时的任务（分批）
        pending = session.exec(
            select(DownloadTask.id).where(
                DownloadTask.updated_at < cutoff,
                DownloadTask.status.in_(TERMINAL_STATUSES),
            ).limit(1)
        ).first()
        if pending is None:
            return 0

        tasks = list(session.exec(
            select(DownloadTask).where(
                DownloadTask.updated_at < cutoff,
                DownloadTask.status.in_(TERMINAL_STATUSES),
            ).limit(batch_size)
        ))
        removed_count = 0
        for task in tasks:
            if task.file_path and os.path.exists(task.file_path):
                try:
                    os.remove(task.file_path)
                except OSError:
                    logger.warning("Failed to remove file: %s", task.file_path)
            session.delete(task)
            removed_count += 1
        session.commit()

    return removed_count


def start_task_cleanup_scheduler() -> BackgroundScheduler:
    """Start the APScheduler loop that purges expired download tasks."""
    global _scheduler
    if _scheduler and _scheduler.running:
        return _scheduler

    scheduler = BackgroundScheduler()
    scheduler.add_job(
        cleanup_expired_tasks,
        "interval",
        minutes=1,
        id="download_task_cleanup",
        replace_existing=True,
    )
    scheduler.start()
    _scheduler = scheduler
    logger.info("Download task cleanup scheduler started")
    return scheduler


def shutdown_task_cleanup_scheduler(scheduler: Optional[BackgroundScheduler] = None) -> None:
    """Stop the download task cleanup scheduler if running."""
    target = scheduler or _scheduler
    if target is None:
        return
    target.shutdown(wait=False)
    logger.info("Download task cleanup scheduler stopped")
