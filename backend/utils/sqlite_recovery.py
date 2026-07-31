"""Conservative SQLite backup, validation, and logical-rebuild recovery helpers.

The recovery path never edits or deletes the source database before a rebuilt
candidate has passed integrity validation and has been backed up.  It prefers
the same logical recovery sequence that has proven reliable manually:

    sqlite3 source.db .dump -> replace terminal ROLLBACK with COMMIT
    -> import into a new database -> validate -> activate

If the normal dump cannot produce a valid candidate, SQLite's ``.recover`` is
used as a best-effort fallback when supported by the installed CLI.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from utils.sqlite_maintenance import record_maintenance_manifest

logger = logging.getLogger(__name__)


class SQLiteRecoveryError(RuntimeError):
    """Raised when a damaged database cannot be rebuilt safely."""


@dataclass
class SQLiteValidationResult:
    valid: bool
    quick_check: List[str] = field(default_factory=list)
    integrity_check: List[str] = field(default_factory=list)
    foreign_key_violations: List[List[object]] = field(default_factory=list)
    tables: List[str] = field(default_factory=list)
    columns: Dict[str, List[str]] = field(default_factory=dict)
    row_counts: Dict[str, int] = field(default_factory=dict)
    error: Optional[str] = None

    @property
    def total_rows(self) -> int:
        return sum(self.row_counts.values())


@dataclass
class SQLiteRecoveryResult:
    success: bool
    event_id: str
    method: str
    source_path: Path
    recovery_dir: Path
    snapshot_path: Path
    active_path: Path
    binary_backup_path: Path
    sql_backup_path: Path
    validation: SQLiteValidationResult
    rollback_replacements: int
    manifest_path: Path


def _utc_stamp(value: Optional[datetime] = None) -> str:
    return (value or datetime.now(timezone.utc)).astimezone(timezone.utc).strftime(
        "%Y%m%dT%H%M%S%fZ"
    )


def _utc_iso(value: Optional[datetime] = None) -> str:
    return (value or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def _find_sqlite_cli(explicit: Optional[str] = None) -> str:
    if explicit:
        resolved = shutil.which(explicit) or explicit
        if Path(resolved).exists() or shutil.which(resolved):
            return str(resolved)
        raise SQLiteRecoveryError(f"sqlite3 CLI 不存在: {explicit}")

    resolved = shutil.which("sqlite3")
    if not resolved:
        raise SQLiteRecoveryError(
            "未找到 sqlite3 CLI；自动逻辑恢复必须安装 sqlite3 命令行工具"
        )
    return resolved


def _read_only_uri(path: Path) -> str:
    return path.resolve().as_uri() + "?mode=ro"


def validate_sqlite_database(
    db_path: Path,
    required_tables: Optional[Iterable[str]] = None,
    required_columns: Optional[Dict[str, Iterable[str]]] = None,
    minimum_total_rows: int = 0,
    require_foreign_key_clean: bool = False,
) -> SQLiteValidationResult:
    """Validate physical integrity and collect table/row information read-only."""
    db_path = Path(db_path)
    required: Set[str] = set(required_tables or ())
    required_column_sets: Dict[str, Set[str]] = {
        table: set(columns) for table, columns in (required_columns or {}).items()
    }

    try:
        conn = sqlite3.connect(_read_only_uri(db_path), uri=True, timeout=10)
        try:
            quick_rows = [str(row[0]) for row in conn.execute("PRAGMA quick_check").fetchall()]
            integrity_rows = [str(row[0]) for row in conn.execute("PRAGMA integrity_check").fetchall()]
            foreign_rows = [list(row) for row in conn.execute("PRAGMA foreign_key_check").fetchall()]
            tables = [
                str(row[0])
                for row in conn.execute(
                    "SELECT name FROM sqlite_master "
                    "WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
                ).fetchall()
            ]
            columns_by_table: Dict[str, List[str]] = {}
            row_counts: Dict[str, int] = {}
            for table in tables:
                columns_by_table[table] = [
                    str(row[1])
                    for row in conn.execute(
                        f"PRAGMA table_info({_quote_identifier(table)})"
                    ).fetchall()
                ]
                row_counts[table] = int(
                    conn.execute(
                        f"SELECT COUNT(*) FROM {_quote_identifier(table)}"
                    ).fetchone()[0]
                )
        finally:
            conn.close()
    except Exception as exc:
        return SQLiteValidationResult(valid=False, error=str(exc))

    quick_ok = quick_rows == ["ok"]
    integrity_ok = integrity_rows == ["ok"]
    required_ok = required.issubset(set(tables))
    missing_columns = {
        table: sorted(expected - set(columns_by_table.get(table, [])))
        for table, expected in required_column_sets.items()
        if expected - set(columns_by_table.get(table, []))
    }
    columns_ok = not missing_columns
    row_count_ok = sum(row_counts.values()) >= minimum_total_rows
    foreign_ok = not require_foreign_key_clean or not foreign_rows

    error_parts: List[str] = []
    if not quick_ok:
        error_parts.append("quick_check 未返回 ok")
    if not integrity_ok:
        error_parts.append("integrity_check 未返回 ok")
    if not required_ok:
        error_parts.append(f"缺少必要表: {sorted(required - set(tables))}")
    if not columns_ok:
        error_parts.append(f"missing required columns: {missing_columns}")
    if not row_count_ok:
        error_parts.append(
            f"恢复总行数 {sum(row_counts.values())} 低于最低要求 {minimum_total_rows}"
        )
    if not foreign_ok:
        error_parts.append(f"存在 {len(foreign_rows)} 条外键异常")

    return SQLiteValidationResult(
        valid=(
            quick_ok
            and integrity_ok
            and required_ok
            and columns_ok
            and row_count_ok
            and foreign_ok
        ),
        quick_check=quick_rows,
        integrity_check=integrity_rows,
        foreign_key_violations=foreign_rows,
        tables=tables,
        columns=columns_by_table,
        row_counts=row_counts,
        error="; ".join(error_parts) or None,
    )


def is_sqlite_database_corrupted(db_path: Path) -> bool:
    """Return True for SQLite corruption; propagate unrelated filesystem errors."""
    db_path = Path(db_path)
    if not db_path.exists():
        return False

    try:
        conn = sqlite3.connect(_read_only_uri(db_path), uri=True, timeout=5)
        try:
            result = conn.execute("PRAGMA quick_check(1)").fetchone()
            return result is None or str(result[0]).lower() != "ok"
        finally:
            conn.close()
    except sqlite3.DatabaseError:
        return True


def _file_fingerprint(path: Path) -> Dict[str, object]:
    before = path.stat()
    digest = _sha256(path)
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise SQLiteRecoveryError(f"file changed while fingerprinting: {path}")
    return {
        "size": after.st_size,
        "sha256": digest,
        "last_modified_at_utc": datetime.fromtimestamp(
            after.st_mtime, tz=timezone.utc
        ).isoformat(),
    }


def _bundle_fingerprints(db_path: Path) -> Dict[str, Dict[str, object]]:
    fingerprints: Dict[str, Dict[str, object]] = {}
    for suffix in ("", "-wal", "-shm", "-journal"):
        path = Path(str(db_path) + suffix)
        if path.exists():
            fingerprints[suffix or "main"] = _file_fingerprint(path)
    return fingerprints


def _copy_file_verified(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(str(source), str(target))
    if source.stat().st_size != target.stat().st_size or _sha256(source) != _sha256(target):
        raise SQLiteRecoveryError(f"copy verification failed: {source} -> {target}")


def _copy_source_bundle(db_path: Path, snapshot_path: Path) -> List[Path]:
    """Create a timestamped, verified corrupt bundle without editing the source."""
    copied: List[Path] = []
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    for suffix in ("", "-wal", "-shm", "-journal"):
        source = Path(str(db_path) + suffix)
        if not source.exists():
            continue
        target = Path(str(snapshot_path) + suffix)
        _copy_file_verified(source, target)
        copied.append(target)
    if snapshot_path not in copied:
        raise SQLiteRecoveryError(f"source database could not be backed up: {db_path}")
    return copied


def _copy_bundle_to_local(snapshot_path: Path, local_path: Path) -> None:
    for suffix in ("", "-wal", "-shm", "-journal"):
        source = Path(str(snapshot_path) + suffix)
        if source.exists():
            _copy_file_verified(source, Path(str(local_path) + suffix))


def _persist_attempt_artifacts(local_dir: Path, recovery_dir: Path, method: str) -> None:
    for source in local_dir.glob(f"{method}*"):
        if source.is_file():
            _copy_file_verified(source, recovery_dir / source.name)


def _write_manual_recovery_guide(
    path: Path,
    snapshot_path: Path,
    detected_at_utc: str,
    source_modified_at_utc: str,
    snapshot_sha256: str,
) -> None:
    path.write_text(
        "\n".join(
            [
                "SQLite corruption recovery archive",
                "==================================",
                f"Corruption detected at (UTC): {detected_at_utc}",
                f"Source last modified at (UTC): {source_modified_at_utc}",
                f"Timestamped corrupt backup: {snapshot_path}",
                f"Corrupt backup SHA256: {snapshot_sha256}",
                "",
                "Do not edit the timestamped corrupt backup in place.",
                "Copy it before any manual repair attempt.",
                "",
                "Manual logical rebuild example:",
                f'  sqlite3 "{snapshot_path}" .dump > manual_dump.sql',
                "  replace the terminal ROLLBACK; line with COMMIT;",
                "  sqlite3 manual_recovered.db < manual_dump.sql",
                '  sqlite3 manual_recovered.db "PRAGMA quick_check; PRAGMA integrity_check;"',
                "",
            ]
        ),
        encoding="utf-8",
    )


def _record_manifest_in_candidate(candidate: Path, manifest: Dict[str, object]) -> None:
    conn = sqlite3.connect(str(candidate), timeout=15)
    try:
        record_maintenance_manifest(conn, manifest)
        conn.commit()
    finally:
        conn.close()


_ROLLBACK_LINE = re.compile(
    rb"(?m)^(?P<indent>[ \t]*)ROLLBACK;(?P<tail>[^\r\n]*)(?P<cr>\r?)$"
)


def normalize_dump_transaction(raw_sql: bytes) -> Tuple[bytes, int]:
    """Replace standalone dump ROLLBACK terminators with COMMIT, preserving CRLF."""
    return _ROLLBACK_LINE.subn(
        lambda match: (
            match.group("indent")
            + b"COMMIT;"
            + match.group("tail")
            + match.group("cr")
        ),
        raw_sql,
    )


def _run_export(
    sqlite_cli: str,
    source: Path,
    command: str,
    sql_path: Path,
    stderr_path: Path,
) -> int:
    with sql_path.open("wb") as stdout_stream, stderr_path.open("wb") as stderr_stream:
        # The source passed here is always a container-local working copy or a
        # verified local candidate. Read-write opening is intentional so SQLite
        # may replay a copied hot journal/WAL without ever touching the mounted
        # production file.
        process = subprocess.run(
            [sqlite_cli, str(source), command],
            stdout=stdout_stream,
            stderr=stderr_stream,
            check=False,
            timeout=120,
        )
    return process.returncode


def _import_sql(
    sqlite_cli: str,
    sql_path: Path,
    candidate_path: Path,
    stdout_path: Path,
    stderr_path: Path,
) -> int:
    for suffix in ("", "-wal", "-shm", "-journal"):
        target = Path(str(candidate_path) + suffix)
        if target.exists():
            target.unlink()

    with sql_path.open("rb") as stdin_stream:
        with stdout_path.open("wb") as stdout_stream:
            with stderr_path.open("wb") as stderr_stream:
                process = subprocess.run(
                    [sqlite_cli, str(candidate_path)],
                    stdin=stdin_stream,
                    stdout=stdout_stream,
                    stderr=stderr_stream,
                    check=False,
                    timeout=180,
                )
    return process.returncode


def _write_manifest(path: Path, payload: Dict[str, object]) -> None:
    """Atomically persist a recovery manifest on the mounted volume."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.parent / f".{path.name}.{uuid.uuid4().hex}.tmp"
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2, default=str)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(str(temporary), str(path))
    finally:
        if temporary.exists():
            temporary.unlink()


