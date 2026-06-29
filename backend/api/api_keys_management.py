"""
API 密钥管理模块 - 仅管理员可访问

功能：
1. 获取/设置高德地图 API Key
2. 获取/设置 Agent 会话 API Token
3. 其他第三方 API 密钥配置
"""

import asyncio
import logging
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from api.auth import get_auth_db_connection, require_admin, require_api_access_or_guest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/api-keys", tags=["API Keys Management"])
runtime_config_router = APIRouter(prefix="/api/runtime-config", tags=["Runtime Config"])

ALLOWED_API_KEYS = {
    "amap_key",
    "agent_api_key",
    "agent_token",
    "tianditu_tk",
    "cesium_ion_token",
}

FRONTEND_RUNTIME_KEYS = ("tianditu_tk", "cesium_ion_token")
RUNTIME_CONFIG_ALLOWED_ORIGINS_ENV = "RUNTIME_CONFIG_ALLOWED_ORIGINS"


class ApiKeyConfig(BaseModel):
    key_name: str = Field(..., description="密钥名称: amap_key, agent_api_key, agent_token, tianditu_tk, cesium_ion_token")
    key_value: str = Field(..., min_length=1, max_length=5000, description="密钥值")


class ApiKeyBackupsConfig(BaseModel):
    backup_values: List[str] = Field(default_factory=list, description="备用密钥列表，按顺序依次兜底")


class ApiKeyBackupConfig(BaseModel):
    key_value: str = Field(..., min_length=1, max_length=5000, description="备用密钥值")


class ApiKeyResponse(BaseModel):
    key_name: str
    key_value: str
    is_set: bool
    updated_at: Optional[str]


def _db_connection() -> sqlite3.Connection:
    return get_auth_db_connection()


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_api_keys_table_sync() -> None:
    """确保 API 密钥表存在"""
    with _db_connection() as conn:
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
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS api_key_backups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_name TEXT NOT NULL,
                key_value TEXT NOT NULL,
                priority INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL,
                updated_by TEXT,
                UNIQUE(key_name, priority)
            )
            """
        )
        conn.commit()


def _get_api_key_sync(key_name: str) -> Optional[str]:
    """获取 API 密钥值"""
    _ensure_api_keys_table_sync()
    
    with _db_connection() as conn:
        row = conn.execute(
            "SELECT key_value FROM api_keys WHERE key_name = ?",
            (key_name,)
        ).fetchone()
    
    if row:
        return str(dict(row).get("key_value") or "")
    return None


def _get_api_keys_sync(key_names: tuple[str, ...]) -> Dict[str, str]:
    """批量获取 API 密钥值。"""
    _ensure_api_keys_table_sync()

    if not key_names:
        return {}

    placeholders = ",".join("?" for _ in key_names)
    with _db_connection() as conn:
        rows = conn.execute(
            f"SELECT key_name, key_value FROM api_keys WHERE key_name IN ({placeholders})",
            tuple(key_names),
        ).fetchall()

    result: Dict[str, str] = {}
    for row in rows:
        data = dict(row)
        result[str(data.get("key_name") or "")] = str(data.get("key_value") or "")
    return result


def _normalize_key_values(values: List[str]) -> List[str]:
    """清洗密钥列表，去空、去重并保留管理员配置顺序。"""
    normalized: List[str] = []
    seen: set[str] = set()
    for value in values or []:
        compact = str(value or "").strip()
        if not compact or compact in seen:
            continue
        normalized.append(compact)
        seen.add(compact)
    return normalized


def _get_api_key_backups_sync(key_name: str) -> List[Dict[str, Any]]:
    """读取指定密钥的备用 token 元数据和值。"""
    _ensure_api_keys_table_sync()
    safe_key_name = str(key_name or "").strip().lower()
    if not safe_key_name:
        return []

    with _db_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, key_name, key_value, priority, enabled, updated_at, updated_by
            FROM api_key_backups
            WHERE key_name = ?
            ORDER BY priority ASC, id ASC
            """,
            (safe_key_name,),
        ).fetchall()

    backups: List[Dict[str, Any]] = []
    for row in rows:
        data = dict(row)
        value = str(data.get("key_value") or "").strip()
        if not value:
            continue
        backups.append({
            "id": int(data.get("id") or 0),
            "key_name": str(data.get("key_name") or safe_key_name),
            "key_value": value,
            "priority": int(data.get("priority") or 0),
            "enabled": bool(data.get("enabled", True)),
            "updated_at": str(data.get("updated_at") or ""),
            "updated_by": str(data.get("updated_by") or ""),
        })
    return backups


