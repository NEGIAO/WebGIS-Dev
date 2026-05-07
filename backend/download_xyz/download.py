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

from .tile_engine import MAX_LATITUDE, WEB_MERCATOR_EXTENT, build_geotiff_from_tiles
from .download_task import DownloadTask, create_task, get_task, update_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/download", tags=["Download"])

DEFAULT_OUTPUT_DIR = "/tmp"
DEFAULT_TASK_TTL_MINUTES = 30


class CreateDownloadTaskRequest(BaseModel):
    """Download task request with comprehensive validation.
    
    Fields:
        tile_url_template: Tile URL template with {z}, {x}, {y} placeholders
        bbox: Bounding box [minLon, minLat, maxLon, maxLat]
        resolution_m: Output resolution in meters (0.3 to 1000)
        bbox_crs: Coordinate reference system (default: EPSG:4326)
    """
    tile_url_template: str = Field(..., min_length=1, max_length=500)
    bbox: List[float] = Field(..., min_items=4, max_items=4)
    resolution_m: float = Field(..., gt=0.3, le=1000)
    bbox_crs: str = Field(default="EPSG:4326", min_length=1, max_length=50)


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
    """Create a download task and enqueue the async tile export job.
    
    Args:
        payload: Download request parameters
        background_tasks: FastAPI background tasks manager
        
    Returns:
        DownloadTaskStatusResponse: Initial task status
        
    Raises:
        HTTPException: If validation fails
    """
    try:
        # Validate tile URL template
        _validate_tile_template(payload.tile_url_template)
        
        # Validate bbox values
        if len(payload.bbox) != 4:
            raise HTTPException(status_code=400, detail="bbox must have exactly 4 values")
        
        min_x, min_y, max_x, max_y = payload.bbox
        if not all(isinstance(v, (int, float)) and not math.isnan(v) and not math.isinf(v) 
                   for v in [min_x, min_y, max_x, max_y]):
            raise HTTPException(status_code=400, detail="All bbox values must be finite numbers")
        
        # Validate CRS format
        crs = str(payload.bbox_crs or '').strip().upper()
        if crs not in {"EPSG:4326", "EPSG:3857", "EPSG4326", "EPSG3857", "4326", "3857"}:
            logger.warning("Unsupported CRS: %s (will default to EPSG:4326)", crs)
        
        # Create output directory
        os.makedirs(DEFAULT_OUTPUT_DIR, exist_ok=True)
        
        # Generate task
        task_id = uuid.uuid4().hex
        output_path = os.path.join(DEFAULT_OUTPUT_DIR, f"{task_id}.tif")
        task = create_task(task_id, file_path=output_path)
        
        logger.info(
            "Created download task: %s | Template: %s | CRS: %s | Resolution: %s",
            task_id,
            payload.tile_url_template[:50],
            crs,
            payload.resolution_m
        )
        
        # Enqueue background job
        background_tasks.add_task(
            _process_download_task,
            task_id,
            payload,
            output_path,
        )

        return _build_status_response(task)
    
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error creating download task: %s", str(exc))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create task: {str(exc)[:100]}"
        )


@router.get("/tasks/{task_id}", response_model=DownloadTaskStatusResponse)
def get_download_task(task_id: str):
    """Fetch task status for polling clients.
    
    Args:
        task_id: Unique task identifier
        
    Returns:
        DownloadTaskStatusResponse: Current task status
        
    Raises:
        HTTPException: If task not found or expired
    """
    task = get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")
    return _build_status_response(task)


@router.get("/tasks/{task_id}/file")
def download_task_file(task_id: str):
    """Stream the resulting GeoTIFF when the task finishes.
    
    Args:
        task_id: Unique task identifier
        
    Returns:
        FileResponse: GeoTIFF file stream
        
    Raises:
        HTTPException: If task not found, expired, failed, or file missing
    """
    task = get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")
    
    expires_at, _, is_expired = _get_expiration(task)
    if is_expired:
        raise HTTPException(
            status_code=410,
            detail=f"Task expired on {expires_at.isoformat()}. Tasks are kept for {DEFAULT_TASK_TTL_MINUTES} minutes."
        )
    
    if task.status != "success":
        raise HTTPException(
            status_code=400,
            detail=f"Task is not ready. Current status: {task.status}. Message: {task.message}"
        )
    
    if not task.file_path or not os.path.exists(task.file_path):
        logger.error("Output file missing for task %s: %s", task_id, task.file_path)
        raise HTTPException(
            status_code=500,
            detail="Output file not found on server. Task may have been cleaned up."
        )

    file_size = os.path.getsize(task.file_path)
    logger.info("Downloading file for task %s: %s (size: %d bytes)", task_id, task.file_path, file_size)
    
    filename = f"basemap_{task_id}.tif"
    return FileResponse(task.file_path, media_type="image/tiff", filename=filename)


