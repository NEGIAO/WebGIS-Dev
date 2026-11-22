# 修复思考块文本不自动跟随滚动（think-content 内层容器游离）

## 日期与时间

2026-11-22 18:45

## 任务等级

**L2（常规）** —— Bug 修复，`ChatMessageList.vue` + `ChatMessageList.ts` 两个协同文件改动，超出 L1 的「单文件 ≤ 20 行」上限。

## 问题分析

### 核心症状

Agent 使用思考型模型时，「思考过程」折叠面板内的文本持续流式增长，但面板内部的可滚动区域**始终停在顶部**——最新产生的思考文本堆在可视区下方不可见，用户必须手动拖动内层滚动条才能继续跟踪。外层消息流本身是正常贴底的，因此视觉上表现为「整条消息到底了，但思考块内部卡住不动」。

### 根本原因

**双层滚动容器只驱动了外层。**

| 层 | 元素 | 滚动属性 | 是否被驱动 |
|---|---|---|---|
| 外层 | `.chat-body` | `overflow-y: auto`（`ChatMessageList.vue:263`） | ✅ 是 |
| 内层 | `.think-content` | `max-height: 360px; overflow-y: auto`（`ChatMessageList.vue:784-785`） | ❌ 否 |

链路事实：

1. 父组件 `ChatPanelContent.ts` 的 `onReasoning` 增量回调中，每次增量都调用 `messageListRef.value?.scrollToBottom(true)`（第 485 行第一轮、第 566 行第二轮）。
2. 子组件 `ChatMessageList.ts` 的 `scrollToBottom`（第 173-182 行）在 `nextTick` 中**只写 `this.chatBody.value.scrollTop`**，从未触及任何 `.think-content` 的 `scrollTop`。
3. 内层 `max-height: 360px` 固定，思考文本增长不会改变 `.chat-body` 的高度——外层早在第一帧就已贴底，后续增量对外层无感知。
4. 内层 `scrollTop` 全程保持初始值 `0`，新文本全部堆在 360px 窗口之下。

因此这不是「滚动算法失效」，而是**滚动目标选错了一层**。

### 受影响模块

- 前端「AI 对话」面板 → 消息列表 → 思考过程折叠块（`details.think-panel > .think-content`）
- 触发条件：思考型模型 `reasoning_content` 通道（V3.7.15 引入，第 104 行 `msg.reasoning` 分支）
- 兼容收益：旧 `<think>` 文本协议（`renderThink(msg.content)` 分支）同样受此内层容器约束，一并修复

## 解决方案

### 候选方案对比

| 方案 | 做法 | 评价 |
|---|---|---|
| A. 取消内层滚动 | `.think-content` 去掉 `max-height` / `overflow-y`，让思考块随内容无限增高 | ✗ 长思考会把正式回答挤出屏幕，破坏 V3.7.15「思考折叠药丸」的设计意图，且滚动外层的代价更大 |
| B. 父组件直接操作内层 DOM | `onReasoning` 里 `querySelector('.think-content')` 后写 `scrollTop` | ✗ 父组件穿透组件边界操作子组件内部 DOM，违反分层边界；且 `querySelector` 命中哪一条不确定 |
| C. 子组件自持容器引用 + 智能跟随 | 模板函数式 ref 收集 `.think-content` 元素，`scrollToBottom` 在同一调用内先采样「是否已贴底」，`nextTick` 后写入新 `scrollTop` | ✅ 选定 |

### 选定方案要点

**① 两阶段采样，避免「大块增量」误判**

`scrollToBottom()` 是同步调用的，此刻 Vue 尚未把新 reasoning 写进 DOM，因此读到的 `scrollHeight` 仍是**旧内容**的高度。利用这一点：

- **同步阶段**：对每个已登记容器计算 `scrollHeight - scrollTop - clientHeight`，记录「调用前是否在底部」；
- **`nextTick` 阶段**：DOM 更新完成后，对仍处于「跟随」状态的容器写 `scrollTop = scrollHeight`。

这样即使一次 SSE 增量灌入 400px 文本，判据仍基于「增量前的状态」（贴底），不会把「内容突然变长」误判成「用户向上翻了 400px」。

**② 智能跟随，不打断阅读**

距底 > `24px` 视为用户主动上翻（`THINK_FOLLOW_PX`），本次不跟随；用户滚回底部后，下一次增量自动恢复跟随。阈值取小值，因为内层是阅读辅助区，任何明显的上翻意图都应被尊重。

**③ 「回到底部」按钮强制穿透两层**

悬浮钮语义是「带我去最新内容」，应连同内层一起到底。新增 `scrollToLatest()` 公开方法（内部 `scrollToBottom(true, true)`），仅由该按钮调用；父组件的流式增量调用保持 `scrollToBottom(true)` 不变，继续走智能跟随。

`scrollToBottom` 增加第二个可选参数 `forceThink = false`，**不破坏既有 6 处调用方**（父组件全部只传第一个参数）。

**④ 折叠态与卸载态无害**

- `<details>` 未展开时内层 `scrollHeight === 0`，距离为负 → 判定跟随，写入 `scrollTop = 0`，无副作用；
- 元素卸载时函数式 ref 收到 `null`，从 Map 中删除；写入前再校验 `isConnected`，杜绝操作游离节点。

## 修改内容

