# URL 参数 cs/p 未授权时不应有非零值

> **日期**：2026-06-19 12:30  
> **大版本**：3.0.x（日常迭代）  
> **状态**：✅ 已完成

---

## 一、问题事件逻辑链条分析

### 核心症状

URL 中 `cs`（罗盘）和 `p`（定位）参数在用户未开启罗盘/未授权定位时，仍显示非零值：
- 示例：`#/home?ut=guest&cs=iCWAbUix3DyHLL&p=uBBxtiLoQY&loc=0`
- 用户未开启罗盘 → `cs` 应为 `0` 或不显示
- 用户未授权定位 → `p` 应为 `0`

### 根本原因

**p 参数（3 条路径导致非零值）：**

1. **`syncVisitPosCodeToUrl()`**（HomeView.vue:1011）：服务器访问日志返回 `encoded_pos`（基于 IP 地理编码），函数无条件写入 `p` 和 `loc=1`，但 IP 编码 ≠ 用户授权浏览器定位
2. **`getGlobalUserLocationContext()`**（userLocationContext.js:150）：从 localStorage 读取上次会话缓存的定位数据，`resolvePositionCode()` 看到 `hasGlobalLocation=true` 就写非零 `p`
3. **`resolvePositionCodeForShare()`**（TopBar.vue:550）：分享链接构建时从已有 URL 透传 `p` 值，不检查 `loc` 标记

**cs 参数（1 条路径）：**

- **`buildShareMarkedUrl()`**（TopBar.vue:612）：不检查罗盘 `enabled` 状态，无条件保留 URL 中已有的 `cs` 参数

### 受影响模块

| 模块 | 影响说明 |
|------|----------|
| URL 参数管理 | `p` 和 `cs` 参数语义失真，无法区分"用户授权"和"系统自动填充" |
| 分享链接 | 分享出去的链接携带未授权的定位和罗盘信息 |
| 定位逻辑 | `resolvePositionCode()` 基于 `loc=1` 或 `hasGlobalLocation` 写入位置，两个条件都可能被非授权触发 |

---

## 二、优化解决方案

### 修复 1: syncVisitPosCodeToUrl() 增加定位授权检查

**文件**：`frontend/src/views/HomeView.vue`

将客户端 `geo_permission` 状态传递给 `syncVisitPosCodeToUrl()`。当 `geo_permission === 'denied'` 时：
- 不写入服务器返回的 IP 编码位置
- 清除已有的非零 `p` 和 `loc` 参数（来自之前会话的残留）

### 修复 2: getGlobalUserLocationContext() 增加 loc 标记检查

**文件**：`frontend/src/services/userLocationContext.js`

从 localStorage 恢复定位上下文时，检查当前 URL 是否有 `loc=1` 标记：
- `loc=1` → 当前会话已授权定位 → 允许恢复缓存
- 无 `loc=1` → 当前会话未授权 → 返回 `null`，不使用缓存

新增 `hasUrlLocFlag()` 辅助函数读取 URL 中的 `loc` 参数。

### 修复 3: resolvePositionCodeForShare() 增加 loc 检查

**文件**：`frontend/src/components/Shell\TopBar.vue`

分享链接构建时，只在 `loc=1` 时保留非零 `p` 值，否则返回 `'0'`。

### 修复 4: buildShareMarkedUrl() 条件性保留 cs

**文件**：`frontend/src/components/Shell\TopBar.vue`

引入 `useCompassStore`，只在 `compassStore.enabled === true` 时保留 `cs` 参数，否则删除。

---

## 三、修改的文件路径

```
d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\HomeView.vue
d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Shell\TopBar.vue
d:\Dev\GitHub\WebGIS_Dev\frontend\src\services\userLocationContext.js
```

---

## 四、测试方案

1. 清除 localStorage，访问 `#/home?ut=guest`（无 cs/p 参数）
2. 不授权定位、不开启罗盘 → URL 应保持无 `p`/`cs` 或为 `0`
3. 点击分享 → 分享链接中 `p=0`、无 `cs`
4. 授权定位后 → `p` 有非零值、`loc=1`
5. 开启罗盘后 → `cs` 有非零值
6. 关闭罗盘后 → `cs` 消失或为 `0`
7. 刷新页面（不授权定位）→ `p` 保持为 `0`（不从 localStorage 恢复）

---

## 五、变更摘要

| 维度 | 变更前 | 变更后 |
|------|--------|--------|
| p 参数（未授权） | 服务器 IP 编码写入 + loc=1 | 不写入，清除残留 |
| p 参数（localStorage 恢复） | 无条件恢复 | 检查 loc=1 后才恢复 |
| p 参数（分享链接） | 透传已有值 | 仅 loc=1 时保留 |
| cs 参数（分享链接） | 无条件保留 | 仅罗盘 enabled 时保留 |
