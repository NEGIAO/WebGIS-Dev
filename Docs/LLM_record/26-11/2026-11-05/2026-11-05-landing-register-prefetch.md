# Landing → 注册页过渡首次卡顿：资源预取 + 就绪门控

- **日期与时间**：2026-11-05 10:05
- **任务等级**：L2
- **版本**：V3.6.41

---

## 一、问题分析

### 1.1 症状

Landing 三个入口（导航「登录」、首屏「立即体验」、底部「开始使用」）点击后，**第一次**过渡会先卡一下再播动画；之后再次点击则顺畅。

### 1.2 代码位置（该功能来自提交 `1aaa6585 V3.6.40`）

| 文件 | 作用 |
|---|---|
| `frontend/src/app/composables/useViewTransitionNavigation.ts` | `startViewTransition` 包装：快照 → `router.push` → `nextTick` → 新快照 |
| `frontend/src/app/LandingView.vue` | 三个入口共用 `onRegisterClick` → `goRegister('/register', el)` |
| `frontend/src/router/index.js:6` | `const RegisterView = () => import('../app/RegisterView.vue')`（惰性 chunk） |
| `frontend/src/assets/theme.css` | 形变时长：装饰层 620ms / 表单卡 680ms / root 420ms |

### 1.3 根因

`document.startViewTransition` 的语义是「拍旧快照 → 执行回调 → 拍新快照」，**回调期间浏览器冻结旧快照**。因此回调里任何网络等待都会直接表现为"页面卡住"。

首次点击时，回调内恰好有两条**串行**的资源依赖：

1. **路由守卫的会话校验**（`router/index.js:181`）
   `await authStore.ensureValidSession()`。已登录用户会 `import('@/api/backend/auth')` 并请求 `GET /api/auth/me`；`ensureValidSession` 只在 `validatedToken === token` 时短路，而落地页从不触发校验（全仓库仅守卫一处调用）→ **首次导航必然现取**。
2. **注册页 chunk**
   `RegisterView` 构建产物为 **36 KB JS（gzip 9.87 KB）+ 35.6 KB CSS（gzip 6.67 KB）**，首屏未加载，点击时才取、才解析、才执行（组件 2600+ 行，另带 `AuthDecorBackground` 的纹样注入）。

第三条才是 620/680ms 的动画本身——它不卡，卡的是前两条。

**佐证**：第二次点击不卡。chunk 已进模块缓存、`validatedToken` 已置位，两条链均短路。

### 1.4 受影响模块

落地页路由入口、路由守卫（只读依赖，不改其逻辑）、注册页加载链路。

## 二、修改内容

| 方案 | 实现 |
|---|---|
| **A. 空闲预取** | 新增 `composables/useRoutePrefetch.ts`：落地页 `onMounted` 调 `armRegisterPrefetch()`，在 `requestIdleCallback`（`timeout: 3000` 兜底）里预取 `RegisterView` chunk；`onBeforeUnmount` 取消。**只预取 chunk，不做会话校验**——避免用户在落地页就被鉴权副作用影响 |
| **B. 意图预取** | 三个入口绑定 `@pointerenter` / `@focusin` / `@touchstart.passive` → `warmRegisterOnIntent()` → `prefetchRegisterRoute({ withSession: true })`：顺带把会话校验跑掉（此时用户已指向注册入口，校验失败本来也会在点击时发生） |
| **C. 就绪门控** | `useViewTransitionNavigation` 新增 `ready?: () => boolean` 选项；`canAnimate()` 汇总 `canAnimateViewTransition() && !skip() && ready()`，未就绪时直接 `router.push`，**不启动过渡** |

`isRegisterRouteReady()` 的判据：

```ts
chunkReady && (!getAuthToken() || sessionChecked)
```

游客只差 chunk；已登录用户还要等会话校验完成，否则守卫的 `await` 仍会落进回调。

## 三、修改原因

过渡的观感问题不在动画时长，而在"动画开始前的冻结"。把等待挪到点击之前，是唯一不牺牲动画的解法；再加就绪门控兜底，保证冷启动也不会出现冻结帧。

## 四、影响范围

