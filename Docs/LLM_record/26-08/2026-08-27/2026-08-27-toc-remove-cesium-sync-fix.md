# 2026-08-27 — 修复 TOC 移除数据源后 Cesium 场景不同步移除（对象级宿主探测卸载）

> 归并于主版本 **V3.5.32**（2026-08-27）同一天更新记录。

## 基本信息

- **日期和时间**：2026-08-27 16:40
- **日志作者**：AI Agent（Cline）
- **变更类型**：Bug 修复（数据同步级 P1）+ 健壮性加固

## 事件逻辑链条分析

1. **核心症状**

   用户在 TOC「三维数据」分组中右键移除某个数据源（如 Ion 影像、Ion 地形等经
   「统一数据源管理」注册的条目），TOC 节点与记录正常消失，但 Cesium 场景中
   对应图层**仍然渲染**，且无任何报错提示。用户质疑：「标注咋没有同步的移除」
   「TOC 中都移除了这个数据源，它还是保留在 Cesium 中」。

2. **根本原因（确定性的链路断点）**

   - `useCesiumDataImport.js → registerExternalDataSource` 的 `type` 参数
     **缺省值为 `'3dtiles'`**；
   - `useCesiumLayers.js` 中 Ion 影像（`customIonImageryLayer`，实为
     `ImageryLayer`）与 Ion 地形（`customIonTerrainProvider`，实为
     `TerrainProvider`）注册时**未传 type**，被错记为 `'3dtiles'`；
   - TOC 移除链路：`TOCPanel → useTreeActionDispatcher → cesiumTocActions
     (remove-layer) → cesiumLayersStore.remove(id) → adapter.remove(id) →
     dataImport.removeDataSource(id)`；
   - `removeDataSource` 按 `record.type` 字符串分派：`'3dtiles'` 走
     `viewer.scene.primitives.remove(entity)` —— 对 ImageryLayer /
     TerrainProvider 是**静默 no-op**（对象不在 primitives 容器中，remove
     返回 false 且无异常）；
   - 随后 `loadedDataSources` 无条件删档 → CesiumContainer 的 watch 回声 →
     `syncFromImport` 删掉 TOC 记录。
   - ⇒ **元数据链全部成功，场景清理静默失败**：「TOC 已删档、Cesium 仍渲染」。

   事件链示意：

   ```
   TOC 右键移除 → cesiumStore.remove(id) → adapter.remove(id)
     → dataImport.removeDataSource(id)
         ├─ type='3dtiles'(错) → primitives.remove(ImageryLayer) → 静默 no-op ← 断点
         └─ loadedDataSources 删档 → watch → syncFromImport → TOC 节点消失 ✓
   ⇒ 场景残留 + TOC 消失 = 用户看到的不同步
   ```

3. **影响的模块**

   - `frontend/src/domains/cesium/composables/dataImport/useCesiumDataImport.js`（removeDataSource 类型分派单点脆弱）
   - `frontend/src/domains/cesium/composables/layers/useCesiumLayers.js`（Ion 影像/地形注册 type 缺省错配）
   - `frontend/src/domains/cesium/stores/cesiumLayers.ts`（透明度支持矩阵）
   - `frontend/src/domains/cesium/stores/cesiumLayerNodeBuilder.ts`（TOC 类型标签映射）
   - `frontend/src/domains/cesium/composables/dataImport/dataSourceDisplay.js`（透明度类型分派）

4. **优化解决方案**

   - **A（治本）新增对象级宿主探测卸载**：在 `loaders/utils.js` 新增
     `detachEntityFromScene({ viewer, Cesium, entity, type })`，以句柄在
     Cesium 各容器中的**真实挂载关系**（`viewer.entities.contains` /
     `viewer.dataSources.contains` / `viewer.imageryLayers.contains` /
     `viewer.scene.primitives.contains`，全部 `===` 引用比较、不受 Vue 代理
     与 type 元数据影响）分派卸载；TerrainProvider（非容器型对象）特判复位为
     `EllipsoidTerrainProvider`。`removeDataSource` 与 `clearAllDataSources`
     均改为探测优先、未命中才回退既有 type 分支（100% 向后兼容）。
   - **B（治标）**：`useCesiumLayers.js` 两处注册补准确类型：Ion 影像
     `type:'imagery'`、Ion 地形 `type:'terrain'`，从源头消除错配。
   - **C（配套元数据）**：
     - `cesiumLayerNodeBuilder.ts` TYPE_LABELS 增加 `imagery:'影像'`、
       `terrain:'地形'` 标签；
     - `cesiumLayers.ts` OPACITY_SUPPORTED_TYPES 增加 `'imagery'`
       （ImageryLayer.alpha 原生支持）；
     - `dataSourceDisplay.js` setRecordOpacity 增加 `case 'imagery'`
       （ImageryLayer.alpha 直写，防止落入矢量 per-entity 默认分支被误处理）。

