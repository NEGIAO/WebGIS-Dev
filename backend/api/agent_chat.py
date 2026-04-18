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
DEFAULT_AGENT_MODEL = str(os.getenv("AGENT_MODEL", "deepseek-V3-0324")).strip() or "deepseek-V3-0324"
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
CONFIG_KEY_SYSTEM_PROMPT = "agent_system_prompt"
CONFIG_KEY_TIMEOUT_SECONDS = "agent_timeout_seconds"
CONFIG_KEY_MAX_TOKENS = "agent_max_tokens"
CONFIG_KEY_TEMPERATURE = "agent_temperature"

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
    model: Optional[str] = Field(default=None, min_length=1, max_length=160)
    system_prompt: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    timeout_seconds: Optional[int] = Field(default=None, ge=5, le=180)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=8192)
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)


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
    normalized = str(value or "").strip()
    return normalized or DEFAULT_AGENT_MODEL


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
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS system_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )


def _ensure_api_keys_table_sync(conn: sqlite3.Connection) -> None:
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


def _ensure_agent_chat_tables_sync() -> None:
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

        user_cfg_cols = conn.execute("PRAGMA table_info(agent_user_config)").fetchall()
        user_cfg_col_names = {str(dict(row).get("name") or "") for row in user_cfg_cols}
        if "api_key" not in user_cfg_col_names:
            conn.execute("ALTER TABLE agent_user_config ADD COLUMN api_key TEXT")
        if "base_url" not in user_cfg_col_names:
            conn.execute("ALTER TABLE agent_user_config ADD COLUMN base_url TEXT")
        if "model" not in user_cfg_col_names:
            conn.execute("ALTER TABLE agent_user_config ADD COLUMN model TEXT")
        if "system_prompt" not in user_cfg_col_names:
            conn.execute("ALTER TABLE agent_user_config ADD COLUMN system_prompt TEXT")
        if "timeout_seconds" not in user_cfg_col_names:
            conn.execute("ALTER TABLE agent_user_config ADD COLUMN timeout_seconds INTEGER")
        if "max_tokens" not in user_cfg_col_names:
            conn.execute("ALTER TABLE agent_user_config ADD COLUMN max_tokens INTEGER")
        if "temperature" not in user_cfg_col_names:
            conn.execute("ALTER TABLE agent_user_config ADD COLUMN temperature REAL")
        if "updated_at" not in user_cfg_col_names:
            conn.execute("ALTER TABLE agent_user_config ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''")
        if "updated_by" not in user_cfg_col_names:
            conn.execute("ALTER TABLE agent_user_config ADD COLUMN updated_by TEXT")

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_agent_user_config_updated_at ON agent_user_config(updated_at)"
        )
        conn.commit()


def _read_agent_user_config_row_sync(username: str) -> Optional[Dict[str, Any]]:
    _ensure_agent_chat_tables_sync()
    with _db_connection() as conn:
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


def _upsert_agent_user_config_sync(username: str, updates: Dict[str, Any], updated_by: str = "self") -> Dict[str, Any]:
    _ensure_agent_chat_tables_sync()

    normalized_username = str(username or "").strip()
    if not normalized_username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid username.")

    existing = _read_agent_user_config_row_sync(normalized_username) or {"username": normalized_username}
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

    with _db_connection() as conn:
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

    personal_key = str(user_cfg.get("api_key") or "").strip()
    use_personal_key = bool(personal_key)

    effective = {
        "base_url": _normalize_base_url(str(user_cfg.get("base_url") or provider.get("base_url") or DEFAULT_AGENT_BASE_URL)),
        "model": _normalize_model(str(user_cfg.get("model") or provider.get("model") or DEFAULT_AGENT_MODEL)),
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

    with _db_connection() as conn:
        rows = conn.execute(sql, tuple(keys)).fetchall()

    result: Dict[str, str] = {}
    for row in rows:
        item = dict(row)
        key = str(item.get("key") or "").strip()
        value = str(item.get("value") or "")
        if key:
            result[key] = value
    return result


def _get_agent_provider_config_sync() -> Dict[str, Any]:
    config_values = _get_system_config_values_sync(
        [
            CONFIG_KEY_BASE_URL,
            CONFIG_KEY_MODEL,
            CONFIG_KEY_SYSTEM_PROMPT,
            CONFIG_KEY_TIMEOUT_SECONDS,
            CONFIG_KEY_MAX_TOKENS,
            CONFIG_KEY_TEMPERATURE,
        ]
    )

    base_url = _normalize_base_url(config_values.get(CONFIG_KEY_BASE_URL, DEFAULT_AGENT_BASE_URL))
    model = _normalize_model(config_values.get(CONFIG_KEY_MODEL, DEFAULT_AGENT_MODEL))
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
        "system_prompt": system_prompt,
        "timeout_seconds": timeout_seconds,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }


