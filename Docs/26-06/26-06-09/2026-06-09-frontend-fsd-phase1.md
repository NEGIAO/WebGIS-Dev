# 前端 FSD 架构重构第一阶段

日期：2026-06-09 15:03 +08:00

## 修改内容

- 新增前端 FSD 渐进迁移计划文档：`Docs/Architecture/frontend-fsd-migration-plan.md`。
- 建立第一阶段 FSD 目录：
  - `frontend/src/app/`
  - `frontend/src/pages/`
  - `frontend/src/features/weather/`
  - `frontend/src/features/basemap/`
  - `frontend/src/shared/config/`
- 将应用启动层迁移到 `frontend/src/app/`：
  - `App.vue`
  - `main.js`
  - `router/index.js`
  - `router/lazyHomeViewLoader.js`
- 将页面入口迁移到 `frontend/src/pages/`：
  - `home/HomeView.vue`
  - `home/useDistrictLayer.ts`
  - `home/useLayerOperations.ts`
  - `home/useSidePanel.ts`
  - `register/RegisterView.vue`
  - `legal/TermsOfService.vue`
  - `legal/PrivacyPolicy.vue`
  - `not-found/NotFoundView.vue`
- 将天气模块收束到 `frontend/src/features/weather/`：
  - `ui/`
  - `model/`
  - `api/`
  - `composables/`
  - `lib/`
- 将底图配置和瓦片源工厂收束到 `frontend/src/features/basemap/`：
  - `config/`
  - `tile-source/`
- 新增 `frontend/src/shared/config/env.ts`，作为后续环境变量集中入口。
- 更新 `frontend/index.html`，入口从 `./src/main.js` 改为 `./src/app/main.js`。
- 为旧路径保留兼容出口，减少第一阶段迁移对现有调用方的冲击。
- 更新 `frontend/README.md`、根 `README.md`、`backend/README.md` 的结构同步说明。

## 修改原因

前端项目已经从早期横向技术分层进入中大型 WebGIS 复杂度阶段。`components/`、`composables/`、`utils/` 等目录承载了过多不同业务域的实现，尤其是地图、底图、图层、数据导入、天气等模块边界逐渐变模糊。

本次第一阶段重构的目标不是一次性完成全项目迁移，而是先建立 FSD 目录骨架，并迁移低风险、高收益、边界清晰的模块，为后续地图核心、图层 TOC、数据导入等高风险迁移提供稳定参照。

## 影响范围

- 前端应用入口：`frontend/index.html` 和 `frontend/src/app/main.js`。
- 前端路由：`frontend/src/app/router/`。
- 页面入口：`frontend/src/pages/`。
- 天气功能域：`frontend/src/features/weather/`。
- 底图与瓦片源功能域：`frontend/src/features/basemap/`。
- 兼容出口：
  - `frontend/src/views/*`
  - `frontend/src/router/*`
  - `frontend/src/components/Weather/*`
  - `frontend/src/composables/weather/*`
  - `frontend/src/composables/tileSource/*`
  - `frontend/src/constants/basemap/*`
  - `frontend/src/stores/useWeatherStore.ts`
  - `frontend/src/utils/weather/weatherUtils.js`
  - `frontend/src/api/weather.js`

后端代码结构无变更。

## 优化解决方案

### 1. 建立 FSD 骨架

新增 `app/`、`pages/`、`features/`、`shared/`，让后续新代码可以按业务能力组织，而不是继续堆入横向目录。

### 2. 先迁移低风险模块

优先迁移：

- `weather`：边界清晰，文件数量适中，和地图核心低耦合。
- `basemap/tile-source`：瓦片源工厂本质上是底图领域模块，不适合继续放在根级 `composables/`。
- `app/pages`：应用入口和页面入口职责清晰，适合先迁移。

暂不迁移：

- `MapContainer.vue`
- `TOCPanel.vue`
- `useLayerDataImport.js`
- `ChatPanelContent.vue`

这些文件属于高风险核心链路，后续应单独迁移、单独验证。

### 3. 保留兼容出口

旧路径通过 re-export 或薄包装组件转发到新目录，确保现有调用不需要一次性全部改完。

后续新代码应优先使用：

```ts
import { useWeatherStore } from '@/features/weather';
import { createAutoTileSourceFromUrl } from '@/features/basemap';
```

旧路径仅作为过渡兼容，不应继续扩展业务实现。

## 测试方案

已执行：

```bash
cd frontend
npm run build
```

结果：构建通过。

构建输出中仍存在既有 chunk 体积警告，以及 `min-enhanced.js` 非 module script 无法被打包的既有提示；本次迁移未引入新的构建失败。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS_Dev\Docs\Architecture\frontend-fsd-migration-plan.md`
- `D:\Dev\GitHub\WebGIS_Dev\Docs\26-06\26-06-09\2026-06-09-frontend-fsd-phase1.md`
- `D:\Dev\GitHub\WebGIS_Dev\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\backend\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\index.html`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\app\App.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\app\main.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\app\router\index.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\app\router\lazyHomeViewLoader.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\pages\home\HomeView.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\pages\home\index.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\pages\home\useDistrictLayer.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\pages\home\useLayerOperations.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\pages\home\useSidePanel.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\pages\register\RegisterView.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\pages\legal\TermsOfService.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\pages\legal\PrivacyPolicy.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\pages\not-found\NotFoundView.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\weather\index.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\weather\ui\WeatherChartPanel.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\weather\ui\WeatherLiveCards.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\weather\ui\WeatherForecastTable.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\weather\model\useWeatherStore.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\weather\api\weather.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\weather\composables\useWeatherData.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\weather\composables\useWeatherCharts.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\weather\lib\weatherUtils.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\basemap\index.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\basemap\config\index.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\basemap\config\basemapConfig.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\basemap\config\basemapResolver.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\basemap\config\tileSourceAdapters.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\basemap\tile-source\index.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\basemap\tile-source\tileLifecycle.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\basemap\tile-source\types.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\basemap\tile-source\urlUtils.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\basemap\tile-source\wmsSource.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\basemap\tile-source\wmtsSource.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\features\basemap\tile-source\xyzSource.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\shared\config\env.ts`
- 旧路径兼容出口：`frontend/src/router/*`、`frontend/src/views/*`、`frontend/src/components/Weather/*`、`frontend/src/composables/weather/*`、`frontend/src/composables/tileSource/*`、`frontend/src/constants/basemap/*`、`frontend/src/stores/useWeatherStore.ts`、`frontend/src/utils/weather/weatherUtils.js`、`frontend/src/api/weather.js`

## 后续建议

下一阶段建议迁移 `features/layers` 或 `features/map`，但不要同时迁移两者。若继续推进，推荐先处理 `features/layers` 的 TOC 边界，或先把 `MapContainer.vue` 的外围依赖迁入 `features/map`，每次迁移都应保持 `npm run build` 通过。
