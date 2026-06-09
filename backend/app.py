"""
WebGIS Backend - FastAPI 主应用入口

功能模块：
- 瓦片代理：Google 卫星图瓦片代理 (api/proxy.py)
- 访客统计：地理位置统计功能 (api/statistics.py)
- 通用接口：新闻、数据处理、健康检查等
"""

import asyncio
import httpx
import logging
from contextlib import asynccontextmanager
from typing import Any, Dict

from utils.time_utils import get_beijing_now_str, hourly_chime_task

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from starlette.background import BackgroundTasks
from api.proxy import router as proxy_router, build_http_client
from api.external_proxy import router as external_proxy_router
from api.statistics import router as statistics_router
from api.location import router as location_router
from api.auth import init_auth_storage, router as auth_router
from api.admin import router as admin_router
from api.api_management import router as api_management_router
from api.api_keys_management import router as api_keys_router
from api.agent_chat import router as agent_chat_router, admin_router as agent_chat_admin_router
from download_xyz.download import router as download_router
from download_xyz.task_scheduler import start_task_cleanup_scheduler, shutdown_task_cleanup_scheduler
from download_xyz.download_task import init_download_task_db
from api.monitor import init_monitor_log_streaming, router as monitor_router
from api.spatial import router as spatial_router

# ==================== 日志配置 ====================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ==================== 统一响应模型 ====================


class ApiResponse(BaseModel):
    """统一 API 响应格式"""
    code: int = 200
    message: str = "success"
    data: Any = None


