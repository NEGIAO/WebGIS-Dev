# 2026-11-13 修复 LayerControlPanel.vue 模板中 TS `as` 断言导致的运行时 SyntaxError

## 日期与时间
2026-11-13 16:16

## 任务等级
L2（常规：Bug 修复，改 2 个现有文件，无新增/删除文件）

## 问题分析
- **核心症状**：浏览器运行时报 `SyntaxError: Unexpected identifier 'as'`（LayerControlPanel.vue?t=…:406:123），导致 `vue-router` 初始化失败，页面无法正常加载。
- **根本原因**：之前对 `LayerControlPanel.vue` 第 190 做的 L1 修改，将 `$event.target.checked` 改为了 `($event.target as HTMLInputElement).checked`。TypeScript 的 `as` 类型断言语法在 Vue SFC 模板编译为 JavaScript 后是**非法的**，浏览器解析模板表达式时直接抛出语法错误。命令行 `tsc --noEmit` 不解析 SFC 模板表达式，因此显示全绿，IDE 也不报错，只有浏览器运行时才会暴露。
- **受影响模块**：前端图层控制面板（`domains/ol/layer/components/LayerControlPanel`），Cesium 模式下的 overlay 开关链路。

## 修改内容
1. `frontend/src/domains/ol/layer/components/LayerControlPanel.vue`
   - 第 190 行：`@change="emit('cesium-overlay-toggle', { overlayId: overlay.value, value: ($event.target as HTMLInputElement).checked })"` → `@change="onCesiumOverlayToggle($event, overlay.value)"`，移除模板中的 TS `as` 断言。
2. `frontend/src/domains/ol/layer/components/LayerControlPanel.ts`
   - 在 `selectHistoricalSnapshot` 方法之后、`//#endregion` 之前，新增 `onCesiumOverlayToggle(event: Event, overlayId: string)` 方法，在方法内做 `const target = event.target as HTMLInputElement` 类型断言，再调用 `this.emit('cesium-overlay-toggle', { overlayId, value: target.checked })`。
3. `README.md`：版本号 V3.6.50→V3.6.51（项目简介行、版本演进表首行、页脚）；版本表恒定 3 行（挤出 V3.6.48）；页脚「更早版本」口径改为 V3.6.47 及以前。
4. `Docs/Guide/CHANGELOG.md`：顶部追加 `### V3.6.51 (2026-11-13)` 完整条目。

## 修改原因
消除浏览器运行时语法错误，使 Cesium overlay 开关能正常工作，避免 vue-router 初始化失败。

## 影响范围
- Cesium 引擎模式下的 3D overlay 开关（国界线/注记/OSM Buildings 等）；
- 版本号展示与更新日志（非运行时逻辑）。

## 解决方案
方案对比：
- A. 选定：将类型断言移到 `.ts` 实例层的方法中，模板中仅调用方法。运行时无 `as` 语法，tsc 也能正确类型检查。
- B. 否决：在模板中继续使用 `as` 断言，运行时必报 SyntaxError。
- C. 否决：在模板中不做断言、直接用 `$event.target.checked`，tsc 会报 TS2339（EventTarget 无 checked）。

## 性能指标
非性能相关任务，未实测。

## 测试方案
- **Agent 已执行**：`npx tsc --noEmit`（frontend）exit 0，0 错误，无 LayerControlPanel 相关诊断；`python Scripts/CheckStructureTree.py` 656/656 全绿，退出码 0；`python Scripts/CheckConfigRegistry.py` 7 项全绿，退出码 0。未执行任何 Git 写操作。
- **待用户实机验证**：
  1. 以 Cesium 引擎启动地图，打开图层控制面板，切换到 Cesium 模式；
  2. 操作 overlay 开关（国界线/注记/OSM Buildings 等），确认 `cesium-overlay-toggle` 事件正常触发，无 `SyntaxError`；
  3. 确认页面能正常加载，vue-router 初始化成功。

## 变更文件清单
- `frontend/src/domains/ol/layer/components/LayerControlPanel.vue`：模板中移除 TS `as` 断言，改为调用实例层方法
- `frontend/src/domains/ol/layer/components/LayerControlPanel.ts`：新增 `onCesiumOverlayToggle` 方法，在方法内做类型断言
- `README.md`：版本号 V3.6.50→V3.6.51 三处同步
- `Docs/Guide/CHANGELOG.md`：追加 V3.6.51 条目

## 遗留与风险
- 版本号顺延：V3.6.50 已被并行会话（AdminControlPanel / SpatialAnalysisPanel 修复）占用，本次按 Force_command §5 顺延为 V3.6.51，并在 CHANGELOG 条目中说明顺延原因。
- 未执行任何 Git 写操作。