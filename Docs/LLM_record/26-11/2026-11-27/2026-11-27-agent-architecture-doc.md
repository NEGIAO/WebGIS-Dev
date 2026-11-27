# 2026-11-27 Agent 能力系统架构文档

> **日期**：2026-11-27 11:18–11:25
> **任务等级**：L2 常规开发（文档）
> **状态**：✅ 已完成
> **关联版本**：V3.7.28

---

## 一、问题分析

### 核心症状

用户要求「agent 整个能力与功能提示词，需要全面调查写入/更新架构文档；反映最新的能力」。

### 根本原因

`Docs/Architecture/` 下 21 篇文档中无 Agent 专项文档——Agent 能力系统（V3.7.19–27 经历 9 个版本的重构与修复）的知识散落在实现代码、方案文档与逐次日志中，无权威架构视图。新会话接手需跨多文件拼凑，且容易重复已踩过的坑。

### 受影响模块

| 模块 | 影响 |
|---|---|
| `Docs/Architecture/agent-capability-system.md` | 新增，Agent 能力架构权威文档 |
| `README.md` | 功能级索引 + 规模速览同步 |
| `Docs/TODO/bugfix-optimization-plan.md` | 记录调查中发现的真实缺陷 |

---

## 二、调查范围与方法

用 Explore 子代理做 very thorough 只读调查，覆盖 7 个维度：提示词组装、工具能力与执行链、意图与分发、UI 交互、后端链路、渲染管线、配额与身份。产出带文件路径与行号的事实清单，再据此撰写文档——不凭印象编写。

调查基线：README V3.7.27；代码工作区含 V3.7.19–27 全部改动。

---

## 三、修改内容

1. **新增架构文档**：`Docs/Architecture/agent-capability-system.md`，8 章 + 总体架构 Mermaid 图（交互层/编排层/能力定义层/执行层/后端五层）。
   - 第 1 章：四条设计原则（工具执行在浏览器 / 能力 SSOT / 机制写清决策放手 / 按需分发降 token）。
   - 第 3 章：能力定义层 5 个 SSOT 文件各自的职责与边界。
   - 第 4 章：20 工具按组全景表 + 执行链（AgentExecutor → GISCommander → MapCommandBus → OL/Cesium adapter）。
   - 第 5 章：dispatchSend 七步编排、工具分发算法、罗盘三段式机制。
   - 第 6 章：三通道、SSE 事件、system_prompt 传输、错误回传。
   - 第 7 章：渲染管线与 V3.7.24–26 三类加粗瑕疵。
   - 第 8 章：维护指南（改什么→改哪里→同步检查什么）+ 回归基线数值。
2. **README 同步**：功能级索引新增 Agent 能力系统条目；规模速览 Architecture 21→22 篇、Markdown 549→550 篇。
3. **TODO 记录**：调查中发现的 `system_prompt` 丢失缺陷写入 `Docs/TODO/bugfix-optimization-plan.md`（按 Force_command §2.5 只记不改）。

---

## 四、重大发现（未修复，已记录）

**默认 AI / 后端代理通道丢弃前端 System Prompt**：

- 事实：`llmCall.ts` 三通道均传 `system_prompt`（:73/:106/:129）；后端 `schemas.py` 已声明该字段（上限 16,000）。但 `agent.ts` 的 `buildDefaultProxyBody` 与 `buildAgentCompletionsBody` 未把它写入请求体，仅 `buildAgentProxyBody` 包含。
- 影响：默认 AI 与后端代理两通道实际使用后端 `DEFAULT_AGENT_SYSTEM_PROMPT`（一句英文），前端组装的能力边界、按需注入的罗盘协议、上下文约束全部未生效。
- 推断：这很可能解释了 V3.7.17–27 多轮提示词优化在实机上的部分行为不符（用户多次反馈 agent 未按提示词执行）。
- 处置：按 Force_command §2.5「修 A 时发现 B 只记录不顺手改」，写入 TODO 待独立 L2 修复；本任务不改代码。

---

## 五、验证结果

| 检查 | 结果 |
|---|---|
| 架构文档含 Mermaid 图 | ✅ 总体架构五层图 |
| 覆盖 V3.7.27 最新能力 | ✅ 注册表/按需注入/规则表优先/快捷命令校验均入文 |
| 20 工具全景 | ✅ 20 项全覆盖（按 7 组归类） |
| README 索引同步 | ✅ 功能级表 + 规模速览 |
| Git 写操作 | 零 |
| 类型检查 | 本任务零代码改动，不适用 |

### 待用户操作

1. 审阅架构文档，确认无遗漏的能力模块。
2. 决策是否修复 TODO 中的 `system_prompt` 丢失缺陷（独立 L2，修复后需重跑工具调用与罗盘三段式实机验证）。

---

## 六、影响范围与遗留

- **影响范围**：仅文档与索引，零运行时代码改动。
- **遗留**：`Docs/Architecture/` 现 22 篇文档，README 计数已同步；后续新增架构文档需同步该计数。
- **风险**：架构文档反映 V3.7.27 基线；若后续版本改动 Agent 能力，需同步更新本文档（已在第 8 章维护指南中列出改什么→改哪里）。

## 变更文件清单

- `Docs/Architecture/agent-capability-system.md`
- `Docs/TODO/bugfix-optimization-plan.md`
