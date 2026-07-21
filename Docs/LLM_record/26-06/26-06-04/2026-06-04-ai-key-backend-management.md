# 2026-06-04 AI 专属 Key 管理迁移到后端

## 日期和时间
2026-06-04 16:36 (Asia/Shanghai)

## 修改内容
将前端硬编码的 AI 专属 API Key（`tp-cs24lphikpjnqg0kkctxl167xhnkv4writnf46j3cv4y0nsw`）迁移到后端数据库管理，由管理员通过接口配置 `base_url`、`model`、`api_key` 三个参数，前端通过后端代理转发请求，不再暴露敏感密钥。

## 修改原因
- **安全问题**：前端硬编码 API Key 存在严重安全隐患，任何用户可通过浏览器开发者工具查看
- **维护性**：更换 Key 或端点需要修改前端代码并重新构建部署
- **架构优化**：遵循"密钥不暴露在前端"的安全最佳实践

## 影响范围
- Agent Chat 模块（后端 routes / db / schemas / constants）
- 前端 ChatPanelContent 组件
- 前端 API 层（agent.js）
- 管理员配置接口

## 事件逻辑链条分析

### 核心症状
前端 `ChatPanelContent.vue` 第 309-317 行硬编码了 mimo-v2.5-pro 的 API Key、Base URL 和 Model 名称。

### 根本原因
早期开发为了快速原型验证，直接在前端代码中写死了第三方 LLM 服务的凭证。

### 解决方案设计
1. **后端存储**：在 `system_config` 表中新增 `default_ai_api_key` / `default_ai_base_url` / `default_ai_model` 三个配置项
2. **管理员接口**：新增 `/api/admin/agent/default-ai-config` GET/POST 端点供管理员读写配置
3. **公开接口**：新增 `/api/agent/default-ai-config` GET 端点供前端获取 base_url 和 model（不含 api_key）
4. **代理接口**：新增 `/api/agent/chat/default-proxy` POST 端点，后端从数据库读取 api_key 转发请求
5. **前端改造**：移除硬编码值，启动时从后端加载配置，默认使用"默认 AI 模式"

### 实施步骤
1. 后端 `constants.py` 新增 3 个配置键常量
2. 后端 `db.py` 新增 `_get_default_ai_config_sync()` 和 `_set_default_ai_config_sync()` 函数
3. 后端 `schemas.py` 新增 `DefaultAIConfigUpdateRequest` 请求模型
4. 后端 `routes.py` 新增 4 个端点（管理员读写 + 公开读取 + 代理聊天）
5. 前端 `agent.js` 新增 4 个 API 函数
6. 前端 `ChatPanelContent.vue` 移除硬编码，新增 `isDefaultAIMode` 状态和 `_loadDefaultAIConfig()` 函数

## 性能指标
- 无显著性能影响，仅增加一次启动时的 HTTP 请求（GET /api/agent/default-ai-config）

## 测试方案
1. 管理员通过 POST `/api/admin/agent/default-ai-config` 设置 api_key、base_url、model
2. 前端打开 AI 助手面板，验证自动加载为"🤖 默认 AI 模式"
3. 发送消息验证通过 `/api/agent/chat/default-proxy` 正常返回回复
4. 切换到"🛡️ 后端代理"模式验证切换正常
5. 切换到"🔑 个人 Key 模式"验证个人 Key 功能不受影响
6. 验证前端代码中不再包含任何硬编码的 API Key

## 修改的文件路径

### 后端
- `WebGIS_Dev/backend/api/agent_chat/constants.py` — 新增 3 个配置键常量
- `WebGIS_Dev/backend/api/agent_chat/db.py` — 新增默认 AI 配置读写函数
- `WebGIS_Dev/backend/api/agent_chat/schemas.py` — 新增 DefaultAIConfigUpdateRequest
- `WebGIS_Dev/backend/api/agent_chat/routes.py` — 新增 4 个 API 端点

### 前端
- `WebGIS_Dev/frontend/src/api/backend/agent.js` — 新增 4 个 API 函数
- `WebGIS_Dev/frontend/src/components/Chat/ChatPanelContent.vue` — 移除硬编码，新增默认 AI 模式支持
- `WebGIS_Dev/frontend/src/components/UserCenter/ApiKeysManagementPanel.vue` — 新增"默认 AI 专属配置"管理 UI（查看/编辑/保存 api_key、base_url、model）

## 新增 API 端点清单

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/admin/agent/default-ai-config` | 管理员 | 读取默认 AI 配置（含完整 api_key） |
| POST | `/api/admin/agent/default-ai-config` | 管理员 | 更新默认 AI 配置 |
| GET | `/api/agent/default-ai-config` | 公开 | 获取默认 AI 配置（不含 api_key） |
| POST | `/api/agent/chat/default-proxy` | 登录用户 | 使用管理员配置的 Key 代理聊天 |

## 数据库变更
- `system_config` 表新增 3 行配置项（通过现有 schema 自动创建，无需 migration）：
  - `default_ai_api_key` — 专属 API Key
  - `default_ai_base_url` — LLM 端点地址
  - `default_ai_model` — 默认模型名称