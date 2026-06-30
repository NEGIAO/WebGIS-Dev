"""
认证数据库路径解析、连接工厂、时间工具函数。
包含数据库损坏自动检测与恢复机制。
"""

import logging
import os
import shutil
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


# ─── 数据库路径 ───
def _default_auth_db_path() -> Path:
    """默认路径策略：HF 使用 /data；本地开发优先项目 data 目录。"""
    space_id = str(os.getenv("SPACE_ID") or os.getenv("HF_SPACE_ID") or "").strip()
    if space_id:
        logger.info("检测到 HuggingFace Space 环境 (SPACE_ID=%s)，使用 /data/webgis_auth.db", space_id)
        return Path("/data/webgis_auth.db")

    if os.name != "nt":
        data_root = Path("/data")
        try:
            if data_root.exists() and os.access(str(data_root), os.W_OK):
                return data_root / "webgis_auth.db"
        except Exception:
            pass

    return Path.cwd() / "data" / "webgis_auth.db"


def _resolve_auth_db_path() -> Path:
    configured = str(os.getenv("AUTH_DB_PATH", "")).strip()
    preferred = Path(configured) if configured else _default_auth_db_path()

    try:
        preferred.parent.mkdir(parents=True, exist_ok=True)
        # 验证目录可写
        test_file = preferred.parent / ".write_test"
        test_file.touch()
        test_file.unlink()
        logger.info("数据库路径解析成功: %s", str(preferred))
        return preferred
    except Exception as e:
        logger.warning("AUTH_DB_PATH (%s) 不可写: %s，尝试回退...", str(preferred), str(e))
        fallback = Path.cwd() / "data" / preferred.name
        try:
            fallback.parent.mkdir(parents=True, exist_ok=True)
            logger.info("已回退到本地路径: %s", str(fallback))
            return fallback
        except Exception as e2:
            logger.error("回退路径也不可用: %s，使用 /tmp 兜底", str(e2))
            return Path("/tmp") / preferred.name


AUTH_DB_PATH = _resolve_auth_db_path()
_auth_storage_ready = False
_recovery_lock = threading.Lock()
_pending_recovery_data = None  # 存储待导入的恢复数据
_migration_backup_done = False


def _cleanup_orphaned_wal_files(db_path: Path) -> None:
    """
    清理孤立的 WAL/SHM 文件。
    只有主库文件不存在时，才认为同名 -wal/-shm 是孤立文件。主库存在时
    不能主动删除 WAL；其中可能包含尚未 checkpoint 的已提交事务，应交给
    SQLite 在连接时自动恢复。
    """
    if db_path.exists():
        return

    for suffix in ("-wal", "-shm"):
        wal_path = Path(str(db_path) + suffix)
        if wal_path.exists():
            try:
                wal_path.unlink()
                logger.info("已清理孤立的 WAL 文件: %s", str(wal_path))
            except Exception as e:
                logger.warning("清理 WAL 文件失败 (%s): %s", str(wal_path), str(e))


def backup_auth_db_for_migration(reason: str) -> Optional[Path]:
    """
    在兼容性 schema 迁移前备份现有 auth 数据库。

    SQLite 新增列采用原地 ALTER TABLE，无需重建整库；但生产旧库首次迁移前
    仍保留主库与 WAL/SHM 的文件级备份，方便异常时人工回滚。
    """
    global _migration_backup_done

    if _migration_backup_done or not AUTH_DB_PATH.exists():
        return None

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    backup_dir = AUTH_DB_PATH.parent / "migration_backups"
    try:
        backup_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        logger.error("创建迁移备份目录失败 (%s): %s", str(backup_dir), str(e))
        return None

    backup_base = backup_dir / f"{AUTH_DB_PATH.name}.pre_email_account_v333.{timestamp}"
    copied_any = False
    for suffix in ("", "-wal", "-shm"):
        source = Path(str(AUTH_DB_PATH) + suffix)
        if not source.exists():
            continue
        target = Path(str(backup_base) + suffix)
        try:
            shutil.copy2(str(source), str(target))
            copied_any = True
        except Exception as e:
            logger.error("迁移备份文件失败 (%s -> %s): %s", str(source), str(target), str(e))

    if copied_any:
        _migration_backup_done = True
        logger.warning("邮箱账号迁移前已备份认证数据库: %s (reason=%s)", str(backup_base), reason)
        return backup_base

    return None

