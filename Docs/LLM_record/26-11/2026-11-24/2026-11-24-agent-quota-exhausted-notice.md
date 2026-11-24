# 2026-11-24 额度耗尽时 Agent 主动提示并停止工具调用

- **日期与时间**：2026-11-24 15:25
- **任务等级**：L2（Agent 提示词与错误处理）
- **版本**：V3.7.12

## 问题

访客用户额度耗尽后，Agent 仍尝试工具调用或静默失败；用户看不到明确说明，也不知道可以登录后获得更多额度。

## 根因

1. `dispatchSend` 在 `quotaExhausted` 时直接 `return`，没有生成可见回复。
2. 多轮工具循环中捕获 `isQuotaExceeded` 时，只设置 `statusHint` 并移除气泡，没有在对话流中说明“无法继续调用工具”。
3. 首轮 LLM 请求配额失败时，气泡只显示通用“请求失败”。
4. 系统提示词没有把“额度耗尽”列为终止条件。

## 修复

### 1. 提示词约束

新增：

```text
若工具调用或 LLM 返回额度耗尽/429/QUOTA_EXCEEDED：
- 立即停止继续调用工具，不得重试；
- 明确告知用户：今日额度已耗尽，当前无法调用工具；
- 建议用户登录或切换权限更高的账号以获取更多额度；
- 不得伪装成工具执行成功。
```

### 2. 发送前守卫

`dispatchSend` 在额度耗尽时不再静默返回，而是：

- 写入 `statusHint`；
- 在消息流追加一条错误提示气泡；
- 明确建议登录后使用。

### 3. 多轮工具循环

`roundErr.isQuotaExceeded` 时保留气泡并写入额度耗尽提示，不再移除气泡。

### 4. 首轮请求失败

`error.isQuotaExceeded` 时气泡内容改为额度耗尽提示，而不是通用“请求失败”。

### 5. 文案

新增 `chat.quotaToolUnavailable`：

- 中文：今日额度已耗尽，Agent 无法继续调用工具。请登录或切换权限更高的账号，获取更多额度后使用本系统。
- 英文对应提示。

## 测试方案

### Agent 已执行

- 代码级核对：系统提示词已把额度耗尽列为终止条件；发送前守卫、多轮工具异常、首轮请求异常三处均改为写入 `chat.quotaToolUnavailable`。
- 中英文 locale 已新增 `chat.quotaToolUnavailable`。
- `vue-tsc --noEmit` 0 报错；ESLint（4 个文件）0 warning。
- 结构树 749/749、配置登记、Vue 范式 72/72、领域隔离全绿；生产构建临时目录成功（4774 modules，14.27s）。
- 未执行真实访客额度耗尽实测（需后端账户与额度状态），待用户实机验证。

### 待用户实机验证

1. 访客额度耗尽后提问，应立即看到额度提示，不出现工具调用。
2. 多步任务执行到一半额度耗尽，应立即停止并在对话里说明原因。
3. 默认 AI / 个人 Key 模式不应触发该提示。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/chat/constants/agentToolsSchema.ts` | 系统提示词约束 |
| `frontend/src/domains/common/chat/components/ChatPanelContent.ts` | 三处配额失败处理 |
| `frontend/src/locales/zh-CN/search-shell.ts` / `en-US/search-shell.ts` | 新文案 |
| `README.md` / `Docs/Guide/CHANGELOG.md` | 版本记录 |
| 本文件 | L2 维护日志 |

## 遗留与风险

- 默认 AI 模式免费，不受平台额度限制。
- 个人 Key 直连不消耗平台额度，不触发该提示。
