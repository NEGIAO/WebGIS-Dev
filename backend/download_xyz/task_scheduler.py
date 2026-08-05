from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from sqlmodel import Session, select

from .download_task import DownloadTask, get_engine

logger = logging.getLogger(__name__)

DEFAULT_MAX_AGE_HOURS = 0.5
#半小时自动清理，避免冗余

_scheduler: Optional[BackgroundScheduler] = None


def cleanup_expired_tasks(max_age_hours: int = DEFAULT_MAX_AGE_HOURS) -> int:
    """Delete tasks and files older than max_age_hours and return removed count."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    engine = get_engine()

    with Session(engine) as session:
        # 先轻量判断是否有需要清理的任务，避免无意义的数据库操作
        # 注：两次查询之间存在理论上的 TOCTOU 窗口，但清理任务允许极小概率的重复扫描，不影响正确性
        pending = session.exec(
            select(DownloadTask.id).where(DownloadTask.created_at < cutoff).limit(1)
        ).first()
        if pending is None:
            return 0

        tasks = list(session.exec(select(DownloadTask).where(DownloadTask.created_at < cutoff)))
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
