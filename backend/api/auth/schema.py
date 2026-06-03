"""
认证数据库 DDL 建表与迁移逻辑。
"""

import asyncio
import logging

from .db import _db_connection, _iso, _safe_execute, _utc_now, AUTH_DB_PATH

logger = logging.getLogger(__name__)

_auth_storage_lock = asyncio.Lock()


def _rebuild_guest_identity_records_table(conn) -> None:
    """
    重建 guest_identity_records 表以添加 id PRIMARY KEY 列。
    SQLite 不支持 ALTER TABLE ADD COLUMN ... PRIMARY KEY，必须通过重建表实现。

    使用显式事务控制：成功则 COMMIT，失败则 ROLLBACK 保证原表安全。
    """
    # 1. 检查旧表是否存在
    old_table = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='guest_identity_records'"
    ).fetchone()
    if old_table is None:
        return

    try:
        # 2. 清理可能的残留临时表，然后创建新表（带 id 列）
        conn.execute("DROP TABLE IF EXISTS guest_identity_records_new")
        conn.execute("""
            CREATE TABLE guest_identity_records_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guest_uid TEXT UNIQUE NOT NULL,
                username TEXT NOT NULL DEFAULT 'user',
                role TEXT NOT NULL DEFAULT 'guest',
                guest_device_id TEXT,
                ip TEXT,
                coord_source TEXT NOT NULL DEFAULT 'unknown',
                geo_permission TEXT NOT NULL DEFAULT 'unknown',
                encoded_pos TEXT NOT NULL DEFAULT '0',
                last_latitude REAL,
                last_longitude REAL,
                user_agent TEXT,
                visit_count INTEGER NOT NULL DEFAULT 0,
                first_seen_at TEXT NOT NULL DEFAULT '',
                last_seen_at TEXT NOT NULL DEFAULT ''
            )
        """)

        # 3. 迁移数据（从旧表读取可用列）
        old_columns_rows = conn.execute("PRAGMA table_info(guest_identity_records)").fetchall()
        old_column_names = [str(dict(row).get("name") or "") for row in old_columns_rows]

        # 新表的目标列（不含 id，它是自增的）
        new_columns = [
            "guest_uid", "username", "role", "guest_device_id", "ip",
            "coord_source", "geo_permission", "encoded_pos",
            "last_latitude", "last_longitude", "user_agent",
            "visit_count", "first_seen_at", "last_seen_at",
        ]
        # 只选择旧表中实际存在的列
        common_columns = [c for c in new_columns if c in old_column_names]

        if common_columns:
            col_list = ", ".join(common_columns)
            conn.execute(f"""
                INSERT INTO guest_identity_records_new ({col_list})
                SELECT {col_list} FROM guest_identity_records
            """)

        # 4. 替换旧表
        conn.execute("DROP TABLE guest_identity_records")
        conn.execute("ALTER TABLE guest_identity_records_new RENAME TO guest_identity_records")
        conn.commit()
        logger.info("guest_identity_records 表重建迁移完成")
    except Exception as e:
        logger.error("guest_identity_records 表重建失败，已回滚: %s", str(e))
        # 回滚所有变更，恢复原表
        conn.rollback()
        # 清理可能残留的临时表（在新事务中）
        try:
            conn.execute("DROP TABLE IF EXISTS guest_identity_records_new")
            conn.commit()
        except Exception:
            pass
        raise


