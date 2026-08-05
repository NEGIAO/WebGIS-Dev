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
import re
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
import threading as _threading
from typing import Any, Dict

from config import build_public_config, get_settings, get_str, masked_summary

from utils.time_utils import hourly_chime_task

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from starlette.background import BackgroundTasks
from api.proxy import router as proxy_router, build_http_client
from api.external_proxy import router as external_proxy_router
from api.statistics import router as statistics_router
from api.location import router as location_router
from api.auth import init_auth_storage, router as auth_router, check_smtp_configured
from api.admin import router as admin_router
from api.api_management import router as api_management_router
from api.api_keys_management import router as api_keys_router, runtime_config_router
from api.agent_chat import router as agent_chat_router, admin_router as agent_chat_admin_router
from download_xyz.download import router as download_router
from download_xyz.task_scheduler import start_task_cleanup_scheduler, shutdown_task_cleanup_scheduler
from download_xyz.download_task import init_download_task_db
from api.monitor import init_monitor_log_streaming, router as monitor_router
from api.spatial import router as spatial_router

# ==================== 日志配置 ====================

_handler = logging.StreamHandler()
_log_level = getattr(logging, get_settings().log_level.upper(), logging.INFO)


class _SeqFormatter(logging.Formatter):
    """为每条日志记录前置全局递增序号（线程安全），方便 Docker 日志排序追踪。"""
    _counter = 0
    _lock = _threading.Lock()

    def format(self, record: logging.LogRecord) -> str:
        if not hasattr(record, "seq"):
            with self._lock:
                _SeqFormatter._counter += 1
                record.seq = _SeqFormatter._counter
        return f"[{record.seq:06d}] {super().format(record)}"


_LOG_FMT = "%(asctime)s [北京时间] - %(name)s - %(levelname)s - %(message)s"

_handler.setFormatter(_SeqFormatter(_LOG_FMT))
logging.basicConfig(level=_log_level, handlers=[_handler])
logger = logging.getLogger(__name__)
# 抑制 APScheduler 的 INFO 日志（每分钟任务运行状态噪音）
logging.getLogger("apscheduler").setLevel(logging.WARNING)


def _patch_uvicorn_logging_with_seq():
    """
    在模块加载时将 uvicorn logger 的 handler 换上 _SeqFormatter，
    使 uvicorn 自有日志与 app 日志格式一致。
    """
    for _lg_name in ("uvicorn", "uvicorn.error", "uvicorn.access", "uvicorn.asgi"):
        _lg = logging.getLogger(_lg_name)
        _seq_formatter = _SeqFormatter(_LOG_FMT)
        for _h in _lg.handlers:
            _h.setFormatter(_seq_formatter)
        # 无 handler 时添加一个（uvicorn 自身可能还未配置）
        if not _lg.handlers:
            _h = logging.StreamHandler()
            _h.setFormatter(_seq_formatter)
            _lg.addHandler(_h)


_patch_uvicorn_logging_with_seq()

# ==================== 统一响应模型 ====================


class ApiResponse(BaseModel):
    """统一 API 响应格式"""
    code: int = 200
    message: str = "success"
    data: Any = None


# ==================== 生命周期管理 ====================


