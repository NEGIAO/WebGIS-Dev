# 2026-05-27 修复 AI 助手 CORS 跨域问题

## 日期和时间
2026-05-27 13:20

## 修改内容
修复 AI 助手（ChatPanelContent）"个人 Key 模式"在部署后因浏览器 CORS 策略导致请求失败的问题，新增后端代理端点 `/api/agent/chat/proxy`。

## 修改原因
- **核心症状**：前端 `ChatPanelContent.vue` 的"直连模式"使用浏览器原生 `fetch()` 直接调用外部 LLM API（如 `https://token-plan-cn.xiaomimimo.com/v1/chat/completions`），在本地开发环境中可能正常工作，但一旦部署到 GitHub Pages 生产环境，浏览器会因 CORS（Cross-Origin Resource Sharing）策略直接拦截请求，导致所有 LLM 对话功能完全不可用。
- **根本原因**：浏览器安全策略禁止从 `https://negiao.github.io` 向未配置 CORS 响应头的第三方 LLM API 发起跨域请求。这是浏览器级别的限制，前端无法绕过。
- **受影响模块**：AI 助手聊天面板、模型列表获取。

## 影响范围
- `backend/api/agent_chat.py` — 新增 `AgentChatProxyRequest` 数据模型和 `POST /api/agent/chat/proxy` 端点
- `frontend/src/api/backend.js` — 新增 `apiAgentChatProxy()` API 函数
- `frontend/src/components/ChatPanelContent.vue` — 重构 `sendMessage()` 和 `loadAvailableModels()` 逻辑，所有 LLM 请求统一经后端代理转发
- `README.md` — 新增接口文档

## 优化解决方案

### 问题事件逻辑链条
```
浏览器部署到 GitHub Pages
  → 用户填写个人 API Key 进入"直连模式"
    → 前端 fetch() 直接请求外部 LLM API
      → 浏览器 CORS 策略拦截（无 Access-Control-Allow-Origin 响应头）
        → 请求失败，返回 "Failed to fetch" / "NetworkError"
          → 用户看到 "网络请求失败" 错误
```

### 解决方案设计
1. **后端新增代理端点** `POST /api/agent/chat/proxy`：
   - 接收用户前端传入的 `api_key`、`base_url`、`model` 等参数
   - 后端使用 `httpx` 异步转发请求到 LLM API（服务端无 CORS 限制）
   - **不消耗平台配额**（用户使用自己的 API Key，与 `/api/agent/chat/completions` 的区别）
   - 复用已有的 `_call_upstream_chat()` 和 `_extract_assistant_reply()` 函数
   - 记录 API 调用日志（用于审计，不含 api_key）

2. **前端重构调用链路**：
   - `sendMessage()`：个人 Key 模式从 `callDirectLLM()`（浏览器直连）改为 `apiAgentChatProxy()`（后端代理）
   - `loadAvailableModels()`：个人 Key 模式从 `fetchDirectModels()`（浏览器直连）改为 `apiAgentListModels()`（后端代理，带 `override_base_url`/`override_api_key` 参数）
   - UI 文本全面更新："前端直连" → "个人 Key 模式（经后端代理）"

### 实施步骤
1. 后端 `agent_chat.py`：新增 `AgentChatProxyRequest` Pydantic 模型和 `agent_chat_proxy` 端点
2. 前端 `backend.js`：新增 `apiAgentChatProxy()` API 函数
3. 前端 `ChatPanelContent.vue`：
   - 导入 `apiAgentChatProxy`
   - 重写 `sendMessage()` 的 isDirectMode 分支
   - 重写 `loadAvailableModels()` 的 isDirectMode 分支
   - 更新所有 UI 文本、状态提示、欢迎消息

## 性能指标
- 无额外性能开销（后端代理复用已有 httpx 客户端）
- 消除了浏览器 CORS 导致的 100% 请求失败率

## 测试方案
1. **本地开发环境**：前端 `localhost:5173` + 后端 `localhost:7860`，验证两种模式均正常
2. **部署环境**：GitHub Pages + HF Spaces，验证个人 Key 模式对话功能正常
3. **模型列表**：验证个人 Key 模式下模型列表通过后端代理正确获取
4. **配额隔离**：验证个人 Key 模式不消耗平台配额

## 修改的文件路径
- `WebGIS_Dev/backend/api/agent_chat.py` — 新增 `AgentChatProxyRequest` 模型 + `POST /api/agent/chat/proxy` 端点
- `WebGIS_Dev/frontend/src/api/backend.js` — 新增 `apiAgentChatProxy()` 函数
- `WebGIS_Dev/frontend/src/components/ChatPanelContent.vue` — 重构消息发送和模型列表获取逻辑，更新 UI 文本
- `WebGIS_Dev/README.md` — 新增接口文档条目

## 兼容性说明
- ✅ **无破坏性变更**：现有后端代理模式（`/api/agent/chat/completions`）完全不受影响
- ✅ **向后兼容**：前端 `callDirectLLM()` 和 `fetchDirectModels()` 函数保留（供本地开发 fallback）
- ✅ **渐进式升级**：用户无需修改任何配置，升级后自动生效