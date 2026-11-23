# 多轮工具编排：修复「列完图层就停」（L2）

## 日期与时间

2026-11-23 20:15

## 任务等级

**L2（常规）** —— 改造单文件内的对话编排流程（`ChatPanelContent`），无跨模块依赖变更，但改变了 Agent 的执行模型。

## 问题分析

### 核心症状

用户反馈：「对图层的操作，首先要执行列出图层，先后调用多个命令才可以，现在每次都是调用了列出图层就停止了。」

即：模型正确识别了意图并调用了 `list_layers`，但拿到结果后**不再继续**调用 `remove_layer` / `set_layer_visibility`，而是直接给一句总结结束。

### 根本原因：编排只支持「一轮工具 + 一轮总结」

原流程（`ChatPanelContent.sendMessage`）：

```
firstRound (LLM)
  ├─ 有 tool_calls → executeToolsAndUpdateUI(执行)
  │     └─ secondRound (LLM，带 tools)
  │           └─ const clean = stripToolCallBlocks(secondRound.reply)
  │              list[finalIdx].content = clean || "✅ 操作完成：..."
  └─ 无 tool_calls → 直接显示文本
```

关键缺陷：**第二轮返回后只做「清洗文本 + 落地」**，完全没有检查 `secondRound.rawData` 里是否又出现了 `tool_calls`。模型若在第二轮继续请求工具（`list_layers` 拿到 id → `remove_layer`），这些调用会被 `stripToolCallBlocks()` 当作「残留的工具块」清掉，用户只看到一句总结。

这不是模型不配合 —— 模型确实请求了第二步，是前端把请求丢了。

### 为什么串行不可避免

`list_layers` 的输出（图层 id）是 `remove_layer` 的输入。**参数依赖前一步的输出，就不可能在同一轮并行发出**。所以「先查后删」这类任务天生需要两轮以上，单轮编排从架构上就无法支持。

## 解决方案

### 把两轮改成循环

```ts
while (pendingCalls.length > 0 && roundNo <= MAX_TOOL_ROUNDS) {
    // 1. 请求 LLM（带 tools + 完整 systemPrompt）
    // 2. 解析 nextCalls / nextText
    // 3. nextCalls 为空 → 落地文本，结束
    // 4. nextCalls 非空 → 执行工具、追加历史、继续
}
```

关键点：

1. **每轮都带完整 `systemPrompt`**：约束（先 list_layers、不得伪称成功）必须跨轮一致；
2. **每轮新建回复气泡**：模型只返回工具调用时该气泡为空，由 `executeToolsAndUpdateUI` 回收，不留空气泡；
3. **历史用「伪轮次」追加**（assistant 说明已执行 + user 承载工具结果），沿用既有做法，不依赖后端支持 `role: tool`。

### 三道护栏（防止循环失控）

| 护栏 | 规则 | 触发后的表现 |
|---|---|---|
| 轮次上限 | `MAX_TOOL_ROUNDS = 4` | 「已达最多 4 步工具调用，任务可能尚未完成…」 |
| 重复检测 | 本轮 `(name, arguments)` 签名与上轮完全相同 | 「检测到重复的工具调用，已中止以避免死循环…」 |
| 单轮失败 | LLM 调用异常 / 配额耗尽 | 配额提示走 statusHint；其他错误降级为工具摘要，结束循环 |

重复检测的签名比较用 `JSON.stringify([[name, args], ...])`：同一工具同一参数连发两次，说明模型在原地打转（常见于工具一直返回 `LAYER_NOT_FOUND`），继续只会烧 token。

### 提示词补一条关键约束

> 依赖前一步结果的调用必须分轮进行：先 list_layers，拿到 id 后**下一轮**再调操作类工具；不要在同一轮里同时发出「查列表」和「按 id 操作」，否则 id 还不存在。

没有这条，模型可能把 `list_layers` 和 `remove_layer` 一起发出来（`tool_calls` 支持并行），第二个必然拿到不存在的 id。

## 修改内容

`frontend/src/domains/common/chat/components/ChatPanelContent.ts`：

