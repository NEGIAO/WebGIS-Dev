# Code Review HIGH 安全修复

- **日期与时间**：2026-08-01 16:00
- **任务等级**：L2
- **问题分析**：
  - 核心症状：Code Review 发现 6 个 HIGH 级安全问题（SSRF redirect、信息泄露、DEBUG 日志、无速率限制、XSS 兜底）
  - 根本原因：httpx 默认跟随重定向可绕过 SSRF 防护、API 信息接口未做环境隔离、日志级别硬编码 DEBUG、登录端点无速率限制、renderThinkHtml 函数 DOMPurify 失败时返回原始 HTML
  - 受影响模块：Agent Chat 上游调用、外部代理、认证系统、监控日志、Markdown 渲染
  - 候选方案对比：
    - 方案 A：全部修复（选此方案）
    - 方案 B：仅修复后端（否决，前端 XSS 同样严重）
  - 选定方案与理由：方案 A，逐个修复所有 HIGH 安全问题

- **修改内容**：

  1. **H1/H2 SSRF via redirect**：`agent_chat/upstream.py` 和 `external_proxy.py` 的 httpx 客户端改为 `follow_redirects=False`，防止上游服务通过重定向将请求导向内网 IP 绕过 SSRF 防护
  2. **H13 API 信息泄露**：`app.py` 的 `/api/info` 端点添加环境检查，仅 `APP_ENV=development` 时可用，生产环境返回 404
  3. **H14 DEBUG 日志**：`monitor.py` 的日志级别由 `get_settings().log_level` 控制，不再硬编码 DEBUG
  4. **登录速率限制**：新增 `login_attempts` 表 + `check_login_rate_limit()`/`record_login_attempt()` 函数，同一 IP 5 分钟内最多 10 次登录尝试
  5. **renderThinkHtml XSS 兜底**：DOMPurify 不可用时 fallback 到 `escapeHtml` 而非返回原始 HTML

- **修改原因**：HIGH 级安全问题需立即修复，防止 SSRF、暴力破解、信息泄露等攻击

- **影响范围**：
  - Agent Chat 上游调用链路
  - 外部代理（高德/Nominatim/IP）
  - API 信息端点
  - 监控日志广播
  - 认证系统（登录端点）
  - Markdown 渲染

- **解决方案**：见上述修改内容

- **性能指标**：未实测

- **测试方案**：
  - **Agent 已执行**：代码审查确认修复逻辑正确、门禁脚本通过
  - **待用户实机验证**：
    1. 验证 Agent Chat 功能正常（redirect 禁用后上游调用不受影响）
    2. 验证外部代理（高德 AOI、Nominatim 搜索）功能正常
    3. 验证 `/api/info` 在生产环境返回 404、开发环境正常
    4. 验证登录速率限制生效（5 分钟内第 11 次尝试返回 429）
    5. 验证 Markdown 代码复制和渲染正常

- **变更文件清单**：
  - `backend/api/agent_chat/upstream.py` — follow_redirects=True → False
  - `backend/api/external_proxy.py` — follow_redirects=True → False
  - `backend/app.py` — /api/info 添加环境检查 + 导入 starlette.status
  - `backend/api/monitor.py` — 日志级别由配置控制 + 导入 get_settings
  - `backend/api/auth/verification.py` — 新增登录速率限制函数和 login_attempts 表
  - `backend/api/auth/routes.py` — 登录端点添加速率限制检查和记录
  - `frontend/src/domains/common/utils/useMarkdownRenderer.js` — renderThinkHtml XSS 兜底修复

- **遗留与风险**：
  - 登录速率限制 fail-open（表不存在时放行），保证可用性
  - follow_redirects=False 可能导致某些需要跟随重定向的上游服务不兼容（如有）
