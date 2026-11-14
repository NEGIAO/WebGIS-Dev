# 2026-11-14 P2 跨引擎 UI 解耦统一 Phase 1 原型实现（地图适配器契约与命令总线）

> **对应版本**：V3.7.1（原标注 V3.7.5，已并入统一版本 V3.7.1）  

> **任务等级**：L3 架构专项（Phase 1 原型与基础设施落地）  
> **责任人**：Antigravity Agent  
> **同一批次前置工作**：P0 全部 + P1 产物/网络搜身与 P2 架构蓝图（原标注 V3.7.4，并入 V3.7.1）

> 说明：本记录正文出现的 V3.7.x 均为合并前的中间标注，已统一并入 V3.7.1。

---

## 1. 任务背景与目标

在 V3.7.4 交付《P2 跨引擎 UI 解耦统一架构设计蓝图》并经用户明确确认正式立项后，本次推进 **Phase 1 原型实现（基础设施层就位）**。

核心目标：
1. **建立通用适配器契约层（@common/map-adapter）**：
   - 定义统一地图引擎类型 `EngineType`、能力矩阵 `EngineCapabilities` 与视点契约 `CameraViewOptions`；
   - 定义面向接口编程的统一接口 `IMapEngineAdapter`；
   - 建立统一命令总线 `MapCommandBus`（实现 UI 面板与底层引擎的完全解耦）；
   - 提供 Vue 3.5 响应式组合式函数 `useMapEngineAdapter` 与适配器运行时注册中心。
2. **落地具体引擎适配器（依赖倒置）**：
   - OpenLayers 适配器：`domains/ol/adapter/OpenLayersAdapter.ts` 实现 `IMapEngineAdapter`，对接 OL 2D 视图、平滑动画与图层控制；
   - Cesium 适配器：`domains/cesium/adapter/CesiumAdapter.ts` 实现 `IMapEngineAdapter`，对接 Cesium 3D 球体、相机飞行与高程换算；
   - 严格遵守 `CheckDomainDeps.py` 规则：`common -> ol: 0`、`common -> cesium: 0`，由低层模块向高层契约注入（DIP）。
3. **完成双引擎生命周期与活跃状态闭环挂接**：
   - `MapContainer.ts` 实例化并注册 `OpenLayersAdapter`（卸载时安全销毁注销）；
   - `CesiumContainer.ts` 实例化并注册 `CesiumAdapter`（卸载时安全销毁注销）；
   - `useHomeEngineSwitch.ts` 在 2D/3D 模式切换时自动同步更新全局活跃引擎状态 `setActiveEngineType('openlayers' | 'cesium')`。

---

## 2. 详细实现细节

### 2.1 契约层与总线设计（`domains/common/map-adapter/`）

- [`types.ts`](../../../frontend/src/domains/common/map-adapter/types.ts)：
  - `EngineType`: `'openlayers' | 'cesium'`；
  - `EngineCapabilities`: 静态声明各引擎固有能力（`supports3D`, `supportsTerrain`, `supportsViewshed`, `supportsShadows`, `supportsDrawing2D`, `supportsSwipe`），驱动 UI 动态开关特定控件；
  - `CameraViewOptions`: 统一相机跳转格式，中心点经纬度强制采用 EPSG:4326（WGS-84）；
  - `MapCommand<T>` 与 `MapEventListener`: 统一命令与事件类型。
- [`IMapEngineAdapter.ts`](../../../frontend/src/domains/common/map-adapter/IMapEngineAdapter.ts)：
  - 核心方法：`isReady()`, `flyTo()`, `getViewExtent()`, `setBasemap()`, `setLayerVisibility()`, `setLayerOpacity()`, `activateTool()`, `deactivateTool()`, `getActiveTool()`, `on()`, `off()`, `destroy()`。
