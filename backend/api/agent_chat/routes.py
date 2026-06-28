"""
Agent Chat route handlers.
"""

import asyncio
import json
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status

from api.auth import normalize_role, require_admin, require_api_access_or_guest, require_login, resolve_quota_subject

from .constants import (
    CONFIG_KEY_AVAILABLE_MODELS,
    DEFAULT_AGENT_BASE_URL,
    DEFAULT_AGENT_MAX_TOKENS,
    DEFAULT_AGENT_MODEL,
    DEFAULT_AGENT_SYSTEM_PROMPT,
    DEFAULT_AGENT_TEMPERATURE,
    DEFAULT_AGENT_TIMEOUT_SECONDS,
    DEFAULT_AGENT_TOP_P,
    DEFAULT_AGENT_EXTRA_BODY,
    logger,
)
from .db import (
    _cache_available_models_sync,
    _get_agent_chat_quota_policy_sync,
    _get_agent_key_status_sync,
    _get_agent_provider_config_sync,
    _get_default_ai_config_sync,
    _get_system_config_values_sync,
    _read_agent_user_config_row_sync,
    _resolve_effective_agent_runtime_sync,
    _set_agent_provider_config_sync,
    _set_default_ai_config_sync,
    _upsert_agent_user_config_sync,
    _db_connection,
    _ensure_agent_chat_tables_sync,
    _safe_parse_extra_body,
)
from .quota import (
    _check_agent_chat_quota_sync,
    _consume_agent_chat_quota_sync,
    _get_agent_chat_quota_snapshot_sync,
)
from .schemas import (
    AgentChatProxyRequest,
    AgentChatRequest,
    AgentConfigUpdateRequest,
    AgentUserConfigUpdateRequest,
    DefaultAIConfigUpdateRequest,
)
from .upstream import (
    _call_upstream_chat,
    _call_upstream_chat_with_key_candidates,
    _call_upstream_models_with_key_candidates,
    _extract_assistant_reply,
    _extract_client_ip,
    _extract_reply_and_tools,
    _join_system_prompt,
    _record_agent_call_safe,
    _sanitize_history,
    _try_get_location_from_ip_async,
)
from .utils import (
    _model_dump_compat,
    _normalize_available_models,
    _normalize_base_url,
    _normalize_model,
    _safe_parse_float,
)

router = APIRouter(prefix="/api/agent", tags=["agent-chat"])
admin_router = APIRouter(prefix="/api/admin/agent", tags=["agent-chat-admin"])


@router.get("/chat/config")
async def get_agent_chat_config(
    session: Dict[str, Any] = Depends(require_api_access_or_guest),
) -> Dict[str, Any]:
    """获取当前登录用户的 Agent 服务状态、模型和当日配额快照。"""
    username = str(session.get("username") or "")
    role = normalize_role(session.get("role"), username)
    quota_subject = resolve_quota_subject(username, role, session.get("guest_uid"))

    runtime = await asyncio.to_thread(_resolve_effective_agent_runtime_sync, username)
    quota = await asyncio.to_thread(_get_agent_chat_quota_snapshot_sync, username, role, quota_subject)

    return {
        "status": "success",
        "data": {
            "service_ready": bool(runtime.get("api_key")) and bool(runtime.get("base_url")) and bool(runtime.get("model")),
            "model": str(runtime.get("model") or ""),
            "model_source": str(runtime.get("model_source") or "missing"),
            "model_locked": bool(runtime.get("model_locked")),
            "available_models": runtime.get("available_models") if isinstance(runtime.get("available_models"), list) else [],
            "quota": quota,
            "key_status": {
                "is_set": bool(str(runtime.get("api_key") or "").strip()),
                "source": str(runtime.get("api_key_source") or "missing"),
                "has_personal_key": bool(runtime.get("has_personal_key")),
            },
            "provider": {
                "base_url": str(runtime.get("base_url") or ""),
                "timeout_seconds": int(runtime.get("timeout_seconds") or DEFAULT_AGENT_TIMEOUT_SECONDS),
                "max_tokens": int(runtime.get("max_tokens") or DEFAULT_AGENT_MAX_TOKENS),
                "temperature": float(runtime.get("temperature") or DEFAULT_AGENT_TEMPERATURE),
                "top_p": float(runtime.get("top_p") or DEFAULT_AGENT_TOP_P),
                "extra_body": runtime.get("extra_body") or DEFAULT_AGENT_EXTRA_BODY,
            },
        },
    }


