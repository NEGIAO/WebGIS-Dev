"""ESRI Wayback historical-imagery metadata sync and persistence."""

from __future__ import annotations

import logging
from contextlib import closing
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from apscheduler.schedulers.background import BackgroundScheduler

from api.auth.db import get_auth_db_connection
from scripts.fetch_wayback_layers import SOURCE_URL, build_xyz_url, parse_entries

logger = logging.getLogger(__name__)
PROVIDER_ID = "esri-wayback"
PROVIDER_NAME = "ESRI Wayback World Imagery"
_BEIJING_TZ = timezone(timedelta(hours=8))
_scheduler: Any = None


def _now_iso() -> str:
    return datetime.now(_BEIJING_TZ).isoformat()


def init_historical_imagery_storage() -> None:
    """Create the metadata and sync-state tables."""
    with closing(get_auth_db_connection()) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS historical_imagery_layers (
                provider TEXT NOT NULL, layer_id TEXT NOT NULL,
                snapshot_date TEXT NOT NULL, code TEXT NOT NULL DEFAULT '',
                name TEXT NOT NULL, xyz_url TEXT NOT NULL,
                source_url TEXT NOT NULL, fetched_at TEXT NOT NULL,
                PRIMARY KEY (provider, layer_id)
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_historical_imagery_provider_date
            ON historical_imagery_layers(provider, snapshot_date DESC)
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS historical_imagery_sync_state (
                provider TEXT PRIMARY KEY, last_attempt_at TEXT,
                last_success_at TEXT, status TEXT NOT NULL DEFAULT 'never',
                error TEXT NOT NULL DEFAULT '', layer_count INTEGER NOT NULL DEFAULT 0
            )
        """)
        conn.commit()


def _normalize_entries(selection: Iterable[dict[str, Any]]) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    seen_layer_ids: set[str] = set()
    for entry in parse_entries(list(selection)):
        layer_id = str(entry.get("layer_id") or "").strip()
        snapshot_date = str(entry.get("date") or "").strip()
        if not layer_id or not snapshot_date or layer_id in seen_layer_ids:
            continue
        try:
            datetime.strptime(snapshot_date, "%Y-%m-%d")
        except ValueError:
            continue
        seen_layer_ids.add(layer_id)
        normalized.append({
            "layer_id": layer_id,
            "date": snapshot_date,
            "code": str(entry.get("code") or "").strip(),
            "name": str(entry.get("name") or f"ESRI Wayback {snapshot_date}").strip(),
            "xyz_url": build_xyz_url(layer_id),
        })
    if not normalized:
        raise ValueError("ESRI Wayback response contains no valid snapshots")
    return normalized


def fetch_wayback_entries() -> list[dict[str, str]]:
    """Fetch and format snapshots from ESRI metadata."""
    with httpx.Client(timeout=30.0, follow_redirects=True, headers={
        "User-Agent": "WebGIS-Dev/Wayback-Metadata-Sync",
    }) as client:
        response = client.get(SOURCE_URL)
        response.raise_for_status()
        payload = response.json()
    selection = payload.get("Selection") if isinstance(payload, dict) else None
    if not isinstance(selection, list):
        raise ValueError("ESRI Wayback response is missing the Selection array")
    return _normalize_entries(selection)


def sync_wayback_layers() -> dict[str, Any]:
    """Fetch metadata and atomically replace the cached provider catalog."""
    init_historical_imagery_storage()
    attempted_at = _now_iso()
    try:
        entries = fetch_wayback_entries()
        fetched_at = _now_iso()
        with closing(get_auth_db_connection()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute("DELETE FROM historical_imagery_layers WHERE provider = ?", (PROVIDER_ID,))
            conn.executemany(
                """
                INSERT INTO historical_imagery_layers
                    (provider, layer_id, snapshot_date, code, name, xyz_url, source_url, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (PROVIDER_ID, e["layer_id"], e["date"], e["code"], e["name"],
                     e["xyz_url"], SOURCE_URL, fetched_at)
                    for e in entries
                ],
            )
            conn.execute(
                """
                INSERT INTO historical_imagery_sync_state
                    (provider, last_attempt_at, last_success_at, status, error, layer_count)
                VALUES (?, ?, ?, 'success', '', ?)
                ON CONFLICT(provider) DO UPDATE SET
                    last_attempt_at = excluded.last_attempt_at,
                    last_success_at = excluded.last_success_at,
                    status = excluded.status,
                    error = excluded.error,
                    layer_count = excluded.layer_count
                """,
                (PROVIDER_ID, attempted_at, fetched_at, len(entries)),
            )
            conn.commit()
        logger.info("ESRI Wayback metadata synced: %d snapshots", len(entries))
        return {"provider": PROVIDER_ID, "count": len(entries), "synced_at": fetched_at}
    except Exception as exc:
        error_text = str(exc)[:1000]
        try:
            with closing(get_auth_db_connection()) as conn:
                conn.execute(
                    """
                    INSERT INTO historical_imagery_sync_state
                        (provider, last_attempt_at, status, error, layer_count)
                    VALUES (?, ?, 'failed', ?, 0)
                    ON CONFLICT(provider) DO UPDATE SET
                        last_attempt_at = excluded.last_attempt_at,
                        status = excluded.status,
                        error = excluded.error
                    """,
                    (PROVIDER_ID, attempted_at, error_text),
                )
                conn.commit()
        except Exception:
            logger.warning("Failed to persist Wayback sync failure state", exc_info=True)
        logger.error("ESRI Wayback metadata sync failed: %s", error_text, exc_info=True)
        raise


