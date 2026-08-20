from __future__ import annotations

import asyncio
import logging
import math
import os
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from urllib.parse import quote, urlparse

# 北京时间（UTC+8）
_BEIJING_TZ = timezone(timedelta(hours=8))

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from api.auth import require_login
from api.auth.constants import resolve_quota_subject
from api.auth.quota import (
    _consume_api_quota_sync,
    _refund_api_quota_sync,
    estimate_download_cost,
    get_user_quota_snapshot_sync,
)
from api.auth.system_config import _get_system_config_value_sync
from config import get_bool, get_int, get_str
from utils.net_guard import is_disallowed_host
from .download_task import DownloadTask, create_task, get_task, update_task, list_active_tasks_by_user
from .tile_engine import MAX_CONCURRENCY, MAX_LATITUDE, WEB_MERCATOR_EXTENT, bbox4326_to_tile_range, build_geotiff_from_tiles, clip_geotiff_to_bbox, resolution_to_zoom

logger = logging.getLogger(__name__)

# 下载器内网放行独立开关（V3.5.24）：与 /proxy 面的 PROXY_ALLOW_PRIVATE_HOSTS 解耦，
# 避免共用配置互相影响（proxy 的白名单是收紧语义）。默认关闭=拒绝内网/本机目标。
_DOWNLOAD_ALLOW_PRIVATE_HOSTS = get_bool("DOWNLOAD_ALLOW_PRIVATE_HOSTS", False)


