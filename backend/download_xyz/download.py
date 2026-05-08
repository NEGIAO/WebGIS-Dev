from __future__ import annotations

import hashlib
import hashlib
import logging
import math
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from urllib.parse import quote, urlparse

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .tile_engine import MAX_LATITUDE, WEB_MERCATOR_EXTENT, build_geotiff_from_tiles
from .download_task import DownloadTask, create_task, get_task, update_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/download", tags=["Download"])

DEFAULT_OUTPUT_DIR = "/tmp"
DEFAULT_TASK_TTL_MINUTES = 30
DEFAULT_DOWNLOAD_TOKEN_LIFETIME_MINUTES = 60

# 下载令牌缓存：{token: (task_id, expires_at)}
_download_tokens: Dict[str, tuple[str, datetime]] = {}

# 下载任务附加元数据缓存：用于生成更可读的下载文件名
_download_task_metadata: Dict[str, dict] = {}


class CreateDownloadTaskRequest(BaseModel):
    """下载任务请求参数。"""

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
    download_token: Optional[str] = None


def _generate_download_token(task_id: str) -> str:
    """为指定任务生成一个安全的临时下载令牌。"""
    random_part = secrets.token_urlsafe(32)
    task_hash = hashlib.sha256(task_id.encode()).hexdigest()[:8]
    return f"{task_id}_{task_hash}_{random_part}"


def _validate_download_token(token: str, task_id: str) -> bool:
    """校验下载令牌是否存在、匹配且未过期。"""
    if token not in _download_tokens:
        return False

    stored_task_id, expires_at = _download_tokens[token]
    if stored_task_id != task_id:
        return False

    if datetime.utcnow() >= expires_at:
        del _download_tokens[token]
        return False

    return True


def _create_download_token_for_task(
    task_id: str,
    lifetime_minutes: int = DEFAULT_DOWNLOAD_TOKEN_LIFETIME_MINUTES,
) -> str:
    """为某个任务创建并保存一个下载令牌。"""
    token = _generate_download_token(task_id)
    expires_at = datetime.utcnow() + timedelta(minutes=lifetime_minutes)
    _download_tokens[token] = (task_id, expires_at)

    # 令牌数量过多时，直接清空旧缓存，避免内存持续增长
    if len(_download_tokens) > 1000:
        _download_tokens.clear()

    return token


@router.post("/tasks", response_model=DownloadTaskStatusResponse)
async def create_download_task(
    payload: CreateDownloadTaskRequest,
    background_tasks: BackgroundTasks,
):
    """创建下载任务，并将异步拼接流程放入后台执行。"""
    try:
        _validate_tile_template(payload.tile_url_template)

        if len(payload.bbox) != 4:
            raise HTTPException(status_code=400, detail="bbox must have exactly 4 values")

        min_x, min_y, max_x, max_y = payload.bbox
        if not all(
            isinstance(v, (int, float)) and not math.isnan(v) and not math.isinf(v)
            for v in [min_x, min_y, max_x, max_y]
        ):
            raise HTTPException(status_code=400, detail="All bbox values must be finite numbers")

        crs = str(payload.bbox_crs or "").strip().upper()
        if crs not in {"EPSG:4326", "EPSG:3857", "EPSG4326", "EPSG3857", "4326", "3857"}:
            logger.warning("不支持的 CRS：%s，将按 EPSG:4326 处理", crs)

        os.makedirs(DEFAULT_OUTPUT_DIR, exist_ok=True)

        task_id = uuid.uuid4().hex
        output_path = os.path.join(DEFAULT_OUTPUT_DIR, f"{task_id}.tif")
        task = create_task(task_id, file_path=output_path)

        basemap_id = _extract_basemap_id(payload.tile_url_template)
        readable_filename = _build_readable_filename(
            basemap_id=basemap_id,
            resolution_m=payload.resolution_m,
            created_at=task.created_at,
        )

        _download_task_metadata[task_id] = {
            "tile_url_template": payload.tile_url_template,
            "basemap_id": basemap_id,
            "resolution_m": payload.resolution_m,
            "created_at": task.created_at,
            "readable_filename": readable_filename,
        }

        logger.info(
            "创建下载任务：%s | 底图：%s | CRS：%s | 分辨率：%s",
            task_id,
            payload.tile_url_template[:50],
            crs,
            payload.resolution_m,
        )

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
        logger.exception("创建下载任务失败：%s", str(exc))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create task: {str(exc)[:100]}",
        )


@router.get("/tasks/{task_id}", response_model=DownloadTaskStatusResponse)
def get_download_task(task_id: str):
    """查询任务状态。"""
    task = get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")
    return _build_status_response(task)


