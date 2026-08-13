"""
Agent Chat 纯工具函数（无数据库、无 HTTP 访问）。
"""

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

# 北京时间（UTC+8）
_BEIJING_TZ = timezone(timedelta(hours=8))

from fastapi import HTTPException, status
from pydantic import BaseModel

from utils.net_guard import (
    LOCAL_HOST_SUFFIXES,
    LOCAL_HOSTNAMES,
    coerce_ip_literal,
    is_disallowed_host,
    is_loopback_host,
)

from .constants import (
    AGENT_ALLOW_INSECURE_BASE_URL,
    AGENT_ALLOWED_BASE_URL_HOSTS,
    DEFAULT_AGENT_BASE_URL,
    DEFAULT_AGENT_MODEL,
    DEFAULT_AGENT_SYSTEM_PROMPT,
)


def _model_dump_compat(payload: BaseModel, *, exclude_none: bool = False, exclude_unset: bool = False) -> Dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump(exclude_none=exclude_none, exclude_unset=exclude_unset)
    return payload.dict(exclude_none=exclude_none, exclude_unset=exclude_unset)


def _iso_now() -> str:
    return datetime.now(_BEIJING_TZ).isoformat()


def _utc_date_str() -> str:
    return datetime.now(_BEIJING_TZ).strftime("%Y-%m-%d")


def _normalize_base_url(value: str) -> str:
    normalized = str(value or "").strip().rstrip("/")
    return normalized or DEFAULT_AGENT_BASE_URL.rstrip("/")


def _normalize_model(value: str) -> str:
    return str(value or "").strip()


# --- override_base_url 安全护栏（方案文档：Docs/TODO/agent-override-key-leak-plan.md） ---
# V3.4.64（P1-4 SSRF S1）：IP 字面量归一与内网判定迁入 utils/net_guard.py 单点共用，
# proxy/download_xyz 三处出站面共享同一判定；下列别名保留原函数名不改调用点与语义。

_LOCAL_HOSTNAMES = LOCAL_HOSTNAMES
_LOCAL_HOST_SUFFIXES = LOCAL_HOST_SUFFIXES
_coerce_ip_literal = coerce_ip_literal
_is_disallowed_override_host = is_disallowed_host
_is_loopback_host = is_loopback_host


def _validate_override_base_url(raw_base_url: str, *, has_override_key: bool) -> str:
    """校验并归一调用方传入的 override_base_url。

    参数：raw_base_url —— 调用方原始值；has_override_key —— 本次请求是否同时带了 override_api_key。
    返回：归一后的 base_url（`_normalize_base_url` 结果）。
    核心逻辑（拒绝即抛 HTTPException 400）：
      ① **成对校验**：只给 base_url 不给 key 时，后端会把平台/个人 Key 发往调用方指定的地址——
         这是本函数存在的首要原因（P1-4 [P0 安全]），必须 fail-closed；
      ② 协议白名单：仅 https；http 仅在 AGENT_ALLOW_INSECURE_BASE_URL=true 且指向回环时放行；
      ③ 私网/回环/保留段拒绝（含整数与短点分写法，见 _coerce_ip_literal）；
      ④ 可选 host 白名单：AGENT_ALLOWED_BASE_URL_HOSTS 非空时才生效（默认空=不限制服务商）。
    """
    candidate = str(raw_base_url or "").strip()
    if not candidate:
        return ""

    if not has_override_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="override_base_url 必须与 override_api_key 同时提供：指定自定义上游时请一并提供该上游的 API Key。",
        )

    parsed = urlparse(candidate if "//" in candidate else f"https://{candidate}")
    scheme = (parsed.scheme or "").lower()
    hostname = parsed.hostname or ""

    if not hostname:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="override_base_url 无效：缺少主机名。",
        )

    if scheme not in {"http", "https"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="override_base_url 仅支持 https:// 协议。",
        )

    if scheme == "http" and not (AGENT_ALLOW_INSECURE_BASE_URL and _is_loopback_host(hostname)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="override_base_url 必须使用 https://（明文 http 会在链路上暴露 API Key）。",
        )

    # 回环 http 放行分支已在上一步单独判定，此处不再重复拒绝本机地址
    if not (scheme == "http" and AGENT_ALLOW_INSECURE_BASE_URL and _is_loopback_host(hostname)):
        if _is_disallowed_override_host(hostname):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="override_base_url 指向内网或本机地址，已拒绝。",
            )

    if AGENT_ALLOWED_BASE_URL_HOSTS:
        normalized_host = hostname.lower().rstrip(".")
        allowed = any(
            normalized_host == item or normalized_host.endswith(f".{item}")
            for item in AGENT_ALLOWED_BASE_URL_HOSTS
        )
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="override_base_url 的主机不在允许列表内，请联系管理员。",
            )

    return _normalize_base_url(candidate)


def _normalize_available_models(raw_value: Any) -> List[str]:
    rows: List[str] = []

    if raw_value is None:
        return rows

    if isinstance(raw_value, str):
        text = raw_value.strip()
        if not text:
            return rows

        parsed: Any = None
        if text.startswith("["):
            try:
                parsed = json.loads(text)
            except Exception:
                parsed = None

        if isinstance(parsed, list):
            raw_list = parsed
        else:
            raw_list = [piece.strip() for piece in text.replace(";", ",").split(",")]
    elif isinstance(raw_value, (list, tuple, set)):
        raw_list = list(raw_value)
    else:
        raw_list = [raw_value]

    seen: set[str] = set()
    for item in raw_list:
        model = _normalize_model(str(item or ""))[:160]
        if not model or model in seen:
            continue
        seen.add(model)
        rows.append(model)

    return rows[:200]


def _pick_runtime_model(
    *,
    user_override_model: str,
    preference_model: str,
    provider_model: str,
) -> Tuple[str, str, bool]:
    """选取运行时模型，优先级：用户覆盖 > 用户偏好 > 管理员配置 > 环境默认值。

    不参与随机选取 —— 随机选取模型功能已废除。
    available_models 仅用于前端展示，不参与运行时模型选取。
    """
    user_override = _normalize_model(user_override_model)
    if user_override:
        return user_override, "user-config", True

    preferred = _normalize_model(preference_model)
    if preferred:
        return preferred, "user-preference", True

    provider_default = _normalize_model(provider_model)
    if provider_default:
        return provider_default, "provider-config", False

    env_default = _normalize_model(DEFAULT_AGENT_MODEL)
    if env_default:
        return env_default, "env-default", False

    return "", "missing", False


def _normalize_system_prompt(value: str) -> str:
    normalized = str(value or "").strip()
    return normalized or DEFAULT_AGENT_SYSTEM_PROMPT


def _safe_parse_int(value: Any, fallback: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except Exception:
        return fallback
    return max(minimum, min(maximum, parsed))


def _safe_parse_float(value: Any, fallback: float, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value)
    except Exception:
        return fallback
    return max(minimum, min(maximum, parsed))
