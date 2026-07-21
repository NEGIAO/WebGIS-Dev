# 2026-06-04 瓦片请求生命周期 Code Review & AbortController 修复

**日期和时间**：2026-06-04 01:30

---

## 修改内容

1. **重写 `tileLifecycle.ts`**：将 `img.src` 替换为 `fetch()` + `AbortController.signal`，使 `abort()` 能真正中断底层 TCP 连接
2. **修复 `useBasemapResilience.js`**：`validateBaseLayerSwitch` 的 `setTimeout` 在 `settle` 后未清除，存在 timer 泄漏

---

## 修改原因

### 核心症状

当底图请求地址被墙（GFW）时，切换底图后旧请求仍占据浏览器 6 个并发连接槽位 30-60 秒，新源请求被阻塞排队。

### 根本原因

`tileLifecycle.ts` 的 `prioritizeTileSourceRequest()` 通过 `img.src = srcUrl` 发起瓦片请求，但 `AbortController.signal` **从未绑定到实际网络请求**：

```
原流程：
  tileLoadFunction(tile, url)
    → 检查 signal.aborted（仅在加载前检查一次）
    → img.src = url（浏览器发起 HTTP，JS 无法中途取消）
    → controller.abort() 只设置 signal.aborted = true
    → 浏览器继续等待响应 30-60s，占据并发槽位

修复后：
  tileLoadFunction(tile, url)
    → 检查 signal.aborted
    → fetch(url, { signal })（signal 绑定到 fetch）
    → controller.abort() → fetch 立即 reject → TCP 连接释放
    → 成功时 blob URL → img.src
```

### 受影响模块

- 瓦片源工厂（`tileSource/`）：请求生命周期管理
- 底图切换（`useBasemapSelectionWatcher`）：切换时的请求阻断
- 底图容灾（`useBasemapResilience`）：健康监测与降级

---

## Code Review 发现

### 问题清单

| 严重性 | 文件 | 问题 | 状态 |
|--------|------|------|------|
| 🔴 P0 | `tileLifecycle.ts:69-81` | `AbortController.signal` 未绑定到 img.src 请求，abort() 不中断网络连接 | ✅ 已修复 |
| 🔴 P0 | `tileLifecycle.ts:80` | 非 HTMLImageElement 分支直接调用原始函数，完全绕过 signal | ⚠️ 保留（Canvas 需要特殊处理） |
| 🟡 P1 | `tileLifecycle.ts:76-78` | img.src 无超时控制，被墙请求挂起 30-60s 占满连接池 | ✅ 已修复（TILE_REQUEST_TIMEOUT_MS） |
| 🟡 P1 | `useBasemapResilience.js:101` | setTimeout 在 settle 后未 clearTimeout，timer 泄漏 | ✅ 已修复 |
| 🟡 P2 | `useBasemapSelectionWatcher.js:189` | setSource(null) 后未延迟重建，visibility 切换时可能失败 | 🔵 待跟进 |
| 🟠 P3 | `useBasemapResilience.js:122` | FALLBACK_OPTIONS 硬编码，无法按源动态配置 | 🔵 待跟进 |

### 已修复详情

#### tileLifecycle.ts — fetch() 替代 img.src

**新增 `fetchTileAsBlobUrl()` 函数**：
- 用 `fetch()` + `AbortController.signal` 加载瓦片图片
- 成功时返回 `blob URL`，失败/中断时返回 `null`
- abort 时立即释放底层 TCP 连接

**重写 `prioritizeTileSourceRequest()`**：
- HTMLImageElement 路径：`fetch()` → blob URL → `img.src`
- 非 HTMLImageElement 路径：保留原始 loadFunction（Canvas 等需特殊处理）
- abort 监听器：释放 blob URL 防止内存泄漏
- 超时控制：`TILE_REQUEST_TIMEOUT_MS`（15 秒）标记 tile 为错误
- epoch 双重检查：fetch 回调时再次验证 epoch 和 signal

**增强 `abortTileSourceRequests()`**：
- 四层级联：epoch++ → `controller.abort('tile-source-aborted')` → 标记 tile → `source.clear()`
- abort 原因字符串便于调试

#### useBasemapResilience.js — timer 泄漏修复

**`validateBaseLayerSwitch()`**：
- 新增 `timeoutId` 变量跟踪 setTimeout
- `settle()` 和 `cleanup()` 中均调用 `clearTimeout(timeoutId)`
- 确保 Promise resolve 后不再有悬挂的 timer

---

## 测试方案

### 测试环境

- 本地开发环境，Chrome DevTools Network 面板
- 模拟被墙场景：将底图 URL 改为不存在的域名

### 测试步骤

1. **验证 abort 释放连接**：
   - 加载一个被墙的底图（如 Google 卫星图在无代理环境）
   - Chrome DevTools → Network → 观察请求状态
   - 切换底图 → 预期：旧请求立即变为 `(canceled)` 状态
   - 新请求立即开始（不排队等待）

2. **验证超时控制**：
   - 加载一个响应极慢的源（>15 秒）
   - 预期：15 秒后 tile 标记为错误，触发降级

3. **验证正常瓦片加载**：
   - 加载正常的底图源
   - 预期：瓦片正常显示，无明显性能差异

4. **验证 timer 泄漏修复**：
   - 快速连续切换底图 5 次
   - Chrome DevTools → Performance → 检查 timer 数量
   - 预期：无悬挂的 setTimeout

---

## 性能指标

- **连接释放速度**：从 30-60 秒（浏览器超时）→ **立即**（fetch abort）
- **并发槽位释放**：切换底图后旧请求立即释放 6 个浏览器连接槽位
- **内存**：blob URL 在 abort/error 时通过 `URL.revokeObjectURL()` 及时释放

---

## 修改的文件路径

| 操作 | 文件绝对路径 |
|------|-------------|
| **修改** | `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\tileSource\tileLifecycle.ts` |
| **修改** | `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useBasemapResilience.js` |
