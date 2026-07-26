"""
Agent Chat 模块常量、配置键名。

L1 默认经统一 loader（config）读取，可被根 .env 调整；
运行时以 L2（Admin + system_config）覆盖为准，见 db.py。
"""

import logging
from typing import Any, List

from config import get_float, get_int, get_settings, get_str

logger = logging.getLogger(__name__)

AGENT_API_KEY_PRIMARY = "agent_api_key"
AGENT_API_KEY_LEGACY = "agent_token"

AGENT_CHAT_GUEST_DAILY_QUOTA = get_int("AGENT_CHAT_GUEST_DAILY_QUOTA", 10, minimum=1, maximum=1000)
AGENT_CHAT_REGISTERED_DAILY_QUOTA = get_int("AGENT_CHAT_REGISTERED_DAILY_QUOTA", 100, minimum=1, maximum=10000)

DEFAULT_AGENT_BASE_URL = get_settings().agent_base_url or "https://api.qnaigc.com/v1"
DEFAULT_AGENT_MODEL = get_settings().agent_model
DEFAULT_AGENT_SYSTEM_PROMPT = get_str(
    "AGENT_SYSTEM_PROMPT",
    "You are the WebGIS assistant. Reply in concise Chinese unless the user asks for another language.",
).strip()
DEFAULT_AGENT_TIMEOUT_SECONDS = get_int("AGENT_TIMEOUT_SECONDS", 45, minimum=5, maximum=180)
DEFAULT_AGENT_MAX_TOKENS = get_int("AGENT_MAX_TOKENS", 32768, minimum=1, maximum=32768)
DEFAULT_AGENT_TEMPERATURE = get_float("AGENT_TEMPERATURE", 1.0, minimum=0.0, maximum=2.0)
DEFAULT_AGENT_TOP_P = get_float("AGENT_TOP_P", 0.95, minimum=0.0, maximum=1.0)
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
