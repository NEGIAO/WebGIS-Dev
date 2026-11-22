# 2026-11-22 修复 ```tool_call 块在流式落定后残留于用户气泡

- **日期与时间**：2026-11-22 12:10 前后（实施中补记）
- **任务等级**：L2（Bug 修复）
- **版本**：V3.7.8（曾用号 V3.7.9，按用户「本次版本为3.7.8」指令归并，见 CHANGELOG 归并注）

## 问题分析

### 核心症状（用户截图实机反馈）

模型回复仅由一个 ```tool_call 围栏块组成（如「切换底图」→ `{"name":"switch_basemap","arguments":{"presetId":"google_Backend_Proxy_preset",...}}`）时，工具已正常提取并执行（V3.7.7 批次 E 的 P0 修复已生效），但**块原文以代码块形式永久残留**在 AI 气泡里。

### 根本原因（事件逻辑链条）

1. **批次 E 流式渐进渲染**：`onDelta` 把模型**原文**（含 ```tool_call 围栏）逐字写入 `list[assistantMsgIndex].content`（`ChatPanelContent.ts` 第一轮 callLLM 的 onDelta）。
2. **落定时条件覆盖**：工具分支里 `cleanReply = AgentExecutor.stripToolCallBlocks(reply)` 后，仅当 `!isIntentFallback && cleanReply && cleanReply.length > 5` 才把气泡覆盖为清洗文本。回复仅由工具块组成时 `cleanReply === ''` → 覆盖被跳过 → **流式写入的原文块永久残留**。
3. **历史对照**：批次 E 之前气泡在落定前为空，`cleanReply` 为空时气泡无内容，由 `executeToolsAndUpdateUI` 的 `if (!list[assistantMsgIndex].content) list.splice(...)` 回收——从不展示原文。故本缺陷为流式改造引入的显示回归。
4. **同族缺陷**：第二轮（工具后续回复）展示路径（streamed 直写 / typewriterReveal）**从未做过 stripToolCallBlocks**——模型在总结回复中夹带 ```tool_call 块时同样原文直出（非流式时代即存在，流式使其更易暴露）。

### 受影响模块

`frontend/src/domains/common/chat/components/ChatPanelContent.ts`（第一轮落定覆盖逻辑、第二轮展示逻辑）。三模式（默认 AI / 个人 Key / 后端代理）共用。

### 候选方案对比

| 方案 | 做法 | 取舍 |
|---|---|---|
| A（选定） | 落定时「非意图兜底」分支**无条件**以 `cleanReply` 覆盖气泡（可为空，空则交给既有空内容回收）；第二轮展示前同样 strip，空则走 `✅ 操作完成` 摘要回退 | 与非流式时代终态一致；改动收敛单文件两处 |
| B | onDelta 中途识别 ```tool_call 前缀暂停渲染 | 流式半截围栏无法可靠识别，且需处理恢复时机，复杂易碎 |
| C | 放宽/移除 `>5` 阈值即视为修好 | 只修「短文本被丢」不修「纯块残留为空」，不完整 |

选定 A 的附带语义统一：原 `>5` 阈值会把 1–5 字符的真实短回复（非流式下）整条丢弃（气泡被 splice 移除），本修复改为「清洗后非空即展示」，短回复不再丢失。

### 解决方案（选定 A）

1. 第一轮工具分支：`!isIntentFallback` 时无条件 `list[assistantMsgIndex].content = cleanReply`（空串也写入）；`isIntentFallback` 时保持原文（模型本来就输出普通文本，无块可清洗）。空串由既有 `executeToolsAndUpdateUI` 回收逻辑移除气泡。
2. 第二轮：`secondRound.reply` 先 `stripToolCallBlocks`，非空才落定/打字机；清洗后为空（纯块）走既有 `✅ 操作完成：userResultSummary` 回退（V3.7.8 已建）。

## 修改内容

1. `frontend/src/domains/common/chat/components/ChatPanelContent.ts` 第一轮工具分支：`!isIntentFallback` 时**无条件** `list[assistantMsgIndex].content = cleanReply`（含空串），移除原 `cleanReply.length > 5` 才覆盖的条件；空串由 `executeToolsAndUpdateUI` 既有的 `if (!list[assistantMsgIndex].content) list.splice(...)` 回收气泡。
2. 同文件第二轮展示：`secondRound.reply` 先过 `AgentExecutor.stripToolCallBlocks`，非空才 streamed 落定 / typewriterReveal；清洗后为空（纯块）走既有 `✅ 操作完成：userResultSummary` 回退。

## 影响范围

- 仅 AI 对话工具链路的**气泡展示终态**；工具提取（`extractToolCalls`）、执行（`executeToolCalls`）、回传 LLM 的历史拼接（`toolRoundHistory` 用清洗文本）均未改动。
- 三模式共用同一编排，行为一致。
- 附带语义变化：1–5 字符的真实短回复（清洗后非空但 ≤5 字符）现在会展示，而非被阈值整条丢弃（非流式时代的行为缺陷，借同一落定点统一）。

## 性能指标

不适用（展示层修正）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `npx vue-tsc --noEmit` 通过（TSC-OK）；eslint（改动文件）通过（LINT-OK）；`Scripts/CheckStructureTree.py` 739/739 ✅；`Scripts/CheckConfigRegistry.py` 通过；§11.2 红线扫描命中文件与此前一致（全部为已知假阳性 `maxRayDistance`），本次改动文件不在命中列表 | ① 发纯工具指令（如「切换为谷歌卫星底图」「定位南京市」）→ **气泡不再出现 ```tool_call 代码块**，仅工具状态气泡 + 第二轮总结；② 模型带文字+块的混合回复 → 只显示清洗后文字（流式期间短暂闪现原文属预期，落定即被替换）；③ 无工具的普通对话不受影响 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/chat/components/ChatPanelContent.ts` | 第一轮落定无条件覆盖清洗文本；第二轮展示前清洗 |
| `README.md` | 版本号三处（简介行 / 版本演进表首行 + 删 V3.7.6 旧行 / 页脚） |
| `Docs/Guide/CHANGELOG.md` | 顶部追加条目（后按用户指令与 A 例归并为单条 V3.7.8） |
| `Docs/LLM_record/26-11/2026-11-22/2026-11-22-fix-toolcall-block-streaming-remnant.md` | 本日志（**新建**） |

## 遗留与风险

1. 流式过程中原文（含块）会短暂闪现、落定时被清洗替换——渐进渲染的固有过渡，未做中途抑制（方案 B 已评估为易碎，见方案对比）。
2. 第二轮若模型输出**可解析**的工具块，当前仍只做展示清洗、不执行第三轮工具链（多轮工具编排属功能缺口，非本缺陷范围）。
3. 上一轮诊断的「upstream returned empty content」零输出问题（NVIDIA 流无可用 delta）仍未定位——待用户确认默认 AI 模型配置，或批准补零输出诊断日志（已在会话中提出，未获指令）。
