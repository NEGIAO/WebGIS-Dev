# 修复 2D 测量结果不落库导致 Agent 只能读 3D（L2）

## 日期与时间

2026-11-23 18:40

## 任务等级

**L2（常规）** —— Bug 修复，新增 1 个 store 文件，改动 4 个既有文件。

## 问题分析

### 核心症状

用户指出 `get_measure_result`（工具编号 11）「只支持 3D 视图」，而 2D 也能测量距离/面积。2D 量完问「刚才多少」得不到回答。

### 根本原因

`useDrawMeasure.activateInteraction()` 的测量分支里，读数只写进 tooltip DOM：

```ts
drawInteraction.on('drawstart', (evt) => {
    sketchFeature.getGeometry().on('change', (e) => {
        output = formatArea(geom) / formatLength(geom);
        measureTooltipEl.innerHTML = output;   // ← 只进 DOM
    });
});
drawInteraction.on('drawend', () => {
    measureTooltipEl.className = 'ol-tooltip ol-tooltip-static';
    sketchFeature = null;                      // ← 几何被丢弃
});
```

`drawend` 三件事（改 tooltip 样式、置空 sketchFeature、新建下一个 tooltip），**从未把测量值写入任何 store 或回调**。因此 Agent 侧无数据源，`get_measure_result` 只能读 Cesium 的 `useDrawMeasureStore.lastResult`。

对比 3D：`CesiumContainer` 的绘制管理器在成品时调用 `drawMeasureStore.setResult(...)`，所以 3D 可读。

### 受影响模块

前端「AI 对话」→ `get_measure_result` 工具；2D 测量链路（`useDrawMeasure`）。

## 解决方案

### 候选方案对比

| 方案 | 做法 | 评价 |
|---|---|---|
| A. 在 bridge 里读 tooltip DOM | 从 `.ol-tooltip-static` 的 innerHTML 反解数值 | ✗ 依赖 DOM 文本解析，脆弱；且骨架屏/多 tooltip 时不可靠 |
| B. 复用 3D 的 `useDrawMeasureStore` | 2D 也写这个 store | ✗ 破坏引擎分层（OL 依赖 Cesium 域） |
| C. **新建 2D 对称 store（选定）** | `useOlMeasureStore` + 在 `drawend` 落库 | ✅ 分层清晰、与 3D 语义对称、可扩展 |

### 关键取舍：数值口径与 tooltip 保持一致

落库时**不自作主张改用 `getLength(geom, { projection: 'EPSG:4326' })` 做大地测量**，而是沿用 tooltip 的 `getLength(geom)` / `getArea(geom)` 原始值 + 同一套 `formatDistanceMeasure` / `formatAreaMeasure`。

理由：若改口径，会出现「模型说 1.2 km、tooltip 显示 1.3 km」，用户会质疑哪个对。**一致性优先于理论精度**。若要修正测量算法，应作为独立任务同时改 tooltip 与 store。

## 修改内容

1. **新增** `frontend/src/domains/ol/stores/useOlMeasureStore.ts`
   - `OlMeasureResult`：`type`（MeasureDistance/MeasureArea）、`value`（米/平方米）、`text`（显示文本）、`coordinates`（WGS-84 顶点）、`createdAt`。
   - 只保留 `lastResult`（与 3D 语义对齐），提供 `setResult` / `reset`。
2. `frontend/src/domains/ol/drawing/composables/useDrawMeasure.ts`
   - 新增 `recordMeasureResult(geom, measureType)`：算值、转 WGS-84 坐标、写 store；异常只 `console.warn` 不打断绘制。
   - `drawend` 里**先落库再清空 `sketchFeature`**（否则几何已丢）。
   - `clearAllGraphics()` 里 `reset()` —— 图形清空后测量结果失效，避免 Agent 报出与画面不符的旧值。
3. `frontend/src/app/composables/useHomeEngineSwitch.ts`
   - `getMeasureResult()` 改为按引擎优先 + 跨引擎兜底：当前引擎最近一次 → 另一引擎最近一次；返回值带 `view` 标明来源。
   - 新增 `useOlMeasureStore` 实例（在 bridge 之前初始化，避免 TDZ）。