def _set_agent_provider_config_sync(updates: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_agent_chat_tables_sync()

    now_iso = _iso_now()
    rows_to_upsert: List[Tuple[str, str, str]] = []

    if "base_url" in updates:
        rows_to_upsert.append((CONFIG_KEY_BASE_URL, _normalize_base_url(str(updates["base_url"])), now_iso))
    if "model" in updates:
        rows_to_upsert.append((CONFIG_KEY_MODEL, _normalize_model(str(updates["model"])), now_iso))
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

    if rows_to_upsert:
        with _db_connection() as conn:
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
    if normalized_role == ROLE_ADMIN:
        return None
    if normalized_role == "guest":
        return AGENT_CHAT_GUEST_DAILY_QUOTA
    return AGENT_CHAT_REGISTERED_DAILY_QUOTA


def _consume_agent_chat_quota_sync(username: str, role: str, quota_subject: str) -> Dict[str, Any]:
    _ensure_agent_chat_tables_sync()

    normalized_role = normalize_role(role, username)
    normalized_subject = str(quota_subject or "").strip() or str(username or "").strip() or "unknown"
    usage_date = _utc_date_str()
    now_iso = _iso_now()

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

    next_used = used + 1
    remaining = None if daily_limit is None else max(0, daily_limit - next_used)

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
        return {
            "limit": None,
            "used": 0,
            "remaining": None,
            "usage_date": usage_date,
            "quota_subject": normalized_subject,
        }

    with _db_connection() as conn:
        row = conn.execute(
            """
            SELECT calls FROM agent_chat_usage_daily
            WHERE quota_subject = ? AND usage_date = ?
            """,
            (normalized_subject, usage_date),
        ).fetchone()

    used = int((dict(row).get("calls") if row else 0) or 0)
    remaining = None if daily_limit is None else max(0, daily_limit - used)

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


def _join_system_prompt(base_prompt: str, location_context: Optional[str]) -> str:
    location_text = str(location_context or "").strip()
    if not location_text:
        return base_prompt

    return f"{base_prompt}\n\nUser location context (first-turn hint): {location_text}"


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
    username = str(session.get("username") or "")
    role = normalize_role(session.get("role"), username)
    quota_subject = resolve_quota_subject(username, role, session.get("guest_uid"))

    quota = await asyncio.to_thread(_consume_agent_chat_quota_sync, username, role, quota_subject)
    if not bool(quota.get("allowed")):
        limit = quota.get("limit")
        used = quota.get("used")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily chat quota exceeded ({used}/{limit}). Please try again tomorrow.",
        )

    runtime = await asyncio.to_thread(_resolve_effective_agent_runtime_sync, username)
    api_key = str(runtime.get("api_key") or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent key is not configured on backend. Please contact admin.",
        )

    history_items = _sanitize_history(payload.history)
    system_prompt = _join_system_prompt(
        str(runtime.get("system_prompt") or DEFAULT_AGENT_SYSTEM_PROMPT),
        payload.location_context,
    )

    request_messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
    request_messages.extend(history_items)
    request_messages.append({"role": "user", "content": str(payload.message or "").strip()})

    request_params = json.dumps(
        {
            "model": runtime.get("model"),
            "history_len": len(history_items),
            "quota_subject": quota_subject,
            "api_key_source": runtime.get("api_key_source"),
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
            model=str(runtime.get("model") or DEFAULT_AGENT_MODEL),
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

        return {
            "status": "success",
            "data": {
                "reply": reply,
                "model": str(runtime.get("model") or DEFAULT_AGENT_MODEL),
                "quota": quota,
                "usage": upstream_data.get("usage") if isinstance(upstream_data, dict) else None,
                "api_key_source": str(runtime.get("api_key_source") or "unknown"),
            },
        }
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


@router.get("/api/admin/agent/config")
async def admin_get_agent_config(
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    config = await asyncio.to_thread(_get_agent_provider_config_sync)
    key_status = await asyncio.to_thread(_get_agent_key_status_sync)

    return {
        "status": "success",
        "data": {
            "provider": config,
            "key_status": key_status,
            "chat_quota": {
                "guest": AGENT_CHAT_GUEST_DAILY_QUOTA,
                "registered": AGENT_CHAT_REGISTERED_DAILY_QUOTA,
                "admin": None,
            },
        },
    }


@router.post("/api/admin/agent/config")
async def admin_update_agent_config(
    payload: AgentConfigUpdateRequest,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    updates = _model_dump_compat(payload, exclude_none=True)

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No agent config fields provided.",
        )

    saved = await asyncio.to_thread(_set_agent_provider_config_sync, updates)

    return {
        "status": "success",
        "message": "Agent config updated.",
        "data": {
            "provider": saved,
        },
    }


@router.get("/api/agent/user-config")
async def get_agent_user_config(
    session: Dict[str, Any] = Depends(require_login),
) -> Dict[str, Any]:
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
                "timeout_seconds": int(runtime.get("timeout_seconds") or DEFAULT_AGENT_TIMEOUT_SECONDS),
                "max_tokens": int(runtime.get("max_tokens") or DEFAULT_AGENT_MAX_TOKENS),
                "temperature": float(runtime.get("temperature") or DEFAULT_AGENT_TEMPERATURE),
                "api_key_source": str(runtime.get("api_key_source") or "missing"),
            },
        },
    }
