# 2026-11-28 Stadia 户外底图分类纠正（地形 → 电子）

- **日期与时间**：2026-11-28 16:25
- **任务等级**：L2（元数据纠错）
- **版本号顺延**：V3.7.22 已被同会话前一任务占用，本任务顺延为 **V3.7.23**。

## 一、问题分析（阶段一：写代码前完成）

### 核心症状

用户实机截图显示「39 · 户外 · Stadia / WGS84」与「Stadia户外 · Stadia / WGS84」位于地形底图分类，用户指出应属电子地图，要求迁移。

### 根本原因

两处分类信息都指向 terrain：

1. **显式定义**：`definitions/category-terrain.ts` 中 `terrain_outdoors`（order 179）的 `catalogCategory: 'terrain'`；`registry.ts:54` 优先采用该字段，预设与源条目均归地形。
2. **推断规则**：`taxonomy.ts:139` 的地形正则包含 `terrain`，而该 id 以 `terrain_` 开头；若定义缺失，缺省推断同样会误判为地形。

### 受影响模块

- `definitions/category-terrain.ts`、`definitions/category-electronic.ts`：定义 SSOT 归属。
- `catalog/taxonomy.ts`：缺省推断（需精确覆盖，避免回归）。
- `Docs/Guide/frontend-structure.md`：分类文件计数。
- `catalog/registry.ts`：消费端，不改。

### 候选方案对比

| 方案 | 做法 | 评估 |
|---|---|---|
| A（选定） | 迁移定义 + 改显式分类 + 加精确 id 覆盖 | 双源一致，不误伤 Mapbox 户外等真地形条目 |
| B | 只改 `catalogCategory` | 文件归属与分类不符，推断仍错 |
| C | 删除全局 `terrain` 关键词 | 会误伤大量真地形定义（含 Mapbox 户外），扩大错误面 |

选定 A。

## 二、修改内容

1. `definitions/category-terrain.ts`：删除 `terrain_outdoors` 定义块（order 179）。
2. `definitions/category-electronic.ts`：按原 order 179 重新登记，`catalogCategory` 改为 `electronic`，其余字段不变。
3. `catalog/taxonomy.ts`：`CATEGORY_OVERRIDES` 增加 `terrain_outdoors` / `terrain_outdoors_preset` → `electronic`，注释说明不误伤 Mapbox 户外等条目。
4. `Docs/Guide/frontend-structure.md`：地形 39→38、电子 117→118。
5. README 三处 + CHANGELOG 新增 V3.7.23 条目。

## 三、修改原因

`registry.ts` 优先采用定义中的显式分类，只改显示标签无法改变目录归属；迁移定义保持「分类 = 文件归属」的 SSOT 组织方式。由于 id 前缀 `terrain_` 会使缺省推断也判错，必须同时加精确覆盖，否则热重载或定义缺失时回归。未删除全局 `terrain` 关键词，避免误伤 Mapbox 户外等真地形条目。

## 四、影响范围

- 底图目录分类树与预设标签；id / order / URL / 引擎均不变。
- 198 条定义与 179 个预设总量不变。

## 五、解决方案

采用候选方案 A。顺序：写分析段 → 迁移定义并改字段 → 加推断覆盖 → 同步结构树与版本文档 → 跑门禁。

## 六、性能指标

未实测（静态元数据变更）。

## 七、测试方案

### Agent 已执行

1. `npm run typecheck`（`vue-tsc --noEmit`）：0 错误。
2. `node scripts/check-layer-definitions.mjs`：OK，198 条定义、orders 1..198、stacks 可解析。
3. `node scripts/check-basemap-catalog.mjs`：OK，179 预设、20 AMAP + 30 Google combos、20 推荐。
4. `python Scripts/CheckStructureTree.py`：769/769，漏登记 0、幽灵条目 0。
5. `python Scripts/CheckConfigRegistry.py`：B1–B4 / F1–F3 全绿。
6. 定义目录搜索：`terrain_outdoors` 仅在 `category-electronic.ts` 出现一次。

### 待用户实机验证

底图目录「电子底图」分组下出现「Stadia户外 · Stadia / WGS84」；「地形底图」分组下不再出现；Mapbox 户外仍在地形类。

## 八、变更文件清单

- `frontend/src/domains/common/basemap/definitions/category-terrain.ts`：移除误分类定义。
- `frontend/src/domains/common/basemap/definitions/category-electronic.ts`：迁入定义并改 `catalogCategory`。
- `frontend/src/domains/common/basemap/catalog/taxonomy.ts`：新增精确分类覆盖。
- `Docs/Guide/frontend-structure.md`：分类文件计数同步。
- `README.md`、`Docs/Guide/CHANGELOG.md`：版本 V3.7.23 同步。
- `Docs/LLM_record/26-11/2026-11-28/2026-11-28-stadia-outdoors-category-fix.md`：本日志。

## 九、遗留与风险

- Mapbox 户外（`terrain_mapbox_outdoors`）同为 outdoors 专题样式、当前仍归地形类；本次按用户明确范围未动，若需一致处理另起任务。
- 版本号因同日连续任务顺延至 V3.7.23；提交前需核对叠加 diff。
- 未实机打开浏览器验证目录树，仅静态与门禁验证。
- 未执行任何 Git 写操作。