# ─── 数据库损坏恢复 ───
def _try_wal_recovery(db_path: Path) -> tuple[bool, dict]:
    """
    尝试通过 WAL 文件自动回放恢复数据。

    策略：
      1. 创建临时空主库（同目录，避免跨设备 move）
      2. 将原 WAL/SHM **复制**为与临时库同名的文件
         （SQLite 查找 WAL 的规则固定为 "{db_path}-wal"，必须路径匹配）
      3. 连接临时库 → SQLite 自动发现同名 WAL → 回放 → 读取数据
      4. 数据以 dict 返回给调用方（_attempt_db_recovery 步骤3会删掉 db_path，
         所以这里不做 shutil.move，避免写回后被立即删除）

    返回: (是否成功, 恢复的数据字典)
    """
    wal_path = Path(str(db_path) + "-wal")
    shm_path = Path(str(db_path) + "-shm")

    if not wal_path.exists():
        logger.info("无 WAL 文件，跳过 WAL 恢复")
        return False, {}

    logger.info("尝试 WAL 自动回放恢复: 复制 WAL/SHM 到临时路径，让 SQLite 自动回放...")

    import tempfile
    new_db_path: Optional[Path] = None
    wal_temp: Optional[Path] = None
    shm_temp: Optional[Path] = None

    try:
        # 创建临时主库（同目录，名称随机）
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False, dir=db_path.parent) as tmp:
            new_db_path = Path(tmp.name)

        # ── 关键修复 ──────────────────────────────────────────────────────────
        # SQLite 寻找 WAL 时使用固定规则："{主库路径}-wal"
        # 必须将原 WAL/SHM 复制到与临时库同名的位置，才能触发回放。
        # 直接保留原 WAL 不动、连接另一个路径的临时库，SQLite 找不到 WAL。
        # ─────────────────────────────────────────────────────────────────────
        wal_temp = Path(str(new_db_path) + "-wal")
        shutil.copy2(str(wal_path), str(wal_temp))

        if shm_path.exists():
            shm_temp = Path(str(new_db_path) + "-shm")
            shutil.copy2(str(shm_path), str(shm_temp))
            logger.info("已复制 WAL+SHM 到临时路径: %s", str(wal_temp))
        else:
            logger.info("已复制 WAL 到临时路径: %s", str(wal_temp))

        # 连接临时库，SQLite 发现同名 WAL 并自动回放
        conn = sqlite3.connect(str(new_db_path), timeout=10)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("SELECT 1;")  # 触发 WAL checkpoint/回放

        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()

        recovered_data = {}
        total_rows = 0

        for table_row in tables:
            table_name = table_row[0]
            try:
                columns = conn.execute(f'PRAGMA table_info("{table_name}")').fetchall()
                if not columns:
                    continue
                rows = conn.execute(f'SELECT * FROM "{table_name}"').fetchall()
                if rows:
                    recovered_data[table_name] = {
                        'columns': [col[1] for col in columns],
                        'rows': rows
                    }
                    total_rows += len(rows)
                    logger.info("WAL 恢复表 %s: %d 行", table_name, len(rows))
            except Exception as e:
                logger.warning("WAL 恢复表 %s 失败: %s", table_name, str(e))

        conn.close()

        if total_rows > 0:
            logger.info("WAL 自动回放恢复成功: 共 %d 个表, %d 行数据", len(recovered_data), total_rows)
            # 不在此处 shutil.move：_attempt_db_recovery 步骤3 会删除 db_path，
            # move 回去只会被立即删除。数据已在 recovered_data dict 中，
            # 由 _import_recovered_data 在 schema 重建后写入新库。
            return True, recovered_data
        else:
            logger.warning("WAL 回放后无数据（WAL 可能为空或仅含非数据事务）")
            return False, {}

    except sqlite3.DatabaseError as e:
        logger.warning("WAL 自动回放失败 (DatabaseError): %s", str(e))
    except Exception as e:
        logger.warning("WAL 自动回放异常: %s", str(e))
    finally:
        # 清理所有临时文件（主库 + 临时 WAL/SHM）
        for tmp_path in (new_db_path, wal_temp, shm_temp):
            if tmp_path is not None and tmp_path.exists():
                try:
                    tmp_path.unlink()
                except Exception:
                    pass

    return False, {}


