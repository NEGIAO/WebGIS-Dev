"""
Agent Chat 数据库 schema、config CRUD、API key 解析、运行时解析。
"""

import json
import logging
import os
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status

from api.auth import get_auth_db_connection

from .constants import (
    AGENT_API_KEY_LEGACY,
    AGENT_API_KEY_PRIMARY,
    AGENT_CHAT_GUEST_DAILY_QUOTA,
    AGENT_CHAT_REGISTERED_DAILY_QUOTA,
    CONFIG_KEY_AVAILABLE_MODELS,
    CONFIG_KEY_BASE_URL,
    CONFIG_KEY_CHAT_GUEST_DAILY_QUOTA,
    CONFIG_KEY_CHAT_REGISTERED_DAILY_QUOTA,
    CONFIG_KEY_MAX_TOKENS,
    CONFIG_KEY_MODEL,
    CONFIG_KEY_SYSTEM_PROMPT,
    CONFIG_KEY_TEMPERATURE,
    CONFIG_KEY_TIMEOUT_SECONDS,
    DEFAULT_AGENT_BASE_URL,
    DEFAULT_AGENT_MAX_TOKENS,
    DEFAULT_AGENT_MODEL,
    DEFAULT_AGENT_SYSTEM_PROMPT,
    DEFAULT_AGENT_TEMPERATURE,
    DEFAULT_AGENT_TIMEOUT_SECONDS,
    USER_CONFIG_TABLE,
    logger,
)
from .utils import (
    _iso_now,
    _normalize_available_models,
    _normalize_base_url,
    _normalize_model,
    _normalize_system_prompt,
    _pick_runtime_model,
    _safe_parse_float,
    _safe_parse_int,
)


def _db_connection() -> sqlite3.Connection:
    return get_auth_db_connection()


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


def _get_system_config_values_sync(keys: List[str]) -> Dict[str, str]:
    _ensure_agent_chat_tables_sync()
    if not keys:
        return {}

    placeholders = ", ".join(["?"] * len(keys))
    sql = f"SELECT key, value FROM system_config WHERE key IN ({placeholders})"

    try:
        with _db_connection() as conn:
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


def _cache_available_models_sync(models: List[Dict[str, Any]]) -> None:
    """缓存当前可用模型列表到 system_config 数据库。"""
    try:
        _ensure_agent_chat_tables_sync()
        model_ids = []
        seen: set[str] = set()
        for model in models:
            model_id = str(model.get("id") or "").strip()
            if model_id and model_id not in seen:
                model_ids.append(model_id)
                seen.add(model_id)

        if not model_ids:
            return

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
