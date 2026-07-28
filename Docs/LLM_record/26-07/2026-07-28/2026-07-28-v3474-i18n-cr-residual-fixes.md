# V3.4.74 — i18n 二轮 CR 残留修复：force/inflight、空串 getMessage、昵称校验 i18n

> 日期：2026-07-28 19:33  
> 任务等级：L2  
> 版本号：V3.4.74

---

## 问题分析

### 核心症状
- `loadLocaleMessages(force=true)` 在同语言已有 inflight 时**不 join**，可起第二个 task，与 `loadingLang` 竞态，后完成者可能覆盖/丢弃结果
- `getMessage` 用 `!= null` 判断，**空字符串 `''` 被当成缺失**，错误回退到 fallback 语言或 path
- `validateDisplayName` 硬编码中文 `message`；英文 UI 下注册/改昵称仍弹中文；`getUserDisplayName` 硬编码兜底「用户」
- 登录成功 toast 键（`guestLoginSuccess` 等）仅在 lazy 包，弱网首屏登录成功可能闪 key

### 根本原因
- V3.4.72 引入 per-lang inflight，但 force 分支未纳入 join 语义
- 文案存在性判断与「合法空串」语义混淆
- 校验层返回展示文案而非 i18n code，调用方无法 `t()`

### 受影响模块
- `useLocale` 加载与取值
- `useAuthIdentity` + RegisterView / SecurityTab
- `core` / zh-CN / en-US 语言包

---

## 修改内容

### 1. `useLocale.js`
- **force + inflight**：同语言有 inflight 时一律 `await` join；`force` 在 pending 结束后再起真正重载；await 期间语言已切走则放弃
- **getMessage**：`!== undefined` 判定，保留 `''` 为合法文案

### 2. `useAuthIdentity.js` + 调用方
- `validateDisplayName` 返回 `{ valid, code }` / `{ valid, value }`，code 为 `auth.displayNameRequired|TooLong|ControlChars`
- `getUserDisplayName` 无值返回 `''`，UI 侧 `t('common.user')` 兜底
- RegisterView / SecurityTab：`t(validation.code)` 展示错误

### 3. 语言包
- core + zh-CN + en-US 同步：`guestLoginSuccess` / `loginSuccessWithRole` / `googleLoginSuccess` + 三条 displayName 校验键

---

## 修改原因

消除二轮 staged CR 指出的正确性与 i18n 一致性缺陷，保证语言切换/重载无竞态、空串文案可用、昵称校验跟当前语言。

---

## 影响范围

- 国际化加载与取值、注册/账号安全昵称校验、登录成功 toast 首屏
- 无后端 / 配置 key 变更；无 Git 写操作

---

## 解决方案

| 方案 | 优点 | 缺点 | 选择 |
|---|---|---|---|
| A. force 时 cancel 旧 inflight | 语义硬 | 需 AbortController 包装 dynamic import，复杂 | ✗ |
| B. force 先 join 再 reload | 简单、无双写 | force 略延迟 | ✓ |
| C. 校验返回中英文双文案 | 无 t 依赖 | 膨胀、与 i18n 架构背离 | ✗ |
| D. 校验返回 i18n code | 单一事实、跟语言 | 调用方必须 t() | ✓ |

---

## 性能指标

| 指标 | 说明 |
|---|---|
| zh/en 叶节点 | 867 / 867，0 缺失（含 3 条 displayName 新键） |
| core 增量 | 成功 toast ×3 + displayName 校验 ×3（×2 语言） |
| 未实测 | 主 bundle gzip 体积 |

---

## 测试方案

### Agent 已执行
- [x] `node --check`：useLocale / useAuthIdentity / core / zh-CN / en-US
- [x] zh/en key 对等：867=867；`auth.displayName*` / `guestLoginSuccess` 双语存在
- [x] SecurityTab 已有 `useLocale` + `t`，改 emit 文案路径安全

### 待用户实机验证
- [ ] 快速连点偏好语言切换 / 刷新：控制台无重复 load 异常，UI 文案最终正确
- [ ] 若某 key 故意设为 `''`，不回退成 path 或另一语言
- [ ] 英文界面注册空昵称 / 超长 / 控制字符：英文错误提示
- [ ] 账号中心改昵称校验错误为当前语言
- [ ] 冷启动游客/邮箱/Google 登录成功 toast 立即正确（不闪 key）

---

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/composables/useLocale.js` | force/inflight join；getMessage `!== undefined` |
| `frontend/src/composables/auth/useAuthIdentity.js` | validateDisplayName code；getUserDisplayName 空兜底 |
| `frontend/src/views/RegisterView.vue` | `t(displayValidation.code)` |
| `frontend/src/components/UserCenter/tabs/SecurityTab.vue` | emit 前 `t(validation.code)` |
| `frontend/src/locales/core.js` | 成功 toast + displayName 校验键 |
| `frontend/src/locales/zh-CN.js` | 同上 |
| `frontend/src/locales/en-US.js` | 同上 |
| `Docs/LLM_record/26-07/2026-07-28/2026-07-28-v3474-i18n-cr-residual-fixes.md` | 本日志 |
| `Docs/Guide/CHANGELOG.md` | V3.4.74 条目 |
| `README.md` | 版本号三处 |
| `Docs/Guide/frontend-structure.md` | useLocale / auth 描述微调（若有） |

---

## 遗留与风险

- `validateDisplayName` 破坏性：若仓库外还有读 `.message` 的调用会失效；本仓仅 RegisterView + SecurityTab
- force 重载仍依赖 dynamic import 缓存；浏览器 module cache 下「真正重取网络」有限，与 V3.4.72 行为一致
- 未跑浏览器实机验证

---

## 下一步建议

- 可选：单元测试覆盖 force/inflight 与 empty-string getMessage
- 可选：CI zh/en key 对等检查
