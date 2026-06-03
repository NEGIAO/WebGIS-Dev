# 2026-06-03 修复邮箱验证码发送逻辑（后端+前端）

## 日期和时间
2026-06-03 15:30

## 修改内容
修复邮箱验证码发送流程中的核心 Bug：**邮件发送失败时，数据库中残留的验证码记录导致频率限制误拦截，用户无法重试发送**。

## 修改原因
用户反馈后端邮件发送不成功，但前端点击重试时被 30 秒频率限制拦截。

### 问题分析（事件逻辑链条）

**核心症状**：用户点击"发送验证码"后，后端邮件发送失败（500），但再次点击时返回 429 频率限制，用户无法重试。

**根本原因**：`routes.py` 中的执行顺序有设计缺陷：
```
1. 频率限制检查 ← 30秒内有记录就拒绝
2. 生成验证码并存入数据库 ← 先存库
3. 尝试发送邮件 ← 发送失败
4. 返回 500 错误
```
- 步骤 2 先将验证码存入数据库（含 `created_at` 时间戳）
- 步骤 3 邮件发送失败，返回 500
- 用户重试时，步骤 1 检查发现 30 秒内有记录 → 返回 429
- **数据库中有记录但用户从未收到邮件，形成了"幽灵频率限制"**

**受影响模块**：
- 后端 `routes.py` 的 `/api/auth/send-code` 端点
- 后端 `verification.py` 的频率限制检查
- 前端 `RegisterView.vue` 的 `handleSendCode` 和 `handleResetSendCode`

## 优化解决方案

### 后端修复（核心）

**1. 邮件发送失败时清理验证码记录**（`routes.py`）：
```python
sent = await send_verification_email(...)
if not sent:
    # 邮件发送失败：清理已存储的验证码记录，避免频率限制误拦截
    await asyncio.to_thread(delete_latest_code, email, payload.purpose)
    raise HTTPException(status_code=500, detail="验证码邮件发送失败，请稍后重试")
```

**2. 新增 `delete_latest_code` 函数**（`verification.py`）：
- 删除指定邮箱和用途的最新未使用验证码记录
- 仅在邮件发送失败时调用，不影响正常流程

### 前端修复

**发送失败时不启动倒计时**（`RegisterView.vue`）：
- 仅在**发送成功**或**超时**或**429 频率限制**时启动 30 秒倒计时
- **500 错误**（邮件发送失败）不启动倒计时，允许用户立即重试
- 后端清理记录后，用户重试不会被频率限制拦截

### 错误处理策略总结

| 场景 | 后端行为 | 前端行为 |
|------|---------|---------|
| 发送成功 (200) | 返回成功 | 启动 30s 倒计时 |
| 频率限制 (429) | 拒绝请求 | 启动 30s 倒计时 |
| 超时 | 不确定 | 启动 30s 倒计时（防重复） |
| 发送失败 (500) | **清理验证码记录** | **不启动倒计时，允许重试** |
| 邮箱已绑定 (409) | 拒绝请求 | 不启动倒计时 |

## 影响范围
- 后端：`routes.py`（send-code 端点）、`verification.py`（新增 delete_latest_code）
- 前端：`RegisterView.vue`（handleSendCode、handleResetSendCode）

## 测试方案
1. **正常流程**：输入邮箱 → 发送成功 → 收到验证码 → 30s 倒计时
2. **发送失败后重试**：模拟 SMTP 失败 → 返回 500 → 立即重试 → 不被 429 拦截
3. **频率限制**：30s 内重复发送 → 返回 429 → 启动倒计时
4. **超时场景**：请求超时 → 启动倒计时 → 防止重复发送

## 修改的文件路径
- `WebGIS_Dev/backend/api/auth/routes.py`
- `WebGIS_Dev/backend/api/auth/verification.py`
- `WebGIS_Dev/frontend/src/views/RegisterView.vue`