# ==================== 生命周期管理 ====================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期上下文管理器
    替代已废弃的 @app.on_event("startup") / @app.on_event("shutdown")
    """
    # ---- Startup ----
    logger.info("WebGIS Backend 启动... [北京时间: %s]", get_beijing_now_str())
    app.state.startup_error = None
    app.state.log_stream_mode = init_monitor_log_streaming()

    try:
        await init_auth_storage()
        logger.info("认证存储初始化成功 [北京时间: %s]", get_beijing_now_str())
    except Exception as e:
        logger.error("认证存储初始化失败: %s", str(e), exc_info=True)
        app.state.startup_error = f"数据库初始化失败: {str(e)}"

    try:
        init_download_task_db()
        logger.info("下载任务数据库初始化成功 [北京时间: %s]", get_beijing_now_str())
    except Exception as e:
        logger.error("下载任务数据库初始化失败: %s", str(e), exc_info=True)

    try:
        app.state.task_scheduler = start_task_cleanup_scheduler()
    except Exception as e:
        logger.error("任务调度器启动失败: %s", str(e), exc_info=True)

    app.state.http_client = build_http_client()
    logger.info("HTTP 客户端初始化完成 [北京时间: %s]", get_beijing_now_str())

    # 启动整点报时后台任务
    app.state.hourly_chime = asyncio.create_task(hourly_chime_task())
    logger.info("整点报时后台任务已创建 [北京时间: %s]", get_beijing_now_str())

    if app.state.startup_error:
        logger.warning("应用以降级模式启动: %s", app.state.startup_error)
    else:
        logger.info("WebGIS Backend 启动完成")

    yield
    # ---- Shutdown ----
    logger.info("WebGIS Backend 关闭... [北京时间: %s]", get_beijing_now_str())
    # 取消整点报时任务
    chime_task = getattr(app.state, "hourly_chime", None)
    if chime_task is not None:
        chime_task.cancel()
        try:
            await chime_task
        except asyncio.CancelledError:
            pass
        logger.info("整点报时后台任务已停止 [北京时间: %s]", get_beijing_now_str())

    scheduler = getattr(app.state, "task_scheduler", None)
    if scheduler is not None:
        shutdown_task_cleanup_scheduler(scheduler)

    # 关闭 IP 定位服务（释放连接池，打印缓存统计）
    from services import ip_geo_service
    await ip_geo_service.close()

    client = getattr(app.state, "http_client", None)
    if client is not None:
        await client.aclose()
        logger.info("HTTP 客户端已关闭")


# ==================== FastAPI 应用初始化 ====================


app = FastAPI(
    title="WebGIS Backend",
    description="WebGIS 后端 API 服务",
    version="0.1.0",
    lifespan=lifespan,
)

# ==================== CORS 中间件配置 ====================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # 允许所有来源
    allow_credentials=False,    
    allow_methods=["*"],
    allow_headers=["*"],
)
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=[
#         "http://localhost:5173",
#         "http://127.0.0.1:5173",
#         "http://localhost:4173",
#         "https://negiao.github.io",
#         "https://ripzhoudi.github.io",
#         "https://negiao-webgis.hf.space"  # 服务器自身域名（如需在线调试 Swagger UI 时也是此 Origin）
#     ],
#     allow_origin_regex="https?://.*",  # 允许所有 HTTP/HTTPS 源，适配不固定的前端
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# ==================== 启动状态检查中间件 ====================


@app.middleware("http")
async def check_startup_state(request: Request, call_next):
    """
    如果数据库初始化失败，尝试自动恢复后重试。
    恢复成功则清除降级状态继续处理；恢复失败则返回 503。
    """
    if getattr(request.app.state, "startup_error", None):
        # 健康检查、API 文档和信息服务不受影响
        allowlist = {"/", "/health", "/docs", "/redoc", "/openapi.json", "/api/info"}
        if request.url.path not in allowlist:
            # 尝试自动恢复：重新初始化认证存储
            try:
                await init_auth_storage()
                # 恢复成功，清除降级状态
                logger.info("数据库自动恢复成功，清除降级状态")
                request.app.state.startup_error = None
            except Exception as recovery_err:
                logger.error("数据库自动恢复失败: %s", str(recovery_err), exc_info=True)
                return JSONResponse(
                    status_code=503,
                    content={
                        "code": 503,
                        "message": "服务暂时不可用，请稍后重试",
                        "data": None,
                    },
                )
    return await call_next(request)


# ==================== 全局异常处理器 ====================


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """捕获所有未处理的异常，返回统一错误响应格式"""
    error_type = type(exc).__name__
    error_detail = str(exc)[:500]
    logger.error(
        "未处理异常 [%s %s]: %s: %s",
        request.method, request.url.path, error_type, error_detail,
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "code": 500,
            "message": "内部服务器错误",
            "error_type": error_type,
            "detail": error_detail,
            "data": None,
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """将 HTTPException 也包装为统一响应格式"""
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.status_code, "message": str(exc.detail), "data": None},
    )


# ==================== 路由挂载 ====================

_beijing_time = get_beijing_now_str()

# 挂载瓦片代理路由
app.include_router(proxy_router)
logger.info("已注册瓦片代理路由 [北京时间: %s]", _beijing_time)

# 挂载外部服务代理路由（高德/Nominatim/EPSG/IP）
app.include_router(external_proxy_router)
logger.info("已注册外部服务代理路由 [北京时间: %s]", _beijing_time)

# 挂载认证路由
app.include_router(auth_router)
logger.info("已注册认证路由 [北京时间: %s]", _beijing_time)

# 挂载访客统计路由
app.include_router(statistics_router)
logger.info("已注册访客统计路由 [北京时间: %s]", _beijing_time)

# 挂载位置服务路由
app.include_router(location_router)
logger.info("已注册位置服务路由 [北京时间: %s]", _beijing_time)

# 挂载管理员路由
app.include_router(admin_router)
logger.info("已注册管理员路由 [北京时间: %s]", _beijing_time)

# 挂载 API 管理路由
app.include_router(api_management_router)
logger.info("已注册 API 管理路由 [北京时间: %s]", _beijing_time)

# 挂载 API 密钥管理路由
app.include_router(api_keys_router)
logger.info("已注册 API 密钥管理路由 [北京时间: %s]", _beijing_time)

# 挂载 Agent 对话路由
app.include_router(agent_chat_router)
app.include_router(agent_chat_admin_router)
logger.info("已注册 Agent 对话路由 [北京时间: %s]", _beijing_time)

# 挂载下载任务路由
app.include_router(download_router)
logger.info("已注册下载任务路由 [北京时间: %s]", _beijing_time)

# 挂载监控路由
app.include_router(monitor_router)
logger.info("已注册监控路由 [北京时间: %s]", _beijing_time)

# 挂载空间分析路由
app.include_router(spatial_router)
logger.info("已注册空间分析路由 [北京时间: %s]", _beijing_time)

# --- 功能：健康检查 ---
@app.get("/")
@app.get("/health")
async def health_check():
    """功能：健康检查接口，用于探活与部署监控。"""
    return {"status": "healthy", "message": "WebGIS Backend is Running!"}

# --- 信息接口 ---
# 返回后端服务的概览信息和核心端点目录，方便前端调试和开发者了解 API 结构。
@app.get("/api/info")
async def get_api_info():
    """
    功能：动态扫描全量接口并提取函数注释。
    """
    api_list = []
    
    # 遍历 FastAPI 注册的所有路由
    for route in app.routes:
        # 确保是普通的 API 路由（排除静态文件或重定向路由）
        if hasattr(route, "endpoint") and hasattr(route, "path"):
            # 提取函数的 docstring (注释)
            # .strip() 用于去除首尾换行，split('\n')[0] 只取注释的第一行作为简述
            description = (route.endpoint.__doc__ or "暂无说明").strip().split('\n')[0]
            
            # 过滤掉一些不需要展示的系统级接口
            if route.path in ["/openapi.json", "/docs", "/redoc"]:
                continue
                
            methods = list(route.methods - {"HEAD", "OPTIONS"}) if route.methods else []
            
            api_list.append({
                "path": route.path,
                "methods": methods,
                "description": description
            })

    # 按照路径排序，方便查看
    api_list.sort(key=lambda x: x["path"])

    return {
        "name": "WebGIS Backend",
        "version": "0.1.0",
        "description": "WebGIS 后端 API 服务",
        "total_endpoints": len(api_list),
        "endpoints": api_list
    }
