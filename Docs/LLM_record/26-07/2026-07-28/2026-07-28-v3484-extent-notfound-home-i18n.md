# V3.4.84 — ExtentPicker / NotFoundView / HomeView 可见 UI i18n

> 日期：2026-07-28 21:20  
> 任务等级：L2  
> 版本号：V3.4.84  
> 顺延说明：接 V3.4.83 后，按用户反馈「主要是 vue 组件，UI 文字主要在里面」优先扫 `.vue` 可见文案

---

## 问题分析

### 核心症状
- 英文界面下，共用框选器、404 页、主页属性面板与若干 HomeView toast 仍为中文

### 根本原因
- 面板级 i18n 已推进到 routing/weather/TOC，但 **公共组件与主视图模板** 仍残留字面量
- 用户明确要求 Vue UI 优先，而非继续深挖 api/utils toast

### 受影响模块
- `components/Common/ExtentPicker.vue`
- `views/NotFoundView.vue`
- `views/HomeView.vue`（模板 + 脚本 toast）
- `locales/zh-CN.js` / `en-US.js`：`extent.*` / `notFound.*` / `home.*`

---

## 修改内容

1. **新增命名空间** `extent` / `notFound` / `home`（zh/en 叶节点对齐）
2. **ExtentPicker**：按钮（开始/重选/框选中/当前视图/清除）与提示全量 `t('extent.*')`
3. **NotFoundView**：标题、说明、倒计时提示、回首页按钮 `t('notFound.*')`
4. **HomeView**：
   - 模板：地图核心 loading、属性信息标题、绘制/上传标签、空态
   - 脚本：自定义底图/分析入口/行政区/卷帘/地图失败/AOI/移除行政区 toast
5. **不纳入**：`TermsOfService` / `PrivacyPolicy` 法律长文（独立批次）

---

## 修改原因

用户反馈 i18n 应以 Vue 组件可见 UI 为主；ExtentPicker 被下载/分析等多处复用，404 与 Home 属性面板是高感知入口。

---

## 影响范围

- 前端可见文案与 toast；无后端 / 无配置 key / 无结构树文件增删（仅注释同步）
- 无 Git 写操作

---

## 解决方案

| 方案 | 说明 | 选择 |
|---|---|---|
| A. 继续 API/composable toast | 与用户「Vue UI 优先」冲突 | 否 |
| B. 高频共用 Vue 三件套 + home toast | 感知面大、改动集中 | ✓ |
| C. 法律页全文 i18n | 体积大、非交互主路径 | 下一批可选 |

---

## 性能指标

未实测（字符串替换 + 懒加载 full pack 既有路径）

---

## 测试方案

### Agent 已执行
- [x] `node --check` zh-CN / en-US
- [x] 叶节点 parity：1579 = 1579（含 home.districtRemoved 后应再验）
- [x] ExtentPicker / NotFound 模板运行时硬编码已 t()
- [x] `CheckStructureTree.py` / `CheckConfigRegistry.py`（收尾运行）

### 待用户实机
- [ ] 英文：下载/分析面板框选按钮为 Select extent / Current view
- [ ] 英文：访问不存在路由 → Star trail lost / Warp back to home
- [ ] 英文：要素属性面板 Attribute info / Drawn / Uploaded / No attribute data
- [ ] 英文：加载行政区 / 移除行政区 toast 为英文
- [ ] 中文路径无回归

---

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/locales/zh-CN.js` | `extent` / `notFound` / `home` |
| `frontend/src/locales/en-US.js` | 同上英文 |
| `frontend/src/components/Common/ExtentPicker.vue` | UI t() |
| `frontend/src/views/NotFoundView.vue` | UI t() |
| `frontend/src/views/HomeView.vue` | 属性面板 + toast t() |
| `Docs/Guide/frontend-structure.md` | 三处注释 |
| `Docs/Guide/CHANGELOG.md` | V3.4.84 |
| `README.md` | 三处版本号 |
| `Docs/LLM_record/26-07/2026-07-28/2026-07-28-v3484-extent-notfound-home-i18n.md` | 本日志 |

---

## 遗留与风险

- Admin / Chat / Search / Layer 子面板等 Vue 仍有 CJK 硬编码 → 下一批
- 法律页（ToS / Privacy）全文仍中文
- HomeView 内注释与 CSS 注释中文保留（非 UI）
