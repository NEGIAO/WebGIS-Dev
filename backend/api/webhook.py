"""
Hugging Face Hub Webhook 接收 + Space 失败邮件告警。

投递地址：`https://negiao-webgis.hf.space/api/webhook`。
HF 在 Space/Repo **更新（push）时**投递；**不会**直接推送构建结果。
因此流程为：

1. 快速 ACK 2xx（避免 HF 因超时禁用 webhook）；
2. 后台延迟轮询 **仅** `HF_WATCH_SPACE_ID` 对应的 Space API，观察 `runtime.stage`；
3. 若出现 BUILD_ERROR / RUNTIME_ERROR，经 SMTP 发告警邮件。

安全约定：
- 监视目标只读配置 `HF_WATCH_SPACE_ID`，**不信任** payload 中的 repo 名（防任意探测/刷信）。
- 配置 L3 `HF_WEBHOOK_SECRET` 后要求请求头携带密钥；未配置时开放接收但仅 ACK + 记日志。
"""

from __future__ import annotations

import asyncio
import hmac
import html
import logging
import re
from typing import Any, Dict, Optional, Set

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from config import get_settings, get_str

from api.auth.email_service import check_smtp_configured, send_alert_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["webhook"])

_SECRET_HEADERS = (
    "x-webhook-secret",
    "x-huggingface-secret",
    "x-hf-secret",
)

# HF Space runtime.stage 中视为「构建/运行失败」的状态
FAILURE_STAGES = frozenset({"BUILD_ERROR", "RUNTIME_ERROR"})

# 推送后延迟观察点（秒）：Docker 全栈构建通常数分钟，多点采样提高命中率
_CHECK_DELAYS = (45, 120, 240, 420)

# author/name 形态（HF repo id）
_SPACE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$")

# 同一 Space 同一失败阶段只发一封（进程内去重；容器重启后允许再发）
_notified: Dict[str, str] = {}
_inflight: Set[str] = set()
# 强引用后台任务，防止 asyncio 任务被 GC
_watch_tasks: Set[asyncio.Task] = set()


def _webhook_secret() -> str:
    return (get_str("HF_WEBHOOK_SECRET", "") or "").strip()


def _provided_secret(request: Request) -> str:
    for name in _SECRET_HEADERS:
        value = request.headers.get(name)
        if value:
            return value.strip()
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return ""


def _configured_space_id() -> str:
    """功能：读取配置的监视 Space；非法则回落默认。"""
    raw = (get_str("HF_WATCH_SPACE_ID", "NEGIAO/WebGIS") or "NEGIAO/WebGIS").strip()
    return raw if _SPACE_ID_RE.match(raw) else "NEGIAO/WebGIS"


def _event_summary(payload: Any) -> str:
    if not isinstance(payload, dict):
        return f"non-dict payload type={type(payload).__name__}"
    event = payload.get("event")
    if isinstance(event, dict):
        action = event.get("action", "")
        scope = event.get("scope", "")
        repo = event.get("repo") or {}
        repo_name = repo.get("name") if isinstance(repo, dict) else ""
        return f"action={action} scope={scope} repo={repo_name}"
    keys = ",".join(sorted(payload.keys())[:8])
    return f"keys=[{keys}]"


def _ack(ok: bool = True) -> JSONResponse:
    return JSONResponse(
        status_code=200 if ok else 401,
        content={"code": 200 if ok else 401, "message": "ok" if ok else "unauthorized", "data": None},
    )


def _watch_space_id(payload: Any) -> str:
    """监视目标恒为配置项；payload 仅用于日志摘要，不参与选取。"""
    return _configured_space_id()


def _alert_recipient() -> str:
    configured = (get_str("HF_ALERT_EMAIL", "") or "").strip()
    if configured:
        return configured
    return (get_settings().smtp_user or "").strip()


def _build_logs_url(space_id: str) -> str:
    return f"https://huggingface.co/spaces/{space_id}/logs"


def _extract_stage(data: Any) -> str:
    if not isinstance(data, dict):
        return ""
    runtime = data.get("runtime")
    if isinstance(runtime, dict):
        stage = runtime.get("stage")
        if stage:
            return str(stage)
    stage = data.get("stage")
    return str(stage) if stage else ""


async def _fetch_space_stage(client: httpx.AsyncClient, space_id: str) -> str:
    url = f"https://huggingface.co/api/spaces/{space_id}"
    resp = await client.get(url, timeout=20.0)
    resp.raise_for_status()
    return _extract_stage(resp.json())