def _restore_source_bundle(
    snapshot_path: Path,
    db_path: Path,
    recovery_dir: Path,
    event_id: str,
) -> None:
    """Restore the original corrupt bundle if activation fails after replacement."""
    staged_paths: Dict[str, Path] = {}
    suffixes = ("", "-wal", "-shm", "-journal")
    try:
        for suffix in suffixes:
            archived = Path(str(snapshot_path) + suffix)
            if not archived.exists():
                continue
            staged = db_path.parent / (
                f".{db_path.name}.rollback.{event_id}{suffix or '.main'}.tmp"
            )
            _copy_file_verified(archived, staged)
            staged_paths[suffix] = staged

        if "" not in staged_paths:
            raise SQLiteRecoveryError("original main database backup is unavailable")

        # Remove sidecars belonging to the failed candidate before restoring the
        # archived bundle. The main database is replaced last so no restored WAL
        # can ever be opened against the candidate main file.
        for suffix in suffixes[1:]:
            active_sidecar = Path(str(db_path) + suffix)
            if active_sidecar.exists():
                failed_sidecar = recovery_dir / f"failed_candidate{suffix}"
                os.replace(str(active_sidecar), str(failed_sidecar))

        for suffix in suffixes[1:]:
            staged = staged_paths.get(suffix)
            if staged is not None:
                os.replace(str(staged), str(Path(str(db_path) + suffix)))

        os.replace(str(staged_paths[""]), str(db_path))
        logger.critical(
            "[DB-RECOVERY:%s] activation rolled back to the archived source bundle",
            event_id[:8],
        )
    finally:
        for staged in staged_paths.values():
            if staged.exists():
                try:
                    staged.unlink()
                except OSError:
                    logger.warning("Could not remove rollback staging file: %s", staged)


