# 2026-11-22 思考内容流式透传与展示（DeepSeek 式思考块）+ max_tokens 默认值上调

- **日期与时间**：2026-11-22 17:25 前后（实施中补记）
- **任务等级**：L2（功能开发）
- **版本**：V3.7.8（曾用号 V3.7.15，按用户「整合为一个统一的版本：V3.7.8」指令归并，见 CHANGELOG 归并注）

## 问题分析

### 核心症状（用户反馈）

V3.7.14 修复了思考型模型零正文的报错文案，但：① 思考内容完全不展示（用户只看到「请求失败」或空等）；② 默认 max_tokens 对思考型模型偏小（思考 + 正文共享预算）。主流 AI 前端（DeepSeek 网页版 / ChatGPT o 系列 / 通义）的做法是：**思考过程实时流式展示（自动展开），完成后自动折叠为可点开的「思考过程」块**。

### 根本原因

后端流式生成器检测到 `delta.reasoning_content` 后仅计数丢弃（V3.7.14 诊断用途），未透传前端；前端也无对应渲染通道。

### 受影响模块

`backend/api/agent_chat/upstream.py`（流式生成器）、`frontend/src/api/backend/agent.ts`（SSE 消费器）、`agentConfig/llmCall.ts`（参数透传）、`components/ChatPanelContent.ts`（消息编排）、`components/ChatMessageList.vue`（渲染）、`composables/agentConfig/configState.ts` + `personalConfig.ts` + `backend/constants.py`（max_tokens 默认值）。

### 解决方案

1. **后端**：新增 `_stream_extract_reasoning(chunk)`（兼容 `reasoning_content` / `reasoning` 两种字段名）；流循环中 reasoning 增量以新 SSE 事件 `{"type":"reasoning","delta":...}` 透传；累积 `reasoning_parts` 并在 final 事件携带完整 `"reasoning"` 文本（前端落定一致性的权威源）。
2. **前端消费**：`agentChatStream` 解析 reasoning 事件 → `handlers.onReasoning?.(accumulated)`；返回值带 `reasoning`。
3. **消息编排**：`pushAssistant` 初始化 `reasoning` 字段；`onReasoning` 增量写入 `msg.reasoning`。
4. **渲染**：复用既有 `think-panel` 折叠块（`<details>` 原生交互 + 既有样式）——新增 `msg.reasoning` 优先分支；`:open="!msg.content"` 实现「思考中自动展开 → 正文到达自动折叠 → 用户可手动点开」（正文流式期间手动展开会被后续重渲染收起，属已知小瑕疵）。
5. **max_tokens 上调**：后端 `DEFAULT_AGENT_MAX_TOKENS` 32768→65536、上限 32768→131072（思考型模型思考+正文共享预算）；前端 configState/personalConfig 默认 32768→65536。**管理面 DB 已存的小值仍会覆盖代码默认——需在管理面板手动更新一次**。

## 修改内容

1. `backend/api/agent_chat/upstream.py`：`_stream_extract_reasoning`（reasoning_content/reasoning 双字段名）；流循环 reasoning 增量 → `{"type":"reasoning","delta"}` SSE 事件；`reasoning_parts` 累积 + final 事件携带权威 `reasoning` 文本；新增 `emitted_any` 门控（思考或正文流出即锁定候选——轮换/重试会使已流出内容重复）。
2. `frontend/src/api/backend/agent.ts`：`agentChatStream` 解析 reasoning 事件 → `handlers.onReasoning?.(accumulated)`；final 覆盖增量；返回值带 `reasoning`；4 处 handler 签名补 `onReasoning`。
3. `frontend/.../agentConfig/llmCall.ts`：callLLM 参数 `onReasoning` + 三通道流式调用透传。
4. `frontend/.../components/ChatPanelContent.ts`：两轮流式消息初始化 `reasoning` 字段；onReasoning 增量写入 `msg.reasoning`。
5. `frontend/.../components/ChatMessageList.vue`：think-panel 新增 `msg.reasoning` 优先分支（renderAnswer 渲染）；`:open="!msg.content"`（思考中强制展开、正文到达移除绑定自动折叠）；`thinking-now` 呼吸动画样式（复用 breathe keyframes）。
6. `backend/api/agent_chat/constants.py`：`DEFAULT_AGENT_MAX_TOKENS` 32768→65536、maximum→131072；`configState.ts`/`personalConfig.ts` 默认同步 65536。
   **补（用户实测发现，两轮）**：第一轮补 schemas.py 4 处 `le=32768`→131072（422 实报）+ 两处输入框 max 对齐；第二轮再补 **db.py 写入侧 3 处 `_safe_parse_int(..., 32768)`**（用户配置合并 / provider 读取 / 管理面 upsert——保存 65536 成功但被静默压回 32768，正是「成功 toast + 数值回跳」的真凶）+ **config catalog 登记默认** 32768→65536。max_tokens 预算链 8 处限制全部对齐 131072/65536。
