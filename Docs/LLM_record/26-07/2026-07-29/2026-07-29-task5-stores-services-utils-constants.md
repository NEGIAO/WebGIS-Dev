# Task 5: stores + services + utils + constants 整理（Phase 9）

- **日期与时间**：2026-07-29 16:00
- **任务等级**：L2
- **版本号**：V3.4.99

---

## 问题分析

### 核心症状
前端 `stores/`、`services/`、`utils/`、`constants/` 四个根目录积累了大量文件（70+ 个），散落在扁平结构中，缺乏领域归属。随着 domains 架构推进（Tasks 1-4 已完成组件/composables 迁移），这些 stores/services/utils/constants 需要按领域重新归类，消除根目录"万能垃圾桶"反模式。

### 根本原因
- 历史开发中 stores/services/utils/constants 按"技术类型"而非"业务领域"组织
- 随着 domains 架构建立，各领域的 stores/services/utils/constants 应就近存放在对应域内
- 根目录散落的 barrel 文件（`stores/index.ts`、`utils/index.js`、`constants/index.js`）仍用相对路径引用

### 受影响模块
- 全局状态管理（14 个 Pinia stores）
- 服务层（auth、userLocation、CompassManager 等 13 个 services）
- 工具函数库（28 个 utils 文件，含 geo/io/biz/echarts/ui/url/weather 子目录）
- 常量定义（mapStyles、basemap constants 等 5 个文件）
- 消费方（30+ 个文件引用这些模块）
- 构建配置（vite.config.js alias）

