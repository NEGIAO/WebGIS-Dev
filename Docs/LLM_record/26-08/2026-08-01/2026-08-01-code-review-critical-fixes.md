# Code Review CRITICAL 修复

- **日期与时间**：2026-08-01 15:30
- **任务等级**：L2
- **问题分析**：
  - 核心症状：全项目 Code Review 发现 12 个 CRITICAL 安全问题
  - 根本原因：安全最佳实践缺失（空白名单语义错误、硬编码密钥、XSS 配置不当等）
  - 受影响模块：认证系统、代理系统、Markdown 渲染、SHP 解析、流体模拟、API 客户端
  - 候选方案对比：
    - 方案 A：全部修复（选此方案，因 CRITICAL 问题影响面广）
    - 方案 B：仅修复后端（否决，前端安全问题同样严重）
    - 方案 C：延后修复（否决，CRITICAL 问题不应拖延）
  - 选定方案与理由：方案 A，逐个修复 11 个 CRITICAL 问题（C1 用户确认故意设计除外）

- **修改内容**：

  1. **C9 代理 SSRF**：`host_matches_allowlist()` 空名单返回 `False`（拒绝所有），不再返回 `True`（允许所有）
  2. **C8 异常泄露**：全局异常处理器仅在 `APP_ENV=development` 时返回 `error_type`/`detail`，生产环境只返回通用错误
  3. **C11 Token URL 传递**：`_extract_token()` 移除 `query_params.get("token")` fallback，仅接受 Header
  4. **C10 硬编码密码**：`GUEST_PASSWORD` 改为从 `get_settings().guest_password` 读取；新增 `GUEST_USERNAME`/`GUEST_PASSWORD` 配置 key 登记到 catalog.py 和 .env.example
  5. **C4 Markdown XSS**：移除 DOMPurify `ADD_ATTR` 中的 `onclick`；复制按钮改为容器事件委托；`libsReady` 要求两个库都加载；DOMPurify 失败时 fallback 到 `escapeHtml` 而非返回原始 HTML
  6. **C5 原型链污染**：SHP 解析器过滤 `__proto__`/`constructor`/`__defineGetter__` 字段名
  7. **C12 GPU 纹理泄漏**：`fluidRuntime.destroy()` 先保存 `computePasses` 引用再清空数组，确保所有 outputTexture 被释放
  8. **C2 高德 Key**：前端移除硬编码 Key，改为从 `runtimeMapTokens` 动态获取；`runtimeMapTokens` 新增 `amapKey`/`amapKeys` 字段
  9. **C3 天地图 Token**：`debugInfo.requestUrl` 不再记录含 Token 的 URL（完整修复需后端代理，记入 TODO）
  10. **C6 Token 存储**：`auth.js` 存储从 `localStorage` 改为 `sessionStorage`
  11. **C7 明文密码**：API 客户端添加 HTTP 明文传输安全警告

- **修改原因**：全项目 Code Review 发现的 CRITICAL 安全问题，需立即修复以消除安全风险

- **影响范围**：
  - 认证系统（C6/C10/C11）
  - 代理系统（C9）
  - API 错误处理（C8）
  - Markdown 渲染安全（C4）
  - 数据导入安全（C5）
  - 流体模拟资源管理（C12）
  - API Key 管理（C2/C3/C7）

- **解决方案**：见上述修改内容

- **性能指标**：未实测

- **测试方案**：
  - **Agent 已执行**：代码审查确认修复逻辑正确
  - **待用户实机验证**：
    1. 验证访客登录功能正常（修改后 `GUEST_PASSWORD` 从环境变量读取）
    2. 验证管理员登录功能正常
    3. 验证代理功能在配置 `PROXY_ALLOWED_HOSTS` 后正常
    4. 验证 Markdown 代码复制按钮功能正常
    5. 验证高德 AOI 注入功能（需后端配置高德 Key 到 token 池）
    6. 验证流体模拟销毁后无 GPU 内存泄漏
    7. 验证 Token 在 sessionStorage 中正确存取

- **变更文件清单**：
  - `backend/utils/net_guard.py` — 空白名单语义修正
  - `backend/app.py` — 异常处理器生产环境不泄露详情
  - `backend/api/auth/constants.py` — Token 移除 query string + 访客密码改环境变量
  - `backend/config/load.py` — 新增 guest_username/guest_password 配置字段
  - `backend/config/catalog.py` — 登记 GUEST_USERNAME/GUEST_PASSWORD
  - `.env.example` — 登记 GUEST_PASSWORD
  - `frontend/src/domains/common/utils/useMarkdownRenderer.js` — XSS 修复
  - `frontend/src/domains/common/data-import/parsers/shpParser.ts` — 原型链污染防护
  - `frontend/src/domains/common/user/services/auth.js` — localStorage → sessionStorage
  - `frontend/src/api/backend/client.js` — HTTP 明文传输警告
  - `frontend/src/domains/cesium/modules/fluid-simulation/fluidRuntime.js` — GPU 纹理释放修复
  - `frontend/src/domains/ol/search/components/AmapAoiInjectDialog.vue` — 移除硬编码 Key
  - `frontend/src/domains/ol/services/runtimeMapTokens.js` — 新增 amapKey 字段
  - `frontend/src/domains/ol/routing/components/DrivingPlannerPanel.vue` — debugInfo 不再记录 Token
  - `frontend/src/domains/ol/routing/components/BusPlannerPanel.vue` — debugInfo 不再记录 Token

- **遗留与风险**：
  - C3 天地图 Token 仅做了缓解（debugInfo 不再记录），完整修复需后端代理（记入 TODO）
  - C2 高德 Key 前端已改为动态获取，但后端 token 池尚未配置 amapKey（需用户后续配置）
  - C7 明文密码仅为警告，完整修复需部署 HTTPS
  - C10 `GUEST_PASSWORD` 默认空值，需在 .env 中配置才能启用访客登录
  - C6 改为 sessionStorage 后，用户关闭标签页需重新登录（预期行为）
