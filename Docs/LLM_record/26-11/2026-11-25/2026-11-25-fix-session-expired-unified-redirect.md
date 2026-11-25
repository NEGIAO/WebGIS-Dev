# 2026-11-25 修复会话过期未统一提示与强制跳转

- **日期与时间**：2026-11-25 12:29
- **任务等级**：L2（Bug 修复）
- **版本**：V3.7.11（按项目统一版本归并）

## 问题分析

后端鉴权失败返回结构化错误码：`SESSION_EXPIRED`（token 无效/过期）、`SESSION_ERROR`（会话查询异常）、`LOGIN_REQUIRED`（无 token）等。前端原先存在两条不一致的处理路径：

1. `api/backend/client.ts` 的 401 分支：仅 `clearAuthSession()` 并弹出后端原始文案（如「401，登录状态已失效，请重新登录」），**不跳转** `/register`；
2. `useAuthStore.ensureValidSession()` 捕获任意异常后 `clearAuthSession()`，路由守卫虽会重定向注册页，但**不提示**「会话过期」。

此外，多个并发请求同时 401 会重复清会话、重复弹窗，且各调用点文案不统一。

## 解决方案

统一出口：会话过期 = 「清本地会话 + 派发全局事件 + 统一提示 + 强制回 /register」。

- `frontend/src/domains/common/user/services/auth.ts`
  - 新增 `SESSION_EXPIRED_EVENT = 'webgis:session-expired'`；
  - 新增 `markSessionExpired()`：调用 `clearAuthSession()`、3s 内合并重复事件（避免并发 401 重复弹窗/跳转），派发全局事件；`setAuthSession()` 重新登录时重置合并窗口。
- `frontend/src/api/backend/client.ts`
  - 401 且非 `GUEST_NO_TOKEN` / `LOGIN_REQUIRED` → 调用 `markSessionExpired()`，提前 reject 并携带 `isSessionExpired`，跳过下方通用 toast（避免重复提示）；
  - 游客权限不足仍走原 warning 分支，不清会话、不跳页。
- `frontend/src/domains/common/user/stores/useAuthStore.ts`
  - `ensureValidSession()` 的 catch 中按 `status === 401 && detailCode ∉ {LOGIN_REQUIRED, GUEST_NO_TOKEN}` 判断是否会话过期，是则走 `markSessionExpired()`；网络超时/后端不可用仍仅清本地会话，不误报过期。
- `frontend/src/main.ts`
  - 应用启动即监听 `SESSION_EXPIRED_EVENT`，统一调用 `message.error(translate('account.messages.sessionExpired'))` 并 `router.replace('/register')`。
- 文案：zh-CN `account.messages.sessionExpired = '会话过期，请重新登陆'`；en-US 对应 `Session expired. Please sign in again.`

## 三类身份统一（12:48 补充）

用户明确要求 admin / registered / guest 三类身份一律“签发 + 检测 session，过期强制提示并回 /register”。补充如下：

- `backend/api/auth/dependencies.py` 的 `_authenticate_login_or_guest()`：若请求带 Authorization token 但 `_get_session_sync()` 返回 None/过期，不再静默降级为临时游客，直接 401 `SESSION_EXPIRED`。此前 `/api/auth/me`、`/api/statistics/realtime` 等游客可达端点会让过期管理员/注册用户“变成游客”，前端永远收不到 401。
- `frontend/src/main.ts`：新增 60s 周期性会话体检（仅本地持有登录 token 或游客 token 时执行），动态 import `/api/auth/me`（免配额）探测；页面长期停留也能发现管理员删会话/token 到期，由统一出口处理。
- `test_guest_identity.py` 新增“过期登录 token 不得降级游客”回归用例。

## 验证

- `npx vue-tsc --noEmit -p tsconfig.json`：0 错误
- `npx eslint`（6 个改动文件，`--quiet`）：0 错误
- `npm run build`：成功（4774 modules）
- 三类身份补充：`pytest tests/test_guest_identity.py -q` 19/19；后端全量 164 passed / 1 个既有异步标记失败（与本改动无关）
- 未执行任何 Git 写操作。

## 影响范围与风险

- 仅改前端提示/跳转链路，不改后端 API 契约与错误码；
- 3s 合并窗口意味着首次过期提示后的极短时间内再次 401 不重复弹窗；重新登录会重置窗口；
- 分享模式 `GUEST_NO_TOKEN` / `LOGIN_REQUIRED` 仍按游客权限不足处理，不会被强制踢到注册页。
