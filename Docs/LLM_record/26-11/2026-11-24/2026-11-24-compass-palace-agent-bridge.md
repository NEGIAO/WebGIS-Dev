# 2026-11-24 V3.7.30 罗盘宫位面板接入 Agent 释义

- **日期与时间**：2026-11-24 12:10
- **任务等级**：L2（功能开发，跨 chat / compass / home 三个域）
- **版本号顺延**：原拟 V3.7.29，实施完成时并行会话已占用该号（核对五主题罗盘符号与解释文本），按 Force_command §5「后完成者顺延」改为 **V3.7.30**。

---

## 一、需求分析

### 1.1 需求

在罗盘「宫位释义」面板（`PalaceExplanationPanel`）加入入口：用户点击一次，即让 Agent 解释当前选中宫位的卦象信息。

### 1.2 现有约束（决定了接入方式）

| 约束 | 事实 | 影响 |
|---|---|---|
| 面板归属 | `PalaceExplanationPanel` 同时挂在 `ol/components/MapContainer.vue` 与 `cesium/components/CesiumContainer.vue` | 无法直接拿到 HomeView 的 `openChat`，需跨组件通道 |
| 侧栏懒加载 | `HomeView.vue` 中 `<SidePanel v-if="shouldLoadSidePanel">` + `defineAsyncComponent` | 用户可能从未打开聊天，`ChatPanelContent` 尚未挂载，不能直接调其方法 |
| 发送方法私有 | 真正的发送编排是 `ChatPanelContent.dispatchSend()`（private） | 外部不能直接调用 |
| 已有跨组件先例 | `useChatStore.setExecutor()` 已承担「由 ChatPanelContent 注入、他处取用」的桥接职责 | 复用该 store 最符合既有风格 |

**结论**：走 store 队列 + 请求信号，而非直接组件调用。

---

## 二、方案设计

```
[PalaceExplanationPanel]
        │ ① requestPrompt(问题文本)
        │ ② requestOpenChat()
        ▼
   useChatStore  ── pendingPrompt / openChatSignal ──┐
        │                                            │
        │                              ┌─────────────┘
        ▼                              ▼
[useHomePanels] watch(openChatSignal)  [ChatPanelContent] watch(pendingPrompt)
   → openSidePanelTab('chat')            → consumePrompt() → dispatchSend()
```

### 关键设计点

1. **消息不丢**：`ChatPanelContent` 消费前设三道前置检查 —— 无在途请求、服务已就绪、确有文本。任一不满足则**不消费**，文本留在队列，等 `isLoading` 变 false 或 `serviceReady` 变 true 时补消费。
2. **连续点击可重入**：`openChatSignal` 用**递增计数**而非布尔量，避免「第一次 true 后不再触发」。
3. **上下文锚点完整**：提问文本包含主题名、层序号、层名、宫位名四项，模型无需猜测盘面位置。

### 提问文本（i18n `compass.askAgentPrompt`）

```
请解释风水罗盘「{theme}」第 {layer} 层{layerName}中「{palace}」的含义：
包括它的卦象与五行属性、对应方位、吉凶判断依据，以及在风水实践中的典型用法和需要注意的禁忌。
```

例：`请解释风水罗盘「地理专业版」第 4 层「二十四山」中「子」的含义：……`

---

## 三、变更文件清单

| 文件 | 改动 |
|---|---|
| `domains/common/chat/stores/useChatStore.ts` | 新增 `pendingPrompt` / `openChatSignal` 状态与 `requestPrompt` / `consumePrompt` / `requestOpenChat` 方法 |
| `app/composables/useHomePanels.ts` | `watch(chatStore.openChatSignal)` → `openChat()`；引入 `useChatStore` 与 `watch` |
| `domains/common/chat/components/ChatPanelContent.ts` | `init()` 内新增 `flushPendingPrompt()` 与三个 watch（pendingPrompt / isLoading / serviceReady） |
| `domains/common/compass/components/PalaceExplanationPanel.ts` | 注入 `useChatStore`；新增 `resolveLayerName()` / `buildAgentQuestion()` / `handleAskAgent` |
| `domains/common/compass/components/PalaceExplanationPanel.vue` | 底部新增「问 AI 解释宫位」按钮与样式；补 `@media (pointer: coarse)` 40px 触屏档 |
| `locales/zh-CN/misc.ts` / `en-US/misc.ts` | 新增 `compass.askAgent`、`compass.askAgentPrompt` |

