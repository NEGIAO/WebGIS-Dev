"""Compass preset configuration API backed by SQLite storage."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException

from api.auth import get_auth_db_connection

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/compass", tags=["Compass"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _clone(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False))


BASE_LAYER_DATA = [
    {
        "name": "八数",
        "startAngle": 60,
        "fontSize": 18,
        "textColor": "white",
        "vertical": False,
        "togetherStyle": "empty",
        "data": ["一", "二", "三", "四", "五", "六", "七", "八"],
    },
    {
        "name": ["后先天八卦", "先天八卦", "龙上八煞"],
        "startAngle": 66,
        "fontSize": 18,
        "textColor": ["white", "red", "white"],
        "vertical": False,
        "togetherStyle": "equally",
        "data": [
            ["坎", "☰", "辰"],
            ["艮", "☲", "寅"],
            ["震", "☱", "申"],
            ["巽", "☴", "酉"],
            ["离", "☵", "亥"],
            ["坤", "☶", "卯"],
            ["兑", "☳", "巳"],
            ["乾", "☷", "午"],
        ],
    },
    {
        "name": "九星",
        "startAngle": 0,
        "textColor": "white",
        "data": ["贪", "巨", "禄", "文", "武", "廉", "破", "辅", "弼"],
    },
    {
        "name": "二十四山",
        "startAngle": 0,
        "textColor": "white",
        "data": [
            "子",
            "癸",
            "丑",
            "艮",
            "寅",
            "甲",
            "卯",
            "乙",
            "辰",
            "巽",
            "巳",
            "丙",
            "午",
            "丁",
            "未",
            "坤",
            "申",
            "庚",
            "酉",
            "辛",
            "戌",
            "乾",
            "亥",
            "壬",
        ],
    },
    {
        "name": "微盘二十四星",
        "startAngle": 0,
        "textColor": "white",
        "data": [
            "天辅",
            "天垒",
            "天汉",
            "天厨",
            "天市",
            "天桔",
            "天苑",
            "天衡",
            "天官",
            "天罡",
            "太乙",
            "天屏",
            "太微",
            "天马",
            "南极",
            "天常",
            "天钺",
            "天关",
            "天潢",
            "少微",
            "天乙",
            "天魁",
            "天厩",
            "天皇",
        ],
    },
    {
        "name": "透地六十龙",
        "startAngle": 0,
        "textColor": "white",
        "vertical": True,
        "data": [
            "甲子",
            "丙子",
            "戊子",
            "庚子",
            "壬子",
            "乙丑",
            "丁丑",
            "己丑",
            "辛丑",
            "癸丑",
            "甲寅",
            "丙寅",
            "戊寅",
            "庚寅",
            "壬寅",
            "乙卯",
            "丁卯",
            "己卯",
            "辛卯",
            "癸卯",
            "甲辰",
            "丙辰",
            "戊辰",
            "庚辰",
            "壬辰",
            "乙巳",
            "丁巳",
            "己巳",
            "辛巳",
            "癸巳",
            "甲午",
            "丙午",
            "戊午",
            "庚午",
            "壬午",
            "乙未",
            "丁未",
            "己未",
            "辛未",
            "癸未",
            "甲申",
            "丙申",
            "戊申",
            "庚申",
            "壬申",
            "乙酉",
            "丁酉",
            "己酉",
            "辛酉",
            "癸酉",
            "甲戌",
            "丙戌",
            "戊戌",
            "庚戌",
            "壬戌",
            "乙亥",
            "丁亥",
            "己亥",
            "辛亥",
            "癸亥",
        ],
    },
    {
        "name": "透地六十龙旺相",
        "startAngle": 0,
        "textColor": "white",
        "vertical": False,
        "data": [
            "三",
            "八",
            "二",
            "一",
            "四",
            "三",
            "六",
            "一",
            "三",
            "九",
            "八",
            "三",
            "三",
            "七",
            "三",
            "四",
            "五",
            "一",
            "三",
            "五",
            "四",
            "七",
            "二",
            "八",
            "四",
            "六",
            "一",
            "七",
            "三",
            "六",
            "五",
            "九",
            "二",
            "四",
            "一",
            "五",
            "三",
            "五",
            "三",
            "三",
            "三",
            "八",
            "五",
            "七",
            "一",
            "八",
            "三",
            "七",
            "七",
            "九",
            "八",
            "五",
            "二",
            "九",
            "五",
            "七",
            "九",
            "四",
            "九",
            "五",
        ],
    },
]

THEME_META = [
    {
        "cid": "ancient-cinnabar",
        "name": "Ancient Cinnabar",
        "description": "Classical red-and-cyan geomantic style.",
        "line": {"borderColor": "#E94B3C", "scaleColor": "#1FD6D6", "scaleHighlightColor": "#FF3B30"},
        "crossColor": "#FF2D2D",
        "latticeFill": [[0, 3, "#8A6A1A"]],
    },
    {
        "cid": "dark-gold",
        "name": "Dark Gold",
        "description": "High-contrast dark canvas with golden accents.",
        "line": {"borderColor": "#D4AF37", "scaleColor": "#B9A67A", "scaleHighlightColor": "#FFD700"},
        "crossColor": "#FFCC00",
        "latticeFill": [[0, 3, "#4A3B12"]],
    },
    {
        "cid": "jade-realm",
        "name": "Jade Realm",
        "description": "Jade-green palette with bright scale ticks.",
        "line": {"borderColor": "#20C997", "scaleColor": "#6EE7B7", "scaleHighlightColor": "#A7F3D0"},
        "crossColor": "#16A34A",
        "latticeFill": [[0, 3, "#2A9D8F"]],
    },
    {
        "cid": "minimalist",
        "name": "Minimalist",
        "description": "Calm monochrome style for clean reading.",
        "line": {"borderColor": "#D1D5DB", "scaleColor": "#9CA3AF", "scaleHighlightColor": "#F3F4F6"},
        "crossColor": "#F87171",
        "latticeFill": [],
    },
    {
        "cid": "cyber-blueprint",
        "name": "Cyber Blueprint",
        "description": "Neon blueprint style with electric cyan stroke.",
        "line": {"borderColor": "#22D3EE", "scaleColor": "#67E8F9", "scaleHighlightColor": "#38BDF8"},
        "crossColor": "#00E5FF",
        "latticeFill": [[0, 3, "#1F2937"]],
    },
]


def _build_theme_config(theme_meta: dict[str, Any]) -> dict[str, Any]:
    data = _clone(BASE_LAYER_DATA)

    # Apply per-theme default text color to preserve readability against dark basemaps.
    default_text_color = "#F8FAFC"
    for layer in data:
        text_color = layer.get("textColor")
        if isinstance(text_color, list):
            layer["textColor"] = [default_text_color if str(item).lower() == "white" else item for item in text_color]
        elif str(text_color).lower() == "white":
            layer["textColor"] = default_text_color

    return {
        "info": {
            "id": theme_meta["cid"],
            "name": theme_meta["name"],
            "preview": "",
        },
        "compassSize": {"width": 800, "height": 800},
        "data": data,
        "line": _clone(theme_meta["line"]),
        "rotate": 0,
        "latticeFill": _clone(theme_meta["latticeFill"]),
        "isShowTianxinCross": True,
        "isShowScale": True,
        "scaclStyle": {
            "minLineHeight": 10,
            "midLineHeight": 20,
            "maxLineHeight": 25,
            "numberFontSize": 13,
        },
        "autoFontSize": False,
        "animation": {
            "enable": False,
            "duration": 400,
            "delay": 60,
        },
        "tianxinCrossWidth": 2,
        "tianxinCrossColor": theme_meta["crossColor"],
        "tianxinCrossLengthRatio": 1 / 3,
    }


def _init_compass_storage_sync() -> None:
    now_iso = _now_iso()

    with get_auth_db_connection() as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS compass_configs (
                cid TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                config_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )

        for item in THEME_META:
            config_json = json.dumps(_build_theme_config(item), ensure_ascii=False)
            conn.execute(
                """
                INSERT INTO compass_configs (cid, name, description, config_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(cid) DO UPDATE SET
                    name = excluded.name,
                    description = excluded.description,
                    config_json = excluded.config_json,
                    updated_at = excluded.updated_at
                """,
                (
                    str(item["cid"]),
                    str(item["name"]),
                    str(item.get("description", "")),
                    config_json,
                    now_iso,
                    now_iso,
                ),
            )

        conn.commit()


async def init_compass_config_storage() -> None:
    """Initialize compass preset storage and seed 5 default cid records."""
    try:
        await asyncio.to_thread(_init_compass_storage_sync)
        logger.info("Compass preset storage initialized")
    except Exception as exc:
        logger.warning("Compass preset init failed: %s", str(exc)[:300])


@router.get("/configs")
async def list_compass_configs() -> dict[str, Any]:
    with get_auth_db_connection() as conn:
        rows = conn.execute(
            "SELECT cid, name, description, updated_at FROM compass_configs ORDER BY cid ASC"
        ).fetchall()

    return {
        "items": [
            {
                "cid": str(row["cid"]),
                "name": str(row["name"]),
                "description": str(row["description"] or ""),
                "updated_at": str(row["updated_at"] or ""),
            }
            for row in rows
        ]
    }


@router.get("/config/{cid}")
async def get_compass_config(cid: str) -> dict[str, Any]:
    safe_cid = str(cid or "").strip()
    if not safe_cid:
        raise HTTPException(status_code=400, detail="cid is required")

    with get_auth_db_connection() as conn:
        row = conn.execute(
            "SELECT cid, name, description, config_json, updated_at FROM compass_configs WHERE cid = ?",
            (safe_cid,),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Compass config not found: {safe_cid}")

    try:
        config_payload = json.loads(str(row["config_json"] or "{}"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Malformed compass config for {safe_cid}") from exc

    return {
        "cid": str(row["cid"]),
        "name": str(row["name"]),
        "description": str(row["description"] or ""),
        "updated_at": str(row["updated_at"] or ""),
        "config": config_payload,
    }
