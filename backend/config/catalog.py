"""
配置项元数据目录（与仓库根 .env.example 对齐）。

layer:
    L1 — 低密/不涉密，可写 .env
    L2 — 仅登记，真值在 Admin+DB
    L3 — 绝密，HF Secrets
"""

from __future__ import annotations

from typing import Any, Dict, Optional, TypedDict


class ConfigMeta(TypedDict, total=False):
    layer: str
    default: Any
    secret: bool
    description: str


# key -> 元数据。default 仅用于 L1 非密项；L3 默认必须为空串。
CONFIG_CATALOG: Dict[str, ConfigMeta] = {
    # ── L1 环境 ──
    "APP_ENV": {
        "layer": "L1",
        "default": "production",
        "secret": False,
        "description": "development|production",
    },
    "LOG_LEVEL": {"layer": "L1", "default": "INFO", "secret": False, "description": "日志级别"},
    "BACKEND_PUBLIC_URL": {
        "layer": "L1",
        "default": "",
        "secret": False,
        "description": "后端对外基址；空则按 APP_ENV 选 localhost 或 HF 默认",
    },
    "FRONTEND_PUBLIC_URL": {
        "layer": "L1",
        "default": "",
        "secret": False,
        "description": "前端对外基址；空则按 APP_ENV 选 localhost 或 Pages 默认",
    },
    "AUTH_DB_PATH": {"layer": "L1", "default": "", "secret": False, "description": "认证库路径"},
    "AUTH_SESSION_EXPIRE_HOURS": {
        "layer": "L1",
        "default": 72,
        "secret": False,
        "description": "会话有效小时",
    },
    "AUTH_PASSWORD_HASH_ITERATIONS": {
        "layer": "L1",
        "default": 120000,
        "secret": False,
        "description": "PBKDF2 迭代次数",
    },
    "OAUTH_STATE_TTL_SECONDS": {
        "layer": "L1",
        "default": 600,
        "secret": False,
        "description": "OAuth state TTL",
    },
    "OAUTH_TICKET_TTL_SECONDS": {
        "layer": "L1",
        "default": 120,
        "secret": False,
        "description": "OAuth 一次性 ticket TTL",
    },
    "SMTP_HOST": {
        "layer": "L1",
        "default": "smtpdm.aliyun.com",
        "secret": False,
        "description": "SMTP 主机",
    },
    "SMTP_PORT": {"layer": "L1", "default": 80, "secret": False, "description": "SMTP 端口"},
    "AGENT_BASE_URL": {
        "layer": "L1",
        "default": "https://api.qnaigc.com/v1",
        "secret": False,
        "description": "Agent 默认上游（可被 L2 覆盖）",
    },
    "AGENT_MODEL": {"layer": "L1", "default": "", "secret": False, "description": "Agent 默认模型"},
    "AGENT_SYSTEM_PROMPT": {
        "layer": "L1",
        "default": (
            "You are the WebGIS assistant. Reply in concise Chinese "
            "unless the user asks for another language."
        ),
        "secret": False,
        "description": "Agent 默认系统提示",
    },
    "AGENT_TIMEOUT_SECONDS": {
        "layer": "L1",
        "default": 45,
        "secret": False,
        "description": "Agent 超时秒",
    },
    "AGENT_MAX_TOKENS": {
        "layer": "L1",
        "default": 32768,
        "secret": False,
        "description": "Agent max_tokens",
    },
    "AGENT_TEMPERATURE": {
        "layer": "L1",
        "default": 1.0,
        "secret": False,
        "description": "Agent temperature",
    },
    "AGENT_TOP_P": {"layer": "L1", "default": 0.95, "secret": False, "description": "Agent top_p"},
    "AGENT_CHAT_GUEST_DAILY_QUOTA": {
        "layer": "L1",
        "default": 10,
        "secret": False,
        "description": "游客日对话额度默认",
    },
    "AGENT_CHAT_REGISTERED_DAILY_QUOTA": {
        "layer": "L1",
        "default": 100,
        "secret": False,
        "description": "注册用户日对话额度默认",
    },
    "AGENT_ALLOWED_BASE_URL_HOSTS": {
        "layer": "L1",
        "default": "",
        "secret": False,
        "description": "调用方 override_base_url 的 host 白名单（逗号分隔；留空=不启用白名单，仅走成对 Key 校验与私网护栏）",
    },
    "AGENT_ALLOW_INSECURE_BASE_URL": {
        "layer": "L1",
        "default": False,
        "secret": False,
        "description": "是否允许 override_base_url 使用 http:// 明文（仅本地回环地址；生产恒 false）",
    },
    "PROXY_ALLOWED_HOSTS": {
        "layer": "L1",
        "default": "",
        "secret": False,
        "description": "瓦片/通用代理 host 白名单（逗号分隔，支持 *.example.com；留空=不启用，仅走私网+DNS 护栏）",
    },
    "PROXY_DNS_GUARD": {
        "layer": "L1",
        "default": True,
        "secret": False,
        "description": "代理目标 host 是否做 DNS 解析后私网复判（堵域名指向内网的 SSRF；解析失败则拒绝）",
    },
    "PROXY_MAX_RESPONSE_MB": {
        "layer": "L1",
        "default": 32,
        "secret": False,
        "description": "通用代理响应体上限（MB，≤0=不限制）：Content-Length 超限 413，流式累计超限断流",
    },
    "GCJRE_TILE_MAX_MB": {
        "layer": "L1",
        "default": 8,
        "secret": False,
        "description": "纠偏代理单瓦片字节上限（MB，≤0=不限制），防超大图撑爆解码",
    },
    "GCJRE_MAX_IMAGE_PIXELS": {
        "layer": "L1",
        "default": 16777216,
        "secret": False,
        "description": "纠偏解码单图像素上限（默认 4096×4096），防 Pillow 解压炸弹",
    },
    "GCJRE_MAX_CONCURRENCY": {
        "layer": "L1",
        "default": 16,
        "secret": False,
        "description": "纠偏瓦片抓取并发上限（原硬编码 100，收紧防打爆上游与本机 fd）",
    },
    "GCJRE_MAX_TILES_PER_REQUEST": {
        "layer": "L1",
        "default": 64,
        "secret": False,
        "description": "纠偏单请求合成瓦片数上限（默认 64=8×8），超限 400",
    },
    "PROXY_RATE_LIMIT": {
        "layer": "L1",
        "default": 0,
        "secret": False,
        "description": "代理限流",
    },
    "PROXY_ALLOW_PRIVATE_HOSTS": {
        "layer": "L1",
        "default": False,
        "secret": False,
        "description": "代理允许内网主机（默认关闭）",
    },
    "PROXY_VERIFY_SSL": {
        "layer": "L1",
        "default": True,
        "secret": False,
        "description": "代理上游 SSL 校验",
    },
    "WEBGIS_ASSUME_HF_SPACE": {
        "layer": "L1",
        "default": False,
        "secret": False,
        "description": "诊断：强制按 HF Space 环境处理",
    },
    "WEBGIS_ASSUME_IN_CONTAINER": {
        "layer": "L1",
        "default": False,
        "secret": False,
        "description": "诊断：强制按容器环境处理",
    },
    "DOWNLOAD_TASK_DB_PATH": {
        "layer": "L1",
        "default": "",
        "secret": False,
        "description": "下载任务库路径",
    },
    "GCJRE_CACHE": {"layer": "L1", "default": "", "secret": False, "description": "纠偏缓存"},
    "WEBGIS_LOG_STREAM_MODE": {
        "layer": "L1",
        "default": "auto",
        "secret": False,
        "description": "日志流模式",
    },
    "RUNTIME_CONFIG_ALLOWED_ORIGINS": {
        "layer": "L1",
        "default": "",
        "secret": False,
        "description": "runtime-config CORS 白名单",
    },
    "CORS_ALLOWED_ORIGINS": {
        "layer": "L1",
        "default": "",
        "secret": False,
        "description": "全局 CORS 来源白名单（逗号分隔；空 = 允许所有来源，兼容旧行为）",
    },
    "SUPABASE_VISITS_TABLE": {
        "layer": "L1",
        "default": "",
        "secret": False,
        "description": "Supabase visits 表名",
    },
    "SUPABASE_TABLE_NAME": {
        "layer": "L1",
        "default": "",
        "secret": False,
        "description": "Supabase 表名兼容",
    },
    # 可选 URL 覆盖（兼容旧部署）
    "GOOGLE_OAUTH_REDIRECT_URI": {
        "layer": "L1",
        "default": "",
        "secret": False,
        "description": "可选覆盖 Google 回调",
    },
    "GITHUB_OAUTH_REDIRECT_URI": {
        "layer": "L1",
        "default": "",
        "secret": False,
        "description": "可选覆盖 GitHub 回调",
    },
    "FRONTEND_OAUTH_SUCCESS_URL": {
        "layer": "L1",
        "default": "",
        "secret": False,
        "description": "可选覆盖 OAuth 成功回跳",
    },
    "FRONTEND_OAUTH_FAILURE_URL": {
        "layer": "L1",
        "default": "",
        "secret": False,
        "description": "可选覆盖 OAuth 失败回跳",
    },
    # ── L3 绝密 ──
    "SUPER_USER": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "description": "管理员密码（用户名 admin）",
    },
    "OAUTH_STATE_SECRET": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "description": "OAuth state HMAC 密钥",
    },
    "GOOGLE_OAUTH_CLIENT_ID": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "description": "Google OAuth Client ID",
    },
    "GOOGLE_OAUTH_CLIENT_SECRET": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "description": "Google OAuth Client Secret",
    },
    "GITHUB_OAUTH_CLIENT_ID": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "description": "GitHub OAuth Client ID",
    },
    "GITHUB_OAUTH_CLIENT_SECRET": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "description": "GitHub OAuth Client Secret",
    },
    "SMTP_USER": {
        "layer": "L1",
        "default": "",
        "secret": False,
        "description": "SMTP 发件账号（半公开；凭证 SMTP_PASSWORD 属 L3）",
    },
    "SMTP_PASSWORD": {"layer": "L3", "default": "", "secret": True, "description": "SMTP 密码"},
    "SUPABASE_URL": {"layer": "L3", "default": "", "secret": True, "description": "Supabase URL"},
    "SUPABASE_KEY": {"layer": "L3", "default": "", "secret": True, "description": "Supabase Key"},
    "SUPABASE_SERVICE_ROLE_KEY": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "description": "Supabase service role",
    },
    "SUPABASE_ANON_KEY": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "description": "Supabase anon",
    },
    "NEXT_PUBLIC_SUPABASE_URL": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "description": "Supabase URL 兼容名",
    },
    "SUPABASE_SERVICE_KEY": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "description": "Supabase key 兼容名",
    },
    "AGENT_API_KEY": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "description": "LLM 主密钥",
    },
    "AGENT_TOKEN": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "description": "LLM 主密钥兼容名",
    },
    "AMAP_WEB_SERVICE_KEY": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "description": "高德 Web 服务 Key",
    },
    "AMAP_KEY": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "description": "高德 Key 兼容名",
    },
    "GAODE_KEY": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "description": "高德 Key 兼容名",
    },
    "LOG": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "description": "监控日志流访问令牌",
    },
}


# 部署拓扑默认（非 env，随 APP_ENV 选择）
BACKEND_URL_DEV = "http://localhost:7860"
BACKEND_URL_PROD = "https://negiao-webgis.hf.space"
FRONTEND_URL_DEV = "http://localhost:5173"
FRONTEND_URL_PROD = "https://negiao.github.io/WebGIS-Dev"

DEV_DEFAULT_ADMIN_PASSWORD = "123456"
DEV_OAUTH_STATE_SECRET_FALLBACK = "webgis-oauth-dev-state-secret"


def get_meta(key: str) -> Optional[ConfigMeta]:
    """返回配置项元数据。"""
    return CONFIG_CATALOG.get(key)
