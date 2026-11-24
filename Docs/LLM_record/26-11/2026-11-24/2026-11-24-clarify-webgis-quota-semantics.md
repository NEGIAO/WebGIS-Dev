# 2026-11-24 明确额度耗尽指 WebGIS 平台 API 额度

- **日期与时间**：2026-11-24 16:03
- **任务等级**：L2（提示词语义与用户文案）
- **版本**：V3.7.16

## 用户澄清

“额度耗尽”不是模型供应商额度，而是 WebGIS 系统对 guest / registered 用户的 API 额度限制：

- guest 默认每日 100；
- login/register 用户默认每日 1000；
- 调用 API 相关工具会消耗该系统额度；
- 管理员可在 system_config 调整上述默认值。

后端 config catalog 已确认：

- `API_GUEST_DAILY_QUOTA` default 100
- `API_REGISTERED_DAILY_QUOTA` default 1000
- `AGENT_TOKENS_PER_UNIT` default 1000 tokens/unit

## 修改

### 系统提示词

把额度耗尽约束改为：

```text
这是 WebGIS 平台自身的 API 额度，不是模型供应商额度；
调用 API 相关工具会消耗该额度；
guest 默认 100/日，注册用户默认 1000/日（管理员可调）；
额度耗尽后停止调用工具，提示登录/注册以获得更高额度。
```

### 用户文案

`chat.quotaToolUnavailable` 改为明确“WebGIS API 额度”，并说明默认 100 / 1000 与管理员可调。

## 验证

- 后端 `backend/config/catalog.py` 核对：`API_GUEST_DAILY_QUOTA=100`、`API_REGISTERED_DAILY_QUOTA=1000`、`AGENT_TOKENS_PER_UNIT=1000`。
- `vue-tsc --noEmit` 0 报错；ESLint（3 个文件）0 warning。
- 结构树 749/749、配置登记、Vue 范式 72/72、领域隔离全绿；生产构建临时目录成功（4774 modules，11.39s）。
- 未改运行时逻辑；仅修正提示词语义与用户文案。

## 变更文件

- `frontend/src/domains/common/chat/constants/agentToolsSchema.ts`
- `frontend/src/locales/zh-CN/search-shell.ts`
- `frontend/src/locales/en-US/search-shell.ts`
- `README.md` / `Docs/Guide/CHANGELOG.md`
- 本文件
