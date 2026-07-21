# 2026-06-03 密码重置 UI/逻辑修复

## 日期和时间
2026-06-03

## 修改内容
修复前端密码重置弹窗的 UI 显示错误和逻辑缺陷，共 6 项修复。

## 修改原因
密码重置流程存在多个影响用户体验和数据正确性的 Bug：
- 重发验证码按钮与倒计时同时可见
- 成功提交后用户看不到提示消息
- 缺少表单校验导致无效数据可提交

## 影响范围
- 前端注册/登录页面（RegisterView.vue）的密码重置弹窗模块
- 无后端改动

## 优化解决方案

### 问题事件逻辑链条

| # | 问题 | 根本原因 | 修复方案 |
|---|------|---------|---------|
| 1 | 倒计时/重发按钮同时可见 | `startResetCountdown()` 在 `resetStep=2` 后调用，首次渲染时 `resetCodeCountdown` 仍为 0，`v-if="resetCodeCountdown <= 0"` 为 true | 添加 `resetCodeSent` 标志位，重发按钮条件改为 `resetCodeSent && resetCodeCountdown <= 0`；倒计时改为独立 `v-if` 元素 |
| 2 | 成功消息被清除 | `closeResetPanel()` 内先调 `setFormState('', '')` 覆盖了 success | 调整顺序：先 `setFormState('success', ...)` 再 `closeResetPanel()`；`closeResetPanel()` 不再清除 formState |
| 3 | 提交时无邮箱校验 | `handleResetSubmit()` 不检查 `resetEmail` 格式 | 增加 `emailRegex` 校验 |
| 4 | 验证码输入无约束 | 缺少 `maxlength`/`inputmode`/`pattern` | 添加 `inputmode="numeric"` / `pattern="[0-9]*"` / `maxlength="6"` |
| 5 | 缺少确认密码 | 新密码只输入一次，误输无法察觉 | 添加确认密码字段 + 一致性校验 |
| 6 | 邮箱变更不回退步骤 | step 2 修改邮箱后验证码已失效但仍可提交 | 添加 `watch(resetEmail)` 监听，step 2 时自动回退到 step 1 并清除状态 |

### 实施步骤
1. 添加 `resetCodeSent` / `resetConfirmPassword` 响应式变量
2. 修改模板：重发按钮条件、倒计时独立元素、验证码输入约束、确认密码字段
3. 修改 `openResetPanel()` / `closeResetPanel()` 重置新变量
4. 修改 `handleResetSendCode()` 设置 `resetCodeSent = true`
5. 修改 `handleResetSubmit()` 增加邮箱校验 + 确认密码校验 + 成功消息顺序
6. 添加 `watch(resetEmail)` 邮箱变更回退逻辑

## 测试方案
1. 打开登录页 → 点击"忘记密码" → 输入邮箱 → 发送验证码
2. 验证：倒计时期间重发按钮不可见，倒计时结束后重发按钮出现
3. 验证：输入验证码 + 新密码 + 确认密码 → 提交 → 弹窗关闭后页面显示成功消息
4. 验证：确认密码不一致时提示错误
5. 验证：验证码输入框只接受数字，最多 6 位
6. 验证：step 2 修改邮箱后自动回退到 step 1

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\RegisterView.vue`
