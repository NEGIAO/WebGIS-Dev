"""
管理员专属接口：数据库 CRUD、公告发布、联系方式配置。
"""

import asyncio
import json
import re
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from api.auth import get_auth_db_connection, require_admin
from api.auth.system_config import (
    _get_default_basemap_index_sync,
    _set_default_basemap_index_sync,
    _get_system_config_value_sync,
    _set_system_config_value_sync,
)
from config import get_settings

IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class InsertRowRequest(BaseModel):
    row: Dict[str, Any]


class UpdateRowRequest(BaseModel):
    where: Dict[str, Any]
    values: Dict[str, Any]


class DeleteRowRequest(BaseModel):
    where: Dict[str, Any]


class PublishAnnouncementRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


class UpdateContactRequest(BaseModel):
    contact: str = Field(..., min_length=1, max_length=500)


class UpdateDefaultBasemapIndexRequest(BaseModel):
    """管理员设置全局默认底图索引"""
    index: int = Field(..., ge=0, le=99)


class UpdateDownloadTtlRequest(BaseModel):
    """管理员设置下载任务 TTL（分钟）"""
    ttl_minutes: int = Field(..., ge=1, le=1440)


def _db_connection() -> sqlite3.Connection:
    return get_auth_db_connection()


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_identifier(name: str) -> str:
    raw = str(name or "").strip()
    if not IDENTIFIER_PATTERN.fullmatch(raw):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"非法标识符: {name}",
        )
    return raw


def _quote_identifier(name: str) -> str:
    safe = _validate_identifier(name)
    return f'"{safe}"'