7. **配置面板补 Extra Body 高级字段**（用户指出缺口：思考行为的上游开关没有配置入口）——判断机制为协议级自适应（逐 chunk 检测 reasoning_content/reasoning 字段，非模型名白名单），自备端点/模型天然覆盖；但思考行为的「开关」参数因上游而异（qwen 系 `enable_thinking`、deepseek `thinking` 等），通用代码不能写死 → 在配置面板（个人 Key 段）暴露 `extra_body` JSON 编辑框（保存时校验非法 JSON 并提示），用户可对自备端点注入思考开关及任意上游特定参数。`ChatConfigPanel.vue/.ts` + `personalConfig.ts` 保存校验 + locale 双语键。

## 影响范围

- 三通道流式对话的思考型模型体验；非流式端点不透传思考（兼容层，后续可选）。
- 消息持久化：`msg.reasoning` 随会话写入 localStorage（思考文本可达数 KB/条——长会话下注意 localStorage 配额，schedulePersist 既有机制不变）。
- 历史消息兼容：旧消息无 reasoning 字段 → think-panel 走 `<think>` 文本协议兼容分支，互不影响。

## 性能指标

不适用（每思考 chunk 增加一次字符串提取 + 一个 SSE 事件帧，零开销级）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| 流式域 pytest **22/22**（新增 reasoning 双字段提取 / 事件流顺序 / final 权威回传 3 例）；全量 127 passed；vue-tsc/eslint 0 问题；结构树/配置登记门禁通过；表格 3 行 ✓ | ① 用思考型模型（qwen4-max/deepseek-v4.1）对话：「思考过程」块实时流式增长（自动展开）→ 正文到达自动折叠 → 点开可回看全文；② 默认 AI 模式正常对话无回归；③ 管理面板确认 max_tokens 显示 65536（若仍显示旧小值——DB 已存值需手动改一次） |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/api/agent_chat/upstream.py` | reasoning 提取/事件透传/final 回传/emitted_any 门控 |
| `backend/api/agent_chat/constants.py` | max_tokens 默认与上限上调 |
| `frontend/src/api/backend/agent.ts` | reasoning 事件消费 + onReasoning + 返回值 |
| `frontend/.../agentConfig/llmCall.ts` | onReasoning 三通道透传 |
| `frontend/.../agentConfig/configState.ts`、`personalConfig.ts` | 默认 65536 |
| `frontend/.../components/ChatPanelContent.ts` | 两轮流式 reasoning 接线 |
| `frontend/.../components/ChatMessageList.vue` | think-panel reasoning 分支 + 样式 |
| `README.md` / `Docs/Guide/CHANGELOG.md` / 本日志 | 版本三处 + 条目 + 记录 |

## 遗留与风险

1. 正文流式期间手动展开思考块会被后续 delta 重渲染收起（`:open` 绑定所致）——低频场景，记录为已知小瑕疵。
2. `msg.reasoning` 随会话持久化，超长思考会占用 localStorage 配额——后续可做持久化裁剪（超长截断），本轮不做。
3. 非流式端点不透传 reasoning（兼容层）——如需非流式也展示，后续在 `_extract_reply_and_tools`/routes 补一个字段即可。
4. max_tokens 上调至 65536 会按 usage 折算扣费——配额消耗速度相应加快（按实际 usage 计费，公平性不变）。
