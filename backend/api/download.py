from __future__ import annotations

import logging
import math
import os
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from core.tile_engine import MAX_LATITUDE, WEB_MERCATOR_EXTENT, build_geotiff_from_tiles
from models.download_task import DownloadTask, create_task, get_task, update_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/download", tags=["Download"])

DEFAULT_OUTPUT_DIR = "/tmp"
DEFAULT_TASK_TTL_MINUTES = 30


class CreateDownloadTaskRequest(BaseModel):
    tile_url_template: str = Field(..., min_length=1)
    bbox: List[float] = Field(..., min_items=4, max_items=4)
    resolution_m: float = Field(..., gt=0)
    bbox_crs: str = Field(default="EPSG:4326")


class DownloadTaskStatusResponse(BaseModel):
    task_id: str
    status: str
    progress: float
    message: Optional[str]
    created_at: datetime
    updated_at: datetime
    file_ready: bool
    expires_at: datetime
    expires_in_seconds: int
    is_expired: bool


@router.post("/tasks", response_model=DownloadTaskStatusResponse)
async def create_download_task(
    payload: CreateDownloadTaskRequest,
    background_tasks: BackgroundTasks,
):
    """Create a download task and enqueue the async tile export job."""
    _validate_tile_template(payload.tile_url_template)
    os.makedirs(DEFAULT_OUTPUT_DIR, exist_ok=True)

    task_id = uuid.uuid4().hex
    output_path = os.path.join(DEFAULT_OUTPUT_DIR, f"{task_id}.tif")
    task = create_task(task_id, file_path=output_path)

    background_tasks.add_task(
        _process_download_task,
        task_id,
        payload,
        output_path,
    )

    return _build_status_response(task)


@router.get("/tasks/{task_id}", response_model=DownloadTaskStatusResponse)
def get_download_task(task_id: str):
    """Fetch task status for polling clients."""
    task = get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return _build_status_response(task)


@router.get("/tasks/{task_id}/file")
def download_task_file(task_id: str):
    """Stream the resulting GeoTIFF when the task finishes."""
    task = get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    expires_at, _, is_expired = _get_expiration(task)
    if is_expired:
        raise HTTPException(status_code=410, detail="Task has expired")
    if task.status != "success":
        raise HTTPException(status_code=409, detail="Task not completed")
    if not task.file_path or not os.path.exists(task.file_path):
        raise HTTPException(status_code=404, detail="File not found")

    filename = f"basemap_{task_id}.tif"
    return FileResponse(task.file_path, media_type="image/tiff", filename=filename)


async def _process_download_task(
    task_id: str,
    payload: CreateDownloadTaskRequest,
    output_path: str,
) -> None:
    """Run the tile export pipeline and update task status fields."""
    update_task(task_id, status="downloading", progress=5, message="Downloading tiles")

    progress_state = {"last": 0}

    async def report_progress(done: int, total: int, phase: str) -> None:
        if total <= 0:
            return
        ratio = done / total
        progress = min(95, max(5, int(ratio * 90) + 5))
        if progress <= progress_state["last"]:
            return
        progress_state["last"] = progress
        update_task(
            task_id,
            status="downloading",
            progress=progress,
            message=f"Downloading tiles {done}/{total}"
        )

    try:
        bbox_4326 = _normalize_bbox(payload.bbox, payload.bbox_crs)
        await build_geotiff_from_tiles(
            payload.tile_url_template,
            bbox_4326,
            payload.resolution_m,
            output_path,
            progress_callback=report_progress,
        )
        update_task(task_id, status="stitching", progress=96, message="Finalizing GeoTIFF")
        update_task(task_id, status="success", progress=100, message="Ready")
    except Exception as exc:
        logger.exception("Download task failed: %s", task_id)
        update_task(task_id, status="failed", progress=0, message=str(exc))


def _build_status_response(task: DownloadTask) -> DownloadTaskStatusResponse:
    """Shape a stable response payload for task polling."""
    expires_at, expires_in, is_expired = _get_expiration(task)
    status = "expired" if is_expired else task.status
    file_ready = bool(
        status == "success" and task.file_path and os.path.exists(task.file_path)
    )
    return DownloadTaskStatusResponse(
        task_id=task.id,
        status=status,
        progress=task.progress,
        message=task.message,
        created_at=task.created_at,
        updated_at=task.updated_at,
        file_ready=file_ready,
        expires_at=expires_at,
        expires_in_seconds=expires_in,
        is_expired=is_expired,
    )


def _validate_tile_template(template: str) -> None:
    """Ensure the tile URL template exposes z/x/y placeholders."""
    required_tokens = ("{z}", "{x}", "{y}")
    if not all(token in template for token in required_tokens):
        raise HTTPException(
            status_code=400,
            detail="tile_url_template must include {z}, {x}, {y}",
        )


def _normalize_bbox(bbox: List[float], bbox_crs: str) -> tuple[float, float, float, float]:
    if len(bbox) != 4:
        raise HTTPException(status_code=400, detail="bbox must have 4 numbers")
    min_x, min_y, max_x, max_y = bbox
    if min_x > max_x:
        min_x, max_x = max_x, min_x
    if min_y > max_y:
        min_y, max_y = max_y, min_y

    crs = str(bbox_crs or '').strip().upper()
    if crs in {"EPSG:3857", "EPSG3857", "3857"}:
        return _bbox_3857_to_4326(min_x, min_y, max_x, max_y)

    min_x = _clamp(min_x, -180.0, 180.0)
    max_x = _clamp(max_x, -180.0, 180.0)
    min_y = _clamp(min_y, -MAX_LATITUDE, MAX_LATITUDE)
    max_y = _clamp(max_y, -MAX_LATITUDE, MAX_LATITUDE)
    return min_x, min_y, max_x, max_y


def _bbox_3857_to_4326(
    min_x: float,
    min_y: float,
    max_x: float,
    max_y: float,
) -> tuple[float, float, float, float]:
    def to_lonlat(x: float, y: float) -> tuple[float, float]:
        clamped_x = _clamp(x, -WEB_MERCATOR_EXTENT, WEB_MERCATOR_EXTENT)
        clamped_y = _clamp(y, -WEB_MERCATOR_EXTENT, WEB_MERCATOR_EXTENT)
        lon = (clamped_x / WEB_MERCATOR_EXTENT) * 180.0
        lat = (180.0 / math.pi) * (
            2 * math.atan(math.exp(clamped_y / WEB_MERCATOR_EXTENT * math.pi)) - math.pi / 2
        )
        lat = _clamp(lat, -MAX_LATITUDE, MAX_LATITUDE)
        return lon, lat

    lon1, lat1 = to_lonlat(min_x, min_y)
    lon2, lat2 = to_lonlat(max_x, max_y)
    min_lon, max_lon = (lon1, lon2) if lon1 <= lon2 else (lon2, lon1)
    min_lat, max_lat = (lat1, lat2) if lat1 <= lat2 else (lat2, lat1)
    return min_lon, min_lat, max_lon, max_lat


def _get_expiration(task: DownloadTask) -> tuple[datetime, int, bool]:
    expires_at = task.created_at + timedelta(minutes=DEFAULT_TASK_TTL_MINUTES)
    now = datetime.utcnow()
    expires_in = max(0, int((expires_at - now).total_seconds()))
    return expires_at, expires_in, now >= expires_at


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(value, max_value))
