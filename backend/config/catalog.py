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
    "AUTH_DB_JOURNAL_MODE": {
        "layer": "L1",
        "default": "DELETE",
        "secret": False,
        "description": "认证库日志模式；HF 网络挂载建议 DELETE，避免 WAL/SHM 锁与同步风险",
    },
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
        "default": "/tmp/webgis_download_tasks.db",
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
    "HF_RUN_LOGS_URL": {
        "layer": "L1",
        "default": "https://huggingface.co/api/spaces/NEGIAO/WebGIS/logs/run",
        "secret": False,
        "description": "Hugging Face Space 运行日志 SSE 端点",
    },
    "HF_BUILD_LOGS_URL": {
        "layer": "L1",
        "default": "https://huggingface.co/api/spaces/NEGIAO/WebGIS/logs/build",
        "secret": False,
        "description": "Hugging Face Space 构建日志 SSE 端点",
    },
    "DOWNLOAD_OUTPUT_DIR": {
        "layer": "L1",
        "default": "/tmp",
        "secret": False,
        "description": "下载任务 GeoTIFF 输出目录",
    },
    "DOWNLOAD_TASK_TTL_MINUTES": {
        "layer": "L2",
        "default": 30,
        "secret": False,
        "description": "下载任务存活分钟数（从最后活动时间起算，管理员面板可调，写入 system_config）",
    },
    "DOWNLOAD_TILES_PER_UNIT": {
        "layer": "L2",
        "default": 100,
        "secret": False,
        "description": "每份额度可下载的瓦片数（管理员面板可调，写入 system_config）",
    },
    "AGENT_TOKENS_PER_UNIT": {
        "layer": "L2",
        "default": 1000,
        "secret": False,
        "description": "Agent 对话每多少 tokens 折算 1 个 API 额度（管理员面板可调，写入 system_config）",
    },
    "API_GUEST_DAILY_QUOTA": {
        "layer": "L2",
        "default": 100,
        "secret": False,
        "description": "游客每日 API 配额（管理员面板可调，写入 system_config）",
    },
    "API_REGISTERED_DAILY_QUOTA": {
        "layer": "L2",
        "default": 1000,
        "secret": False,
        "description": "注册用户每日 API 配额（管理员面板可调，写入 system_config）",
    },
    "SHIPS66_TILE_URL_TEMPLATE": {
        "layer": "L1",
        "default": "http://g3.ships66.com/maps/one/{z}/{x}/{y}.png",
        "secret": False,
        "description": "ships66 专用海图瓦片 URL 模板",
    },
    "PROXY_HTTP_TIMEOUT_SECONDS": {
        "layer": "L1",
        "default": 20,
        "secret": False,
        "description": "通用代理总超时秒数",
    },
    "PROXY_HTTP_CONNECT_TIMEOUT_SECONDS": {
        "layer": "L1",
        "default": 5,
        "secret": False,
        "description": "通用代理连接超时秒数",
    },
    "PROXY_MAX_CONNECTIONS": {
        "layer": "L1",
        "default": 100,
        "secret": False,
        "description": "通用代理 HTTP 客户端最大连接数",
    },
    "PROXY_MAX_KEEPALIVE_CONNECTIONS": {
        "layer": "L1",
        "default": 20,
        "secret": False,
        "description": "通用代理 HTTP 客户端 keepalive 连接数",
    },
    "PROXY_USER_AGENT": {
        "layer": "L1",
        "default": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "secret": False,
        "description": "通用代理默认 User-Agent",
    },
    "PROXY_TILE_CACHE_TTL_SECONDS": {
        "layer": "L1",
        "default": 300,
        "secret": False,
        "description": "代理瓦片内存缓存 TTL 秒数（默认 300=5 分钟）",
    },
    "PROXY_TILE_CACHE_MAX_SIZE": {
        "layer": "L1",
        "default": 100000,
        "secret": False,
        "description": "代理瓦片内存缓存最大条目数（默认 100000）",
    },
    "AMAP_REST_ROOT": {
        "layer": "L1",
        "default": "https://restapi.amap.com",
        "secret": False,
        "description": "高德 Web 服务 REST 根地址",
    },
    "AMAP_WEB_DETAIL_ENDPOINT": {
        "layer": "L1",
        "default": "https://www.amap.com/detail/get/detail",
        "secret": False,
        "description": "高德 Web 详情接口端点",
    },
    "NOMINATIM_BASE_URL": {
        "layer": "L1",
        "default": "https://nominatim.openstreetmap.org",
        "secret": False,
        "description": "Nominatim 根地址",
    },
    "NOMINATIM_SEARCH_ENDPOINT": {
        "layer": "L1",
        "default": "https://nominatim.openstreetmap.org/search",
        "secret": False,
        "description": "Nominatim 搜索端点",
    },
    "EPSG_PROJ4_ENDPOINT": {
        "layer": "L1",
        "default": "https://epsg.io/{code}.proj4",
        "secret": False,
        "description": "EPSG proj4 查询端点模板",
    },
    "EXTERNAL_PROXY_CONNECT_TIMEOUT_SECONDS": {
        "layer": "L1",
        "default": 3,
        "secret": False,
        "description": "外部服务代理连接超时秒数",
    },
    "EXTERNAL_PROXY_READ_TIMEOUT_SECONDS": {
        "layer": "L1",
        "default": 8,
        "secret": False,
        "description": "外部服务代理读取超时秒数",
    },
    "EXTERNAL_PROXY_WRITE_TIMEOUT_SECONDS": {
        "layer": "L1",
        "default": 8,
        "secret": False,
        "description": "外部服务代理写入超时秒数",
    },
    "EXTERNAL_PROXY_POOL_TIMEOUT_SECONDS": {
        "layer": "L1",
        "default": 3,
        "secret": False,
        "description": "外部服务代理连接池等待超时秒数",
    },
    "EXTERNAL_PROXY_MAX_CONNECTIONS": {
        "layer": "L1",
        "default": 120,
        "secret": False,
        "description": "外部服务代理最大连接数",
    },
    "EXTERNAL_PROXY_MAX_KEEPALIVE_CONNECTIONS": {
        "layer": "L1",
        "default": 60,
        "secret": False,
        "description": "外部服务代理 keepalive 连接数",
    },
    "EXTERNAL_PROXY_USER_AGENT": {
        "layer": "L1",
        "default": "WebGIS-Backend/1.0",
        "secret": False,
        "description": "外部服务代理默认 User-Agent",
    },
    "AMAP_WEB_REFERER": {
        "layer": "L1",
        "default": "https://www.amap.com/",
        "secret": False,
        "description": "高德 Web 接口 Referer",
    },
    "IP_GEO_AMAP_ENDPOINT": {
        "layer": "L1",
        "default": "https://restapi.amap.com/v3/ip",
        "secret": False,
        "description": "高德 IP 定位端点",
    },
    "IP_GEO_IP_API_ENDPOINT": {
        "layer": "L1",
        "default": "http://ip-api.com/json",
        "secret": False,
        "description": "ip-api.com 定位端点根地址（免费版仅支持 HTTP）",
    },
    "IP_GEO_IPWHO_ENDPOINT": {
        "layer": "L1",
        "default": "https://ipwho.is",
        "secret": False,
        "description": "ipwho.is 定位端点（不屏蔽数据中心 IP）",
    },
    "IP_GEO_IPAPI_ENDPOINT": {
        "layer": "L1",
        "default": "https://ipapi.co",
        "secret": False,
        "description": "ipapi.co 定位端点根地址",
    },
    "IP_GEO_TIMEOUT_CONNECT_SECONDS": {
        "layer": "L1",
        "default": 3,
        "secret": False,
        "description": "IP 定位连接超时秒数",
    },
    "IP_GEO_TIMEOUT_READ_SECONDS": {
        "layer": "L1",
        "default": 5,
        "secret": False,
        "description": "IP 定位读取超时秒数",
    },
    "IP_GEO_TIMEOUT_WRITE_SECONDS": {
        "layer": "L1",
        "default": 5,
        "secret": False,
        "description": "IP 定位写入超时秒数",
    },
    "IP_GEO_TIMEOUT_POOL_SECONDS": {
        "layer": "L1",
        "default": 3,
        "secret": False,
        "description": "IP 定位连接池等待超时秒数",
    },
    "IP_GEO_USER_AGENT": {
        "layer": "L1",
        "default": "WebGIS-Backend/2.0",
        "secret": False,
        "description": "IP 定位服务 User-Agent",
    },
    "IP_GEO_CACHE_TTL_SECONDS": {
        "layer": "L1",
        "default": 3600,
        "secret": False,
        "description": "IP 定位内存缓存 TTL 秒数",
    },
    "IP_GEO_CACHE_MAX_SIZE": {
        "layer": "L1",
        "default": 2000,
        "secret": False,
        "description": "IP 定位内存缓存最大条目数",
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
    "GUEST_USERNAME": {
        "layer": "L1",
        "default": "user",
        "secret": False,
        "description": "访客账号用户名（留空则用默认值 user）",
    },
    "GUEST_PASSWORD": {
        "layer": "L1",
        "default": "",
        "secret": True,
        "description": "访客账号密码（建议设为随机强密码，空则访客登录不可用）",
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
    "GOOGLE_OAUTH_AUTH_URL": {
        "layer": "L1",
        "default": "https://accounts.google.com/o/oauth2/v2/auth",
        "secret": False,
        "description": "Google OAuth 授权端点",
    },
    "GOOGLE_OAUTH_TOKEN_URL": {
        "layer": "L1",
        "default": "https://oauth2.googleapis.com/token",
        "secret": False,
        "description": "Google OAuth token 端点",
    },
    "GOOGLE_OAUTH_PROFILE_URL": {
        "layer": "L1",
        "default": "https://www.googleapis.com/oauth2/v3/userinfo",
        "secret": False,
        "description": "Google OAuth 用户资料端点",
    },
    "GOOGLE_OAUTH_TOKENINFO_URL": {
        "layer": "L1",
        "default": "https://oauth2.googleapis.com/tokeninfo",
        "secret": False,
        "description": "Google One Tap / ID Token 校验端点",
    },
    "GITHUB_OAUTH_AUTH_URL": {
        "layer": "L1",
        "default": "https://github.com/login/oauth/authorize",
        "secret": False,
        "description": "GitHub OAuth 授权端点",
    },
    "GITHUB_OAUTH_TOKEN_URL": {
        "layer": "L1",
        "default": "https://github.com/login/oauth/access_token",
        "secret": False,
        "description": "GitHub OAuth token 端点",
    },
    "GITHUB_OAUTH_PROFILE_URL": {
        "layer": "L1",
        "default": "https://api.github.com/user",
        "secret": False,
        "description": "GitHub OAuth 用户资料端点",
    },
    "GITHUB_OAUTH_EMAILS_URL": {
        "layer": "L1",
        "default": "https://api.github.com/user/emails",
        "secret": False,
        "description": "GitHub OAuth 邮箱端点",
    },
    "HUGGINGFACE_OAUTH_REDIRECT_URI": {
        "layer": "L1",
        "default": "",
        "secret": False,
        "description": "可选覆盖 Hugging Face 回调",
    },
    "HUGGINGFACE_OAUTH_AUTH_URL": {
        "layer": "L1",
        "default": "https://huggingface.co/oauth/authorize",
        "secret": False,
        "description": "Hugging Face OAuth 授权端点",
    },
    "HUGGINGFACE_OAUTH_TOKEN_URL": {
        "layer": "L1",
        "default": "https://huggingface.co/oauth/token",
        "secret": False,
        "description": "Hugging Face OAuth token 端点",
    },
    "HUGGINGFACE_OAUTH_PROFILE_URL": {
        "layer": "L1",
        "default": "https://huggingface.co/api/whoami-v2",
        "secret": False,
        "description": "Hugging Face OAuth 用户资料端点",
    },
    "OAUTH_HTTP_TIMEOUT_SECONDS": {
        "layer": "L1",
        "default": 15,
        "secret": False,
        "description": "OAuth provider HTTP 请求超时秒数",
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
        "status_label": "Google OAuth",
        "description": "Google OAuth Client ID",
    },
    "GOOGLE_OAUTH_CLIENT_SECRET": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "status_label": "Google OAuth",
        "description": "Google OAuth Client Secret",
    },
    "GITHUB_OAUTH_CLIENT_ID": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "status_label": "GitHub OAuth",
        "description": "GitHub OAuth Client ID",
    },
    "GITHUB_OAUTH_CLIENT_SECRET": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "status_label": "GitHub OAuth",
        "description": "GitHub OAuth Client Secret",
    },
    "HUGGINGFACE_OAUTH_CLIENT_ID": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "status_label": "Hugging Face OAuth",
        "description": "Hugging Face OAuth Client ID",
    },
    "HUGGINGFACE_OAUTH_CLIENT_SECRET": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "status_label": "Hugging Face OAuth",
        "description": "Hugging Face OAuth Client Secret",
    },
    "SMTP_USER": {
        "layer": "L1",
        "default": "",
        "secret": False,
        "status_label": "SMTP",
        "description": "SMTP 发件账号（半公开；凭证 SMTP_PASSWORD 属 L3）",
    },
    "SMTP_REPLY": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "description": "SMTP 回信地址 Reply-To（HF Secrets；留空则回信到发件账号）",
    },
    "SMTP_PASSWORD": {"layer": "L3", "default": "", "secret": True, "status_label": "SMTP", "description": "SMTP 密码"},
    "SUPABASE_URL": {"layer": "L3", "default": "", "secret": True, "status_label": "SUPABASE", "description": "Supabase URL"},
    "SUPABASE_KEY": {"layer": "L3", "default": "", "secret": True, "status_label": "SUPABASE", "description": "Supabase Key"},
    "SUPABASE_SERVICE_ROLE_KEY": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "status_exclude": True,
        "description": "Supabase service role",
    },
    "SUPABASE_ANON_KEY": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "status_exclude": True,
        "description": "Supabase anon",
    },
    "NEXT_PUBLIC_SUPABASE_URL": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "status_exclude": True,
        "description": "Supabase URL 兼容名",
    },
    "SUPABASE_SERVICE_KEY": {
        "layer": "L3",
        "default": "",
        "secret": True,
        "status_exclude": True,
        "description": "Supabase key 兼容名",
    },
    "AGENT_API_KEY": {
        "layer": "L2",
        "default": "",
        "secret": True,
        "description": "Agent 主密钥（管理员面板 api_keys.agent_api_key；env 仅旧部署兜底）",
    },
    "AMAP_WEB_SERVICE_KEY": {
        "layer": "L2",
        "default": "",
        "secret": True,
        "description": "高德 Web 服务 Key（管理员面板 api_keys.amap_key；env 仅旧部署兜底）",
    },
    "AMAP_KEY": {
        "layer": "L2",
        "default": "",
        "secret": True,
        "description": "高德 Key 兼容名（管理员面板 api_keys.amap_key；env 仅旧部署兜底）",
    },
    "GAODE_KEY": {
        "layer": "L2",
        "default": "",
        "secret": True,
        "description": "高德 Key 兼容名（管理员面板 api_keys.amap_key；env 仅旧部署兜底）",
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


def iter_l3_status_groups() -> list[tuple[str, list[str]]]:
    """按 status_label 聚合参与监控的密钥组（SSOT：管理员面板与启动日志的 L3 状态均由本函数驱动）。

    规则：
      - 带 status_label 的 key（不限 layer，如 SMTP_USER 为 L1 但参与 SMTP 完整性）按 label 分组；
      - 无 status_label 且 layer == L3 的 key 以自身 key 名独立成组（如 SUPER_USER）；
      - status_exclude=True（历史兼容名）不参与监控，仅作登记表项。
    返回 [(label, [keys...]), ...]，顺序 = catalog 声明顺序；组已配置 = 组内全部 key 非空。
    """
    groups: dict[str, list[str]] = {}
    for key, meta in CONFIG_CATALOG.items():
        if meta.get("status_exclude"):
            continue
        label = meta.get("status_label")
        if label is None and meta.get("layer") != "L3":
            continue
        groups.setdefault(label or key, []).append(key)
    return [(label, keys) for label, keys in groups.items()]
