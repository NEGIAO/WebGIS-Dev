# 2026-11-22 三通道全量流式改造（个人 Key / 后端代理）

- **日期与时间**：2026-11-22 11:50
- **任务等级**：L2（V3.7.7 批次 F，批次 E 的续作）
- **版本**：V3.7.7（归并批次 F）

## 问题分析

### 核心症状

批次 E 只给默认 AI 通道（`/chat/default-proxy/stream`）做了流式；**个人 Key（`/chat/proxy`）与后端代理（`/chat/completions`）两通道仍为非流式**——用户切换到这两个模式时依然整段等待（20-30s 级）。

### 根本原因

流式消费器（前端 fetch SSE 解析）与后端生成器（`_stream_upstream_chat_events`）在批次 E 已具备，但三个通道的 setup/配额语义不同，未逐一接入。

### 受影响模块

`backend/api/agent_chat/routes.py`、`api/agent_chat/upstream.py`（usage 透传）、`frontend/src/api/backend/agent.ts`、`agentConfig/llmCall.ts`、`ChatPanelContent.ts`。

## 解决方案

1. **`/chat/proxy/stream`**（个人 Key）：镜像 `/chat/proxy` setup（400 校验 / 位置缓存 / system_prompt 合并），单 key 流式转发；**不消耗平台配额**（自备 Key 语义不变）。
2. **`/chat/completions/stream`**（后端代理）：镜像 `/chat/completions` 全部语义——**配额预检 429 在建连前**（remaining ≤ 0 拒绝）；**扣费在流正常结束后**按 `final` 事件携带的实际 usage 折算（`agent_cost = max(1, ceil(total_tokens / tokens_per_unit))`，缺失按最低 1 额度）；`model_source` / `api_key_source` 随 final 下发。
3. **upstream 生成器增强**：流式 chunk 中的 `usage`（`[DONE]` 前最后一块通常携带）累积进 `final` 事件，使流式扣费与非流式口径对齐。
4. **前端泛化**：`defaultProxyChatStream` 的 fetch/解析逻辑泛化为私有 `agentChatStream(path, body, handlers)`（final 事件捕获 quota/cost）；三个通道各一个薄委托函数；`llmCall` 三分支在传入 `onDelta` 时全部走流式；`ChatPanelContent` 第二轮（工具后续回复）同样渐进渲染。

非流式端点全部保留（兼容层）。

## 修改内容

- `backend/api/agent_chat/upstream.py`：`usage_acc` 累积 → `final` 事件携带 `usage`。
- `backend/api/agent_chat/routes.py`：`/chat/proxy/stream` + `/chat/completions/stream` 两端点（imports 增 `_sse_event`）。
- `frontend/src/api/backend/agent.ts`：`agentChatStream` 泛化（final 捕获 quota/cost）+ 三通道薄委托 + proxy/completions body 构造提取（`buildAgentProxyBody` / `buildAgentCompletionsBody`）。
- `frontend/.../agentConfig/llmCall.ts`：三通道 onDelta/signal 接线。
- `frontend/.../ChatPanelContent.ts`：第二轮流式渐进渲染（占位先建、delta 直写、streamed 落定跳过打字机）。

## 影响范围

三种 Agent 模式（默认 AI / 个人 Key / 后端代理）的聊天体验；配额语义与非流式完全一致（预检 429 / 成功后扣费 / 最低 1 额度封底）；工具调用流式拼装（批次 E）覆盖全部通道。

## 性能指标

未实测。预期：三通道首字延迟从「完整生成时间（20-30s）」降至「上游首 token 时间（约 1-3s）」。

## 测试

| Agent 已执行 | 待用户实机验证 |
|---|---|
| 相关域 pytest **105/106**（唯一失败 = 本机缺 pytest-asyncio 的既有环境项）；py_compile 全过；vue-tsc 0；eslint（3 文件）0；结构树 739/739；配置登记 ✅；红线零命中 | ① 三种模式分别对话：首字秒回、逐字增长；② 后端代理模式：回答结束后额度数字按 usage 折算扣减（与非流式一致）；③ 任意模式点「停止生成」→ 断流且已出内容保留；④ 工具指令对话（画图/定位）三模式均正常（final rawData 工具链路无感）；⑤ 停止后立即再发消息无串扰 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/api/agent_chat/upstream.py` | final 事件携带 usage |
| `backend/api/agent_chat/routes.py` | `/chat/proxy/stream` + `/chat/completions/stream` |
| `frontend/src/api/backend/agent.ts` | `agentChatStream` 泛化 + 三通道委托 + body 构造提取 |
| `frontend/.../agentConfig/llmCall.ts` | 三通道流式接线 |
| `frontend/.../ChatPanelContent.ts` | 第二轮流式渐进渲染 |
| `Docs/LLM_record/26-11/2026-11-21/2026-11-22-agent-streaming-all-channels.md` | 本日志 |

## 遗留与风险

1. 流式扣费依赖上游 final chunk 携带 usage——实测阿里云 MaaS 兼容层支持；不支持的上游按最低 1 额度扣（与非流式封底一致）。
2. 客户端中止后，上游已完成的部分生成仍计费（所有流式实现通例）；配额扣减按服务端实际收到的 usage 计算 ✓ 公平。
3. `stream_options: {"include_usage": true}` 未主动下发（部分上游会拒绝整个请求）；依赖上游默认行为，若实测某上游缺 usage，属「最低 1 额度」兜底而非错误。

## Code Review 修正（2026-11-22 暂存区复审）

**发现（P1）**：`agentChatStream` 的 fetch headers 缺 `X-Guest-Token`——游客使用 AI 对话时，流式请求的身份回落 `H(末跳IP|UA)` 派生桶，而其余 axios 请求走签名 token 身份 → 同一游客裂成两个 presence（在线计数 +1）且配额桶分裂。修复：headers 接入 `getGuestToken()`（guestTokenStore 叶子模块，无循环依赖）。此发现同时解释了在线计数问题的一个真实成因类别——**流式对话是主要交互路径，每次游客对话都会注入一个派生桶身份**。

**验证**：eslint/tsc 0 问题；相关域 99/99 全绿。
