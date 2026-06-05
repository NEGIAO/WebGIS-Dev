"""
上游 LLM API 调用、消息处理、模型获取、调用记录。
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import HTTPException, Request, status

from api.api_management import record_api_call

from .constants import DEFAULT_AGENT_SYSTEM_PROMPT, logger
from .schemas import AgentChatHistoryItem


def _sanitize_history(history: List[AgentChatHistoryItem]) -> List[Dict[str, Any]]:
    """
    清洗聊天历史。

    - 过滤 system 角色（后端自行构建 system prompt，避免重复）
    - 保留 user/assistant/tool 角色
    - tool 角色消息必须携带 tool_call_id
    """
    items: List[Dict[str, Any]] = []
    for item in history:
        role = str(item.role or "").strip().lower()
        content = str(item.content or "").strip()
        # system 角色由后端统一管理，不从前端 history 中透传
        if role not in {"user", "assistant", "tool"}:
            continue
        # user/assistant 必须有内容；tool 允许空内容（工具可能无输出）
        if role in {"user", "assistant"} and not content:
            continue
        entry: Dict[str, Any] = {"role": role, "content": content}
        # tool 角色消息必须关联 tool_call_id
        if role == "tool":
            tc_id = str(getattr(item, "tool_call_id", None) or "").strip()
            if tc_id:
                entry["tool_call_id"] = tc_id
        items.append(entry)

    return items[-20:]


def _extract_client_ip(request: Request) -> str:
    """从请求中提取客户端 IP 地址。"""
    if "x-forwarded-for" in request.headers:
        return str(request.headers["x-forwarded-for"]).split(",")[0].strip()
    if "x-real-ip" in request.headers:
        return str(request.headers["x-real-ip"]).strip()
    return str(request.client.host or "127.0.0.1")


async def _try_get_location_from_ip_async(ip: str) -> Optional[str]:
    """尝试通过 IP 获取用户地理位置信息。"""
    if not ip or ip == "127.0.0.1" or ip == "::1":
        return None

    amap_key = str(os.getenv("AMAP_WEB_SERVICE_KEY", "")).strip()
    if not amap_key:
        return None

    try:
        timeout = httpx.Timeout(connect=2.0, read=5.0, write=2.0, pool=1.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            url = f"https://restapi.amap.com/v3/ip?ip={ip}&key={amap_key}"
            response = await client.get(url)
            data = response.json()

            if data.get("status") == "1":
                province = str(data.get("province") or "").strip()
                city = str(data.get("city") or "").strip()
                country = str(data.get("country") or "中国").strip()
                adcode = str(data.get("adcode") or "").strip()

                if province:
                    return f"来源=IP定位，省={province}，市={city}，国家={country}，编码={adcode}。"
    except Exception as e:
        logger.debug(f"Failed to geolocate IP {ip}: {e}")

    return None


def _join_system_prompt(base_prompt: str, location_context: Optional[str]) -> str:
    """将基础系统提示词与用户位置上下文合并。"""
    location_text = str(location_context or "").strip()

    if not location_text:
        return base_prompt

    enhanced_prompt = (
        f"{base_prompt}\n\n"
        f"【用户地理位置信息】\n{location_text}\n\n"
        f"请基于用户的地理位置提供相关的WebGIS和地理空间信息服务。"
    )

    return enhanced_prompt


def _coerce_content_text(raw: Any) -> str:
    if isinstance(raw, str):
        return raw

    if isinstance(raw, list):
        fragments: List[str] = []
        for piece in raw:
            if isinstance(piece, str):
                if piece.strip():
                    fragments.append(piece)
                continue

            if isinstance(piece, dict):
                text_value = str(piece.get("text") or piece.get("content") or "").strip()
                if text_value:
                    fragments.append(text_value)
        return "\n".join(fragments).strip()

    return ""


def _extract_assistant_reply(payload: Dict[str, Any]) -> str:
    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0] if isinstance(choices[0], dict) else {}
        message_data = first.get("message") if isinstance(first, dict) else None

        if isinstance(message_data, dict):
            text = _coerce_content_text(message_data.get("content"))
            if text:
                return text

        delta_data = first.get("delta") if isinstance(first, dict) else None
        if isinstance(delta_data, dict):
            text = _coerce_content_text(delta_data.get("content"))
            if text:
                return text

        text = _coerce_content_text(first.get("text") if isinstance(first, dict) else "")
        if text:
            return text

    output_text = _coerce_content_text(payload.get("output_text"))
    if output_text:
        return output_text

    direct_text = _coerce_content_text(payload.get("text"))
    if direct_text:
        return direct_text

    return ""


def _extract_tool_calls(payload: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
    """
    从上游 LLM 响应中提取 tool_calls（OpenAI Function Calling 格式）。

    返回格式：[{"id": "...", "type": "function", "function": {"name": "...", "arguments": "..."}}, ...]
    若无 tool_calls 则返回 None。
    """
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return None

    first = choices[0] if isinstance(choices[0], dict) else {}
    message_data = first.get("message") if isinstance(first, dict) else None
    if not isinstance(message_data, dict):
        return None

    raw_tool_calls = message_data.get("tool_calls")
    if not isinstance(raw_tool_calls, list) or not raw_tool_calls:
        return None

    # 标准化 tool_calls 格式，过滤无效条目
    result = []
    for tc in raw_tool_calls:
        if not isinstance(tc, dict):
            continue
        func = tc.get("function", {})
        tc_id = str(tc.get("id") or "").strip()
        tc_name = str(func.get("name") or "").strip()
        # 过滤空 id 或空 name 的无效 tool_call
        if not tc_id or not tc_name:
            logger.warning("Skipping invalid tool_call: id=%r, name=%r", tc_id, tc_name)
            continue
        result.append({
            "id": tc_id,
            "type": str(tc.get("type") or "function"),
            "function": {
                "name": tc_name,
                "arguments": str(func.get("arguments") or "{}"),
            },
        })

    return result if result else None


def _extract_reply_and_tools(payload: Dict[str, Any]) -> Tuple[str, Optional[List[Dict[str, Any]]]]:
    """
    从上游 LLM 响应中同时提取文本回复和 tool_calls。

    Returns:
        (reply_text, tool_calls_or_none)
    """
    reply = _extract_assistant_reply(payload)
    tool_calls = _extract_tool_calls(payload)
    return reply, tool_calls


async def _call_upstream_chat(
    request: Request,
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: List[Dict[str, str]],
    timeout_seconds: int,
    max_tokens: int,
    temperature: float,
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: Optional[str] = None,
) -> Dict[str, Any]:
    endpoint = f"{base_url.rstrip('/')}/chat/completions"

    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": False,
        "max_tokens": int(max_tokens),
        "temperature": float(temperature),
    }

    # Function Calling 支持：透传 tools 声明给上游 LLM
    if tools and isinstance(tools, list) and len(tools) > 0:
        payload["tools"] = tools
        # tool_choice 支持字符串 ("auto"/"none"/"required") 或对象格式
        if tool_choice is not None:
            payload["tool_choice"] = tool_choice
        else:
            payload["tool_choice"] = "auto"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    client = getattr(request.app.state, "http_client", None)
    should_close = False
    if client is None:
        client = httpx.AsyncClient(follow_redirects=True)
        should_close = True

    try:
        response = await client.post(
            endpoint,
            json=payload,
            headers=headers,
            timeout=max(5, min(180, int(timeout_seconds))),
        )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Agent service timeout. Please try again later.",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Agent service request failed.",
        ) from exc
    finally:
        if should_close:
            await client.aclose()

    if response.status_code == 401 or response.status_code == 403:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent service key is invalid or expired. Please contact admin.",
        )

    if response.status_code == 429:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent service is rate-limited upstream. Please try later.",
        )

    if response.status_code < 200 or response.status_code >= 300:
        detail = f"Agent upstream error (HTTP {response.status_code})."
        try:
            err_payload = response.json()
            err_message = str(
                err_payload.get("error", {}).get("message")
                if isinstance(err_payload.get("error"), dict)
                else err_payload.get("message")
                or ""
            ).strip()
            if err_message:
                detail = f"Agent upstream error: {err_message}"
        except Exception:
            pass

        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    try:
        data = response.json()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Agent upstream returned non-JSON response.",
        ) from exc

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Agent upstream response format is invalid.",
        )

    return data


def _extract_models_from_upstream_payload(payload: Any) -> List[Dict[str, Any]]:
    """从上游 `/models` 响应中提取标准化模型列表。"""
    rows: List[Any] = []
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        if isinstance(payload.get("data"), list):
            rows = payload.get("data") or []
        elif isinstance(payload.get("models"), list):
            rows = payload.get("models") or []
        elif isinstance(payload.get("result"), list):
            rows = payload.get("result") or []

    def _normalize_api_type_tokens(raw_value: Any) -> List[str]:
        tokens: List[str] = []
        if raw_value is None:
            return tokens
        if isinstance(raw_value, str):
            text = raw_value.strip()
            if not text:
                return tokens
            for piece in text.replace("|", ",").replace(";", ",").split(","):
                normalized = str(piece or "").strip().lower()
                if normalized:
                    tokens.append(normalized)
            return tokens
        if isinstance(raw_value, (list, tuple, set)):
            for item in raw_value:
                tokens.extend(_normalize_api_type_tokens(item))
            return tokens
        if isinstance(raw_value, dict):
            for key, value in raw_value.items():
                key_text = str(key or "").strip().lower()
                if isinstance(value, bool):
                    if value and key_text:
                        tokens.append(key_text)
                elif value is not None:
                    tokens.extend(_normalize_api_type_tokens(value))
            return tokens
        return tokens

    def _extract_api_types(row: Dict[str, Any]) -> List[str]:
        candidates = [
            row.get("apiType"),
            row.get("api_type"),
            row.get("apiTypes"),
            row.get("api_types"),
            row.get("supportedApiTypes"),
            row.get("supported_api_types"),
            row.get("apiTypeList"),
            row.get("api_type_list"),
            row.get("abilities"),
            row.get("capabilities"),
            row.get("ability"),
            row.get("type"),
        ]
        merged: List[str] = []
        for candidate in candidates:
            merged.extend(_normalize_api_type_tokens(candidate))
        unique: List[str] = []
        seen_local: set[str] = set()
        for token in merged:
            if token not in seen_local:
                seen_local.add(token)
                unique.append(token)
        return unique

    def _infer_chat_compatible(model_id: str, api_types: List[str]) -> bool:
        if api_types:
            if any("openai.chat" in token or token == "chat" or "chat.completion" in token for token in api_types):
                return True
            if any(
                "embedding" in token
                or "rerank" in token
                or "image" in token
                or "speech" in token
                or "audio" in token
                or "asr" in token
                or "tts" in token
                for token in api_types
            ):
                return False
        model_key = str(model_id or "").strip().lower()
        if not model_key:
            return True
        non_chat_hints = [
            "embedding", "rerank", "whisper", "tts", "asr", "stt",
            "vision", "image", "dalle", "flux", "midjourney",
        ]
        if any(hint in model_key for hint in non_chat_hints):
            return False
        return True

    models: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        if isinstance(row, str):
            model_id = str(row).strip()
            model_name = model_id
            owned_by = ""
            api_types = []
        elif isinstance(row, dict):
            model_id = str(row.get("id") or row.get("model") or row.get("name") or "").strip()
            model_name = str(row.get("name") or row.get("display_name") or model_id).strip() or model_id
            owned_by = str(row.get("owned_by") or row.get("provider") or "").strip()
            api_types = _extract_api_types(row)
        else:
            continue

        if not model_id or model_id in seen:
            continue

        models.append(
            {
                "id": model_id,
                "name": model_name,
                "owned_by": owned_by,
                "source": "upstream",
                "api_types": api_types,
                "chat_compatible": _infer_chat_compatible(model_id, api_types),
            }
        )
        seen.add(model_id)

    return models


async def _call_upstream_models(
    request: Request,
    *,
    base_url: str,
    api_key: str,
    timeout_seconds: int,
) -> Tuple[List[Dict[str, Any]], str]:
    """向上游模型服务请求 `/models`。"""
    normalized_base = str(base_url or "").strip().rstrip("/")
    if not normalized_base:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent base URL is not configured.",
        )

    endpoints = [f"{normalized_base}/models"]
    if not normalized_base.endswith("/v1"):
        endpoints.append(f"{normalized_base}/v1/models")

    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    client = getattr(request.app.state, "http_client", None)
    should_close = False
    if client is None:
        client = httpx.AsyncClient(follow_redirects=True)
        should_close = True

    last_status = 0
    last_detail = ""
    try:
        for endpoint in endpoints:
            try:
                response = await client.get(
                    endpoint,
                    headers=headers,
                    timeout=max(5, min(180, int(timeout_seconds))),
                )
            except httpx.TimeoutException as exc:
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail="Agent models endpoint timeout.",
                ) from exc
            except httpx.RequestError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Agent models request failed.",
                ) from exc

            if response.status_code == 404:
                last_status = 404
                continue

            if response.status_code in {401, 403}:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Agent service key is invalid or expired.",
                )

            if response.status_code == 429:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Agent models request is rate-limited upstream.",
                )

            if response.status_code < 200 or response.status_code >= 300:
                last_status = int(response.status_code)
                try:
                    err_payload = response.json()
                    if isinstance(err_payload, dict):
                        last_detail = str(
                            err_payload.get("error", {}).get("message")
                            if isinstance(err_payload.get("error"), dict)
                            else err_payload.get("message")
                            or ""
                        ).strip()
                except Exception:
                    last_detail = ""
                continue

            try:
                payload = response.json()
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Agent models endpoint returned non-JSON response.",
                ) from exc

            models = _extract_models_from_upstream_payload(payload)
            return models, endpoint

    finally:
        if should_close:
            await client.aclose()

    if last_status == 404:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Agent upstream does not expose a /models endpoint.",
        )

    suffix = f" {last_detail}" if last_detail else ""
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Agent models request failed (HTTP {last_status or 0}).{suffix}",
    )


async def _record_agent_call_safe(
    *,
    username: str,
    role: str,
    status_code: int,
    elapsed_ms: float,
    request_params: Optional[str] = None,
) -> None:
    try:
        await record_api_call(
            username=username,
            role=role,
            endpoint="/api/agent/chat/completions",
            status_code=int(status_code),
            response_time_ms=float(max(0.0, elapsed_ms)),
            request_params=request_params,
        )
    except Exception as exc:
        logger.warning("Failed to record agent call log: %s", str(exc))
