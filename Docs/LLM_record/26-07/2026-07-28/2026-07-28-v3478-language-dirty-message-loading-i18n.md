# V3.4.78 — 语言 dirty 清除 + Message / GlobalLoading 首屏 i18n

> 日期：2026-07-28 20:10  
> 任务等级：L2  
> 版本号：V3.4.78  
> 顺延说明：接 V3.4.76 遗留「language 即时保存后清除 dirty」与 Shell 硬编码扫尾

---

## 问题分析

### 核心症状
1. 偏好页切换「界面语言」后已即时写本机/远端（V3.4.76），但仍显示 dirty 点与「有未保存修改」，诱导用户再点「保存偏好」
2. 全局 Toast 岛 `Message.vue` 标题（成功/错误/警告/鸡汤/提示）、关闭 aria、队列「还有 N 条」硬编码中文
3. `GlobalLoading.vue` 默认主文案与副文案硬编码中文，英文模式下首屏加载遮罩仍中文

### 根本原因
- `PreferencesTab` 的 `PREFERENCE_FIELDS` 仍含 `language`，`dirtyFields` 用 draft vs saved 比较；即时 `setLanguagePreference` 虽更新 store，但 draft/store 时序或用户预期上 language 本不该进批量 dirty
- Message / GlobalLoading 未接 `useLocale`，文案写死在组件内

### 受影响模块
- `PreferencesTab.vue`
- `Message.vue` / `GlobalLoading.vue`
- `locales/core.js`（首屏键）、`zh-CN.js` / `en-US.js`（languageDesc 文案）

---

## 修改内容

1. **language 退出批量 dirty**  
   - `PREFERENCE_FIELDS` 去掉 `language`  
   - `isDirty('language')` 恒 false  
   - 语言描述改为明确「全局即时生效，无需点保存」

2. **Message.vue i18n**  
   - `useLocale`；标题 `message.types.*`；关闭 `common.close`；队列 `message.queueMore`  
   - 键放 **core.js**（Toast 可首屏出现，不依赖懒加载 chunk）

3. **GlobalLoading.vue i18n**  
   - 默认主文案 `common.loadingPleaseWait`；副文案 `common.loadingHard`（点号仍由模板动画 span）

---

## 修改原因

接 V3.4.76 交接「可选：偏好 language 即时保存后清除 dirty」；Shell 全局组件硬编码会在整站英文化后仍露中文。

---

## 影响范围

- 前端偏好 UI dirty 语义；全局 Toast / Loading 文案
- 无配置 key / 结构树文件增删；无 Git 写操作

---

## 解决方案

| 方案 | 说明 | 选择 |
|---|---|---|
| A. watch 语言后 sync draft + 比较仍含 language | 仍易因 store 异步回写闪 dirty | 否 |
| B. language 不参与 PREFERENCE_FIELDS / dirty | 与即时 SSOT 语义一致 | ✓ |
| C. Message 键放懒加载 full pack | 首屏 toast 可能闪 path | 否 → core |

---

## 性能指标

未实测（文案路径；core 增少量字符串）

---

## 测试方案

### Agent 已执行
- [x] core zh/en 叶节点 130/130 对齐
- [x] full zh/en 叶节点 887/887 对齐
- [x] `node --check` locales/core.js
- [x] `CheckStructureTree.py` 398=398；`CheckConfigRegistry.py` 全绿

### 待用户实机
- [ ] 偏好切 EN：无 language dirty 点；其它字段未改时状态为「已保存」
- [ ] 英文下 toast 标题 Success/Error…；队列英文；关闭 aria Close
- [ ] 英文下无自定义 loadingText 时遮罩为 Loading, please wait… / Still working

---

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/components/UserCenter/tabs/PreferencesTab.vue` | language 退出 dirty |
| `frontend/src/components/Shell/Message.vue` | toast i18n |
| `frontend/src/components/Shell/GlobalLoading.vue` | loading 默认文案 i18n |
| `frontend/src/locales/core.js` | message.* + loadingPleaseWait/Hard |
| `frontend/src/locales/zh-CN.js` / `en-US.js` | languageDesc |
| 本日志 + CHANGELOG + README 三处版本 | V3.4.78 |

---

## 遗留与风险

- `showLoading('正在…')` 调用方硬编码字符串仍未统一（路由/HomeView/规划器等）— 记入后续 i18n 扫尾，本次不扩大范围
- Message `soup` 英文用 Soup 字面；若产品要 Chicken soup 可再改文案
- 未跑浏览器实机

---

## 下一步建议

- 路由守卫 / HomeView / 规划器 `showLoading` 文案键化
- 注册 API 初始 language（V3.4.76 可选）
