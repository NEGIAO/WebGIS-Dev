# 2026-11-22 修复 AI 工具执行结果原文（含 JSON 载荷）直出给用户

- **日期与时间**：2026-11-22（实施中补记完成时间）
- **任务等级**：L2（Bug 修复）
- **版本**：V3.7.8

## 问题分析

### 核心症状（用户实机反馈）

工具调用（如「定位南京市」）执行后，聊天面板以气泡原文输出如下内容，含大段结构化 JSON：

```
✅ 操作完成：
[工具结果] search_and_zoom 执行成功：Located "江苏省南京市" at (118.791440, 32.061419) [amap]; layer added to TOC: 江苏省南京市.geojson
{"code":"OK","command":"setViewCenter","view":"cesium","location":{...},"center":{...},"layerName":"江苏省南京市.geojson","resultingMapState":{...}}
```

### 根本原因（事件逻辑链条）

1. `formatToolResultForLLM`（`agentToolsSchema.ts`）的设计用途是**回传 LLM**：在 `message` 一行人读摘要之外，特意附带 `JSON.stringify(extras)` 结构化载荷（`code` / `command` / `view` / `center` / `resultingMapState` / `weather` 等），让模型无需重调工具即可回答追问（天气载荷处有明确注释佐证）。**该格式本身正确，不应改动**。
2. `AgentExecutor.buildResultSummary` 聚合的正是上述 LLM 格式（其 docblock 写明「用于回传给 LLM」）。
3. `ChatPanelContent.executeToolsAndUpdateUI` 把该 LLM 摘要作为 `toolResultSummary` 返回——第 527 行将其拼进第二轮 prompt 回传 LLM（正确）。
4. **缺陷点**：第二轮回复为空（`else` 分支）或抛出非配额错误（`catch` 分支）时，两处回退直接把**同一个 LLM 专用摘要** `pushAssistant` 给用户——JSON 载荷原文直出。触发条件（第二轮空回复/上游报错）依赖运行时，但展示缺陷与触发原因无关，两处均成立。
5. 伴随问题：批次 F 将第二轮占位气泡 `finalIdx = pushAssistant('')` 建在 `callLLM` 之前，空回复/失败回退时**另推一条新气泡**，占位气泡留在原地成为空气泡。

### 受影响模块

`frontend/src/domains/common/chat/`：`constants/agentToolsSchema.ts`、`agent/AgentExecutor.ts`、`components/ChatPanelContent.ts`（仅用户可见的回退展示路径；回传 LLM 的路径不动）。

### 候选方案对比

| 方案 | 做法 | 取舍 |
|---|---|---|
| A（选定） | 新增用户可见版格式化 `formatToolResultForUser` / `buildUserResultSummary`（仅人读 `message` 一行），回退展示两处改用之 | LLM 载荷完整保留，展示与回传职责分离；改动收敛 3 文件 |
| B | 在 `formatToolResultForLLM` 里去掉 JSON 载荷 | 一行改动，但直接削弱模型追问上下文（天气注释明确反对），破坏既有设计 |
| C | 展示层用正则事后剥离 JSON | 治标，脆弱（依赖输出形状），且 `[工具结果]` 标签仍残留 |

### 解决方案（选定 A）

1. `agentToolsSchema.ts`：新增 `formatToolResultForUser(toolName, result)` —— `${toolName} 执行${成功/失败}：${message}`，无 JSON。
2. `AgentExecutor.ts`：新增 `buildUserResultSummary(results)`，与 `buildResultSummary` 对称。
3. `ChatPanelContent.ts`：
   - `executeToolsAndUpdateUI` 同时返回 `userResultSummary`（LLM 摘要原名保留，仅供回传）。
   - 空回复 `else` 分支与失败 `catch` 分支的回退文案改用 `userResultSummary`。
   - 回退写入既有占位气泡 `finalIdx`（不再另推新消息，消除空气泡）；`catch` 中占位已有部分流式内容时保留原样不覆盖；配额错误时移除空占位（提示走既有 `statusHint`）。
   - 顺带修正本函数内批次 E/F 遗留的两处纯缩进错位（仅空白符，无语义变化，此前暂存区复审已指出）。

## 修改内容

