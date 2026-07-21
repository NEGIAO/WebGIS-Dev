# 2026-06-19 统一底图配置：OL 与 Cesium 共享预设 + URL `l` 参数双向绑定

**日期和时间**：2026-06-19 14:30

**修改内容**：
1. 新增引擎无关的图层源描述符 `sourceDescriptors.ts`，从 `LAYER_SOURCE_DEFINITIONS` 提取 URL 模板和服务类型元数据
2. 新增 Cesium ImageryProvider 工厂 `cesiumProviderFactory.ts`，支持描述符→UrlTemplateImageryProvider/WebMapServiceImageryProvider/WebMapTileServiceImageryProvider 映射
3. 重构 `useCesiumLayers.js`，替换硬编码 3 个项目底图为统一 `BASEMAP_PRESETS`（~60 个预设），含 `createImageryProvidersFromPreset()` 栈式叠加
4. 新增 `useCesiumBasemapSwitcher.js`，移植 OL 侧熔断/降级逻辑（5s 超时 + 3 次熔断阈值）
5. 修改 `LayerControlPanel.vue`，新增 `engine` prop（`'ol'`|`'cesium'`），Cesium 模式隐藏图层管理/经纬网，显示 3D overlay 开关
6. 修改 `CesiumContainer.vue`，集成 `LayerControlPanel`，处理底图切换和 overlay 事件
7. 扩展 `useCesiumUrlTracking.js`，新增 `l` 参数读写，确保 Cesium 模式下 URL 底图参数与 OL 一致
8. 统一 localStorage key：`webgis_custom_basemap_url`（兼容旧 `cesium_custom_xyz_basemap_url`）
9. 更新 `constants/basemap/index.ts` barrel export

**修改原因**：
- Cesium 侧仅 3 个硬编码底图选项，无法加载 OL 侧 ~60 个预设底图
- 两个引擎底图完全独立，用户 2D 选择的底图切换到 3D 后丢失
- URL `l` 参数在 Cesium 模式下不生效，分享链接底图信息在 3D 失效

**影响范围**：
- 底图配置系统（`constants/basemap/`）
- Cesium 图层管理（`useCesiumLayers.js`）
- URL 参数系统（`useCesiumUrlTracking.js`）
- LayerControlPanel UI（`LayerControlPanel.vue`）
- CesiumContainer 容器（`CesiumContainer.vue`）
- OL 侧零改动

**优化解决方案**：
核心架构——引擎无关 Source Descriptor 层：
- `sourceDescriptors.ts` 提取引擎无关的 URL 模板、服务类型、上下文需求
- `cesiumProviderFactory.ts` 按 serviceType 创建对应 Cesium Provider
- 不支持图源（vector-tile/MFF 非标准）返回 null，栈中跳过
- 快速切换：AbortController 管理每个 descriptorId 的请求，切换时 abort 旧请求
- 熔断降级：超时 5s + 连续 3 次失败触发熔断，自动降级到默认预设
- URL `l` 双向绑定：`restoreBasemapFromUrl()` 读取→设置 `activeBasemap`，`syncCameraViewToUrl()` 写入 `l` 参数

**测试方案**：
1. OL 回归：切换任意预设，确认 2D 正常，URL `l` 参数正确
2. Cesium 预设切换：3D 模式通过 LayerControlPanel 切换 10+ 代表性预设
3. URL 连续性：2D→3D 切换确认底图一致，3D→2D 切换确认底图一致
4. 自定义 URL：3D 输入自定义 XYZ URL，确认加载
5. 熔断降级：输入无效 URL，确认超时后自动降级
6. 复合图层：含 stack 的预设确认多层叠加正确

**修改的文件路径**：
- `frontend/src/constants/basemap/sourceDescriptors.ts`（新建）
- `frontend/src/constants/basemap/cesiumProviderFactory.ts`（新建）
- `frontend/src/components/Cesium/composables/useCesiumBasemapSwitcher.js`（新建）
- `frontend/src/constants/basemap/index.ts`（修改，增加导出）
- `frontend/src/components/Cesium/composables/useCesiumLayers.js`（重大重构）
- `frontend/src/components/Cesium/composables/useCesiumUrlTracking.js`（修改，增加 l 参数）
- `frontend/src/components/Cesium/CesiumContainer.vue`（修改，集成 LayerControlPanel）
- `frontend/src/components/Layer/LayerControlPanel.vue`（修改，增加 engine prop）
