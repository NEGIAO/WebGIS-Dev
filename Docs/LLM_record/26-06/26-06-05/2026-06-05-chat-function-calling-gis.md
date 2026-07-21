# Chat + GIS Function Calling 架构实现

- **日期和时间**：2026-06-05 14:30（初版） / 15:30（前端修复） / 16:00（后端支持） / 16:45（Code Review 修复）
- **版本**：3.0.x（功能新增 + Bug 修复）

---

## 📋 修改内容

为 Chat AI 助手新增 Function Calling（工具调用）架构，使 Agent 能够通过自然语言调用 GIS 地图操作功能，包括：

1. **GISCommander.js** — GIS 功能封装库（缩放至范围、搜索地名定位、切换底图）
2. **agentToolsSchema.js** — Function Calling 工具声明配置（OpenAI 格式）
3. **AgentExecutor.js** — Agent 响应拦截与执行路由（双模式：原生 + 降级）
4. **useChatStore.ts** — Chat 工具调用状态管理（Pinia Store）
5. **agent.js** — API 层扩展支持 `tools`/`tool_choice` 参数
6. **ChatPanelContent.vue** — 集成完整工具调用流程与 UI 展示

---

## 🔍 问题分析

### 核心症状
当前 Chat 面板仅支持纯文本对话，Agent 无法操控地图。用户需要手动操作地图控件完成缩放、搜索、底图切换等高频操作。

### 根本原因
- 缺少 GIS 功能的标准化封装层（Agent 无法直接调用 OpenLayers API）
- 缺少 Function Calling 的工具声明 Schema（LLM 不知道有哪些工具可用）
- 缺少响应拦截与执行路由（Agent 返回的 tool_calls 无法被前端识别和执行）

### 受影响模块
- `ChatPanelContent.vue` — 消息发送与响应处理流程
- `agent.js` — API 调用参数
- 地图交互层（新增）

---

## 🛠️ 优化解决方案

### 架构设计

```
用户输入 → ChatPanelContent → 后端 API（携带 tools schema）
                                    ↓
                              LLM 返回 tool_calls
                                    ↓
                              AgentExecutor 解析 tool_calls
                                    ↓
                              GISCommander 执行地图操作
                                    ↓
                              执行结果回传 LLM → 最终回复用户
```

### 双模式架构

| 模式 | 触发条件 | 工具调用检测 | 适用场景 |
|------|---------|-------------|---------|
| 原生模式 | 响应包含 `tool_calls` 字段 | 直接解析 | 后端支持 Function Calling |
| 降级模式 | 响应仅含 `reply` 文本 | 解析 `tool_call JSON 块` | 后端暂不支持 |

两种模式共享同一套 GISCommander 执行层和 UI 层，切换对上层透明。

### 工具清单

| 工具名称 | 功能 | 参数 |
|---------|------|------|
| `zoom_to_extent` | 缩放到指定范围 | `bbox: [minLng, minLat, maxLng, maxLat]` |
| `search_and_zoom` | 搜索地名并定位 | `query, city?, zoom?` |
| `switch_basemap` | 切换底图 | `url, name?`。仅允许 HTTPS XYZ URL，统一走 `custom` 底图并同步为 `l=1` |

---

## 📁 修改的文件路径

### 新建文件
| 文件 | 职责 |
|------|------|
| `frontend/src/composables/map/GISCommander.js` | GIS 功能封装库（工厂函数 + 依赖注入） |
| `frontend/src/constants/agentToolsSchema.js` | Function Calling 工具声明 + 系统提示词构建 |
| `frontend/src/services/agent/AgentExecutor.js` | Agent 响应拦截与工具调用执行路由 |
| `frontend/src/stores/useChatStore.ts` | Chat 工具调用状态管理 |

### 修改文件
| 文件 | 改动 |
|------|------|
| `frontend/src/api/backend/agent.js` | 三个 chat 函数增加 `tools`/`tool_choice` 参数支持 |
| `frontend/src/components/Chat/ChatPanelContent.vue` | 集成 GISCommander/AgentExecutor，修改 sendMessage 支持工具调用，新增工具状态 UI |
| `frontend/README.md` | 更新文件结构树（+4 个新文件） |
| `README.md`（根） | 更新文件结构树（+4 个新文件） |

