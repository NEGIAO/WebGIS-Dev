"""SQLite database-maintenance audit records and manifest synchronization."""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict

# 北京时间（V3.4.63：UTC → UTC+8）
_BEIJING_TZ = timezone(timedelta(hours=8))

logger = logging.getLogger(__name__)

MAINTENANCE_TABLE = "database_maintenance_events"


def _utc_iso() -> str:
    return datetime.now(_BEIJING_TZ).isoformat()


def _json_text(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def ensure_maintenance_event_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {MAINTENANCE_TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id TEXT NOT NULL UNIQUE,
            database_name TEXT NOT NULL,
            event_type TEXT NOT NULL,
            status TEXT NOT NULL,
            corruption_detected_at_utc TEXT,
            source_last_modified_at_utc TEXT,
            recovery_started_at_utc TEXT,
            recovery_completed_at_utc TEXT,
            source_path TEXT,
            source_size_bytes INTEGER,
            source_sha256 TEXT,
            corrupt_backup_path TEXT,
            corrupt_backup_sha256 TEXT,
            binary_backup_path TEXT,
            sql_backup_path TEXT,
            recovery_method TEXT,
            rollback_replacements INTEGER NOT NULL DEFAULT 0,
            quick_check_result TEXT,
            integrity_check_result TEXT,
            foreign_key_violation_count INTEGER NOT NULL DEFAULT 0,
            recovered_table_count INTEGER NOT NULL DEFAULT 0,
            recovered_row_count INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            manifest_path TEXT,
            details_json TEXT NOT NULL DEFAULT '{{}}',
            created_at_utc TEXT NOT NULL,
            updated_at_utc TEXT NOT NULL
        )
        """
    )
    conn.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{MAINTENANCE_TABLE}_detected "
        f"ON {MAINTENANCE_TABLE}(corruption_detected_at_utc)"
    )
    conn.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{MAINTENANCE_TABLE}_status "
        f"ON {MAINTENANCE_TABLE}(status)"
    )


def record_maintenance_manifest(
    conn: sqlite3.Connection,
    manifest: Dict[str, object],
) -> None:
    ensure_maintenance_event_table(conn)
    event_id = str(manifest.get("event_id") or "").strip()
    database_name = str(manifest.get("database_name") or "").strip()
    if not event_id:
        raise ValueError("maintenance manifest is missing event_id")
    if not database_name:
        raise ValueError("maintenance manifest is missing database_name")

    validation = manifest.get("validation")
    if not isinstance(validation, dict):
        validation = {}
    quick = validation.get("quick_check", [])
    integrity = validation.get("integrity_check", [])
    foreign = validation.get("foreign_key_violations", [])
    tables = validation.get("tables", [])
    row_counts = validation.get("row_counts", {})
    recovered_rows = 0
    if isinstance(row_counts, dict):
        recovered_rows = sum(
            int(value) for value in row_counts.values() if isinstance(value, int)
        )

    now = _utc_iso()
    values = (
        event_id,
        database_name,
        str(manifest.get("event_type") or "sqlite_corruption_recovery"),
        str(manifest.get("status") or "unknown"),
        manifest.get("corruption_detected_at_utc"),
        manifest.get("source_last_modified_at_utc"),
        manifest.get("recovery_started_at_utc"),
        manifest.get("recovery_completed_at_utc"),
        manifest.get("source_path"),
        manifest.get("source_size_bytes"),
        manifest.get("source_sha256"),
        manifest.get("corrupt_backup_path"),
        manifest.get("corrupt_backup_sha256"),
        manifest.get("binary_backup_path"),
        manifest.get("sql_backup_path"),
        manifest.get("recovery_method"),
        int(manifest.get("rollback_replacements") or 0),
        _json_text(quick),
        _json_text(integrity),
        len(foreign) if isinstance(foreign, list) else 0,
        len(tables) if isinstance(tables, list) else 0,
        recovered_rows,
        manifest.get("error_message"),
        manifest.get("manifest_path"),
        _json_text(manifest),
        str(manifest.get("created_at_utc") or now),
        now,
    )
    conn.execute(
        f"""
        INSERT INTO {MAINTENANCE_TABLE} (
            event_id, database_name, event_type, status,
            corruption_detected_at_utc, source_last_modified_at_utc,
            recovery_started_at_utc, recovery_completed_at_utc,
            source_path, source_size_bytes, source_sha256,
            corrupt_backup_path, corrupt_backup_sha256,
            binary_backup_path, sql_backup_path, recovery_method,
            rollback_replacements, quick_check_result, integrity_check_result,
            foreign_key_violation_count, recovered_table_count,
            recovered_row_count, error_message, manifest_path, details_json,
            created_at_utc, updated_at_utc
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(event_id) DO UPDATE SET
            database_name=excluded.database_name,
            event_type=excluded.event_type,
            status=excluded.status,
            corruption_detected_at_utc=excluded.corruption_detected_at_utc,
            source_last_modified_at_utc=excluded.source_last_modified_at_utc,
            recovery_started_at_utc=excluded.recovery_started_at_utc,
            recovery_completed_at_utc=excluded.recovery_completed_at_utc,
            source_path=excluded.source_path,
            source_size_bytes=excluded.source_size_bytes,
            source_sha256=excluded.source_sha256,
            corrupt_backup_path=excluded.corrupt_backup_path,
            corrupt_backup_sha256=excluded.corrupt_backup_sha256,
            binary_backup_path=excluded.binary_backup_path,
            sql_backup_path=excluded.sql_backup_path,
            recovery_method=excluded.recovery_method,
            rollback_replacements=excluded.rollback_replacements,
            quick_check_result=excluded.quick_check_result,
            integrity_check_result=excluded.integrity_check_result,
            foreign_key_violation_count=excluded.foreign_key_violation_count,
            recovered_table_count=excluded.recovered_table_count,
            recovered_row_count=excluded.recovered_row_count,
            error_message=excluded.error_message,
            manifest_path=excluded.manifest_path,
            details_json=excluded.details_json,
            updated_at_utc=excluded.updated_at_utc
        """,
        values,
    )


def sync_recovery_manifests(
    conn: sqlite3.Connection,
    recovery_root: Path,
) -> int:
    """Import success/failure JSON reports after a usable DB is available."""
    recovery_root = Path(recovery_root)
    ensure_maintenance_event_table(conn)
    if not recovery_root.exists():
        return 0

    imported = 0
    for manifest_path in sorted(recovery_root.rglob("*.json")):
        try:
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict) or not payload.get("event_id"):
                continue
            payload.setdefault("manifest_path", str(manifest_path))
            record_maintenance_manifest(conn, payload)
            imported += 1
        except Exception as exc:
            logger.warning("Could not import recovery manifest %s: %s", manifest_path, exc)
    return imported
