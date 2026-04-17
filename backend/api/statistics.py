"""
访客地理位置统计模块

功能：
1. 从请求头获取用户 IP（支持代理环境）
2. 调用 ipapi.co 获取地理位置信息
3. 将数据存储到 Supabase user_visits 表
4. 支持异步操作和完善的异常处理

接口使用示例：
1) 登录后调用（推荐）
     curl -X POST "http://localhost:8000/api/log-visit" \
         -H "Authorization: Bearer <token>" \
         -H "Content-Type: application/json" \
         -d '{}'

2) 代理场景模拟真实用户 IP
     curl -X POST "http://localhost:8000/api/log-visit" \
         -H "Authorization: Bearer <token>" \
         -H "X-Forwarded-For: 8.8.8.8" \
         -H "User-Agent: Mozilla/5.0" \
         -d '{}'
"""

import httpx
import os
from datetime import datetime
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from typing import Optional
import pytz
import logging

from api.auth import require_login

# ==================== 日志配置 ====================
logger = logging.getLogger(__name__)

# ==================== 环境变量 ====================
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# ==================== 常量定义 ====================
IPAPI_ENDPOINT = "https://ipapi.co"
SHANGHAI_TZ = pytz.timezone("Asia/Shanghai")
HTTP_CLIENT_TIMEOUT = httpx.Timeout(connect=3.0, read=8.0, write=8.0, pool=3.0)
HTTP_CLIENT_LIMITS = httpx.Limits(max_connections=100, max_keepalive_connections=50)

# ==================== 数据模型 ====================


class VisitLogRequest(BaseModel):
    """访客日志请求模型"""
    pass  # 可选：前端可以发送额外的元数据


class VisitLogResponse(BaseModel):
    """访客日志响应模型"""
    status: str
    message: str
    data: Optional[dict] = None


# ==================== Supabase 客户端 ====================


class SupabaseClient:
    """简单的 Supabase 异步客户端"""

    def __init__(self, url: str, key: str):
        self.url = url
        self.key = key
        self.table_name = "user_visits"

    async def insert(self, data: dict) -> bool:
        """
        插入数据到 Supabase 表

        参数：
        - data: 要插入的数据字典

        返回：
        - True 表示成功，False 表示失败
        """
        if not self.url or not self.key:
            logger.warning("Supabase 凭证未配置，跳过数据库操作")
            return False

        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }

        endpoint = f"{self.url}/rest/v1/{self.table_name}"

        try:
            async with httpx.AsyncClient(
                timeout=HTTP_CLIENT_TIMEOUT,
                limits=HTTP_CLIENT_LIMITS,
            ) as client:
                response = await client.post(
                    endpoint,
                    json=data,
                    headers=headers,
                )

                if response.status_code in (200, 201):
                    logger.info(f"数据成功插入到 {self.table_name} 表")
                    return True
                else:
                    logger.error(
                        f"Supabase 插入失败: {response.status_code} - {response.text}"
                    )
                    return False
        except Exception as e:
            logger.error(f"Supabase 操作异常: {str(e)}")
            return False


# ==================== 工具函数 ====================


def extract_client_ip(request: Request) -> str:
    """
    从请求头中提取客户端 IP。
    优先检查 X-Forwarded-For（代理环境），回退到 client.host

    参数：
    - request: FastAPI Request 对象

    返回：
    - 客户端 IP 地址
    """
    # 检查 X-Forwarded-For 头（代理环境）
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        # X-Forwarded-For 可能包含多个 IP，取第一个
        ip = x_forwarded_for.split(",")[0].strip()
        return ip

    # 检查其他代理头
    x_real_ip = request.headers.get("X-Real-IP")
    if x_real_ip:
        return x_real_ip

    # 直接连接，使用 client.host
    return request.client.host if request.client else "unknown"