def _get_api_key_candidates_sync(key_name: str) -> List[str]:
    """按主 token、备用 token 顺序返回可用候选值。"""
    safe_key_name = str(key_name or "").strip().lower()
    primary = str(_get_api_key_sync(safe_key_name) or "").strip()
    backups = [
        str(item.get("key_value") or "").strip()
        for item in _get_api_key_backups_sync(safe_key_name)
        if bool(item.get("enabled", True))
    ]
    return _normalize_key_values(([primary] if primary else []) + backups)


def _set_api_key_backups_sync(
    key_name: str,
    backup_values: List[str],
    updated_by: str = "admin",
) -> List[Dict[str, Any]]:
    """替换指定密钥的备用 token 列表。"""
    _ensure_api_keys_table_sync()
    safe_key_name = str(key_name or "").strip().lower()
    if safe_key_name not in ALLOWED_API_KEYS:
        raise ValueError(f"不支持的密钥类型: {safe_key_name}")

    values = _normalize_key_values(backup_values)[:100]
    now = _iso_now()

    with _db_connection() as conn:
        conn.execute("DELETE FROM api_key_backups WHERE key_name = ?", (safe_key_name,))
        for priority, value in enumerate(values):
            conn.execute(
                """
                INSERT INTO api_key_backups (key_name, key_value, priority, enabled, updated_at, updated_by)
                VALUES (?, ?, ?, 1, ?, ?)
                """,
                (safe_key_name, value, priority, now, updated_by),
            )
        conn.commit()

    logger.info("API 备用密钥已更新: %s backups=%s (by %s)", safe_key_name, len(values), updated_by)
    return _get_api_key_backups_sync(safe_key_name)


def _append_api_key_backup_sync(
    key_name: str,
    key_value: str,
    updated_by: str = "admin",
) -> List[Dict[str, Any]]:
    """追加一个备用 token 到当前列表末尾。"""
    _ensure_api_keys_table_sync()
    safe_key_name = str(key_name or "").strip().lower()
    value = str(key_value or "").strip()
    if safe_key_name not in ALLOWED_API_KEYS:
        raise ValueError(f"不支持的密钥类型: {safe_key_name}")
    if not value:
        raise ValueError("备用密钥值不能为空")

    backups = _get_api_key_backups_sync(safe_key_name)
    values = [str(item.get("key_value") or "").strip() for item in backups]
    values.append(value)
    return _set_api_key_backups_sync(safe_key_name, values, updated_by)


def _delete_api_key_backup_sync(key_name: str, backup_id: int) -> bool:
    """删除指定备用 token。"""
    _ensure_api_keys_table_sync()
    safe_key_name = str(key_name or "").strip().lower()
    safe_backup_id = int(backup_id or 0)
    if not safe_key_name or safe_backup_id <= 0:
        return False

    remaining_values: List[str] = []
    deleted = False
    for item in _get_api_key_backups_sync(safe_key_name):
        if int(item.get("id") or 0) == safe_backup_id:
            deleted = True
            continue
        remaining_values.append(str(item.get("key_value") or "").strip())

    if deleted:
        _set_api_key_backups_sync(safe_key_name, remaining_values)

    return deleted


def _backup_public_item(item: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": int(item.get("id") or 0),
        "priority": int(item.get("priority") or 0),
        "enabled": bool(item.get("enabled", True)),
        "is_set": bool(str(item.get("key_value") or "").strip()),
        "updated_at": str(item.get("updated_at") or ""),
        "updated_by": str(item.get("updated_by") or ""),
    }


def _set_api_key_sync(key_name: str, key_value: str, updated_by: str = "admin") -> bool:
    """设置 API 密钥值"""
    _ensure_api_keys_table_sync()
    
    with _db_connection() as conn:
        conn.execute(
            """
            INSERT INTO api_keys (key_name, key_value, updated_at, updated_by)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key_name)
            DO UPDATE SET
                key_value = excluded.key_value,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by
            """,
            (key_name, key_value, _iso_now(), updated_by)
        )
        conn.commit()
    
    logger.info(f"API 密钥已更新: {key_name} (by {updated_by})")
    return True


def _delete_api_key_sync(key_name: str) -> bool:
    """删除 API 密钥"""
    _ensure_api_keys_table_sync()
    
    with _db_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM api_keys WHERE key_name = ?",
            (key_name,)
        )
        conn.execute(
            "DELETE FROM api_key_backups WHERE key_name = ?",
            (key_name,),
        )
        conn.commit()
    
    affected = int(cursor.rowcount or 0)
    if affected > 0:
        logger.info(f"API 密钥已删除: {key_name}")
    return affected > 0