4. `frontend/src/domains/common/chat/constants/agentToolsSchema.ts`
   - 工具描述去掉「仅 3D 有效」；提示词第 11 条与选型规则同步为「2D/3D 均可」。
5. `frontend/src/domains/common/command-bus/GISCommander.ts`
   - deps 注释更新（原写「目前仅 3D 有落库的测量成品」）。
6. `Docs/Guide/frontend-structure.md`
   - `ol/stores` 下登记 `useOlMeasureStore.ts`。

## 修改原因

能力暴露不完整比不暴露更容易误导用户：工具声明里写「仅 3D 有效」，用户会以为是设计限制，实际是 2D 数据未落库的实现缺口。修复后 2D/3D 测量语义对称，Agent 回答「刚才量的多少」不再依赖引擎。

## 影响范围

| 模块 | 影响 |
|---|---|
| 2D 测量 | 新增一次 store 写入（`drawend` 一次），不影响 tooltip 与绘制行为 |
| 2D 清空 | `clearAllGraphics` 多一次 `reset()`，无副作用 |
| `get_measure_result` | 2D 可用；切引擎后仍能读到另一引擎的最近一次（带 `view` 标明） |
| 数值口径 | **不变**（与 tooltip 同源） |
| 包体积 | 新增 1 个极小的 pinia store（约 80 行） |

## 性能指标

未实测。写入只发生在 `drawend`（用户完成一次测量），单次对象分配，无循环开销；`coordinates` 为顶点数组，长折线（>1000 顶点）时体积随顶点数线性增长，当前无截断（测量折线顶点通常 < 50）。

## 测试方案

### Agent 已执行

- `npx vue-tsc --noEmit` —— 0 报错
- `npx eslint`（5 个变更文件）—— 0 warning
- 代码级复核：`drawend` 中 `recordMeasureResult` 位于 `sketchFeature = null` 之前；`toLonLat` 对非有限坐标已过滤

### 待用户实机验证

1. 2D 下用「测距」量一条线 → 问「刚才量了多长」→ 预期答出与 tooltip 一致的数值与单位。
2. 2D 下用「测面积」量一个面 → 问「刚才面积多少」→ 预期一致。
3. 切换到 3D 后立刻问「刚才量的面积」→ 预期仍能答出，且说明是 2D 的结果。
4. 3D 下量一次 → 问「刚才量的」→ 预期答出 3D 结果（含高程/方位角等字段）。
5. 2D 量完后点「清空全部图形」→ 问「刚才量的」→ 预期回「还没有测量结果」。
6. 未做任何测量时直接问 → 预期回「还没有测量结果，请先用测量工具量一次」。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/ol/stores/useOlMeasureStore.ts` | **新增**：2D 测量结果店 |
| `frontend/src/domains/ol/drawing/composables/useDrawMeasure.ts` | `drawend` 落库 + 清空时 reset |
| `frontend/src/app/composables/useHomeEngineSwitch.ts` | `getMeasureResult` 双引擎 + 跨引擎兜底 |
| `frontend/src/domains/common/chat/constants/agentToolsSchema.ts` | 工具描述与提示词去掉「仅 3D」 |
| `frontend/src/domains/common/command-bus/GISCommander.ts` | deps 注释更新 |
| `Docs/Guide/frontend-structure.md` | 结构树登记新 store |
| `README.md` / `Docs/Guide/CHANGELOG.md` | 版本号 V3.7.9 与条目 |

## 遗留与风险

1. **测量精度口径未修正**：`getLength(geom)` 未传 `{ projection: 'EPSG:4326' }`，按地图投影（EPSG:3857）计算，高纬度存在长度变形（约 cos(lat) 量级）。这是**既有问题**，本次为保持 tooltip 与 store 一致而未改。修正需同时改 tooltip 显示，建议单独立项并做数值对照。
2. **不保留历史**：只存最近一次，与 3D 语义一致；若用户需要多次测量对比，应从图层/图形属性读取（未实现）。
3. **坐标未裁剪**：`coordinates` 随顶点数线性增长，超长折线会推高工具结果体积；当前无上限，若后续出现异常长的测量需加截断。
4. **2D 测量的图形本体仍会进 TOC**（`createManagedVectorLayer` 在非 measure 分支；measure 分支不建层）—— 即测量结果不产生可复用图层，与 3D 一致。