@router.post("/chat/completions")
async def agent_chat_completions(
    payload: AgentChatRequest,
    request: Request,
    session: Dict[str, Any] = Depends(require_api_access_or_guest),
) -> Dict[str, Any]:
    """代理用户对话请求到上游 LLM，并执行配额与安全控制。"""
    username = str(session.get("username") or "")
    role = normalize_role(session.get("role"), username)
    quota_subject = resolve_quota_subject(username, role, session.get("guest_uid"))

    quota_preview = await asyncio.to_thread(_check_agent_chat_quota_sync, username, role, quota_subject)
    if not bool(quota_preview.get("allowed")):
        limit = quota_preview.get("limit")
        used = quota_preview.get("used")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"今日额度已达上限（{used}/{limit}），请明日再试。",
        )

    runtime = await asyncio.to_thread(_resolve_effective_agent_runtime_sync, username)

    override_api_key = str(payload.override_api_key or "").strip()
    override_base_url = str(payload.override_base_url or "").strip()
    override_model = str(payload.override_model or "").strip()

    api_key = override_api_key if override_api_key else str(runtime.get("api_key") or "").strip()
    api_key_candidates = (
        [override_api_key]
        if override_api_key
        else list(runtime.get("api_key_candidates") or [api_key])
    )
    runtime_model = override_model if override_model else str(runtime.get("model") or "").strip()
    base_url = _normalize_base_url(override_base_url) if override_base_url else str(runtime.get("base_url") or DEFAULT_AGENT_BASE_URL).strip()
    override_timeout = int(payload.override_timeout_seconds) if payload.override_timeout_seconds is not None else int(runtime.get("timeout_seconds") or DEFAULT_AGENT_TIMEOUT_SECONDS)
    override_max_tokens = int(payload.override_max_tokens) if payload.override_max_tokens is not None else int(runtime.get("max_tokens") or DEFAULT_AGENT_MAX_TOKENS)
    override_temp = float(payload.override_temperature) if payload.override_temperature is not None else float(runtime.get("temperature") or DEFAULT_AGENT_TEMPERATURE)
    override_top_p = float(payload.override_top_p) if payload.override_top_p is not None else float(runtime.get("top_p") or DEFAULT_AGENT_TOP_P)
    override_extra_body = payload.override_extra_body if payload.override_extra_body is not None else runtime.get("extra_body") or DEFAULT_AGENT_EXTRA_BODY

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent key is not configured on backend. Please contact admin.",
        )

    if not runtime_model:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent model is not configured. Please set model or available_models in backend config.",
        )

    history_items = _sanitize_history(payload.history)

    location_context = str(payload.location_context or "").strip()

    if not location_context:
        client_ip = _extract_client_ip(request)
        ip_location = await _try_get_location_from_ip_async(client_ip)
        if ip_location:
            location_context = ip_location

    system_prompt = _join_system_prompt(
        str(runtime.get("system_prompt") or DEFAULT_AGENT_SYSTEM_PROMPT),
        location_context,
    )

    request_messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
    request_messages.extend(history_items)
    request_messages.append({"role": "user", "content": str(payload.message or "").strip()})

    request_params = json.dumps(
        {
            "model": runtime_model,
            "history_len": len(history_items),
            "quota_subject": quota_subject,
            "api_key_source": runtime.get("api_key_source"),
            "model_source": runtime.get("model_source"),
            "has_location_context": bool(location_context),
            "has_overrides": bool(override_api_key or override_base_url or override_model),
        },
        ensure_ascii=False,
    )

    started_at = time.perf_counter()
    upstream_status = 200
    try:
        upstream_data = await _call_upstream_chat_with_key_candidates(
            request,
            base_url=base_url,
            api_keys=api_key_candidates,
            model=runtime_model,
            messages=request_messages,
            timeout_seconds=override_timeout,
            max_tokens=override_max_tokens,
            temperature=override_temp,
            top_p=override_top_p,
            extra_body=override_extra_body,
            tools=payload.tools,
            tool_choice=payload.tool_choice,
        )

        reply, tool_calls = _extract_reply_and_tools(upstream_data)

        # 当有 tool_calls 时，reply 可能为空（LLM 只返回工具调用），这是正常的
        if not reply and not tool_calls:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Agent upstream returned empty content.",
            )

        quota_after = await asyncio.to_thread(_consume_agent_chat_quota_sync, username, role, quota_subject)
        if not bool(quota_after.get("allowed", True)):
            quota_snapshot = await asyncio.to_thread(
                _get_agent_chat_quota_snapshot_sync,
                username,
                role,
                quota_subject,
            )
            quota_after = {
                "allowed": False,
                "limit": quota_snapshot.get("limit"),
                "used": quota_snapshot.get("used"),
                "remaining": quota_snapshot.get("remaining"),
                "usage_date": quota_snapshot.get("usage_date"),
                "quota_subject": quota_snapshot.get("quota_subject"),
            }

        data = {
            "reply": reply,
            "model": runtime_model,
            "model_source": str(runtime.get("model_source") or "unknown"),
            "quota": quota_after,
            "usage": upstream_data.get("usage") if isinstance(upstream_data, dict) else None,
            "api_key_source": str(runtime.get("api_key_source") or "unknown"),
        }
        if tool_calls:
            data["tool_calls"] = tool_calls

        return {"status": "success", "data": data}
    except HTTPException as exc:
        detail_text = str(exc.detail or "")
        if (
            int(exc.status_code) == status.HTTP_502_BAD_GATEWAY
            and "does not support apiType:openai.chat" in detail_text
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "当前模型不支持 openai.chat（chat/completions）。"
                    '请在"我的 Agent 配置"中改为上游可用聊天模型，'
                    "或切换支持 chat 的平台模型。"
                ),
            ) from exc

        upstream_status = int(exc.status_code)
        raise
    finally:
        elapsed_ms = (time.perf_counter() - started_at) * 1000.0
        await _record_agent_call_safe(
            username=username,
            role=role,
            status_code=upstream_status,
            elapsed_ms=elapsed_ms,
            request_params=request_params,
        )


