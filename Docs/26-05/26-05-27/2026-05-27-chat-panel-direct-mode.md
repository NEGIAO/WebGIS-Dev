# 2026-05-27 ChatPanel 前端直连 LLM 模式

- **日期和时间**：2026-05-27 11:24（更新）
- **版本**：V3.1.3

---

## 修改内容

为 `ChatPanelContent.vue` AI 助手面板新增**前端直连 LLM** 模式，支持用户在前端直接配置 API Key、Base URL、Model 等参数，绕过后端代理直接调用 LLM 服务。

### 核心变更

1. **新增前端直连模式（Direct Mode）**
   - 用户填写个人 API Key + Base URL 后自动切换为直连模式
   - 直连模式下消息从前端直接发送到 LLM 端点（OpenAI 兼容格式）
   - 不再经过后端代理转发
   - API Key 仅保存在前端内存中（刷新页面后需重新输入）

2. **保留后端代理模式（Proxy Mode）**
   - 用户未配置个人 API Key 时，自动使用管理员配置的后端代理
   - 保持原有的配额管理、鉴权等后端功能
   - 非敏感配置参数始终同步到后端以保持跨设备一致性

3. **UI 增强**
   - 服务状态区域新增"路由模式"指示（直连/代理）
   - 模型选择改为 `input + datalist`（支持自由输入模型名称）
   - 直连模式下额度显示为"无限制（使用个人 Key）"
   - 更新配置面板提示文案，明确说明两种模式区别

4. **新增函数**
   - `callDirectLLM()` — 前端直接调用 OpenAI 兼容 API，支持 AbortController 超时控制
   - `fetchDirectModels()` — 前端直接获取上游模型列表（含 `/models` 和 `/v1/models` 回退）
   - `buildSystemPrompt()` — 构建带位置上下文的系统提示词
   - `isDirectMode` computed — 判断当前是否处于直连模式
   - `toggleRoutingMode()` — 一键切换直连/代理模式，自动同步默认配置
   - `syncDraftFromDirectConfig()` — 将直连配置同步到配置面板

5. **默认直连配置**
   - Base URL: `https://token-plan-cn.xiaomimimo.com/anthropic`
   - API Key: `tp-cs24lphikpjnqg0kkctxl167xhnkv4writnf46j3cv4y0nsw`
   - Model: `mimo-v2.5-pro`
   - 用户启动时即默认为直连模式，可一键切换为后端代理

6. **UI 增强（新增）**
   - 路由模式改为可点击的切换按钮（蓝色=直连 / 紫色=代理）
   - 模型名后增加"直连"/"代理"标签
   - Max Tokens 上限从 8192 提升到 128000（用户可自由控制输出长度）
   - 默认 Max Tokens 从 512 提升到 8192（不再默认节省 token）

---

## 修改原因

用户反馈：后端代理模式虽然安全（API Key 不暴露），但存在以下限制：
1. 所有请求必须经过后端，增加了延迟和后端负载
2. 管理员配置的 API Key 是共享的，用户配额有限
3. 用户希望能使用自己的 LLM 账号，获得无限额度
4. 部分 LLM 服务商（如 OpenAI）支持浏览器 CORS 直连，无需中转

因此新增直连模式：用户填写自己的 API Key → 前端直接调用 LLM，不经后端。两种模式并存，用户可自由选择。

---

## 影响范围

- **前端组件**：`ChatPanelContent.vue`（AI 助手面板）
- **通信链路**：新增前端 → LLM API 直连路径（绕过后端）
- **安全性**：API Key 仅存在前端内存，不持久化，不发送到后端
- **后端**：无变更，后端代理模式完全不受影响
- **兼容性**：无破坏性变更，现有后端代理功能保持不变

---

## 优化解决方案

### 问题分析链条

```
用户需求：使用个人 API Key → 不经后端 → 前端直连 LLM
   ↓
核心判断：用户是否填写了 API Key + Base URL
   ↓
是 → Direct Mode: callDirectLLM() 直接 fetch → LLM API
否 → Proxy Mode: apiAgentChatCompletions() → 后端代理 → LLM API
```

### 安全设计

1. API Key 仅存 `ref()` 内存，不存 localStorage/sessionStorage
2. `saveUserConfig()` 时 API Key 不发送到后端（后端仅接收非敏感字段）
3. 页面刷新后直连配置自动清除，需重新输入
4. CORS 错误时提供友好提示，引导用户切换为代理模式

### 模型选择改进

- 原方案：`<select>` 下拉选择（受限于后端返回的模型列表）
- 新方案：`<input> + <datalist>`（支持自由输入 + 下拉建议）
- 用户可手动输入任意模型名称，不受列表限制

---

## 测试方案

1. **直连模式测试**：
   - 填写有效的 API Key + Base URL → 发送消息 → 验证直连调用成功
   - 不填 API Key → 验证自动切换为后端代理模式
   - 填写错误的 Base URL → 验证错误提示包含 CORS 相关说明

2. **代理模式测试**：
   - 不填写 API Key → 发送消息 → 验证走后端代理
   - 验证配额更新、状态显示正常

3. **模式切换测试**：
   - 先填 API Key → 保存 → 清除 Key → 验证切换回代理模式
   - 验证"恢复平台默认参数"按钮同时清除直连配置

4. **模型列表测试**：
   - 直连模式下刷新模型列表 → 验证直接从上游获取
   - 代理模式下刷新模型列表 → 验证通过后端获取
   - 手动输入模型名称 → 验证可正常发送

---

## 修改的文件路径

- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\ChatPanelContent.vue` — AI 助手面板（主要修改）