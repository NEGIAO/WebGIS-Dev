"""
WebGIS 后端统一配置加载入口。

双 env 文件架构（两个文件都提交 git，L1 不涉密）：
  .env       → 部署环境（生产基线：APP_ENV=production、线上 URL）
  .env.local → 本地开发（覆盖 .env：APP_ENV=development、localhost URL）

加载优先级（低 → 高）：
  .env → .env.local → backend/.env（容器兼容）
  系统进程环境变量（HF Secrets / Docker 注入）始终最高，永不覆盖。

后端 URL 推导（BACKEND_PUBLIC_URL / FRONTEND_PUBLIC_URL 留空时）：
  APP_ENV=production  → https://negiao-webgis.hf.space / https://negiao.github.io/WebGIS-Dev
  APP_ENV=development → http://localhost:7860 / http://localhost:5173

规则：业务代码不得散落 os.getenv；统一从本包读取。
新增配置 key 必须先登记：根 .env.example + catalog.py。
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

from .catalog import (
    BACKEND_URL_DEV,
    BACKEND_URL_PROD,
    DEV_DEFAULT_ADMIN_PASSWORD,
    DEV_OAUTH_STATE_SECRET_FALLBACK,
    FRONTEND_URL_DEV,
    FRONTEND_URL_PROD,
    get_meta,
)

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
ROOT_ENV_FILE = PROJECT_ROOT / ".env"
ROOT_ENV_LOCAL_FILE = PROJECT_ROOT / ".env.local"
BACKEND_ENV_FILE = BACKEND_DIR / ".env"

_DEV_ENVS = {"development", "dev", "local", "test"}
_ENV_KEY_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_TRUTHY = {"1", "true", "yes", "on"}
_FALSY = {"0", "false", "no", "off"}


def _strip_inline_comment(value: str) -> str:
    """去除未被引号包裹的行尾注释。"""
    quote = ""
    escaped = False
    result: list[str] = []
    for char in value:
        if escaped:
            result.append(char)
            escaped = False
            continue
        if char == "\\":
            result.append(char)
            escaped = True
            continue
        if char in {'"', "'"}:
            if not quote:
                quote = char
            elif quote == char:
                quote = ""
            result.append(char)
            continue
        if char == "#" and not quote:
            break
        result.append(char)
    return "".join(result).strip()


def _parse_env_value(raw_value: str) -> str:
    """解析 .env 单行 value，支持基础单双引号。"""
    value = _strip_inline_comment(raw_value)
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        value = value[1:-1]
    return value.replace("\\n", "\n")


def _load_env_file(path: Path, *, system_keys: set | None = None) -> None:
    """
    将 .env 文件加载进 os.environ。

    规则：
    - 系统环境变量（system_keys）永不覆盖（保证 HF Secrets / Docker 注入值最高）。
    - 先加载的文件优先级低，后加载的文件可覆盖先加载文件写入的值。
    """
    if not path.exists() or not path.is_file():
        return
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except OSError as exc:
        logger.warning("配置文件读取失败：%s (%s)", path, exc)
        return

    protected = system_keys if system_keys is not None else set()
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, raw_value = line.split("=", 1)
        key = key.strip()
        if key.startswith("export "):
            key = key[len("export "):].strip()
        if not _ENV_KEY_PATTERN.fullmatch(key):
            continue
        if key in protected:
            continue
        os.environ[key] = _parse_env_value(raw_value)


def load_project_env() -> None:
    """按环境加载项目配置文件。

    双 env 文件架构（.env = 部署环境，.env.local = 本地开发环境）：
    - 部署环境（HF Space / Docker / 生产服务器）：只读根 .env（生产基线值）；
    - 本地开发（开发者机器）：先读根 .env（基线），再读根 .env.local（覆盖为 localhost 等开发值）；
    - .env.local 与 .env 均为 git 追踪（L1 不涉密），本加载器始终按存在性加载；
      部署环境若存在 .env.local 会覆盖 .env 值，需通过部署脚本排除 .env.local
      或 HF Space Variables 显式设置 APP_ENV=production（system_keys 保护优先）；
    - backend/.env（容器兼容）仅在文件存在时加载，优先级最高（仍低于系统进程环境变量）。

    系统进程环境变量（HF Secrets / Docker 注入）始终最高，永不覆盖。
    """
    system_keys = set(os.environ.keys())
    _load_env_file(ROOT_ENV_FILE, system_keys=system_keys)
    # .env.local 与 .env 均为 git 追踪（L1 不涉密），存在即加载；
    # 部署时需通过部署脚本排除 .env.local 或 HF Space Variables 显式覆盖 APP_ENV=production
    if ROOT_ENV_LOCAL_FILE.exists():
        _load_env_file(ROOT_ENV_LOCAL_FILE, system_keys=system_keys)
    _load_env_file(BACKEND_ENV_FILE, system_keys=system_keys)


# 兼容旧引用名
load_dotenv_files = load_project_env


def _catalog_default(name: str):
    meta = get_meta(name)
    if meta is None:
        return None
    return meta.get("default")


# ─── 公开取值 helper（业务模块可直接使用）───

def get_str(name: str, default: Optional[str] = None) -> str:
    """读取字符串配置；default 省略时回退 catalog 登记默认。"""
    value = os.getenv(name)
    if value is not None:
        return str(value).strip()
    if default is not None:
        return default
    catalog_default = _catalog_default(name)
    return str(catalog_default).strip() if catalog_default is not None else ""


def get_int(
    name: str,
    default: Optional[int] = None,
    *,
    minimum: Optional[int] = None,
    maximum: Optional[int] = None,
) -> int:
    """读取整数配置；解析失败回默认，越界按边界钳制。"""
    if default is None:
        catalog_default = _catalog_default(name)
        default = int(catalog_default) if catalog_default not in (None, "") else 0
    raw = get_str(name, "")
    if not raw:
        value = int(default)
    else:
        try:
            value = int(raw)
        except (TypeError, ValueError):
            logger.warning("%s 环境变量值无效：%r，已使用默认值 %s", name, raw, default)
            value = int(default)
    if minimum is not None:
        value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value


def get_float(
    name: str,
    default: Optional[float] = None,
    *,
    minimum: Optional[float] = None,
    maximum: Optional[float] = None,
) -> float:
    """读取浮点配置；解析失败回默认，越界按边界钳制。"""
    if default is None:
        catalog_default = _catalog_default(name)
        default = float(catalog_default) if catalog_default not in (None, "") else 0.0
    raw = get_str(name, "")
    if not raw:
        value = float(default)
    else:
        try:
            value = float(raw)
        except (TypeError, ValueError):
            logger.warning("%s 环境变量值无效：%r，已使用默认值 %s", name, raw, default)
            value = float(default)
    if minimum is not None:
        value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value


def get_bool(name: str, default: Optional[bool] = None) -> bool:
    """读取布尔配置，支持 1/true/yes/on 与 0/false/no/off；default 省略时回退 catalog 登记默认。

    此前签名为 `default: bool = False`，无法区分「调用方显式传 False」与「未传」，
    因而永远不查 catalog 登记的默认值——例如 PROXY_VERIFY_SSL 在 catalog 登记 default=True，
    但环境变量未设时 get_bool 会返回 False（静默 fail-open 关闭 TLS 校验）。
    与 get_int/get_float 对齐：未显式传 default 时回退 catalog 默认。
    """
    raw = get_str(name, "").lower()
    if raw in _TRUTHY:
        return True
    if raw in _FALSY:
        return False
    if default is not None:
        return default
    catalog_default = _catalog_default(name)
    if isinstance(catalog_default, bool):
        return catalog_default
    if isinstance(catalog_default, str):
        return catalog_default.strip().lower() in _TRUTHY
    return bool(catalog_default) if catalog_default is not None else False


def is_development_env() -> bool:
    """判断是否本地开发环境（development/dev/local/test）。"""
    return get_str("APP_ENV", "production").lower() in _DEV_ENVS


def _normalize_base_url(raw_value: str, default: str) -> str:
    value = str(raw_value or "").strip() or default
    return value.rstrip("/")


@dataclass(frozen=True)
class BackendSettings:
    """后端 L1/L3 配置快照。"""

    app_env: str
    log_level: str
    backend_public_url: str
    frontend_public_url: str
    auth_db_path: str
    session_expire_hours: int
    password_hash_iterations: int
    oauth_state_ttl_seconds: int
    oauth_ticket_ttl_seconds: int
    oauth_state_secret: str
    super_user: str
    google_oauth_client_id: str
    google_oauth_client_secret: str
    github_oauth_client_id: str
    github_oauth_client_secret: str
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password: str
    agent_api_key: str
    agent_base_url: str
    agent_model: str
    agent_timeout_seconds: int
    amap_web_service_key: str
    supabase_url: str
    supabase_key: str
    supabase_visits_table: str
    guest_username: str
    guest_password: str

    @property
    def is_development(self) -> bool:
        """是否开发/本地环境。"""
        return self.app_env.strip().lower() in _DEV_ENVS

    def get_admin_password(self) -> str:
        """管理员密码：生产只读 SUPER_USER，本地开发允许 123456 兜底。"""
        if self.super_user:
            return self.super_user
        if self.is_development:
            logger.warning("SUPER_USER 未配置，当前为开发环境，使用 admin/%s 本地兜底。", DEV_DEFAULT_ADMIN_PASSWORD)
            return DEV_DEFAULT_ADMIN_PASSWORD
        logger.error(
            "SUPER_USER 未配置（HF Secrets / L3），非开发环境管理员登录已禁用。"
            "当前 APP_ENV=%s；本地调试请设置 APP_ENV=development（根 .env 或 compose environment，改后需重建容器）。",
            self.app_env,
        )
        return ""

    def get_oauth_state_secret(self) -> str:
        """OAuth state 签名密钥：生产必须显式配置。"""
        if self.oauth_state_secret:
            return self.oauth_state_secret
        if self.is_development:
            return DEV_OAUTH_STATE_SECRET_FALLBACK
        return ""

    def get_oauth_redirect_uri(self, provider: str) -> str:
        """根据 BACKEND_PUBLIC_URL 推导 provider 回调地址，可被兼容变量覆盖。"""
        normalized = str(provider or "").strip().lower()
        override = get_str(f"{normalized.upper()}_OAUTH_REDIRECT_URI", "")
        if override:
            return override
        return f"{self.backend_public_url}/api/auth/oauth/{normalized}/callback"

    def get_oauth_frontend_redirect_url(self, success: bool) -> str:
        """根据 FRONTEND_PUBLIC_URL 推导 OAuth 前端回跳地址，可被兼容变量覆盖。"""
        env_name = "FRONTEND_OAUTH_SUCCESS_URL" if success else "FRONTEND_OAUTH_FAILURE_URL"
        override = get_str(env_name, "")
        if override:
            return override
        path = "#/oauth/callback" if success else "#/register"
        return f"{self.frontend_public_url}/{path}"

    def get_oauth_client_id(self, provider: str) -> str:
        """返回 provider client id。"""
        normalized = str(provider or "").strip().lower()
        if normalized == "google":
            return self.google_oauth_client_id
        if normalized == "github":
            return self.github_oauth_client_id
        return ""

    def get_oauth_client_secret(self, provider: str) -> str:
        """返回 provider client secret。"""
        normalized = str(provider or "").strip().lower()
        if normalized == "google":
            return self.google_oauth_client_secret
        if normalized == "github":
            return self.github_oauth_client_secret
        return ""


def _build_settings() -> BackendSettings:
    load_project_env()
    app_env = get_str("APP_ENV", "production").lower()
    is_dev = app_env in _DEV_ENVS
    default_backend_url = BACKEND_URL_DEV if is_dev else BACKEND_URL_PROD
    default_frontend_url = FRONTEND_URL_DEV if is_dev else FRONTEND_URL_PROD
    return BackendSettings(
        app_env=app_env,
        log_level=get_str("LOG_LEVEL", "INFO"),
        backend_public_url=_normalize_base_url(get_str("BACKEND_PUBLIC_URL", ""), default_backend_url),
        frontend_public_url=_normalize_base_url(get_str("FRONTEND_PUBLIC_URL", ""), default_frontend_url),
        auth_db_path=get_str("AUTH_DB_PATH", ""),
        session_expire_hours=get_int("AUTH_SESSION_EXPIRE_HOURS", 72, minimum=1, maximum=24 * 30),
        password_hash_iterations=get_int("AUTH_PASSWORD_HASH_ITERATIONS", 120000, minimum=60000),
        oauth_state_ttl_seconds=get_int("OAUTH_STATE_TTL_SECONDS", 600, minimum=60, maximum=3600),
        oauth_ticket_ttl_seconds=get_int("OAUTH_TICKET_TTL_SECONDS", 120, minimum=30, maximum=600),
        oauth_state_secret=get_str("OAUTH_STATE_SECRET", ""),
        super_user=get_str("SUPER_USER", ""),
        google_oauth_client_id=get_str("GOOGLE_OAUTH_CLIENT_ID", ""),
        google_oauth_client_secret=get_str("GOOGLE_OAUTH_CLIENT_SECRET", ""),
        github_oauth_client_id=get_str("GITHUB_OAUTH_CLIENT_ID", ""),
        github_oauth_client_secret=get_str("GITHUB_OAUTH_CLIENT_SECRET", ""),
        smtp_host=get_str("SMTP_HOST", "smtpdm.aliyun.com"),
        smtp_port=get_int("SMTP_PORT", 80, minimum=1, maximum=65535),
        smtp_user=get_str("SMTP_USER", ""),
        smtp_password=get_str("SMTP_PASSWORD", ""),
        agent_api_key=get_str("AGENT_API_KEY", "") or get_str("AGENT_TOKEN", ""),
        agent_base_url=get_str("AGENT_BASE_URL"),
        agent_model=get_str("AGENT_MODEL", ""),
        agent_timeout_seconds=get_int("AGENT_TIMEOUT_SECONDS", 45, minimum=5, maximum=300),
        amap_web_service_key=get_str("AMAP_WEB_SERVICE_KEY", "")
        or get_str("AMAP_KEY", "")
        or get_str("GAODE_KEY", ""),
        supabase_url=get_str("SUPABASE_URL", "") or get_str("NEXT_PUBLIC_SUPABASE_URL", ""),
        supabase_key=get_str("SUPABASE_SERVICE_ROLE_KEY", "")
        or get_str("SUPABASE_SERVICE_KEY", "")
        or get_str("SUPABASE_KEY", "")
        or get_str("SUPABASE_ANON_KEY", ""),
        supabase_visits_table=get_str("SUPABASE_VISITS_TABLE", "")
        or get_str("SUPABASE_TABLE_NAME", "")
        or "visit_tracking_events",
        guest_username=get_str("GUEST_USERNAME", "user"),
        guest_password=get_str("GUEST_PASSWORD", ""),
    )


@lru_cache(maxsize=1)
def get_settings() -> BackendSettings:
    """返回全局配置快照。"""
    return _build_settings()


def reload_settings() -> BackendSettings:
    """测试或管理命令中用于刷新配置缓存。"""
    get_settings.cache_clear()
    return get_settings()


def masked_summary() -> list[str]:
    """生成启动日志用的脱敏配置摘要（绝不输出 L3 明文）。"""
    s = get_settings()

    def _flag(value: str) -> str:
        return "已配置" if str(value or "").strip() else "未配置"

    l3_status = ", ".join(
        f"{name}={_flag(value)}"
        for name, value in (
            ("SUPER_USER", s.super_user),
            ("OAUTH_STATE_SECRET", s.oauth_state_secret),
            ("GOOGLE_OAUTH", s.google_oauth_client_id and s.google_oauth_client_secret),
            ("GITHUB_OAUTH", s.github_oauth_client_id and s.github_oauth_client_secret),
            ("SMTP_PASSWORD", s.smtp_password),
            ("SUPABASE", s.supabase_url and s.supabase_key),
        )
    )
    return [
        f"APP_ENV={s.app_env} LOG_LEVEL={s.log_level}",
        f"BACKEND_PUBLIC_URL={s.backend_public_url}",
        f"FRONTEND_PUBLIC_URL={s.frontend_public_url}",
        f"AUTH_DB_PATH={s.auth_db_path or '(默认策略)'} SESSION={s.session_expire_hours}h",
        f"SMTP={s.smtp_host}:{s.smtp_port} AGENT_BASE_URL={s.agent_base_url} AGENT_MODEL={s.agent_model or '(未设，L2 可覆盖)'}",
        f"[L3] {l3_status}",
    ]
