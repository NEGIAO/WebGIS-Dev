# 补齐图层删除能力 + 修复第二轮空回复（L2）

## 日期与时间

2026-11-23 19:50

## 任务等级

**L2（常规）** —— 新增 1 个工具（双引擎），并修复 Agent 第二轮回复缺少系统提示词的缺陷。

## 问题分析

### 核心症状（用户截图）

> 用户：你能直接看当前的图层并移除它吗
> 工具卡片：✅ 列出图层 共 1 个图层
> AI 回复：✅ 操作完成：list_layers 执行成功：共 1 个图层

两个问题同时暴露：

1. **没有删除能力** —— 用户明确要求「移除」，但工具集里根本没有 `remove_layer`。模型只能列图层，然后无话可说。
2. **回复是工具摘要而非自然语言** —— 「✅ 操作完成：list_layers 执行成功：共 1 个图层」是 `formatToolResultForUser()` 的输出格式，说明**第二轮的 LLM 回复为空**，前端回退显示工具结果摘要。

### 根因一：删除被我自己列成了「不做」

V3.7.9 的方案文档里，我把「删除类操作」列入红线，理由是「不可撤销，且当前没有二次确认机制」。

**这个判断是错的**。删除图层是 GIS 的日常操作（等同 QGIS 里右键删图层），用户在自己的数据上要求删除，属于正常需求。把「缺少确认 UI」当成「不提供能力」的理由，等于让用户什么都做不了 —— 与「增强 Agent 操作系统的能力」这个目标直接冲突。

正确的做法不是不提供，而是：**提供能力 + 让模型先确认目标 + 如实汇报删了什么**。

### 根因二：第二轮 systemPrompt 为空

```ts
const secondRound = await this.config.callLLM({
    message: '请根据上述工具执行结果回复用户。',
    systemPrompt: '',          // ← 空
    tools: AGENT_TOOLS,
});
```

第二轮没有系统提示词，模型失去角色设定与全部约束（包括「不要伪称成功」「要如实转述 code」）。轻则只回一句「操作完成」，重则空回复 → 前端回退到工具摘要。

这是 V3.7.7 引入流式时留下的缺口，与本次工具扩展无关，但恰好在此刻暴露。

## 解决方案

### 1. 删除能力（双引擎）

| 层 | 改动 |
|---|---|
| 底座 | `removeUserLayer`（OL）与 `cesiumLayers.remove` 由 `void` 改为 `LayerActionResult`，**删除前记录 name / featureCount**（删完就取不到），返回 `{ deleted, name, featureCount }` |
| 命令总线 | `COMMAND_SPECS` 加 `removeLayer: { supportedViews: ['ol','cesium'] }` |
| 适配器 | 两端各加 handler；3D 自动剥离 `cesium:` 前缀 |
| 门面 | `GISCommander.removeLayer`，成功后补 `已删除图层「X」（N 个要素）` |
| 声明 | 工具 `remove_layer`（第 17 个）、`TOOL_REGISTRY`、显示名映射 |

### 2. 防误删的三道措施（不阻塞能力）

1. **提示词强制**：「删除前必须先 `list_layers` 确认目标；用户只说『那个图层』而列表里不止一个时，先问清是哪个，不要猜」；
2. **结果回带身份**：工具返回 `name` 与 `featureCount`，提示词要求「删完必须说出被删图层的名称与要素数」，避免只回「已删除」；
3. **不做二次确认弹窗**：与 UI 删除按钮一致（UI 也没有确认框）。加 `confirm` 参数会被模型直接传 `true` 绕过，形成虚假安全感。

### 3. 第二轮提示词

`systemPrompt: ''` → `systemPrompt`（复用首轮构建的完整提示词）。理由：约束必须跨轮一致，否则第二轮容易说出与工具结果矛盾的话。成本约 800 token/轮，可接受。

## 修改内容

1. `ol/layer/composables/useUserLayerActions.ts`：`removeUserLayer` 返回结构化结果，含 `name` / `featureCount` / `deleted`；未找到时返回 `LAYER_NOT_FOUND`（原为静默 return）。
2. `cesium/stores/cesiumLayers.ts`：`remove` 返回结构化结果，附 `sceneApplied`（场景未挂载时为 false，表示只删了记录）。
3. `common/chat/agent/MapCommandBus.ts`：`COMMAND_SPECS` 新增 `removeLayer`。
4. `mapCommand/olAdapter.ts` / `cesiumAdapter.ts`：各加 `removeLayer` handler 与 sink 参数。
5. `app/composables/useHomeEngineSwitch.ts`：注入 `removeLayer` sink（OL 走容器 `removeUserLayer`，3D 走 `cesiumLayersStore.remove`）。
6. `common/command-bus/GISCommander.ts`：新增 `removeLayer`，补中文 message。
7. `common/chat/constants/agentToolsSchema.ts`：新增 `remove_layer` 声明；提示词工具清单 16 → 17、选型与约束各补 1 条。
8. `common/chat/agent/AgentExecutor.ts` / `composables/chatIntentFallback.ts`：注册与显示名。
9. `common/chat/components/ChatPanelContent.ts`：第二轮改用完整系统提示词。