- [`mapCommandBus.ts`](../../../frontend/src/domains/common/map-adapter/mapCommandBus.ts)：
  - 全局单例命令总线 `mapCommandBus`，支持 `dispatch`、`subscribe`、`on`、`off`、`clear`；UI 面板只需 dispatch 命令（如 `camera:flyTo` 或 `tool:activate`），底层激活的适配器自动接管。
- [`useMapEngineAdapter.ts`](../../../frontend/src/domains/common/map-adapter/useMapEngineAdapter.ts)：
  - 单例注册表 `registeredAdapters`；
  - 响应式活跃引擎追踪 `activeEngineType`；
  - 导出 `useMapEngineAdapter()`，向面板提供 `activeAdapter`、`capabilities`、`flyTo` 等便捷操作。

### 2.2 具体引擎实现（依赖倒置）

- [`OpenLayersAdapter.ts`](../../../frontend/src/domains/ol/adapter/OpenLayersAdapter.ts)：
  - 声明能力：`supports3D: false, supportsDrawing2D: true, supportsSwipe: true`；
  - 实现 `flyTo`: 通过 `fromLonLat` 转换为 EPSG:3857，调用 `view.animate` 执行平滑过渡；
  - 实现 `getViewExtent`: `view.calculateExtent` 反算为 4326 经纬度包围盒；
  - 自动订阅命令总线的 `camera:flyTo`、`tool:activate` 与 `tool:deactivate`。
- [`CesiumAdapter.ts`](../../../frontend/src/domains/cesium/adapter/CesiumAdapter.ts)：
  - 声明能力：`supports3D: true, supportsTerrain: true, supportsViewshed: true, supportsShadows: true, supportsDrawing2D: true, supportsSwipe: false`；
  - 实现 `flyTo`: 复用权威视标模块 `olZoomToCesiumHeight` 计算相机高度，调用 `camera.flyTo`；
  - 实现 `getViewExtent`: 调用 `camera.computeViewRectangle` 提取经纬度范围。

### 2.3 容器层挂接与状态联动

- [`MapContainer.ts`](../../../frontend/src/domains/ol/components/MapContainer.ts)：
  - 初始化完成后调用 `registerMapEngineAdapter(olAdapter)`；
  - `onUnmounted` 时调用 `unregisterMapEngineAdapter('openlayers')`。
- [`CesiumContainer.ts`](../../../frontend/src/domains/cesium/components/CesiumContainer.ts)：
  - Viewer 创建完成后调用 `registerMapEngineAdapter(cesiumAdapter)`；
  - `onUnmounted` 时调用 `unregisterMapEngineAdapter('cesium')`。
- [`useHomeEngineSwitch.ts`](../../../frontend/src/app/composables/useHomeEngineSwitch.ts)：
  - 切换至 3D 模式时触发 `setActiveEngineType('cesium')`；
  - 切回 2D 模式时触发 `setActiveEngineType('openlayers')`。

---

## 3. 门禁验证结果

1. **TypeScript 类型校验**：
   - 执行 `npm run typecheck`（`vue-tsc --noEmit`），**0 错误**。
2. **结构树漂移门禁**：
   - 执行 `python Scripts/CheckStructureTree.py`：文档条目 734 · 磁盘文件 734 · 漏登记 0 · 幽灵条目 0，**完全通过**。
3. **领域依赖隔离门禁**：
   - 执行 `python Scripts/CheckDomainDeps.py`：
     - `common -> ol: 0`
     - `common -> cesium: 0`
     - `cesium -> ol: 0`
     - `ol -> cesium: 0`
     - **0 违规，完全通过**。
4. **配置登记门禁**：`CheckConfigRegistry.py` 7 项检查全绿。
5. **Vue 范式门禁**：`CheckVueParadigm.py` 全部通过。
6. **代码行数治理**：全量新建与修改文件单文件行数均严格控制在 700 行红线以内（`OpenLayersAdapter.ts` 201 行、`CesiumAdapter.ts` 239 行、`MapContainer.ts` 646 行、`useHomeEngineSwitch.ts` 645 行）。