1. `frontend/src/domains/common/chat/components/ChatMessageList.vue`
   - `.think-content` 增加函数式 ref `:ref="(el) => bindThinkBody(index, el)"`（`index` 为 `v-for` 的消息下标，用作容器登记键）。
   - 悬浮钮 `@click="scrollToBottom(true)"` → `@click="scrollToLatest()"`。
   - 注释说明新增 ref 的用途与采样时机。
2. `frontend/src/domains/common/chat/components/ChatMessageList.ts`
   - 新增私有成员 `thinkBodies: Map<number, HTMLElement>` 与常量 `THINK_FOLLOW_PX = 24`。
   - 新增 `bindThinkBody(index, el)`：登记/注销思考容器（函数式 ref 回调）。
   - 新增私有 `captureThinkFollowFlags(force)`：同步阶段采样各容器贴底状态。
   - 新增私有 `applyThinkFollow(flags)`：`nextTick` 后按采样结果写入 `scrollTop`。
   - 改写 `scrollToBottom(force = false, forceThink = false)`：把内层跟随并入同一帧调度。
   - 新增 `scrollToLatest()`：供悬浮钮调用的强制到底入口。
   - `onUnmounted` 中清空 `thinkBodies`。

## 修改原因

V3.7.15 引入思考过程流式展示后，思考文本被放进带 `max-height` 的内层滚动区，但滚动驱动逻辑沿用的是更早的「只滚消息列表」实现。功能上线时思考文本较短（不足 360px）不触发内层溢出，因此问题未暴露；一旦思考内容超过一屏，内层滚动条出现而无人驱动它，用户就失去对思考过程的实时跟踪——这恰好抵消了「实时展示思考」的核心价值。

## 影响范围

| 模块 | 影响 |
|---|---|
| AI 对话消息列表 | 思考块内部滚动行为（新增跟随）；外层滚动逻辑保持原语义 |
| 流式渲染性能 | 每次增量新增 1–N 次布局读取（`scrollHeight`），N = 当前 DOM 中思考块数量；本仓库消息列表无虚拟化，规模与 DOM 同阶，增量回调本就每帧读一次外层 `scrollHeight`，开销同级 |
| 非思考型模型 | 无思考块 → Map 为空 → 零行为变化 |
| 用户手动回翻 | 距底 > 24px 时停止跟随，不被拽回 |

## 性能指标

未实测（前端滚动行为修复，无量化基线）。设计上确保每次流式增量新增的强制布局读取不超过「当前存在的思考块数量」，实际运行时通常为 1（仅最后一条消息处于思考态）。

## 测试方案

### Agent 已执行

- `npx tsc --noEmit`（前端类型检查，确认新增 `.ts` 逻辑无类型错误）
- `python Scripts/CheckStructureTree.py`（结构树漂移门禁）
- `python Scripts/CheckConfigRegistry.py`（配置登记门禁）
- 代码级自检：确认 `scrollToBottom` 的 6 处既有调用方签名兼容（父组件均为单参数调用）

### 待用户实机验证

1. 选择思考型模型（如 DeepSeek-R1 / qwen 思考型），提一个需要长推理的问题（例如「分析这组数据的空间分布特征并给出三种插值方案对比」）。
2. 预期：思考块展开状态下，文本持续增长时**内容自动跟随到底部**，最新一行始终可见。
3. 在思考进行中，手动把思考块内部向上滚动约 100px 并停住。
4. 预期：**不再被强制拽回底部**，可以稳定阅读上文；新文本在下方继续追加。
5. 手动滚回思考块底部，继续等待增量。
6. 预期：跟随自动恢复。
7. 点击右下角「回到底部」悬浮钮。
8. 预期：外层消息流与思考块内部**同时**回到最底部。
9. 思考结束、正文到达后，思考块自动折叠；再次点开可正常阅读全文，滚动位置不跳变。
10. 旧 `<think>` 文本协议的历史消息（若有）点开后同样可正常滚动。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/chat/components/ChatMessageList.vue` | 思考容器登记 ref；悬浮钮改调 `scrollToLatest()` |
| `frontend/src/domains/common/chat/components/ChatMessageList.ts` | 内层滚动跟随逻辑（采样 + 应用 + 强制入口） |
| `README.md` | 版本号三处同步 |
| `Docs/Guide/CHANGELOG.md` | V3.7.8 条目新增 I 节 |
| `Docs/LLM_record/26-11/2026-11-22/2026-11-22-fix-think-content-autoscroll.md` | 本日志 |

## 遗留与风险

1. **版本号归属**：本修复按用户指令**并入 V3.7.8 批次**（不单独升号）。落地前曾观察到 README 一度显示 V3.7.15 / V3.7.14 / V3.7.13（并行会话的中间态），随后被整合为 V3.7.8 单条——说明多会话并行改版本号存在撞车风险；本次以最终落盘的 V3.7.8 为准，改动已并入该条目的 I 节。
2. **外层 `.chat-body` 的 `scroll-behavior: smooth` 未改动**：流式高频赋值时平滑动画存在追赶滞后，属既有行为，不在本任务范围（§2 第 5 条：不越权扩范围）。若后续观察到外层也「跟不上」，另开任务处理。
3. **思考块内层 `max-height: 360px` 未调整**：高度是否够用属产品观感问题，本次只修「滚动不到底」，不动视觉参数。
