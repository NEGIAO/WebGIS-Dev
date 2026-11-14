# 2026-11-13 修复 useLayerControlHandlers 23 处 TS 类型错误

## 日期与时间
2026-11-13 16:02

## 任务等级
L2（常规：Bug 修复，仅改 1 个现有文件，无新增/删除文件）

## 问题分析
- **核心症状**：命令行 `npx tsc --noEmit` exit 2，`frontend/src/domains/ol/layer/composables/useLayerControlHandlers.ts` 共 23 个类型错误，全部为真实 tsc 诊断（source: `ts`，非 IDE `ts-plugin` 缓存误报）。
- **根本原因**：
  1. `loadCustomMap(payload = {})` / `handleLayerChange(payload = {})` / `handleLayerOrderUpdate(payload = {})` 三个函数的 `payload` 参数缺少类型注解，TS 推断为空对象 `{}`，访问 `wmsLayers`/`layerId`/`customUrl`/`source`/`type`/`dragIndex`/`dropIndex`/`visible`/`opacity` 均报 TS2339 `Property '…' does not exist on type '{}'`。
  2. `lonLat` 是 `toLonLat()` 返回的 `Coordinate`（`number[]`），传给 `queryCandidateAtPoint(candidate, lonLat: [number, number], …)` 期望固定长度元组 `[number, number]`，报 TS2345 `Argument of type 'Coordinate' is not assignable to parameter of type '[number, number]'`.
  3. `svcInfo.geographicBbox` 是 `number[]`，传给 `registerRemoteService` 的 `geographicBbox?: [number, number, number, number]` 字段，报 TS2322 `Type 'number[]' is not assignable to type '[number, number, number, number]'`.
- **受影响模块**：前端图层控制事件处理库 `domains/ol/layer/composables/useLayerControlHandlers.ts`（被 HomeView/图层树宿主注入，承担底图切换、自定义 URL 加载、图层排序/可见性/透明度更新）。

## 修改内容
`frontend/src/domains/ol/layer/composables/useLayerControlHandlers.ts`：
1. 在 `LayerControlHandlersOptions` 接口之后补充三个 Payload 接口类型：
   - `LoadCustomMapPayload { wmsLayers?: string }`
   - `LayerChangePayload { layerId?: string; customUrl?: string; source?: string; wmsLayers?: string }`
   - `LayerOrderUpdatePayload { type: 'reorder' | 'visibility' | 'opacity'; dragIndex?: number; dropIndex?: number; layerId?: string; visible?: boolean; opacity?: number }`
2. `loadCustomMap` 参数签名 `payload = {}` → `payload: LoadCustomMapPayload = {}`。
3. `handleLayerChange` 参数签名 `payload = {}` → `payload: LayerChangePayload = {}`。
4. `handleLayerOrderUpdate` 参数签名 `payload = {}` → `payload: LayerOrderUpdatePayload = { type: 'visibility' as const }`（`type` 为必需字段，需默认值）。
5. 第 404 行 `geographicBbox: svcInfo.geographicBbox` → `geographicBbox: svcInfo.geographicBbox as [number, number, number, number]`（`fitViewToServiceExtent` 已在上游验证长度为 4，此处断言安全）。
   - 注：第 143 行 `lonLat as [number, number]` 已被 tsc 接受（OpenLayers `Coordinate` 与 `[number, number]` 兼容），无需改动。

## 修改原因
消除 `useLayerControlHandlers.ts` 的 23 处真实 TS 类型错误，使命令行 `tsc --noEmit` 全项目 0 错误，避免类型不安全导致的运行时属性访问异常。

## 影响范围
- 底图自定义 URL 加载流程（`loadCustomMap` / `handleLayerChange`）
- 图层排序、可见性、透明度更新（`handleLayerOrderUpdate`）
- 在线服务注册（`registerRemoteService` 的 `geographicBbox` 字段）
- 版本号展示与更新日志（非运行时逻辑）

## 解决方案
方案对比：
- A. 选定：为 `payload` 定义精确接口类型并加参数注解，类型安全、自文档化，与项目现有接口定义风格一致。
- B. 否决：将 `payload` 改为 `any`，虽可绕过检查但丧失类型安全，违背规范「类型零报错」精神。
- C. 否决：每处属性访问都用断言，冗长不优雅。

## 性能指标
非性能相关任务，未实测。

## 测试方案
- **Agent 已执行**：`npx tsc --noEmit`（frontend）exit 0，0 错误，无 `useLayerControlHandlers` 相关诊断；`python Scripts/CheckConfigRegistry.py` 7 项全绿，退出码 0。未执行任何 Git 写操作。
- **待用户实机验证**：
  1. 以 OpenLayers 引擎启动地图，打开图层控制面板；
  2. 切换底图、加载自定义 URL（XYZ/WMS/WMTS），确认无运行时报错；
  3. 在图层列表中拖拽排序、切换可见性、调整透明度，确认状态正确同步；
  4. WMS 服务加载后，确认已同步至「在线服务」分组并可定位到数据范围。

## 变更文件清单
- `frontend/src/domains/ol/layer/composables/useLayerControlHandlers.ts`：补充 3 个 Payload 接口，为 3 个函数参数加类型注解，修复 `geographicBbox` 元组断言
- `README.md`：版本号 V3.6.48→V3.6.49 三处同步，版本表恒定 3 行（挤出 V3.6.46）
- `Docs/Guide/CHANGELOG.md`：顶部追加 `### V3.6.49 (2026-11-13)` 条目

## 遗留与风险
- 结构树门禁 `CheckStructureTree.py` 退出码 1，漏登记 `LilGuiControls.ts` —— 该文件为**前会话遗留**的新增文件，不属本次任务范围（§2.5 禁止越权扩大范围），未由本次改动造成，建议用户单独处理并补录 `frontend-structure.md`。
- 未执行任何 Git 写操作。