## 修改原因

用户要的是「能干活」，不是「有工具清单」。一个不能删图层的 GIS Agent 是不完整的 —— 用户导入数据、看数据、清理数据是同一个闭环，缺一环就退回手工操作。同时，工具调用成功却只回一句「操作完成」，会让用户以为 Agent 没理解需求，实际是第二轮失去了语言能力。

## 影响范围

| 项 | 影响 |
|---|---|
| 工具数 | 16 → 17 |
| 删除行为 | 新增，双引擎；不可撤销 |
| 删除误操作风险 | 依靠「先 list 再删 + 汇报名称与要素数」约束，无强制确认 |
| 第二轮回复 | 恢复角色与约束，不再出现纯工具摘要式回答 |
| token 成本 | 每轮多约 800 token（第二轮提示词） |
| 命令白名单 | 11 → 12 条 |

## 性能指标

无变化。删除为单次图层移除，与 UI 删除路径完全一致。

## 测试方案

### Agent 已执行

- `vue-tsc --noEmit` —— 0 报错
- `eslint`（5 个变更文件）—— 0 warning
- `vite build` —— 见下
- 静态核对：schema 17 / TOOL_REGISTRY 17 / COMMAND_SPECS 12，三处一致

### 待用户实机验证

1. **删除（2D）**：导入一个图层 → 说「把这个图层删掉」→ 预期先 `list_layers`，再 `remove_layer`，图层从 TOC 消失，回复含图层名与要素数。
2. **删除（3D）**：切 3D，对 3D 图层说「删掉」→ 预期图层消失。
3. **多图层歧义**：有 2 个以上图层时说「删掉那个图层」→ 预期模型先问是哪一个，而不是随便删。
4. **删除不存在的 id** → 预期返回「找不到图层」。
5. **回复质量**：任何一次工具调用后，第二轮回复应是自然语言总结（含操作结果），而不是「✅ 操作完成：xxx 执行成功」这类摘要。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/ol/layer/composables/useUserLayerActions.ts` | `removeUserLayer` 返回结构化结果 |
| `frontend/src/domains/cesium/stores/cesiumLayers.ts` | `remove` 返回结构化结果 |
| `frontend/src/domains/common/chat/agent/MapCommandBus.ts` | 新增 `removeLayer` 白名单 |
| `frontend/src/domains/common/chat/agent/mapCommand/olAdapter.ts` | 新增 `removeLayer` handler |
| `frontend/src/domains/common/chat/agent/mapCommand/cesiumAdapter.ts` | 同上 |
| `frontend/src/app/composables/useHomeEngineSwitch.ts` | 注入删除 sink |
| `frontend/src/domains/common/command-bus/GISCommander.ts` | 新增 `removeLayer` 门面方法 |
| `frontend/src/domains/common/chat/constants/agentToolsSchema.ts` | 工具声明 + 提示词 |
| `frontend/src/domains/common/chat/agent/AgentExecutor.ts` | 注册表 |
| `frontend/src/domains/common/chat/composables/chatIntentFallback.ts` | 显示名 |
| `frontend/src/domains/common/chat/components/ChatPanelContent.ts` | 第二轮系统提示词 |
| `README.md` / `Docs/Guide/CHANGELOG.md` | 版本号 V3.7.9 |

## 遗留与风险

1. **删除不可撤销，无撤销栈**：与 UI 一致。若需要，应做「最近删除」缓存（保留图层快照 30 秒供恢复），成本较高，未纳入。
2. **无强制二次确认**：`confirm` 参数形同虚设（模型会直接传 true），故不设。防误删依赖提示词约束与「先 list 再删」流程，模型仍可能误判目标。
3. **3D 删除的 `sceneApplied`**：场景未挂载时只删记录，图层数据源可能残留（下次挂载时会重新同步）。已在结果中标明，但未做清理。
4. **第二轮仍传完整 `tools`**：理论上模型可以在第二轮再次发起工具调用，可能形成多轮链。当前未观察到死循环，但未加 `tool_choice: 'none'` 硬约束 —— 若出现循环，应在第二轮显式禁用工具。
5. **未实机验证**：删除链路依赖 `MapContainer.removeUserLayer` 与 `cesiumLayersStore.remove`，均为既有函数（UI 已在用），风险较低但未跑通端到端。