async def fetch_geolocation(ip: str) -> Optional[dict]:
    """
    从 ipapi.co 获取地理位置信息

    参数：
    - ip: 目标 IP 地址

    返回：
    - 包含位置信息的字典，或 None（如果请求失败）
    """
    endpoint = f"{IPAPI_ENDPOINT}/{ip}/json/"

    try:
        async with httpx.AsyncClient(
            timeout=HTTP_CLIENT_TIMEOUT,
            limits=HTTP_CLIENT_LIMITS,
        ) as client:
            response = await client.get(
                endpoint,
                headers={"User-Agent": "WebGIS-Backend/1.0"},
            )

            if response.status_code == 200:
                data = response.json()
                return {
                    "ip": data.get("ip", ip),
                    "city": data.get("city", "Unknown"),
                    "latitude": data.get("latitude"),
                    "longitude": data.get("longitude"),
                }
            else:
                logger.warning(
                    f"ipapi.co 返回非 200 状态: {response.status_code}"
                )
                return None
    except httpx.TimeoutException:
        logger.warning(f"ipapi.co 请求超时 (IP: {ip})")
        return None
    except httpx.RequestError as e:
        logger.warning(f"ipapi.co 请求失败 (IP: {ip}): {str(e)}")
        return None
    except Exception as e:
        logger.error(f"获取地理位置异常 (IP: {ip}): {str(e)}")
        return None


def get_current_shanghai_time() -> str:
    """
    获取当前北京时间（Asia/Shanghai）
    格式：YYYY-MM-DD HH:mm:ss
    """
    now_shanghai = datetime.now(SHANGHAI_TZ)
    return now_shanghai.strftime("%Y-%m-%d %H:%M:%S")


# ==================== APIRouter 定义 ====================

router = APIRouter(prefix="/api", tags=["statistics"])


@router.post("/log-visit")
async def log_visit(
    request: Request,
    _current_user: dict = Depends(require_login),
) -> VisitLogResponse:
    """
    记录访客地理位置信息接口

    流程：
    1. 从请求头提取客户端 IP
    2. 调用 ipapi.co 获取地理位置
    3. 记录访问时间和 User-Agent
    4. 异步写入 Supabase

    返回：
    - status: "success" 或 "partial_success" 或 "failed"
    - message: 详细说明
    - data: 记录的访问数据（可选）
    """
    try:
        # 1. 提取客户端 IP
        client_ip = extract_client_ip(request)
        user_agent = request.headers.get("User-Agent", "Unknown")
        visit_time = get_current_shanghai_time()

        logger.info(f"接收访客请求: IP={client_ip}, User-Agent={user_agent}")

        # 2. 获取地理位置信息
        geo_data = await fetch_geolocation(client_ip)

        if geo_data is None:
            logger.warning(f"无法获取地理位置信息 (IP: {client_ip})")
            return VisitLogResponse(
                status="partial_success",
                message="成功记录访问，但地理位置获取失败",
                data={
                    "ip": client_ip,
                    "visit_time": visit_time,
                    "city": "Unknown",
                    "latitude": None,
                    "longitude": None,
                    "user_agent": user_agent,
                },
            )

        # 3. 构建完整的访问记录
        visit_record = {
            "ip": geo_data["ip"],
            "city": geo_data["city"],
            "latitude": geo_data["latitude"],
            "longitude": geo_data["longitude"],
            "visit_time": visit_time,
            "user_agent": user_agent,
        }

        logger.info(f"地理位置信息: {visit_record}")

        # 4. 异步写入 Supabase
        supabase = SupabaseClient(SUPABASE_URL, SUPABASE_KEY)
        success = await supabase.insert(visit_record)

        if success:
            return VisitLogResponse(
                status="success",
                message="访问记录成功保存",
                data=visit_record,
            )
        else:
            return VisitLogResponse(
                status="partial_success",
                message="访问数据已获取，但数据库保存失败",
                data=visit_record,
            )

    except Exception as e:
        logger.error(f"log_visit 异常: {str(e)}")
        return VisitLogResponse(
            status="failed",
            message=f"记录访问失败: {str(e)}",
            data=None,
        )
