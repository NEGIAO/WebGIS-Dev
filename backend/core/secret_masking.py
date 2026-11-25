"""
敏感值掩码工具（V3.7.6 引入；V3.7.11 起管理员 API 不再调用，保留供未来非管理面使用）。

背景（bugfix-optimization-plan P1-4 [P2] 项）：管理员 GET /api/admin/api-keys/{name}
曾回显密钥明文、/api/admin/db/table/{t}/rows 曾裸 dump token / password_hash /
key_value。本模块提供统一的掩码与敏感列判定，供两个管理路由面共用：

- `mask_secret`：前 keep 位 + **** + 后 keep 位（短值整体打码）；
- `is_sensitive_column`：按列名判定（精确集合 + 关键词子串，大小写不敏感）；
- `mask_sensitive_row`：对单行 dict 的敏感列值就地掩码（返回副本）；
- `assert_no_masked_writeback`：阻止掩码占位值经 update/insert 写回数据库
  （前端若把掩码读值误当明文回存，会静默污染密钥/会话数据，必须 fail-closed）。
"""

import re
from typing import Any, Dict

MASK = "****"

# 精确命中的敏感列名（小写）
_EXACT_SENSITIVE_COLUMNS = frozenset({
    "token",
    "password",
    "password_hash",
    "hashed_password",
    "key_value",
    "secret",
    "guest_token",
    "temporary_credential",
    "session_token",
    "access_token",
    "refresh_token",
})

# 子串命中的关键词（列名包含即视为敏感，如 oauth_accounts.access_token、
# 未来新增 *_secret / *_credential 列自动纳管）
_SENSITIVE_SUBSTRINGS = ("token", "password", "secret", "credential", "key_value")

# 掩码占位特征：任意位置出现 4 连星即视为掩码值
_MASK_PATTERN = re.compile(r"\*{4}")

# 掩码值写回的统一错误提示
MASKED_WRITEBACK_DETAIL = "检测到掩码占位值（****）试图写回敏感列，请提交真实明文"


def is_sensitive_column(column_name: Any) -> bool:
    """按列名判定是否敏感（大小写不敏感）。空名不敏感。"""
    name = str(column_name or "").strip().lower()
    if not name:
        return False
    if name in _EXACT_SENSITIVE_COLUMNS:
        return True
    return any(keyword in name for keyword in _SENSITIVE_SUBSTRINGS)


def mask_secret(value: Any, keep: int = 4) -> str:
    """掩码单个敏感值：前 keep 位 + **** + 后 keep 位；短值/空值整体打码。

    - 空值返回空串（保持「未配置」语义，不产生 '****' 误导）；
    - 长度 <= keep*2 的值直接整体打码（避免掩码本身泄露大部分内容）。
    """
    text = "" if value is None else str(value)
    if not text:
        return ""
    keep = max(0, int(keep))
    if len(text) <= keep * 2:
        return MASK
    return text[:keep] + MASK + text[-keep:]


def mask_sensitive_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """返回行副本，其中敏感列的值被掩码。非敏感列与行结构保持原样。"""
    masked: Dict[str, Any] = dict(row)
    for key, value in row.items():
        if value is None:
            continue
        if is_sensitive_column(key):
            masked[key] = mask_secret(value)
    return masked


def has_masked_placeholder(value: Any) -> bool:
    """判断值是否为掩码占位形态（含 4 连星）。"""
    return bool(_MASK_PATTERN.search(str(value or "")))


def assert_no_masked_writeback(values: Dict[str, Any]) -> None:
    """阻止掩码占位值写回敏感列——命中即抛 ValueError（调用方转 400）。

    场景：管理 UI 若把「掩码读值」误当明文回存（编辑表单预填后直接保存），
    会把真实密钥/会话令牌覆盖为 'sk-ab****xy'，属静默数据污染，必须拒绝。
    """
    offending = [
        str(key)
        for key, value in (values or {}).items()
        if is_sensitive_column(key) and has_masked_placeholder(value)
    ]
    if offending:
        raise ValueError(f"{MASKED_WRITEBACK_DETAIL}: {', '.join(offending)}")
