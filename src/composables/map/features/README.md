# Map Feature Libraries

该目录遵循“一个功能一个库”的约束，所有模块只承担单一地图能力。
`MapContainer.vue` 仅负责编排与事件桥接，不在组件中实现复杂业务细节。

## 当前模块

- `index.js`
  - 职责：feature 模块统一导出（barrel），供 `MapContainer.vue` 与后续调用方集中导入。
- `useRightDragZoom.js`
  - 职责：右键拖拽框选缩放的交互控制器创建与清理。
- `useLayerContextMenuActions.js`
  - 职责：图层右键菜单动作（提取 URL、复制 URL、查看 URL）处理。
- `useBasemapResilience.js`
  - 职责：底图切换验证、超时监测、异常兜底降级。
- `useManagedLayerStyle.js`
  - 职责：托管图层样式归一化、标签文本生成、样式构建与应用。
- `useRouteStepStyles.js`
  - 职责：公交/驾车路线步骤样式生成与缓存。
- `useRouteStepInteraction.js`
  - 职责：路线步骤激活状态、悬停预览状态与步骤缩放。
- `useManagedFeatureSerialization.js`
  - 职责：要素 ID 管理与 GeoJSON 序列化转换。
- `useStartupTaskScheduler.js`
  - 职责：首屏关键瓦片加载监控与非关键任务延后调度。
- `useBasemapUrlMapping.js`
  - 职责：底图索引与ID的互相转换、分类与分组信息查询。
- `useCoordinateSystemConversion.js`
  - 职责：WGS-84与GCJ-02之间的坐标转换与图层坐标系管理。
- `useMapSearchAndCoordinateInput.js`
  - 职责：地名搜索结果落图与手动坐标绘制。
- `useManagedFeatureHighlight.js`
  - 职责：要素高亮样式生成、高亮状态管理与清除。
- `useDrawMeasure.js`
  - 职责：绘制图形、测量距离/面积、提示覆盖物管理。
- `useRouteRendering.js`
  - 职责：公交与驾车路线的绘制、缩放、托管图层同步。
- `useLayerMetadataNormalization.js`
  - 职责：图层元数据规范化、坐标系统统一、缺失坐标智能推断。
- `useUserLayerApiFacade.js`
  - 职责：用户图层 API 委托门面、动态加载与缓存管理。
- `useBasemapStateManagement.js`
  - 职责：底图状态广播、Google 图层源刷新。
- `useManagedFeatureOperations.js`
  - 职责：托管图层要素查找与缩放操作。
- `useMapEventHandlers.js` ⭐ **Phase 17 - NEW**
  - 职责：统一处理所有地图事件（pointermove、singleclick、contextmenu、坐标同步等），消除事件处理代码分散问题。
  - 功能：坐标实时更新、属性查询、公交选点、右键菜单、提示管理。
- `useMapUIEventHandlers.js`
  - 职责：UI 事件转发与属性表范围同步（彩蛋、坐标跳转、复位、高亮联动）。
- `useCreateManagedVectorLayer.js`
  - 职责：托管矢量图层创建工厂（样式归一、要素序列化、注册、可选 fitView）。
- `useLayerControlHandlers.js`
  - 职责：图层面板事件处理（切换、排序、透明度、自定义底图 URL 识别与落图）。
- `useDeferredUserLayerApis.js`
  - 职责：用户图层延迟 API 门面（动态导入 useLayerDataImport/useUserLayerActions、动作代理）。
- `useBasemapSelectionWatcher.js`
  - 职责：底图切换监听与可用性校验，默认底图失败时自动兜底切换。
- `useBasemapLayerBootstrap.js`
  - 职责：底图层初始化与首屏监控挂载（创建 TileLayer、监控回调接入、图层实例映射）。

## 约束

1. 模块内只保留该功能最小闭包，不混入其他业务。
2. 对外通过明确的工厂函数/Hook 暴露能力。
3. 需要兼容旧入口时，在 `src/composables/` 下提供 re-export 包装文件。
4. 新增功能必须在此目录新增独立文件，并同步更新 README 文件树。
