# 2026-11-21 登录会话统一出口收拢（commitLoginSession）+ 登出残留清理

- **日期与时间**：2026-11-21 20:15
- **任务等级**：L2（Bug 修复 / 收口）
- **版本**：V3.7.7（批次 B）

## 问题分析

### 核心症状（bugfix-plan V3.7.6 批次 D 登记项的根修）

5 处 SPA 登录成功点只调 `setAuthSession()` + `syncUserRoleToUrl()`，从不回填 `authStore.user`；V3.7.6 曾在 `FloatingAccountPanel.mergeUserPatch` 单点回填（补丁），但「登录完成 → 面板首载 `/auth/me`」间的秒级窗口仍在，且**不打开用户中心的会话里 store 全程过期**。另有顺带登记项：`forceBackToLogin`/`clearAuthSession` 登出后 `authStore.user` 残留旧身份。

### 根本原因

登录成功的三件事（写 sessionStorage / URL 角色同步 / 回填 store）散落多处，无统一出口——新增登录入口必然再漏。

### 受影响模块

`app/RegisterView.ts`（handleLogin / quickGuestLogin）、`app/OAuthCallbackView.ts`、`app/composables/useGoogleOneTapAuth.ts`、`app/composables/useAuthVerificationFlows.ts`、`domains/common/user/components/FloatingAccountPanel.ts`、`domains/common/user/composables/useAccountSecurityAndActions.ts`。

## 解决方案

新增**唯一**登录会话出口 `sessionCommit.ts`：

- `commitLoginSession(token, user)`：setAuthSession + syncUserRoleToUrl + **`authStore.user = user`**（pinia 激活守卫 try/catch，极端时序由路由守卫兜底）；
- `resetAuthSessionState()`：clearAuthSession + `authStore.resetValidation()`（登出残留清理）。

**收拢范围**：5 个登录出口全部改走 `commitLoginSession`；`mergeUserPatch` 的三行散点（syncUserRoleToUrl / setAuthSession / store 回填）合并为一次 `commitLoginSession` 调用（语义完全一致，消除同文件双份逻辑）；`forceBackToLogin` 的 `clearAuthSession` 升级为 `resetAuthSessionState`。

## 修改内容

1. **feat**：新增 `services/sessionCommit.ts`（唯一出口 + 模块 docstring 写明纪律：新增登录入口禁止散点直调 setAuthSession）。
2. **refactor**：5 登录出口 + mergeUserPatch 收拢；各文件移除不再使用的 `setAuthSession` / `syncUserRoleToUrl` 导入。
3. **fix**：登出 `resetAuthSessionState` 清 authStore 残留。

## 影响范围

登录/OAuth/OneTap/绑定邮箱/游客快登全链路的身份写入面；登出链路。**不改**任何判定语义（store 回填时序仅在函数内重排）。

## 性能指标

不涉及。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `vue-tsc --noEmit` 0 错误；eslint（6 文件）0 problems；`rg setAuthSession` 在登录面文件归零（仅 sessionCommit/auth 服务内部持有） | ① 三条登录路径（密码 / OAuth / One Tap）登录后**立即**打开用户中心：角色、昵称、管理页签（管理员）即时正确；② 登出 → 不刷新直接重新登录另一账号 → 身份切换干净（无上一账号残留）；③ 邮箱绑定流程登录态无缝续接 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/user/services/sessionCommit.ts` | **新增**：唯一出口 |
| `app/RegisterView.ts` | 两处登录流收拢 |
| `app/OAuthCallbackView.ts` / `app/composables/useGoogleOneTapAuth.ts` / `useAuthVerificationFlows.ts` | 收拢 |
| `frontend/src/domains/common/user/components/FloatingAccountPanel.ts` | mergeUserPatch 收口（移除散点 store 直写） |
| `frontend/src/domains/common/user/composables/useAccountSecurityAndActions.ts` | 登出走 resetAuthSessionState |
| `Docs/LLM_record/26-11/2026-11-21/2026-11-21-login-session-commit.md` | 本日志 |

## 遗留与风险

1. `client.ts` 401（SESSION_EXPIRED）路径仍只调 `clearAuthSession` 未清 store——路由守卫下次 `ensureValidSession` 会自愈（token 没了 → resetValidation），属观察项不阻塞。
2. `commitLoginSession` 的 store 回填依赖 pinia 已激活（全部调用点均在组件上下文 ✓）；若未来出现非组件上下文登录，需显式传 pinia 实例。
