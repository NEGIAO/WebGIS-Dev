# 2026-11-28 精选底图改为显式清单

- **日期与时间**：2026-11-28 12:46
- **任务等级**：L3 机制变更（用户明确指令，依 Force_command §0 优先级 1 视为批准）
- **本次版本**：V3.7.28（V3.7.27 已被并行会话占用，按 §5 顺延）

## 问题分析

推荐分类原由位置规则决定：`registry.ts` 用 `index < RECOMMENDED_FIRST_N`（20）判定 preset 是否推荐，并靠 `taxonomy.ts` 的 `CATEGORY_OVERRIDES` 打补丁（arcgis/yandex 强制 imagery）。缺陷：

- 推荐集合与预设顺序强耦合——插入/删除预设即改变推荐结果；
- 推荐名单不可见、不可维护；
- `CATEGORY_OVERRIDES` 是位置规则的补丁，越补越乱。

## 用户要求

不固定前 20 个 id；在 definitions 增加推荐底图分类，完整定义想要的底图，可自由增删改；暂定 copy 前 20 条；推荐允许与别的分类重复（快捷入口）。

## 修改内容

1. **新增** `definitions/category-recommended.ts`：
   - `RECOMMENDED_BASEMAPS` 20 条 `RecommendedBasemapEntry`（`presetId` + `note` 识别注释，含 label/stack）；
   - `RECOMMENDED_PRESET_IDS` Set 供 O(1) 判定；
   - 只存 preset id，展示元数据仍来自 preset/definition（避免两处维护漂移，符合 SSOT）。
2. **registry.ts**：`category = RECOMMENDED_PRESET_IDS.has(id) ? 'recommended' : layer.catalogCategory ?? classifyCategory(...)`；移除 `RECOMMENDED_FIRST_N` / `hasCategoryOverride` 导入；注释更新（推荐条目通过 tags 保留原分类）。
3. **taxonomy.ts**：删除 `RECOMMENDED_FIRST_N`、`CATEGORY_OVERRIDES`、`hasCategoryOverride()` 及 `classifyCategory()` 内对该常量的引用；保留 `PROVIDER_OVERRIDES` / `COORD_OVERRIDES`。
4. **index.ts（definitions）**：导出新清单三项。
5. **check-basemap-catalog.mjs**：新增推荐 id 存在性 + 唯一性校验，输出 recommended 计数。
6. **文档**：架构文档 §3.2/§4.1/§8、前端结构树、TODO 索引、README 三处、CHANGELOG。

## 修改原因

用户要一个可自由维护的推荐清单，与预设顺序解耦；允许重复分类以承载「快捷入口」语义。

## 影响范围

仅底图目录的推荐判定与清单定义，零运行时引擎改动。`catalogCategory` 仍是各条目的真实分类，推荐只是额外标签。

## 设计取舍

- **推荐清单只存 preset id，不完整复制元数据**：用户说「完整定义」，但完整复制 label/stack/provider/coord/description 会与 `basemapPresets.ts` + definitions 形成两份数据、必然漂移（Force_command §4 SSOT）。采用「id + note 注释」：用户能看懂每条是什么、可自由增删改，数据仍单一来源。
- **允许重复通过 tags 实现**：推荐 item 的 `category='recommended'`，同时 `tags` 含 `layer.catalogCategory`，`getBasemapTree()` 按 `category === cat || tags.includes(cat)` 过滤，因此同一条目同时出现在「常用推荐」与原分类。

## 验证

### Agent 已执行

- `npx vue-tsc --noEmit`：0 错误（迭代中修复了 taxonomy 内遗留的 `CATEGORY_OVERRIDES` 引用）。
- `npm run check:basemap-catalog`：OK（148 presets, 20 AMAP + 30 Google, **20 recommended**）。
- `npm run check:layer-definitions`：OK（174 definitions）。
- 运行时校验 `category-recommended.ts`：20 条、id 唯一、顺序正确。
- `CheckStructureTree`：769/769 漏登记 0；`CheckConfigRegistry`：全绿。

### 待用户实机验证

1. 目录「常用推荐」显示 20 条，顺序与 `category-recommended.ts` 一致。
2. 推荐条目（如 `arcgis_imagery_preset`）同时出现在「影像底图」分类。
3. 增删改清单条目后立即生效，预设编号（`l` 参数）不变。

## 变更文件清单

- `frontend/src/domains/common/basemap/definitions/category-recommended.ts`（新增）
- `frontend/src/domains/common/basemap/definitions/index.ts`
- `frontend/src/domains/common/basemap/catalog/registry.ts`
- `frontend/src/domains/common/basemap/catalog/taxonomy.ts`
- `frontend/scripts/check-basemap-catalog.mjs`
- `Docs/TODO/archive/2026-11-28-recommended-basemap-explicit-plan.md`、`Docs/TODO/README.md`
- `Docs/Architecture/basemap-catalog-redesign.md`、`Docs/Guide/frontend-structure.md`
- `README.md`、`Docs/Guide/CHANGELOG.md`、本日志

## 遗留与风险

- 推荐清单后期由用户自行维护；`check-basemap-catalog` 会在推荐 id 不存在于预设表时报错，防止误删预设后残留悬空推荐。
