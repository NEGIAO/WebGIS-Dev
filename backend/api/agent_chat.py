"""
Agent chat proxy and admin configuration endpoints.

Design goals:
1) Keep third-party LLM keys on backend only.
2) Enforce per-role daily chat quotas (guest/registered/admin).
3) Expose admin-manageable provider settings for long-term maintenance.
"""

import asyncio
import json
import logging
import os
import random
import sqlite3
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from api.api_management import record_api_call
from api.auth import (
    ROLE_ADMIN,
    get_auth_db_connection,
    normalize_role,
    require_admin,
    require_login,
    resolve_quota_subject,
)

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
DEFAULT_AGENT_MAX_TOKENS = _safe_env_int("AGENT_MAX_TOKENS", 512, 1, 8192)
DEFAULT_AGENT_TEMPERATURE = _safe_env_float("AGENT_TEMPERATURE", 0.2, 0.0, 2.0)

CONFIG_KEY_BASE_URL = "agent_base_url"
CONFIG_KEY_MODEL = "agent_model"
CONFIG_KEY_AVAILABLE_MODELS = "agent_available_models"
CONFIG_KEY_SYSTEM_PROMPT = "agent_system_prompt"
CONFIG_KEY_TIMEOUT_SECONDS = "agent_timeout_seconds"
CONFIG_KEY_MAX_TOKENS = "agent_max_tokens"
CONFIG_KEY_TEMPERATURE = "agent_temperature"
CONFIG_KEY_CHAT_GUEST_DAILY_QUOTA = "agent_chat_guest_daily_quota"
CONFIG_KEY_CHAT_REGISTERED_DAILY_QUOTA = "agent_chat_registered_daily_quota"

USER_CONFIG_TABLE = "agent_user_config"


class AgentChatHistoryItem(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=2000)


class AgentChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: List[AgentChatHistoryItem] = Field(default_factory=list, max_items=12)
    location_context: Optional[str] = Field(default=None, max_length=1000)


class AgentConfigUpdateRequest(BaseModel):
    base_url: Optional[str] = Field(default=None, min_length=1, max_length=240)
    model: Optional[str] = Field(default=None, max_length=160)
    available_models: Optional[List[str]] = Field(default=None, max_items=200)
    system_prompt: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    timeout_seconds: Optional[int] = Field(default=None, ge=5, le=180)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=8192)
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    guest_daily_quota: Optional[int] = Field(default=None, ge=1, le=100000)
    registered_daily_quota: Optional[int] = Field(default=None, ge=1, le=100000)
    reset_chat_quota: Optional[bool] = Field(default=None)


class AgentUserConfigUpdateRequest(BaseModel):
    api_key: Optional[str] = Field(default=None, max_length=5000)
    base_url: Optional[str] = Field(default=None, max_length=240)
    model: Optional[str] = Field(default=None, max_length=160)
    system_prompt: Optional[str] = Field(default=None, max_length=2000)
    timeout_seconds: Optional[int] = Field(default=None, ge=5, le=180)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=8192)
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    clear_personal_key: bool = Field(default=False)
    reset_provider_overrides: bool = Field(default=False)


def _model_dump_compat(payload: BaseModel, *, exclude_none: bool = False, exclude_unset: bool = False) -> Dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump(exclude_none=exclude_none, exclude_unset=exclude_unset)
    return payload.dict(exclude_none=exclude_none, exclude_unset=exclude_unset)


def _db_connection() -> sqlite3.Connection:
    return get_auth_db_connection()


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
    available_models: List[str],
) -> Tuple[str, str, bool]:
    user_override = _normalize_model(user_override_model)
    if user_override:
        return user_override, "user-config", True

    preferred = _normalize_model(preference_model)
    if preferred:
        return preferred, "user-preference", True

    pool = _normalize_available_models(available_models)
    if pool:
        return random.choice(pool), "provider-random", False

    provider_default = _normalize_model(provider_model)
    if provider_default:
        return provider_default, "provider-config", False

    env_default = _normalize_model(DEFAULT_AGENT_MODEL)
    if env_default:
        return env_default, "env-default", False

    return "", "missing", False


def _cache_available_models_sync(models: List[Dict[str, Any]]) -> None:
    """
    缓存当前可用模型列表到 system_config 数据库。
    这样即使上游服务临时不可用，仍可使用缓存的模型列表进行随机降级。
    
    参数：
    - models: 标准化的模型字典列表，每个字典至少包含 "id" 字段。
    """
    try:
        _ensure_agent_chat_tables_sync()
        # 提取模型 ID 列表
        model_ids = []
        seen: set[str] = set()
        for model in models:
            model_id = str(model.get("id") or "").strip()
            if model_id and model_id not in seen:
                model_ids.append(model_id)
                seen.add(model_id)

        if not model_ids:
            return

        # 转换为 JSON 格式存储
        cache_value = json.dumps(model_ids)

        with _db_connection() as conn:
            _ensure_system_config_table_sync(conn)
            conn.execute(
                """
                INSERT INTO system_config (key, value, updated_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(key)
                DO UPDATE SET value = excluded.value, updated_at = datetime('now')
                """,
                (CONFIG_KEY_AVAILABLE_MODELS, cache_value),
            )
            conn.commit()
            logger.debug(f"Cached {len(model_ids)} models to system_config")
    except Exception as e:
        logger.warning(f"Failed to cache available models: {e}")


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