---

## 🧪 测试方案

### 功能测试用例

1. **搜索定位**：输入"帮我定位到北京大学" → 验证 `search_and_zoom` 被调用，地图缩放到北大
2. **底图切换**：输入"切换到 Google 卫星地图" → 验证 `switch_basemap(url="https://...{x}...{y}...{z}")` 被调用，底图切到 `custom`，URL 参数为 `l=1`
3. **范围缩放**：输入"显示郑州市的范围" → 验证 `search_and_zoom` + `zoom_to_extent` 组合调用
4. **自定义图源**：输入"加载这个图源 https://tile.example.com/{z}/{x}/{y}.png" → 验证自定义 XYZ 加载并同步为 `l=1`

### 错误处理测试

- 传入无效地名 → 应返回友好的"未找到"提示
- 传入无效 bbox → 应返回参数校验错误
- 地图未就绪时调用 → 应返回"地图实例未就绪"

### UI 验证

- 工具执行中显示 🔧 图标 + 工具名称
- 执行成功显示 ✅ 图标 + 结果摘要
- 执行失败显示 ❌ 图标 + 错误信息

---

## 📊 性能指标

- 工具调用执行延迟：< 100ms（本地地图操作，不含网络请求）
- 搜索定位延迟：取决于地理编码 API 响应时间（通常 200-500ms）
- 系统提示词大小：约 1.5KB（含工具说明和常用 HTTPS XYZ URL）

---

## ⚠️ 后续待办

1. **后端扩展**：后端 chat proxy 需支持 `tools` 参数透传给 LLM API，返回结构化 `tool_calls`
2. **更多工具**：可扩展图层管理、空间分析、数据导出等工具
3. **流式响应**：支持 SSE 流式返回工具调用结果
4. **工具调用历史**：在 Chat Store 中持久化工具调用记录

---

## 🔧 Bug 修复记录（2026-06-05 15:30）

### 问题描述
Agent 回复了文字，但地图没有任何操作。工具调用链路完全不工作。

### 根本原因分析
**系统提示词从未送达 LLM**：
- `apiAgentChatDefaultProxy` 和 `apiAgentChatCompletions` 没有 `system_prompt` 参数
- LLM 不知道有工具可用，所以不会输出 `tool_call` JSON 块
- 前端检测不到 tool_calls，整条链路断裂

### 修复内容

1. **系统提示词注入**：新增 `_injectToolPromptIntoHistory()` 函数，将工具说明作为 `system` 角色消息注入历史记录，确保所有模式下 LLM 都能感知工具

2. **三级工具调用策略**：
   - 策略 1：原生 Function Calling（后端返回 `tool_calls` 字段）
   - 策略 2：降级文本解析（LLM 输出 `tool_call` JSON 块）
   - 策略 3：**关键词意图检测**（`_detectGISIntent`，最终防线）

3. **增强文本解析鲁棒性**：`parseToolCallsFromText` 支持多种格式：
   - `tool_call` 代码块
   - `json` 代码块
   - 裸 JSON 对象

4. **ESLint 修复**：
   - `GISCommander.js`：移除未使用的 `inject` 导入
   - `ChatPanelContent.vue`：修复未使用的 `name` 参数，移除重复的 `watch` 导入

5. **逻辑优化**：
   - 提取 `_executeToolsAndUpdateUI()` 辅助函数，减少 sendMessage 嵌套
   - 合并用户自定义 system_prompt 与工具说明（direct mode）
   - 第二轮 LLM 调用不再传空 message，改用历史中的完整上下文

---

## 🔧 后端 Function Calling 支持（2026-06-05 16:00）

### 问题描述
前端已实现工具调用架构，但后端不支持 `tools` 参数透传，LLM 无法返回 `tool_calls`。

### 修改文件

