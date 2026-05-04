from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from sqlmodel import Session, select

from models.download_task import DownloadTask, get_engine

logger = logging.getLogger(__name__)

DEFAULT_MAX_AGE_HOURS = 0.5
#半小时自动清理，避免冗余

_scheduler: Optional[BackgroundScheduler] = None


def cleanup_expired_tasks(max_age_hours: int = DEFAULT_MAX_AGE_HOURS) -> int:
    """Delete tasks and files older than max_age_hours and return removed count."""
    cutoff = datetime.utcnow() - timedelta(hours=max_age_hours)
    engine = get_engine()
    removed_count = 0

    with Session(engine) as session:
        statement = select(DownloadTask).where(DownloadTask.created_at < cutoff)
        tasks = list(session.exec(statement))
        if not tasks:
            return 0
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
