# 2026-04-20 顺序加载修复（登录页 GIS 延迟加载）

## 日期和时间
2026-04-20 10:40

## 修改内容
1. 将 `MapContainer.vue` 中 OpenLayers 相关顶层静态导入替换为运行时延迟依赖入口，新增 `mapRuntimeDeps.js` 统一承接 OL 运行时模块。
2. 新增 GIS 预热链路：`deferredGisAssets.js`（预热编排）与 `deferredGisWarmupLauncher.js`（二段式触发器）。
3. 登录页 `RegisterView.vue` 增加 3000ms 延迟预热逻辑，仅在仍处于注册页时触发 GIS 预热，且在组件卸载时清理定时器。
4. 路由层新增 `lazyHomeViewLoader.js`，并在 `router/index.js` 中改为二段式 Home 懒加载，避免入口模块图提前绑定 Home 的重依赖。
5. 移除 `main.js` 中 OpenLayers CSS 顶层引入，避免登录首屏阶段触发 OL 相关资源请求。
6. 在 `vite.config.js` 中关闭 `modulePreload` 重写，并将 `vite/preload-helper` 单独归入 `vendor-runtime`，避免动态导入运行时辅助代码把 GIS vendor chunk 牵入入口依赖。
7. 生产构建验证：`dist/index.html` 仅保留入口脚本与样式；`dist/assets/index-*.js` 入口静态导入为 `vendor-vue`、`vendor-axios`、`vendor-runtime`，未出现 `vendor-ol-all` 或 `vendor-geotiff` 的入口静态导入。
8. 同步更新项目根目录、前端、后端三个 README 的目录结构树与注释。

## 修改原因
1. 修复登录页首屏阶段被 GIS 重依赖（OpenLayers/GeoTIFF）抢占带宽的问题，确保登录页先可用、地图资源后加载。
2. 满足“登录页就绪后 3 秒再触发 GIS 预热”的顺序加载目标，降低首屏网络压力和阻塞风险。
3. 通过二段式懒加载与运行时依赖隔离，避免打包器在入口模块中提前串联 GIS 重资源。

## 影响范围
1. 登录/注册页面首屏加载链路与网络请求时序。
2. Home 路由懒加载策略（改为二段式加载）。
3. GIS 运行时依赖初始化方式（由顶层静态导入改为延迟解析）。
4. Vite 产物入口依赖图与动态导入运行时分包行为。
5. 文档层：README 结构树与维护日志记录。

## 修改的文件路径（绝对路径）
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MapContainer.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\RegisterView.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\HomeView.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\router\index.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\router\lazyHomeViewLoader.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\gis\mapRuntimeDeps.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\gis\deferredGisAssets.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\gis\deferredGisWarmupLauncher.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\main.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\vite.config.js
- d:\Dev\GitHub\WebGIS_Dev\README.md
- d:\Dev\GitHub\WebGIS_Dev\frontend\README.md
- d:\Dev\GitHub\WebGIS_Dev\backend\README.md
- d:\Dev\GitHub\WebGIS_Dev\Docs\2026-04-20-sequential-load-fix.md
