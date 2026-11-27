# 2026-11-25 修复管理员删除游客会话后未强制登出

- **日期与时间**：2026-11-25 12:42
- **任务等级**：L2（Bug 修复）
- **版本**：V3.7.11（按项目统一版本归并）

## 问题分析

游客身份不是 DB 会话：前端持 HMAC 签名 token（`gt1_...`，存 localStorage，经 `X-Guest-Token` 头发送），后端 `verify_guest_token()` 只校验签名与有效期，不查库。因此管理员通过 `/api/admin/db/table/sessions/delete` 删除游客会话行后：

1. 浏览器仍持有效 token，请求继续以原 `guest_uid` 通过验签；
2. 下一次 `/api/auth/guest/session` 还会用 `peek_guest_token_uid()` **原样续签同一身份**，撤销无法生效；
3. 前端没有收到任何 401，自然不会走上一轮实现的「会话过期 → 提示 → 跳 /register」流程。

## 解决方案

**服务端撤销 + 401 信号 + 前端清 token**：

- `backend/api/auth/schema.py`：**不新建撤销表**；admin / registered / guest 三类身份统一用现有 `sessions` 表作会话真值，仅补 `guest_uid` / `role` 索引。
- `backend/api/auth/guest_token.py`：
  - `register_guest_session()`：游客 token 签发时同步写一行 `role='guest'` 的 `sessions` 记录（`token = HMAC token`，`guest_uid` 与 token 内 uid 一致）；
  - `verify_guest_token_active()`：验签 + 有效期 + **按 token 查 sessions 行**，行不存在/过期即失效；
  - `revoke_guest_uid()`：删除该 uid 的全部 `sessions` 行（含续签产生的多条 token）。
- `backend/api/auth/routes.py`：`/api/auth/guest/session` 签发成功后调用 `register_guest_session()`。
- `backend/api/admin.py`：通用 DB 删除接口在删除 `sessions` / `guest_identity_records` 行前，先按相同 where 收集 `guest_uid`，删除成功后逐条 `revoke_guest_uid()`（清 sessions 表中该 uid 的全部 token 行）并撤销在线 presence；响应增加 `revoked_guest_uids`。管理员只需维护一张 `sessions` 表。
- `backend/api/auth/dependencies.py`、`routes.py`：请求若携带**签名有效但已过期/被撤销**的游客 token，不再静默回落派生桶或续签，直接返回 401 + `SESSION_EXPIRED`（“会话过期，请重新登陆”），触发前端统一出口。
- `frontend/src/domains/common/user/services/auth.ts`：`markSessionExpired()` 同时 `clearGuestToken()`，避免刷新后旧 token 再次 401 形成循环。

## 验证

- `pytest tests/test_guest_identity.py -q`：19/19 通过（新增 sessions 表登记/删行失效、401 信号、过期登录 token 不降级游客、管理员删除前收集 guest_uid）
- 后端全量：164 passed / 1 个既有异步标记失败（与本改动无关）
- vue-tsc 0、ESLint 0、生产构建成功；门禁全绿
- 未执行任何 Git 写操作。

## 影响范围与风险

- 游客 token 过期（4h）现在也会强制登出，不再静默换身份；这是“会话过期统一处理”的预期行为。
- 无独立撤销状态：撤销 = 删除 `sessions` 行，管理员在一张表内即可完成维护；旧版本签发的游客 token 若无对应 sessions 行，需要在部署后重新签发（会强制回注册页一次）。
- 无游客 token 的匿名请求仍按 IP+UA 派生桶处理，不受影响。