1. 删除原「第二轮」代码块（约 60 行），替换为 `while` 循环；`finalIdx` 由循环内每轮新建。
2. 循环内保留原有的流式渲染（`onDelta` / `onReasoning`）、配额累计（`totalCallCost`）、模型名回填、`seq` 竞态检查、`abort` 信号。
3. 新增 `pendingHistory` / `pendingMapContext` / `previousSignature` / `lastUserResultSummary` 四个循环状态。
4. 轮次上限与重复检测的提示文案用中文，直接可见。

`frontend/src/domains/common/chat/constants/agentToolsSchema.ts`：选型规则新增「依赖前序结果的调用必须分轮进行」。

## 修改原因

Agent 的价值在于**多步任务自动化**。单轮工具调用只能做「一问一答式」操作（搜索、切底图、查天气），而 GIS 的核心操作（改图层、删图层、分析后处理）几乎都需要「先查后改」。只支持单轮，等于把 Agent 限制在玩具级别。这次改造是让工具链真正闭环的前提。

## 影响范围

| 项 | 影响 |
|---|---|
| 工具调用轮次 | 1 轮 → 最多 4 轮 |
| token 消耗 | 每多一轮 = 一次完整 LLM 请求（含 2768 字符提示词 + 17 工具声明）；典型「查+改」任务从 2 次请求增到 3 次 |
| UI 气泡 | 每轮一个文本气泡 + 一个工具卡片；纯工具轮的空文本气泡会被回收 |
| 配额展示 | 所有轮次 `cost` 累加到 `totalCallCost`，最后统一校正 |
| 中止行为 | 每轮均检查 `seq !== requestSeq` 与 `abort.signal`，与原来一致 |
| 向后兼容 | 无工具调用时走原 `else` 分支，行为不变 |

## 性能指标

未实测。典型场景（查列表 → 删图层 → 总结）：3 次 LLM 请求，比原来多 1 次；工具执行本身耗时不变（毫秒级）。

## 测试方案

### Agent 已执行

- `vue-tsc --noEmit` —— 0 报错
- `eslint`（2 个变更文件）—— 0 warning
- `vite build` —— 成功（4765 modules）
- 代码级复核：`while` 与 `else` 分支边界完整；循环内每轮重建 `finalIdx`；`executeToolsAndUpdateUI` 的 splice 不会影响后续轮（下轮重新 push）

### 待用户实机验证

1. **两步串行**：说「把 HENU湖泊 这个图层删掉」→ 预期看到**两张工具卡片**（列出图层 → 删除图层），最后一条自然语言总结，图层从 TOC 消失。
2. **三步串行**：「先看看有哪些图层，然后把第一个图层透明度调到 30%」→ 预期 2 张卡片 + 总结。
3. **不需要多步**：「切换到 3D」→ 预期仍是 1 张卡片 + 总结（不多余轮次）。
4. **歧义场景**：「把那个图层删掉」（有多个图层）→ 预期模型先问是哪个，不删任何东西。
5. **重复调用护栏**：若某工具持续失败（如操作不存在的 id），观察是否在第二次重复时中止并给出提示。
6. **轮次上限**：连续下多个依赖指令，观察是否在第 4 步后停止并提示。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/chat/components/ChatPanelContent.ts` | 两轮编排改为 while 循环 + 三道护栏 |
| `frontend/src/domains/common/chat/constants/agentToolsSchema.ts` | 提示词补「依赖前序结果必须分轮」 |
| `README.md` / `Docs/Guide/CHANGELOG.md` | 版本号 V3.7.9 |

## 遗留与风险

1. **token 成本上升**：每轮都带完整提示词（2768 字符）与 17 个工具声明，最坏情况 4 轮 ≈ 4 倍首轮成本。若后续工具继续增多，应考虑按场景裁剪工具集（如非图层任务不注入图层工具）。
2. **重复检测是严格全等**：模型若把参数顺序或措辞微调（如 `{layerId, visible}` vs `{visible, layerId}`）则签名不同，护栏失效。当前 `JSON.stringify` 对键顺序敏感。
3. **历史截断为最近 8 条**：多轮后早期用户消息会被挤出，模型的上下文连贯性可能下降。若出现「忘了最初要做什么」，应改为保留首条 user + 最近 N 条。
4. **未验证降级模式**：文本 `tool_call` 块在第二轮起的解析依赖 `extractToolCalls`，该路径在原生 function calling 可用时走不到，未实测。
5. **UI 卡片堆叠**：多轮会产生多张工具卡片，长对话中可能显得冗长；未做折叠处理。
