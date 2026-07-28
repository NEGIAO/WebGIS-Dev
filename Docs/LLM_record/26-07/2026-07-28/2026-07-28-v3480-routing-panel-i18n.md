# V3.4.80 — Bus / Driving 规划面板全量中英文 i18n

> 日期：2026-07-28 20:28  
> 任务等级：L2  
> 版本号：V3.4.80  
> 顺延说明：接 V3.4.79 遗留「Routing 规划面板 UI / 错误文案键化」

---

## 问题分析

### 核心症状
- 英文界面下公交 / 驾车规划面板仍夹杂中文（标题、策略、空态、调试标签、错误提示）
- 公交 `modeText` 非步行段误用 `walk`；空结果 / catch 误用 `busEmpty` / `navFailed`

### 根本原因
- 面板模板与脚本长期硬编码中文；仅 Loading 在 V3.4.79 接入 `loading.*`
- 部分键已存在于 `routing.*` 但未接线，或语义错位（空态 vs 无方案、导航失败 vs 公交规划失败）

### 受影响模块
- `BusPlannerPanel.vue`、`DrivingPlannerPanel.vue`、`MapPointPickerCard.vue`
- `locales/zh-CN.js` / `en-US.js` 的 `routing.*`

---

## 修改内容

1. **语言包 `routing.*` 补齐**：`busSelectPlanHint` / `busNoSegmentSteps` / `responseShape` / `resultCode` / `drawRouteFailed` / `busPlanFailed` / `busNoPlan` / `busRequestFailed` / `tokenMissing` / `networkBlocked` / `transitMode` 等（full 叶 1158/1158 对齐）
2. **BusPlannerPanel**：模板与脚本全量 `t('routing.*')`；`modeText` 步行 vs `transitMode`；空方案 `busNoPlan`；catch 兜底 `busPlanFailed`；Token/网络/HTTP 状态键化；`showLoading(t('loading.busRoute'))`
3. **DrivingPlannerPanel**：策略/空态/调试/时长 `formatDuration` / Token/网络/失败兜底全量 `t()`；`showLoading(t('loading.drivingRoute'))`
4. **MapPointPickerCard**：props 空时默认标签/提示走 `routing.*`（此前已部分接入，本批确认无运行时 CJK）

---

## 修改原因

V3.4.79 只修了全局 Loading；规划面板是用户可见的完整业务流程，英文体验仍不完整。键语义拆分避免「未选点空态」与「API 无方案」混用。

---

## 影响范围

- 前端 Routing 三组件 UI / 错误 / 调试文案
- 无配置 key / 结构树文件增删；无 Git 写操作

---

## 解决方案

| 方案 | 说明 | 选择 |
|---|---|---|
| A. 仅遮罩 + 按钮文案 | 英文面板仍半中文 | 否 |
| B. full pack `routing.*` + 面板 t() | 与现有懒加载 full pack 一致 | ✓ |
| C. 抽公共 useRoutingI18n | 过度抽象，两面板差异大 | 未选 |

---

## 性能指标

未实测（字符串替换；full pack 叶数 1158 不变级差）

---

## 测试方案

### Agent 已执行
- [x] Bus 空方案 / catch 键：`busNoPlan` / `busPlanFailed`
- [x] `modeText`：walk vs transitMode
- [x] 运行时 CJK 扫描：Routing `*.vue` 仅剩注释
- [x] zh/en full 叶节点 1158/1158，diff 空
- [x] `CheckStructureTree.py` 398=398；`CheckConfigRegistry.py` 全绿

### 待用户实机
- [ ] 切 English 后打开公交/驾车：标题、策略、空态、规划中、错误提示均为英文
- [ ] 无 Token / 断网：英文 tokenMissing / networkBlocked
- [ ] 公交候选方案选中后分段标签与步行/公交 mode 正确

---

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/locales/zh-CN.js` | `routing.*` 扩展 |
| `frontend/src/locales/en-US.js` | 同上 en |
| `frontend/src/components/Routing/BusPlannerPanel.vue` | 全量 t() + 键语义修正 |
| `frontend/src/components/Routing/DrivingPlannerPanel.vue` | 全量 t() |
| `frontend/src/components/Routing/MapPointPickerCard.vue` | 默认文案 t()（确认） |
| `Docs/Guide/frontend-structure.md` | Routing 注释刷新 |
| 本日志 + CHANGELOG + README | V3.4.80 |

---

## 遗留与风险

- 天地图 API 返回的路名/引导原文（中文地名）不翻译，属数据源内容
- Weather / TOC / Admin 等其它模块 message 硬编码不在本批
- 未跑浏览器实机

---

## 下一步建议

- Weather 看板 / TOCPanel message 硬编码扫尾
- 注册 API 初始 language 与 SSOT 一致性抽检
