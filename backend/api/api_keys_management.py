"""
API 密钥管理模块 - 仅管理员可访问

功能：
1. 获取/设置高德地图 API Key
2. 获取/设置 Agent 会话 API Token
3. 其他第三方 API 密钥配置
"""

import asyncio
import logging
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from api.auth import get_auth_db_connection, normalize_role, require_admin, ROLE_ADMIN

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/api-keys", tags=["API Keys Management"])


class ApiKeyConfig(BaseModel):
    key_name: str = Field(..., description="密钥名称: amap_key, agent_token")
    key_value: str = Field(..., min_length=1, max_length=5000, description="密钥值")


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
    
    result = {}
    for row in rows:
        data = dict(row)
        result[str(data.get("key_name") or "")] = {
            "is_set": bool(data.get("is_set", False)),
            "updated_at": str(data.get("updated_at") or "")
        }
    
    return result


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
    
    # 允许的密钥名称
    allowed_keys = {"amap_key", "agent_token", "tianditu_tk"}
    
    if key_name not in allowed_keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的密钥类型: {key_name}。允许的类型: {', '.join(allowed_keys)}"
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


async def get_api_key(key_name: str) -> Optional[str]:
    """获取 API 密钥（供外部模块使用）"""
    return await asyncio.to_thread(_get_api_key_sync, key_name)
