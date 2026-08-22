# 首屏 Loading 遮罩过早消失导致白屏 — 全链路排查与 minDurationMs 调试覆写

- **日期时间**：2026-08-22 09:32
- **任务等级**：L2

---

## 问题分析

### 核心症状

登录后进入 `/home`，OL 地图真正挂载绘制到 MapContainer 之前出现约 2s 白屏。Loading 遮罩（`GlobalLoading.vue`）消失得过早——遮罩隐藏后地图仍未可见。

### 根本原因

就绪判定门槛过弱 + 调试覆写参数未生效：

1. **就绪门槛只等 1 张瓦片**：`useStartupTaskScheduler.js` 的 `waitForCriticalTileReady()` 就绪条件为「任意一张底图瓦片 `tileloadend` → 其后一次 `rendercomplete` → 连续两帧 rAF」。第一张瓦片到位即触发 `emit('map-core-ready')` → HomeView `settleMapCoreLoading()` → `hideLoading()`。此时视口内其余瓦片仍在下载，遮罩消失后露出未铺满的白底约 2s。
2. **10s 调试覆写静默失效**：路由守卫已传入 `showLoading(t('loading.mapEngine'), { minDurationMs: 10000 })`，但 `useAppStore.showLoading` 的 options 类型只有 `{ timeoutMs, hideDelayMs }`，**不认识 `minDurationMs`，该参数被静默忽略**——用户设置的 10s 最短持续时间从未生效。

### 受影响模块

- 首屏启动链路：router.beforeEach（Loading Relay）→ MapContainer.onMounted → waitForCriticalTileReady → map-core-ready → HomeView.settleMapCoreLoading
- 全局 Loading 状态：useAppStore（showLoading / hideLoading）
- UI 呈现：GlobalLoading.vue（Teleport 到 body 的全局遮罩）

## 修改内容

1. `frontend/src/domains/common/app/stores/useAppStore.ts`
   - `showLoading` options 新增 `minDurationMs?: number`；记录本轮遮罩开始时间戳。
   - 新增模块内状态：`loadingMinDurationMs`、`loadingShownAtMs`、`minDurationTimerId`；新一轮 show 时清理旧 minDuration 定时器并归零（防泄漏到无关任务）。
   - `hideLoading()` 增加最短持续时间分支：就绪事件早于时长满足时挂 setTimeout 推迟隐藏（幂等，只挂一个）；到期后走 `forceHideLoading()`。
   - `forceHideLoading()` 同步清理 minDuration 定时器（超时兜底路径可绕过最短时长强制隐藏）。

2. `frontend/src/router/index.js`（磁盘已有改动，本次确认接通）
   - 守卫两处 `showLoading(t('loading.mapEngine'), { minDurationMs: MAP_ENGINE_LOADING_MIN_DURATION_MS })`，常量 10000ms，用于调试验证「覆盖到地图完全绘制」是否消除白屏。
   - 注释已说明该值须小于 useAppStore 默认 15s 自动兜底超时。

3. 附带确认（非本次修改）：文件顶部注释一行（上一会话 L1 任务遗留）。

## 修改原因

首屏白屏影响观感；用户要求先以 10s 固定覆写做调试实验，验证「遮罩持续足够久即可消除白屏」这一假设，再决定后续是否将就绪判定升级为「视口瓦片全部加载完成」级别的严格标准。

## 影响范围

- 全局 Loading 行为：仅显式传 `minDurationMs` 的调用受影响；其余所有 `showLoading/hideLoading` 调用点行为不变（未传时归零）。
- 首屏启动链路：`/home` 与 register→home 重定向两条路径的遮罩持续时间被覆写为 ≥10s（调试期）。

## 解决方案

### 方案对比

| 方案 | 说明 | 结论 |
|---|---|---|
| A. 直接升级就绪判定（等待视口瓦片全部加载） | 从根上解决，但改动调度器核心逻辑，风险较高 | 后续方案，需单独验证 |
| B. minDurationMs 最短持续时间机制 | 在 store 层兜底延迟 hide，通用且低风险 | **本次采用**（调试覆写） |

### 选型理由

用户明确要求「设置遮罩持续时间为 10s 覆写用于调试」——目的是先做假设验证实验。方案 B 恰好以最小改动实现该实验手段，同时沉淀为通用的 `minDurationMs` 能力；方案 A 作为根因修复留待实验结论后推进。

### 关键实现细节

- `hideLoading()` 中最短时长分支优先于既有 `hideDelayMs` 分支；两者到期后统一收敛到 `forceHideLoading()`。
- 15s 自动兜底超时（timeoutMs 默认 15000）走 `forceHideLoading()` 强制隐藏，不受 minDuration 拖延，保证极端网络下不会永久卡遮罩。
- 10s < 15s 兜底，因此调试期间实际生效的隐藏时机 = minDuration 到期（若就绪事件早于 10s）或真实就绪（若晚于 10s）。

## 性能指标

未实测（调试性改动，无前后性能数据可比对）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `npx tsc --noEmit` 通过，零报错 | 1. 清缓存硬刷新，登录进入 `/home`，观察遮罩是否持续约 10s 才消失 |
| 全链路代码走读确认调用链（见问题分析） | 2. 预期：遮罩消失时 OL 底图已完全绘制，白屏不再出现 |
| 确认 `minDurationMs` 在 store 端被正确解析与应用 | 3. 若仍有白屏 → 白屏另有原因（如 DOM 挂载时序），需回退排查 |
| | 4. 观察控制台不应出现 `[Loading Timeout] Auto-hiding`（10s 早于 15s 兜底） |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/app/stores/useAppStore.ts` | showLoading 支持 minDurationMs 最短持续时间；hideLoading 增加推迟隐藏分支 |
| `frontend/src/router/index.js` | （磁盘已有）守卫传入 minDurationMs:10000 调试覆写 + 常量与注释 |
| `Docs/LLM_record/26-08/2026-08-22/2026-08-22-loading-overlay-premature-hide.md` | 本日志 |

## 遗留与风险

- **根因未修**：`waitForCriticalTileReady()` 只等 1 张瓦片的弱判定仍在，10s 是掩盖而非修复。调试确认有效后，建议下一步将其升级为「主底图视口瓦片队列清空（loadend/所有 tiles loaded）+ rendercomplete」的严格判定，或按视口瓦片数量动态计算。
- **其他调用点的语义**：minDurationMs 目前仅首屏链路使用；若未来在短任务（如上传提示）上误用大数值会人为拖慢交互，使用时须注意。
- **顺带发现**：HomeView.vue 第 820 行附近存在疑似笔误 `\ console.error(...)`（反斜杠开头），不影响运行但语法怪异，已记入 TODO 待处理清单范畴，本次未动。