@router.get("/tasks/{task_id}/file")
def download_task_file(task_id: str, token: Optional[str] = None):
    """下载任务完成后的 GeoTIFF 文件。"""
    task = get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")

    # 如果传入了令牌，则按浏览器直链下载模式校验
    if token and not _validate_download_token(token, task_id):
        logger.warning("任务 %s 的下载令牌无效或已过期", task_id)
        raise HTTPException(
            status_code=401,
            detail="Download token is invalid or expired. Please request a new token.",
        )

    expires_at, _, is_expired = _get_expiration(task)
    if is_expired:
        raise HTTPException(
            status_code=410,
            detail=(
                f"Task expired on {expires_at.isoformat()}. "
                f"Tasks are kept for {DEFAULT_TASK_TTL_MINUTES} minutes."
            ),
        )

    if task.status != "success":
        raise HTTPException(
            status_code=400,
            detail=f"Task is not ready. Current status: {task.status}. Message: {task.message}",
        )

    if not task.file_path or not os.path.exists(task.file_path):
        logger.error("任务 %s 的输出文件缺失：%s", task_id, task.file_path)
        raise HTTPException(
            status_code=500,
            detail="Output file not found on server. Task may have been cleaned up.",
        )

    file_size = os.path.getsize(task.file_path)
    logger.info("下载任务文件：%s | 路径：%s | 大小：%d 字节", task_id, task.file_path, file_size)

    # 优先使用创建任务时缓存的可读文件名，失败时回退到 task_id
    filename = _build_download_filename(task_id)

    # 使用 RFC 5987 编码，保证不同浏览器都能正确识别中文/特殊字符文件名
    filename_encoded = quote(filename.encode("utf-8"), safe="")
    content_disposition = f"attachment; filename*=UTF-8''{filename_encoded}"

    return FileResponse(
        task.file_path,
        media_type="image/tiff",
        filename=filename,
        headers={
            "Content-Disposition": content_disposition,
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


async def _process_download_task(
    task_id: str,
    payload: CreateDownloadTaskRequest,
    output_path: str,
) -> None:
    """执行瓦片下载与 GeoTIFF 拼接，并持续更新任务状态。"""
    logger.info(
        "开始执行下载任务：%s | 底图：%s | CRS：%s | 分辨率：%s",
        task_id,
        payload.tile_url_template[:50],
        payload.bbox_crs,
        payload.resolution_m,
    )

    update_task(task_id, status="downloading", progress=5, message="正在下载瓦片")

    progress_state = {"last": 0}

    async def report_progress(done: int, total: int, phase: str) -> None:
        """向任务状态回写进度。"""
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
            message=f"正在下载瓦片 {done}/{total}",
        )

    try:
        # 将输入范围统一转换为 EPSG:4326，方便后续切片计算
        bbox_4326 = _normalize_bbox(payload.bbox, payload.bbox_crs)
        if not bbox_4326 or len(bbox_4326) != 4:
            raise ValueError(f"Invalid normalized bbox: {bbox_4326}")

        logger.debug("标准化后的 bbox：%s", bbox_4326)

        result = await build_geotiff_from_tiles(
            payload.tile_url_template,
            bbox_4326,
            payload.resolution_m,
            output_path,
            progress_callback=report_progress,
        )

        logger.info(
            "下载完成：%s | 已下载瓦片：%d/%d | 输出：%s",
            task_id,
            result.get("downloaded_tiles", 0),
            result.get("tile_count", 0),
            output_path,
        )

        update_task(task_id, status="stitching", progress=96, message="正在整理 GeoTIFF")

        if not os.path.exists(output_path):
            raise FileNotFoundError(f"Output file not created: {output_path}")

        file_size = os.path.getsize(output_path)
        if file_size == 0:
            raise ValueError(f"Output file is empty: {output_path}")

        logger.info("输出文件校验通过：%s | 大小：%d 字节", output_path, file_size)

        update_task(task_id, status="success", progress=100, message="Ready")
    except Exception as exc:
        logger.exception("下载任务失败：%s | 错误：%s", task_id, str(exc))
        error_msg = str(exc)[:200]
        update_task(task_id, status="failed", progress=0, message=error_msg)


def _build_status_response(task: DownloadTask) -> DownloadTaskStatusResponse:
    """组装适合轮询接口返回的任务状态数据。"""
    expires_at, expires_in, is_expired = _get_expiration(task)
    status = "expired" if is_expired else task.status
    file_ready = bool(status == "success" and task.file_path and os.path.exists(task.file_path))

    download_token = None
    if file_ready:
        download_token = _create_download_token_for_task(task.id)

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
        download_token=download_token,
        download_token=download_token,
    )


