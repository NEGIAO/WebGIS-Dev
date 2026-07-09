"""
Agent Chat 纯工具函数（无数据库、无 HTTP 访问）。
"""

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel

from .constants import DEFAULT_AGENT_BASE_URL, DEFAULT_AGENT_MODEL, DEFAULT_AGENT_SYSTEM_PROMPT


def _model_dump_compat(payload: BaseModel, *, exclude_none: bool = False, exclude_unset: bool = False) -> Dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump(exclude_none=exclude_none, exclude_unset=exclude_unset)
    return payload.dict(exclude_none=exclude_none, exclude_unset=exclude_unset)


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _utc_date_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _normalize_base_url(value: str) -> str:
    normalized = str(value or "").strip().rstrip("/")
    return normalized or DEFAULT_AGENT_BASE_URL.rstrip("/")


def _normalize_model(value: str) -> str:
    return str(value or "").strip()


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