def _ensure_system_config_table_sync(conn: sqlite3.Connection) -> None:
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS system_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
    except Exception as e:
        logger.error(f"Failed to ensure system_config table: {e}")
        raise


def _ensure_api_keys_table_sync(conn: sqlite3.Connection) -> None:
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS api_keys (
                key_name TEXT PRIMARY KEY,
                key_value TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                updated_by TEXT
            )
            """
        )
    except Exception as e:
        logger.error(f"Failed to ensure api_keys table: {e}")
        raise


def _ensure_agent_chat_tables_sync() -> None:
    try:
        with _db_connection() as conn:
            _ensure_system_config_table_sync(conn)
            _ensure_api_keys_table_sync(conn)

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_chat_usage_daily (
                    quota_subject TEXT NOT NULL,
                    role TEXT NOT NULL,
                    usage_date TEXT NOT NULL,
                    calls INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (quota_subject, usage_date)
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_agent_chat_usage_role_date
                ON agent_chat_usage_daily(role, usage_date)
                """
            )

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_user_config (
                    username TEXT PRIMARY KEY,
                    api_key TEXT,
                    base_url TEXT,
                    model TEXT,
                    system_prompt TEXT,
                    timeout_seconds INTEGER,
                    max_tokens INTEGER,
                    temperature REAL,
                    updated_at TEXT NOT NULL,
                    updated_by TEXT
                )
                """
            )

            try:
                user_cfg_cols = conn.execute("PRAGMA table_info(agent_user_config)").fetchall()
                user_cfg_col_names = {str(dict(row).get("name") or "") for row in user_cfg_cols}
            except Exception as e:
                logger.warning(f"Failed to get user_config columns: {e}")
                user_cfg_col_names = set()

            cols_to_add = [
                ("api_key", "TEXT"), 
                ("base_url", "TEXT"), 
                ("model", "TEXT"),
                ("system_prompt", "TEXT"), 
                ("timeout_seconds", "INTEGER"),
                ("max_tokens", "INTEGER"), 
                ("temperature", "REAL"),
                ("updated_by", "TEXT")
            ]
            for col_name, col_type in cols_to_add:
                if col_name not in user_cfg_col_names:
                    try:
                        conn.execute(f"ALTER TABLE agent_user_config ADD COLUMN {col_name} {col_type}")
                    except Exception as e:
                        logger.debug(f"{col_name} may exist: {e}")

            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_agent_user_config_updated_at ON agent_user_config(updated_at)"
            )
            conn.commit()
            logger.debug("Agent chat tables synced successfully")
    except Exception as e:
        logger.error(f"Failed to ensure agent chat tables: {e}")
        raise


def _read_agent_user_config_row_sync(username: str) -> Optional[Dict[str, Any]]:
    _ensure_agent_chat_tables_sync()
    try:
        with _db_connection() as conn:
            # 确保表存在
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_user_config (
                    username TEXT PRIMARY KEY,
                    api_key TEXT,
                    base_url TEXT,
                    model TEXT,
                    system_prompt TEXT,
                    timeout_seconds INTEGER,
                    max_tokens INTEGER,
                    temperature REAL,
                    updated_at TEXT NOT NULL,
                    updated_by TEXT
                )
                """
            )
            row = conn.execute(
                """
                SELECT username, api_key, base_url, model, system_prompt,
                       timeout_seconds, max_tokens, temperature, updated_at, updated_by
                FROM agent_user_config
                WHERE username = ?
                """,
                (str(username or "").strip(),),
            ).fetchone()

        return dict(row) if row else None
    except Exception as e:
        logger.error(f"Failed to read agent user config for {username}: {e}")
        return None