def _list_api_keys_sync() -> Dict[str, Any]:
    """列出所有 API 密钥（不显示值）"""
    _ensure_api_keys_table_sync()
    
    with _db_connection() as conn:
        rows = conn.execute(
            """
            SELECT key_name, 
                   CASE WHEN length(key_value) > 0 THEN 1 ELSE 0 END as is_set,
                   updated_at
            FROM api_keys
            ORDER BY key_name ASC
            """
        ).fetchall()
    
    result: Dict[str, Any] = {}
    for row in rows:
        data = dict(row)
        key_name = str(data.get("key_name") or "")
        backups = _get_api_key_backups_sync(key_name)
        public_backups = [_backup_public_item(item) for item in backups]
        result[key_name] = {
            "is_set": bool(data.get("is_set", False)),
            "updated_at": str(data.get("updated_at") or ""),
            "backup_count": len(public_backups),
            "backups": public_backups,
        }

    for key_name in sorted(ALLOWED_API_KEYS):
        if key_name in result:
            continue
        backups = _get_api_key_backups_sync(key_name)
        public_backups = [_backup_public_item(item) for item in backups]
        result[key_name] = {
            "is_set": False,
            "updated_at": "",
            "backup_count": len(public_backups),
            "backups": public_backups,
        }
    
    return result


def _normalize_origin(value: str) -> str:
    compact = str(value or "").strip().rstrip("/")
    if not compact:
        return ""

    parsed = urlparse(compact)
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")

    return compact


def _allowed_runtime_config_origins() -> set[str]:
    raw = str(os.getenv(RUNTIME_CONFIG_ALLOWED_ORIGINS_ENV, "") or "")
    return {
        normalized
        for normalized in (_normalize_origin(item) for item in raw.split(","))
        if normalized
    }


def _assert_runtime_config_origin_allowed(request: Request) -> None:
    allowed_origins = _allowed_runtime_config_origins()
    if not allowed_origins:
        return

    origin = _normalize_origin(request.headers.get("Origin", ""))
    referer = _normalize_origin(request.headers.get("Referer", ""))
    request_origin = origin or referer

    if request_origin in allowed_origins:
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="当前来源不允许读取前端运行时地图配置",
    )


# ==================== 管理员 API 端点 ====================


@router.get("/status")
async def get_api_keys_status(
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """获取所有 API 密钥配置状态（不返回密钥值）"""
    keys_info = await asyncio.to_thread(_list_api_keys_sync)
    
    return {
        "status": "success",
        "data": keys_info,
        "note": "此端点不返回密钥值，仅显示配置状态"
    }


@router.post("/set")
async def set_api_key(
    payload: ApiKeyConfig,
    session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """设置 API 密钥（仅管理员）"""
    key_name = str(payload.key_name or "").strip().lower()
    key_value = str(payload.key_value or "").strip()
    
    if key_name not in ALLOWED_API_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的密钥类型: {key_name}。允许的类型: {', '.join(sorted(ALLOWED_API_KEYS))}"
        )
    
    if not key_value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密钥值不能为空"
        )
    
    username = str(session.get("username") or "admin")
    await asyncio.to_thread(_set_api_key_sync, key_name, key_value, username)
    
    return {
        "status": "success",
        "message": f"密钥 {key_name} 已更新",
        "data": {
            "key_name": key_name,
            "is_set": True,
            "updated_at": _iso_now(),
            "updated_by": username
        }
    }


@router.delete("/{key_name}")
async def delete_api_key(
    key_name: str,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """删除 API 密钥（谨慎操作）"""
    safe_key_name = str(key_name or "").strip().lower()
    
    if not safe_key_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密钥名称不能为空"
        )

    if safe_key_name not in ALLOWED_API_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的密钥类型: {safe_key_name}",
        )
    
    deleted = await asyncio.to_thread(_delete_api_key_sync, safe_key_name)
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"密钥不存在: {safe_key_name}"
        )
    
    return {
        "status": "success",
        "message": f"密钥 {safe_key_name} 已删除"
    }


@router.get("/{key_name}/backups")
async def list_api_key_backups(
    key_name: str,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """列出指定 API 密钥的备用 token 元数据（不返回明文值）。"""
    safe_key_name = str(key_name or "").strip().lower()
    if safe_key_name not in ALLOWED_API_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的密钥类型: {safe_key_name}",
        )

    backups = await asyncio.to_thread(_get_api_key_backups_sync, safe_key_name)
    public_backups = [_backup_public_item(item) for item in backups]
    return {
        "status": "success",
        "data": {
            "key_name": safe_key_name,
            "backup_count": len(public_backups),
            "backups": public_backups,
        },
    }


@router.put("/{key_name}/backups")
async def replace_api_key_backups(
    key_name: str,
    payload: ApiKeyBackupsConfig,
    session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """替换指定 API 密钥的备用 token 列表。"""
    safe_key_name = str(key_name or "").strip().lower()
    if safe_key_name not in ALLOWED_API_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的密钥类型: {safe_key_name}",
        )

    username = str(session.get("username") or "admin")
    backups = await asyncio.to_thread(
        _set_api_key_backups_sync,
        safe_key_name,
        payload.backup_values,
        username,
    )
    public_backups = [_backup_public_item(item) for item in backups]
    return {
        "status": "success",
        "message": f"密钥 {safe_key_name} 的备用 token 已更新",
        "data": {
            "key_name": safe_key_name,
            "backup_count": len(public_backups),
            "backups": public_backups,
        },
    }