@admin_router.get("/config")
async def admin_get_agent_config(
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """管理员读取平台级 Agent 配置、密钥状态和配额策略。"""
    config = await asyncio.to_thread(_get_agent_provider_config_sync)
    key_status = await asyncio.to_thread(_get_agent_key_status_sync)
    chat_quota = await asyncio.to_thread(_get_agent_chat_quota_policy_sync)

    return {
        "status": "success",
        "data": {
            "provider": config,
            "key_status": key_status,
            "chat_quota": chat_quota,
        },
    }


@admin_router.post("/config")
async def admin_update_agent_config(
    payload: AgentConfigUpdateRequest,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """管理员更新平台级 Agent 默认配置。"""
    updates = _model_dump_compat(payload, exclude_none=True, exclude_unset=True)

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No agent config fields provided.",
        )

    saved = await asyncio.to_thread(_set_agent_provider_config_sync, updates)
    chat_quota = await asyncio.to_thread(_get_agent_chat_quota_policy_sync)

    return {
        "status": "success",
        "message": "Agent config updated.",
        "data": {
            "provider": saved,
            "chat_quota": chat_quota,
        },
    }


@admin_router.get("/default-ai-config")
async def admin_get_default_ai_config(
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """管理员读取默认 AI 专属配置（含 api_key 完整值）。"""
    config = await asyncio.to_thread(_get_default_ai_config_sync)

    return {
        "status": "success",
        "data": {
            "api_key": config.get("api_key", ""),
            "base_url": config.get("base_url", ""),
            "model": config.get("model", ""),
            "is_configured": bool(config.get("is_configured")),
        },
    }


@admin_router.post("/default-ai-config")
async def admin_update_default_ai_config(
    payload: DefaultAIConfigUpdateRequest,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """管理员更新默认 AI 专属配置（base_url / model / api_key）。
    
    这些配置用于前端默认的"个人 Key 模式"，前端无需硬编码敏感信息。
    api_key 存储在后端数据库中，前端通过后端代理转发请求，不直接暴露 key。
    """
    updates = _model_dump_compat(payload, exclude_none=True, exclude_unset=True)

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No default AI config fields provided. Please set api_key, base_url, or model.",
        )

    saved = await asyncio.to_thread(_set_default_ai_config_sync, updates)

    return {
        "status": "success",
        "message": "Default AI config updated.",
        "data": {
            "base_url": saved.get("base_url", ""),
            "model": saved.get("model", ""),
            "is_configured": bool(saved.get("is_configured")),
        },
    }


@router.get("/default-ai-config")
async def get_default_ai_config(
) -> Dict[str, Any]:
    """公开端点：获取默认 AI 配置（不含 api_key，仅供前端展示和构建代理请求）。"""
    config = await asyncio.to_thread(_get_default_ai_config_sync)

    return {
        "status": "success",
        "data": {
            "base_url": config.get("base_url", ""),
            "model": config.get("model", ""),
            "is_configured": bool(config.get("is_configured")),
        },
    }


@router.post("/chat/default-proxy")
async def agent_chat_default_proxy(
    payload: AgentChatRequest,
    request: Request,
    session: Dict[str, Any] = Depends(require_api_access_or_guest),
) -> Dict[str, Any]:
    """使用管理员配置的默认 AI 专属 Key 代理聊天（api_key 存储在后端数据库，前端无需传 key）。

    与 /chat/proxy 不同，此端点从数据库读取管理员配置的 api_key / base_url / model，
    前端只需发送消息内容，无需知道或传递 API Key。
    """
    username = str(session.get("username") or "anonymous")
    role = normalize_role(session.get("role"), username)

    # 从数据库读取管理员配置的默认 AI 配置
    default_config = await asyncio.to_thread(_get_default_ai_config_sync)
    if not default_config.get("is_configured"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="默认 AI 专属配置未完成，请联系管理员配置 api_key / base_url / model。",
        )

    api_key = str(default_config.get("api_key") or "").strip()
    api_key_candidates = [api_key] if api_key else []
    base_url = str(default_config.get("base_url") or "").strip()
    model = str(default_config.get("model") or "").strip()

    # 允许前端覆盖 model（但不允许覆盖 api_key 和 base_url）
    override_model = str(payload.override_model or "").strip()
    if override_model:
        model = override_model

    override_timeout = int(payload.override_timeout_seconds) if payload.override_timeout_seconds is not None else DEFAULT_AGENT_TIMEOUT_SECONDS
    override_max_tokens = int(payload.override_max_tokens) if payload.override_max_tokens is not None else DEFAULT_AGENT_MAX_TOKENS
    override_temp = float(payload.override_temperature) if payload.override_temperature is not None else DEFAULT_AGENT_TEMPERATURE
    override_top_p = float(payload.override_top_p) if payload.override_top_p is not None else float(DEFAULT_AGENT_TOP_P)
    override_extra_body = payload.override_extra_body if payload.override_extra_body is not None else DEFAULT_AGENT_EXTRA_BODY

    history_items = _sanitize_history(payload.history)

    location_context = str(payload.location_context or "").strip()
    if not location_context:
        client_ip = _extract_client_ip(request)
        ip_location = await _try_get_location_from_ip_async(client_ip)
        if ip_location:
            location_context = ip_location

    system_prompt = _join_system_prompt(
        DEFAULT_AGENT_SYSTEM_PROMPT,
        location_context,
    )

    request_messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
    request_messages.extend(history_items)
    request_messages.append({"role": "user", "content": str(payload.message or "").strip()})

    request_params = json.dumps(
        {
            "endpoint": "/api/agent/chat/default-proxy",
            "model": model,
            "base_url": base_url,
            "history_len": len(history_items),
            "has_location_context": bool(location_context),
            "has_model_override": bool(override_model),
        },
        ensure_ascii=False,
    )

    started_at = time.perf_counter()
    upstream_status = 200
    try:
        upstream_data = await _call_upstream_chat_with_key_candidates(
            request,
            base_url=base_url,
            api_keys=api_key_candidates,
            model=model,
            messages=request_messages,
            timeout_seconds=override_timeout,
            max_tokens=override_max_tokens,
            temperature=override_temp,
            top_p=override_top_p,
            extra_body=override_extra_body,
            tools=payload.tools,
            tool_choice=payload.tool_choice,
        )

        reply, tool_calls = _extract_reply_and_tools(upstream_data)

        if not reply and not tool_calls:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Agent upstream returned empty content.",
            )

        data = {
            "reply": reply,
            "model": model,
            "usage": upstream_data.get("usage") if isinstance(upstream_data, dict) else None,
            "mode": "default-proxy",
        }
        if tool_calls:
            data["tool_calls"] = tool_calls

        return {"status": "success", "data": data}
    except HTTPException as exc:
        upstream_status = int(exc.status_code)
        raise
    finally:
        elapsed_ms = (time.perf_counter() - started_at) * 1000.0
        await _record_agent_call_safe(
            username=username,
            role=role,
            status_code=upstream_status,
            elapsed_ms=elapsed_ms,
            request_params=request_params,
        )


@router.get("/user-config")
async def get_agent_user_config(
    session: Dict[str, Any] = Depends(require_api_access_or_guest),
) -> Dict[str, Any]:
    """读取当前用户的 Agent 配置（个人覆盖 + 生效结果）。"""
    username = str(session.get("username") or "")
    role = normalize_role(session.get("role"), username)

    runtime = await asyncio.to_thread(_resolve_effective_agent_runtime_sync, username)
    user_cfg = await asyncio.to_thread(_read_agent_user_config_row_sync, username)
    provider = await asyncio.to_thread(_get_agent_provider_config_sync)

    return {
        "status": "success",
        "data": {
            "username": username,
            "role": role,
            "has_personal_key": bool(runtime.get("has_personal_key")),
            "effective": {
                "base_url": str(runtime.get("base_url") or ""),
                "model": str(runtime.get("model") or ""),
                "model_source": str(runtime.get("model_source") or "missing"),
                "model_locked": bool(runtime.get("model_locked")),
                "available_models": runtime.get("available_models") if isinstance(runtime.get("available_models"), list) else [],
                "timeout_seconds": int(runtime.get("timeout_seconds") or DEFAULT_AGENT_TIMEOUT_SECONDS),
                "max_tokens": int(runtime.get("max_tokens") or DEFAULT_AGENT_MAX_TOKENS),
                "temperature": float(runtime.get("temperature") or DEFAULT_AGENT_TEMPERATURE),
                "api_key_source": str(runtime.get("api_key_source") or "missing"),
            },
            "personal": {
                "base_url": str((user_cfg or {}).get("base_url") or ""),
                "model": str((user_cfg or {}).get("model") or ""),
                "system_prompt": str((user_cfg or {}).get("system_prompt") or ""),
                "timeout_seconds": (user_cfg or {}).get("timeout_seconds"),
                "max_tokens": (user_cfg or {}).get("max_tokens"),
                "temperature": (user_cfg or {}).get("temperature"),
                "top_p": _safe_parse_float((user_cfg or {}).get("top_p"), DEFAULT_AGENT_TOP_P, 0.0, 1.0),
                "extra_body": _safe_parse_extra_body((user_cfg or {}).get("extra_body")),
            },
            "default_provider": provider,
        },
    }


@router.post("/user-config")
async def update_agent_user_config(
    payload: AgentUserConfigUpdateRequest,
    session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
    """更新当前用户的个人 Agent 配置。"""
    username = str(session.get("username") or "")
    updates = _model_dump_compat(payload, exclude_unset=True)

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No user agent config fields provided.",
        )

    saved = await asyncio.to_thread(_upsert_agent_user_config_sync, username, updates, username)
    runtime = await asyncio.to_thread(_resolve_effective_agent_runtime_sync, username)

    return {
        "status": "success",
        "message": "User agent config updated.",
        "data": {
            "saved": saved,
            "effective": {
                "base_url": str(runtime.get("base_url") or ""),
                "model": str(runtime.get("model") or ""),
                "model_source": str(runtime.get("model_source") or "missing"),
                "model_locked": bool(runtime.get("model_locked")),
                "available_models": runtime.get("available_models") if isinstance(runtime.get("available_models"), list) else [],
                "timeout_seconds": int(runtime.get("timeout_seconds") or DEFAULT_AGENT_TIMEOUT_SECONDS),
                "max_tokens": int(runtime.get("max_tokens") or DEFAULT_AGENT_MAX_TOKENS),
                "temperature": float(runtime.get("temperature") or DEFAULT_AGENT_TEMPERATURE),
                "api_key_source": str(runtime.get("api_key_source") or "missing"),
            },
        },
    }


@router.get("/models")
async def get_available_models(
    request: Request,
    session: Dict[str, Any] = Depends(require_api_access_or_guest),
    override_base_url: Optional[str] = None,
    override_api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """请求上游模型端点并返回"当前账号真实可用"的模型列表。"""
    username = str(session.get("username") or "")
    fallback_reason = None

    runtime = await asyncio.to_thread(_resolve_effective_agent_runtime_sync, username)

    override_base_url_clean = str(override_base_url or "").strip()
    override_api_key_clean = str(override_api_key or "").strip()

    if override_base_url_clean:
        base_url = _normalize_base_url(override_base_url_clean)
    else:
        base_url = str(runtime.get("base_url") or DEFAULT_AGENT_BASE_URL).strip()

    if override_api_key_clean:
        api_key = override_api_key_clean
        api_key_candidates = [override_api_key_clean]
    else:
        api_key = str(runtime.get("api_key") or "").strip()
        api_key_candidates = list(runtime.get("api_key_candidates") or [api_key])

    current_model = str(runtime.get("model") or "").strip()

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent key is not configured on backend. Please set platform key or personal key first.",
        )

    upstream_models = []
    upstream_endpoint = ""
    upstream_error = None
    try:
        upstream_models, upstream_endpoint = await _call_upstream_models_with_key_candidates(
            request,
            base_url=base_url,
            api_keys=api_key_candidates,
            timeout_seconds=int(runtime.get("timeout_seconds") or DEFAULT_AGENT_TIMEOUT_SECONDS),
        )
    except Exception as e:
        upstream_error = str(e)
        logger.warning(f"Failed to fetch models from upstream: {e}, will try fallback cache")

    if upstream_models and not upstream_error:
        compatible_upstream_models = [
            item for item in upstream_models if bool(item.get("chat_compatible", True))
        ]
        asyncio.create_task(_cache_models_async(compatible_upstream_models))
    elif upstream_error:
        fallback_reason = f"上游服务暂时不可用（{upstream_error}），使用缓存模型列表"
        cached_model_list = _normalize_available_models(
            _get_system_config_values_sync([CONFIG_KEY_AVAILABLE_MODELS]).get(CONFIG_KEY_AVAILABLE_MODELS, "")
        )
        if cached_model_list:
            upstream_models = [{"id": mid, "name": mid} for mid in cached_model_list]
            logger.info(f"Using cached {len(upstream_models)} models as fallback")
        else:
            fallback_reason = "上游服务不可用，且无可用缓存模型。请检查 Agent 配置或联系管理员。"

    compatible_upstream_models = [
        item for item in upstream_models if bool(item.get("chat_compatible", True))
    ]
    incompatible_upstream_models = [
        item for item in upstream_models if not bool(item.get("chat_compatible", True))
    ]

    models: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for item in compatible_upstream_models:
        model_id = str(item.get("id") or "").strip()
        if not model_id or model_id in seen:
            continue

        normalized = {
            "id": model_id,
            "name": str(item.get("name") or model_id).strip() or model_id,
            "owned_by": str(item.get("owned_by") or "").strip(),
            "source": "upstream",
            "is_current": model_id == current_model,
            "api_types": item.get("api_types") if isinstance(item.get("api_types"), list) else [],
            "chat_compatible": True,
        }
        models.append(normalized)
        seen.add(model_id)

    if current_model and current_model not in seen:
        is_current_chat_compatible = True
        for item in incompatible_upstream_models:
            if str(item.get("id") or "").strip() == current_model:
                is_current_chat_compatible = False
                break

        models.insert(
            0,
            {
                "id": current_model,
                "name": f"{current_model} (当前配置)",
                "owned_by": "",
                "source": "configured",
                "is_current": True,
                "chat_compatible": is_current_chat_compatible,
                "note": (
                    "当前模型不支持 openai.chat，请更换为上游可用聊天模型"
                    if not is_current_chat_compatible
                    else "当前模型未出现在上游 /models 列表中"
                ),
            },
        )

    return {
        "status": "success",
        "data": {
            "models": models,
            "current_model": current_model,
            "upstream_endpoint": upstream_endpoint,
            "api_key_source": str(runtime.get("api_key_source") or "missing"),
            "model_count": len(models),
            "upstream_model_total": len(upstream_models),
            "excluded_non_chat_models": len(incompatible_upstream_models),
            **({"fallback_reason": fallback_reason} if fallback_reason else {}),
        },
    }


async def _cache_models_async(models: List[Dict[str, Any]]) -> None:
    """异步包装器，在后台缓存模型列表不阻塞响应。"""
    try:
        await asyncio.to_thread(_cache_available_models_sync, models)
    except Exception as e:
        logger.debug(f"Background model caching failed: {e}")


@router.patch("/user/preference")
async def update_user_model_preference(
    payload: Dict[str, Any],
    session: Dict[str, Any] = Depends(require_api_access_or_guest),
) -> Dict[str, Any]:
    """保存用户的模型偏好设置到 user_preferences 表。"""
    username = str(session.get("username") or "")
    preferred_model = _normalize_model(str(payload.get("preferred_model") or ""))

    if not preferred_model:
        pass

    try:
        _ensure_agent_chat_tables_sync()
        with _db_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_preferences (
                    username TEXT PRIMARY KEY,
                    default_basemap TEXT,
                    language TEXT,
                    unit_system TEXT,
                    preferred_agent_model TEXT,
                    updated_at TEXT
                )
                """
            )

            conn.execute(
                """
                INSERT INTO user_preferences (username, preferred_agent_model, updated_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(username)
                DO UPDATE SET preferred_agent_model = excluded.preferred_agent_model, updated_at = datetime('now')
                """,
                (username, preferred_model),
            )
            conn.commit()
            logger.info(f"User {username} preferred model updated to {preferred_model or '(cleared)'}")
    except Exception as e:
        logger.error(f"Failed to update user model preference: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save model preference: {str(e)}",
        )

    return {
        "status": "success",
        "message": "Model preference updated.",
        "data": {
            "username": username,
            "preferred_model": preferred_model,
        },
    }


@router.post("/chat/proxy")
async def agent_chat_proxy(
    payload: AgentChatProxyRequest,
    request: Request,
    session: Dict[str, Any] = Depends(require_api_access_or_guest),
) -> Dict[str, Any]:
    """用户个人 API Key 代理聊天端点（绕过浏览器 CORS 限制，不消耗平台配额）。"""
    username = str(session.get("username") or "anonymous")
    role = normalize_role(session.get("role"), username)

    api_key = str(payload.api_key or "").strip()
    base_url = str(payload.base_url or "").strip().rstrip("/")
    model = str(payload.model or "").strip()

    if not api_key or not base_url or not model:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="api_key, base_url, model are required.",
        )

    history_items = _sanitize_history(payload.history)

    location_context = str(payload.location_context or "").strip()
    if not location_context:
        client_ip = _extract_client_ip(request)
        ip_location = await _try_get_location_from_ip_async(client_ip)
        if ip_location:
            location_context = ip_location

    user_system_prompt = str(payload.system_prompt or "").strip()
    if not user_system_prompt:
        user_system_prompt = "You are a helpful AI assistant. Reply in concise Chinese unless the user asks for another language."

    system_prompt = _join_system_prompt(user_system_prompt, location_context)

    request_messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
    request_messages.extend(history_items)
    request_messages.append({"role": "user", "content": str(payload.message or "").strip()})

    request_params = json.dumps(
        {
            "endpoint": "/api/agent/chat/proxy",
            "model": model,
            "base_url": base_url,
            "history_len": len(history_items),
            "has_location_context": bool(location_context),
        },
        ensure_ascii=False,
    )

    started_at = time.perf_counter()
    upstream_status = 200
    try:
        upstream_data = await _call_upstream_chat(
            request,
            base_url=base_url,
            api_key=api_key,
            model=model,
            messages=request_messages,
            timeout_seconds=int(payload.timeout_seconds),
            max_tokens=int(payload.max_tokens),
            temperature=float(payload.temperature),
            top_p=float(payload.top_p),
            extra_body=payload.extra_body,
            tools=payload.tools,
            tool_choice=payload.tool_choice,
        )

        reply, tool_calls = _extract_reply_and_tools(upstream_data)

        if not reply and not tool_calls:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Agent upstream returned empty content.",
            )

        data = {
            "reply": reply,
            "model": model,
            "usage": upstream_data.get("usage") if isinstance(upstream_data, dict) else None,
            "mode": "personal-proxy",
        }
        if tool_calls:
            data["tool_calls"] = tool_calls

        return {"status": "success", "data": data}
    except HTTPException as exc:
        upstream_status = int(exc.status_code)
        raise
    finally:
        elapsed_ms = (time.perf_counter() - started_at) * 1000.0
        await _record_agent_call_safe(
            username=username,
            role=role,
            status_code=upstream_status,
            elapsed_ms=elapsed_ms,
            request_params=request_params,
        )
