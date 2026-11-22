# 2026-11-22 AI 对话流式改造（default-proxy SSE）+ IP 定位缓存

- **日期与时间**：2026-11-22 11:20
- **任务等级**：L2（体验优化，V3.7.7 批次 E）
- **版本**：V3.7.7（归并批次 E）

## 问题分析

### 核心症状

用户实测 `/api/agent/chat/default-proxy` 单请求 26.65s（DevTools：Waiting for server response 26.14s，Content download 0.66ms）。

### 根因

1. **非流式（主因）**：`upstream.py` 的上游调用写死 `"stream": False`（有意设计——流式解析基建不存在，event-stream 会被 JSON 解析器误读导致 502 且计费已发生），整段回答生成完毕才返回第一个字节 → 26s ≈ 一次长回复的完整生成时间。
2. **前置 IP 定位（次因，最多 +8s）**：聊天前串行调高德 IP 定位注入位置上下文，且**无缓存**——同一 IP 每条消息重复外呼；超时上限 connect 3s + read 5s。
3. DevTools 的「Queued at 20.63s」是时间戳（页面加载后 20.6s 用户才发消息），非等待；Queueing 实际 0.5s 正常。

## 解决方案

**批次 E：流式改造 + IP 定位缓存**

1. **后端**：新增 `POST /api/agent/chat/default-proxy/stream`（SSE）——
   - `_stream_upstream_chat_events` 生成器（upstream.py）：key×端点候选轮换（首个 delta 产出前任一候选失败静默切换；产出后锁定，中途错误收束为 error 事件）；delta 转发（`{"type":"delta","delta":...}`）；tool_calls 流式增量按 index 拼装；终态 `final` 事件携带**与非流式响应结构一致的 rawData**（含拼装后 tool_calls）→ 前端工具链路零改动；终止帧 `data: [DONE]`。
   - 流式 read 超时按块间隔计（`max(timeout_seconds, 120)s`），避免长回复中途被掐断。
   - 客户端断开：StreamingResponse 生成器 CancelledError → finally 记录调用并关闭上游流。
2. **IP 定位缓存**：进程内 TTL 缓存（成功 600s / 失败 60s，超容淘汰最旧一半）——同一 IP 10 分钟内不重复外呼高德。
3. **前端**：
   - `agent.ts` 新增 `defaultProxyChatStream(payload, { onDelta, signal })`：fetch + ReadableStream SSE 消费器（鉴权/设备/页签头与 axios 实例对齐）。
   - `llmCall.ts`：`callLLM` 增加 `onDelta` / `signal` 参数——默认 AI 通道传入 onDelta 时走流式，返回结构与非流式完全一致（`rawData` 来自 final 事件，工具链路无感）。
   - `ChatPanelContent.ts`：第一轮对话渐进渲染（delta 直接写入响应式消息列表 + 自动滚动）；`stopGeneration` 接 AbortController 真正断开上游连接；第二轮工具后续回复保持非流式打字机。
4. 非流式端点 `/chat/default-proxy` 保留（兼容/其他调用方）。

## 修改内容

- `backend/api/agent_chat/upstream.py`：`_stream_extract_delta` / `_merge_stream_tool_calls` / `_assemble_stream_tool_calls` / `_sse_event` / `_stream_upstream_chat_events` + IP 定位 TTL 缓存。
- `backend/api/agent_chat/routes.py`：`POST /chat/default-proxy/stream`（StreamingResponse，finally 记录调用耗时）。
- `frontend/src/api/backend/agent.ts`：`defaultProxyChatStream` 消费器 + body 构造提取为 `buildDefaultProxyBody` 复用。
- `frontend/.../agentConfig/llmCall.ts`、`components/ChatPanelContent.ts`：流式接入与渐进渲染。

## 测试

| Agent 已执行 | 待用户实机验证 |
|---|---|
| 新增 `tests/test_agent_stream.py` 9 用例（delta 提取边界/工具调用多块拼装/多 index 排序/空增量跳过/SSE 帧格式与中文/IP 缓存 TTL）+ 相关域 99/99 全绿 | ① 生产环境 AI 对话：发送消息后**首字 2s 内出现**并逐字增长；② 工具指令（画图/定位等）对话 → 工具执行与结果回复正常（final rawData 工具链路无感）；③ 「停止生成」→ 立即断流、已出内容保留；④ DevTools：该请求变为 stream 长连接、TTFB < 3s |
| vue-tsc 0 错误；eslint（3 文件）0 problems；py_compile 全过；红线扫描零命中 | ⑤ 高德 IP 定位缓存：同 IP 第二条消息不再等待定位（服务端日志无重复高德外呼） |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/api/agent_chat/upstream.py` | 流式纯函数 + SSE 生成器 + IP 定位缓存 |
| `backend/api/agent_chat/routes.py` | `/chat/default-proxy/stream` 端点 |
| `backend/tests/test_agent_stream.py` | **新增** 9 单测 |
| `frontend/src/api/backend/agent.ts` | `defaultProxyChatStream` + `buildDefaultProxyBody` 复用 |
| `frontend/.../agentConfig/llmCall.ts` | onDelta/signal 流式分支 |
| `frontend/.../ChatPanelContent.ts` | 渐进渲染 + 中止 + 展示路径分流 |
| `Docs/LLM_record/26-11/2026-11-21/2026-11-22-agent-streaming.md` | 本日志 |

## 遗留与风险

1. 个人 Key（`/chat/proxy`）与后端代理（`/chat/completions`）两通道仍为非流式——流式消费器已具备，后续按需扩展（同模式）。
2. 工具调用流式拼装按 OpenAI 兼容格式实现；若上游 delta 格式非标（阿里云 MaaS 兼容层实测兼容），拼装结果为空 → 工具链路回落意图正则兜底（既有机制）。
3. 流式期间模型侧计费照常（与所有流式实现一致）；客户端中止后上游流随即关闭。

## P0 修复（2026-11-22 实机反馈）：工具调用以气泡展示而永不执行

**现象**：「切换为3d视图/2d视图」→ AI 回复只显示 `tool_call` 气泡（`{"name":"set_map_view","arguments":{...}}`），工具不执行。

**根因**：批次 E 的 final 事件 rawData 误用**原始上游 choices 形状**且无中生有携带空 `tool_calls: []` 数组。前端 `AgentExecutor.extractToolCalls` 的双模式契约——模式 1（原生 `tool_calls` 数组非空）→ 模式 2（`reply` 中 ```tool_call 文本块降级解析）——空数组是 truthy，走模式 1 拿到空 → **文本协议降级解析永不触发**。而系统提示词 instructs 模型可用文本协议返回工具调用，模型确实以文本块回复了。

**修复**：final 组装改为与非流式**同一提取器** `_extract_reply_and_tools` 归一化——`tool_calls` 仅在有值时存在（真实上游形状）、`reply` 为提取后文本、携带 usage；`rawData` 与非流式 `data` 逐字段一致，前端工具链路（原生 + 文本降级）双模式全恢复。

**验证**：回归单测（文本协议块 → tool_calls=None 且 reply 保留块文本 / 原生调用 → 归一化输出）+ 相关域 107/108 全绿。
