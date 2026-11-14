# 2026-11-13 修复 LayerControlPanel 模板 TS2339 诊断

## 日期与时间
2026-11-13 15:47

## 任务等级
L2（常规：Bug 修复，仅改 2 个现有文件，无新增/删除文件）

## 问题分析
- **核心症状**：IDE Problems 面板在 `frontend/src/domains/ol/layer/components/LayerControlPanel.vue` 模板中报 19 处 TS2339 `Property '…' does not exist on type 'CreateComponentPublicInstanceWithMixins<...>'`，涉及 `currentLayerLabel`、`regularBasemapOptions`、`historicalProviderTab`、`selectHistoricalProviderTab`、`sentinelYearGroups`、`toggleHistoryYear`、`isHistoryYearOpen`、`historicalImageryLoading`、`esriWaybackLayers`、`esriYearGroups`、`historicalImageryUpdatedAt`、`formatHistoryDate`，以及 `:color="white"` 中的 `white` 和 `$event.target.checked` 中 `EventTarget` 无 `checked`。
- **根本原因**：本组件已按「视图 / 实例物理分离」范式重构（`X.vue` 只留 template+style+单行 `<script lang="ts" src="./X.ts">`，逻辑在 `LayerControlPanel.ts` 的 `class Instance` 中）。构造函数中 `const catalog = useBasemapCatalog(...)` 仅通过 `Object.assign(this, catalog)` 在运行时将底图目录/历史影像成员挂载到实例，但 `Instance` 类上从未做 TS 声明，故 Vue 模板编译器/tsc 找不到这些同名标识。`white` 在类中亦未定义；`$event.target` 被推断为 `EventTarget`，不存在 `checked`。
- **受影响模块**：前端图层控制面板（`domains/ol/layer/components/LayerControlPanel`）及其能力层 `domains/ol/layer/composables/useBasemapCatalog`；模板型检查链路（Volar / `npx tsc --noEmit`）。

## 修改内容
1. `frontend/src/domains/ol/layer/components/LayerControlPanel.ts`
   - 导入 `ComputedRef`、`Ref` 类型；
   - 为 `useBasemapCatalog` 返回的模板消费成员补充 `public …!` 类型声明（`historicalProviderTab`、`historicalImageryLoading`、`esriWaybackLayers`、`historicalImageryUpdatedAt`、`openHistoryYears`、`regularBasemapOptions`、`sentinelYearGroups`、`esriYearGroups`、`currentLayerLabel`、`selectHistoricalProviderTab`、`toggleHistoryYear`、`isHistoryYearOpen`、`formatHistoryDate`、`loadHistoricalImageryCatalog`）；这些成员在构造函数中通过 `Object.assign(this, catalog)` 运行时挂载，此处仅补类型；
   - `selectHistoricalSnapshot` 中 `(this as any).historicalProviderTab.value = 'esri'` 改为强类型访问 `this.historicalProviderTab.value = 'esri'`。
2. `frontend/src/domains/ol/layer/components/LayerControlPanel.vue`
   - `:color="white"` → `:color="'white'"`；
   - `$event.target.checked` → `($event.target as HTMLInputElement).checked`。
3. `README.md`：版本号 V3.6.47→V3.6.48（项目简介行、版本演进表首行、页脚）；版本表恒定 3 行，挤出 V3.6.45，页脚「更早版本」口径改为 V3.6.45 及以前。
4. `Docs/Guide/CHANGELOG.md`：顶部追加 `### V3.6.48 (2026-11-13)` 完整条目。

## 修改原因
消除模板层 TS2339 诊断，使 `LayerControlPanel` 在「视图层 template / 实例层 class」范式下能通过静态类型检查，避免运行时因未声明成员导致的模板渲染异常。

## 影响范围
- 底图下拉选择器（当前层标签显示、常规底图选项、历史影像 Sentinel/ESRI 页签与年份分组、快照更新时间）；
- 经纬度分割线图标颜色（`Layers` 图标 `color`）；
- Cesium overlay 开关的 `checked` 读取；
- 版本号展示与更新日志（非运行时逻辑）。

## 解决方案
方案对比：
- A. 模板侧全部改为 `catalog.xxx`：改动面大，破坏现有模板风格，且与 `emit`/`tileHDRendering` 等已直接消费类成员的风格不一致 —— 放弃。
- B. 选定：在 `Instance` 类上补 `public …!` 声明，与构造函数 `Object.assign(this, catalog)` 的运行时挂载配合，遵循现有「模板直接消费同名公共成员」的范式（同 `layerManageButtonRef`、`isSelectDropdownOpen` 等）。
已验证各声明类型与 `useBasemapCatalog` 返回值匹配（`Ref<string>` / `ComputedRef<any[]>` / 函数签名），模板中的 `.split()` / `.slice()` / `.length` / `v-for` / 比较表达式类型正确。

## 性能指标
非性能相关任务，未实测。

## 测试方案
- **Agent 已执行**：`npx tsc --noEmit`（frontend）exit 0，无输出；`python Scripts/CheckStructureTree.py` 649/649 全绿，退出码 0；`python Scripts/CheckConfigRegistry.py` 7 项全绿，退出码 0。未执行任何 Git 写操作。
- **待用户实机验证**：
  1. 以 OpenLayers 引擎启动地图，打开图层控制面板；
  2. 底图下拉切换常规底图，顶部当前层标签正常显示（无模板渲染报错）；
  3. 展开「历史影像」，切换 Sentinel / ESRI 页签，展开年份组，快照条目可点击切换；
  4. Cesium 模式下 overlay 开关勾选可正常读取 `checked` 并触发 `cesium-overlay-toggle`；
  5. IDE Problems 面板中该文件无新增 TS2339。

## 变更文件清单
- `frontend/src/domains/ol/layer/components/LayerControlPanel.ts`：补 catalog 成员 TS 声明，消除 `as any`
- `frontend/src/domains/ol/layer/components/LayerControlPanel.vue`：修正 `:color` 字符串与 `$event.target.checked` 类型
- `README.md`：版本号 V3.6.47→V3.6.48 三处同步
- `Docs/Guide/CHANGELOG.md`：追加 V3.6.48 条目

## 遗留与风险
- 无。工作树中存在前会话遗留的 `ControlsPanel.ts` 新增（已暂存）与 `frontend-structure.md` 修改，与本次任务无关，未由本次改动；CheckStructureTree 当前 649/649 全绿。