| 文件 | 改动 |
|------|------|
| `backend/api/agent_chat/schemas.py` | `AgentChatRequest` 和 `AgentChatProxyRequest` 增加 `tools`/`tool_choice` 字段；`AgentChatHistoryItem.role` 支持 `system`/`tool` 角色；`max_items` 从 12→20；`content` 长度从 2000→8000；`system_prompt` 长度从 2000→8000 |
| `backend/api/agent_chat/upstream.py` | `_call_upstream_chat()` 增加 `tools`/`tool_choice` 参数并透传到上游 LLM API；新增 `_extract_tool_calls()` 和 `_extract_reply_and_tools()` 函数；`_sanitize_history()` 允许 `system`/`tool` 角色 |
| `backend/api/agent_chat/routes.py` | 三个 chat 端点传递 `tools`/`tool_choice` 到 `_call_upstream_chat()`；响应中包含 `tool_calls` 字段；有 tool_calls 时 reply 允许为空 |
| `frontend/src/api/backend/agent.js` | `normalizeChatHistory` 允许 `system` 角色消息通过（之前被过滤掉） |

### 端到端链路（修复后）

```
用户输入 "定位到北京大学"
  → 前端 sendMessage()
  → _callLLMAPI()
    → 构建 enhancedHistory（注入 system 角色的工具提示词）
    → 调用 apiAgentChatDefaultProxy({tools: AGENT_TOOLS, history: enhancedHistory})
  → 后端 /api/agent/chat/default-proxy
    → _sanitize_history() 保留 system 角色消息 ✅
    → 构建 request_messages: [backend_system_prompt, tool_instructions, ...history, user_msg]
    → _call_upstream_chat(..., tools=payload.tools, tool_choice="auto")
    → 上游 LLM API 收到 tools 参数，返回 tool_calls ✅
    → _extract_reply_and_tools() 提取 reply + tool_calls
    → 响应: {reply: "...", tool_calls: [...]}
  → 前端 AgentExecutor.extractToolCalls() 检测到 tool_calls
  → GISCommander.searchAndZoom({query: "北京大学"})
  → 地图缩放到北京大学 ✅
  → 第二轮 LLM 调用获取自然语言回复
  → 用户看到 "已定位到北京大学" + 地图变化 ✅
```

---

## 🔍 Code Review 修复（2026-06-05 16:45）

全面审查暂存区代码，发现并修复以下问题：

### 后端修复

| 严重度 | 问题 | 修复 |
|-------|------|------|
| **严重** | `_sanitize_history` 保留 system 角色导致重复 system 消息 | 移除 system 角色支持，由后端统一管理 system prompt |
| **严重** | `_extract_tool_calls` 空 id/name 透传给前端 | 增加校验，空 id 或 name 时跳过并记录 warning |
| **严重** | Schema 缺少 `tool_call_id` 字段，tool 消息无法关联 | `AgentChatHistoryItem` 增加可选 `tool_call_id` 字段 |
| **严重** | `content` min_length=1 阻止空 tool 结果 | 改为 `min_length=0`，tool 角色允许空内容 |
| **中等** | `tool_choice` 只支持 string，不支持 object 格式 | 改为 `Union[str, Dict]` |

### 前端修复

| 严重度 | 问题 | 修复 |
|-------|------|------|
| **严重** | `_injectToolPromptIntoHistory` 用 system 角色，被后端过滤 | 改为 user 角色 + `[系统指令]` 前缀 |
| **严重** | `normalizeChatHistory` 允许 system 角色通过（已不需要） | 恢复为只允许 user/assistant |
| **中等** | Agent 曾暴露底图列表查询工具，导致切换底图时误走列表查询 | 删除该工具；所有底图切换统一传入 HTTPS XYZ URL 并走 `custom`（`l=1`） |
| **中等** | 第二轮 LLM 调用 message 传空字符串 | 改为传有意义的提示文本 |
| **中等** | `_detectGISIntent` 中 "看看" 重复 | 移除重复项 |
| **中等** | basemapMapping key 大小写不一致 | 统一用 `.toLowerCase()` 比较 |
| **轻微** | `stripToolCallBlocks` 不处理裸 JSON | 增加裸 JSON 正则清理 |
| **轻微** | `executeToolCalls` 错误回退丢失 tool name | 通过 idx 关联原始 toolCall |
