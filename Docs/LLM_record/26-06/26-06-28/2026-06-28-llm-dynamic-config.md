# 2026-06-28 LLM 参数动态配置管理（管理员后台）

## 修改内容
新增管理员控制台 LLM 参数配置面板 (`AdminControlPanel.vue`)，支持动态修改后端运行时读取的 Agent 对话参数，修改后**无需重启服务即时生效**。

## 修改原因
之前的 LLM 参数（temperature、top_p、max_tokens、extra_body 等）硬编码在前后端代码中，每次修改都需要改代码、重新部署，非常不灵活。现在将所有参数存储在数据库 `system_config` 表中，后端运行时动态读取，前端管理员界面可实时修改，实现配置与代码分离。

## 影响范围
- **前端**：`AdminControlPanel.vue`、`ApiKeysManagementPanel.vue`、`ChatPanelContent.vue`
- **后端**：`agent_chat/constants.py`、`agent_chat/db.py`、`agent_chat/routes.py`、`agent_chat/schemas.py`
- **数据库**：`system_config` 表新增配置键

## 优化解决方案

### 1. 后端动态配置架构
- **配置存储**：所有 LLM 参数存储在 `system_config` 表，键名为 `agent_*` 前缀
- **运行时读取**：`_get_agent_provider_config_sync()` 从数据库实时读取配置
- **配置持久化**：`_set_agent_provider_config_sync()` 管理员更新配置写入数据库
- **默认值回退**：数据库无配置时回退到环境变量，再回退到代码常量

### 2. 前端管理员配置面板
新增 `AdminControlPanel.vue` 中的「LLM 对话参数配置」卡片，包含：
- Base URL、Model、Available Models 列表
- Timeout、Max Tokens、Temperature、Top P
- Extra Body (JSON)、System Prompt
- Stream 开关、Guest/Registered 每日额度

### 3. 前后端参数一致性
- **Temperature = 1.0**（标准值，非 0.2）
- **Top P = 0.95**（标准值）
- **Max Tokens = 16384**（标准值）
- **Extra Body**：包含 `chat_template_kwargs.enable_thinking=true` 和 `reasoning_budget=16384`
- 所有默认值在 `constants.py`、`ApiKeysManagementPanel.vue`、`ChatPanelContent.vue` 中保持一致

### 4. API 端点
- `GET /api/admin/agent/config` - 管理员读取平台级配置
- `POST /api/admin/agent/config` - 管理员更新平台级配置

## 测试方案
1. 启动前后端服务
2. 以管理员身份登录，打开用户中心 → 管理员控制台
3. 修改 Temperature 为 0.7、Top P 为 0.9、Max Tokens 为 8192
4. 点击「保存 LLM 参数」
5. 打开 AI 助手面板，发送测试消息
6. 观察后端日志确认使用了新参数
7. 重启后端服务，验证配置持久化生效

## 修改的文件路径

### 前端
- `frontend/src/components/UserCenter/AdminControlPanel.vue` - 新增 LLM 配置面板（完整实现）
- `frontend/src/components/UserCenter/ApiKeysManagementPanel.vue` - 默认参数对齐后端
- `frontend/src/components/Chat/ChatPanelContent.vue` - 运行时使用动态配置（已有代码，无需修改）

### 后端
- `backend/api/agent_chat/constants.py` - 默认常量定义（已有，符合标准值）
- `backend/api/agent_chat/db.py` - 数据库读写逻辑（已有动态读取实现）
- `backend/api/agent_chat/routes.py` - Admin API 端点（已有实现）
- `backend/api/agent_chat/schemas.py` - 请求模型（已有实现）

### 文档
- `README.md` (根目录) - 版本演进记录
- `frontend/README.md` - 前端变更记录
- `backend/README.md` - 后端变更记录
- `Docs/26-06/26-06-28/2026-06-28-llm-dynamic-config.md` - 本维护日志

## 核心设计亮点
1. **配置与代码分离**：管理员可在 UI 界面修改所有参数，无需开发介入
2. **即时生效**：后端运行时每次请求都读取数据库，修改后下一次调用即生效
3. **前后端一致**：单一数据源，前端通过 API 获取配置，彻底消除硬编码不一致
4. **向后兼容**：数据库无配置时自动回退到环境变量/代码默认值，不影响现有部署
5. **类型安全**：前端输入验证、后端 Pydantic 模型验证、数据库约束三重保障