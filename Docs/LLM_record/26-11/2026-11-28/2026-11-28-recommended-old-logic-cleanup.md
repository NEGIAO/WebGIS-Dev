# 2026-11-28 清理「前 20 条 preset 即推荐」旧机制残留（零散修补）

- **日期与时间**：2026-11-28 12:58
- **任务等级**：L1 微改（注释/文档清理，零逻辑改动）
- **本次版本**：无版本变动（沿用 V3.7.28）

## 问题分析

V3.7.28 已将推荐分类改为显式清单（废弃 `RECOMMENDED_FIRST_N` / `CATEGORY_OVERRIDES` / `hasCategoryOverride`）。用户要求「删除旧的以前 20 个 id 为推荐底图的逻辑代码，清理干净并更新架构和相关文档」。

全仓扫描结果：

| 位置 | 性质 | 处置 |
|---|---|---|
| `CesiumToolPanel.ts:481` 注释「前 20 条 preset 归入精选底图后 vector 仅留在 tags 中」 | **唯一活代码残留**——过时注释，描述旧机制 | 改写为现行机制（显式清单 + tags 保留原分类） |
| `category-recommended.ts` 头注释「初始内容：迁移前的前 20 条预设原样 copy」 | 历史来源说明，但易被误读为仍依赖顺序 | 改为「一次性 copy 仅供起步，此后推荐集合只由本文件决定」 |
| 架构文档 §4.1/§8 标注 V3.7.27 | 版本号错误（实为 V3.7.28 落地） | 修正 |
| `Docs/TODO/2026-11-28-recommended-basemap-explicit-plan.md` 状态「实施中」 | 方案已完成 | 按 TODO 索引规范迁 `archive/`，索引移入第三节并补核验依据；README/CHANGELOG/日志链接同步 |
| 历史日志（code-review-bugfixes / basemap-tree-two-level / 本次实施日志）中的「前 20 条」 | 历史事实记录 | **保留不改写**（Force_command §2.4 禁止改写历史日志） |

## 修改内容

1. `CesiumToolPanel.ts`：`isCatalogEntryDisabled` 注释改为「精选底图由显式清单决定——被推荐的 MVT 条目 category='recommended'、原分类仅保留在 tags 中」。
2. `category-recommended.ts`：版本注释 V3.7.27→V3.7.28；初始内容说明改为「一次性 copy，此后只由本文件决定，与预设顺序无关联」。
3. `Docs/Architecture/basemap-catalog-redesign.md`：§4.1/§8 版本号修正，§8 补记注释清理。
4. 方案文档迁 `Docs/TODO/archive/`，`Docs/TODO/README.md` 索引移到归档节，README/CHANGELOG/实施日志的三处链接同步。

## 验证

- 代码残留扫描：`RECOMMENDED_FIRST_N` / `hasCategoryOverride` / `CATEGORY_OVERRIDES` / `index < 20` / 「前 20 条 preset」在 `frontend/src` + `frontend/scripts` 中 **零命中**。
- `vue-tsc --noEmit`：0 错误。
- `check:basemap-catalog`：OK（148 presets + 20 recommended）；`check:layer-definitions`：OK（174）。
- `CheckStructureTree`：769/769；`CheckConfigRegistry`：全绿。

## 变更文件清单

- `frontend/src/domains/cesium/components/CesiumToolPanel.ts`
- `frontend/src/domains/common/basemap/definitions/category-recommended.ts`
- `Docs/Architecture/basemap-catalog-redesign.md`
- `Docs/TODO/2026-11-28-recommended-basemap-explicit-plan.md` → `Docs/TODO/archive/`（迁移）
- `Docs/TODO/README.md`、`README.md`、`Docs/Guide/CHANGELOG.md`
- `Docs/LLM_record/26-11/2026-11-28/2026-11-28-recommended-basemap-explicit.md`
- 本日志

## 遗留与风险

无。历史日志中的「前 20 条」表述是当时的事实记录，按规范保留不改写。