def _activate_candidate(
    db_path: Path,
    candidate_path: Path,
    snapshot_path: Path,
    recovery_dir: Path,
    event_id: str,
    source_bundle: Dict[str, Dict[str, object]],
    required_tables: Optional[Sequence[str]],
    required_columns: Optional[Dict[str, Sequence[str]]],
    minimum_total_rows: int,
    require_foreign_key_clean: bool,
) -> SQLiteValidationResult:
    """Validate a mounted staging copy, then atomically replace the live main file."""
    short_id = event_id[:8]
    staging = db_path.parent / f".{db_path.name}.recovered.{event_id}.tmp"
    moved_sidecars: Dict[Path, Path] = {}
    main_replaced = False
    try:
        _copy_file_verified(candidate_path, staging)
        staging_validation = validate_sqlite_database(
            staging,
            required_tables=required_tables,
            required_columns=required_columns,
            minimum_total_rows=minimum_total_rows,
            require_foreign_key_clean=require_foreign_key_clean,
        )
        if not staging_validation.valid:
            raise SQLiteRecoveryError(
                f"mounted staging validation failed: {staging_validation.error}"
            )
        logger.info(
            "[DB-RECOVERY:%s] mounted staging database verified: %s",
            short_id,
            staging,
        )

        if _bundle_fingerprints(db_path) != source_bundle:
            raise SQLiteRecoveryError(
                "live database changed during recovery; activation cancelled"
            )

        # Stale WAL/journal sidecars must not be left beside the rebuilt main DB.
        # Move them into the timestamped archive, and restore them if replacement
        # itself fails before the new main database becomes active.
        for suffix in ("-wal", "-shm", "-journal"):
            sidecar = Path(str(db_path) + suffix)
            if not sidecar.exists():
                continue
            archived = recovery_dir / f"live_at_activation{suffix}"
            os.replace(str(sidecar), str(archived))
            moved_sidecars[sidecar] = archived

        os.replace(str(staging), str(db_path))
        main_replaced = True

        active_validation = validate_sqlite_database(
            db_path,
            required_tables=required_tables,
            required_columns=required_columns,
            minimum_total_rows=minimum_total_rows,
            require_foreign_key_clean=require_foreign_key_clean,
        )
        if not active_validation.valid:
            raise SQLiteRecoveryError(
                f"active database validation failed: {active_validation.error}"
            )
        return active_validation
    except Exception as activation_error:
        if main_replaced:
            try:
                _restore_source_bundle(
                    snapshot_path,
                    db_path,
                    recovery_dir,
                    event_id,
                )
            except Exception as rollback_error:
                raise SQLiteRecoveryError(
                    "candidate activation failed and automatic source rollback also "
                    f"failed: activation={activation_error}; rollback={rollback_error}"
                ) from activation_error
        else:
            for original, archived in reversed(list(moved_sidecars.items())):
                if archived.exists():
                    try:
                        os.replace(str(archived), str(original))
                    except OSError as rollback_error:
                        logger.critical(
                            "[DB-RECOVERY:%s] could not restore sidecar %s: %s",
                            short_id,
                            original,
                            rollback_error,
                        )
        if isinstance(activation_error, SQLiteRecoveryError):
            raise
        raise SQLiteRecoveryError(str(activation_error)) from activation_error
    finally:
        if staging.exists():
            try:
                staging.unlink()
            except OSError:
                logger.warning("Could not remove recovery staging file: %s", staging)


