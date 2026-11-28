# 2026-11-28 删除重复的 Google 标准电子(WGS) 预设

- **日期与时间**：2026-11-28 16:27
- **任务等级**：L2（删除重复条目 + 编号治理）
- **版本号顺延**：V3.7.23 已被同会话前一任务占用，本任务顺延为 **V3.7.24**。

## 一、问题分析（阶段一：写代码前完成）

### 核心症状

用户截图列出「19 谷歌电子地图」与「119 标准电子」，指出两者重复，要求删掉一个。

### 事实核对

| 预设 | id | stack 定义 | URL | 坐标处理 |
|---|---|---|---|---|
| #19 谷歌电子地图 | `imagery_google_standard_preset` | `imagery_google_standard`（order 60） | `mt0.google.com/vt/lyrs=m...&s=Ga` | GCJ02，无纠偏 |
| #119 标准电子 | `vector_google_combo_standard_wgs_preset` | `vector_google_combo_standard_wgs`（order 62） | `mt0.google.com/vt/lyrs=m&hl=zh-CN...` | WGS84，`gcj2wgs` |
| #161 Google标准电子(WGS) | `imagery_google_standard_wgs_preset` | `imagery_google_standard_wgs`（order 105） | 与 #19 同 URL | WGS84，`gcj2wgs` |

结论：四者都是 Google `lyrs=m` 标准电子样式；#119 与 #161 在「WGS 纠偏版」能力上重复，且 #119 的 stack 定义无其他引用。

### 保留 / 删除取舍

- **保留 #19**：被 `tileIntentPresets.ts`、`chatIntentFallback.ts`、`category-recommended.ts` 三处引用，是既有语义入口与精选条目，删除会破坏 Agent 能力与推荐清单。
- **删除 #119 及其定义**：无任何业务引用；WGS 纠偏能力已由 #161 覆盖；删除不损失功能。

### 受影响模块

- `basemapPresets.ts`：删 1 预设。
- `definitions/category-electronic.ts`：删 1 定义（order 62）。
- 全局 order：62 之后的 136 条定义顺延 -1，198→197。
- `scripts/check-basemap-catalog.mjs`：护栏 179→178。
- 计数文档：README、结构树、交接文档、两篇现行态架构文档。

### 候选方案对比

| 方案 | 做法 | 评估 |
|---|---|---|
| A（选定） | 删 #118/#119 预设 + 两条定义，全局 order 顺延 | 无引用损失，能力由 #19/#161 覆盖；满足配对门禁 |
| B | 删 #19 | 破坏 3 处语义/精选引用，绝对不可行 |
| C | 只删 #119 预设 + 定义 | 门禁拦截：同 URL 的 GCJ 原始版失去 WGS 派生，硬约束不允许 |

### 门禁拦截与修正

首次只删 WGS 项后，`check-layer-definitions.mjs` 报错 `vector_google_combo_standard_gcj（GCJ02）缺少 gcj2wgs 派生版`。该约束要求同一规范化 URL 下 GCJ02 原始版必须有 WGS 派生版，不能靠放宽门禁绕过。故追加删除同一重复组的 GCJ 项（`vector_google_combo_standard_gcj_preset` / `vector_google_combo_standard_gcj`，原 order 61），使规范配对 #19（GCJ）/ #161（WGS）成为唯一标准电子入口。

## 二、修改内容

1. `basemapPresets.ts`：删除 `vector_google_combo_standard_wgs_preset`（#119）与 `vector_google_combo_standard_gcj_preset`（#118）两个预设。
2. `definitions/category-electronic.ts`：删除 `vector_google_combo_standard_wgs`（原 order 62）与 `vector_google_combo_standard_gcj`（原 order 61）两条定义。
3. 全局 order 顺延：所有 `order > 61` 的定义统一 -1，最终 196 条、orders 1..196 连续（分两批脚本执行，共 136 条受影响）。
4. `scripts/check-basemap-catalog.mjs`：预设护栏 179→177；Google 组合数 30→28、GCJ/WGS 各 15→14。
5. 计数文档同步：README（177/196）、结构树（196 条、电子类 116 条）、`Guide/handover.md`、两篇现行态架构文档。
6. README 三处 + CHANGELOG 新增 V3.7.24 条目。

## 三、修改原因

用户指出的重复本质是 Google `lyrs=m` 标准电子样式被重复登记为四组条目（#19 GCJ、#118 GCJ、#119 WGS、#161 WGS）。#19 承载语义/精选引用，#161 提供 WGS 纠偏能力，二者为规范配对；#118/#119 无外部引用且与规范配对等价，删除后不损失能力，同时满足定义层配对硬约束。

## 四、影响范围

- 底图目录预设与 URL `l` 编号；定义总量 198→196，预设 179→177。
- 不涉及后端、鉴权与地图引擎加载代码。

## 五、解决方案

采用候选方案 A（含门禁修正）。顺序：写分析段 → 删 WGS 项 → 门禁拦截 → 追加删 GCJ 项 → 批量 order 顺延 → 下调两个护栏 → 同步文档 → 复跑门禁。

## 六、性能指标

未实测（静态数据变更）。

## 七、测试方案

### Agent 已执行

1. `npm run typecheck`（`vue-tsc --noEmit`）：0 错误。
2. `node scripts/check-layer-definitions.mjs`：OK，196 条定义、orders 1..196、stacks 可解析、配对约束全过。
3. `node scripts/check-basemap-catalog.mjs`：OK，177 预设、20 AMAP + 28 Google combos、20 推荐。
4. `python Scripts/CheckStructureTree.py`：769/769，漏登记 0、幽灵条目 0。
5. `python Scripts/CheckConfigRegistry.py`：B1–B4 / F1–F3 全绿。
6. 中间态验证：仅删 WGS 项时门禁如实报错，未放宽约束；追加删除 GCJ 项后转绿。

### 待用户实机验证

底图目录中「谷歌电子地图」（#19 附近）与「Google标准电子(WGS)」仍在；「标准电子」重复项消失，Google `lyrs=m` 样式仍可正常加载。

## 八、变更文件清单

- `frontend/src/domains/common/basemap/basemapPresets.ts`：删两个重复预设。
- `frontend/src/domains/common/basemap/definitions/category-electronic.ts`：删两条重复定义。
- 其余 5 个定义文件：order 批量顺延（仅改 `order:` 行）。
- `frontend/scripts/check-basemap-catalog.mjs`：预设与 Google 组合护栏下调。
- `README.md`、`Docs/Guide/frontend-structure.md`、`Docs/Guide/handover.md`、`Docs/Architecture/basemap-source-system.md`、`Docs/Architecture/basemap-catalog-redesign.md`、`Docs/Guide/CHANGELOG.md`：计数与版本同步。
- `Docs/LLM_record/26-11/2026-11-28/2026-11-28-remove-duplicate-google-standard-wgs.md`：本日志。

## 九、遗留与风险

- **URL 编号前移**：两个预设被删，其后编号整体 -2，历史 `?l=` 链接可能指向相邻底图。
- 真正同 URL 的 `imagery_google_standard`（#19 GCJ）与 `imagery_google_standard_wgs`（#161 WGS）按设计保留（坐标纠偏不同），非重复。
- 版本号顺延至 V3.7.24；提交前需核对叠加 diff。
- 未执行任何 Git 写操作。
