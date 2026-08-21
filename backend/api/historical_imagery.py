"""历史影像公开目录接口。"""

from fastapi import APIRouter

from services.historical_imagery import get_wayback_catalog

router = APIRouter(prefix="/api/historical-imagery", tags=["历史影像"])


@router.get("/esri-wayback/layers")
def list_esri_wayback_layers():
    """在线程池读取 SQLite 缓存，避免阻塞 FastAPI 事件循环。"""
    return {"code": 200, "message": "success", "data": get_wayback_catalog()}