EmptyFallbackInitializer = Callable[[sqlite3.Connection], None]


def _create_and_activate_empty_fallback(
    db_path: Path,
    *,
    cli: Optional[str],
    stamp: str,
    event_id: str,
    recovery_dir: Path,
    snapshot_path: Path,
    manifest_path: Path,
    manifest: Dict[str, object],
    source_bundle: Dict[str, Dict[str, object]],
    required_tables: Optional[Sequence[str]],
    required_columns: Optional[Dict[str, Sequence[str]]],
    require_foreign_key_clean: bool,
    initializer: EmptyFallbackInitializer,
    recovery_error: Exception,
    activate: bool,
) -> SQLiteRecoveryResult:
    """Build a verified empty schema after recovery failed, preserving the archive."""
    short_id = event_id[:8]
    binary_backup = recovery_dir / f"{db_path.stem}.empty-fallback.{stamp}.backup.db"
    sql_backup = recovery_dir / f"{db_path.stem}.empty-fallback.{stamp}.backup.sql"

    with tempfile.TemporaryDirectory(prefix=f"sqlite-empty-fallback-{short_id}-") as temp_name:
        work_dir = Path(temp_name)
        candidate = work_dir / "candidate_empty_fallback.db"
        conn = sqlite3.connect(str(candidate), timeout=15)
        try:
            conn.execute("PRAGMA journal_mode=DELETE;")
            conn.execute("PRAGMA synchronous=FULL;")
            conn.execute("PRAGMA foreign_keys=ON;")
            initializer(conn)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        validation = validate_sqlite_database(
            candidate,
            required_tables=required_tables,
            required_columns=required_columns,
            minimum_total_rows=0,
            require_foreign_key_clean=require_foreign_key_clean,
        )
        if not validation.valid:
            raise SQLiteRecoveryError(
                f"empty fallback candidate validation failed: {validation.error}"
            )

        manifest.update(
            {
                "status": "empty_fallback_candidate_verified",
                "recovery_method": "empty_fallback",
                "degraded_mode": True,
                "fallback_reason": str(recovery_error),
                "error_message": str(recovery_error),
                "validation": asdict(validation),
                "rollback_replacements": 0,
            }
        )
        _record_manifest_in_candidate(candidate, manifest)
        validation = validate_sqlite_database(
            candidate,
            required_tables=required_tables,
            required_columns=required_columns,
            minimum_total_rows=0,
            require_foreign_key_clean=require_foreign_key_clean,
        )
        if not validation.valid:
            raise SQLiteRecoveryError(
                f"empty fallback failed after audit record: {validation.error}"
            )

        _copy_file_verified(candidate, binary_backup)
        backup_validation = validate_sqlite_database(
            binary_backup,
            required_tables=required_tables,
            required_columns=required_columns,
            minimum_total_rows=0,
            require_foreign_key_clean=require_foreign_key_clean,
        )
        if not backup_validation.valid:
            raise SQLiteRecoveryError(
                f"empty fallback backup failed validation: {backup_validation.error}"
            )

        local_sql_backup = work_dir / "empty_fallback.backup.sql"
        sql_stderr = work_dir / "empty_fallback_export.stderr.txt"
        if cli:
            sql_rc = _run_export(cli, candidate, ".dump", local_sql_backup, sql_stderr)
            if (
                sql_rc != 0
                or not local_sql_backup.is_file()
                or not local_sql_backup.stat().st_size
            ):
                raise SQLiteRecoveryError(
                    f"empty fallback SQL export failed: {_read_text(sql_stderr)[:500]}"
                )
            _copy_file_verified(
                sql_stderr,
                recovery_dir / "empty_fallback_export.stderr.txt",
            )
        else:
            dump_conn = sqlite3.connect(str(candidate), timeout=15)
            try:
                dump_text = "\n".join(dump_conn.iterdump()) + "\n"
            finally:
                dump_conn.close()
            local_sql_backup.write_text(dump_text, encoding="utf-8", newline="\n")
        _copy_file_verified(local_sql_backup, sql_backup)

        active_path = binary_backup
        active_validation = validation
        if activate:
            active_validation = _activate_candidate(
                db_path,
                candidate,
                snapshot_path,
                recovery_dir,
                event_id,
                source_bundle,
                required_tables,
                required_columns,
                0,
                require_foreign_key_clean,
            )
            active_path = db_path

        completed_at = _utc_iso()
        manifest.update(
            {
                "status": "recovery_degraded_empty",
                "recovery_completed_at_utc": completed_at,
                "active_path": str(active_path),
                "activated": activate,
                "validation": asdict(active_validation),
                "binary_backup_path": str(binary_backup),
                "binary_backup_sha256": _sha256(binary_backup),
                "sql_backup_path": str(sql_backup),
                "sql_backup_sha256": _sha256(sql_backup),
                "maintenance_record_sync_required": True,
            }
        )
        if active_path.is_file():
            manifest["active_sha256"] = _sha256(active_path)
        _write_manifest(manifest_path, manifest)
        if activate:
            _record_manifest_in_candidate(db_path, manifest)

        logger.critical(
            "[DB-RECOVERY:%s] logical recovery failed; verified empty auth DB "
            "activated in degraded mode. Corrupt archive retained at %s; reason=%s",
            short_id,
            recovery_dir,
            recovery_error,
        )
        return SQLiteRecoveryResult(
            success=True,
            event_id=event_id,
            method="empty_fallback",
            source_path=db_path,
            recovery_dir=recovery_dir,
            snapshot_path=snapshot_path,
            active_path=active_path,
            binary_backup_path=binary_backup,
            sql_backup_path=sql_backup,
            validation=active_validation,
            rollback_replacements=0,
            manifest_path=manifest_path,
        )