def _upsert_agent_user_config_sync(username: str, updates: Dict[str, Any], updated_by: str = "self") -> Dict[str, Any]:
    _ensure_agent_chat_tables_sync()

    normalized_username = str(username or "").strip()
    if not normalized_username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid username.")

    try:
        existing = _read_agent_user_config_row_sync(normalized_username) or {"username": normalized_username}
    except Exception as e:
        logger.error(f"Failed to read existing user config: {e}")
        existing = {"username": normalized_username}
    merged = dict(existing)

    def _normalize_optional_text(key: str, max_len: int) -> Optional[str]:
        raw = updates.get(key)
        if raw is None:
            return merged.get(key)
        text = str(raw).strip()
        if not text:
            return None
        return text[:max_len]

    merged["api_key"] = _normalize_optional_text("api_key", 5000)
    merged["base_url"] = _normalize_optional_text("base_url", 240)
    merged["model"] = _normalize_optional_text("model", 160)
    merged["system_prompt"] = _normalize_optional_text("system_prompt", 2000)

    if "timeout_seconds" in updates:
        merged["timeout_seconds"] = _safe_parse_int(updates.get("timeout_seconds"), DEFAULT_AGENT_TIMEOUT_SECONDS, 5, 180)
    if "max_tokens" in updates:
        merged["max_tokens"] = _safe_parse_int(updates.get("max_tokens"), DEFAULT_AGENT_MAX_TOKENS, 1, 8192)
    if "temperature" in updates:
        merged["temperature"] = _safe_parse_float(updates.get("temperature"), DEFAULT_AGENT_TEMPERATURE, 0.0, 2.0)

    if bool(updates.get("clear_personal_key")):
        merged["api_key"] = None

    if bool(updates.get("reset_provider_overrides")):
        merged["base_url"] = None
        merged["model"] = None
        merged["system_prompt"] = None
        merged["timeout_seconds"] = None
        merged["max_tokens"] = None
        merged["temperature"] = None

    merged["updated_at"] = _iso_now()
    merged["updated_by"] = str(updated_by or "self")[:64]

    try:
        with _db_connection() as conn:
            # 确保表存在
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_user_config (
                    username TEXT PRIMARY KEY,
                    api_key TEXT,
                    base_url TEXT,
                    model TEXT,
                    system_prompt TEXT,
                    timeout_seconds INTEGER,
                    max_tokens INTEGER,
                    temperature REAL,
                    updated_at TEXT NOT NULL,
                    updated_by TEXT
                )
                """
            )
            conn.execute(
                """
                INSERT INTO agent_user_config (
                    username, api_key, base_url, model, system_prompt,
                    timeout_seconds, max_tokens, temperature, updated_at, updated_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(username)
                DO UPDATE SET
                    api_key = excluded.api_key,
                    base_url = excluded.base_url,
                    model = excluded.model,
                    system_prompt = excluded.system_prompt,
                    timeout_seconds = excluded.timeout_seconds,
                    max_tokens = excluded.max_tokens,
                    temperature = excluded.temperature,
                    updated_at = excluded.updated_at,
                    updated_by = excluded.updated_by
                """,
                (
                    normalized_username,
                    merged.get("api_key"),
                    merged.get("base_url"),
                    merged.get("model"),
                    merged.get("system_prompt"),
                    merged.get("timeout_seconds"),
                    merged.get("max_tokens"),
                    merged.get("temperature"),
                    merged.get("updated_at"),
                    merged.get("updated_by"),
                ),
            )
            conn.commit()
            logger.info(f"User agent config updated for {normalized_username}")
    except Exception as e:
        logger.error(f"Failed to upsert user agent config: {e}")
        raise

    row = _read_agent_user_config_row_sync(normalized_username) or {}
    return {
        "username": normalized_username,
        "has_personal_key": bool(str(row.get("api_key") or "").strip()),
        "provider_overrides": {
            "base_url": str(row.get("base_url") or "").strip(),
            "model": str(row.get("model") or "").strip(),
            "system_prompt": str(row.get("system_prompt") or "").strip(),
            "timeout_seconds": row.get("timeout_seconds"),
            "max_tokens": row.get("max_tokens"),
            "temperature": row.get("temperature"),
        },
        "updated_at": str(row.get("updated_at") or ""),
        "updated_by": str(row.get("updated_by") or ""),
    }


def _resolve_effective_agent_runtime_sync(username: str) -> Dict[str, Any]:
    provider = _get_agent_provider_config_sync()
    key_info = _resolve_agent_api_key_sync()
    user_cfg = _read_agent_user_config_row_sync(username) or {}

    pref_row = None
    try:
        with _db_connection() as conn:
            pref_row = conn.execute(
                "SELECT preferred_agent_model FROM user_preferences WHERE username = ?",
                (str(username or "").strip(),),
            ).fetchone()
    except Exception:
        pref_row = None

    preferred_model = ""
    if pref_row:
        preferred_model = _normalize_model((dict(pref_row).get("preferred_agent_model") or ""))

    personal_key = str(user_cfg.get("api_key") or "").strip()
    use_personal_key = bool(personal_key)
    available_models = _normalize_available_models(provider.get("available_models") or [])
    runtime_model, runtime_model_source, runtime_model_locked = _pick_runtime_model(
        user_override_model=str(user_cfg.get("model") or ""),
        preference_model=preferred_model,
        provider_model=str(provider.get("model") or ""),
        available_models=available_models,
    )

    effective = {
        "base_url": _normalize_base_url(str(user_cfg.get("base_url") or provider.get("base_url") or DEFAULT_AGENT_BASE_URL)),
        "model": runtime_model,
        "model_source": runtime_model_source,
        "model_locked": bool(runtime_model_locked),
        "available_models": available_models,
        "system_prompt": _normalize_system_prompt(str(user_cfg.get("system_prompt") or provider.get("system_prompt") or DEFAULT_AGENT_SYSTEM_PROMPT)),
        "timeout_seconds": _safe_parse_int(user_cfg.get("timeout_seconds"), int(provider.get("timeout_seconds") or DEFAULT_AGENT_TIMEOUT_SECONDS), 5, 180),
        "max_tokens": _safe_parse_int(user_cfg.get("max_tokens"), int(provider.get("max_tokens") or DEFAULT_AGENT_MAX_TOKENS), 1, 8192),
        "temperature": _safe_parse_float(user_cfg.get("temperature"), float(provider.get("temperature") or DEFAULT_AGENT_TEMPERATURE), 0.0, 2.0),
        "api_key": personal_key if use_personal_key else str(key_info.get("key_value") or "").strip(),
        "api_key_source": "user-personal" if use_personal_key else str(key_info.get("source") or "missing"),
        "has_personal_key": use_personal_key,
    }

    return effective


def _get_system_config_values_sync(keys: List[str]) -> Dict[str, str]:
    _ensure_agent_chat_tables_sync()
    if not keys:
        return {}

    placeholders = ", ".join(["?"] * len(keys))
    sql = f"SELECT key, value FROM system_config WHERE key IN ({placeholders})"

    try:
        with _db_connection() as conn:
            # 确保表存在
            _ensure_system_config_table_sync(conn)
            rows = conn.execute(sql, tuple(keys)).fetchall()

        result: Dict[str, str] = {}
        for row in rows:
            item = dict(row)
            key = str(item.get("key") or "").strip()
            value = str(item.get("value") or "")
            if key:
                result[key] = value
        return result
    except Exception as e:
        logger.error(f"Failed to get system config values: {e}")
        return {}


def _get_agent_provider_config_sync() -> Dict[str, Any]:
    config_values = _get_system_config_values_sync(
        [
            CONFIG_KEY_BASE_URL,
            CONFIG_KEY_MODEL,
            CONFIG_KEY_AVAILABLE_MODELS,
            CONFIG_KEY_SYSTEM_PROMPT,
            CONFIG_KEY_TIMEOUT_SECONDS,
            CONFIG_KEY_MAX_TOKENS,
            CONFIG_KEY_TEMPERATURE,
        ]
    )

    base_url = _normalize_base_url(config_values.get(CONFIG_KEY_BASE_URL, DEFAULT_AGENT_BASE_URL))
    model = _normalize_model(config_values.get(CONFIG_KEY_MODEL, DEFAULT_AGENT_MODEL))
    available_models = _normalize_available_models(config_values.get(CONFIG_KEY_AVAILABLE_MODELS, ""))
    system_prompt = _normalize_system_prompt(
        config_values.get(CONFIG_KEY_SYSTEM_PROMPT, DEFAULT_AGENT_SYSTEM_PROMPT)
    )

    timeout_seconds = _safe_parse_int(
        config_values.get(CONFIG_KEY_TIMEOUT_SECONDS),
        DEFAULT_AGENT_TIMEOUT_SECONDS,
        5,
        180,
    )
    max_tokens = _safe_parse_int(
        config_values.get(CONFIG_KEY_MAX_TOKENS),
        DEFAULT_AGENT_MAX_TOKENS,
        1,
        8192,
    )
    temperature = _safe_parse_float(
        config_values.get(CONFIG_KEY_TEMPERATURE),
        DEFAULT_AGENT_TEMPERATURE,
        0.0,
        2.0,
    )

    return {
        "base_url": base_url,
        "model": model,
        "available_models": available_models,
        "system_prompt": system_prompt,
        "timeout_seconds": timeout_seconds,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }


def _get_agent_chat_quota_policy_sync() -> Dict[str, Optional[int]]:
    config_values = _get_system_config_values_sync(
        [
            CONFIG_KEY_CHAT_GUEST_DAILY_QUOTA,
            CONFIG_KEY_CHAT_REGISTERED_DAILY_QUOTA,
        ]
    )

    guest_quota = _safe_parse_int(
        config_values.get(CONFIG_KEY_CHAT_GUEST_DAILY_QUOTA),
        AGENT_CHAT_GUEST_DAILY_QUOTA,
        1,
        100000,
    )
    registered_quota = _safe_parse_int(
        config_values.get(CONFIG_KEY_CHAT_REGISTERED_DAILY_QUOTA),
        AGENT_CHAT_REGISTERED_DAILY_QUOTA,
        1,
        100000,
    )

    return {
        "guest": guest_quota,
        "registered": registered_quota,
        "admin": None,
    }


def _delete_system_config_keys_sync(keys: List[str]) -> None:
    normalized_keys = [str(key or "").strip() for key in (keys or []) if str(key or "").strip()]
    if not normalized_keys:
        return

    placeholders = ", ".join(["?"] * len(normalized_keys))
    sql = f"DELETE FROM system_config WHERE key IN ({placeholders})"

    with _db_connection() as conn:
        _ensure_system_config_table_sync(conn)
        conn.execute(sql, tuple(normalized_keys))
        conn.commit()


def _set_agent_provider_config_sync(updates: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_agent_chat_tables_sync()

    now_iso = _iso_now()
    rows_to_upsert: List[Tuple[str, str, str]] = []

    if bool(updates.get("reset_chat_quota")):
        _delete_system_config_keys_sync(
            [
                CONFIG_KEY_CHAT_GUEST_DAILY_QUOTA,
                CONFIG_KEY_CHAT_REGISTERED_DAILY_QUOTA,
            ]
        )

    if "base_url" in updates:
        rows_to_upsert.append((CONFIG_KEY_BASE_URL, _normalize_base_url(str(updates["base_url"])), now_iso))
    if "model" in updates:
        rows_to_upsert.append((CONFIG_KEY_MODEL, _normalize_model(str(updates["model"])), now_iso))
    if "available_models" in updates:
        rows_to_upsert.append(
            (
                CONFIG_KEY_AVAILABLE_MODELS,
                json.dumps(_normalize_available_models(updates.get("available_models")), ensure_ascii=False),
                now_iso,
            )
        )
    if "system_prompt" in updates:
        rows_to_upsert.append(
            (CONFIG_KEY_SYSTEM_PROMPT, _normalize_system_prompt(str(updates["system_prompt"])), now_iso)
        )
    if "timeout_seconds" in updates:
        rows_to_upsert.append(
            (
                CONFIG_KEY_TIMEOUT_SECONDS,
                str(_safe_parse_int(updates["timeout_seconds"], DEFAULT_AGENT_TIMEOUT_SECONDS, 5, 180)),
                now_iso,
            )
        )
    if "max_tokens" in updates:
        rows_to_upsert.append(
            (
                CONFIG_KEY_MAX_TOKENS,
                str(_safe_parse_int(updates["max_tokens"], DEFAULT_AGENT_MAX_TOKENS, 1, 8192)),
                now_iso,
            )
        )
    if "temperature" in updates:
        rows_to_upsert.append(
            (
                CONFIG_KEY_TEMPERATURE,
                str(_safe_parse_float(updates["temperature"], DEFAULT_AGENT_TEMPERATURE, 0.0, 2.0)),
                now_iso,
            )
        )
    if "guest_daily_quota" in updates:
        rows_to_upsert.append(
            (
                CONFIG_KEY_CHAT_GUEST_DAILY_QUOTA,
                str(_safe_parse_int(updates["guest_daily_quota"], AGENT_CHAT_GUEST_DAILY_QUOTA, 1, 100000)),
                now_iso,
            )
        )
    if "registered_daily_quota" in updates:
        rows_to_upsert.append(
            (
                CONFIG_KEY_CHAT_REGISTERED_DAILY_QUOTA,
                str(
                    _safe_parse_int(
                        updates["registered_daily_quota"],
                        AGENT_CHAT_REGISTERED_DAILY_QUOTA,
                        1,
                        100000,
                    )
                ),
                now_iso,
            )
        )

    if rows_to_upsert:
        try:
            with _db_connection() as conn:
                # 确保表存在
                _ensure_system_config_table_sync(conn)
                conn.executemany(
                    """
                    INSERT INTO system_config (key, value, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(key)
                    DO UPDATE SET
                        value = excluded.value,
                        updated_at = excluded.updated_at
                    """,
                    rows_to_upsert,
                )
                conn.commit()
                logger.info(f"Agent config updated with {len(rows_to_upsert)} rows")
        except Exception as e:
            logger.error(f"Failed to set agent provider config: {e}")
            raise

    return _get_agent_provider_config_sync()


def _get_api_key_row_sync(key_name: str) -> Optional[Dict[str, Any]]:
    _ensure_agent_chat_tables_sync()

    with _db_connection() as conn:
        row = conn.execute(
            "SELECT key_name, key_value, updated_at FROM api_keys WHERE key_name = ?",
            (key_name,),
        ).fetchone()

    if row is None:
        return None

    raw = dict(row)
    return {
        "key_name": str(raw.get("key_name") or "").strip(),
        "key_value": str(raw.get("key_value") or ""),
        "updated_at": str(raw.get("updated_at") or ""),
    }


def _resolve_agent_api_key_sync() -> Dict[str, Any]:
    primary = _get_api_key_row_sync(AGENT_API_KEY_PRIMARY)
    if primary and str(primary.get("key_value") or "").strip():
        return {
            "key_name": AGENT_API_KEY_PRIMARY,
            "key_value": str(primary.get("key_value") or "").strip(),
            "updated_at": str(primary.get("updated_at") or ""),
            "source": "db-primary",
        }

    legacy = _get_api_key_row_sync(AGENT_API_KEY_LEGACY)
    if legacy and str(legacy.get("key_value") or "").strip():
        return {
            "key_name": AGENT_API_KEY_LEGACY,
            "key_value": str(legacy.get("key_value") or "").strip(),
            "updated_at": str(legacy.get("updated_at") or ""),
            "source": "db-legacy",
        }

    env_key = str(os.getenv("AGENT_API_KEY", "") or "").strip() or str(os.getenv("AGENT_TOKEN", "") or "").strip()
    if env_key:
        return {
            "key_name": "env",
            "key_value": env_key,
            "updated_at": "",
            "source": "env",
        }

    return {
        "key_name": AGENT_API_KEY_PRIMARY,
        "key_value": "",
        "updated_at": "",
        "source": "missing",
    }


def _get_agent_key_status_sync() -> Dict[str, Any]:
    resolved = _resolve_agent_api_key_sync()
    return {
        "key_name": str(resolved.get("key_name") or AGENT_API_KEY_PRIMARY),
        "is_set": bool(str(resolved.get("key_value") or "").strip()),
        "updated_at": str(resolved.get("updated_at") or ""),
        "source": str(resolved.get("source") or "missing"),
    }


def _get_agent_chat_daily_limit(role: str, username: str) -> Optional[int]:
    normalized_role = normalize_role(role, username)
    quota_policy = _get_agent_chat_quota_policy_sync()
    if normalized_role == ROLE_ADMIN:
        return None
    if normalized_role == "guest":
        return int(quota_policy.get("guest") or AGENT_CHAT_GUEST_DAILY_QUOTA)
    return int(quota_policy.get("registered") or AGENT_CHAT_REGISTERED_DAILY_QUOTA)


def _check_agent_chat_quota_sync(username: str, role: str, quota_subject: str) -> Dict[str, Any]:
    _ensure_agent_chat_tables_sync()

    normalized_role = normalize_role(role, username)
    normalized_subject = str(quota_subject or "").strip() or str(username or "").strip() or "unknown"
    usage_date = _utc_date_str()
    daily_limit = _get_agent_chat_daily_limit(role, username)

    if normalized_role == ROLE_ADMIN:
        return {
            "allowed": True,
            "limit": None,
            "used": 0,
            "remaining": None,
            "usage_date": usage_date,
            "quota_subject": normalized_subject,
        }

    used = 0
    try:
        with _db_connection() as conn:
            row = conn.execute(
                """
                SELECT calls FROM agent_chat_usage_daily
                WHERE quota_subject = ? AND usage_date = ?
                """,
                (normalized_subject, usage_date),
            ).fetchone()
        used = int((dict(row).get("calls") if row else 0) or 0)
    except Exception as e:
        logger.error(f"Failed to precheck quota for {username}: {e}")

    remaining = None if daily_limit is None else max(0, daily_limit - used)
    allowed = bool(daily_limit is None or used < daily_limit)

    return {
        "allowed": allowed,
        "limit": daily_limit,
        "used": used,
        "remaining": remaining,
        "usage_date": usage_date,
        "quota_subject": normalized_subject,
    }


def _consume_agent_chat_quota_sync(username: str, role: str, quota_subject: str) -> Dict[str, Any]:
    _ensure_agent_chat_tables_sync()

    normalized_role = normalize_role(role, username)
    normalized_subject = str(quota_subject or "").strip() or str(username or "").strip() or "unknown"
    usage_date = _utc_date_str()
    now_iso = _iso_now()

    daily_limit = _get_agent_chat_daily_limit(role, username)
    if normalized_role == ROLE_ADMIN:
        logger.debug(f"Admin {username} has unlimited quota")
        return {
            "allowed": True,
            "limit": None,
            "used": 0,
            "remaining": None,
            "usage_date": usage_date,
            "quota_subject": normalized_subject,
        }

    try:
        with _db_connection() as conn:
            row = conn.execute(
                """
                SELECT calls FROM agent_chat_usage_daily
                WHERE quota_subject = ? AND usage_date = ?
                """,
                (normalized_subject, usage_date),
            ).fetchone()

            used = int((dict(row).get("calls") if row else 0) or 0)
            if daily_limit is not None and used >= daily_limit:
                logger.warning(f"User {username} quota exceeded: {used}/{daily_limit}")
                return {
                    "allowed": False,
                    "limit": daily_limit,
                    "used": used,
                    "remaining": 0,
                    "usage_date": usage_date,
                    "quota_subject": normalized_subject,
                }

            conn.execute(
                """
                INSERT INTO agent_chat_usage_daily (quota_subject, role, usage_date, calls, updated_at)
                VALUES (?, ?, ?, 1, ?)
                ON CONFLICT(quota_subject, usage_date)
                DO UPDATE SET
                    role = excluded.role,
                    calls = agent_chat_usage_daily.calls + 1,
                    updated_at = excluded.updated_at
                """,
                (normalized_subject, normalized_role, usage_date, now_iso),
            )
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to consume quota for {username}: {e}")
        raise

    next_used = used + 1
    remaining = None if daily_limit is None else max(0, daily_limit - next_used)
    
    logger.debug(f"User {username} quota after consume: {next_used}/{daily_limit}")

    return {
        "allowed": True,
        "limit": daily_limit,
        "used": next_used,
        "remaining": remaining,
        "usage_date": usage_date,
        "quota_subject": normalized_subject,
    }


def _get_agent_chat_quota_snapshot_sync(username: str, role: str, quota_subject: str) -> Dict[str, Any]:
    _ensure_agent_chat_tables_sync()

    normalized_subject = str(quota_subject or "").strip() or str(username or "").strip() or "unknown"
    usage_date = _utc_date_str()
    daily_limit = _get_agent_chat_daily_limit(role, username)

    if normalize_role(role, username) == ROLE_ADMIN:
        logger.debug(f"Admin {username} quota snapshot: unlimited")
        return {
            "limit": None,
            "used": 0,
            "remaining": None,
            "usage_date": usage_date,
            "quota_subject": normalized_subject,
        }

    try:
        with _db_connection() as conn:
            row = conn.execute(
                """
                SELECT calls FROM agent_chat_usage_daily
                WHERE quota_subject = ? AND usage_date = ?
                """,
                (normalized_subject, usage_date),
            ).fetchone()

        used = int((dict(row).get("calls") if row else 0) or 0)
    except Exception as e:
        logger.error(f"Failed to get quota snapshot for {username}: {e}")
        used = 0
    
    remaining = None if daily_limit is None else max(0, daily_limit - used)
    
    logger.debug(f"User {username} quota snapshot: {used}/{daily_limit} remaining={remaining}")

    return {
        "limit": daily_limit,
        "used": used,
        "remaining": remaining,
        "usage_date": usage_date,
        "quota_subject": normalized_subject,
    }


def _sanitize_history(history: List[AgentChatHistoryItem]) -> List[Dict[str, str]]:
    items: List[Dict[str, str]] = []
    for item in history:
        role = str(item.role or "").strip().lower()
        content = str(item.content or "").strip()
        if role not in {"user", "assistant"}:
            continue
        if not content:
            continue
        items.append({"role": role, "content": content})

    return items[-12:]


def _extract_client_ip(request: Request) -> str:
    """
    从请求中提取客户端 IP 地址。
    支持代理场景（X-Forwarded-For, X-Real-IP）。
    """
    if "x-forwarded-for" in request.headers:
        return str(request.headers["x-forwarded-for"]).split(",")[0].strip()
    if "x-real-ip" in request.headers:
        return str(request.headers["x-real-ip"]).strip()
    return str(request.client.host or "127.0.0.1")


async def _try_get_location_from_ip_async(ip: str) -> Optional[str]:
    """
    尝试通过 IP 获取用户地理位置信息（省市县等）。
    若获取成功，返回格式化的位置字符串；否则返回 None。
    
    注：仅在用户未明确提供位置上下文时使用，作为备选方案。
    """
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
                
                # 只有在获得至少省份信息时才返回
                if province:
                    return f"来源=IP定位，省={province}，市={city}，国家={country}，编码={adcode}。"
    except Exception as e:
        logger.debug(f"Failed to geolocate IP {ip}: {e}")
    
    return None


def _join_system_prompt(base_prompt: str, location_context: Optional[str]) -> str:
    """
    将基础系统提示词与用户位置上下文合并。
    位置上下文总是附加到系统提示词中，以确保 Agent 能够理解用户的地理位置信息。
    """
    location_text = str(location_context or "").strip()
    
    if not location_text:
        return base_prompt
    
    # 为 WebGIS Agent 增强系统提示词，确保它理解用户的地理位置
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
) -> Dict[str, Any]:
    endpoint = f"{base_url.rstrip('/')}/chat/completions"

    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": False,
        "max_tokens": int(max_tokens),
        "temperature": float(temperature),
    }

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
            "embedding",
            "rerank",
            "whisper",
            "tts",
            "asr",
            "stt",
            "vision",
            "image",
            "dalle",
            "flux",
            "midjourney",
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
        elif isinstance(row, dict):
            model_id = str(row.get("id") or row.get("model") or row.get("name") or "").strip()
            model_name = str(row.get("name") or row.get("display_name") or model_id).strip() or model_id
            owned_by = str(row.get("owned_by") or row.get("provider") or "").strip()
            api_types = _extract_api_types(row)
        else:
            continue

        if not isinstance(row, dict):
            api_types = []

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
    """向上游模型服务请求 `/models`，返回可用模型列表和命中的端点。"""
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


router = APIRouter(tags=["agent-chat"])


@router.get("/api/agent/chat/config")
async def get_agent_chat_config(
    session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
    """
    功能：获取当前登录用户的 Agent 服务状态、模型和当日配额快照。

    参数：
    - session: 登录会话（`require_login` 注入），用于识别用户与角色。

    返回：
    - service_ready: 后端是否具备可调用条件（base_url/model/key）。
    - model: 当前生效模型。
    - quota: 当日调用配额使用情况。
    - key_status/provider: 当前密钥来源与运行参数快照。

    处理过程：
    1. 解析用户名、角色和 quota_subject。
    2. 读取用户生效运行时配置。
    3. 读取当日配额快照并统一返回。
    """
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
            },
        },
    }


@router.post("/api/agent/chat/completions")
async def agent_chat_completions(
    payload: AgentChatRequest,
    request: Request,
    session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
    """
    功能：代理用户对话请求到上游 LLM，并执行配额与安全控制。

    参数：
    - payload.message: 用户本轮问题。
    - payload.history: 近几轮历史消息（仅 user/assistant，最多 12 条）。
    - payload.location_context: 首轮可选地理上下文。
    - session: 登录会话。

    返回：
    - reply: 模型回复文本。
    - model: 本次调用的生效模型。
    - quota: 调用后的当日配额。
    - usage: 上游返回的 token 使用统计（若提供）。

    处理过程：
    1. 消耗并校验配额；
    2. 若客户端未提供位置上下文，自动从用户 IP 获取地理位置信息；
    3. 组装 system/history/user 消息，始终附带用户地理位置；
    4. 调用上游 `/chat/completions`；
    5. 解析回复并记录调用日志。
    """
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
    api_key = str(runtime.get("api_key") or "").strip()
    runtime_model = str(runtime.get("model") or "").strip()
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
    
    # 获取或构建位置上下文
    location_context = str(payload.location_context or "").strip()
    
    # 如果客户端未提供位置上下文，尝试从 IP 获取
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
        },
        ensure_ascii=False,
    )

    started_at = time.perf_counter()
    upstream_status = 200
    try:
        upstream_data = await _call_upstream_chat(
            request,
            base_url=str(runtime.get("base_url") or DEFAULT_AGENT_BASE_URL),
            api_key=api_key,
            model=runtime_model,
            messages=request_messages,
            timeout_seconds=int(runtime.get("timeout_seconds") or DEFAULT_AGENT_TIMEOUT_SECONDS),
            max_tokens=int(runtime.get("max_tokens") or DEFAULT_AGENT_MAX_TOKENS),
            temperature=float(runtime.get("temperature") or DEFAULT_AGENT_TEMPERATURE),
        )

        reply = _extract_assistant_reply(upstream_data)
        if not reply:
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

        return {
            "status": "success",
            "data": {
                "reply": reply,
                "model": runtime_model,
                "model_source": str(runtime.get("model_source") or "unknown"),
                "quota": quota_after,
                "usage": upstream_data.get("usage") if isinstance(upstream_data, dict) else None,
                "api_key_source": str(runtime.get("api_key_source") or "unknown"),
            },
        }
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
                    "请在“我的 Agent 配置”中改为上游可用聊天模型，"
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


@router.get("/api/admin/agent/config")
async def admin_get_agent_config(
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """
    功能：管理员读取平台级 Agent 配置、密钥状态和配额策略。

    参数：
    - _session: 管理员会话（`require_admin` 注入）。

    返回：
    - provider: 平台默认 base_url/model/system_prompt/timeout 等。
    - key_status: 当前后端密钥是否存在及来源。
    - chat_quota: guest/registered/admin 对话限额策略。
    """
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


@router.post("/api/admin/agent/config")
async def admin_update_agent_config(
    payload: AgentConfigUpdateRequest,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """
    功能：管理员更新平台级 Agent 默认配置。

    参数：
    - payload: 可选更新字段（base_url/model/system_prompt/timeout/max_tokens/temperature/guest_daily_quota/registered_daily_quota/reset_chat_quota）。

    返回：
    - provider: 更新后并标准化的完整平台配置。

    处理过程：
    1. 过滤未提交字段；
    2. 校验并写入 system_config；
    3. 返回生效配置快照。
    """
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


@router.get("/api/agent/user-config")
async def get_agent_user_config(
    session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
    """
    功能：读取当前用户的 Agent 配置（个人覆盖 + 生效结果）。

    参数：
    - session: 登录会话。

    返回：
    - effective: 最终生效参数（已合并平台默认与个人覆盖）。
    - personal: 用户个人覆盖项（仅本人可见）。
    - default_provider: 平台默认配置。
    """
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
            },
            "default_provider": provider,
        },
    }


@router.post("/api/agent/user-config")
async def update_agent_user_config(
    payload: AgentUserConfigUpdateRequest,
    session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
    """
    功能：更新当前用户的个人 Agent 配置。

    参数：
    - payload: 个人密钥、模型、base_url、提示词、超时、采样参数等。
      支持 `clear_personal_key` 和 `reset_provider_overrides` 两种快捷操作。

    返回：
    - saved: 本次写入后的用户配置记录。
    - effective: 合并后的生效运行参数。
    """
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


@router.get("/api/agent/models")
async def get_available_models(
    request: Request,
    session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
    """
    功能：请求上游模型端点并返回“当前账号真实可用”的模型列表。

    参数：
    - request: FastAPI 请求对象，用于复用应用级 HTTP 客户端。
    - session: 登录会话。

    返回：
    - models: 标准化模型列表（优先来自上游 `/models`）。
    - current_model: 当前生效模型。
    - upstream_endpoint: 本次命中的上游 models 地址。
    - api_key_source: 使用的平台密钥/个人密钥来源标记。

    处理过程：
    1. 读取当前用户生效运行时配置；
    2. 调用上游 `/models`（含 `/v1/models` 回退探测）；
    3. 标准化并去重返回；
    4. 若当前生效模型未在上游列表中，附加为 `configured` 记录。
    """
    username = str(session.get("username") or "")
    fallback_reason = None

    runtime = await asyncio.to_thread(_resolve_effective_agent_runtime_sync, username)
    base_url = str(runtime.get("base_url") or DEFAULT_AGENT_BASE_URL).strip()
    api_key = str(runtime.get("api_key") or "").strip()
    current_model = str(runtime.get("model") or "").strip()

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent key is not configured on backend. Please set platform key or personal key first.",
        )

    # 尝试从上游获取模型列表
    upstream_models = []
    upstream_endpoint = ""
    upstream_error = None
    try:
        upstream_models, upstream_endpoint = await _call_upstream_models(
            request,
            base_url=base_url,
            api_key=api_key,
            timeout_seconds=int(runtime.get("timeout_seconds") or DEFAULT_AGENT_TIMEOUT_SECONDS),
        )
    except Exception as e:
        upstream_error = str(e)
        logger.warning(f"Failed to fetch models from upstream: {e}, will try fallback cache")

    # 若上游成功，缓存模型列表
    if upstream_models and not upstream_error:
        compatible_upstream_models = [
            item for item in upstream_models if bool(item.get("chat_compatible", True))
        ]
        # 异步缓存，不阻塞响应
        asyncio.create_task(_cache_models_async(compatible_upstream_models))
    elif upstream_error:
        # 若上游失败，尝试使用缓存的模型列表
        fallback_reason = f"上游服务暂时不可用（{upstream_error}），使用缓存模型列表"
        cached_model_list = _normalize_available_models(
            _get_system_config_values_sync([CONFIG_KEY_AVAILABLE_MODELS]).get(CONFIG_KEY_AVAILABLE_MODELS, "")
        )
        if cached_model_list:
            # 重建模型字典以兼容下游代码
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


@router.patch("/api/agent/user/preference")
async def update_user_model_preference(
    payload: Dict[str, Any],
    session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
    """
    功能：保存用户的模型偏好设置到 user_preferences 表。
    
    参数：
    - payload: {"preferred_model": "model-id"}

    返回：
    - preferred_model: 保存后的模型偏好。
    
    处理过程：
    1. 验证模型 ID 有效性
    2. 写入 user_preferences.preferred_agent_model
    3. 返回成功确认
    """
    username = str(session.get("username") or "")
    preferred_model = _normalize_model(str(payload.get("preferred_model") or ""))

    if not preferred_model:
        # 允许清空偏好（传空字符串）
        pass

    try:
        _ensure_agent_chat_tables_sync()
        with _db_connection() as conn:
            # 确保 user_preferences 表存在
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

            # 更新用户偏好
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