def _try_dump_database(db_path: Path) -> dict:
    """
    尝试从损坏的数据库中导出数据。
    返回 {table_name: {'columns': [...], 'rows': [...]}} 的字典，或包含 '_dump_sql' 键的字典。

    使用多种策略尽可能多地恢复数据：
    1. 优先尝试 sqlite3 .dump 命令（最完整的恢复方式），仅保留含 INSERT 的 dump
    2. 如果 .dump 无有效数据，使用 Python sqlite3 模块逐表尝试 SELECT（部分恢复）
    """
    recovered_data = {}
    dump_insert_count = 0

    # 策略1：尝试使用 sqlite3 命令行工具的 .dump 命令
    try:
        import subprocess

        result = subprocess.run(
            ['sqlite3', str(db_path), '.dump'],
            capture_output=True,
            text=True,
            timeout=30
        )

        # .dump 即使在损坏时也可能返回 exitcode=0，但输出只含错误注释
        # 必须验证输出中是否包含真正的 INSERT 语句
        if result.stdout:
            dump_content = result.stdout
            dump_insert_count = sum(1 for line in dump_content.splitlines()
                                    if line.strip().upper().startswith('INSERT '))
            if dump_insert_count > 0:
                logger.info("sqlite3 .dump 成功: %d 条 INSERT 语句, 总大小 %d bytes",
                            dump_insert_count, len(dump_content))
                recovered_data['_dump_sql'] = dump_content
                recovered_data['_dump_insert_count'] = dump_insert_count
            else:
                logger.warning("sqlite3 .dump 输出无有效 INSERT 语句 (可能完全损坏)")
        else:
            logger.warning("sqlite3 .dump 无输出: %s", (result.stderr or '')[:200])

    except FileNotFoundError:
        logger.warning("sqlite3 命令行工具不可用，将使用 Python sqlite3 模块")
    except subprocess.TimeoutExpired:
        logger.warning("sqlite3 .dump 命令超时 (30s)")
    except Exception as e:
        logger.warning("sqlite3 .dump 异常: %s", str(e))

    # 策略2：使用 Python sqlite3 模块逐表尝试恢复
    # 即使 .dump 成功，也执行此步骤作为补充（.dump 可能漏掉部分表）
    conn = None
    try:
        conn = sqlite3.connect(str(db_path), timeout=5)
        conn.execute("PRAGMA journal_mode=OFF;")  # 避免 WAL 相关问题

        # 获取所有表名
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()

        # 如果 .dump 已经成功，跳过逐表恢复（避免重复）
        if dump_insert_count > 0:
            logger.info("sqlite3 .dump 已成功，跳过 Python 逐表恢复")
        for table_row in (tables if dump_insert_count == 0 else []):
            table_name = table_row[0]
            try:
                # 获取表结构（quote 表名防止特殊字符）
                columns = conn.execute(f'PRAGMA table_info("{table_name}")').fetchall()
                if not columns:
                    continue

                # 尝试读取数据
                rows = conn.execute(f'SELECT * FROM "{table_name}"').fetchall()
                if rows:
                    recovered_data[table_name] = {
                        'columns': [col[1] for col in columns],  # 列名
                        'rows': rows
                    }
                    logger.info("表 %s 恢复成功: %d 行", table_name, len(rows))
                else:
                    logger.info("表 %s 为空，跳过", table_name)

            except sqlite3.DatabaseError as e:
                logger.warning("表 %s 读取失败: %s", table_name, str(e))
                continue
            except Exception as e:
                logger.warning("表 %s 恢复异常: %s", table_name, str(e))
                continue

    except sqlite3.DatabaseError as e:
        logger.error("数据库连接失败，无法恢复数据: %s", str(e))
    except Exception as e:
        logger.error("逐表恢复过程异常: %s", str(e))
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

    return recovered_data


