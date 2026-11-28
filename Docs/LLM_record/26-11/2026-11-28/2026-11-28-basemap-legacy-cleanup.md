# 2026-11-28 底图架构遗留项清理

- **日期与时间**：2026-11-28 12:25
- **任务等级**：L2（死代码与遗留项清理）
- **本次版本**：并入 V3.7.20（同批次，版本已由并行会话占用）

## 问题分析

用户要求「修复他们，将他们清理干净」，指架构文档 §8 列出的遗留项。逐项核查实际状态：

| 遗留项 | 核查结论 | 处置 |
|---|---|---|
| `url:'None'` warning 分支 | A1 已清零，warning 文案仍写「已知既有问题，未修复」；`check-layer-definitions.mjs` 已有 `expect(noneCount===0)` 硬守护 | 升级为 error，硬失败防回潮，清掉过时话术 |
| `check-basemap-migration.mjs` 未登记 npm 脚本 | 需手动 `node scripts/...` | 登记为 `npm run check:basemap-migration` |
| `catalog/compat.ts` | 全仓零引用（连 `catalog/index.ts` 都不导出） | 删除死文件 + 同步结构树/架构文档 |
| `wmts` 以 XYZ 形态加载 | 同步工厂无法拉 Capabilities、手写 tileGrid 属猜测 | **设计取舍，不清理** |
| `coord` 只描述输出坐标系 | 满足当前全部单向纠偏场景 | **设计取舍，不清理** |
| `imageryProviderBuilders.ts` google/custom/tianditu 分支 | 经核查仍被 `useCesiumLayers.ts` 使用，服务原生 BaseLayerPicker 的 ViewModel 机制 | **活功能，不清理** |

## 修改内容

1. 删除 `frontend/src/domains/common/basemap/catalog/compat.ts`（零引用死文件）。
2. `validate.ts`：`url:'None'` 从 warning 升级为 error，更新文件头注释。
3. `frontend/package.json`：新增 `check:basemap-migration` 脚本。
4. `Docs/Architecture/basemap-catalog-redesign.md`：§4.3 改为「公共出口」、§7/验收命令改用 npm 脚本、§8 新增阶段 7 并把前三项改为「设计取舍（非遗留）」，遗留项清零。
5. `Docs/Guide/frontend-structure.md`：删除 compat.ts 树条目。

## 修改原因

用户明确要求清理干净遗留项。核查后发现 3 项可清理、3 项是活功能或设计取舍——后者如实标注为「不清理」而非强行删除，避免破坏 BaseLayerPicker 等真实功能。

## 影响范围

仅前端底图模块的死代码/校验话术与 npm 脚本，零业务逻辑改动。`catalog/compat.ts` 零消费者，删除不影响任何 import。

## 验证

### Agent 已执行

- `npx vue-tsc --noEmit`：0 错误。
- `npm run check:basemap-catalog`：OK（148 presets）。
- `npm run check:layer-definitions`：OK（174 definitions）。
- `npm run check:basemap-migration`：SKIP（HEAD 基线差异，按设计显式跳过，非失败）。
- `CheckStructureTree`：768/768 漏登记 0、幽灵 0；`CheckConfigRegistry`：全绿。

### 待用户实机验证

无（死代码与校验清理，无运行时行为变化）。

## 变更文件清单

- `frontend/src/domains/common/basemap/catalog/compat.ts`（删除）
- `frontend/src/domains/common/basemap/definitions/validate.ts`
- `frontend/package.json`
- `Docs/Architecture/basemap-catalog-redesign.md`
- `Docs/Guide/frontend-structure.md`
- 本日志

## 遗留与风险

- 架构文档「遗留项：无」——三项已明确标注为设计取舍/活功能，后续若需改变 wmts 加载形态或 coord 语义，属新需求而非清理。
