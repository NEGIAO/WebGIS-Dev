# 2026-05-29 修复模式切换时模型未同步问题

## 日期和时间
2026-05-29 10:30

## 修改内容
修复 ChatPanelContent.vue 中"个人 Key 模式"与"后端代理模式"切换时，当前模型名称未同步更新的 Bug。

## 修改原因
**问题事件逻辑链条分析**：

### 核心症状
用户从"个人 Key 模式"（直连模式）切换到"后端代理模式"后，界面显示的"当前模型"仍为直连模式的模型（如 `mimo-v2.5-pro`），而非后端配置的模型。

### 根本原因
`toggleRoutingMode` 函数在切换模式时：
1. 清空了 `directConfig`（直连配置）
2. 调用 `syncDraftFromDirectConfig()` 同步配置面板
3. 调用 `updateWelcomeMessageIfNeeded()` 更新欢迎消息

**但遗漏了关键步骤**：未调用 `reloadAgentConfig()` 从后端获取真实的模型配置，导致 `modelName` 仍保持为直连模式的值。

### 受影响模块
- ChatPanelContent.vue（前端 AI 聊天面板）
- 模式切换逻辑
- 模型显示逻辑

## 优化解决方案

### 分析结果
个人 Key 模式和后端代理模式使用完全不同的：
- API Key 来源
- Base URL（`https://token-plan-cn.xiaomimimo.com/v1` vs 后端配置的 URL）
- Model（`mimo-v2.5-pro` vs 后端配置的模型）

切换模式时必须重新从后端获取模型配置。

### 解决方案
在 `toggleRoutingMode` 函数末尾添加 `await reloadAgentConfig(false)` 调用，确保切换后立即同步后端配置。

### 实施步骤
1. 将 `toggleRoutingMode` 改为 `async` 函数
2. 在函数末尾添加 `await reloadAgentConfig(false)`
3. 这样切换到代理模式时，会自动从后端获取正确的模型名称

## 性能指标
- 修复后切换模式会增加一次后端 API 调用（约 100-200ms）
- 用户体验显著提升，模型显示与实际配置一致

## 测试方案
1. 打开 AI 聊天面板
2. 确认当前为"个人 Key 模式"，记录显示的模型名称
3. 点击切换到"后端代理模式"
4. 验证"当前模型"是否更新为后端配置的模型
5. 再切换回"个人 Key 模式"
6. 验证模型是否恢复为直连模式的默认模型

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Chat\ChatPanelContent.vue`