def _mask_smtp_user() -> str:
    """脱敏 SMTP_USER 用于日志显示，只保留 @ 前首尾各 1 字符。"""
    smtp_user = get_settings().smtp_user
    if not smtp_user:
        return "(空)"
    if "@" in smtp_user:
        local, domain = smtp_user.split("@", 1)
        if len(local) <= 2:
            masked = local[0] + "*" * max(len(local) - 1, 1)
        else:
            masked = local[0] + "*" * (len(local) - 2) + local[-1]
        return f"{masked}@{domain}"
    return smtp_user[0] + "**" + smtp_user[-1] if len(smtp_user) > 4 else "***"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期上下文管理器
    替代已废弃的 @app.on_event("startup") / @app.on_event("shutdown")
    """
    # ---- Startup ----
    logger.info("WebGIS Backend 启动...")
    # 统一配置脱敏摘要（三层模型：L1 env / L2 Admin+DB / L3 HF Secrets）
    for line in masked_summary():
        logger.info("[配置] %s", line)
    app.state.startup_error = None
    app.state.log_stream_mode = init_monitor_log_streaming()

    try:
        await init_auth_storage()
        logger.info("认证存储初始化成功")
    except Exception as e:
        logger.error("认证存储初始化失败: %s", str(e), exc_info=True)
        app.state.startup_error = f"数据库初始化失败: {str(e)}"

    # SMTP 邮件服务配置检查
    if check_smtp_configured():
        logger.info("邮件服务已配置（SMTP: %s）", _mask_smtp_user())
    else:
        logger.warning(
            "邮件服务未配置：SMTP_USER/SMTP_PASSWORD 环境变量未设置，验证码功能不可用。"
            " 如需启用，请在环境变量中配置 SMTP_USER 和 SMTP_PASSWORD。"
        )

    try:
        init_download_task_db()
        logger.info("下载任务数据库初始化成功")
    except Exception as e:
        logger.error("下载任务数据库初始化失败: %s", str(e), exc_info=True)

    try:
        app.state.task_scheduler = start_task_cleanup_scheduler()
    except Exception as e:
        logger.error("任务调度器启动失败: %s", str(e), exc_info=True)

    app.state.http_client = build_http_client()
    logger.info("HTTP 客户端初始化完成")

    # 启动整点报时后台任务（记录启动时间，报时时展示已运行时长）
    _startup_time = datetime.now().astimezone()
    app.state.hourly_chime = asyncio.create_task(hourly_chime_task(startup_time=_startup_time))
    logger.info("整点报时后台任务已创建")

    if app.state.startup_error:
        logger.warning("应用以降级模式启动: %s", app.state.startup_error)
    else:
        logger.info("WebGIS Backend 启动完成")

    yield
    # ---- Shutdown ----
    logger.info("WebGIS Backend 关闭...")
    # 取消整点报时任务
    chime_task = getattr(app.state, "hourly_chime", None)
    if chime_task is not None:
        chime_task.cancel()
        try:
            await chime_task
        except asyncio.CancelledError:
            pass
        logger.info("整点报时后台任务已停止")

    scheduler = getattr(app.state, "task_scheduler", None)
    if scheduler is not None:
        try:
            shutdown_task_cleanup_scheduler(scheduler)
        except Exception as e:
            logger.warning("任务调度器关闭异常: %s", e)
        logger.info("任务调度器已停止")

    # 关闭 IP 定位服务（释放连接池，打印缓存统计）
    try:
        from services import ip_geo_service
        await ip_geo_service.close()
    except Exception as e:
        logger.warning("IP 定位服务关闭异常: %s", e)

    try:
        client = getattr(app.state, "http_client", None)
        if client is not None:
            await client.aclose()
            logger.info("HTTP 客户端已关闭")
    except Exception as e:
        logger.warning("HTTP 客户端关闭异常: %s", e)


# ==================== FastAPI 应用初始化 ====================


def _read_app_version() -> str:
    """从仓库根 README.md 提取当前版本号（与前端 __APP_VERSION__ 同源）。"""
    readme_path = Path(__file__).resolve().parent.parent / "README.md"
    try:
        content = readme_path.read_text(encoding="utf-8")
        match = re.search(r"当前版本[^\d]*(\d+\.\d+\.\d+)", content)
        if match:
            return f"V{match[1]}"
    except Exception:
        pass
    return "V0.0.0"


app = FastAPI(
    title="WebGIS Backend",
    description="WebGIS 后端 API 服务",
    version=_read_app_version(),
    lifespan=lifespan,
)

# ==================== CORS 中间件配置 ====================

# CORS 来源白名单经统一 loader 读取（L1 key: CORS_ALLOWED_ORIGINS，逗号分隔）；
# 留空 = ["*"] 兼容旧行为；生产 HF Variables 建议配置 Pages 域名 + localhost（P1-1）。
_cors_raw = get_str("CORS_ALLOWED_ORIGINS", "")
_cors_origins = [item.strip().rstrip("/") for item in _cors_raw.split(",") if item.strip()] or ["*"]
if _cors_origins != ["*"]:
    logger.info("CORS 白名单已启用（%d 个来源）：%s", len(_cors_origins), ", ".join(_cors_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== 启动状态检查中间件 ====================


@app.middleware("http")
async def check_startup_state(request: Request, call_next):
    """
    确保认证存储已初始化，并在降级模式下尝试自动恢复。
    - 正常路径：init_auth_storage() 仅做一次布尔检查即返回。
    - 降级路径：尝试重新初始化认证存储，恢复成功则继续处理。
    """
    allowlist = {"/", "/health", "/docs", "/redoc", "/openapi.json", "/api/info"}
    if request.url.path in allowlist:
        return await call_next(request)

    if getattr(request.app.state, "startup_error", None):
        # 尝试自动恢复：重新初始化认证存储
        try:
            await init_auth_storage()
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
    else:
        # 正常路径：幂等检查，_auth_storage_ready=True 时直接返回
        try:
            await init_auth_storage()
        except Exception as storage_err:
            logger.error("认证存储检查失败: %s", str(storage_err), exc_info=True)
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
    """捕获所有未处理的异常，返回统一错误响应格式。"""
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

# 挂载瓦片代理路由
app.include_router(proxy_router)
logger.info("已注册瓦片代理路由")

# 挂载外部服务代理路由（高德/Nominatim/EPSG/IP）
app.include_router(external_proxy_router)
logger.info("已注册外部服务代理路由")

# 挂载认证路由
app.include_router(auth_router)
logger.info("已注册认证路由")

# 挂载访客统计路由
app.include_router(statistics_router)
logger.info("已注册访客统计路由")

# 挂载位置服务路由
app.include_router(location_router)
logger.info("已注册位置服务路由")

# 挂载管理员路由
app.include_router(admin_router)
logger.info("已注册管理员路由")

# 挂载 API 管理路由
app.include_router(api_management_router)
logger.info("已注册 API 管理路由")

# 挂载 API 密钥管理路由
app.include_router(api_keys_router)
logger.info("已注册 API 密钥管理路由")

# 挂载前端运行时配置路由
app.include_router(runtime_config_router)
logger.info("已注册运行时配置路由")

# 挂载 Agent 对话路由
app.include_router(agent_chat_router)
app.include_router(agent_chat_admin_router)
logger.info("已注册 Agent 对话路由")

# 挂载下载任务路由
app.include_router(download_router)
logger.info("已注册下载任务路由")

# 挂载监控路由
app.include_router(monitor_router)
logger.info("已注册监控路由")

# 挂载空间分析路由
app.include_router(spatial_router)
logger.info("已注册空间分析路由")

# --- 功能：健康检查 ---
@app.get("/")
@app.get("/health")
async def health_check():
    """功能：健康检查接口，用于探活与部署监控。"""
    return {"status": "healthy", "message": "WebGIS Backend is Running!"}


# --- 功能：公开运行时配置 ---
@app.get("/api/config/public")
async def get_public_config():
    """功能：下发前端可安全消费的公开配置（非密值 + 功能可用性布尔，无任何 secret 明文）。"""
    return {"code": 200, "message": "success", "data": build_public_config()}

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
