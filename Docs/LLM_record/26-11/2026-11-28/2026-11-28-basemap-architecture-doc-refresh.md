# 2026-11-28 底图架构文档按实际代码重写

- **日期与时间**：2026-11-28 10:48
- **任务等级**：L2（文档重写，无代码改动）
- **本次版本**：V3.7.19

## 问题分析

**核心症状**：`Docs/Architecture/basemap-catalog-redesign.md` 停留在 V3.7.6 时代的「重构方案」视角，与实际工作树严重漂移：

- §2 现状调查仍描述已删除的 `ol/basemap/constants/basemapCore.ts` 与 `definitions/group-1~4.ts`；
- §3 元数据模型写的是 `BasemapLayerDefinition`（含 `tokenParam`/`adapters` 等字段），而实际定义类型是 `TileLayerDefinition`（`method`/`correction`/`proxy`/`engines`/`skipHighResTile`）；
- §5 规划的 `ol/basemap/adapters/`、`cesium/basemap/adapters/` 目录从未落地，实际是 `ol/basemap/loaders/createOlSource.ts` 与 `cesium/constants/basemapProviderFactory.ts`；
- §7 分阶段计划仍标「进行中」，而实施记录显示 5 阶段均已完成；
- 全文无 Mermaid 图，不符合 Force_command §2.9 对架构文档的硬性要求。

**根本原因**：V3.7.16 定义层重构落地后只追加了 §10 实施记录，未回写前文「现状/模型/适配层」，造成同一文档内自相矛盾。

## 修改内容

1. 全文重写为「已落地现状架构文档」，删除过时的方案视角与重复的实施记录。
2. 新增 §1 定位与不变量：明确两套 SSOT 分工（174 条技术定义 / 148 条预设编号），`catalog/` 仅为查询视图。
3. §3 写实 `TileLayerDefinition` 字段表、六类分片组织、`resolveTileUrl` URL 解析管线、`coord` 与 `correction` 的语义区分。
4. §4 补录 catalog 数据流（预设 + 定义 → buildEntries → 树/搜索 → 双端面板）、分类与搜索契约、compat 兼容出口。
5. §5 双引擎适配写实：OL `createOlSource` 的 method 分支表、Cesium 工厂、`catalogProjection` 注册式投影。
6. §6 动态源、§7 校验门禁（3 个脚本 + 运行期校验）、§8 实施记录与遗留项、§9 新增底图流程。
7. **新增 5 张 Mermaid 图**：总体架构 flowchart、URL 解析管线 flowchart、目录数据流 sequenceDiagram、动态源 flowchart、新增底图流程图。
8. README 三处版本号 + CHANGELOG 条目。

## 修改原因

用户指出「又做了更改」并要求结合实际代码更新架构文档、补上必要 Mermaid 图。逐文件核对后确认文档漂移范围，按实际代码重写。

## 影响范围

文档：`Docs/Architecture/basemap-catalog-redesign.md`、`README.md`、`Docs/Guide/CHANGELOG.md`、本日志。
**勘误（2026-11-28 V3.7.20 会话订正）**：本会话另完成了 `CesiumToolPanel.vue` 的模板/样式改动
（目录树统一用 `catalogTree`、移除组合折叠区块、新增官方影像服务区块），原「仅文档、零代码改动」表述不实；
`.ts` 侧配套修复与行为说明见 [2026-11-28-staged-review-fixes](./2026-11-28-staged-review-fixes.md)（V3.7.20）。

## 验证

### Agent 已执行

- 逐文件读取核对：`definitions/{types,resolveTileUrl,validate,index}.ts`、`catalog/{registry,compat,types}.ts`、`catalogProjection.ts`、`ol/basemap/loaders/createOlSource.ts`、`cesium/constants/basemapProviderFactory.ts`、`scripts/check-basemap-{catalog,migration}.mjs`、`package.json`。
- Mermaid 图 5 张，覆盖模块关系、数据流向、文件交互（符合 §2.9）。
- `CheckStructureTree` / `CheckConfigRegistry`：全绿。
- 未运行前端 typecheck（无代码改动，无需）。

### 待用户实机验证

- 无（纯文档更新）。

## 变更文件清单

- `Docs/Architecture/basemap-catalog-redesign.md`：全文重写 + 5 张 Mermaid 图。
- `README.md`：V3.7.19 版本号三处。
- `Docs/Guide/CHANGELOG.md`：V3.7.19 条目。
- `frontend/src/domains/cesium/components/CesiumToolPanel.vue`：目录树统一 + 官方影像服务区块 + 组合折叠区块移除（勘误补登记，2026-11-28）。
- 本日志。

## 遗留与风险

- `check-basemap-migration.mjs` 未登记到 `package.json` 的 `check:*` 脚本，文档已注明需手动 `node scripts/...` 运行；后续可补登记（属配置变更，需走 catalog 登记流程）。
- `imageryProviderBuilders.ts` 的兼容分支暂留作 fallback，待行为快照回归后移除（已在文档遗留项标注）。
