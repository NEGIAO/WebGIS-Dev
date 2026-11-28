# 2026-11-28 Stamen 水彩底图分类纠正（影像 → 电子）

- **日期与时间**：2026-11-28 16:15
- **任务等级**：L2（元数据纠错）
- **版本号顺延**：V3.7.19 已被同会话前一任务占用，本任务顺延为 **V3.7.20**。

## 一、问题分析（阶段一：写代码前完成）

### 核心症状

用户实机截图显示「40 · 水彩 · Stamen / WGS84」与「Stamen水彩 · Stamen / WGS84」被归入影像底图；用户指出该底图也是电子地图类。

### 根本原因

`definitions/category-imagery.ts` 中 `theme_stamen_watercolor` 的 `catalogCategory` 显式写为 `imagery`。`catalog/registry.ts:54` 优先采用源定义的显式分类，故预设与源图层条目都归影像，且 tag 也写入 `imagery`。

与上一处 MapTiler ocean 不同：`taxonomy.ts` 的关键词规则并不把 `watercolor` 判为影像，`theme_` 前缀会正确落到 `electronic`，因此**无需新增推断覆盖**——只需修正显式元数据并迁移定义文件。

### 受影响模块

- `definitions/category-imagery.ts`、`definitions/category-electronic.ts`：定义 SSOT 分类归属。
- `Docs/Guide/frontend-structure.md`：分类文件条目计数。
- `catalog/registry.ts` / `catalog/taxonomy.ts`：消费端与推断端，经核对无需改动。

### 候选方案对比

| 方案 | 做法 | 评估 |
|---|---|---|
| A（选定） | 迁移定义到电子类文件并改 `catalogCategory` | 修正显式 SSOT；与同系列 Stamen Toner（已在电子类）一致 |
| B | 只改字段不迁移文件 | 分类正确但文件组织与分类不符，易在后续整理时回退 |
| C | 加 taxonomy 覆盖 | 推断本就正确，属冗余，拒绝 |

## 二、修改内容

1. `definitions/category-imagery.ts`：删除 `theme_stamen_watercolor` 定义块（order 145）。
2. `definitions/category-electronic.ts`：按原 order 145 重新登记，`catalogCategory` 改为 `electronic`，其余字段（provider/coord/description/url/method）不变。
3. `Docs/Guide/frontend-structure.md`：分类文件计数同步（影像 30→29、电子 116→117，注释补记水彩属电子专题）。
4. README 三处 + CHANGELOG 新增 V3.7.20 条目。

## 三、修改原因

`registry.ts` 以定义中的显式分类为准，只改显示标签无法改变目录归属；迁移定义文件则保持「分类 = 文件归属」的 SSOT 组织方式，并与已在电子类的 Stamen Toner 系列一致。`taxonomy.ts` 无需改动——`theme_` 前缀推断本就返回 `electronic`，新增覆盖属冗余。

## 四、影响范围

- 底图目录分类树与预设标签；不涉及 id / order / URL / 渲染引擎，不涉及其他 Stamen 条目（Toner 系列已在电子类、Stamen地形在地形类）。
- 199 条定义与 181 个预设总量不变。

## 五、解决方案

采用候选方案 A。顺序：写分析段 → 迁移定义并改字段 → 同步结构树与版本文档 → 跑门禁。

## 六、性能指标

未实测（纯静态元数据变更）。

## 七、测试方案

### Agent 已执行

1. `npm run typecheck`（`vue-tsc --noEmit`）：0 错误。
2. `node scripts/check-layer-definitions.mjs`：OK，199 条定义、orders 1..199、stacks 可解析。
3. `node scripts/check-basemap-catalog.mjs`：OK，181 预设、20 AMAP + 30 Google combos、20 推荐。
4. `python Scripts/CheckStructureTree.py`：769/769，漏登记 0、幽灵条目 0。
5. `python Scripts/CheckConfigRegistry.py`：B1–B4 / F1–F3 全绿。
6. 静态核对：`theme_stamen_watercolor` 仅在 electronic 文件出现，imagery 文件零命中。

### 待用户实机验证

底图目录「电子底图」分组下出现「Stamen水彩 · Stamen / WGS84」；「影像底图」分组下不再出现。

## 八、变更文件清单

- `frontend/src/domains/common/basemap/definitions/category-imagery.ts`：移除误分类定义。
- `frontend/src/domains/common/basemap/definitions/category-electronic.ts`：迁入定义并改 `catalogCategory`。
- `Docs/Guide/frontend-structure.md`：分类文件计数同步。
- `README.md`、`Docs/Guide/CHANGELOG.md`：版本 V3.7.20 同步。
- `Docs/LLM_record/26-11/2026-11-28/2026-11-28-stamen-watercolor-category-fix.md`：本日志。

## 九、遗留与风险

- 版本号因同日连续任务顺延至 V3.7.20；README/CHANGELOG/结构树为多次叠加编辑，提交前需核对完整 diff。
- 未实机打开浏览器验证目录树，仅静态与门禁验证。
- 未执行任何 Git 写操作。
