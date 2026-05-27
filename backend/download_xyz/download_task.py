from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel, Session, create_engine, select

DEFAULT_DB_PATH = "/tmp/webgis_download_tasks.db"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class DownloadTask(SQLModel, table=True):
    id: str = Field(primary_key=True, index=True)
    status: str = Field(default="pending", index=True)
    progress: float = Field(default=0.0)
    message: Optional[str] = None
    file_path: Optional[str] = None
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)


_db_path = os.getenv("DOWNLOAD_TASK_DB_PATH", DEFAULT_DB_PATH)
_engine = create_engine(
    f"sqlite:///{_db_path}",
    echo=False,
    connect_args={"check_same_thread": False},
)


def init_download_task_db() -> None:
    """Initialize the download task table in the local sqlite database."""
    SQLModel.metadata.create_all(_engine)


def get_engine():
    """Return the shared SQLModel engine for download tasks."""
    return _engine


def create_task(task_id: str, file_path: Optional[str] = None) -> DownloadTask:
    """Create a new download task row and return the persisted task."""
    with Session(_engine) as session:
        task = DownloadTask(id=task_id, file_path=file_path)
        session.add(task)
        session.commit()
        session.refresh(task)
        return task


def get_task(task_id: str) -> Optional[DownloadTask]:
    """Fetch a download task by id, or None if missing."""
    with Session(_engine) as session:
        return session.get(DownloadTask, task_id)


def update_task(task_id: str, **fields) -> Optional[DownloadTask]:
    """Update selected fields on a task and return the refreshed row."""
    with Session(_engine) as session:
        task = session.get(DownloadTask, task_id)
        if task is None:
            return None
        for key, value in fields.items():
            setattr(task, key, value)
        task.updated_at = _utc_now()
        session.add(task)
        session.commit()
        session.refresh(task)
        return task


def list_tasks_before(cutoff: datetime) -> list[DownloadTask]:
    """Return all tasks created before the cutoff time."""
    with Session(_engine) as session:
        statement = select(DownloadTask).where(DownloadTask.created_at < cutoff)
        return list(session.exec(statement))