def get_wayback_catalog() -> dict[str, Any]:
    """Read the cached catalog without contacting ESRI in the request path."""
    init_historical_imagery_storage()
    with closing(get_auth_db_connection()) as conn:
        rows = conn.execute(
            """
            SELECT layer_id, snapshot_date, code, name, xyz_url
            FROM historical_imagery_layers
            WHERE provider = ? ORDER BY snapshot_date DESC, layer_id DESC
            """,
            (PROVIDER_ID,),
        ).fetchall()
        state = conn.execute(
            """
            SELECT last_attempt_at, last_success_at, status, error
            FROM historical_imagery_sync_state WHERE provider = ?
            """,
            (PROVIDER_ID,),
        ).fetchone()

    layers = [
        {
            "id": f"esri-wayback-{row['layer_id']}",
            "provider": PROVIDER_ID,
            "date": row["snapshot_date"],
            "year": int(row["snapshot_date"][:4]),
            "layer_id": row["layer_id"],
            "code": row["code"],
            "name": row["name"],
            "xyz_url": row["xyz_url"],
        }
        for row in rows
    ]
    return {
        "provider": {"id": PROVIDER_ID, "name": PROVIDER_NAME},
        "total": len(layers),
        "updated_at": state["last_success_at"] if state else None,
        "sync": {
            "status": state["status"] if state else "never",
            "last_attempt_at": state["last_attempt_at"] if state else None,
            "last_success_at": state["last_success_at"] if state else None,
            # 公开接口不暴露上游/SQLite 的内部错误细节。
            "error": "同步失败，请稍后重试" if state and state["status"] == "failed" else "",
        },
        "layers": layers,
    }


def start_historical_imagery_scheduler() -> Any:
    """Sync daily at 03:15 Beijing time and once immediately after startup."""
    global _scheduler
    from apscheduler.schedulers.background import BackgroundScheduler
    if _scheduler and _scheduler.running:
        return _scheduler
    scheduler = BackgroundScheduler(timezone=_BEIJING_TZ)
    scheduler.add_job(
        sync_wayback_layers, "cron", hour=3, minute=15,
        id="historical_imagery_wayback_daily", replace_existing=True,
        max_instances=1, coalesce=True,
    )
    scheduler.add_job(
        sync_wayback_layers, "date", run_date=datetime.now(_BEIJING_TZ),
        id="historical_imagery_wayback_startup", replace_existing=True,
    )
    scheduler.start()
    _scheduler = scheduler
    logger.info("Historical imagery scheduler started (03:15 Asia/Shanghai daily)")
    return scheduler


def shutdown_historical_imagery_scheduler(
    scheduler: Any = None,
) -> None:
    target = scheduler or _scheduler
    if target is None:
        return
    target.shutdown(wait=False)
    logger.info("Historical imagery scheduler stopped")