落地页三个注册入口、路由跳转包装函数、注册页 chunk 的加载时机。不改路由守卫逻辑、不改鉴权语义、不改动画时长。

## 五、解决方案与关键决策

| 候选 | 结论 |
|---|---|
| 缩短动画时长 | 否决：卡顿来自冻结，不是动画 |
| 去掉 View Transitions | 否决：直接砍掉观感 |
| 把 `/register` 的守卫校验改为后台刷新 | 否决：动鉴权链路，风险高，收益小 |
| **预取 + 门控** | 选定：等待前移，未就绪时优雅降级为普通跳转 |

## 六、性能指标

| 项 | 数值 |
|---|---|
| 预取体积 | 36 KB JS + 35.6 KB CSS（gzip 合计约 16.5 KB） |
| 触发时机 | 落地页空闲（`requestIdleCallback`，3s 超时兜底） |
| 省流跳过 | `navigator.connection.saveData === true` 时完全不预取 |
| 首次点击回调内等待 | 由「chunk + 会话校验」降为 0（就绪后）；未就绪时走普通跳转，无冻结 |

真机/弱网下的端到端耗时未实测（见测试方案）。

## 七、测试方案

### 7.1 Agent 已执行

| 检查 | 结果 |
|---|---|
| `npx eslint`（3 个文件） | 0 problems |
| `npx tsc --noEmit` 过滤本模块 | 无报错 |
| `vite build` | 通过；`RegisterView` 仍为独立 chunk（36 KB + 35.6 KB），未被拉进入口 |
| 空闲预取是否真的发请求 | 浏览器实测：落地页空闲后出现 `RegisterView.vue` 及其 scoped CSS 两次请求 |
| 就绪判定 | 取全新模块实例：`isRegisterRouteReady()` 初始 `false`，`prefetchRegisterRoute()` 后 `true` |
| 就绪后的过渡 | 点击「登录」：`startViewTransition` 调用 **1 次**，路由到 `#/register`，表单卡存在 |
| 门控分支 | 代码路径为 `if (!canAnimate()) { await router.push(to); return; }`；未构造出"未就绪"的运行时态（本地模块解析过快），**依据静态审查** |

### 7.2 待用户实机验证

1. 硬刷新落地页后**立刻**点击「立即体验」→ 应直接进入注册页（无形变，也不卡），属预期的降级；
2. 停留 1~2 秒后再点 → 应完整播放形变，且无冻结感；
3. 已登录状态下重复第 2 步 → 同样无冻结（会话校验已在 hover 时完成）；
4. 弱网（DevTools Slow 4G）复测，确认最坏情况是"没动画但立即跳转"。

## 八、变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/app/composables/useRoutePrefetch.ts` | 新增：chunk 预取、会话预热、就绪判定、空闲排程 |
| `frontend/src/app/composables/useViewTransitionNavigation.ts` | 新增 `ready` 选项与 `canAnimate()` 汇总判断 |
| `frontend/src/app/LandingView.vue` | 挂载/卸载接线 + 三入口 `pointerenter`/`focusin`/`touchstart` 绑定 + `ready: isRegisterRouteReady` |
| `Docs/Guide/frontend-structure.md` | 登记新文件 |
| `README.md` / `Docs/Guide/CHANGELOG.md` | 版本号 V3.6.41 与条目 |

## 九、遗留与风险

1. **空闲预取会多下载约 16.5 KB（gzip）**，即使用户从不注册；已用 `saveData` 跳过省流用户，3s 超时兜底避免长期占用主线程。
2. **移动端首点通常走降级**：`touchstart → click` 间隔约 100ms，不足以完成 chunk 加载，因此手机上首次点击多半没有形变（但也不卡）。想改善需要更早的触发点（如首屏可见即预取），会与"省流量"目标冲突，暂不做。
3. **`ensureValidSession` 的副作用**：意图预取若校验失败会清理本地会话——这本是点击时会发生的结果，只是提前到了 hover，需知悉。
4. **认证页自己的入口未接**：`RegisterView` 内部的模式切换（登录/注册）不涉及路由，无需处理；但若将来新增其他到 `/register` 的入口，需同样接 `warmRegisterOnIntent`。