def init_auth_tables_sync(conn) -> None:
    """
    幂等数据库初始化与迁移（接受外部连接）。
    - 所有 CREATE TABLE IF NOT EXISTS 已自动化。
    - 所有列补充采用 PRAGMA table_info 检测；列补充失败时记录但继续。
    - 所有索引创建采用 CREATE INDEX IF NOT EXISTS；失败时记录但继续。
    - 保证服务始终可启动：不因迁移失败而中断。

    注意：此函数不负责 commit/close，由调用方管理事务。
    """
    now_iso = _iso(_utc_now())
    default_contact = "管理员联系方式：请联系系统管理员"

    # 表：users
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'registered',
            avatar_index INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )
    """)
    user_column_rows = conn.execute("PRAGMA table_info(users)").fetchall()
    user_columns = {str(dict(row).get("name") or "") for row in user_column_rows}
    if "avatar_index" not in user_columns:
        _safe_execute(conn, "ALTER TABLE users ADD COLUMN avatar_index INTEGER NOT NULL DEFAULT 0")

    # 表：sessions
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            role TEXT NOT NULL,
            guest_uid TEXT,
            guest_device_id TEXT,
            ip TEXT,
            user_agent TEXT,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        )
    """)
    session_column_rows = conn.execute("PRAGMA table_info(sessions)").fetchall()
    session_columns = {str(dict(row).get("name") or "") for row in session_column_rows}
    if "guest_uid" not in session_columns:
        _safe_execute(conn, "ALTER TABLE sessions ADD COLUMN guest_uid TEXT")
    if "guest_device_id" not in session_columns:
        _safe_execute(conn, "ALTER TABLE sessions ADD COLUMN guest_device_id TEXT")
    _safe_execute(conn, "CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions(username)")
    _safe_execute(conn, "CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)")
    _safe_execute(conn, "CREATE INDEX IF NOT EXISTS idx_sessions_guest_uid ON sessions(guest_uid)")

    # 表：user_metrics
    _safe_execute(conn, """
        CREATE TABLE IF NOT EXISTS user_metrics (
            username TEXT PRIMARY KEY,
            login_count INTEGER NOT NULL DEFAULT 0,
            total_login_seconds INTEGER NOT NULL DEFAULT 0,
            total_api_calls INTEGER NOT NULL DEFAULT 0,
            total_visit_count INTEGER NOT NULL DEFAULT 0,
            last_login_at TEXT,
            last_logout_at TEXT,
            updated_at TEXT NOT NULL
        )
    """)

    # 表：api_usage_daily
    _safe_execute(conn, """
        CREATE TABLE IF NOT EXISTS api_usage_daily (
            username TEXT NOT NULL,
            role TEXT NOT NULL,
            usage_date TEXT NOT NULL,
            calls INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (username, usage_date)
        )
    """)

    # 表：user_visits
    _safe_execute(conn, """
        CREATE TABLE IF NOT EXISTS user_visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            ip TEXT,
            city TEXT,
            latitude REAL,
            longitude REAL,
            visit_time TEXT NOT NULL,
            user_agent TEXT,
            created_at TEXT NOT NULL
        )
    """)
    _safe_execute(conn, "CREATE INDEX IF NOT EXISTS idx_user_visits_username ON user_visits(username)")
    _safe_execute(conn, "CREATE INDEX IF NOT EXISTS idx_user_visits_created_at ON user_visits(created_at)")

    # 表：visit_tracking_events
    _safe_execute(conn, """
        CREATE TABLE IF NOT EXISTS visit_tracking_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'guest',
            guest_uid TEXT,
            quota_subject TEXT,
            ip TEXT,
            ip_city TEXT,
            ip_region TEXT,
            ip_country TEXT,
            latitude REAL,
            longitude REAL,
            coord_source TEXT NOT NULL DEFAULT 'unknown',
            geo_permission TEXT NOT NULL DEFAULT 'unknown',
            gps_accuracy REAL,
            gps_error TEXT,
            gps_timestamp TEXT,
            encoded_pos TEXT NOT NULL DEFAULT '0',
            visit_time TEXT NOT NULL,
            user_agent TEXT,
            created_at TEXT NOT NULL,
            supabase_sync_status TEXT NOT NULL DEFAULT 'pending',
            supabase_sync_error TEXT,
            supabase_synced_at TEXT
        )
    """)
    visit_tracking_column_rows = conn.execute("PRAGMA table_info(visit_tracking_events)").fetchall()
    visit_tracking_columns = {str(dict(row).get("name") or "") for row in visit_tracking_column_rows}
    if "role" not in visit_tracking_columns:
        _safe_execute(conn, "ALTER TABLE visit_tracking_events ADD COLUMN role TEXT NOT NULL DEFAULT 'guest'")
    if "guest_uid" not in visit_tracking_columns:
        _safe_execute(conn, "ALTER TABLE visit_tracking_events ADD COLUMN guest_uid TEXT")
    if "quota_subject" not in visit_tracking_columns:
        _safe_execute(conn, "ALTER TABLE visit_tracking_events ADD COLUMN quota_subject TEXT")
    if "ip_city" not in visit_tracking_columns:
        _safe_execute(conn, "ALTER TABLE visit_tracking_events ADD COLUMN ip_city TEXT")
    if "ip_region" not in visit_tracking_columns:
        _safe_execute(conn, "ALTER TABLE visit_tracking_events ADD COLUMN ip_region TEXT")
    if "ip_country" not in visit_tracking_columns:
        _safe_execute(conn, "ALTER TABLE visit_tracking_events ADD COLUMN ip_country TEXT")
    if "coord_source" not in visit_tracking_columns:
        _safe_execute(conn, "ALTER TABLE visit_tracking_events ADD COLUMN coord_source TEXT NOT NULL DEFAULT 'unknown'")
    if "geo_permission" not in visit_tracking_columns:
        _safe_execute(conn, "ALTER TABLE visit_tracking_events ADD COLUMN geo_permission TEXT NOT NULL DEFAULT 'unknown'")
    if "gps_accuracy" not in visit_tracking_columns:
        _safe_execute(conn, "ALTER TABLE visit_tracking_events ADD COLUMN gps_accuracy REAL")
    if "gps_error" not in visit_tracking_columns:
        _safe_execute(conn, "ALTER TABLE visit_tracking_events ADD COLUMN gps_error TEXT")
    if "gps_timestamp" not in visit_tracking_columns:
        _safe_execute(conn, "ALTER TABLE visit_tracking_events ADD COLUMN gps_timestamp TEXT")
    if "encoded_pos" not in visit_tracking_columns:
        _safe_execute(conn, "ALTER TABLE visit_tracking_events ADD COLUMN encoded_pos TEXT NOT NULL DEFAULT '0'")
    if "supabase_sync_status" not in visit_tracking_columns:
        _safe_execute(conn, "ALTER TABLE visit_tracking_events ADD COLUMN supabase_sync_status TEXT NOT NULL DEFAULT 'pending'")
    if "supabase_sync_error" not in visit_tracking_columns:
        _safe_execute(conn, "ALTER TABLE visit_tracking_events ADD COLUMN supabase_sync_error TEXT")
    if "supabase_synced_at" not in visit_tracking_columns:
        _safe_execute(conn, "ALTER TABLE visit_tracking_events ADD COLUMN supabase_synced_at TEXT")
    _safe_execute(conn, "CREATE INDEX IF NOT EXISTS idx_visit_tracking_events_username ON visit_tracking_events(username)")
    _safe_execute(conn, "CREATE INDEX IF NOT EXISTS idx_visit_tracking_events_created_at ON visit_tracking_events(created_at)")
    _safe_execute(conn, "CREATE INDEX IF NOT EXISTS idx_visit_tracking_events_source ON visit_tracking_events(coord_source)")
    _safe_execute(conn, "CREATE INDEX IF NOT EXISTS idx_visit_tracking_events_supabase_sync ON visit_tracking_events(supabase_sync_status)")
    _safe_execute(conn, "CREATE INDEX IF NOT EXISTS idx_visit_tracking_events_guest_uid ON visit_tracking_events(guest_uid)")
    _safe_execute(conn, "CREATE INDEX IF NOT EXISTS idx_visit_tracking_events_quota_subject ON visit_tracking_events(quota_subject)")

    # 表：guest_identity_records
    _safe_execute(conn, """
        CREATE TABLE IF NOT EXISTS guest_identity_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guest_uid TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL DEFAULT 'user',
            role TEXT NOT NULL DEFAULT 'guest',
            guest_device_id TEXT,
            ip TEXT,
            coord_source TEXT NOT NULL DEFAULT 'unknown',
            geo_permission TEXT NOT NULL DEFAULT 'unknown',
            encoded_pos TEXT NOT NULL DEFAULT '0',
            last_latitude REAL,
            last_longitude REAL,
            user_agent TEXT,
            visit_count INTEGER NOT NULL DEFAULT 0,
            first_seen_at TEXT NOT NULL DEFAULT '',
            last_seen_at TEXT NOT NULL DEFAULT ''
        )
    """)
    guest_identity_column_rows = conn.execute("PRAGMA table_info(guest_identity_records)").fetchall()
    guest_identity_columns = {str(dict(row).get("name") or "") for row in guest_identity_column_rows}
    # 注意：SQLite 不支持通过 ALTER TABLE 添加 PRIMARY KEY 列。
    # 如果旧表缺少 id 列，需要用重建表的方式迁移。
    if "id" not in guest_identity_columns:
        logger.info("guest_identity_records 缺少 id 列，执行表重建迁移...")
        _rebuild_guest_identity_records_table(conn)
        # 重建后重新读取列信息
        guest_identity_column_rows = conn.execute("PRAGMA table_info(guest_identity_records)").fetchall()
        guest_identity_columns = {str(dict(row).get("name") or "") for row in guest_identity_column_rows}
    if "username" not in guest_identity_columns:
        _safe_execute(conn, "ALTER TABLE guest_identity_records ADD COLUMN username TEXT NOT NULL DEFAULT 'user'")
    if "role" not in guest_identity_columns:
        _safe_execute(conn, "ALTER TABLE guest_identity_records ADD COLUMN role TEXT NOT NULL DEFAULT 'guest'")
    if "guest_device_id" not in guest_identity_columns:
        _safe_execute(conn, "ALTER TABLE guest_identity_records ADD COLUMN guest_device_id TEXT")
    if "ip" not in guest_identity_columns:
        _safe_execute(conn, "ALTER TABLE guest_identity_records ADD COLUMN ip TEXT")
    if "coord_source" not in guest_identity_columns:
        _safe_execute(conn, "ALTER TABLE guest_identity_records ADD COLUMN coord_source TEXT NOT NULL DEFAULT 'unknown'")
    if "geo_permission" not in guest_identity_columns:
        _safe_execute(conn, "ALTER TABLE guest_identity_records ADD COLUMN geo_permission TEXT NOT NULL DEFAULT 'unknown'")
    if "encoded_pos" not in guest_identity_columns:
        _safe_execute(conn, "ALTER TABLE guest_identity_records ADD COLUMN encoded_pos TEXT NOT NULL DEFAULT '0'")
    if "last_latitude" not in guest_identity_columns:
        _safe_execute(conn, "ALTER TABLE guest_identity_records ADD COLUMN last_latitude REAL")
    if "last_longitude" not in guest_identity_columns:
        _safe_execute(conn, "ALTER TABLE guest_identity_records ADD COLUMN last_longitude REAL")
    if "user_agent" not in guest_identity_columns:
        _safe_execute(conn, "ALTER TABLE guest_identity_records ADD COLUMN user_agent TEXT")
    if "visit_count" not in guest_identity_columns:
        _safe_execute(conn, "ALTER TABLE guest_identity_records ADD COLUMN visit_count INTEGER NOT NULL DEFAULT 0")
    if "first_seen_at" not in guest_identity_columns:
        _safe_execute(conn, "ALTER TABLE guest_identity_records ADD COLUMN first_seen_at TEXT NOT NULL DEFAULT ''")
    if "last_seen_at" not in guest_identity_columns:
        _safe_execute(conn, "ALTER TABLE guest_identity_records ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT ''")
    _safe_execute(conn, "CREATE INDEX IF NOT EXISTS idx_guest_identity_records_last_seen ON guest_identity_records(last_seen_at)")
    _safe_execute(conn, "CREATE INDEX IF NOT EXISTS idx_guest_identity_records_encoded_pos ON guest_identity_records(encoded_pos)")

    # 表：announcements
    _safe_execute(conn, """
        CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message TEXT NOT NULL,
            created_by TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

    # 表：announcement_dismissals
    _safe_execute(conn, """
        CREATE TABLE IF NOT EXISTS announcement_dismissals (
            username TEXT NOT NULL,
            announcement_id INTEGER NOT NULL,
            dismissed_at TEXT NOT NULL,
            PRIMARY KEY (username, announcement_id)
        )
    """)

    # 表：user_messages
    _safe_execute(conn, """
        CREATE TABLE IF NOT EXISTS user_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            is_visible INTEGER NOT NULL DEFAULT 1
        )
    """)

    # 表：user_preferences
    _safe_execute(conn, """
        CREATE TABLE IF NOT EXISTS user_preferences (
            username TEXT PRIMARY KEY,
            default_basemap TEXT NOT NULL DEFAULT '',
            language TEXT NOT NULL DEFAULT 'zh-CN',
            unit_system TEXT NOT NULL DEFAULT 'metric',
            preferred_agent_model TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        )
    """)
    preference_column_rows = conn.execute("PRAGMA table_info(user_preferences)").fetchall()
    preference_columns = {str(dict(row).get("name") or "") for row in preference_column_rows}
    if "default_basemap" not in preference_columns:
        _safe_execute(conn, "ALTER TABLE user_preferences ADD COLUMN default_basemap TEXT NOT NULL DEFAULT ''")
    if "language" not in preference_columns:
        _safe_execute(conn, "ALTER TABLE user_preferences ADD COLUMN language TEXT NOT NULL DEFAULT 'zh-CN'")
    if "unit_system" not in preference_columns:
        _safe_execute(conn, "ALTER TABLE user_preferences ADD COLUMN unit_system TEXT NOT NULL DEFAULT 'metric'")
    if "preferred_agent_model" not in preference_columns:
        _safe_execute(conn, "ALTER TABLE user_preferences ADD COLUMN preferred_agent_model TEXT NOT NULL DEFAULT ''")
    if "updated_at" not in preference_columns:
        _safe_execute(conn, "ALTER TABLE user_preferences ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''")
    _safe_execute(conn, "CREATE INDEX IF NOT EXISTS idx_user_preferences_updated_at ON user_preferences(updated_at)")

    # 表：system_config
    _safe_execute(conn, """
        CREATE TABLE IF NOT EXISTS system_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

    # 初始化系统配置
    _safe_execute(conn, """
        INSERT INTO system_config (key, value, updated_at)
        VALUES ('admin_contact', ?, ?)
        ON CONFLICT(key) DO NOTHING
    """, (default_contact, now_iso))


def _init_auth_storage_sync() -> None:
    """
    向后兼容的包装函数：创建连接 → 执行 DDL → 提交。
    内部调用 init_auth_tables_sync(conn)。
    """
    with _db_connection() as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        init_auth_tables_sync(conn)
        conn.commit()


async def init_auth_storage() -> None:
    from . import db as _db_module

    if _db_module._auth_storage_ready:
        return

    async with _auth_storage_lock:
        if _db_module._auth_storage_ready:
            return

        try:
            await asyncio.to_thread(_init_auth_storage_sync)
            _db_module._auth_storage_ready = True
            logger.info("认证存储已初始化: %s", str(AUTH_DB_PATH))
        except Exception as e:
            logger.error("认证存储初始化失败 (path=%s): %s", str(AUTH_DB_PATH), str(e), exc_info=True)
            # 确保标志位保持 False，以便下次请求重试
            _db_module._auth_storage_ready = False
            raise