@router.post("/{key_name}/backups")
async def append_api_key_backup(
    key_name: str,
    payload: ApiKeyBackupConfig,
    session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """为指定 API 密钥追加一个备用 token。"""
    safe_key_name = str(key_name or "").strip().lower()
    if safe_key_name not in ALLOWED_API_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的密钥类型: {safe_key_name}",
        )

    username = str(session.get("username") or "admin")
    try:
        backups = await asyncio.to_thread(
            _append_api_key_backup_sync,
            safe_key_name,
            payload.key_value,
            username,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    public_backups = [_backup_public_item(item) for item in backups]
    return {
        "status": "success",
        "message": f"密钥 {safe_key_name} 的备用 token 已新增",
        "data": {
            "key_name": safe_key_name,
            "backup_count": len(public_backups),
            "backups": public_backups,
        },
    }


@router.delete("/{key_name}/backups/{backup_id}")
async def delete_api_key_backup(
    key_name: str,
    backup_id: int,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """删除指定 API 密钥的一个备用 token。"""
    safe_key_name = str(key_name or "").strip().lower()
    if safe_key_name not in ALLOWED_API_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的密钥类型: {safe_key_name}",
        )

    deleted = await asyncio.to_thread(_delete_api_key_backup_sync, safe_key_name, int(backup_id))
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"备用 token 不存在: {backup_id}",
        )

    backups = await asyncio.to_thread(_get_api_key_backups_sync, safe_key_name)
    public_backups = [_backup_public_item(item) for item in backups]
    return {
        "status": "success",
        "message": f"备用 token {backup_id} 已删除",
        "data": {
            "key_name": safe_key_name,
            "backup_count": len(public_backups),
            "backups": public_backups,
        },
    }


@router.get("/{key_name}")
async def get_api_key(
    key_name: str,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """获取指定 API 密钥（仅管理员，返回完整值）"""
    safe_key_name = str(key_name or "").strip().lower()
    
    if not safe_key_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密钥名称不能为空"
        )

    if safe_key_name not in ALLOWED_API_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的密钥类型: {safe_key_name}",
        )
    
    key_value = await asyncio.to_thread(_get_api_key_sync, safe_key_name)
    
    if key_value is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"密钥不存在: {safe_key_name}"
        )
    
    return {
        "status": "success",
        "data": {
            "key_name": safe_key_name,
            "key_value": key_value,
            "is_set": len(key_value) > 0
        }
    }


# ==================== 导出函数供外部模块调用 ====================


@runtime_config_router.get("/map-tokens")
async def get_runtime_map_tokens(
    request: Request,
    _session: Dict[str, Any] = Depends(require_api_access_or_guest),
) -> Dict[str, Any]:
    """返回前端直连地图服务所需的运行时 token。"""
    _assert_runtime_config_origin_allowed(request)
    token_map = await asyncio.to_thread(_get_api_keys_sync, FRONTEND_RUNTIME_KEYS)
    token_pools = {
        key_name: await asyncio.to_thread(_get_api_key_candidates_sync, key_name)
        for key_name in FRONTEND_RUNTIME_KEYS
    }

    return {
        "status": "success",
        "data": {
            "tianditu_tk": token_map.get("tianditu_tk", ""),
            "cesium_ion_token": token_map.get("cesium_ion_token", ""),
            "token_pools": token_pools,
            "is_set": {
                "tianditu_tk": bool(token_pools.get("tianditu_tk")),
                "cesium_ion_token": bool(token_pools.get("cesium_ion_token")),
            },
            "note": "These browser runtime tokens are returned once so the frontend can call Tianditu and Cesium directly.",
        },
    }


@runtime_config_router.get("/defaults")
async def get_runtime_defaults(
    _session: Dict[str, Any] = Depends(require_api_access_or_guest),
) -> Dict[str, Any]:
    """返回管理员配置的全局默认值（当前仅 default_basemap_index）。"""
    from api.auth.system_config import _get_default_basemap_index_sync

    index = await asyncio.to_thread(_get_default_basemap_index_sync)
    return {
        "status": "success",
        "data": {
            "default_basemap_index": index,
        },
    }


async def get_api_key(key_name: str) -> Optional[str]:
    """获取 API 密钥（供外部模块使用）"""
    return await asyncio.to_thread(_get_api_key_sync, key_name)


async def get_api_key_candidates(key_name: str) -> List[str]:
    """获取主 token + 备用 token 候选列表（供外部模块自动兜底使用）。"""
    return await asyncio.to_thread(_get_api_key_candidates_sync, key_name)
