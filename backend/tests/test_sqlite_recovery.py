import hashlib
import json
import shutil
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import core.sqlite_recovery as recovery_module
from core.sqlite_maintenance import (
    MAINTENANCE_TABLE,
    record_maintenance_manifest,
    sync_recovery_manifests,
)
from core.sqlite_recovery import (
    SQLiteRecoveryError,
    normalize_dump_transaction,
    recover_sqlite_database,
    validate_sqlite_database,
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _initialize_empty_auth_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL
        );
        CREATE TABLE sessions (
            token TEXT PRIMARY KEY,
            username TEXT NOT NULL
        );
        CREATE TABLE system_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """
    )


def _create_auth_fixture(path: Path) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.executescript(
            """
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE sessions (
                token TEXT PRIMARY KEY,
                username TEXT NOT NULL
            );
            CREATE TABLE system_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            INSERT INTO users (username, password_hash) VALUES ('alice', 'hash');
            INSERT INTO sessions (token, username) VALUES ('token-1', 'alice');
            INSERT INTO system_config (key, value) VALUES ('admin_contact', 'admin@example.com');
            """
        )
        conn.commit()
    finally:
        conn.close()


class DumpNormalizationTests(unittest.TestCase):
    def test_replaces_standalone_rollback_and_preserves_crlf(self):
        raw = b"BEGIN TRANSACTION;\r\nINSERT INTO t VALUES(1);\r\nROLLBACK;\r\n"
        cleaned, replacements = normalize_dump_transaction(raw)

        self.assertEqual(replacements, 1)
        self.assertEqual(
            cleaned,
            b"BEGIN TRANSACTION;\r\nINSERT INTO t VALUES(1);\r\nCOMMIT;\r\n",
        )

    def test_does_not_replace_rollback_inside_sql_text(self):
        raw = b"INSERT INTO t VALUES('ROLLBACK;');\nCOMMIT;\n"
        cleaned, replacements = normalize_dump_transaction(raw)

        self.assertEqual(replacements, 0)
        self.assertEqual(cleaned, raw)


class MaintenanceManifestTests(unittest.TestCase):
    def test_record_upserts_one_event(self):
        conn = sqlite3.connect(":memory:")
        try:
            manifest = {
                "event_id": "event-1",
                "database_name": "auth.db",
                "event_type": "sqlite_corruption_recovery",
                "status": "recovery_started",
                "created_at_utc": "2026-07-31T00:00:00+00:00",
                "validation": {"tables": [], "row_counts": {}},
            }
            record_maintenance_manifest(conn, manifest)
            manifest["status"] = "recovery_failed"
            manifest["error_message"] = "synthetic failure"
            record_maintenance_manifest(conn, manifest)
            conn.commit()

            rows = conn.execute(
                f"SELECT event_id, status, error_message FROM {MAINTENANCE_TABLE}"
            ).fetchall()
            self.assertEqual(rows, [("event-1", "recovery_failed", "synthetic failure")])
        finally:
            conn.close()

    def test_sync_imports_json_manifest(self):
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            report_dir = root / "auth.corrupted.test"
            report_dir.mkdir()
            manifest_path = report_dir / "auth.recovery.test.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "event_id": "event-json",
                        "database_name": "auth.db",
                        "event_type": "sqlite_corruption_recovery",
                        "status": "recovery_succeeded",
                        "created_at_utc": "2026-07-31T00:00:00+00:00",
                        "validation": {
                            "quick_check": ["ok"],
                            "integrity_check": ["ok"],
                            "foreign_key_violations": [],
                            "tables": ["users"],
                            "row_counts": {"users": 2},
                        },
                    }
                ),
                encoding="utf-8",
            )

            conn = sqlite3.connect(":memory:")
            try:
                imported = sync_recovery_manifests(conn, root)
                conn.commit()
                row = conn.execute(
                    f"SELECT status, recovered_table_count, recovered_row_count "
                    f"FROM {MAINTENANCE_TABLE} WHERE event_id='event-json'"
                ).fetchone()
                self.assertEqual(imported, 1)
                self.assertEqual(row, ("recovery_succeeded", 1, 2))
            finally:
                conn.close()


@unittest.skipUnless(shutil.which("sqlite3"), "sqlite3 CLI is required")
class SQLiteRecoveryIntegrationTests(unittest.TestCase):
    required_tables = ("users", "sessions", "system_config")
    required_columns = {
        "users": ("id", "username", "password_hash"),
        "sessions": ("token", "username"),
        "system_config": ("key", "value"),
    }

    def test_rebuilds_in_temp_storage_and_preserves_all_artifacts(self):
        with tempfile.TemporaryDirectory() as temp_name:
            db_path = Path(temp_name) / "auth.db"
            _create_auth_fixture(db_path)
            original_hash = _sha256(db_path)

            result = recover_sqlite_database(
                db_path,
                required_tables=self.required_tables,
                required_columns=self.required_columns,
                minimum_total_rows=3,
                activate=True,
            )

            self.assertTrue(result.success)
            self.assertTrue(result.snapshot_path.is_file())
            self.assertEqual(_sha256(result.snapshot_path), original_hash)
            self.assertTrue(result.binary_backup_path.is_file())
            self.assertTrue(result.sql_backup_path.is_file())
            self.assertIn("CREATE TABLE users", result.sql_backup_path.read_text("utf-8"))

            validation = validate_sqlite_database(
                db_path,
                required_tables=self.required_tables,
                required_columns=self.required_columns,
                minimum_total_rows=3,
            )
            self.assertTrue(validation.valid, validation.error)

            manifest = json.loads(result.manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(manifest["status"], "recovery_succeeded")
            self.assertEqual(manifest["source_sha256"], original_hash)
            self.assertEqual(manifest["corrupt_backup_sha256"], original_hash)
            self.assertTrue(manifest["maintenance_record_sync_required"])

            conn = sqlite3.connect(db_path)
            try:
                sync_recovery_manifests(conn, db_path.parent / "recovery_backups")
                conn.commit()
                status = conn.execute(
                    f"SELECT status FROM {MAINTENANCE_TABLE} WHERE event_id=?",
                    (result.event_id,),
                ).fetchone()[0]
                self.assertEqual(status, "recovery_succeeded")
            finally:
                conn.close()

    def test_failed_logical_recovery_activates_verified_empty_fallback(self):
        with tempfile.TemporaryDirectory() as temp_name:
            db_path = Path(temp_name) / "auth.db"
            _create_auth_fixture(db_path)
            original_hash = _sha256(db_path)

            result = recover_sqlite_database(
                db_path,
                required_tables=self.required_tables,
                required_columns=self.required_columns,
                minimum_total_rows=4,
                activate=True,
                empty_fallback_initializer=_initialize_empty_auth_schema,
            )

            self.assertTrue(result.success)
            self.assertEqual(result.method, "empty_fallback")
            self.assertEqual(_sha256(result.snapshot_path), original_hash)
            self.assertTrue(result.binary_backup_path.is_file())
            self.assertTrue(result.sql_backup_path.is_file())

            validation = validate_sqlite_database(
                db_path,
                required_tables=self.required_tables,
                required_columns=self.required_columns,
                minimum_total_rows=0,
            )
            self.assertTrue(validation.valid, validation.error)
            self.assertEqual(validation.row_counts["users"], 0)
            self.assertEqual(validation.row_counts["sessions"], 0)
            self.assertEqual(validation.row_counts["system_config"], 0)

            manifest = json.loads(result.manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(manifest["status"], "recovery_degraded_empty")
            self.assertTrue(manifest["degraded_mode"])
            self.assertEqual(manifest["recovery_method"], "empty_fallback")
            self.assertEqual(manifest["fallback_reason"], "all logical recovery methods failed")

            conn = sqlite3.connect(db_path)
            try:
                status = conn.execute(
                    f"SELECT status FROM {MAINTENANCE_TABLE} WHERE event_id=?",
                    (result.event_id,),
                ).fetchone()[0]
                self.assertEqual(status, "recovery_degraded_empty")
            finally:
                conn.close()

    def test_activation_validation_failure_restores_original_bundle(self):
        with tempfile.TemporaryDirectory() as temp_name:
            db_path = Path(temp_name) / "auth.db"
            _create_auth_fixture(db_path)
            original_bytes = db_path.read_bytes()
            real_validate = recovery_module.validate_sqlite_database

            def fail_only_active(path, *args, **kwargs):
                if Path(path).resolve() == db_path.resolve():
                    return recovery_module.SQLiteValidationResult(
                        valid=False, error="synthetic active validation failure"
                    )
                return real_validate(path, *args, **kwargs)

            with mock.patch.object(
                recovery_module,
                "validate_sqlite_database",
                side_effect=fail_only_active,
            ):
                with self.assertRaises(SQLiteRecoveryError):
                    recover_sqlite_database(
                        db_path,
                        required_tables=self.required_tables,
                        required_columns=self.required_columns,
                        minimum_total_rows=3,
                        activate=True,
                    )

            self.assertEqual(db_path.read_bytes(), original_bytes)
            manifests = list((db_path.parent / "recovery_backups").rglob("*.json"))
            payload = json.loads(manifests[0].read_text(encoding="utf-8"))
            self.assertEqual(payload["status"], "recovery_failed")
            self.assertIn("synthetic active validation failure", payload["error_message"])

    def test_backup_failure_writes_failure_manifest_without_touching_source(self):
        with tempfile.TemporaryDirectory() as temp_name:
            db_path = Path(temp_name) / "auth.db"
            _create_auth_fixture(db_path)
            original_bytes = db_path.read_bytes()

            with mock.patch.object(
                recovery_module,
                "_copy_source_bundle",
                side_effect=SQLiteRecoveryError("synthetic backup failure"),
            ):
                with self.assertRaises(SQLiteRecoveryError):
                    recover_sqlite_database(
                        db_path,
                        required_tables=self.required_tables,
                        required_columns=self.required_columns,
                        minimum_total_rows=3,
                        activate=True,
                        empty_fallback_initializer=_initialize_empty_auth_schema,
                    )

            self.assertEqual(db_path.read_bytes(), original_bytes)
            manifests = list((db_path.parent / "recovery_backups").rglob("*.json"))
            self.assertEqual(len(manifests), 1)
            payload = json.loads(manifests[0].read_text(encoding="utf-8"))
            self.assertEqual(payload["status"], "recovery_failed")
            self.assertEqual(payload["error_message"], "synthetic backup failure")

    def test_failed_recovery_keeps_source_bytes_unchanged(self):
        with tempfile.TemporaryDirectory() as temp_name:
            db_path = Path(temp_name) / "auth.db"
            _create_auth_fixture(db_path)
            original_bytes = db_path.read_bytes()

            with self.assertRaises(SQLiteRecoveryError):
                recover_sqlite_database(
                    db_path,
                    required_tables=("table_that_does_not_exist",),
                    minimum_total_rows=1,
                    activate=True,
                )

            self.assertEqual(db_path.read_bytes(), original_bytes)
            manifests = list((db_path.parent / "recovery_backups").rglob("*.json"))
            self.assertEqual(len(manifests), 1)
            payload = json.loads(manifests[0].read_text(encoding="utf-8"))
            self.assertEqual(payload["status"], "recovery_failed")
            self.assertTrue(Path(payload["corrupt_backup_path"]).is_file())


if __name__ == "__main__":
    unittest.main()