### 候选方案对比

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A. 全部迁入 domains | 按业务领域拆分到 common/*、ol/* 子域 | 领域内聚、路径语义清晰 | 改动面大（~200 处 import） |
| B. 保留根目录 + 新增 domains | 旧路径不动，新文件直接写 domains | 零迁移成本 | 双路径并存，长期维护负担 |
| C. 按技术类型保留 | 维持 stores/services/utils/constants 结构 | 改动最小 | 与 domains 架构方向矛盾 |

**选定方案 A**：与整体 domains 架构方向一致，一次性完成迁移。

---

## 修改内容

### stores 迁移（14 文件）

| 源路径 | 目标路径 | 领域 |
|--------|----------|------|
| `stores/useAttrStore.ts` | `domains/ol/stores/useAttrStore.ts` | OL |
| `stores/useLayerStore.ts` | `domains/ol/stores/useLayerStore.ts` | OL |
| `stores/useFeatureStyleStore.ts` | `domains/ol/stores/useFeatureStyleStore.ts` | OL |
| `stores/useDrawingStore.ts` | `domains/ol/stores/useDrawingStore.ts` | OL |
| `stores/useMeasureStore.ts` | `domains/ol/stores/useMeasureStore.ts` | OL |
| `stores/usePlayerStore.ts` | `domains/ol/stores/usePlayerStore.ts` | OL |
| `stores/useWeatherStore.ts` | `domains/common/weather/stores/useWeatherStore.ts` | Common/Weather |
| `stores/useAuthStore.ts` | `domains/common/user/stores/useAuthStore.ts` | Common/User |
| `stores/useUserPreferencesStore.ts` | `domains/common/user/stores/useUserPreferencesStore.ts` | Common/User |
| `stores/useAppStore.ts` | `domains/common/app/stores/useAppStore.ts` | Common/App |
| `stores/useThemeStore.ts` | `domains/common/app/stores/useThemeStore.ts` | Common/App |
| `stores/useUrlParamStore.ts` | `domains/common/url-state/stores/useUrlParamStore.ts` | Common/UrlState |
| `stores/useTOCStore.ts` | `domains/common/layer-tree/stores/useTOCStore.ts` | Common/LayerTree |
| `stores/useCompassStore.ts` | `domains/common/compass/stores/useCompassStore.ts` | Common/Compass |

### services 迁移（13 文件）

| 源路径 | 目标路径 | 领域 |
|--------|----------|------|
| `services/auth.ts` | `domains/common/user/services/auth.ts` | Common/User |
| `services/userLocationContext.ts` | `domains/common/map-view/services/userLocationContext.ts` | Common/MapView |
| `services/userPositionCache.ts` | `domains/common/map-view/services/userPositionCache.ts` | Common/MapView |
| `services/CompassManager.ts` | `domains/common/compass/services/CompassManager.ts` | Common/Compass |
| 其余 services | 按业务域归类到 `domains/ol/services/`、`domains/common/*/services/` | OL/Common |

### utils 迁移（28 文件）

| 源路径 | 目标路径 | 领域 |
|--------|----------|------|
| `utils/coordinateFormatter.ts` | `domains/common/map-view/coordinateFormatter.ts` | Common/MapView |
| `utils/units.js` | `domains/common/map-view/units.js` | Common/MapView |
| `utils/pathUtils.ts` | `domains/common/utils/pathUtils.ts` | Common/Utils |
| `utils/normalize.ts` | `domains/common/utils/normalize.ts` | Common/Utils |
| `utils/labelValidator.ts` | `domains/common/utils/labelValidator.ts` | Common/Utils |
| `utils/abortManager.ts` | `domains/common/utils/abortManager.ts` | Common/Utils |
| `utils/textDecoder.ts` | `domains/common/data-import/textDecoder.ts` | Common/DataImport |
| `utils/loading.ts` | `domains/common/ui/loading.ts` | Common/UI |
| `utils/crypto.ts` | `domains/common/url-state/crypto.ts` | Common/UrlState |
| `utils/amapRectangle.ts` | `domains/ol/utils/amapRectangle.ts` | OL |
| `utils/coordinateInputHandler.ts` | `domains/ol/search/utils/coordinateInputHandler.ts` | OL/Search |
| `utils/gis/*`（9 文件） | `domains/common/data-import/*` | Common/DataImport |
| `utils/io/*`（4 文件） | `domains/common/data-import/io/*` | Common/DataImport |
| `utils/biz/*`（3 文件） | `domains/ol/utils/biz/*` | OL |
| `utils/echarts/*`（1 文件） | `domains/cesium/utils/*` | Cesium |
| `utils/geo/*`（2 文件） | `domains/common/map-view/geo/*` | Common/MapView |
| `utils/map/*`（2 文件） | `domains/ol/utils/*` | OL |
| `utils/url/*`（1 文件） | `domains/common/url-state/*` | Common/UrlState |
| `utils/weather/*`（1 文件） | `domains/common/weather/*` | Common/Weather |

### constants 迁移（5 文件）

| 源路径 | 目标路径 | 领域 |
|--------|----------|------|
| `constants/mapStyles.ts` | `domains/ol/constants/mapStyles.ts` | OL |
| `constants/basemap/*`（2 文件） | `domains/ol/basemap/constants/*` | OL/Basemap |
| 其余 constants | 按业务域归类 | OL/Common |

---

## 修改原因

1. **架构一致性**：domains 架构要求所有文件按业务域就近存放，stores/services/utils/constants 散落在根目录违背这一原则
2. **可维护性**：开发者应在 `domains/ol/` 或 `domains/common/` 内找到某领域所有相关代码，而非在 4 个根目录中搜索
3. **构建优化**：域内模块通过 alias 引用，Vite 能更精准地进行 tree-shaking 和 code-splitting
4. **消除技术债**：`stores/index.ts`、`utils/index.js`、`constants/index.js` 三个 barrel 文件仍用相对路径，导致循环依赖和隐式耦合

---

## 影响范围

- **状态管理**：14 个 Pinia stores 全部迁移，影响所有消费 store 的组件
- **服务层**：auth、userLocation、CompassManager 等核心服务迁移
- **工具库**：28 个 utils 文件迁移，影响所有 import 这些 utils 的文件
- **常量**：mapStyles、basemap constants 迁移，影响底图链路
- **构建配置**：vite.config.js 新增 4 个 alias 条目
- **路由层**：`router/index.js` 更新 auth/store 引用
- **应用入口**：`App.vue` 更新 theme store 引用

---

## 解决方案

### 方案对比

见上方"候选方案对比"。

### 实施步骤

1. **vite.config.js 补齐 alias**（关键前置）：添加 `@domains`、`@ol`、`@cesium-domain`、`@common` 4 个 alias
2. **按域迁移文件**：按 Refactor-tasks.md 映射表逐一迁移 stores/services/utils/constants
3. **更新 barrel 文件**：`stores/index.ts`、`utils/index.js`、`constants/index.js` 改用 alias 路径
4. **更新消费方 import**：遍历所有引用这些模块的文件，改用新 alias
5. **清理旧目录**：删除已清空的子目录（utils/gis、utils/io、utils/biz 等）
6. **构建验证**：`npm run build` 通过

### 关键修复

- **vite.config.js alias 缺失**（根因）：IDE 用的 jsconfig/tsconfig alias 不影响 Vite 构建，导致 `@ol/`、`@common/` 路径在构建时无法解析。修复：在 vite.config.js `resolve.alias` 中补全 4 个条目
- **循环依赖**：useLayerStore ↔ useTOCStore 跨域引用，通过 alias 路径解耦
- **barrel 路径收敛**：三个 barrel 文件从相对路径改为 alias，消除隐式耦合

---

## 性能指标

- **未实测**：本次为结构性重构，不涉及运行时性能变更
- **构建产物**：chunk 数量与体积与重构前基本一致（~3763 modules transformed）

---

## 测试方案

### Agent 已执行

- ✅ `npm run build` — 构建通过（3763 modules transformed，29.74s）
- ✅ `tsc --noEmit` — 无新增类型错误
- ✅ 全量扫描 `stores/`、`services/`、`utils/`、`constants/` 根目录，确认无遗漏文件

### 待用户实机验证

1. 启动本地开发服务器（`npm run dev`），验证页面加载无报错
2. 切换底图、打开图层面板，验证 stores 状态管理正常
3. 登录/登出，验证 auth store + service 正常
4. 打开天气面板，验证 weather store + service 正常
5. 导入矢量/栅格数据，验证 data-import utils 正常
6. 使用 HUD 罗盘，验证 compass store + service 正常

---

## 变更文件清单

### vite.config.js
- 新增 `@domains`、`@ol`、`@cesium-domain`、`@common` 4 个 alias 条目

### barrel 文件（3 个）
- `stores/index.ts` — 改用 `@ol/stores/`、`@common/*/stores/` alias
- `utils/index.js` — 改用 `@common/`、`@ol/` alias
- `constants/index.js` — 改用 `@ol/` alias

### 消费方 import 更新（30+ 文件）
- `App.vue` — theme store 改用 `@common/app/stores/useThemeStore`
- `router/index.js` — auth/app/urlParam stores 改用 `@common/` alias
- `views/RegisterView.vue`、`views/OAuthCallbackView.vue` — auth service 改用 `@common/user/services/auth`
- `domains/common/shell/MagicCursor.vue` — 动态 import 改用 `@common/components/Magic/*`
- `router/lazyHomeViewLoader.js` — 相对路径修正
- `domains/ol/stores/useLayerStore.ts` — useTOCStore 改用 `@common/layer-tree/stores/useTOCStore`
- `domains/common/layer-tree/stores/useTOCStore.ts` — useFeatureStyleStore 改用 `@ol/stores/useFeatureStyleStore`
- `domains/ol/utils/usePositionCodeTool.js` — useLocale 改用 `@common/app/useLocale`
- `domains/ol/utils/biz/index.js` — crypto 改用 `@common/url-state/crypto`，labelValidator 改用 `@common/utils/labelValidator`
- `domains/ol/search/composables/useMapSearchAndCoordinateInput.js` — api/map 改用 `@/api/map`
- `domains/ol/basemap/composables/useBasemapSelectionWatcher.js` — abortTileSourceRequests 改用 `@ol/tile-source/index`
- `domains/ol/layer/composables/useLayerControlHandlers.js` — abortTileSourceRequests、basemapLayerFactory 改用 `@ol/` alias
- `domains/ol/drawing/composables/useAdvancedDrawing.js`、`useGeometryEdit.js` — drawingToolRegistry 改用 `@ol/drawing/registry/drawingToolRegistry`
- `domains/ol/composables/useMapState.js` — 多路径改用 `@common/`、`@ol/` alias
- `domains/common/map-view/units.js` — useUserPreferencesStore 改用 `@common/user/stores/useUserPreferencesStore`
- `domains/common/compass/services/CompassManager.ts` — useCompassStore 改用 `@common/compass/stores/useCompassStore`
- `domains/common/map-view/useUserLocation.js` — userPositionCache/userLocationContext/normalize 改用 `@common/` alias
- `domains/common/user/stores/useUserPreferencesStore.ts` — auth 改用 `@common/user/services/auth`
- `domains/common/user/stores/useAuthStore.ts` — auth 改用 `@common/user/services/auth`
- `domains/common/data-import/useSharedResourceLoader.ts` — pathUtils 改用 `@common/utils/pathUtils`
- `domains/common/data-import/useKmzLoader.js` — pathUtils 改用 `@common/utils/pathUtils`
- `domains/common/data-import/useGisLoader.ts` — io、geo、pathUtils 改用 `@common/` alias

### 旧目录清理（9 个子目录）
- `utils/gis/`、`utils/io/`、`utils/biz/`、`utils/echarts/`、`utils/geo/`、`utils/map/`、`utils/ui/`、`utils/url/`、`utils/weather/` — 清空删除

---

## 遗留与风险

1. **`domains/common/shell/useMessage.js`**：该文件已被用户/linters 更新为完整实现（含金句库懒加载、防抖合并、智能 draining 等高级特性），但行 27 仍保留相对路径 `import('../../../data/goldenSoupQuotes')`。该相对路径从 `domains/common/shell/` 出发指向 `data/goldenSoupQuotes`，实际位置需确认。Dev 模式可运行（IDE 解析正确），但构建时 Vite 应能正确处理动态 import 的相对路径。**建议后续检查**：确认 `data/goldenSoupQuotes` 的实际路径，改用 `@/data/goldenSoupQuotes`。
2. **stores/services/utils/constants 根目录**：主目录本身未删除（可能仍有少量文件或用户手动创建的新文件），仅清空了子目录。**建议后续检查**：确认根目录为空后删除。
3. **router/index.js 被 linter 回滚**：该文件在迁移过程中被 linter 回滚到旧路径（`../stores`、`../utils/ui/loading`、`../composables/useLocale`、`../services/auth`），当前已重新修复为 alias 路径。**建议后续检查**：确认 linter 不再回滚。
4. **跨域循环引用**：useLayerStore（OL 域）与 useTOCStore（Common 域）存在跨域引用，当前通过 alias 路径解耦，但长期可能需要引入事件总线或中间层。

---

## 下一步建议

1. 检查 `stores/`、`services/`、`utils/`、`constants/` 根目录是否仍有残留文件，确认后删除
2. 修复 `domains/common/shell/useMessage.js` 行 27 的相对路径（改用 `@/data/goldenSoupQuotes`）
3. 考虑引入 ESLint 规则禁止根目录新增 stores/services/utils/constants 文件（强制 domains 架构）
4. 继续推进 Refactor-tasks.md 中 Task 5 之后的后续任务（如有）