def _import_recovered_data(conn: sqlite3.Connection, recovered_data: dict) -> dict:
    """
    将恢复的数据导入到新数据库中。
    支持两种导入模式：
    1. 如果有 '_dump_sql'，仅提取 INSERT 语句执行（跳过 DDL，因 schema 已由 _ensure_schema 重建）
    2. 否则逐表导入（使用 INSERT OR IGNORE 避免冲突）

    返回恢复统计信息：{table_name: {'imported': int, 'failed': int, 'error': str}}
    """
    stats = {}

    if not recovered_data:
        logger.warning("没有恢复的数据可导入")
        return stats

    # 策略1：如果有 dump SQL，仅提取 INSERT 语句执行
    if '_dump_sql' in recovered_data:
        dump_sql = recovered_data['_dump_sql']
        try:
            # 仅提取 INSERT 语句（跳过 PRAGMA / BEGIN / CREATE TABLE / COMMIT / ROLLBACK 等）
            insert_statements = [
                line.strip() for line in dump_sql.splitlines()
                if line.strip().upper().startswith('INSERT ')
            ]

            success_count = 0
            fail_count = 0
            errors = []

            for stmt in insert_statements:
                try:
                    conn.execute(stmt)
                    success_count += 1
                except Exception as e:
                    fail_count += 1
                    error_msg = str(e)[:100]
                    if error_msg not in errors:
                        errors.append(error_msg)

            conn.commit()

            stats['_dump'] = {
                'imported': success_count,
                'failed': fail_count,
                'error': '; '.join(errors) if errors else None
            }

            if success_count > 0:
                logger.info("dump 导入成功: %d 行, 失败 %d 行", success_count, fail_count)
            else:
                logger.warning("dump 导入失败: %d 条 INSERT 均执行失败, 错误: %s",
                               fail_count, '; '.join(errors))

            return stats

        except Exception as e:
            logger.error("执行 dump SQL 失败: %s，回退到逐表导入", str(e), exc_info=True)
            # 继续尝试逐表导入

    # 策略2：逐表导入
    for table_name, data in recovered_data.items():
        if table_name.startswith('_'):  # 跳过元数据键
            continue

        if not isinstance(data, dict) or 'columns' not in data or 'rows' not in data:
            continue

        columns = data['columns']
        rows = data['rows']

        if not rows:
            stats[table_name] = {'imported': 0, 'failed': 0}
            continue

        # 构造 INSERT 语句（引用标识符防止特殊字符）
        placeholders = ', '.join(['?' for _ in columns])
        col_list = ', '.join(f'"{c}"' for c in columns)
        insert_sql = f'INSERT OR IGNORE INTO "{table_name}" ({col_list}) VALUES ({placeholders})'

        imported = 0
        failed = 0
        errors = []

        for row in rows:
            try:
                conn.execute(insert_sql, row)
                imported += 1
            except Exception as e:
                failed += 1
                error_msg = str(e)[:100]
                if error_msg not in errors:
                    errors.append(error_msg)

        stats[table_name] = {
            'imported': imported,
            'failed': failed,
            'error': '; '.join(errors) if errors else None
        }

        if failed > 0:
            logger.warning("表 %s 导入部分失败: 成功 %d，失败 %d，错误: %s",
                           table_name, imported, failed, '; '.join(errors))
        else:
            logger.info("表 %s 导入成功: %d 行", table_name, imported)

    try:
        conn.commit()
    except Exception as e:
        logger.error("提交导入数据失败: %s", str(e))

    return stats