def _normalize_sql_value(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return value


def _list_tables_sync() -> List[Dict[str, Any]]:
    with _db_connection() as conn:
        table_rows = conn.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name ASC
            """
        ).fetchall()

        result: List[Dict[str, Any]] = []
        for table_row in table_rows:
            table_name = str(dict(table_row).get("name") or "")
            if not table_name:
                continue

            columns = conn.execute(f"PRAGMA table_info({_quote_identifier(table_name)})").fetchall()
            result.append(
                {
                    "name": table_name,
                    "columns": [
                        {
                            "name": str(dict(col).get("name") or ""),
                            "type": str(dict(col).get("type") or ""),
                            "notnull": int(dict(col).get("notnull") or 0),
                            "pk": int(dict(col).get("pk") or 0),
                        }
                        for col in columns
                    ],
                }
            )

    return result


def _list_table_rows_sync(table_name: str, limit: int, offset: int) -> List[Dict[str, Any]]:
    safe_table = _quote_identifier(table_name)
    safe_limit = max(1, min(int(limit), 200))
    safe_offset = max(0, int(offset))

    with _db_connection() as conn:
        rows = conn.execute(
            f"SELECT rowid AS __rowid, * FROM {safe_table} ORDER BY rowid DESC LIMIT ? OFFSET ?",
            (safe_limit, safe_offset),
        ).fetchall()

    return [dict(row) for row in rows]


def _build_where_clause(where: Dict[str, Any]) -> Dict[str, Any]:
    if not where:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="where 条件不能为空",
        )

    clauses: List[str] = []
    values: List[Any] = []

    for key, value in where.items():
        if key == "__rowid":
            clauses.append("rowid = ?")
            values.append(int(value))
            continue

        col = _quote_identifier(key)
        clauses.append(f"{col} = ?")
        values.append(_normalize_sql_value(value))

    return {
        "sql": " AND ".join(clauses),
        "values": values,
    }


def _insert_row_sync(table_name: str, row: Dict[str, Any]) -> int:
    if not row:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="插入数据不能为空",
        )

    keys = [_validate_identifier(k) for k in row.keys()]
    cols = ", ".join(_quote_identifier(k) for k in keys)
    holders = ", ".join(["?"] * len(keys))
    values = [_normalize_sql_value(row[k]) for k in keys]

    safe_table = _quote_identifier(table_name)
    sql = f"INSERT INTO {safe_table} ({cols}) VALUES ({holders})"

    with _db_connection() as conn:
        cursor = conn.execute(sql, values)
        conn.commit()
        return int(cursor.lastrowid or 0)


def _update_rows_sync(table_name: str, where: Dict[str, Any], values_payload: Dict[str, Any]) -> int:
    if not values_payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="更新字段不能为空",
        )

    safe_table = _quote_identifier(table_name)
    where_sql = _build_where_clause(where)

    set_parts: List[str] = []
    set_values: List[Any] = []
    for key, value in values_payload.items():
        if key == "__rowid":
            continue
        col = _quote_identifier(key)
        set_parts.append(f"{col} = ?")
        set_values.append(_normalize_sql_value(value))

    if not set_parts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="没有可更新字段",
        )

    sql = f"UPDATE {safe_table} SET {', '.join(set_parts)} WHERE {where_sql['sql']}"

    with _db_connection() as conn:
        cursor = conn.execute(sql, set_values + where_sql["values"])
        conn.commit()
        return int(cursor.rowcount or 0)


def _delete_rows_sync(table_name: str, where: Dict[str, Any]) -> int:
    safe_table = _quote_identifier(table_name)
    where_sql = _build_where_clause(where)

    sql = f"DELETE FROM {safe_table} WHERE {where_sql['sql']}"

    with _db_connection() as conn:
        cursor = conn.execute(sql, where_sql["values"])
        conn.commit()
        return int(cursor.rowcount or 0)


def _publish_announcement_sync(message: str, admin_username: str) -> int:
    now_iso = _iso_now()

    with _db_connection() as conn:
        conn.execute(
            "UPDATE announcements SET is_active = 0, updated_at = ? WHERE is_active = 1",
            (now_iso,),
        )

        cursor = conn.execute(
            """
            INSERT INTO announcements (message, created_by, is_active, created_at, updated_at)
            VALUES (?, ?, 1, ?, ?)
            """,
            (message, admin_username, now_iso, now_iso),
        )
        conn.commit()
        return int(cursor.lastrowid or 0)


def _update_admin_contact_sync(contact: str) -> None:
    now_iso = _iso_now()

    with _db_connection() as conn:
        conn.execute(
            """
            INSERT INTO system_config (key, value, updated_at)
            VALUES ('admin_contact', ?, ?)
            ON CONFLICT(key)
            DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            """,
            (contact, now_iso),
        )
        conn.commit()


def _get_l3_env_status() -> Dict[str, bool]:
    """
    L3 环境密钥「是否已配置」布尔（供 Admin 面板只读展示）。

    安全约束：仅输出布尔，绝不回显明文；L3 只保留平台侧绝密。
    Agent/LLM 主密钥与高德 Web 服务 Key 属 L2 管理员配置，走 API 密钥管理面板。
    """
    s = get_settings()
    return {
        "super_user": bool(s.super_user),
        "oauth_state_secret": bool(s.oauth_state_secret),
        "google_oauth": bool(s.google_oauth_client_id and s.google_oauth_client_secret),
        "github_oauth": bool(s.github_oauth_client_id and s.github_oauth_client_secret),
        "smtp": bool(s.smtp_user and s.smtp_password),
        "supabase": bool(s.supabase_url and s.supabase_key),
    }


def _get_admin_overview_sync() -> Dict[str, Any]:
    with _db_connection() as conn:
        table_count = conn.execute(
            "SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        ).fetchone()

        total_users = conn.execute("SELECT COUNT(*) AS cnt FROM users").fetchone()
        total_sessions = conn.execute("SELECT COUNT(*) AS cnt FROM sessions").fetchone()
        total_messages = conn.execute("SELECT COUNT(*) AS cnt FROM user_messages").fetchone()
        active_announcement = conn.execute(
            "SELECT COUNT(*) AS cnt FROM announcements WHERE is_active = 1"
        ).fetchone()

    return {
        "table_count": int((dict(table_count).get("cnt") if table_count else 0) or 0),
        "total_users": int((dict(total_users).get("cnt") if total_users else 0) or 0),
        "total_sessions": int((dict(total_sessions).get("cnt") if total_sessions else 0) or 0),
        "total_messages": int((dict(total_messages).get("cnt") if total_messages else 0) or 0),
        "active_announcement": int((dict(active_announcement).get("cnt") if active_announcement else 0) or 0),
        "l3_env_status": _get_l3_env_status(),
        "snapshot_at": _iso_now(),
    }


router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/overview")
async def get_admin_overview(
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    data = await asyncio.to_thread(_get_admin_overview_sync)
    return {"status": "success", "data": data}


@router.get("/db/tables")
async def list_tables(
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    tables = await asyncio.to_thread(_list_tables_sync)
    return {
        "status": "success",
        "data": tables,
    }


@router.get("/db/table/{table_name}/rows")
async def list_table_rows(
    table_name: str,
    limit: int = Query(default=30, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    rows = await asyncio.to_thread(_list_table_rows_sync, table_name, limit, offset)
    return {
        "status": "success",
        "data": rows,
    }


@router.post("/db/table/{table_name}/insert")
async def insert_table_row(
    table_name: str,
    payload: InsertRowRequest,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    row_id = await asyncio.to_thread(_insert_row_sync, table_name, payload.row)
    return {
        "status": "success",
        "message": "插入成功",
        "data": {"row_id": row_id},
    }


@router.post("/db/table/{table_name}/update")
async def update_table_rows(
    table_name: str,
    payload: UpdateRowRequest,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    affected = await asyncio.to_thread(
        _update_rows_sync,
        table_name,
        payload.where,
        payload.values,
    )
    return {
        "status": "success",
        "message": "更新完成",
        "data": {"affected": affected},
    }


@router.post("/db/table/{table_name}/delete")
async def delete_table_rows(
    table_name: str,
    payload: DeleteRowRequest,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    affected = await asyncio.to_thread(_delete_rows_sync, table_name, payload.where)
    return {
        "status": "success",
        "message": "删除完成",
        "data": {"affected": affected},
    }


@router.post("/announcement/publish")
async def publish_announcement(
    payload: PublishAnnouncementRequest,
    session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    message_text = str(payload.message or "").strip()
    if not message_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="公告内容不能为空",
        )

    created_id = await asyncio.to_thread(
        _publish_announcement_sync,
        message_text,
        str(session.get("username") or "admin"),
    )

    return {
        "status": "success",
        "message": "公告发布成功",
        "data": {"id": created_id},
    }


@router.post("/config/contact")
async def update_admin_contact(
    payload: UpdateContactRequest,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    contact = str(payload.contact or "").strip()
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="联系方式不能为空",
        )

    await asyncio.to_thread(_update_admin_contact_sync, contact)

    return {
        "status": "success",
        "message": "管理员联系方式已更新",
    }


# ========== 默认底图索引配置 ==========

@router.get("/config/default-basemap-index")
async def get_default_basemap_index(
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """获取管理员配置的全局默认底图索引"""
    index = await asyncio.to_thread(_get_default_basemap_index_sync)
    return {"status": "success", "data": {"index": index}}


@router.post("/config/default-basemap-index")
async def update_default_basemap_index(
    payload: UpdateDefaultBasemapIndexRequest,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """设置全局默认底图索引（对应 BASEMAP_PRESETS 数组下标）"""
    await asyncio.to_thread(_set_default_basemap_index_sync, payload.index)
    return {
        "status": "success",
        "message": f"默认底图索引已更新为 {payload.index}",
    }


# ========== 下载任务 TTL 配置 ==========

@router.get("/config/download-ttl")
async def get_download_ttl(
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """获取下载任务 TTL 配置（分钟）"""
    minutes = await asyncio.to_thread(
        _get_system_config_value_sync, "download_task_ttl_minutes", "30"
    )
    return {"status": "success", "data": {"ttl_minutes": int(minutes)}}


@router.post("/config/download-ttl")
async def update_download_ttl(
    payload: UpdateDownloadTtlRequest,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """更新下载任务 TTL（分钟），修改后立即生效"""
    ttl = int(payload.ttl_minutes)
    await asyncio.to_thread(
        _set_system_config_value_sync, "download_task_ttl_minutes", str(ttl)
    )
    return {"status": "success", "message": f"下载任务 TTL 已设为 {ttl} 分钟"}


# ========== API 配额配置（统一配额池）==========

class UpdateApiQuotaRequest(BaseModel):
    """管理员设置每日 API 配额"""
    guest_daily_quota: int = Field(..., ge=1, le=100000)
    registered_daily_quota: int = Field(..., ge=1, le=100000)


@router.get("/config/api-quota")
async def get_api_quota(
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """获取当前 API 配额配置"""
    guest = await asyncio.to_thread(_get_system_config_value_sync, "api_guest_daily_quota", "100")
    registered = await asyncio.to_thread(_get_system_config_value_sync, "api_registered_daily_quota", "1000")
    return {"status": "success", "data": {"guest_daily_quota": int(guest), "registered_daily_quota": int(registered)}}


@router.post("/config/api-quota")
async def update_api_quota(
    payload: UpdateApiQuotaRequest,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """更新 API 配额配置，修改后立即生效"""
    guest = int(payload.guest_daily_quota)
    registered = int(payload.registered_daily_quota)
    await asyncio.to_thread(_set_system_config_value_sync, "api_guest_daily_quota", str(guest))
    await asyncio.to_thread(_set_system_config_value_sync, "api_registered_daily_quota", str(registered))
    return {"status": "success", "message": f"API 配额已更新（游客 {guest} / 注册用户 {registered}）"}
