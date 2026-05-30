"""
user_preferences 表的 CRUD 操作。
"""

from typing import Any, Dict

from .constants import (
    _default_preferences,
    _normalize_default_basemap,
    _normalize_language,
    _normalize_preferred_agent_model,
    _normalize_unit_system,
)
from .db import _db_connection, _iso, _utc_now


def _ensure_user_preferences_row_sync(conn, username: str) -> None:
    defaults = _default_preferences()
    now_iso = _iso(_utc_now())
    conn.execute(
        """
        INSERT INTO user_preferences (
            username,
            default_basemap,
            language,
            unit_system,
            preferred_agent_model,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(username)
        DO NOTHING
        """,
        (
            username,
            defaults["default_basemap"],
            defaults["language"],
            defaults["unit_system"],
            defaults["preferred_agent_model"],
            now_iso,
        ),
    )


def _get_user_preferences_sync(username: str) -> Dict[str, str]:
    defaults = _default_preferences()

    with _db_connection() as conn:
        _ensure_user_preferences_row_sync(conn, username)
        row = conn.execute(
            """
            SELECT default_basemap, language, unit_system, preferred_agent_model
            FROM user_preferences
            WHERE username = ?
            """,
            (username,),
        ).fetchone()
        conn.commit()

    payload = dict(row) if row else {}
    return {
        "default_basemap": _normalize_default_basemap(payload.get("default_basemap") or defaults["default_basemap"]),
        "language": _normalize_language(payload.get("language") or defaults["language"]),
        "unit_system": _normalize_unit_system(payload.get("unit_system") or defaults["unit_system"]),
        "preferred_agent_model": _normalize_preferred_agent_model(
            payload.get("preferred_agent_model") or defaults["preferred_agent_model"]
        ),
    }


def _upsert_user_preferences_sync(username: str, updates: Dict[str, Any]) -> Dict[str, str]:
    existing = _get_user_preferences_sync(username)

    merged = {
        "default_basemap": _normalize_default_basemap(
            existing.get("default_basemap") if "default_basemap" not in updates else updates.get("default_basemap")
        ),
        "language": _normalize_language(
            existing.get("language") if "language" not in updates else updates.get("language")
        ),
        "unit_system": _normalize_unit_system(
            existing.get("unit_system") if "unit_system" not in updates else updates.get("unit_system")
        ),
        "preferred_agent_model": _normalize_preferred_agent_model(
            existing.get("preferred_agent_model") if "preferred_agent_model" not in updates else updates.get("preferred_agent_model")
        ),
    }

    now_iso = _iso(_utc_now())
    with _db_connection() as conn:
        conn.execute(
            """
            INSERT INTO user_preferences (
                username,
                default_basemap,
                language,
                unit_system,
                preferred_agent_model,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(username)
            DO UPDATE SET
                default_basemap = excluded.default_basemap,
                language = excluded.language,
                unit_system = excluded.unit_system,
                preferred_agent_model = excluded.preferred_agent_model,
                updated_at = excluded.updated_at
            """,
            (
                username,
                merged["default_basemap"],
                merged["language"],
                merged["unit_system"],
                merged["preferred_agent_model"],
                now_iso,
            ),
        )
        conn.commit()

    return merged
