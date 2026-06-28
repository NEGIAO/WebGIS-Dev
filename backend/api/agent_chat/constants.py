"""
Agent Chat 模块常量、环境变量、配置键名。
"""

import logging
import os
from typing import Any, List

logger = logging.getLogger(__name__)

AGENT_API_KEY_PRIMARY = "agent_api_key"
AGENT_API_KEY_LEGACY = "agent_token"


def _safe_env_int(name: str, fallback: int, minimum: int, maximum: int) -> int:
    raw = str(os.getenv(name, "")).strip()
    if not raw:
        return fallback
    try:
        value = int(raw)
    except Exception:
        return fallback
    return max(minimum, min(maximum, value))


def _safe_env_float(name: str, fallback: float, minimum: float, maximum: float) -> float:
    raw = str(os.getenv(name, "")).strip()
    if not raw:
        return fallback
    try:
        value = float(raw)
    except Exception:
        return fallback
    return max(minimum, min(maximum, value))


AGENT_CHAT_GUEST_DAILY_QUOTA = _safe_env_int("AGENT_CHAT_GUEST_DAILY_QUOTA", 10, 1, 1000)
AGENT_CHAT_REGISTERED_DAILY_QUOTA = _safe_env_int("AGENT_CHAT_REGISTERED_DAILY_QUOTA", 100, 1, 10000)

DEFAULT_AGENT_BASE_URL = str(os.getenv("AGENT_BASE_URL", "https://api.qnaigc.com/v1")).strip() or "https://api.qnaigc.com/v1"
DEFAULT_AGENT_MODEL = str(os.getenv("AGENT_MODEL", "")).strip()
DEFAULT_AGENT_SYSTEM_PROMPT = str(
    os.getenv(
        "AGENT_SYSTEM_PROMPT",
        "You are the WebGIS assistant. Reply in concise Chinese unless the user asks for another language.",
    )
).strip()
DEFAULT_AGENT_TIMEOUT_SECONDS = _safe_env_int("AGENT_TIMEOUT_SECONDS", 45, 5, 180)
DEFAULT_AGENT_MAX_TOKENS = _safe_env_int("AGENT_MAX_TOKENS", 32768, 1, 32768)
DEFAULT_AGENT_TEMPERATURE = _safe_env_float("AGENT_TEMPERATURE", 1.0, 0.0, 2.0)
DEFAULT_AGENT_TOP_P = _safe_env_float("AGENT_TOP_P", 0.95, 0.0, 1.0)
DEFAULT_AGENT_EXTRA_BODY = {
    "chat_template_kwargs": {"enable_thinking": True},
    "reasoning_budget": 16384,
}

CONFIG_KEY_BASE_URL = "agent_base_url"
CONFIG_KEY_MODEL = "agent_model"
CONFIG_KEY_AVAILABLE_MODELS = "agent_available_models"
CONFIG_KEY_SYSTEM_PROMPT = "agent_system_prompt"
CONFIG_KEY_TIMEOUT_SECONDS = "agent_timeout_seconds"
CONFIG_KEY_MAX_TOKENS = "agent_max_tokens"
CONFIG_KEY_TEMPERATURE = "agent_temperature"
CONFIG_KEY_TOP_P = "agent_top_p"
CONFIG_KEY_EXTRA_BODY = "agent_extra_body"
CONFIG_KEY_CHAT_GUEST_DAILY_QUOTA = "agent_chat_guest_daily_quota"
CONFIG_KEY_CHAT_REGISTERED_DAILY_QUOTA = "agent_chat_registered_daily_quota"

# 默认 AI 专属配置键（管理员配置，前端默认使用的 base_url / model / api_key）
CONFIG_KEY_DEFAULT_AI_API_KEY = "default_ai_api_key"
CONFIG_KEY_DEFAULT_AI_BASE_URL = "default_ai_base_url"
CONFIG_KEY_DEFAULT_AI_MODEL = "default_ai_model"

USER_CONFIG_TABLE = "agent_user_config"
