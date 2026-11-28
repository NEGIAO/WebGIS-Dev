# 2026-11-28 MapTiler 海洋底图分类纠正（影像 → 电子）

- **日期与时间**：2026-11-28 16:12
- **任务等级**：L2（元数据纠错）
- **版本号顺延**：V3.7.18 已被并发的架构文档核对会话占用，本任务按 Force_command §5 顺延为 **V3.7.19**。

## 一、问题分析（阶段一：写代码前完成）

### 核心症状

用户实机截图显示底图目录中「50 · 海洋 · MapTiler / WGS84」与「MapTiler海洋 · MapTiler / WGS84」被归入**影像底图**，实际该底图（MapTiler `ocean-v4` 样式）是电子地图类专题底图，应归**电子底图**。

### 根本原因

两处分类信息同时指向 imagery：

1. **显式定义错误**：`definitions/category-imagery.ts` 中 `theme_maptiler_ocean` 的 `catalogCategory: 'imagery'`。`catalog/registry.ts:54` 优先采用源定义的显式分类，故预设 `theme_maptiler_ocean_preset` 与源图层条目都显示影像分类，并写入 `tags`。
2. **推断规则过宽**：`catalog/taxonomy.ts:129` 的影像判定正则包含 `ocean`，任何含 ocean 的 id/label 都会先于 `theme_` 电子规则命中。即便没有显式定义，该条目仍会被误判。

### 受影响模块

- `frontend/src/domains/common/basemap/definitions/category-imagery.ts`、`category-electronic.ts`：定义 SSOT 的分类归属。
- `frontend/src/domains/common/basemap/catalog/taxonomy.ts`：缺省分类推断。
- `frontend/src/domains/common/basemap/catalog/registry.ts`：预设元数据装配（消费端，不改）。
- `Docs/Guide/frontend-structure.md`：分类文件条目注释（数量同步）。

### 候选方案对比

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| A（选定） | 移动定义到 electronic 文件并改 `catalogCategory`，同时加精确 id 覆盖 | 显式 SSOT 与推断规则一致；不影响 ESRI Ocean 等真影像条目 | 跨两个定义文件 + 结构树注释 |
| B | 只改 `catalogCategory` 字段 | 改动最小 | 定义仍留在影像文件，推断规则仍错，易回归 |
| C | 从影像正则全局删 `ocean` | 一处改完 | ESRI 海洋底图（真影像）会被误判为电子，扩大错误面 |

选定 A：精确纠错，不误伤其他 ocean 系列。

## 二、修改内容

1. `definitions/category-imagery.ts`：删除 `theme_maptiler_ocean` 定义块（order 144）。
2. `definitions/category-electronic.ts`：在末尾按原 order 144 重新登记该定义，`catalogCategory` 改为 `electronic`，保留 provider/coord/url/method 原值。
3. `catalog/taxonomy.ts`：新增 `CATEGORY_OVERRIDES`，精确覆盖 `theme_maptiler_ocean` 与 `theme_maptiler_ocean_preset` 为 `electronic`，并在 `classifyCategory()` 首行优先判读。
4. `Docs/Guide/frontend-structure.md`：分类定义文件注释计数同步（影像 31→30、电子 115→116，并标注 ocean-v4 属电子专题）。
5. README 三处 + CHANGELOG 新增 V3.7.19 条目（V3.7.18 被并发会话占用，顺延）。

## 三、修改原因

`catalog/registry.ts:54` 以源定义的显式 `catalogCategory` 为准，定义写错会同时污染预设分类与标签；分类推断正则又因 `ocean` 抢先命中而重复误判。两处必须同时修正，否则任一处遗漏都会在热重载 / 预设重建时回归。未删除全局 `ocean` 规则，避免误伤 ESRI Ocean 等真影像条目。

## 四、影响范围

- 底图目录分类树（影像类 / 电子类）与预设标签；不涉及 id、order、URL、渲染引擎。
- 199 条定义总量与 181 个预设总量不变。

## 五、解决方案

采用候选方案 A。顺序：先写本日志分析段 → 迁移定义并改显式分类 → 加精确 id 覆盖 → 同步结构树与版本文档 → 跑门禁。

## 六、性能指标

未实测（纯静态元数据变更，无运行时计算路径调整）。

## 七、测试方案

### Agent 已执行

1. `npm run typecheck`（`vue-tsc --noEmit`）：0 错误。
2. `node scripts/check-layer-definitions.mjs`：OK，199 条定义、orders 1..199、stacks 全部可解析。
3. `node scripts/check-basemap-catalog.mjs`：OK，181 预设、20 AMAP + 30 Google combos、20 推荐。
4. `python Scripts/CheckStructureTree.py`：769/769，漏登记 0、幽灵条目 0。
5. `python Scripts/CheckConfigRegistry.py`：B1–B4 / F1–F3 全绿。
6. 静态核对：`theme_maptiler_ocean` 在 electronic 文件中唯一存在，imagery 文件零命中；两处分类来源（显式字段 + 推断覆盖）均为 electronic。

### 待用户实机验证

打开底图目录树，在「电子底图」分组下确认「MapTiler海洋 / MapTiler / WGS84」出现；「影像底图」分组下不再出现该条目，但 ESRI 海洋底图仍在影像类。

## 八、变更文件清单

- `frontend/src/domains/common/basemap/definitions/category-imagery.ts`：移除误分类定义。
- `frontend/src/domains/common/basemap/definitions/category-electronic.ts`：迁入定义并改 `catalogCategory`。
- `frontend/src/domains/common/basemap/catalog/taxonomy.ts`：新增分类精确覆盖。
- `Docs/Guide/frontend-structure.md`：分类文件条目计数同步。
- `README.md`、`Docs/Guide/CHANGELOG.md`：版本 V3.7.19 同步。
- `Docs/LLM_record/26-11/2026-11-28/2026-11-28-maptiler-ocean-category-fix.md`：本日志。

## 九、遗留与风险

- 版本号与并发会话冲突：V3.7.18 已被架构文档核对会话占用，本任务顺延 V3.7.19；README/CHANGELOG/结构树为双方先后叠加编辑，提交前请核对完整 diff。
- 未实机打开浏览器验证目录树，仅静态与门禁验证。
- 未执行任何 Git 写操作。