def _format_file_size(size_bytes: int) -> str:
    """将字节数转换为可读的文件大小格式（B/KB/MB/GB/TB）。"""
    size = float(size_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024:
            return f"{size:.2f} {unit}" if unit != "B" else f"{int(size)} {unit}"
        size /= 1024
    return f"{size:.2f} TB"

router = APIRouter(prefix="/api/download", tags=["Download"])

DEFAULT_OUTPUT_DIR = get_str("DOWNLOAD_OUTPUT_DIR")
DEFAULT_TASK_TTL_MINUTES = get_int("DOWNLOAD_TASK_TTL_MINUTES", 30, minimum=1, maximum=24 * 60)

# 下载任务取消标志缓存：{task_id: True}，用于 report_progress 快速检查，避免逐瓦片 DB 查询
_cancelled_tasks: Dict[str, bool] = {}

# 下载任务附加元数据缓存：用于生成更可读的下载文件名
# key 为 task_id，value 为元数据字典，过期后由清理逻辑移除
_download_task_metadata: Dict[str, dict] = {}


class CreateDownloadTaskRequest(BaseModel):
    """下载任务请求参数。"""

    tile_url_template: str = Field(..., min_length=1, max_length=500)
    bbox: List[float] = Field(..., min_items=4, max_items=4)
    resolution_m: float = Field(..., gt=0.3, le=1000)
    bbox_crs: str = Field(default="EPSG:4326", min_length=1, max_length=50)
    clip_to_extent: bool = Field(default=False)
    basemap_name: Optional[str] = Field(default=None, max_length=100, description="前端传入的底图显示名称，用于生成可读文件名")


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
    # 新增字段：瓦片数与时间估算
    tile_count: Optional[int] = None
    tiles_downloaded: Optional[int] = None
    estimated_total_seconds: Optional[int] = None
    estimated_remaining_seconds: Optional[int] = None
    # 底图名称（前端传入，用于显示与文件命名）
    basemap_name: Optional[str] = None


class DownloadTaskListResponse(BaseModel):
    tasks: List[DownloadTaskStatusResponse]


@router.post("/tasks", response_model=DownloadTaskStatusResponse)
async def create_download_task(
    payload: CreateDownloadTaskRequest,
    background_tasks: BackgroundTasks,
    _current_user: dict = Depends(require_login),
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

        # 绑定当前用户 username
        current_username = _current_user.get("username") or None

        # 估算瓦片数与下载耗时
        tile_count = _estimate_tile_count(payload.bbox, payload.resolution_m)
        estimated_seconds = _estimate_duration(tile_count)

        # 下载配额校验：使用统一 API 配额池，下载消耗 = ceil(tile_count / tiles_per_unit)
        # 提交时预扣估算额度，任务完成后按实际瓦片数多退少补；失败/取消时退还
        download_cost = estimate_download_cost(tile_count)
        user_role = _current_user.get("role") or ""
        quota_subject = resolve_quota_subject(current_username, user_role, _current_user.get("guest_uid"))
        quota_snapshot = get_user_quota_snapshot_sync(current_username, user_role, quota_subject)
        if quota_snapshot["remaining"] is not None and quota_snapshot["remaining"] < download_cost:
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "DOWNLOAD_QUOTA_INSUFFICIENT",
                    "message": f"API 配额不足（需要 {download_cost}，当前剩余 {quota_snapshot['remaining']}）。请联系管理员。",
                    "cost": download_cost,
                    "remaining": quota_snapshot["remaining"],
                    "limit": quota_snapshot["limit"],
                    "used": quota_snapshot["used"],
                },
            )

        # 预扣估算额度（管理员不受配额限制，无需预扣）
        pre_deducted = 0
        if quota_snapshot["remaining"] is not None:
            consume_result = _consume_api_quota_sync(
                current_username, user_role, quota_subject=quota_subject,
                cost=download_cost, action="download",
            )
            if not consume_result["allowed"]:
                # 扣减失败（理论上不会发生，因为已校验），回退
                logger.warning("预扣下载配额失败：用户=%s | 任务=%s", current_username, task_id)
                raise HTTPException(
                    status_code=429,
                    detail={
                        "code": "DOWNLOAD_QUOTA_INSUFFICIENT",
                        "message": "配额扣减失败，请稍后重试。",
                        "cost": download_cost,
                        "remaining": quota_snapshot["remaining"],
                    },
                )
            pre_deducted = download_cost
            logger.info(
                "预扣下载配额：用户=%s | 预扣=%d | 任务=%s | 剩余=%s",
                current_username, pre_deducted, task_id, consume_result["remaining"],
            )

        task = create_task(
            task_id,
            file_path=output_path,
            username=current_username,
            tile_count=tile_count,
            estimated_seconds=estimated_seconds,
            basemap_name=payload.basemap_name,
        )

        basemap_id = _extract_basemap_id(payload.tile_url_template)
        readable_filename = _build_readable_filename(
            basemap_id=basemap_id,
            resolution_m=payload.resolution_m,
            created_at=task.created_at,
            basemap_name=payload.basemap_name,
        )

        _download_task_metadata[task_id] = {
            "tile_url_template": payload.tile_url_template,
            "basemap_id": basemap_id,
            "resolution_m": payload.resolution_m,
            "created_at": task.created_at,
            "readable_filename": readable_filename,
        }

        logger.info(
            "创建下载任务：%s | 底图：%s | CRS：%s | 分辨率：%s | 用户：%s | 瓦片数：%d | 预计耗时：%ds",
            task_id,
            payload.tile_url_template[:50],
            crs,
            payload.resolution_m,
            current_username,
            tile_count,
            estimated_seconds,
        )

        background_tasks.add_task(
            _process_download_task,
            task_id,
            payload,
            output_path,
            current_username,
            user_role,
            quota_subject,
            tile_count,
            pre_deducted,
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


@router.get("/estimate-tiles")
async def estimate_tile_count(
    bbox: str = "",
    resolution_m: float = 0,
    _current_user: dict = Depends(require_login),
):
    """根据 bbox + 分辨率估算瓦片总数（与任务提交时使用相同算法）。

    bbox 格式："minLon,minLat,maxLon,maxLat"
    """
    try:
        parts = [float(x.strip()) for x in bbox.split(",") if x.strip()]
        if len(parts) != 4:
            raise HTTPException(status_code=400, detail="bbox 格式错误，需要 4 个数值：minLon,minLat,maxLon,maxLat")
        tile_count = _estimate_tile_count(parts, resolution_m)
        return {"status": "success", "tile_count": tile_count}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"估算失败：{str(exc)[:100]}")
@router.get("/tasks/{task_id}")
def get_download_task(
    task_id: str,
    _current_user: dict = Depends(require_login),
):
    """查询任务状态。任何登录用户均可查询。"""
    task = get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")
    return _build_status_response(task)


@router.post("/tasks/{task_id}/cancel")
def cancel_download_task(
    task_id: str,
    _current_user: dict = Depends(require_login),
):
    """取消下载任务。前端停止轮询/重置任务时调用，通知后端中止执行。"""
    task = get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")
    # 已终态的任务无需取消
    if task.status in ("success", "failed", "expired", "cancelled"):
        return {"task_id": task_id, "status": task.status, "cancelled": False}
    # 设置内存取消标志，使 report_progress 无需 DB 查询即可中止
    _cancelled_tasks[task_id] = True
    update_task(task_id, status="cancelled", message="任务已被用户取消")
    logger.info("下载任务已取消：%s", task_id)
    return {"task_id": task_id, "status": "cancelled", "cancelled": True}


