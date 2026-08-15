"""
KeepAlive 互活跃模块（WebGIS 端 - 项目 A）

接收端（公开，无需鉴权）：
  - POST /api/heartbeat     —— 接收对端 JSON 心跳包，返回处理结果
  - GET  /api/heartbeat     —— 兼容探活（cron shell 脚本使用）
  - GET  /api/keepalive/ping —— 兼容探活

发送端：
  - asyncio 后台任务，每 3~6 分钟（含随机浮动 180~360s）主动 GET 对端 /api/status
  - 对端 New API 是编译型 Go 二进制，公开端口 3000 上只有 /api/status 可用
  - 请求头随机轮换 Chrome/Edge/Firefox UA + Accept + Accept-Language
  - 日志格式：[保活] 数据发送成功 / 数据接收成功 / 保活失败
"""

import asyncio
import logging
import random
from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Request

logger = logging.getLogger(__name__)

# 对端公开地址（New API HF Space，端口 3000 已暴露到公网）
PEER_URL = "https://negiao-newapi.hf.space"
# 对端 Go 程序已公开的探活端点（GET，无需鉴权）
PEER_PROBE_PATH = "/api/status"

router = APIRouter(tags=["keepalive"])

# ---------------------------------------------------------------------------
# User-Agent 池：Chrome / Edge / Firefox 多版本轮换
# ---------------------------------------------------------------------------
_UA_POOL = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
]

_ACCEPT_LANGUAGES = [
    "zh-CN,zh;q=0.9,en;q=0.8",
    "en-US,en;q=0.9,zh-CN;q=0.8",
    "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    "en-GB,en;q=0.9,en-US;q=0.8",
]


def _random_headers() -> Dict[str, str]:
    """构造拟人化请求头。"""
    return {
        "User-Agent": random.choice(_UA_POOL),
        "Accept": "application/json, text/html, */*",
        "Accept-Language": random.choice(_ACCEPT_LANGUAGES),
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://negiao-webgis.hf.space/",
        "Connection": "keep-alive",
    }


def _log_keepalive(endpoint_desc: str) -> None:
    """记录保活接收日志（GET /api/heartbeat、GET /api/keepalive/ping 共用）。"""
    now = datetime.now().astimezone()
    logger.info(
        "[保活] [%s] 数据接收成功 ← 接口: %s",
        now.strftime("%Y-%m-%d %H:%M:%S"),
        endpoint_desc,
    )


# ---------------------------------------------------------------------------
# 接收端：POST /api/heartbeat + GET /api/heartbeat（公开，无需鉴权）
# ---------------------------------------------------------------------------
@router.post("/api/heartbeat", operation_id="keepalive_heartbeat_post")
async def heartbeat_receive_post(request: Request):
    """
    接收对端心跳 POST 请求。
    解析请求 JSON（若体为空则视为空字典），返回处理成功的 JSON 状态。
    """
    body: Dict[str, Any] = {}
    try:
        body = await request.json()
    except Exception:
        body = {}

    now = datetime.now().astimezone()
    logger.info(
        "[保活] [%s] 数据接收成功 ← 来自对端，时间: %s",
        now.strftime("%Y-%m-%d %H:%M:%S"),
        now.isoformat(),
    )
    return {
        "code": 200,
        "message": "success",
        "data": {
            "status": "acknowledged",
            "service": "webgis",
            "received_at": now.isoformat(),
            "echo": body,
        },
    }


@router.get("/api/heartbeat", operation_id="keepalive_heartbeat_get")
async def heartbeat_receive_get():
    """兼容探活（公开），对端 GET 此接口即可保活。"""
    _log_keepalive("GET /api/heartbeat")
    return {
        "code": 200,
        "message": "success",
        "data": {
            "status": "acknowledged",
            "service": "webgis",
            "time": datetime.now().astimezone().isoformat(),
        },
    }


@router.get("/api/keepalive/ping", operation_id="keepalive_ping_get")
async def keepalive_ping():
    """兼容探活（公开），对端 GET 此接口即可保活。"""
    _log_keepalive("GET /api/keepalive/ping")
    return {
        "status": "ok",
        "service": "webgis",
        "message": "pong",
        "time": datetime.now().astimezone().isoformat(),
    }


# ---------------------------------------------------------------------------
# 发送端：asyncio 后台任务，3~6 分钟随机间隔 GET 对端 /api/status
# ---------------------------------------------------------------------------
async def _send_keepalive_once(client):
    """执行一次 GET 探活（对端是 Go 二进制，公开端点只有 /api/status）。

    返回：
      - 2xx 状态码      —— 保活成功
      - 3xx~5xx 状态码  —— 对端/网关返回错误（如 HF 限流 429）
      - -1              —— 网络异常/超时
    """
    url = f"{PEER_URL.rstrip('/')}{PEER_PROBE_PATH}"
    headers = _random_headers()
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    logger.info("[保活] [%s] 数据发送中 → %s", ts, url)
    try:
        resp = await client.get(url, headers=headers, timeout=15.0)
        ts2 = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if 200 <= resp.status_code < 300:
            logger.info(
                "[保活] [%s] 保活成功 ✓ 对方响应: HTTP %d",
                ts2,
                resp.status_code,
            )
        else:
            logger.warning(
                "[保活] [%s] 保活失败 ✗ 对方响应: HTTP %d",
                ts2,
                resp.status_code,
            )
        return resp.status_code
    except Exception as e:
        ts2 = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        logger.error(
            "[保活] [%s] 保活失败 ✗ 错误: %s",
            ts2,
            str(e),
        )
        return -1


async def _send_keepalive_loop(app):
    """
    后台 asyncio 任务：
    - 间隔随机 180~360 秒（3~6 分钟），严禁死定时
    - 使用 app.state.http_client 复用连接池
    """
    await asyncio.sleep(15)

    client = getattr(app.state, "http_client", None)
    if client is None:
        logger.error("[保活] http_client 不可用，发送端未启动")
        return

    while True:
        status = await _send_keepalive_once(client)
        # 失败退避：429/5xx/网络异常 → 60~120s 快速重试加速自愈；成功 → 180~360s 长间隔
        if status < 0 or status >= 400:
            interval = random.randint(60, 120)
        else:
            interval = random.randint(180, 360)
        await asyncio.sleep(interval)


def start_keepalive_sender(app):
    """在 lifespan 中调用，启动发送端后台任务。"""
    task = asyncio.create_task(_send_keepalive_loop(app))
    return task