def _attempt_db_recovery(db_path: Path) -> bool:
    """
    数据库损坏恢复：备份损坏文件 → 尝试恢复数据 → 删除损坏文件 → 重置初始化标志。
    使用 threading.Lock 保证同一进程内只执行一次恢复。

    恢复策略（按优先级）：
    1. WAL 自动回放恢复（保留 WAL/SHM，新建主库让 SQLite 回放） —— 最完整，保留最近事务
    2. 优先使用 sqlite3 .dump 命令导出完整 SQL（最完整的恢复方式）
    3. 如果失败，使用 Python sqlite3 模块逐表尝试 SELECT（部分恢复）

    返回: True 表示恢复成功（有数据被恢复），False 表示恢复失败或无数据
    """
    global _auth_storage_ready

    with _recovery_lock:
        # 二次检查：可能另一个线程已完成恢复
        if not db_path.exists():
            logger.info("数据库文件不存在，跳过恢复")
            return False

        timestamp = int(datetime.now(timezone.utc).timestamp())
        backup_path = db_path.with_suffix(
            f"{db_path.suffix}.corrupted.{timestamp}"
        )

        # 步骤1：备份完整的数据库三件套（主库 + WAL + SHM），保留原文件用于恢复尝试
        try:
            for suffix in ("", "-wal", "-shm"):
                src = Path(str(db_path) + suffix)
                if src.exists():
                    dst = Path(str(backup_path) + suffix)
                    shutil.copy2(str(src), str(dst))
                    logger.warning("已备份损坏的数据库文件: %s → %s", str(src), str(dst))
        except Exception as backup_err:
            logger.error("备份损坏数据库失败: %s", str(backup_err))

        # 步骤2：按优先级尝试恢复数据
        recovered_data = {}
        has_recovered_data = False

        # 策略1：WAL 自动回放恢复（最高优先级，保留最近提交的事务）
        logger.info("开始尝试 WAL 自动回放恢复...")
        wal_success, wal_data = _try_wal_recovery(db_path)
        if wal_success and wal_data:
            recovered_data = wal_data
            has_recovered_data = True
            logger.info("WAL 恢复成功，跳过后续恢复策略")

        # 策略2：sqlite3 .dump / 逐表恢复（仅在 WAL 恢复失败时尝试）
        if not has_recovered_data:
            logger.info("WAL 恢复失败或无数据，尝试 sqlite3 dump/逐表恢复...")
            recovered_data = _try_dump_database(db_path)
            has_recovered_data = bool(recovered_data)

        if has_recovered_data:
            if '_dump_sql' in recovered_data:
                logger.info("成功导出数据库 dump，共 %d 条 INSERT 语句", recovered_data.get('_dump_insert_count', 0))
            else:
                table_count = len([k for k in recovered_data.keys() if not k.startswith('_')])
                total_rows = sum(
                    len(data.get('rows', []))
                    for data in recovered_data.values()
                    if isinstance(data, dict) and 'rows' in data
                )
                logger.info("成功恢复 %d 个表的数据，共 %d 行", table_count, total_rows)
        else:
            logger.warning("无法从损坏的数据库中恢复任何数据")

        # 步骤3：删除损坏的主文件、WAL 和 SHM（恢复尝试完成后）
        for suffix in ("", "-wal", "-shm"):
            target = Path(str(db_path) + suffix)
            try:
                if target.exists():
                    target.unlink()
                    logger.info("已删除损坏文件: %s", str(target))
            except Exception as del_err:
                logger.error("删除损坏文件失败 (%s): %s", str(target), str(del_err))

        # 步骤4：重置初始化标志
        _auth_storage_ready = False
        logger.warning("数据库损坏恢复完成，等待 schema 重建")

        # 将恢复的数据存储到全局变量，供后续导入使用
        global _pending_recovery_data
        if has_recovered_data:
            _pending_recovery_data = recovered_data
            logger.info("恢复数据已暂存，等待 schema 重建后导入")

        return has_recovered_data


def _db_file_is_corrupted(db_path: Path) -> bool:
    """通过 PRAGMA quick_check 快速检测数据库文件是否损坏。"""
    """【临时修改】强制返回 False，关闭一切全自动恢复和删除逻辑"""
    logger.warning("【临时提示】已强行关闭数据库自动损坏检测")
    return False
    # try:
    #     if not db_path.exists():
    #         return False
    #     conn = sqlite3.connect(str(db_path), timeout=5)
    #     try:
    #         result = conn.execute("PRAGMA quick_check(1)").fetchone()
    #         is_bad = result is None or str(result[0]).lower() != "ok"
    #         if is_bad:
    #             logger.warning("quick_check 检测到数据库异常: %s", result)
    #         return is_bad
    #     finally:
    #         conn.close()
    # except sqlite3.DatabaseError:
    #     return True
    # except Exception:
    #     return False