### 位置选择理由

按钮放在 `.panel-footer`（原本只有一行「风水要点」提示）：
- 面板内容区是逐层解释的阅读区，插入按钮会打断阅读流；
- 底部是全宽操作区的惯例位置，且不遮挡右上角关闭按钮与图层徽标；
- 与面板既有金色描边语言一致，视觉上不突兀。

---

## 四、影响范围

| 模块 | 影响 |
|---|---|
| 罗盘宫位面板 | 新增一个按钮，点击后展开侧栏并自动提问 |
| 聊天面板 | 新增「消费外部投递提问」入口；不改变原有发送链路 |
| 首页侧栏 | 新增对 `openChatSignal` 的 watch，行为与点击「AI 助手」页签一致 |
| 其他入口 | 无影响（新增字段与方法是增量，未改动既有字段语义） |

**已知限制**：该功能依赖 Agent 服务可用。若用户未登录、未配置 Key 或后端代理配额耗尽，按钮点击后会展开聊天面板但不产生回答（`dispatchSend` 的守卫会拦下，提问保留在队列）。这是既有服务状态的正确表现，未额外加提示。

---

## 五、测试方案

### Agent 已执行（实测结果）

| 检查 | 结果 |
|---|---|
| 前端类型检查 | `npx vue-tsc --noEmit` → `EXIT=0`，无输出 ✅ |
| 结构树门禁 | 746 / 746，漏登记 0 · 幽灵条目 0 ✅ |
| 配置登记门禁 | B1–B4 / F1–F7 全通过 ✅（本次未新增配置 key） |
| 样式结构 | `PalaceExplanationPanel.vue` 样式块花括号配平 54 : 54 ✅ |

> ⚠️ **过程中的两次虚警（均为并行会话的编辑中途快照，非本次引入）**：
> 1. 首次 `vue-tsc` 报 `urlState.ts(2,1) TS6133: getCompassThemeIndex 未使用` —— 复跑时该符号已在 L118 被使用，错误消失。
> 2. 首次 `CheckStructureTree` 报 `compassThemeCode.ts` 漏登记 —— 复跑时该条目已存在于 `frontend-structure.md:720`，门禁转绿。
>
> 教训：本仓库存在并行会话同时改动同一批文件，单次门禁/类型检查结果可能失真，**必须复跑到稳定态**再下结论。

### 待用户实机验证

1. 启用罗盘 → 点击某宫位 → 面板弹出 → 点击底部「问 AI 解释宫位」
   - **预期**：右侧栏展开并切到「AI 助手」页签；用户消息气泡立即出现，内容含主题名、层号、层名、宫位名
2. 等待流式回答
   - **预期**：AI 按卦象/五行/方位/吉凶/用法作答，且**不误调用地图工具**（该提问为纯知识问答）
3. 聊天面板已打开时，切换到另一宫位再点「问 AI」
   - **预期**：新提问直接追加到当前会话并发送
4. 在 AI 回答过程中（流式中）点击「问 AI」
   - **预期**：侧栏不重复展开，提问保留在队列，待本轮结束自动发出（不丢失、不打断）
5. 未登录/未配置 Agent 服务时点击
   - **预期**：侧栏展开，但无回答；配置就绪后队列中的提问自动发出

---

## 六、遗留与风险

1. **提问走的是通用对话通道**，模型可能顺带调用地图工具（受系统提示约束）。若实测出现异常工具调用，可在 `buildAgentQuestion()` 末尾追加「仅作知识解答，无需操作地图」的约束语。
2. `useSidePanel.ts` 为未被调用的遗留 composable（真实实现已迁至 `useHomePanels.ts`），本次未清理，避免越权删除。
3. 按钮样式使用面板既有的 `$feng-shui-gold` SCSS 变量，未引入新的设计令牌。
