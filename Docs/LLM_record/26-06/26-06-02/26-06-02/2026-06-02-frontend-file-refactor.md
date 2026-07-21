# 前端项目文件重构日志

**日期和时间**：2026-06-02 15:00

**修改内容**：
前端项目文件结构全面重构，包含 6 个阶段：清理死代码、消除重复工具函数、重组数据文件、超大组件拆分、Barrel 清理、README 同步。

**修改原因**：
项目经过 V2.x → V3.1.8 多轮迭代，积累了大量文件组织问题：
- vendored ol.js/ol.css (~1.5MB) 从未被引用，每次构建白白复制到 dist
- 路径处理函数在 6+ 个文件中重复实现
- 超大组件（2520/2479/1883/1644 行）难以维护
- 空目录、误放文件、命名错误等遗留问题
- Barrel re-export 混入不相关模块

**影响范围**：
- `utils/` — 新增 pathUtils.js、textDecoder.js，更新 6 个文件的导入
- `composables/` — 消除 normalizeBinaryFlag 重复，更新 useGisLoader/useKmzLoader/useSharedResourceLoader
- `components/` — FloatingAccountPanel、WeatherChartPanel 拆分
- `constants/` — 重组数据文件，重命名误导性文件
- `data/` — 新建目录，存放应用数据
- `public/` — 清理死代码（-1.5MB）
- `scripts/` — 接收误放的 Python 脚本

**优化解决方案**：

### Phase 1: 清理死代码（-1.5MB 构建产物）
- 删除 `public/ol.js` + `public/ol.css`（项目通过 npm `ol@^10.5.0` 引入，vendored 文件从未被引用）
- 移动 `public/images/images_to_webp.py` → `scripts/`（Python 脚本不应部署到生产）
- 重命名 `kmlStyleParser.doc.js` → `kmlStyleParser.doc.md`
- 删除空目录：`src/components/Widgets/`、`feng-shui-compass-svg/data/`、`src/gis/`
- 修复拼写：`dark_explantion.json` → `dark_explanation.json`

### Phase 2: 消除重复工具函数
- 新建 `src/utils/pathUtils.js`：统一 normalizePath、getExtension、getStem、getNameStem、getStemKey、getDir、splitDirAndFile、resolveRelativePath、getBaseStem、makeShpGroupKey
- 新建 `src/utils/textDecoder.js`：统一 decodeTextContent（多编码自动检测）和 decodeBufferSimple（UTF-8+GBK 快速版）
- 消除 normalizeBinaryFlag 重复：useMapState.js、useUserLocation.js 改为导入 utils/normalize.ts
- 更新 6 个文件改用共享模块

### Phase 3: 数据文件重组
- 移动 `constants/goldenSoupQuotes.js` → `src/data/goldenSoupQuotes.js`
- 重命名 `NON_STANDARD_XYZ_ADAPTER_EXAMPLES.ts` → `tileSourceAdapters.ts`

### Phase 4: 超大组件拆分
- FloatingAccountPanel.vue (2520 行 → 1463 行, -42%)：提取 OverviewTab.vue(492行)、SecurityTab.vue(289行)、PreferencesTab.vue(562行) ✅
- WeatherChartPanel.vue (1883 行 → 452 行)：提取 useWeatherData.js、useWeatherCharts.js、weatherUtils.js、WeatherLiveCards.vue、WeatherForecastTable.vue ✅

### Phase 5: Barrel 清理
- `utils/geo/index.js`：仅保留 CRS 相关模块，移除 amapAoiParser、driveXmlParser 等不相关 re-export
- `utils/biz/index.js`：仅保留纯工具函数，移除服务层 re-export

### Phase 6: 文档同步
- 更新 README 目录结构树
- 添加 V3.1.9 版本记录

**性能指标**：
- 构建产物减少 ~1.5MB（删除 vendored ol.js/ol.css）
- 路径工具代码从 6+ 份减少到 1 份共享模块
- FloatingAccountPanel 从 2520 行降至 1463 行（-42%），提取 3 个子组件（OverviewTab 492行、SecurityTab 289行、PreferencesTab 562行）✅
- WeatherChartPanel 从 1883 行降至 452 行（-76%），提取 2 个子组件 + 2 个 composable + 1 个工具模块 ✅
- 构建时间：~20s → ~26s（模块增多但代码更清晰）

**测试方案**：
1. `npm run build` — 构建通过，无编译错误 ✅
2. `npm run dev` — 开发服务器正常启动
3. 手动验证：图层管理、天气面板、用户中心、罗盘功能正常
4. 检查所有导入路径正确更新

**修改的文件路径**：

新建文件：
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\pathUtils.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\textDecoder.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\data\goldenSoupQuotes.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\weather\weatherUtils.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\weather\useWeatherData.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\weather\useWeatherCharts.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Weather\WeatherLiveCards.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Weather\WeatherForecastTable.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\UserCenter\tabs\OverviewTab.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\UserCenter\tabs\SecurityTab.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\UserCenter\tabs\PreferencesTab.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\useAccountPanelData.js`

修改文件：
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\gis\archiveProcessor.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\gis\batchProcessor.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\gis\decompressFile.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\useGisLoader.ts`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\useKmzLoader.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\useSharedResourceLoader.ts`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\dataImport\vectorUtils.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\useMapState.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\useUserLocation.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\useMessage.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\themeExplanationMapper.ts`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\geo\index.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\biz\index.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\index.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\api\map.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Weather\WeatherChartPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\UserCenter\FloatingAccountPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\README.md`

删除文件：
- `d:\Dev\GitHub\WebGIS_Dev\frontend\public\ol.js` (~1.5MB)
- `d:\Dev\GitHub\WebGIS_Dev\frontend\public\ol.css` (~6.8KB)

移动/重命名文件：
- `public/images/images_to_webp.py` → `scripts/images_to_webp.py`
- `constants/goldenSoupQuotes.js` → `data/goldenSoupQuotes.js`
- `constants/NON_STANDARD_XYZ_ADAPTER_EXAMPLES.ts` → `constants/tileSourceAdapters.ts`
- `utils/gis/parsers/kmlStyleParser.doc.js` → `utils/gis/parsers/kmlStyleParser.doc.md`
- `feng-shui-compass-svg/Explanation/dark_explantion.json` → `dark_explanation.json`

删除空目录：
- `src/components/Widgets/`
- `src/components/feng-shui-compass-svg/data/`
- `src/gis/`（整个目录树）
