"""
WebGIS Backend - FastAPI 主应用入口

功能模块：
- 访客统计：地理位置统计功能 (api/statistics.py)
- 通用接口：新闻、数据处理、健康检查等

⚠️ HF 合规：瓦片纠偏/直通代理已完全迁出本仓库（开源仓 tile-proxy + VPS
vpn.negiao.cn/proxy/*）。本 Space **不得**再挂任何 /proxy/*、/tiles/* 中转路由。
坐标纠偏纯数学见 core/coord_transform.py（无网络 IO）。
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

from core.time_utils import hourly_chime_task

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from starlette.background import BackgroundTasks
from api.statistics import router as statistics_router
from api.location import router as location_router
from api.external_proxy import router as external_proxy_router
from api.auth import init_auth_storage, router as auth_router, check_smtp_configured
from api.admin import router as admin_router
from api.api_management import router as api_management_router
from api.api_keys_management import router as api_keys_router, runtime_config_router
from api.agent_chat import router as agent_chat_router, admin_router as agent_chat_admin_router
from api.monitor import init_monitor_log_streaming, router as monitor_router
from api.spatial import router as spatial_router
from api.realtime_stats import init_broadcaster, router as realtime_stats_router, start_periodic_broadcast, stop_periodic_broadcast
from api.historical_imagery import router as historical_imagery_router
from api.webhook import router as webhook_router, shutdown_webhook_watches
from services.historical_imagery import (
    init_historical_imagery_storage,
    shutdown_historical_imagery_scheduler,
    start_historical_imagery_scheduler,
)

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
        init_historical_imagery_storage()
        app.state.historical_imagery_scheduler = start_historical_imagery_scheduler()
    except Exception as e:
        logger.error("历史影像同步服务启动失败: %s", str(e), exc_info=True)

    # follow_redirects=False：共享 client 同时供 external_proxy / agent_upstream 使用，
    # 禁止自动跟随跳转以防 SSRF-via-redirect（V3.6.6 review）。
    app.state.http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(20.0, connect=5.0),
        follow_redirects=False,
    )
    logger.info("HTTP 客户端初始化完成")

    # 启动整点报时后台任务（记录启动时间，报时时展示已运行时长）
    _startup_time = datetime.now().astimezone()
    app.state.hourly_chime = asyncio.create_task(hourly_chime_task(startup_time=_startup_time))
    logger.info("整点报时后台任务已创建")

    # 初始化实时统计 SSE 广播管理器
    app.state.stats_broadcaster = init_broadcaster()
    logger.info("实时统计 SSE 广播管理器已初始化")

    # 启动定时广播任务（每 15s 推送在线统计到所有 SSE 客户端）
    start_periodic_broadcast()
    logger.info("实时统计定时广播已启动")

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

    historical_scheduler = getattr(app.state, "historical_imagery_scheduler", None)
    if historical_scheduler is not None:
        try:
            shutdown_historical_imagery_scheduler(historical_scheduler)
        except Exception as e:
            logger.warning("历史影像同步调度器关闭异常: %s", e)

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

    # 停止实时统计定时广播
    stop_periodic_broadcast()
    logger.info("实时统计定时广播已停止")

    # 取消 HF Webhook Space 监视后台任务
    try:
        await shutdown_webhook_watches()
    except Exception as e:
        logger.warning("Webhook 监视任务关闭异常: %s", e)


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

# CORS 来源白名单经统一 loader 读取（L1 key: CORS_ALLOWED_ORIGINS，逗号分隔）。
# 留空 = 拒绝全部跨源请求（fail-closed），同源访问不受影响；不再回退通配 "*"。
# 理由：通配 + allow_credentials 会让任意站点都能携带凭据调用本服务。真正的权限边界
# 在 require_admin 的服务端会话校验，但不该主动放弃这层浏览器侧约束。
# 注意：CORS 只约束浏览器，挡不住 curl / Postman / 本地脚本直连，它不是鉴权。
_cors_raw = get_str("CORS_ALLOWED_ORIGINS", "")
_cors_origins = [item.strip().rstrip("/") for item in _cors_raw.split(",") if item.strip()]
if not _cors_origins:
    logger.warning(
        "CORS_ALLOWED_ORIGINS 未配置：所有跨源请求将被浏览器拒绝（同源不受影响）。"
        "请在前端来源白名单中登记域名后重启服务。"
    )


def _cors_headers_for(request: Request) -> Dict[str, str]:
    """
    为「位于 CORSMiddleware 之外」的响应补 CORS 头。

    只有 `ServerErrorMiddleware`（兜底 500）处在 CORS 层之外：它在异常穿出
    所有中间件后才生成响应，CORSMiddleware 已经退栈，因此响应不带任何
    `Access-Control-*`。浏览器会把 500 误报成 CORS 失败，掩盖真实故障。

    这里按白名单回显精确 Origin（不能用 `*`：携带凭据的请求不接受通配）。
    """
    origin = request.headers.get("origin")
    if not origin:
        return {}
    if origin not in _cors_origins:
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin",
    }


# 已告警过的未登记来源：CORS 拒绝此前只在浏览器控制台可见，服务端零信号，
# 排查时无从判断「是后端没放行」还是「后端根本没收到请求」。这里每个来源只告警一次。
_warned_unknown_origins: set[str] = set()


def _warn_origin_unlisted(origin: str, detail: str) -> None:
    """未登记来源被 CORS 拒绝时，在服务端留一条可检索的告警（每来源仅一次）。"""
    if not origin or origin in _cors_origins or origin in _warned_unknown_origins:
        return
    _warned_unknown_origins.add(origin)
    logger.warning(
        "CORS 拒绝了未登记来源 %s（%s）：响应不会带 Access-Control-Allow-Origin，"
        "浏览器将报 CORS 失败。如需放行，请把该来源加入 CORS_ALLOWED_ORIGINS 后重启服务。",
        origin,
        detail,
    )


class LoggingCORSMiddleware(CORSMiddleware):
    """
    在 Starlette CORSMiddleware 之上补一条「来源被拒」的服务端告警。

    必要性：预检被拒时浏览器不会发出真实请求，服务端除本层外没有任何代码会被执行，
    因此 CORS 失败在日志里完全不可见——本次线上缺陷正是这样被误判为「前端问题」。
    仅覆写预检路径（拒绝只发生在那里）；若上游改名该方法，本覆写自动失效且不影响功能。
    """

    def preflight_response(self, request_headers):  # type: ignore[override]
        response = super().preflight_response(request_headers)
        if response.status_code == 400:
            _warn_origin_unlisted(
                request_headers.get("origin") or "",
                "OPTIONS 预检被拒",
            )
        return response


# ==================== 启动状态检查中间件 ====================


@app.middleware("http")
async def check_startup_state(request: Request, call_next):
    """
    确保认证存储已初始化，并在降级模式下尝试自动恢复。
    - 正常路径：init_auth_storage() 仅做一次布尔检查即返回。
    - 降级路径：尝试重新初始化认证存储，恢复成功则继续处理。
    """
    allowlist = {"/", "/health", "/docs", "/redoc", "/openapi.json", "/api/info", "/api/webhook"}
    if request.url.path in allowlist:
        return await call_next(request)

    # CORS 预检不得依赖数据库可用性。
    # 跨源带凭据的 POST（如 presence/offline beacon）会先发 OPTIONS 预检；若在此
    # 之前做存储检查，一次数据库抖动就会让预检返回 503，浏览器只报
    # 「preflight 未通过 CORS 校验」，真实故障（503）被完全掩盖。
    # OPTIONS 一律放行给 CORS 层直接应答，不触碰存储。
    if request.method == "OPTIONS":
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


# ==================== CORS 中间件注册（必须最后注册） ====================
#
# Starlette 的 `add_middleware` 实现是 `user_middleware.insert(0, ...)`，
# 即「最后注册的中间件 = 最外层」。因此本段必须放在 check_startup_state 之后：
#
#   请求 → CORS → check_startup_state → 路由
#
# 只有这样，check_startup_state 在降级模式下直接返回的 503 才会被 CORS 层
# 加上 `Access-Control-Allow-Origin` / `-Credentials`。若顺序反了（CORS 在内层），
# 该 503 会绕过 CORS，浏览器把 503 报成 CORS 失败，排查方向被完全带偏。
#
# 唯一仍在 CORS 之外的是 `ServerErrorMiddleware`（兜底 500），其 CORS 头由
# `global_exception_handler` 通过 `_cors_headers_for()` 自行补齐。
app.add_middleware(
    LoggingCORSMiddleware,
    allow_origins=_cors_origins,
    # SSE（EventSource withCredentials）与 presence beacon（fetch credentials: 'include'）
    # 都要求响应带 Access-Control-Allow-Credentials: true，故 credentials 恒开；
    # 正因如此白名单必须是精确来源，不能用通配。
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
        # ServerErrorMiddleware 处于 CORS 层之外，此响应不会经过 CORSMiddleware，
        # 必须自行补头，否则前端只能看到 CORS 报错而看不到 500 本身。
        headers=_cors_headers_for(request),
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """将 HTTPException 也包装为统一响应格式"""
    # 保留原始 detail 结构（可能是字符串或字典），不要 str() 破坏结构化数据
    detail = exc.detail
    if isinstance(detail, dict):
        # detail 是结构化字典（如 {"code": "SESSION_EXPIRED", "message": "..."}）：
        # 透传 message，并单独保留业务 code（detail_code）供前端差异化处理（会话过期/游客不足/邮箱绑定等）。
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "code": exc.status_code,
                "detail_code": str(detail.get("code") or ""),
                "message": detail.get("message", str(detail)),
                "data": None,
            },
        )
    # detail 是字符串，直接作为 message
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.status_code, "message": str(detail), "data": None},
    )


# ==================== 路由挂载 ====================


# ⚠️ 禁止挂载任何 /proxy/*、/tiles/*、external 中转（HF 政策）。
# 瓦片纠偏见开源仓 tile-proxy；部署于 VPS vpn.negiao.cn/proxy/*

# 挂载认证路由
app.include_router(auth_router)
logger.info("已注册认证路由")

# 挂载访客统计路由
app.include_router(statistics_router)
logger.info("已注册访客统计路由")

# 挂载位置服务路由
app.include_router(location_router)
logger.info("已注册位置服务路由")

# 挂载外部服务代理路由（高德/Nominatim/EPSG/IP）
app.include_router(external_proxy_router)
logger.info("已注册外部服务代理路由")

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

# 挂载监控路由
app.include_router(monitor_router)
logger.info("已注册监控路由")

# 挂载空间分析路由
app.include_router(spatial_router)
logger.info("已注册空间分析路由")

# 挂载实时统计 SSE 路由
app.include_router(realtime_stats_router)
logger.info("已注册实时统计 SSE 路由")

# 挂载历史影像元数据目录路由
app.include_router(historical_imagery_router)
logger.info("已注册历史影像目录路由")

# 挂载 Hugging Face Hub Webhook 接收路由
app.include_router(webhook_router)
logger.info("已注册 HF Webhook 接收路由")

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
