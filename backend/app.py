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

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.background import BackgroundTasks
from api.proxy import router as proxy_router, build_http_client
from api.external_proxy import router as external_proxy_router
from api.statistics import router as statistics_router
from api.location import router as location_router
from api.auth import init_auth_storage, router as auth_router
from api.admin import router as admin_router
from api.api_management import router as api_management_router
from api.api_keys_management import router as api_keys_router
from api.agent_chat import router as agent_chat_router

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

# 挂载 Agent 对话路由
app.include_router(agent_chat_router)
logger.info("已注册 Agent 对话路由")


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
    """
    功能：动态返回后端服务概览与全量端点目录。
    """
    url_list = []
    # 遍历 FastAPI 注册的所有路由
    for route in app.routes:
        # 排除静态资源路由和重复的路由
        if hasattr(route, "path") and hasattr(route, "methods"):
            # 也可以在这里过滤掉不想展示给前端的敏感接口，比如 admin
            methods = ", ".join(route.methods)
            url_list.append(f"[{methods}] {route.path}")

    return {
        "name": "WebGIS Backend",
        "version": "0.1.0",
        "description": "WebGIS 后端 API 服务",
        "total_endpoints": len(url_list),
        "endpoints": sorted(url_list)  # 排序后更易读
    }
    """
    功能：返回后端服务概览与核心端点目录。

    返回：
    - name/version/description 以及 endpoints 列表。
    """
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
            "/api/auth/change-avatar - 修改头像索引（注册用户/管理员）",
            "/api/auth/preferences - 用户偏好读取与保存",
            "/api/statistics/center - 账户中心统计与配额",
            "/api/statistics/realtime - 全站实时统计",
            "/api/announcement/current - 当前公告",
            "/api/announcement/dismiss - 关闭公告",
            "/api/statistics/messages - 留言列表与发布",
            "/api/admin/* - 管理员数据库与配置接口",
            "/api/agent/chat/config - Agent 服务状态与配额快照",
            "/api/agent/chat/completions - Agent 对话后端代理",
            "/api/agent/user-config - 用户个人 Agent 配置",
            "/api/agent/models - 上游可用模型列表探测（支持动态随机调度）",
            "/api/admin/agent/config - 管理员 Agent 配置",
            "/health - 健康检查"
        ]
    }