# 2026-08-11 Agent 配置面板保存按路由模式隔离（Bug 修复）

- **日期与时间**：2026-08-11
- **任务等级**：L2（Bug 修复）
- **版本号**：V3.5.16 → **V3.5.17**

## 问题分析

- **核心症状**：在「默认 AI（管理员 Key）」模式打开 ⚙️ 配置面板，选择别的请求模型并保存；回到对话页（或切换/刷新路由模式）后，发现该模型变成了**后端代理模式**的模型。
- **根本原因**：配置面板（`ChatConfigPanel.vue`）所有字段绑定在共享草稿 `userConfigDraft`，保存按钮无条件走 `composables/useChatAgentConfig.js` 的 `saveUserConfig()`。该方法**没有任何路由模式意识**——无论当前处于哪个模式，都把 `draft.model`（连同 temperature / max_tokens 等全部字段）打包成 `backendPayload` 调用 `apiAgentUpdateUserConfig()`，写入后端 `agent_user_config` 表（`backend/api/agent_chat/db.py` 的 `_upsert_agent_user_config_sync` 直接落库 `model`）。而该表正是**后端代理模式的配置源**：`_resolve_effective_agent_runtime_sync` 把它合并为 effective runtime → `GET /chat/config` 返回的 `model` → `toggleRoutingMode()` 初始化 `proxyModel` 时读取 → 对话请求经 `override_model` 生效。于是「默认 AI 模式选的模型」静默变成「后端代理模型的默认值」，即跨模式污染。
- **受影响模块**：前端 Agent 配置链路（ChatConfigPanel → useChatAgentConfig → `/api/agent/user-config` / `/api/agent/chat/config`）。后端无需改动（写入方在前端）。
- **候选方案对比**：
  - a. 保存时按模式分流：默认 AI 模式只写模式内状态（`defaultAIModel` + localStorage + 账号偏好），完全不调用后端 user-config 接口 —— 根治污染，符合「在哪个模式打开就保存到哪个模式」的诉求，改动面小。
  - b. 后端增加字段区分 model 归属（personal / proxy / default_ai）—— 改动面大（建表/迁移/接口契约），超出本次 Bug 范围。
  - **选定方案 a**。
- **附带发现的同源缺陷**（一并修复）：保存时 `config.directConfig = emptyDirectConfig()` 会把管理员默认 AI 配置（base_url/model）清空；`reloadAgentConfig()` 默认 AI 分支的 `modelName` 永远取 `directConfig.model`，与实际请求模型（`defaultAIModel || dc.model`）不一致；该模式的模型选择不跨刷新持久化；`syncDraftFromDirectConfig` 在面板重开后把草稿模型重置回管理员默认值。

## 修改内容

仅一个文件：`frontend/src/domains/common/chat/composables/useChatAgentConfig.js`

1. `saveUserConfig()`：新增默认 AI 模式分支——`isDefaultAIMode && !personalApiKey` 时，模型只写入 `defaultAIModel` + localStorage（`saveModel`）+ 账号偏好（`apiAgentSaveModelPreference`），**跳过 `apiAgentUpdateUserConfig`**，也不再执行 `directConfig = emptyDirectConfig()`；toast 提示「已保存默认 AI 模式的模型选择（不影响后端代理配置）」。个人 Key 模式 / 后端代理模式保存行为不变。
2. `reloadAgentConfig()` 默认 AI 分支：`modelName = defaultAIModel || directConfig.model || modelName || '未配置'`，状态条与真实请求模型一致。
3. `loadAvailableModels()` 默认 AI 分支：`defaultAIModel` 为空时从 `readSavedModel()` 恢复该模式上次选择（仅当模型在上游可用列表内，防止跨模式误用）。
4. `syncDraftFromDirectConfig()`：默认 AI 模式下草稿模型优先取 `defaultAIModel`，面板重开后显示与真实请求一致。

## 修改原因

用户诉求：「在哪个模式下打开的配置，就保存到哪个模式下」。原实现把面板当作「后端代理模式的编辑界面」无条件落库，违反按路由模式隔离的预期，且让管理员模式的模型选择无法独立于后端代理模式存在。

## 影响范围

- 前端：Agent 对话的三种路由模式（默认 AI / 个人 Key / 后端代理）的配置保存语义；默认 AI 模式的状态展示与模型持久化。
- 后端：无代码改动；`agent_user_config` 表不再被默认 AI 模式的保存污染（历史已污染数据需用户在代理模式下手动改回，见遗留）。

## 性能指标

未实测（本任务与性能无关）。

## 测试方案

**Agent 已执行**：
- `npx eslint src/domains/common/chat/composables/useChatAgentConfig.js` → 零报错。
- 静态走查四条改动分支与既有调用点（`toggleRoutingMode` / `callLLM` / `pickModel` / `loadUserConfig`）的读写一致性。

**待用户实机验证**：
1. 默认 AI 模式 → ⚙️ 面板 → 更换请求模型 → 保存：toast 应为「已保存默认 AI 模式的模型选择」；状态条「当前模型」立即显示新选择的模型；随后切换/刷新为后端代理模式，其模型应为管理员默认（或用户此前在代理模式下设置的值），**不再是被污染的新模型**。
2. 刷新页面后回到默认 AI 模式：模型选择应自动恢复（若在上游列表内）。
3. 后端代理模式行为回归：在该模式打开面板改模型并保存 → toast「配置已保存到后端（后端代理模式）」，切走再切回仍是该模型。
4. 个人 Key 模式行为回归：填入 Key + 模型保存 → 进入个人 Key 模式，无异常。

## 变更文件清单

- `frontend/src/domains/common/chat/composables/useChatAgentConfig.js` — 配置保存按路由模式隔离（核心修复 + 3 处展示/持久化一致性）
- `README.md` — 版本号三处更新（简介行 / 版本演进表 / 页脚）
- `Docs/Guide/CHANGELOG.md` — V3.5.17 条目
- `Docs/LLM_record/26-08/2026-08-11/2026-08-11-fix-chatconfig-model-mode-scoped.md` — 本日志

## 遗留与风险

- **历史污染数据**：修复前已被写错的 `agent_user_config.model` 不会自动还原，用户需在后端代理模式下手动改回。
- 默认 AI 模式的生成参数（temperature / max_tokens / timeout / system_prompt）在该模式下编辑**仍不作用于该模式的请求**——后端 `/chat/default-proxy` 端点仅支持 `override_model` / `override_top_p` / `override_extra_body` 三个覆盖参数，属端点能力边界；如需面板参数对默认 AI 模式生效，须后端扩展（已记录待办，见下文）。
- `readSavedModel()`（localStorage `chat:selectedModel`）为全模式共享键，默认 AI 模式的恢复逻辑加了「仅当在上游列表内」守卫，与既有草稿回退逻辑同口径，跨模式误用风险已收敛；仍建议后续把各模式的模型偏好拆成独立 key（记入 TODO）。

## 顺带发现登记（只记不改）

- `saveUserConfig()` 提示语「API Key 仅保存在当前会话，刷新后需重新输入」与实际行为不符——`api_key` 会被写入 `agent_user_config` 表并在 effective runtime 中生效（`db.py` 明文落库）。需用户确认设计意图后单独处理。