def recover_sqlite_database(
    db_path: Path,
    *,
    required_tables: Optional[Sequence[str]] = None,
    required_columns: Optional[Dict[str, Sequence[str]]] = None,
    minimum_total_rows: int = 0,
    require_foreign_key_clean: bool = False,
    sqlite_cli: Optional[str] = None,
    activate: bool = True,
    empty_fallback_initializer: Optional[EmptyFallbackInitializer] = None,
) -> SQLiteRecoveryResult:
    """Recover from a timestamped backup; all rebuild work runs in local temp storage."""
    db_path = Path(db_path).resolve()
    if not db_path.is_file():
        raise SQLiteRecoveryError(f"database to recover does not exist: {db_path}")

    cli: Optional[str] = None
    cli_error: Optional[SQLiteRecoveryError] = None
    try:
        cli = _find_sqlite_cli(sqlite_cli)
    except SQLiteRecoveryError as exc:
        cli_error = exc

    detected_dt = datetime.now(timezone.utc)
    detected_at = _utc_iso(detected_dt)
    stamp = _utc_stamp(detected_dt)
    event_id = uuid.uuid4().hex
    short_id = event_id[:8]
    source_bundle = _bundle_fingerprints(db_path)
    source_main = source_bundle.get("main")
    if source_main is None:
        raise SQLiteRecoveryError(f"database to recover disappeared: {db_path}")
    source_modified_at = str(source_main["last_modified_at_utc"])
    source_size = int(source_main["size"])
    source_hash = str(source_main["sha256"])

    recovery_dir = (
        db_path.parent
        / "recovery_backups"
        / f"{db_path.stem}.corrupted.{stamp}.{short_id}"
    )
    snapshot_path = recovery_dir / (
        f"{db_path.stem}.corrupted.{stamp}{db_path.suffix or '.db'}"
    )
    manifest_path = recovery_dir / f"{db_path.stem}.recovery.{stamp}.json"
    binary_backup = recovery_dir / f"{db_path.stem}.recovered.{stamp}.backup.db"
    sql_backup = recovery_dir / f"{db_path.stem}.recovered.{stamp}.backup.sql"

    recovery_dir.mkdir(parents=True, exist_ok=False)
    manifest: Dict[str, object] = {
        "event_id": event_id,
        "event_type": "sqlite_corruption_recovery",
        "status": "recovery_started",
        "database_name": db_path.name,
        "created_at_utc": detected_at,
        "corruption_detected_at_utc": detected_at,
        "source_last_modified_at_utc": source_modified_at,
        "recovery_started_at_utc": detected_at,
        "recovery_completed_at_utc": None,
        "source_path": str(db_path),
        "source_size_bytes": source_size,
        "source_sha256": source_hash,
        "source_bundle": source_bundle,
        "corrupt_backup_path": str(snapshot_path),
        "corrupt_backup_sha256": None,
        "binary_backup_path": None,
        "sql_backup_path": None,
        "manifest_path": str(manifest_path),
        "sqlite_cli": cli,
        "sqlite_cli_error": str(cli_error) if cli_error else None,
        "attempts": [],
    }
    _write_manifest(manifest_path, manifest)
    logger.error(
        "[DB-RECOVERY:%s] corruption detected at %s; source_mtime=%s; source=%s",
        short_id,
        detected_at,
        source_modified_at,
        db_path,
    )

    chosen_method = ""
    chosen_candidate: Optional[Path] = None
    chosen_validation: Optional[SQLiteValidationResult] = None
    chosen_replacements = 0
    corrupt_backup_ready = False

    try:
        _copy_source_bundle(db_path, snapshot_path)
        if _bundle_fingerprints(db_path) != source_bundle:
            raise SQLiteRecoveryError(
                "source changed while the timestamped corrupt backup was being created"
            )
        snapshot_hash = _sha256(snapshot_path)
        manifest.update(
            {
                "status": "corrupt_backup_created",
                "corrupt_backup_created_at_utc": _utc_iso(),
                "corrupt_backup_sha256": snapshot_hash,
            }
        )
        _write_manual_recovery_guide(
            recovery_dir / "MANUAL_RECOVERY.txt",
            snapshot_path,
            detected_at,
            source_modified_at,
            snapshot_hash,
        )
        _write_manifest(manifest_path, manifest)
        corrupt_backup_ready = True
        logger.warning(
            "[DB-RECOVERY:%s] corrupt bundle retained for manual repair: %s sha256=%s",
            short_id,
            snapshot_path,
            snapshot_hash,
        )

        if cli_error is not None:
            raise cli_error
        assert cli is not None

        with tempfile.TemporaryDirectory(prefix=f"sqlite-recovery-{short_id}-") as temp_name:
            work_dir = Path(temp_name)
            local_source = work_dir / "corrupt_working_copy.db"
            _copy_bundle_to_local(snapshot_path, local_source)
            logger.info(
                "[DB-RECOVERY:%s] local working copy ready: %s",
                short_id,
                work_dir,
            )

            for method, command in (
                ("dump", ".dump"),
                ("recover", ".recover --ignore-freelist"),
            ):
                raw_sql = work_dir / f"{method}_raw.sql"
                cleaned_sql = work_dir / f"{method}_cleaned.sql"
                export_stderr = work_dir / f"{method}.stderr.txt"
                import_stdout = work_dir / f"{method}_import.stdout.txt"
                import_stderr = work_dir / f"{method}_import.stderr.txt"
                candidate = work_dir / f"candidate_{method}.db"
                attempt: Dict[str, object] = {
                    "method": method,
                    "command": command,
                    "started_at_utc": _utc_iso(),
                }
                logger.info(
                    "[DB-RECOVERY:%s] logical rebuild started: method=%s",
                    short_id,
                    method,
                )
                try:
                    export_rc = _run_export(
                        cli, local_source, command, raw_sql, export_stderr
                    )
                    raw_bytes = raw_sql.read_bytes()
                    cleaned_bytes, replacements = normalize_dump_transaction(raw_bytes)
                    cleaned_sql.write_bytes(cleaned_bytes)
                    attempt.update(
                        {
                            "export_returncode": export_rc,
                            "export_stderr": _read_text(export_stderr),
                            "raw_sql_size": len(raw_bytes),
                            "rollback_replacements": replacements,
                        }
                    )
                    if not raw_bytes.strip():
                        raise SQLiteRecoveryError(f"sqlite3 {command} produced no SQL")

                    import_rc = _import_sql(
                        cli,
                        cleaned_sql,
                        candidate,
                        import_stdout,
                        import_stderr,
                    )
                    attempt.update(
                        {
                            "import_returncode": import_rc,
                            "import_stdout": _read_text(import_stdout),
                            "import_stderr": _read_text(import_stderr),
                        }
                    )
                    if import_rc != 0:
                        raise SQLiteRecoveryError(
                            f"{method} import failed: {_read_text(import_stderr)[:500]}"
                        )

                    validation = validate_sqlite_database(
                        candidate,
                        required_tables=required_tables,
                        required_columns=required_columns,
                        minimum_total_rows=minimum_total_rows,
                        require_foreign_key_clean=require_foreign_key_clean,
                    )
                    attempt["validation"] = asdict(validation)
                    if not validation.valid:
                        raise SQLiteRecoveryError(
                            f"{method} candidate validation failed: {validation.error}"
                        )

                    chosen_method = method
                    chosen_candidate = candidate
                    chosen_validation = validation
                    chosen_replacements = replacements
                    attempt.update(
                        {
                            "status": "success",
                            "completed_at_utc": _utc_iso(),
                        }
                    )
                    attempts = manifest["attempts"]
                    assert isinstance(attempts, list)
                    attempts.append(attempt)
                    _persist_attempt_artifacts(work_dir, recovery_dir, method)
                    logger.warning(
                        "[DB-RECOVERY:%s] candidate verified: method=%s tables=%d rows=%d",
                        short_id,
                        method,
                        len(validation.tables),
                        validation.total_rows,
                    )
                    break
                except Exception as method_error:
                    attempt.update(
                        {
                            "status": "failed",
                            "completed_at_utc": _utc_iso(),
                            "error": str(method_error),
                        }
                    )
                    attempts = manifest["attempts"]
                    assert isinstance(attempts, list)
                    attempts.append(attempt)
                    _persist_attempt_artifacts(work_dir, recovery_dir, method)
                    _write_manifest(manifest_path, manifest)
                    logger.warning(
                        "[DB-RECOVERY:%s] method=%s failed: %s",
                        short_id,
                        method,
                        method_error,
                    )

            if chosen_candidate is None or chosen_validation is None:
                raise SQLiteRecoveryError("all logical recovery methods failed")

            manifest.update(
                {
                    "status": "candidate_verified",
                    "recovery_method": chosen_method,
                    "rollback_replacements": chosen_replacements,
                    "validation": asdict(chosen_validation),
                    "error_message": None,
                }
            )
            _record_manifest_in_candidate(chosen_candidate, manifest)
            chosen_validation = validate_sqlite_database(
                chosen_candidate,
                required_tables=required_tables,
                required_columns=required_columns,
                minimum_total_rows=minimum_total_rows,
                require_foreign_key_clean=require_foreign_key_clean,
            )
            if not chosen_validation.valid:
                raise SQLiteRecoveryError(
                    f"candidate failed after audit record: {chosen_validation.error}"
                )
            manifest["validation"] = asdict(chosen_validation)
            _write_manifest(manifest_path, manifest)

            _copy_file_verified(chosen_candidate, binary_backup)
            backup_validation = validate_sqlite_database(
                binary_backup,
                required_tables=required_tables,
                required_columns=required_columns,
                minimum_total_rows=minimum_total_rows,
                require_foreign_key_clean=require_foreign_key_clean,
            )
            if not backup_validation.valid:
                raise SQLiteRecoveryError(
                    f"persistent binary backup failed validation: {backup_validation.error}"
                )

            local_sql = work_dir / "verified_recovered.backup.sql"
            local_sql_err = work_dir / "verified_sql_export.stderr.txt"
            sql_rc = _run_export(
                cli, chosen_candidate, ".dump", local_sql, local_sql_err
            )
            if sql_rc != 0 or not local_sql.stat().st_size:
                raise SQLiteRecoveryError(
                    f"verified SQL export failed: {_read_text(local_sql_err)[:500]}"
                )
            _copy_file_verified(local_sql, sql_backup)
            _copy_file_verified(
                local_sql_err,
                recovery_dir / "verified_sql_export.stderr.txt",
            )
            manifest.update(
                {
                    "status": "verified_backups_created",
                    "verified_backups_created_at_utc": _utc_iso(),
                    "binary_backup_path": str(binary_backup),
                    "binary_backup_sha256": _sha256(binary_backup),
                    "sql_backup_path": str(sql_backup),
                    "sql_backup_sha256": _sha256(sql_backup),
                }
            )
            _write_manifest(manifest_path, manifest)
            logger.warning(
                "[DB-RECOVERY:%s] verified backups ready: binary=%s sql=%s",
                short_id,
                binary_backup,
                sql_backup,
            )

            active_path = binary_backup
            if activate:
                chosen_validation = _activate_candidate(
                    db_path,
                    chosen_candidate,
                    snapshot_path,
                    recovery_dir,
                    event_id,
                    source_bundle,
                    required_tables,
                    required_columns,
                    minimum_total_rows,
                    require_foreign_key_clean,
                )
                active_path = db_path
                logger.warning(
                    "[DB-RECOVERY:%s] recovered database activated: %s",
                    short_id,
                    db_path,
                )

            manifest.update(
                {
                    "status": "recovery_succeeded",
                    "recovery_completed_at_utc": _utc_iso(),
                    "validation": asdict(chosen_validation),
                    "active_path": str(active_path),
                    "activated": activate,
                }
            )

            # The final JSON is synchronized into database_maintenance_events
            # by schema initialization immediately after activation.
            manifest["maintenance_record_sync_required"] = True

            manifest.update(
                {
                    "active_sha256": _sha256(active_path),
                    "binary_backup_sha256": _sha256(binary_backup),
                    "sql_backup_sha256": _sha256(sql_backup),
                }
            )
            _write_manifest(manifest_path, manifest)
            logger.warning(
                "[DB-RECOVERY:%s] recovery completed successfully at %s",
                short_id,
                manifest["recovery_completed_at_utc"],
            )
            return SQLiteRecoveryResult(
                success=True,
                event_id=event_id,
                method=chosen_method,
                source_path=db_path,
                recovery_dir=recovery_dir,
                snapshot_path=snapshot_path,
                active_path=active_path,
                binary_backup_path=binary_backup,
                sql_backup_path=sql_backup,
                validation=chosen_validation,
                rollback_replacements=chosen_replacements,
                manifest_path=manifest_path,
            )
    except Exception as exc:
        if empty_fallback_initializer is not None and corrupt_backup_ready:
            logger.error(
                "[DB-RECOVERY:%s] automatic logical recovery failed; attempting "
                "verified empty auth DB fallback: %s",
                short_id,
                exc,
            )
            try:
                return _create_and_activate_empty_fallback(
                    db_path,
                    cli=cli,
                    stamp=stamp,
                    event_id=event_id,
                    recovery_dir=recovery_dir,
                    snapshot_path=snapshot_path,
                    manifest_path=manifest_path,
                    manifest=manifest,
                    source_bundle=source_bundle,
                    required_tables=required_tables,
                    required_columns=required_columns,
                    require_foreign_key_clean=require_foreign_key_clean,
                    initializer=empty_fallback_initializer,
                    recovery_error=exc,
                    activate=activate,
                )
            except Exception as fallback_error:
                logger.critical(
                    "[DB-RECOVERY:%s] empty DB fallback also failed: %s",
                    short_id,
                    fallback_error,
                    exc_info=True,
                )
                exc = SQLiteRecoveryError(
                    "logical recovery failed and empty fallback failed: "
                    f"recovery={exc}; fallback={fallback_error}"
                )

        manifest.update(
            {
                "status": "recovery_failed",
                "recovery_completed_at_utc": _utc_iso(),
                "error_message": str(exc),
            }
        )
        try:
            _write_manifest(manifest_path, manifest)
        except Exception as manifest_error:
            logger.critical(
                "[DB-RECOVERY:%s] could not persist failure manifest %s: %s",
                short_id,
                manifest_path,
                manifest_error,
            )
        logger.critical(
            "[DB-RECOVERY:%s] recovery failed; archive retained at %s; error=%s",
            short_id,
            recovery_dir,
            exc,
        )
        if isinstance(exc, SQLiteRecoveryError):
            raise
        raise SQLiteRecoveryError(str(exc)) from exc