async def _maybe_send_failure_email(space_id: str, stage: str) -> None:
    """功能：失败阶段发告警邮件；同 space+stage 去重。"""
    recipient = _alert_recipient()
    if not recipient:
        logger.warning(
            "Space %s 处于 %s，但未配置告警收件人（HF_ALERT_EMAIL / SMTP_USER）",
            space_id,
            stage,
        )
        return
    if not check_smtp_configured():
        logger.warning("Space %s 处于 %s，但 SMTP 未配置，无法发信", space_id, stage)
        return

    if _notified.get(space_id) == stage:
        logger.info("Space %s 仍为 %s，已发过告警，跳过重复邮件", space_id, stage)
        return

    sid_e = html.escape(space_id, quote=True)
    stage_e = html.escape(stage, quote=True)
    logs_url = _build_logs_url(space_id)
    logs_e = html.escape(logs_url, quote=True)

    subject = f"【WebGIS告警】Space {stage}: {space_id}"
    lines = [
        f"Space：<strong>{sid_e}</strong>",
        f"状态：<strong>{stage_e}</strong>",
        f'构建/运行日志：<a href="{logs_e}">{logs_e}</a>',
        "请登录 Hugging Face 检查构建日志并修复后重新部署。",
    ]

    ok = await send_alert_email(recipient, subject, lines)
    if ok:
        _notified[space_id] = stage
        logger.info("已发送 Space 失败告警: %s %s -> %s", space_id, stage, recipient)
    else:
        logger.error("Space 失败告警发送失败: %s %s", space_id, stage)


async def _watch_space_build(space_id: str) -> None:
    """功能：延迟轮询 Space 状态；失败则发邮件；恢复 RUNNING 后清除去重标记。"""
    if space_id in _inflight:
        logger.info("Space %s 监视任务已在运行，跳过重复启动", space_id)
        return
    _inflight.add(space_id)
    try:
        async with httpx.AsyncClient(
            headers={"User-Agent": "WebGIS-Webhook-Alerter/1.0"},
            follow_redirects=True,
        ) as client:
            for delay in _CHECK_DELAYS:
                await asyncio.sleep(delay)
                try:
                    stage = await _fetch_space_stage(client, space_id)
                except Exception as exc:
                    logger.warning("查询 Space %s 状态失败（%ss 后）: %s", space_id, delay, exc)
                    continue

                logger.info("Space %s 状态采样（+%ss）: %s", space_id, delay, stage or "(空)")
                if stage in FAILURE_STAGES:
                    await _maybe_send_failure_email(space_id, stage)
                    return
                if stage == "RUNNING":
                    _notified.pop(space_id, None)
                    return
            logger.info("Space %s 观察窗口结束，未捕获失败阶段", space_id)
    finally:
        _inflight.discard(space_id)


def _on_watch_done(task: "asyncio.Task[Any]") -> None:
    """功能：释放任务引用；记录未捕获异常，避免静默失败。"""
    _watch_tasks.discard(task)
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.error("Space 监视任务异常结束: %s", exc, exc_info=exc)


def _spawn_watch(space_id: str) -> None:
    """功能：启动后台监视任务并持有强引用。"""
    task = asyncio.create_task(_watch_space_build(space_id))
    _watch_tasks.add(task)
    task.add_done_callback(_on_watch_done)


async def shutdown_webhook_watches() -> None:
    """功能：应用关闭时取消全部监视任务，避免 pending Task 警告与半途请求。"""
    tasks = list(_watch_tasks)
    if not tasks:
        return
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    _watch_tasks.clear()
    _inflight.clear()
    logger.info("Webhook Space 监视任务已全部取消（%d 个）", len(tasks))


@router.get("/webhook")
async def webhook_ping():
    """功能：HF Webhook 探活/连通性检查（GET）。"""
    return {
        "code": 200,
        "message": "webhook endpoint alive",
        "data": {
            "accepts": ["POST"],
            "watch_space": _watch_space_id(None),
            "alert_email_configured": bool(_alert_recipient()),
        },
    }


@router.post("/webhook")
async def webhook_receive(request: Request):
    """功能：接收 HF Webhook，快速 ACK，并后台检查配置 Space 是否构建/运行失败。"""
    secret = _webhook_secret()
    if secret:
        provided = _provided_secret(request)
        if not provided or not hmac.compare_digest(provided, secret):
            logger.warning("HF Webhook 密钥校验失败（path=%s）", request.url.path)
            return _ack(ok=False)

    payload: Optional[Any] = None
    try:
        payload = await request.json()
    except Exception:
        logger.info(
            "HF Webhook 收到非 JSON 体 content-type=%s",
            request.headers.get("content-type", ""),
        )

    summary = _event_summary(payload) if payload is not None else "empty-body"
    logger.info("HF Webhook 投递已接收: %s", summary)

    space_id = _watch_space_id(payload)
    _spawn_watch(space_id)
    logger.info("已启动 Space 状态监视任务: %s", space_id)

    return _ack(ok=True)
