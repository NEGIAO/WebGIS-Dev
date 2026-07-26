"""
L2 运行时配置覆盖：管理员面板写入 system_config（DB），此处提供统一读取。

读取优先级（仅限非绝密项）：
    L2 DB（Admin 写入） > L1 env（根 .env / catalog 默认） > 显式 default

安全约束：
    绝密（catalog secret=True）禁止 DB 明文覆盖 —— get_effective_str 对
    secret key 直接抛 ValueError，防止误用把 L3 降级进 DB。

注：Agent 模块因需要 key 池等复杂逻辑自带 DB 解析（agent_chat/db.py），
    属于 L2 合法实现；本模块服务于其余简单 key 的逐步收敛。
"""

from __future__ import annotations

import logging

from .catalog import get_meta
from .load import get_str

logger = logging.getLogger(__name__)


def get_system_config_value(key: str, default: str = "") -> str:
    """读取 system_config 表的 L2 值；DB 不可用时安静回退 default。"""
    try:
        from api.auth.system_config import _get_system_config_value_sync
    except Exception:  # pragma: no cover - 极早期导入或独立脚本场景
        return default
    try:
        return _get_system_config_value_sync(key, default)
    except Exception as exc:
        logger.warning("读取 system_config[%s] 失败：%s", key, exc)
        return default


def get_effective_str(env_key: str, db_key: str = "", default: str = "") -> str:
    """
    L2 优先的有效值：DB（db_key，缺省用 env_key 小写） > env（env_key） > default。

    仅允许非绝密项；secret key 抛 ValueError。
    """
    meta = get_meta(env_key)
    if meta is not None and meta.get("secret"):
        raise ValueError(f"绝密配置 {env_key} 禁止走 L2/DB 覆盖，只能读环境变量")
    resolved_db_key = str(db_key or env_key.lower())
    db_value = str(get_system_config_value(resolved_db_key, "") or "").strip()
    if db_value:
        return db_value
    return get_str(env_key, default)
