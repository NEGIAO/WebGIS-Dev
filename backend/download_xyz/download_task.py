import logging
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlmodel import Field, SQLModel, Session, create_engine, select

from config import get_str
from api.auth.system_config import _get_system_config_value_sync, _set_system_config_value_sync

logger = logging.getLogger(__name__)

_db_path = get_str("DOWNLOAD_TASK_DB_PATH")

# 北京时间（V3.4.63：UTC → UTC+8）
_BEIJING_TZ = timezone(timedelta(hours=8))


def _utc_now() -> datetime:
    return datetime.now(_BEIJING_TZ)


class DownloadTask(SQLModel, table=True):
    id: str = Field(primary_key=True, index=True)
    username: Optional[str] = Field(default=None, index=True, nullable=True)  # 绑定账号（NULL = 匿名/历史任务）
    status: str = Field(default="pending", index=True)
    progress: float = Field(default=0.0)
    message: Optional[str] = None
    file_path: Optional[str] = None
    tile_count: Optional[int] = Field(default=None)  # 总瓦片数（用于时间估算）
    tiles_downloaded: Optional[int] = Field(default=None)  # 已下载瓦片数（进度细化）
    estimated_seconds: Optional[int] = Field(default=None)  # 预计总耗时（秒）
    basemap_name: Optional[str] = Field(default=None, max_length=100)  # 前端传入的底图名称（用于显示与文件命名）
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)


_engine = create_engine(
    f"sqlite:///{_db_path}",
    echo=False,
    connect_args={"check_same_thread": False},
)


def init_download_task_db() -> None:
    """Initialize the download task table in the local sqlite database."""
    SQLModel.metadata.create_all(_engine)
    # L2 默认值初始化（仅在 system_config 中无值时写入）
    if not _get_system_config_value_sync("download_task_ttl_minutes", ""):
        _set_system_config_value_sync("download_task_ttl_minutes", "30")
    if not _get_system_config_value_sync("api_guest_daily_quota", ""):
        _set_system_config_value_sync("api_guest_daily_quota", "100")
    if not _get_system_config_value_sync("api_registered_daily_quota", ""):
        _set_system_config_value_sync("api_registered_daily_quota", "1000")
    # 迁移：新增列（SQLite 不支持 ALTER TABLE ADD COLUMN IF NOT EXISTS，需要手动处理）
    # 注意：不使用模块级标志，每次启动都执行迁移（幂等安全，适合多 worker 部署）
    _migrate_columns()


def _migrate_columns() -> None:
    """执行数据库迁移，新增列不存在时添加

    使用 raw sqlite3 直接操作，避免 SQLAlchemy 事务上下文与 SQLite DDL 的兼容问题。
    每次启动幂等安全：已存在列自动跳过。
    """
    try:
        raw_conn = sqlite3.connect(_db_path)
        try:
            # 检查现有列
            existing_columns = set()
            cursor = raw_conn.execute("PRAGMA table_info(downloadtask)")
            for row in cursor.fetchall():
                existing_columns.add(row[1])  # name 列

            # 需要新增的列
            new_columns = {
                "username": "TEXT DEFAULT NULL",
                "tile_count": "INTEGER DEFAULT NULL",
                "tiles_downloaded": "INTEGER DEFAULT NULL",
                "estimated_seconds": "INTEGER DEFAULT NULL",
                "basemap_name": "TEXT DEFAULT NULL",
            }

            added = []
            for col_name, col_def in new_columns.items():
                if col_name not in existing_columns:
                    try:
                        raw_conn.execute(f"ALTER TABLE downloadtask ADD COLUMN {col_name} {col_def}")
                        added.append(col_name)
                    except sqlite3.OperationalError as e:
                        # 列已存在时忽略（并发场景兜底）
                        logger.info("迁移跳过列 %s: %s", col_name, e)

            if added:
                logger.info("下载任务表迁移完成，新增列: %s", ", ".join(added))
            else:
                logger.debug("下载任务表无需迁移，所有列已存在")

            # 创建索引
            raw_conn.execute(
                "CREATE INDEX IF NOT EXISTS ix_downloadtask_username ON downloadtask (username)"
            )
            raw_conn.commit()
        finally:
            raw_conn.close()
    except Exception as e:
        # 迁移失败不阻塞主流程，但必须记录日志
        logger.error("下载任务表迁移异常: %s", str(e), exc_info=True)


def get_engine():
    """Return the shared SQLModel engine for download tasks."""
    return _engine


def create_task(
    task_id: str,
    file_path: Optional[str] = None,
    username: Optional[str] = None,
    tile_count: Optional[int] = None,
    estimated_seconds: Optional[int] = None,
    basemap_name: Optional[str] = None,
) -> DownloadTask:
    """Create a new download task row and return the persisted task."""
    with Session(_engine) as session:
        task = DownloadTask(
            id=task_id,
            file_path=file_path,
            username=username,
            tile_count=tile_count,
            estimated_seconds=estimated_seconds,
            basemap_name=basemap_name,
        )
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


def list_active_tasks_by_user(username: str, cutoff: datetime) -> list[DownloadTask]:
    """获取用户未过期的有效任务列表（按创建时间倒序，最多 100 条）"""
    with Session(_engine) as session:
        return list(session.exec(
            select(DownloadTask)
            .where(
                DownloadTask.username == username,
                DownloadTask.updated_at >= cutoff,
            )
            .order_by(DownloadTask.created_at.desc())
            .limit(100)
        ))