@router.get("/tasks/{task_id}/file")
def download_task_file(task_id: str):
    """下载任务完成后的 GeoTIFF 文件。

    安全模型：仅需有效 task_id 即可下载，无需登录、不校验归属。
    配额在提交任务时已扣除，下载环节不再校验。
    """
    task = get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")

    expires_at, _, is_expired = _get_expiration(task)
    if is_expired:
        ttl_minutes = _get_task_ttl_minutes()
        raise HTTPException(
            status_code=410,
            detail=(
                f"Task expired on {expires_at.isoformat()}. "
                f"Tasks are kept for {ttl_minutes} minutes."
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
    logger.info("下载任务文件：%s | 路径：%s | 大小：%s", task_id, task.file_path, _format_file_size(file_size))

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
    current_username: Optional[str] = None,
    user_role: str = "",
    quota_subject: Optional[str] = None,
    estimated_tile_count: int = 0,
    pre_deducted: int = 0,
) -> None:
    """执行瓦片下载与 GeoTIFF 拼接，并持续更新任务状态。

    配额逻辑：提交时已预扣估算额度；任务成功后按实际瓦片数多退少补；失败/取消时退还预扣额度。
    """
    logger.info(
        "开始执行下载任务：%s | 底图：%s | CRS：%s | 分辨率：%s",
        task_id,
        payload.tile_url_template[:50],
        payload.bbox_crs,
        payload.resolution_m,
    )

    # === 执行前检查：任务已被取消则直接中止，避免无意义执行 ===
    existing = get_task(task_id)
    if existing and existing.status == "cancelled":
        logger.info("下载任务 %s 已被取消，跳过执行", task_id)
        return

    update_task(task_id, status="downloading", progress=5, message="正在下载瓦片")

    _last_progress_write = 0  # 时间戳节流，避免逐瓦片写 DB

    async def report_progress(done: int, total: int, phase: str) -> None:
        """向任务状态回写进度，并检查是否已被取消。"""
        nonlocal _last_progress_write
        # 检查内存取消标志，避免逐瓦片 DB 查询
        if _cancelled_tasks.get(task_id):
            raise asyncio.CancelledError("任务已被用户取消")
        if total <= 0:
            return
        # 时间节流：最多每 300ms 写一次 DB（远快于前端 1.5s 轮询，保证实时性）
        now = time.monotonic()
        if now - _last_progress_write < 0.3:
            return
        _last_progress_write = now
        ratio = done / total
        progress = min(95, max(5, int(ratio * 90) + 5))
        update_task(
            task_id,
            status="downloading",
            progress=progress,
            tiles_downloaded=done,
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
            progress_step=0,
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

        logger.info("输出文件校验通过：%s | 大小：%s", output_path, _format_file_size(file_size))

        # 按用户选择裁剪到精确范围
        clip_message = ""
        if payload.clip_to_extent:
            try:
                update_task(task_id, status="stitching", progress=98, message="正在裁剪到精确范围")
                clip_geotiff_to_bbox(output_path, bbox_4326)
                clipped_size = os.path.getsize(output_path)
                clip_message = "（已裁剪到精确范围）"
                logger.info(
                    "裁剪完成：%s | 裁剪前：%s | 裁剪后：%s",
                    output_path, _format_file_size(file_size), _format_file_size(clipped_size),
                )
            except Exception as clip_exc:
                logger.warning("裁剪失败，保留原始范围：%s", str(clip_exc))
                clip_message = "（裁剪失败，保留瓦片对齐范围）"

        # 下载成功：记录实际瓦片数（复用已有的 task 对象，避免重复查询）
        actual_tiles = result.get("downloaded_tiles", existing.tile_count if existing else 0)
        update_task(task_id, tiles_downloaded=actual_tiles)

        update_task(
            task_id,
            status="success",
            progress=100,
            message=f"Ready{clip_message}",
        )
        _cancelled_tasks.pop(task_id, None)

        # 下载成功：按实际瓦片数多退少补
        actual_cost = estimate_download_cost(actual_tiles)
        if actual_cost <= pre_deducted:
            # 实际消耗 ≤ 预扣：退还差额（实际为 0 时全额退还）
            refund = pre_deducted - actual_cost
            if refund > 0:
                _refund_api_quota_sync(
                    current_username, user_role, amount=refund, quota_subject=quota_subject,
                )
                logger.info(
                    "下载配额多退少补（退还差额）：用户=%s | 预扣=%d | 实扣=%d | 退还=%d | 任务=%s",
                    current_username, pre_deducted, actual_cost, refund, task_id,
                )
            else:
                logger.info(
                    "下载配额扣减完成（预扣=实扣）：用户=%s | 扣除=%d | 任务=%s",
                    current_username, actual_cost, task_id,
                )
        else:
            # 实际消耗 > 预扣：补扣差额
            extra = actual_cost - pre_deducted
            consume_result = _consume_api_quota_sync(
                current_username, user_role, quota_subject=quota_subject,
                cost=extra, action="download",
            )
            if not consume_result["allowed"]:
                logger.warning(
                    "下载配额补扣失败（用户配额已耗尽）：用户=%s | 任务=%s | 应补扣=%d",
                    current_username, task_id, extra,
                )
            else:
                logger.info(
                    "下载配额多退少补（补扣差额）：用户=%s | 预扣=%d | 实扣=%d | 补扣=%d | 任务=%s",
                    current_username, pre_deducted, actual_cost, extra, task_id,
                )
    except asyncio.CancelledError:
        # 用户取消：清理半成品文件，退还预扣额度
        logger.info("下载任务 %s 被用户取消，清理半成品文件", task_id)
        if output_path and os.path.exists(output_path):
            try:
                os.remove(output_path)
            except OSError:
                pass
        if pre_deducted > 0:
            _refund_api_quota_sync(
                current_username, user_role, amount=pre_deducted, quota_subject=quota_subject,
            )
            logger.info("下载任务取消，已退还预扣配额：用户=%s | 退还=%d | 任务=%s", current_username, pre_deducted, task_id)
        _cancelled_tasks.pop(task_id, None)
    except Exception as exc:
        logger.exception("下载任务失败：%s | 错误：%s", task_id, str(exc))
        error_msg = str(exc)[:200]
        update_task(task_id, status="failed", progress=0, message=error_msg)
        # 任务失败：退还预扣额度
        if pre_deducted > 0:
            _refund_api_quota_sync(
                current_username, user_role, amount=pre_deducted, quota_subject=quota_subject,
            )
            logger.info("下载任务失败，已退还预扣配额：用户=%s | 退还=%d | 任务=%s", current_username, pre_deducted, task_id)
        _cancelled_tasks.pop(task_id, None)


def _build_status_response(task: DownloadTask) -> DownloadTaskStatusResponse:
    """组装适合轮询接口返回的任务状态数据。"""
    expires_at, expires_in, is_expired = _get_expiration(task)
    status = "expired" if is_expired else task.status
    file_ready = bool(status == "success" and task.file_path and os.path.exists(task.file_path))

    # 动态修正剩余时间（基于实际速率）
    # 注意：下载初期（elapsed < 10s 或 progress < 5%）速率不稳定，使用静态估算避免误导
    estimated_remaining = None
    now = datetime.now(_BEIJING_TZ)
    if task.status in ("downloading", "stitching") and task.progress > 5:
        created_at = task.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=_BEIJING_TZ)
        elapsed = (now - created_at).total_seconds()
        if elapsed > 10:
            rate = task.progress / elapsed  # %/s
            estimated_remaining = max(0, int((100 - task.progress) / rate))
    elif task.estimated_seconds and task.status == "pending":
        estimated_remaining = task.estimated_seconds

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
        tile_count=task.tile_count,
        tiles_downloaded=task.tiles_downloaded,
        estimated_total_seconds=task.estimated_seconds,
        estimated_remaining_seconds=estimated_remaining,
        basemap_name=task.basemap_name,
    )