5. **性能指标**

   - 无正收益数值，属于正确性修复：消除「TOC 删档成功 / 场景静默残留」的
     不同步缺陷；`contains` 探测为 O(1)~O(n) 内存比较，开销可忽略。

6. **测试方案**

   - 环境：本地 `npm run dev`，浏览器进入 3D（Cesium）地图。
   - 步骤：
     1. 3D 模式下通过覆层/数据面板加载「Ion 影像」「Ion 地形」，确认 TOC
        「三维数据」分组出现对应条目；
     2. TOC 右键该条目 → 移除；
     3. 预期：场景中影像/地形立即消失（地形复位为椭球面），TOC 节点同步消失，
        控制台无 `primitives.remove` no-op 警告；
     4. 回归：移除 GeoJSON / KML / GeoTIFF / 3D Tiles / GLTF / 绘制 / 路线 /
        逆地理编码标注点，均正常从场景消失。

## 第二轮排查记录（2026-08-27 用户复测反馈后）

> 第一轮修复部署至本地 dev 后，用户复测仍见「标注残留」。经确认残留物来源为**绘制/测量**类别，
> 由此展开第二轮全量生命周期审计（含右键菜单事件翻译层 commandDispatcher、统一 Action Router、
> 面状航线/路线漫游托管工作集同步桥、AI MapCommandBus），最终定位两个独立于第一轮的真因：

### 根因 A：cancelActive 未摘除 previewLabel（确认泄漏）

- `useCesiumDrawMeasure.js#beginInteraction` 中预览 Label 是 **独立** 的
  `viewer.entities.add({...})`（未推入 `active.sketch` 数组）；
- `finishInteraction / 撤销 / 切换类型` 均走 `cancelActive()`，而旧实现只销毁 handler +
  清理 sketch —— **previewLabel 从未被移除**；
- 该实体随后被 `updatePreviewText` 将 position 由 CallbackProperty 改写为静态 Cartesian3，
  成为既不在绘制句柄表、也不在 loadedDataSources、store 无档的「三无」孤儿：
  TOC 右键移除、「清空全部数据」、UndoLastDrawing 全部触达不了它。

```
begin: sketch(入表✓) + previewLabel(裸挂✗)
         │
finish/cancel ──► cancelActive(): 移除 sketch ✓ / previewLabel ✗ ← 泄漏点
                        │
previewLabel 永久滞留 viewer.entities（TOC 无法触达）⇒ 用户看到残留标注
```

### 根因 B：removeHandle 删除零校验（静默失败不可观测）

- 绘制与路线两管理器的 `removeHandle` 此前仅裸调 `viewer.entities.remove(e)` 并 try/catch 吞掉一切异常，
  即使实体未被移除也无任何信号，无法区分「分发未到达」与「删除失败」。

### 修复实施

1. `cancelActive()`：移除 `active.previewLabel` 并置 null（消除泄漏源）；
2. `useCesiumDrawMeasure.js#removeHandle`：改为「remove 返回值计数 + contains 回执判定」，
   幸存实体二次强制移除并 `console.warn('[drawMeasure] ...')` 输出受影响 id 与实体 id 列表；
3. `useCesiumRouteRendering.js#removeHandle`：同款回执强校验对齐；
4. 零实体清出但句柄非空时告警（暴露 viewer 失活 / 句柄失配等运行时异常）。

### 与第一轮的关系

第一轮修复的是「导入/Ion 注册类数据源的宿主容器卸载错配」（detached 探测 + type 纠偏）；
本轮覆盖「引擎内生成类（draw/route）的交互期孤儿实体与删除校验缺失」。两类叠加后，
统一图层管理的三类档案（loadedDataSources / draw registry / route handles）
在 TOC 单删与组头清空两条路径上均已实现场景侧强制一致。

## 修改的文件路径（两轮合计）

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\cesium\composables\dataImport\loaders\utils.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\cesium\composables\dataImport\useCesiumDataImport.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\cesium\composables\layers\useCesiumLayers.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\cesium\stores\cesiumLayerNodeBuilder.ts`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\cesium\stores\cesiumLayers.ts`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\cesium\composables\dataImport\dataSourceDisplay.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\cesium\composables\draw\useCesiumDrawMeasure.js`（第二轮）
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\cesium\composables\draw\useCesiumRouteRendering.js`（第二轮）
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md`、`Docs\Guide\frontend-structure.md`、根 `README.md`、本日志文件
