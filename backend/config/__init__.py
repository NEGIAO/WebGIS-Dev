"""
后端统一配置入口。

双 env 文件架构（与前端统一，按环境二选一）：
  .env       → 部署环境（APP_ENV=production 时读取）
  .env.local → 本地开发（APP_ENV=production 以外时读取）

业务模块应优先：
    from config import get_settings, get_str, get_int, get_float, get_bool

分层：
    L1 低密常量 — .env / 代码默认（load.py）
    L2 运营配置 — Admin + DB（runtime.py；业务也可直读 system_config）
    L3 绝密     — HF Secrets / 本地未提交 env，仅 os.environ

约束：除本包外，业务代码不得直接使用 os.getenv / os.environ 读配置；
新增 key 必须同时登记 根 .env.example 与 catalog.py。
"""

from .catalog import CONFIG_CATALOG, get_meta
from .load import (
    BackendSettings,
    get_bool,
    get_float,
    get_int,
    get_settings,
    get_str,
    is_development_env,
    l3_status_flags,
    load_project_env,
    masked_summary,
    reload_settings,
)
from .public import build_public_config
from .runtime import get_effective_str, get_system_config_value

# 启动时加载当前布局对应的 env 文件（不覆盖已有系统环境变量）
load_project_env()


class _SettingsProxy:
    """惰性 settings 代理：始终反映最新 get_settings() 快照。"""

    def __getattr__(self, item):
        return getattr(get_settings(), item)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<SettingsProxy {get_settings()!r}>"


settings = _SettingsProxy()

# 兼容旧引用名
load_dotenv_files = load_project_env

__all__ = [
    "BackendSettings",
    "CONFIG_CATALOG",
    "build_public_config",
    "get_bool",
    "get_effective_str",
    "get_float",
    "get_int",
    "get_meta",
    "get_settings",
    "get_str",
    "get_system_config_value",
    "is_development_env",
    "l3_status_flags",
    "load_dotenv_files",
    "load_project_env",
    "masked_summary",
    "reload_settings",
    "settings",
]