@router.get("/tasks", response_model=DownloadTaskListResponse)
async def list_my_tasks(
    _current_user: dict = Depends(require_login),
):
    """获取当前用户的有效任务列表（自动过滤过期任务）"""
    username = _current_user.get("username")
    if not username:
        raise HTTPException(status_code=401, detail="需要登录")
    tasks = await asyncio.to_thread(_get_active_tasks_by_user, username)
    return {"tasks": [_build_status_response(t) for t in tasks]}


def _get_active_tasks_by_user(username: str) -> List[DownloadTask]:
    """获取用户未过期的有效任务"""
    ttl = _get_task_ttl_minutes()
    cutoff = datetime.now(_BEIJING_TZ) - timedelta(minutes=ttl)
    return list_active_tasks_by_user(username, cutoff)


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

    # P1-4 SSRF S1：补协议与内网目标校验——此前只校验占位符，已登录用户可让服务器
    # 抓取任意内网 URL 并把响应写进 GeoTIFF 回传（信息回传型 SSRF）。
    # host 判定走 utils/net_guard 单点（与 /proxy/** 及 agent override 同一实现）；
    # V3.5.24：DOWNLOAD_ALLOW_PRIVATE_HOSTS=true 时放行内网/本机目标（自建内网瓦片源场景）。
    probe_url = template.replace("{z}", "0").replace("{x}", "0").replace("{y}", "0")
    probe_url = probe_url.replace("{s}", "a").replace("{-y}", "0")
    # 无协议前缀（`tile.example.com/...`）与协议相对（`//host/...`）按 https 兜底解析，
    # 与 api/proxy._build_proxy_target_url 同语义——保持既有宽松输入不被本次校验打断
    if "//" not in probe_url.split("?", 1)[0]:
        probe_url = f"https://{probe_url.lstrip('/')}"
    elif probe_url.startswith("//"):
        probe_url = f"https:{probe_url}"
    parsed_template = urlparse(probe_url)
    if (parsed_template.scheme or "").lower() not in {"http", "https"}:
        raise HTTPException(
            status_code=400,
            detail="tile_url_template must use http:// or https:// (other schemes are not allowed)",
        )
    if not _DOWNLOAD_ALLOW_PRIVATE_HOSTS and is_disallowed_host(parsed_template.hostname or ""):
        logger.warning("底图下载模板指向内网/本机（未开启 DOWNLOAD_ALLOW_PRIVATE_HOSTS），已拒绝：%s", template[:80])
        raise HTTPException(
            status_code=400,
            detail="tile_url_template 指向内网或本机地址，已拒绝。",
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


def _estimate_tile_count(bbox: List[float], resolution_m: float) -> int:
    """根据 bbox + 分辨率估算瓦片总数"""
    if not resolution_m or resolution_m <= 0:
        return 0
    zoom = resolution_to_zoom(resolution_m, lat_deg=(bbox[1] + bbox[3]) / 2)
    min_x, max_x, min_y, max_y = bbox4326_to_tile_range(tuple(bbox), zoom)
    return (max_x - min_x + 1) * (max_y - min_y + 1)


def _estimate_duration(tile_count: int) -> int:
    """估算下载总耗时（秒）

    模型：
      - 单瓦片下载耗时 ≈ 0.1s（含网络延迟 + 解码）
      - 并发数 = 10（MAX_CONCURRENCY）
      - 安全系数 = 1.5（应对网络波动）
      - 拼接固定开销 = 30s
    """
    download_time = (tile_count / MAX_CONCURRENCY) * 0.1 * 1.5
    return int(download_time + 30)


def _get_task_ttl_minutes() -> int:
    """从 L2 system_config 读取 TTL，fallback 到 L1 env，最终默认 30 分钟"""
    raw = _get_system_config_value_sync("download_task_ttl_minutes", "")
    if raw:
        try:
            return max(1, min(1440, int(raw)))
        except (ValueError, TypeError):
            pass
    return DEFAULT_TASK_TTL_MINUTES  # L1 env fallback


def _get_expiration(task: DownloadTask) -> tuple[datetime, int, bool]:
    """计算任务的过期时间、剩余秒数与是否过期。

    使用 updated_at（最后进度回写时间）而非 created_at 作为基准，
    保证下载中的任务每次回写进度都会续命，只有真正卡死/被遗忘的任务才会过期。
    TTL 从 L2 system_config 动态读取，管理员面板修改后立即生效。
    """
    last_active = task.updated_at if task.updated_at else task.created_at
    ttl_minutes = _get_task_ttl_minutes()
    expires_at = last_active + timedelta(minutes=ttl_minutes)
    now = datetime.now(_BEIJING_TZ)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=_BEIJING_TZ)
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
    basemap_name: Optional[str] = None,
) -> str:
    """生成可读的导出文件名。优先使用前端传入的显示名称。"""
    timestamp = created_at.strftime("%m_%d_%H")
    if basemap_name:
        safe_basemap = _sanitize_filename_component(basemap_name)
    else:
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