1. `frontend/src/domains/common/chat/constants/agentToolsSchema.ts`：新增 `formatToolResultForUser(toolName, result)` —— 用户可见版摘要，仅 `${toolName} 执行成功/失败：${message}` 一行，不含 extras JSON 载荷；`formatToolResultForLLM` 原样保留（回传 LLM 路径不动）。
2. `frontend/src/domains/common/chat/agent/AgentExecutor.ts`：import 增 `formatToolResultForUser`；新增静态方法 `buildUserResultSummary(results)`，与 `buildResultSummary` 对称。
3. `frontend/src/domains/common/chat/components/ChatPanelContent.ts`：
   - `executeToolsAndUpdateUI` 增算并返回 `userResultSummary`（`toolResultSummary` 语义不变，仅回传 LLM 使用）。
   - 第二轮**空回复** `else` 回退：改写 `list[finalIdx].content`（复用占位气泡），文案改用 `userResultSummary`。
   - 第二轮**失败** `catch` 回退：占位无内容时写入 `userResultSummary`；已有部分流式内容则保留原样不覆盖；配额错误移除空占位（提示走既有 `statusHint`）。
   - 占位 `pushAssistant('')` 上移到 `try` 外，使 `finalIdx` 在 `catch` 中可见。
   - 顺带修正批次 E/F 遗留的两处纯缩进错位（第一轮 `callLLM` 参数块、第一轮回复 `else` 块；仅空白符，无语义变化——暂存区复审已指出的遗留项，与本次改动同函数，随本次归位）。

## 影响范围

- 仅前端 AI 对话工具链路的**用户可见回退展示**：默认 AI / 个人 Key / 后端代理三模式共用同一 `ChatPanelContent` 编排，行为一致。
- 回传 LLM 的工具结果格式（`formatToolResultForLLM` / `buildResultSummary` / 第二轮 prompt 第 529 行拼接）**零改动**，模型追问上下文与工具执行链路不受影响。
- 工具状态气泡（`toolCalls` 执行中/成功/失败标签）不受影响。

## 性能指标

不适用（展示层文案修正，无性能语义）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `npx vue-tsc --noEmit` exit 0（零类型错误）；eslint（3 个改动文件）exit 0；`Scripts/CheckStructureTree.py` 739/739 ✅；`Scripts/CheckConfigRegistry.py` 通过（catalog 138 key）；§11.2 红线扫描仅命中已知假阳性 `maxRayDistance`（体积云 raymarch 参数）；生产基线三项正常 | ① 正常工具对话（如「定位南京市」）→ 第二轮正常回复时展示不变（本次不改正常路径）；② 构造第二轮空回复/失败（如断网后发工具指令）→ 气泡显示 `✅ 操作完成：search_and_zoom 执行成功：…` 一行人读摘要，**不再出现 `{"code":...}` JSON 原文**，且无空气泡残留；③ 后端代理模式触发配额 429 → 空占位被移除，额度提示走状态栏 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/chat/constants/agentToolsSchema.ts` | 新增 `formatToolResultForUser` |
| `frontend/src/domains/common/chat/agent/AgentExecutor.ts` | 新增 `buildUserResultSummary` + import |
| `frontend/src/domains/common/chat/components/ChatPanelContent.ts` | 双摘要分流 + 回退复用占位 + 缩进修正 |
| `README.md` | 版本号三处（简介行 / 版本演进表首行 + 删 V3.7.5 旧行 / 页脚）；顺带修正 V3.7.7 行重复编号 ⑤⑤→⑤⑥ |
| `Docs/Guide/CHANGELOG.md` | 顶部追加 V3.7.8 条目 |
| `Docs/LLM_record/26-11/2026-11-22/2026-11-22-fix-tool-result-raw-display.md` | 本日志（**新建**） |
| `Docs/TODO/bugfix-optimization-plan.md` | 按 §2.5 登记暂存区复审发现的后端结构树缺项（只记不改） |

## 遗留与风险

1. 用户可见摘要仍含工具侧原始 message（如英文 `Located "江苏省南京市" …`、`layer added to TOC`）——这是 GISCommander 返回的既有人读文案，汉化属工具层改造，超出本次范围未动。
2. 第二轮失败且占位已有部分流式内容时，保留已出内容不追加失败说明——部分回答 + 工具状态气泡已可表意；若实测观感不佳可再议。
3. **第二轮为何空回复/失败的触发原因未定**（运行时依赖上游行为，本次只修展示面）。若复测发现第二轮频繁失败，属上游链路问题，另行排查（已在本日志 §根因 注明）。
4. 暂存区复审发现的后端结构树缺项（`test_agent_stream.py` 未登记、后端树无门禁）已按 §2.5 记入 TODO，未顺手修改。

