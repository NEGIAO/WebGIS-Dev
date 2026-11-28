# 2026-11-28 删除失效底图 USGS影像地形

- **日期与时间**：2026-11-28 16:17
- **任务等级**：L2（删除条目 + 编号治理）
- **版本号顺延**：V3.7.20 已被同会话前一任务占用，本任务顺延为 **V3.7.21**。

## 一、问题分析（阶段一：写代码前完成）

### 核心症状

用户实机截图显示「177 · USGS影像地形 · Other / WGS84」与「USGS影像地形 · USGS / WGS84」，明确反馈该底图已失效，要求删除。

### 根本原因与删除范围

该底图由两处声明构成：

1. **图层定义**：`definitions/category-imagery.ts` 中 `imagery_usgs_topo`（order 154）。
2. **目录预设**：`basemapPresets.ts` 中 `imagery_usgs_topo_preset`（stack 指向上述定义）。

全仓引用核对：除历史日志外，仅这两处业务代码引用；不在精选清单、快捷命令或罗盘规则中。USGS 另两条（`imagery_usgs` / `terrain_usgs_topo`）不在本次删除范围。

### 编号影响（必须同步）

- `check-layer-definitions.mjs` 要求全局 order 无重复且覆盖 1..N：删除 order 154 后，其后所有 order（155..199）须整体 -1，总量 199→198。
- `check-basemap-catalog.mjs` 的 `MIN_PRESET_COUNT=181` 是回退护栏，删除后预设总量 181→180，基线须同步下调。
- 预设数组顺序即 URL `l` 参数编号：删除该预设后其后预设编号整体 -1，已保存的 `?l=` 链接可能指向相邻底图，属已知契约变更，需在日志与交接块中明确告知。

### 受影响模块

- `frontend/src/domains/common/basemap/definitions/category-*.ts`（order 重编号）
- `frontend/src/domains/common/basemap/basemapPresets.ts`（删预设）
- `frontend/scripts/check-basemap-catalog.mjs`（数量护栏）
- 计数类文档：README、结构树、Guide/handover.md、Architecture 两篇

### 候选方案对比

| 方案 | 做法 | 评估 |
|---|---|---|
| A（选定） | 彻底删除定义 + 预设，全局 order 顺延，护栏/文档同步 | 干净、无死条目；代价是后续预设编号前移 |
| B | 只删预设、留定义 | 目录不可见但定义仍登记、可被 URL/工具引用，遗留死数据 |
| C | 保留占位条目 | 编号不变但继续展示失效底图，违背用户要求 |

选定 A。

## 二、修改内容

1. `basemapPresets.ts`：删除 `imagery_usgs_topo_preset` 一行。
2. `definitions/category-imagery.ts`：删除 `imagery_usgs_topo` 定义块（原 order 154）。
3. 全局 order 顺延：对 4 个定义文件中所有 `order > 154` 的定义统一 -1，共 45 条（imagery 2 / service 2 / terrain 39 / vector 2），恢复 1..198 连续；其余字段逐字未动。
4. `scripts/check-basemap-catalog.mjs`：`MIN_PRESET_COUNT` 181→180，注释改为「删除失效 USGS影像地形 后的冻结基线」。
5. 计数文档同步：README（181/199→180/198）、结构树（定义总数 199→198、影像类 29→28）、`Guide/handover.md`、两篇现行态架构文档的当前数量与 `zBand` 上界。
6. README 三处 + CHANGELOG 新增 V3.7.21 条目。

## 三、修改原因

该底图已失效，继续保留会让目录出现不可用入口。删除必须成对处理定义与预设，否则会留下不可见但可被 URL/工具引用的死数据。order 连续性是启动校验硬约束，故必须整体顺延，不能留空洞。

## 四、影响范围

- 底图目录、预设数量与 URL `l` 编号契约；其他 USGS 条目（USGS影像、USGS地形图）保留。
- 不涉及后端、鉴权、地图引擎加载代码。

## 五、解决方案

采用候选方案 A。顺序：写分析段 → 删预设与定义 → 脚本化批量 order 顺延（仅匹配 `order: N` 行，保留 CRLF）→ 下调护栏 → 同步文档 → 跑门禁。

## 六、性能指标

未实测（静态数据与文档变更）。

## 七、测试方案

### Agent 已执行

1. `npm run typecheck`（`vue-tsc --noEmit`）：0 错误。
2. `node scripts/check-layer-definitions.mjs`：OK，198 条定义、orders 1..198、无重复/空洞、stacks 可解析。
3. `node scripts/check-basemap-catalog.mjs`：OK，180 预设、20 AMAP + 30 Google combos、20 推荐。
4. `python Scripts/CheckStructureTree.py`：769/769，漏登记 0、幽灵条目 0。
5. `python Scripts/CheckConfigRegistry.py`：B1–B4 / F1–F3 全绿。
6. 全仓 `frontend/src` 搜索 `imagery_usgs_topo` / `USGS影像地形`：零命中。
7. `check-basemap-migration.mjs`：未运行——迁移基线仍为 HEAD 115 条，与当前 198 条不一致（历史既有 NOT RUN 项，非本任务引入）。

### 待用户实机验证

打开底图目录，确认「USGS影像地形」不再出现；「USGS影像」「USGS地形图」仍在。若使用过 `?l=` 分享链接，删除点之后的编号已前移一位，需重新生成链接。

## 八、变更文件清单

- `frontend/src/domains/common/basemap/basemapPresets.ts`：删失效预设。
- `frontend/src/domains/common/basemap/definitions/category-imagery.ts`：删失效定义。
- `frontend/src/domains/common/basemap/definitions/category-{service,terrain,vector}.ts`：order 顺延。
- `frontend/scripts/check-basemap-catalog.mjs`：数量护栏下调。
- `README.md`、`Docs/Guide/frontend-structure.md`、`Docs/Guide/handover.md`、`Docs/Architecture/basemap-source-system.md`、`Docs/Architecture/basemap-catalog-redesign.md`、`Docs/Guide/CHANGELOG.md`：数量/版本同步。
- `Docs/LLM_record/26-11/2026-11-28/2026-11-28-remove-usgs-imagery-topo.md`：本日志。

## 九、遗留与风险

- **URL 编号前移**：预设数组顺序即 `l` 参数编号，删除后其后预设编号整体 -1，历史分享链接可能指向相邻底图。若需保持旧链接稳定，应另行设计稳定 id 映射（本次未做）。
- 架构文档中 V3.7.16 历史叙述里的「199 条」保留未改，因其描述的是当时批次事实；现行态计数均已改为 198/180。
- 版本号因同日连续任务顺延至 V3.7.21；README/CHANGELOG/结构树为多次叠加编辑，提交前需核对完整 diff。
- 未执行任何 Git 写操作。
