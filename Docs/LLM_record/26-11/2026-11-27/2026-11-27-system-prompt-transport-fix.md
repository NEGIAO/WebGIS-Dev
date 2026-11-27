# 2026-11-27 修复 System Prompt 传输缺口

> **日期**：2026-11-27 11:27–11:32
> **任务等级**：L2 常规开发（Bug 修复）
> **状态**：✅ 已完成
> **关联版本**：V3.7.29
> **来源**：V3.7.28 架构调查发现，TODO 已勾选

---

## 一、问题分析

### 核心症状

用户多次反馈 Agent 行为不符合提示词（如「分析当前范围风水」反问地点半径、不遵守能力边界）。V3.7.17–27 连续 11 个版本优化提示词，实机效果不稳定。

### 根本原因

V3.7.28 全面调查发现传输链路断裂：

| 环节 | 状态 |
|---|---|
| `llmCall.ts` 三通道传 `system_prompt` | ✅ :73（default）/ :106（personal）/ :129（completions） |
| 后端 `schemas.py` 声明字段 | ✅ 上限 16,000 字符 |
| 后端 6 端点读取并优先使用 | ✅ `payload.system_prompt or 默认值` |
| **前端 `agent.ts` body 序列化** | ❌ 3 个 builder 中 2 个遗漏 |

`buildDefaultProxyBody` 与 `buildAgentCompletionsBody` 未把 `system_prompt` 写入请求体，仅 `buildAgentProxyBody`（个人 Key 通道）包含。结果：默认 AI 与后端代理通道实际使用后端 `DEFAULT_AGENT_SYSTEM_PROMPT`（一句英文），前端组装的能力边界、按需注入的罗盘协议段、上下文约束**从未生效**。

这解释了为什么多轮提示词优化在实机上「改了没效果」——不是提示词写得不好，而是根本没送到模型。

### 受影响模块

| 模块 | 改动 |
|---|---|
| `frontend/src/api/backend/agent.ts` | 2 个 body builder 各补一行 |
| `Docs/TODO/bugfix-optimization-plan.md` | 条目勾选 |
| `Docs/Architecture/agent-capability-system.md` | 已知缺陷描述改为已修复 |
| README / CHANGELOG | 版本与概要 |

---

## 二、修复内容

在两个 body builder 的 `map_context` 处理之后、override 参数之前各插入：

```ts
if (payload.system_prompt) body.system_prompt = String(payload.system_prompt).trim();
```

与 `buildAgentProxyBody:417` 完全对齐，附注释说明旧版遗漏的后果。

**覆盖范围**：非流式与流式复用同一 builder，因此两行修复覆盖 6 条路径：
- default-proxy 非流式（:91）+ 流式（:216）
- proxy 非流式（:452）+ 流式（:227）
- completions 非流式（:372）+ 流式（:238）

后端零改动（6 端点已支持）。

---

## 三、验证结果

16 项全链路校验（临时脚本，已删）：

| 类别 | 项数 | 结果 |
|---|---:|---|
| 3 个 builder 写入 system_prompt | 3 | ✅ |
| 6 条路径复用 builder | 6 | ✅ |
| 后端 6 处读取 system_prompt | 1 | ✅ |
| 后端 schema 上限 16000 + 两请求模型声明 | 2 | ✅ |
| 3 个 builder 动态输出含完整 prompt | 3 | ✅ |
| 无 prompt 时字段缺省（向后兼容） | 1 | ✅ |

- `npm run typecheck`（vue-tsc --noEmit）：✅ 0 错误
- Git 写操作：零

### 待用户实机验证

1. 默认 AI 通道输入「分析当前视图范围的风水条件」——应直接启用罗盘并提示点卦象（不再反问地点半径），证明罗盘协议段真正送达。
2. 默认 AI 通道输入「查询北京的天气」——应正常调用 `get_weather`。
3. 个人 Key 通道行为不变（该通道本就正常）。
4. 后端代理通道同样验证工具调用。

---

## 四、影响范围与遗留

- **影响范围**：仅前端请求体序列化，2 行代码；后端与提示词内容零改动。
- **重要后果**：V3.7.17–27 的提示词优化从本次修复起才真正生效，模型行为预计会有明显变化（更遵守能力边界与交互协议）。若出现新的行为不符，那是提示词本身需要调整，不再是传输问题。
- **遗留**：前端 Prompt 约 1,759 字符（含罗盘段时），后端上限 16,000，余量充足；若未来接入超长规则表需注意上限。
- **风险**：无向后兼容问题——无 `system_prompt` 时不写该字段，后端照旧回退默认值。

## 变更文件清单

- `Docs/Architecture/agent-capability-system.md`
- `Docs/TODO/bugfix-optimization-plan.md`
- `frontend/src/api/backend/agent.ts`
