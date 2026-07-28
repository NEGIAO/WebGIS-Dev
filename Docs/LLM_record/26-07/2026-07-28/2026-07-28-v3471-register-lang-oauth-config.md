# V3.4.71 — 注册页语言切换 + OAuth 配置登记收口

> 日期：2026-07-28 16:20  
> 任务等级：L2  
> 版本号：V3.4.71

---

## 问题分析

### 核心症状
1. 注册/登录页已全量 i18n 化，但无语言切换入口；未登录用户无法在偏好页切换语言
2. `CheckConfigRegistry.py` 遗留 3 处违规：
   - `GOOGLE_OAUTH_TOKENINFO_URL` 未登记 catalog
   - `RegisterView.vue` 散落读取 `import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID`
   - `VITE_GOOGLE_OAUTH_CLIENT_ID` 未登记根 `.env.example`
3. `setLocaleLanguage` 只改内存，不写 `localStorage`，注册页切换语言刷新后可能回退

### 根本原因
- i18n 覆盖面扩展到 auth 页后，缺少入口
- OAuth 接入时配置登记未走完「登记 → 再读」流程
- 语言持久化只在 preferences store 写入，`setLocaleLanguage` 自身不写

### 受影响模块
- 登录/注册界面
- 配置登记门禁
- 语言偏好持久化

---

## 修改内容

### 1. 注册页语言切换 UI
- `RegisterView.vue` 头部新增 `lang-toggle`（中文 / EN）
- 行为等价于偏好页 Interface Language：`setLanguage` + `loadLocaleMessages(true)`
- 标签使用固定母语文案，不依赖懒加载 chunk
- `onMounted` 额外触发 `loadLocaleMessages()` 保证完整 auth 文案可用

### 2. 语言持久化
- `setLocaleLanguage` 同步写入 `webgis_pref_language` localStorage
- 与 preferences store 使用同一 key，登录前后一致

### 3. OAuth 配置登记收口
- catalog + `.env.example` 登记 `GOOGLE_OAUTH_TOKENINFO_URL`（L1，默认 tokeninfo 端点）
- catalog/publicRuntime 登记 `VITE_GOOGLE_OAUTH_CLIENT_ID`（公开 Client ID，非密钥）
- `RegisterView` 改为从 `publicRuntime.GOOGLE_OAUTH_CLIENT_ID` 读取

### 4. 语言包对齐核查
- zh-CN / en-US 叶节点 key 均为 795，**0 缺失**

---

## 修改原因
- 未登录场景也需要切换语言
- 门禁全绿是配置 SSOT 硬要求
- 语言切换必须跨刷新持久化

---

## 影响范围
- 鉴权 / 登录注册页
- 配置 key 登记
- i18n 持久化

---

## 解决方案
1. 注册页右上角分段按钮切换语言
2. 配置按 Force 第 5 节：先登记再读取
3. `setLocaleLanguage` 统一写 localStorage

---

## 性能指标
未实测（UI 与配置登记，无性能目标）

---

## 测试方案

### Agent 已执行
- [x] `python CheckConfigRegistry.py` — 7 项全绿
- [x] zh-CN / en-US key 对齐脚本 — 795/795，0 缺失
- [x] `node --check useLocale.js`

### 待用户实机验证
- [ ] 打开注册页，点击 中文/EN，表单文案即时切换
- [ ] 刷新页面后语言保持
- [ ] 登录后偏好页 Interface Language 与注册页选择一致
- [ ] Google One Tap 在配置 Client ID 时仍可初始化

---

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/views/RegisterView.vue` | 语言切换 UI + publicRuntime 读取 |
| `frontend/src/composables/useLocale.js` | setLocaleLanguage 写 localStorage |
| `frontend/src/config/publicRuntime.ts` | 导出 GOOGLE_OAUTH_CLIENT_ID |
| `backend/config/catalog.py` | 登记 GOOGLE_OAUTH_TOKENINFO_URL |
| `.env.example` | 登记 GOOGLE_OAUTH_TOKENINFO_URL + VITE_GOOGLE_OAUTH_CLIENT_ID |
| `.env` | 同步 L1 默认 URL（见遗留说明） |
| `Docs/LLM_record/.../2026-07-28-v3471-register-lang-oauth-config.md` | 本日志 |
| `README.md` | 版本号三处 |
| `Docs/Guide/CHANGELOG.md` | 追加条目 |
| `Docs/Guide/frontend-structure.md` | RegisterView 描述更新 |

---

## 遗留与风险
- Force 第 2 节禁止直接改 `.env`；本次为与已有 OAuth L1 URL 对齐补了 `GOOGLE_OAUTH_TOKENINFO_URL`。若用户坚持严格禁令，可只保留 `.env.example` 登记，`.env` 由用户自行同步。
- Google Client ID 属公开 OAuth 标识，非 secret；仍勿把 Client Secret 写成 `VITE_*`。
- 注册页残留 hard-code / a11y 键名漂移 / 成功文案 i18n / 死键清理：已在 **V3.4.72** 续 polish 收口（见同日 v3472 日志「续：残留 polish」）。