# ─── 连接工厂 ───
def _try_connect(db_path: Path) -> sqlite3.Connection:
    """尝试连接数据库，执行基本 PRAGMA 设置。"""
    conn = sqlite3.connect(str(db_path), timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def _ensure_schema() -> None:
    """
    确保数据库表结构存在（幂等）。
    直接使用 _try_connect 建立连接，避免通过 _db_connection() 造成无限递归。
    """
    from .schema import init_auth_tables_sync

    # 启动时仅清理真正孤立的 WAL/SHM；主库存在时交给 SQLite 恢复 WAL 内容。
    _cleanup_orphaned_wal_files(AUTH_DB_PATH)

    conn = _try_connect(AUTH_DB_PATH)
    try:
        init_auth_tables_sync(conn)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    global _auth_storage_ready
    _auth_storage_ready = True
    logger.info("数据库 schema 重建完成: %s", str(AUTH_DB_PATH))


def _db_connection() -> sqlite3.Connection:
    """
    创建数据库连接。每次调用创建新连接，支持多线程并发访问。
    内置损坏自动检测与恢复：
      1. 检测到 malformed/corrupt → 备份 → 尝试恢复数据 → 删除 → 重建 schema → 导入恢复数据 → 重试
      2. schema 未初始化 → 重建 → 重试
    """
    global _auth_storage_ready

    # 正常路径：schema 已就绪
    if _auth_storage_ready:
        try:
            return _try_connect(AUTH_DB_PATH)
        except sqlite3.DatabaseError as e:
            error_msg = str(e).lower()
            if "malformed" not in error_msg and "corrupt" not in error_msg:
                logger.error("数据库连接失败 (path=%s): %s", str(AUTH_DB_PATH), str(e))
                raise
            # 损坏：进入恢复流程（不 return，继续往下走）
            logger.error("数据库损坏检测 (path=%s): %s，启动自动恢复...", str(AUTH_DB_PATH), str(e))
            _auth_storage_ready = False
        except Exception as e:
            logger.error("数据库连接失败 (path=%s): %s", str(AUTH_DB_PATH), str(e))
            raise

    # 恢复路径：_auth_storage_ready == False（首次启动或损坏恢复后）
    # 检测并修复损坏文件（_attempt_db_recovery 内部有锁保护，防止并发恢复）
    if _db_file_is_corrupted(AUTH_DB_PATH):
        _attempt_db_recovery(AUTH_DB_PATH)

    # 重建 schema（CREATE TABLE IF NOT EXISTS 天然幂等）
    try:
        _ensure_schema()
    except Exception as e:
        logger.error("数据库 schema 重建失败: %s", str(e), exc_info=True)
        raise

    # 导入恢复的数据（如果有）
    global _pending_recovery_data
    if _pending_recovery_data:
        logger.info("开始导入恢复的数据...")
        conn = None
        try:
            conn = _try_connect(AUTH_DB_PATH)
            import_stats = _import_recovered_data(conn, _pending_recovery_data)

            # 统计恢复结果
            total_imported = sum(
                stats.get('imported', 0)
                for stats in import_stats.values()
                if isinstance(stats, dict)
            )
            total_failed = sum(
                stats.get('failed', 0)
                for stats in import_stats.values()
                if isinstance(stats, dict)
            )

            if total_imported > 0:
                logger.info("数据恢复成功: 共导入 %d 行数据，失败 %d 行", total_imported, total_failed)
            else:
                logger.warning("数据恢复完成，但没有成功导入任何数据")

        except Exception as import_err:
            logger.error("导入恢复数据失败: %s", str(import_err), exc_info=True)
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

        # 清除暂存数据
        _pending_recovery_data = None

    # 重试连接
    try:
        return _try_connect(AUTH_DB_PATH)
    except sqlite3.DatabaseError as e:
        logger.error("恢复后仍无法连接数据库 (path=%s): %s", str(AUTH_DB_PATH), str(e))
        raise


def get_auth_db_connection() -> sqlite3.Connection:
    """暴露给其它模块的数据库连接工厂（同一份 auth 数据库）。"""
    return _db_connection()


def _safe_execute(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> bool:
    """安全执行 SQL，捕获异常，记录错误但不中断流程。"""
    try:
        if params:
            conn.execute(sql, params)
        else:
            conn.execute(sql)
        return True
    except Exception as e:
        logger.warning("SQL 执行警告：%s | SQL: %s", str(e)[:200], sql[:100])
        return False


# ─── 时间工具 ───
def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _parse_iso(text: str) -> datetime:
    parsed = datetime.fromisoformat(str(text))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _utc_date_str() -> str:
    return _utc_now().date().isoformat()


def _safe_parse_iso(text: str) -> Optional[datetime]:
    if not text:
        return None
    try:
        return _parse_iso(text)
    except Exception:
        return None