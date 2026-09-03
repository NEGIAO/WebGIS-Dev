# 2026-09-01 游客强制访问 + 后端下线降级（HF 后端不可用）

## 日期与时间

2026-09-01 12:10

## 任务等级

L3（跨文件行为改造）

## 问题分析

- **核心症状**：HF 账号被锁定后后端下线，访客访问 `/home` 被路由守卫重定向到 `/register`，而注册依赖后端不可用 → "别人无法登录浏览"。
- **根本原因**：前端鉴权链硬依赖后端——①`router/index.js` 对 `requiresAuth` 路由未登录一律重定向 `register`；②`useAuthStore.ensureValidSession()` 对任何 token（含游客）都调用 `apiAuthMe()`，后端离线时抛异常 → `clearAuthSession` → 拒绝放行；③各功能依赖后端 API，后端离线时每个请求等待 `BACKEND_REQUEST_TIMEOUT_MS`（20s）超时，界面卡顿/白屏。
- **受影响模块**：路由守卫（router/index.js）、鉴权校验（useAuthStore.ts）、后端 API 客户端（client.js）、落地页入口（LandingView.vue）。

## 修改内容

1. `router/index.js`：未登录且需鉴权时不再重定向 `register`，改为调用既有 `injectGuestTokenForShareMode()` 自动注入游客令牌（`role: visitor`）并放行
2. `useAuthStore.ts`：`ensureValidSession()` 对游客会话（`isGuestSession()`）直接信任返回 `true`，不再向后端 `apiAuthMe` 请求验证
3. `api/backend/client.js`：新增后端不可达负缓存（30s 窗口）——连接层失败（无 `error.response`）置标记，request 拦截器内后续请求直接 `Promise.reject` 快速失败
4. `LandingView.vue`：三个"进入平台/开始"按钮（navLogin/tryNow/getStarted）由 `to="/register"` 改为 `to="/home"`

## 修改原因

HF 后端不可用的现况下，让访客能以游客身份直接浏览地图平台，恢复可访问性；属最终合规整改（移除保活）的配套降级策略。

## 影响范围

- 前端路由鉴权（后续后端恢复后，游客仍可直接浏览；真实登录能力保留，注册页仍可访问但当前不可用）
- 鉴权校验（游客会话不再触发后端验证请求）
- 后端 API 客户端（后端离线时全站 API 快速失败，不再等待超时）
- 落地页入口按钮目标

## 解决方案

复用既有分享模式访客注入机制，不新增模块；采用后端不可达负缓存（参照 `getPublicIp` 负缓存模式）而非全局 mock，改动最小、风险可控。后端恢复后无需回退——游客浏览是合理的公开访问形态。

## 性能指标

未实测（负缓存使后端离线时 API 从 20s 超时降为即时失败；正常路径无变化）

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `npm run build`（Vite production）构建无新报错 | GitHub Pages 发布后访问 `https://webgis.negiao.cn/#/home` 无需登录直接进入地图 |
| 改动文件代码审读（router 重定向分支、authStore 游客早退、client 负缓存） | 后端恢复后真实登录仍可用 |
| 门禁：CheckStructureTree / CheckConfigRegistry | 前端各功能在后端离线时快速提示"后端服务暂不可用"而非卡 20s |

## 变更文件清单

- `frontend/src/router/index.js` — 未登录放行游客，改为注入游客令牌
- `frontend/src/domains/common/user/stores/useAuthStore.ts` — 游客会话不调后端
- `frontend/src/api/backend/client.js` — 后端不可达负缓存快速失败
- `frontend/src/app/LandingView.vue` — 入口按钮改指 `/home`
- `README.md` — 版本号三处升级 V3.5.38
- `Docs/Guide/CHANGELOG.md` — 追加 V3.5.38 条目

## 遗留与风险

- 后端恢复前，登录/注册/chat/admin/瓦片代理等依赖后端的功能不可用（方案 C 预期内）
- 注册页仍可访问但无法注册（后端离线）；登录 UI 保留，点击会快速提示"后端服务暂不可用"
- 游客会话存于 sessionStorage，刷新标签页后需重新注入（行为一致，无残留风险）