def _validate_tile_template(template: str) -> None:
    """校验瓦片 URL 模板是否有效，且必须包含必要占位符。"""
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

    if "{-y}" in template:
        logger.warning("模板使用了 {-y} 占位符，但当前版本不支持：%s", template[:50])
        raise HTTPException(
            status_code=400,
            detail="The {-y} placeholder style is not supported. Use {y} instead.",
        )


def _normalize_bbox(bbox: List[float], bbox_crs: str) -> tuple[float, float, float, float]:
    """将边界框标准化，并在必要时转换为 EPSG:4326。"""
    if len(bbox) != 4:
        raise HTTPException(status_code=400, detail="bbox must have 4 numbers")

    min_x, min_y, max_x, max_y = bbox

    # 先保证最小值在前，避免用户传入反向范围
    if min_x > max_x:
        min_x, max_x = max_x, min_x
    if min_y > max_y:
        min_y, max_y = max_y, min_y

    crs = str(bbox_crs or "").strip().upper()
    if crs in {"EPSG:3857", "EPSG3857", "3857"}:
        return _bbox_3857_to_4326(min_x, min_y, max_x, max_y)

    # 默认按 WGS84 处理，并做范围裁剪
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
    """将 EPSG:3857(Web Mercator) 边界框转换为 EPSG:4326。"""
    def to_lonlat(x: float, y: float) -> tuple[float, float]:
        """将单个点从 EPSG:3857 转换为 EPSG:4326。"""
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
    """计算任务的过期时间、剩余秒数与是否过期。"""
    expires_at = task.created_at + timedelta(minutes=DEFAULT_TASK_TTL_MINUTES)
    now = datetime.utcnow()
    expires_in = max(0, int((expires_at - now).total_seconds()))
    return expires_at, expires_in, now >= expires_at


def _clamp(value: float, min_value: float, max_value: float) -> float:
    """将数值限制在指定区间内。"""
    return max(min_value, min(value, max_value))


def _extract_basemap_id(tile_url_template: str) -> str:
    """从瓦片请求模板中提取底图标识，优先使用请求域名。"""
    raw = str(tile_url_template or "").strip()
    if not raw:
        return "basemap"

    parsed = urlparse(raw)
    host = (parsed.hostname or parsed.netloc or "").strip()

    # 如果模板缺少协议，urlparse 可能无法正确识别域名，这里做一次补救
    if not host and raw.startswith("//"):
        parsed = urlparse(f"https:{raw}")
        host = (parsed.hostname or parsed.netloc or "").strip()

    if not host:
        # 再兜底一次：从 URL 前缀里粗略提取主机段
        match = re.match(r"^(?:https?://)?([^/?:]+)", raw, flags=re.IGNORECASE)
        if match:
            host = match.group(1).strip()

    host = host.lower()
    host = re.sub(r"[^a-z0-9.\-]+", "_", host)
    host = host.strip("._-")
    return host or "basemap"


def _format_resolution_for_filename(resolution_m: float) -> str:
    """将分辨率格式化为适合文件名的字符串。"""
    value = f"{resolution_m:g}"
    value = value.replace(" ", "")
    return f"{value}m"


def _build_readable_filename(
    basemap_id: str,
    resolution_m: float,
    created_at: datetime,
) -> str:
    """生成可读的导出文件名。"""
    timestamp = created_at.strftime("%m_%d_%H")
    safe_basemap = _sanitize_filename_component(basemap_id)
    safe_resolution = _sanitize_filename_component(_format_resolution_for_filename(resolution_m))
    return f"{safe_basemap}_{safe_resolution}_{timestamp}.tif"


def _sanitize_filename_component(value: str) -> str:
    """清理文件名片段中的非法或不友好字符。"""
    text = str(value or "").strip()
    text = re.sub(r"[\\/:*?\"<>|]+", "_", text)
    text = re.sub(r"\s+", "_", text)
    text = re.sub(r"_+", "_", text)
    return text.strip("._-") or "basemap"


def _build_download_filename(task_id: str) -> str:
    """根据任务元数据生成最终下载文件名。"""
    meta = _download_task_metadata.get(task_id, {})
    readable_filename = meta.get("readable_filename")
    if readable_filename:
        return readable_filename

    # 如果元数据丢失，则回退为任务 ID，确保至少可以正常下载
    return f"basemap_{task_id}.tif"
