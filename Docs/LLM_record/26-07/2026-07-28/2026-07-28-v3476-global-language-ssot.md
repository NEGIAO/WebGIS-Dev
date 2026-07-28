# V3.4.76 — 全局语言开关 SSOT：注册页与偏好页同步持久化

> 日期：2026-07-28 19:58  
> 任务等级：L2  
> 版本号：V3.4.76

---

## 问题分析

### 核心症状
- 注册页切到英文并登录/注册进入首页后，界面回到中文
- 注册页与账号中心「界面语言」本应是同一全局开关，实际两条链路不同步

### 根本原因
1. 注册页仅调用 `setLocaleLanguage` → 写 `webgis_pref_language`
2. `useUserPreferencesStore.loadFromStorage` / `loadPreferences` 以完整缓存或**远端默认 `zh-CN`** 整包覆盖，再 `applyRuntimePreferences` → `setLocaleLanguage('zh-CN')` 冲掉本机选择
3. 偏好页即时 `setLocaleLanguage`，需点「保存偏好」才写远端；注册页从不写远端；登录后 GET preferences 拿默认中文再覆盖

### 受影响模块
- `useUserPreferencesStore`、`useLocale`
- `RegisterView`、`FloatingAccountPanel` / `PreferencesTab`

---

## 修改内容

1. **`webgis_pref_language` 为本机 UI 语言 SSOT**  
   - `readCachedPreferredLanguage()`  
   - `mergeLocalLanguage`：完整缓存/默认包合并时以 LANGUAGE_KEY 为准  
   - `loadPreferences`：拉远端前快照本机语言；合并时保留本机 language；若与远端不同则静默 `apiAuthUpdatePreferences({ language })` 回写

2. **`setLanguagePreference(lang)`**  
   注册页 / 偏好页共用：更新 store + 完整缓存 + `setLocaleLanguage`；已登录则 `savePreferences({ language })`

3. **`setLocaleLanguage`** 同步改写 `webgis_user_preferences_cache.language`，避免只改单 key 时整包仍是旧 zh-CN

4. **接线**  
   - RegisterView → `setLanguagePreference`  
   - FloatingAccountPanel `watch(preferenceDraft.language)` → `setLanguagePreference`  
   - PreferencesTab 不再本地 `setLanguage`（交父级统一）

---

## 修改原因

用户明确：两处中英文设置功能一致，必须是全局开关并持久化。

---

## 影响范围

- 前端偏好与 i18n 运行时；登录后语言回写远端
- 无配置 key / 结构树文件增删；无 Git 写操作

---

## 解决方案

| 方案 | 说明 | 选择 |
|---|---|---|
| A. 仅修 localStorage 合并 | 进首页不闪中文，但账号远端仍中文 | 部分 |
| B. 本机 SSOT + 登录后回写远端 + 统一 setLanguagePreference | 两端一致 | ✓ |
| C. 注册接口带 language | 需改后端注册契约 | 未选（可用 preferences 回写） |

---

## 性能指标

未实测（偏好读写量级；多一次可选 language PATCH）

---

## 测试方案

### Agent 已执行
- [x] `node --check`：`useLocale.js` / `useUserPreferencesStore.ts`
- [x] 合并逻辑 smoke：local `en-US` + remote/cache `zh-CN` → `en-US`
- [x] `CheckStructureTree.py` 398=398；`CheckConfigRegistry.py` 全绿

### 待用户实机验证
- [ ] 注册页切 EN → 游客/邮箱登录进首页：顶栏/侧栏英文
- [ ] 刷新仍英文；`localStorage.webgis_pref_language === 'en-US'`
- [ ] 账号中心偏好「界面语言」显示 English；切回中文两边一致
- [ ] 已登录在偏好切 EN 后刷新仍 EN（远端已写）

---

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/stores/useUserPreferencesStore.ts` | mergeLocalLanguage / load 保留本机 / setLanguagePreference / 远端回写 |
| `frontend/src/composables/useLocale.js` | setLocaleLanguage 同步完整偏好缓存 language |
| `frontend/src/views/RegisterView.vue` | 走 setLanguagePreference |
| `frontend/src/components/UserCenter/FloatingAccountPanel.vue` | draft.language → setLanguagePreference |
| `frontend/src/components/UserCenter/tabs/PreferencesTab.vue` | 去掉本地 setLanguage |
| 本日志 + CHANGELOG + README 三处版本 | V3.4.76 |

---

## 遗留与风险

- 偏好下拉改语言会**立即**写远端（与「保存偏好」其它字段不同）；属全局开关预期
- 远端回写失败时本机仍 EN，下次 Save 可再同步
- 未跑浏览器实机

---

## 下一步建议

- 可选：注册 API 接受初始 `language`，免登录后一次 PATCH
- 可选：偏好 language 即时保存后清除该字段 dirty 点
