# 2026-11-21 修复管理员登录后用户中心首次进入缺失管理 UI

- **日期与时间**：2026-11-21 10:56
- **任务等级**：L2（Bug 修复）
- **版本**：V3.7.6

## 问题分析

### 核心症状

以管理员身份在站内登录（SPA 内完成，未整页刷新）后，第一次进入用户中心（浮动账户面板）时，管理员专属 UI（「管理中心」「API 管理」两个页签及其视图）不出现；**整页刷新后**才恢复正常。

### 事件逻辑链（根因定位）

1. 管理 UI 的唯一可见性开关是 `FloatingAccountPanel.ts` 的 `isAdmin`，模板中 4 处消费（页签按钮 ×2、视图容器 ×2）。修复前其定义为：
   `isAdmin = !adminDenied && String(authStore.user?.role || '') === 'admin'`
   ——**只读 `authStore.user`**。
2. `authStore.user`（`useAuthStore.ts`）的**唯一写入口**是 `ensureValidSession()`（内部调 `/api/auth/me`），而该函数只被**路由守卫**（`router/index.ts:192`）与路由预取调用。
3. SPA 内登录链路（`RegisterView.handleLogin / quickGuestLogin`、OAuth 回调、Google One Tap、验证流程）成功后只调 `setAuthSession()`（写 sessionStorage + 广播 `webgis:auth-changed` 事件），**从不写 `authStore.user`**。
4. 登录成功后 `router.replace('/home')`，守卫存在两个短路分支不会执行 `ensureValidSession()`：
   - `appStore.isInitialGisLoadComplete && isHomeRoute` → 直接放行（本会话 GIS 已加载过，典型场景：先以游客身份浏览首页再登录）；
   - 纯 query/hash 变化不算真实导航，直接放行。
5. 结果：登录成功后 `authStore.user` 仍为 `null`（或旧身份）→ `isAdmin` 恒 `false` → 管理 UI 不渲染。
6. 面板自身的 `syncCurrentUser()`（挂载期 `/auth/me`）与打开后的 `loadCenterData()`（15s 轮询 `user` 字段）**早就会把含 `role` 的最新用户合并进本地 `this.user`**（`mergeUserPatch`），但 `isAdmin` 不读它——数据在，开关读错了源。
7. 整页刷新 → 应用重启、GIS 未加载 → 守卫完整执行 → `ensureValidSession()` 填充 `authStore.user` → `isAdmin` 变 `true` → UI 出现。与症状完全吻合。

### 受影响模块

- 前端账户中心：`frontend/src/domains/common/user/components/FloatingAccountPanel.ts`（判定源错配）
- 前端全局鉴权 store：`frontend/src/domains/common/user/stores/useAuthStore.ts`（SPA 登录不更新，本次不改动其本身，通过面板侧回填愈合）
- 不涉及：后端、路由守卫本身（其短路是有意性能优化）、Cesium/OL 引擎域。

### 候选方案对比

| 方案 | 做法 | 评价 |
|---|---|---|
| A：登录点回填 store | 5 处登录成功点（RegisterView×2 / OAuthCallbackView / OneTap / 验证流程）各加 `authStore.user = user` | 修得深但改动面 5 文件，后续新增登录入口仍会漏，属另一独立问题 → 记入 TODO |
| B：`setAuthSession` 内同步 store | 服务层直接写 store | `useAuthStore.ts` 静态依赖 `services/auth.ts`，反向 import 成环；动态 import 引入异步竞态 → 否决 |
| **C（选定）：面板侧修判定源 + 回填愈合** | ① `isAdmin` 改为**本地 `this.user`（最新）优先、`authStore.user` 兜底**；② `mergeUserPatch` 回填 `authStore.user`，使 store 在面板挂载/轮询时自动愈合 | 单文件、最小改动；本地 `user` 由挂载期 `/auth/me` 与 center 轮询持续刷新，比 store 更新鲜；后端权威裁决不变（进入管理页签仍需 `apiAdminOverview` 403 探活兜底） |

### 修改原因