async def _process_download_task(
    task_id: str,
    payload: CreateDownloadTaskRequest,
    output_path: str,
) -> None:
    """Run the tile export pipeline and update task status fields.
    
    Args:
        task_id: Unique task identifier
        payload: Download request parameters (tile URL template, bbox, resolution)
        output_path: Output file path for GeoTIFF
    """
    logger.info(
        "Starting download task: %s | Template: %s | BBox CRS: %s | Resolution: %s",
        task_id,
        payload.tile_url_template[:50],
        payload.bbox_crs,
        payload.resolution_m
    )
    
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
        # Normalize bbox from input CRS to EPSG:4326
        bbox_4326 = _normalize_bbox(payload.bbox, payload.bbox_crs)
        if not bbox_4326 or len(bbox_4326) != 4:
            raise ValueError(f"Invalid normalized bbox: {bbox_4326}")
        
        logger.debug("Normalized bbox: %s", bbox_4326)
        
        # Build GeoTIFF from tiles
        result = await build_geotiff_from_tiles(
            payload.tile_url_template,
            bbox_4326,
            payload.resolution_m,
            output_path,
            progress_callback=report_progress,
        )
        
        logger.info(
            "Download completed: %s | Tiles: %d/%d | Output: %s",
            task_id,
            result.get("downloaded_tiles", 0),
            result.get("tile_count", 0),
            output_path
        )
        
        update_task(task_id, status="stitching", progress=96, message="Finalizing GeoTIFF")
        
        # Verify output file exists and has content
        if not os.path.exists(output_path):
            raise FileNotFoundError(f"Output file not created: {output_path}")
        
        file_size = os.path.getsize(output_path)
        if file_size == 0:
            raise ValueError(f"Output file is empty: {output_path}")
        
        logger.info("Output file validated: %s | Size: %d bytes", output_path, file_size)
        
        update_task(task_id, status="success", progress=100, message="Ready")
    except Exception as exc:
        logger.exception("Download task failed: %s | Error: %s", task_id, str(exc))
        error_msg = str(exc)[:200]  # Truncate long error messages
        update_task(task_id, status="failed", progress=0, message=error_msg)


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
    """Ensure the tile URL template is valid and contains required placeholders.
    
    Args:
        template: Tile URL template string
        
    Raises:
        HTTPException: If template is invalid
    """
    if not template or not isinstance(template, str):
        raise HTTPException(
            status_code=400,
            detail="tile_url_template must be a non-empty string",
        )
    
    required_tokens = ("{z}", "{x}", "{y}")
    missing_tokens = [token for token in required_tokens if token not in template]
    
    if missing_tokens:
        raise HTTPException(
            status_code=400,
            detail=f"tile_url_template must include {', '.join(required_tokens)}, but missing: {', '.join(missing_tokens)}",
        )
    
    # Warn about potentially unsupported placeholder styles
    if "{-y}" in template:
        logger.warning("Template uses {-y} placeholder which may not be supported: %s", template[:50])
        raise HTTPException(
            status_code=400,
            detail="The {-y} placeholder style is not supported. Use {y} instead.",
        )


def _normalize_bbox(bbox: List[float], bbox_crs: str) -> tuple[float, float, float, float]:
    """Normalize and validate bounding box, converting from input CRS to EPSG:4326.
    
    Args:
        bbox: [minX, minY, maxX, maxY] in the specified CRS
        bbox_crs: Coordinate Reference System (e.g., 'EPSG:4326', 'EPSG:3857')
        
    Returns:
        Normalized bbox [minLon, minLat, maxLon, maxLat] in EPSG:4326
        
    Raises:
        HTTPException: If bbox is invalid or has only 4 values
    """
    if len(bbox) != 4:
        raise HTTPException(status_code=400, detail="bbox must have 4 numbers")
    
    min_x, min_y, max_x, max_y = bbox
    
    # Swap if needed to ensure min < max
    if min_x > max_x:
        min_x, max_x = max_x, min_x
    if min_y > max_y:
        min_y, max_y = max_y, min_y

    # Identify CRS and apply appropriate transformation
    crs = str(bbox_crs or '').strip().upper()
    if crs in {"EPSG:3857", "EPSG3857", "3857"}:
        return _bbox_3857_to_4326(min_x, min_y, max_x, max_y)

    # EPSG:4326 or unknown CRS: treat as WGS84, just clamp values
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
    """Convert bounding box from EPSG:3857 (Web Mercator) to EPSG:4326 (WGS84).
    
    Args:
        min_x, min_y, max_x, max_y: Bounds in EPSG:3857 (meters)
        
    Returns:
        [minLon, minLat, maxLon, maxLat] in EPSG:4326 (degrees)
    """
    def to_lonlat(x: float, y: float) -> tuple[float, float]:
        """Convert single point from EPSG:3857 to EPSG:4326."""
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
    """Calculate task expiration details.
    
    Args:
        task: Download task model instance
        
    Returns:
        Tuple of (expires_at datetime, expires_in seconds, is_expired boolean)
    """
    expires_at = task.created_at + timedelta(minutes=DEFAULT_TASK_TTL_MINUTES)
    now = datetime.utcnow()
    expires_in = max(0, int((expires_at - now).total_seconds()))
    return expires_at, expires_in, now >= expires_at


def _clamp(value: float, min_value: float, max_value: float) -> float:
    """Clamp a numeric value within min and max bounds.
    
    Args:
        value: Value to clamp
        min_value: Minimum allowed value
        max_value: Maximum allowed value
        
    Returns:
        Clamped value within [min_value, max_value]
    """
    return max(min_value, min(value, max_value))
