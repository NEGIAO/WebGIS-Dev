"""
WebGIS Backend - FastAPI 主应用入口

功能模块：
- 瓦片代理：Google 卫星图瓦片代理 (api/proxy.py)
- 访客统计：地理位置统计功能 (api/statistics.py)
- 通用接口：新闻、数据处理、健康检查等
"""

import httpx
import pandas as pd
import logging
from typing import Any, Dict

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.proxy import router as proxy_router, build_http_client
from api.statistics import router as statistics_router
from api.auth import init_auth_storage, require_login, router as auth_router

# ==================== 日志配置 ====================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ==================== FastAPI 应用初始化 ====================

app = FastAPI(
    title="WebGIS Backend",
    description="WebGIS 后端 API 服务",
    version="0.1.0",
)

# ==================== CORS 中间件配置 ====================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "https://negiao.github.io",
        "https://ripzhoudi.github.io",
        "https://negiao-webgis.hf.space"  # 服务器自身域名（如需在线调试 Swagger UI 时也是此 Origin）
    ],
    allow_origin_regex="https?://.*",  # 允许所有 HTTP/HTTPS 源，适配你不固定的前端
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== 生命周期事件 ====================


@app.on_event("startup")
async def startup_event():
    """
    应用启动事件：初始化全局 HTTP 客户端
    """
    logger.info("WebGIS Backend 启动...")
    await init_auth_storage()
    # 为瓦片代理创建共享的异步 HTTP 客户端
    app.state.http_client = build_http_client()
    logger.info("HTTP 客户端初始化完成")


@app.on_event("shutdown")
async def shutdown_event():
    """
    应用关闭事件：清理资源
    """
    logger.info("WebGIS Backend 关闭...")
    client = getattr(app.state, "http_client", None)
    if client is not None:
        await client.aclose()
        logger.info("HTTP 客户端已关闭")


# ==================== 路由挂载 ====================

# 挂载瓦片代理路由
app.include_router(proxy_router)
logger.info("已注册瓦片代理路由")

# 挂载认证路由
app.include_router(auth_router)
logger.info("已注册认证路由")

# 挂载访客统计路由
app.include_router(statistics_router)
logger.info("已注册访客统计路由")

# --- 功能 1：简单的爬虫接口 ---
# 前端请求：/api/news
@app.get("/api/news")
async def get_external_news(_current_user: Dict[str, Any] = Depends(require_login)):
    url = "https://api.example.com/gis-news" # 假设的外部接口
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        # 这里可以对爬取的数据进行清洗
        return response.json()

# --- 功能 2：GIS 数据处理 (用 Pandas) ---
# 前端请求：/api/process-points
@app.get("/api/process-points")
async def process_gis_data(_current_user: Dict[str, Any] = Depends(require_login)):
    # 模拟一些原始坐标数据
    raw_data = [
        {"name": "点A", "lat": 30.5, "lng": 114.3},
        {"name": "点B", "lat": 30.6, "lng": 114.4}
    ]
    df = pd.DataFrame(raw_data)
    
    # 简单处理：比如给所有点加个“已处理”标记
    df['status'] = 'processed'
    
    return df.to_dict(orient="records")

# --- 功能 3：测试数据接口 ---
@app.get("/api/data")
async def get_test_data(_current_user: Dict[str, Any] = Depends(require_login)):
    return {
        "status": "success", 
        "message": "恭喜！后端已经收到请求",
        "data": [
            {"name": "测试点1", "value": 100},
            {"name": "测试点2", "value": 200}
        ]
    }

# --- 功能 4：健康检查 ---
@app.get("/")
@app.get("/health")
async def health_check():
    return {"status": "healthy", "message": "WebGIS Backend is Running!"}

# --- 功能 5：信息接口 ---
@app.get("/api/info")
async def get_api_info(_current_user: Dict[str, Any] = Depends(require_login)):
    return {
        "name": "WebGIS Backend",
        "version": "0.1.0",
        "description": "WebGIS 后端 API 服务",
        "endpoints": [
            "/api/auth/register - 注册普通用户",
            "/api/auth/login - 登录（游客/普通用户/管理员）",
            "/api/auth/me - 登录状态校验",
            "/api/auth/logout - 退出登录",
            "/api/auth/change-password - 修改当前账号密码",
            "/api/data - 测试数据",
            "/api/news - 新闻爬虫",
            "/api/process-points - GIS 数据处理",
            "/health - 健康检查"
        ]
    }