管理员登录后必须整页刷新才能看到管理功能，属高感知体验缺陷；根因是身份判定读取了「仅整页加载时才更新」的过期数据源，而面板内已有的最新身份数据未被使用。

## 解决方案（实施步骤）

1. `FloatingAccountPanel.ts` `isAdmin`：改为 `!adminDenied && (this.user.role || authStore.user.role) === 'admin'`，本地优先、store 兜底，附注释说明数据源新鲜度差异与 403 探活兜底不变。
2. `FloatingAccountPanel.ts` `mergeUserPatch`：回填 `this.authStore.user = merged`，使全局 store 在面板挂载（`syncCurrentUser`）与打开轮询（`loadCenterData`）时自动同步为会话内最新身份；同时使既有的「身份变化重置 `adminDenied`」watch（监听 `authStore.user?.username`）在 store 从未被守卫填充的场景下也能正常触发。
3. 不改动：`useAuthStore.ts`、路由守卫、登录成功点（A 方案的根修记入 `Docs/TODO/bugfix-optimization-plan.md` 后续项）。

## 影响范围

- 仅前端账户中心组件逻辑；无新增/删除文件，无配置 key，无 UI/图标改动（不触发移动端基线条款），无场景数据加载（不触发 TOC 条款）。
- `authStore.user` 的其余消费者：路由守卫 `requiresEmailBinding` 判定已有 `getAuthUser()` 兜底，回填只会使其更准确；`useRoutePrefetch` 仅消费 `ensureValidSession` 返回值，不受影响。

## 修改内容

1. **fix**：`FloatingAccountPanel.ts` `isAdmin` 判定源改为「本地用户优先、authStore 兜底」，修复 SPA 登录后首次进入用户中心管理 UI 缺失。
2. **fix**：`FloatingAccountPanel.ts` `mergeUserPatch` 回填 `authStore.user`，愈合全局身份 store 在 SPA 会话内的过期问题。

## 性能指标

不涉及（无渲染/计算热路径变化，仅 computed 取值源调整）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `npm run typecheck`（vue-tsc）对比基线无新增报错（结果见门禁小节） | ① 清空 sessionStorage → 打开站点 → 游客浏览首页 → 从登录页以管理员登录 → **不刷新**直接进入用户中心 → 预期「管理中心 / API 管理」页签立即出现；② 登录后进入管理中心页签正常加载（后端 403 探活路径无回归）；③ 普通用户登录 → 用户中心无管理页签；④ 管理员退出登录 → 换普通账号登录 → 管理页签不再残留 |
| 门禁脚本：`CheckStructureTree.py` / `CheckConfigRegistry.py`（结果见门禁小节） | ⑤ OAuth 回调登录与 Google One Tap 登录各复验一次 ① |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/user/components/FloatingAccountPanel.ts` | `isAdmin` 判定源修正 + `mergeUserPatch` 回填 authStore |
| `README.md` | 版本号三处更新（V3.7.5 → V3.7.6） |
| `Docs/Guide/CHANGELOG.md` | 顶部追加 V3.7.6 条目 |
| `Docs/TODO/bugfix-optimization-plan.md` | 登记「登录成功点不回填 authStore」后续跟进项 |
| `Docs/LLM_record/26-11/2026-11-21/2026-11-21-fix-admin-panel-first-entry.md` | 本日志 |

## 遗留与风险

- **遗留**：5 处登录成功点仍未回填 `authStore.user`（方案 A），本次由面板 `mergeUserPatch` 在挂载/轮询时愈合；「登录完成 → 面板首次 `/auth/me` 返回」之间存在秒级窗口，极快打开面板时管理页签可能延迟约 0.3–1s 出现（随轮询/首载数据到达立即出现），已记入 TODO 后续项。
- **风险**：低。`isAdmin` 仍受 `adminDenied`（后端 403 探活）硬约束，不构成权限放大；本地 `user` 数据本身即来自 `/auth/me` 与 `/statistics/center` 后端响应。
- 权威性说明：前端可见性判定从来只是 UI 引导，真正的权限裁决在后端接口（进入管理页签的 `apiAdminOverview` 探活与管理接口自身的鉴权），本次改动不改变该边界。
