# 2026-06-09 12:54 - 天气图表响应式与风力仪表 UI 优化（V3.3.2）

## 修改内容
- 修复天气看板两个图表（气温趋势图、风力仪表盘）不能动态适配主页面、侧栏和移动端容器尺寸的问题。
- 优化风力仪表盘 ECharts UI：从指针仪表改为轻量进度环，采用上下 50% 分区，上半区仅显示仪表，下半区独立显示预报风级柱线图，减少中心数值、图例和柱状图区互相遮挡。
- 恢复气温趋势图最高/最低温度标注，白天与晚间两条曲线均显示标注。
- 预报风级纵轴改为按白天、夜间、平均风力返回值域动态计算，避免低风级数据被固定 0-8 级范围压扁。
- 优化城市解析查询链路：优先使用正地理编码返回的 adcode，只有缺失 adcode 时才逆地理编码兜底，并避免 store watcher 与手动加载重复触发天气请求。
- 使用 `ResizeObserver` + 防抖 + `requestAnimationFrame` 监听容器大小变化，动态触发图表 resize 与重新渲染。
- 图表容器从固定高度改为容器查询 + 响应式 grid，自适应宽屏并排和窄面板堆叠。
- 实况天气卡片使用 CSS 容器查询实现父组件尺寸自适应。
- 优化罗盘固定屏幕 HUD：新增小尺寸专用渲染参数，按 HUD 尺寸缩放刻度线、刻度数字、分层文字、天池半径和天心十字线，避免大尺寸主题压缩后塌陷折叠。
- 罗盘 HUD 浮层增加稳定圆形容器、响应式边距、阴影和 SVG overflow 保护，控制面板 HUD 尺寸滑杆与 store 实际限制对齐。
- 修复第三方瓦片图源 CORS：瓦片加载层改为直连优先，直连失败后再兜底请求既有 `/proxy/{URL}` 后端代理，避免 `maps-for-free.com` 等服务缺少 `Access-Control-Allow-Origin` 时完全无法显示。
- 按 `Docs/Force_command.md` 规范同步更新三个 README 文档和项目文件结构说明，版本标记为 V3.3.2。

## 修改原因
- 原有的 `.chart-canvas` 使用 `clamp(240px, 34vh, 340px)` 固定高度，不会随父组件变化
- 只监听 `window.resize` 事件，当侧边栏折叠、面板展开等布局变化时图表不会重新适配
- 风力仪表盘的指针、刻度标签、中心数值、图例和下方柱状图使用同一块垂直空间，窄面板中遮挡明显
- 预报风级纵坐标使用固定 8 级下限，1-2 级低风力数据在图表中对比不明显
- 城市解析按钮无条件执行正地理编码 + 逆地理编码，并在 `setAdcode` 后再次手动加载天气，存在重复请求风险
- 实况卡片使用固定 `min-width: 260px`，窄屏下布局溢出
- 媒体查询只响应视口宽度，不响应父容器实际宽度
- 罗盘 HUD 固定屏幕模式直接沿用 800/1000px 主题参数，280px 左右的 HUD 会被过长刻度线、过大字号和中心盘挤压，出现塌陷、折叠和文字遮挡
- HUD 尺寸滑杆显示 300-1200px，但 store 实际限制为 180-520px，用户调整反馈与实际渲染不一致
- 当前瓦片加载层使用 `fetch(..., mode: 'cors')` 以支持 AbortController 中断请求；当第三方瓦片服务不返回 CORS 头时，浏览器会拒绝响应，导致图源无法显示
- 项目已有 `/proxy/{URL}` 后端代理能力，适合作为第三方瓦片跨域失败后的兜底，不需要为每个图源单独写代理
- 用户反馈图表在主页面宽度变化时显示异常

## 影响范围
- 天气看板主面板：`WeatherChartPanel.vue`
- 图表 Composable：`useWeatherCharts.js`
- 实况天气卡片：`WeatherLiveCards.vue`
- 项目文档：根目录 `README.md`、`frontend/README.md`、`backend/README.md`

## 优化解决方案

### 问题分析
1. **核心症状**：
   - 两个天气图表不能跟随右侧侧栏宽度和移动端底部面板高度变化。
   - 风力仪表盘在窄容器中出现图例、仪表刻度、数值和柱状图区互相遮挡。
2. **根本原因**：
   - `.chart-canvas` 使用固定高度范围，ECharts 初始化和重绘时无法感知父容器真实变化。
   - 只监听 `window.resize`，未监听侧栏拖拽、折叠、面板切换和容器查询导致的局部布局变化。
   - 风力图未严格划分仪表和预报图空间，仪表、图例和柱状图区容易互相挤压。
3. **受影响模块**：
   - `WeatherChartPanel.vue` 图表区布局与容器查询样式。
   - `useWeatherCharts.js` ECharts 布局计算、风力仪表 option、resize 调度链路。
   - `WeatherLiveCards.vue` 实况卡片父容器适配。
   - `useCompassStore.ts` 罗盘 HUD 配置生成、字体和刻度缩放。
   - `MapContainer.vue` 固定屏幕 HUD 浮层样式。
   - `CompassControlPanel.vue` HUD 尺寸控制范围。
   - `tileLifecycle.ts` 瓦片加载、AbortController 请求中断与 CORS 代理改写。

### 解决方案
1. **图表组件（ECharts）**：
   - `.charts-layout` 改为响应式 grid，宽屏双列、窄面板单列，并使用 `clamp()` 与容器查询控制行高。
   - `.chart-canvas` 改为由父面板真实尺寸控制，避免固定高度导致的 ECharts 尺寸滞后。
   - 新增 `getChartBoxMetrics()` 统一读取图表 DOM 真实宽高。
   - 气温趋势图根据容器宽高动态计算 legend、grid、字号、标记点尺寸，并保留最高/最低标注。
   - 风力图根据容器宽高动态计算 legend、grid、仪表半径、柱宽和轴标签。
   - 风力图改为上下 50% 分区，上半区仅放轻量仪表并隐藏指针/刻度，下半区独立放预报柱线图和图例。
   - 预报风级纵轴改为读取白天、夜间、平均风力的实际最小/最大值，并保留 1 级缓冲区。
   - 城市解析查询改为正地理编码 adcode 优先，避免常规路径多打一次逆地理编码；去掉查询入口前置 `setAdcode`，由 `loadWeatherByAdcode()` 成功后统一同步 store。
   - 新增统一 `scheduleChartsResizeAndRender()`，通过防抖 + `requestAnimationFrame` 等待布局稳定后再重绘。

2. **实况卡片组件（纯 CSS）**：
   - 启用 CSS 容器查询 `container-type: inline-size`
   - 主卡片最小宽度从 260px 降为 180px
   - 降雨面板右侧最小宽度从 260px 降为 200px
   - 添加 `@container` 查询替代部分媒体查询

3. **主面板组件**：
   - 启用容器查询 `container-type: inline-size; container-name: weather-panel`
   - 将媒体查询改为容器查询（@container weather-panel）
   - 保留媒体查询作为视口级兜底
   - 窗口 resize 监听改为 `onMounted/onBeforeUnmount` 生命周期内绑定/解绑，避免条件渲染和热更新下残留监听

4. **罗盘 HUD 组件链路**：
   - 在 `useCompassStore.ts` 中新增 HUD 专用渲染配置生成逻辑，按 HUD 尺寸缩放主题中的刻度线高度、刻度数字字号、分层文字字号、天池半径和天心十字线宽度。
   - 对 24/60 分宫等高密度图层施加更小字号上限，减少文字互相压叠。
   - 将固定屏幕 HUD 默认尺寸提升到 340px，并统一限制为 240-560px，和控制面板滑杆保持一致。
   - 在 `MapContainer.vue` 中为 HUD 浮层增加圆形背景、响应式边距、drop shadow 和 `overflow: visible`，避免 SVG 视觉边缘被裁切。

5. **瓦片 CORS 代理链路**：
   - 在 `tileLifecycle.ts` 的统一 `fetchTileAsBlobUrl()` 入口中构造真实请求 URL。
   - 外部 HTTP(S) 瓦片先直接请求原始 URL；直连失败后再改写为 `{VITE_TILE_PROXY_BASE_URL}/proxy/{原始瓦片URL}`，复用项目既有后端代理。
   - 已经是后端代理域名、当前站点同源、`/proxy/` 或 `/tiles/` 的地址不再二次代理，避免重复套娃。
   - 新增 `VITE_TILE_PROXY_BASE_URL` 和 `VITE_TILE_PROXY_MODE` 环境变量说明，支持按环境指定代理根地址、强制代理或关闭自动代理。

### 实施步骤
1. 修改 `WeatherChartPanel.vue` 样式，启用容器查询，重构响应式断点
2. 修改 `useWeatherCharts.js`，添加 ResizeObserver 监听、容器尺寸读取、动态布局计算和风力仪表 UI 优化
3. 修改 `useWeatherData.js`，优化城市解析查询链路并去除重复天气请求触发
4. 修改 `WeatherLiveCards.vue`，启用容器查询
5. 修改 `useCompassStore.ts`，生成固定屏幕 HUD 小尺寸专用配置
6. 修改 `MapContainer.vue`，优化 HUD 固定浮层外壳和 SVG 显示保护
7. 修改 `CompassControlPanel.vue`，同步 HUD 尺寸滑杆范围
8. 修改 `tileLifecycle.ts`，外部瓦片直连失败后兜底请求既有 `/proxy/{URL}` 代理
9. 更新 `frontend/.env.example`，补充瓦片代理环境变量
10. 更新根目录、前端、后端三个 README 的文件结构树注释与 V3.3.2 版本记录
11. 补充本维护日志，记录问题链条、方案、测试和文件路径

## 性能指标
- ResizeObserver 使用 90ms 防抖，window resize 使用 120ms 防抖，避免连续拖拽/缩放时频繁重绘。
- `requestAnimationFrame` 延迟到布局稳定后再执行 `resize + setOption`，降低拿到过渡态尺寸的概率。
- 风力图通过上下 50% 分区降低 ECharts 元素重叠风险；预报风级纵轴按返回值域收缩，低风级数据对比更明显；城市解析常规路径减少 1 次逆地理编码请求，并避免重复天气请求触发；气温趋势图标注尺寸随容器宽度动态收缩。
- 罗盘 HUD 仅在 `hudRenderConfig` 计算阶段生成缩放后的轻量配置，不改变原始主题配置；默认 HUD 尺寸从 280px 提升到 340px，并将刻度预留空间控制在 10px 以内，减少小容器中的有效半径损失。
- 瓦片兜底代理只在直连失败后改变浏览器侧真实请求地址，不修改图源配置本身；保留原有 `fetch + AbortController` 中断能力，同时避免第三方 CORS 响应头缺失导致图源完全不可用。

## 测试方案
1. 执行 `npm run build`，验证 Vite 生产构建通过。
2. 打开天气看板，观察气温趋势图与风力图是否正常显示。
3. 调整右侧侧栏宽度，观察图表是否自动适配容器变化。
4. 折叠/展开侧边栏，观察图表是否自动 resize 并重新渲染。
5. 在移动端视图下检查风力仪表、图例、柱状图和轴标签是否无明显遮挡。
6. 使用城市名称解析查询，确认常规路径为正地理编码获取 adcode 后直接请求天气，不再无条件逆地理编码。
7. 切换罗盘显示模式到 `Mode 2: 设备 HUD（固定屏幕）`，检查 HUD 是否保持圆形、文字不大面积重叠、外层浮层不裁切 SVG。
8. 切换到 `maps-for-free.com` 相关图源，确认直连失败后浏览器会追加请求 `/proxy/https://maps-for-free.com/...` 并正常显示瓦片。

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Weather\WeatherChartPanel.vue` — 图表容器查询、响应式 grid、窗口 resize 生命周期绑定
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\weather\useWeatherCharts.js` — 容器尺寸读取、ResizeObserver 调度、趋势图动态布局、风力仪表 UI 优化
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\weather\useWeatherData.js` — 城市解析查询链路优化，减少不必要逆地理编码与重复天气请求
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Weather\WeatherLiveCards.vue` — 容器查询响应式
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\useCompassStore.ts` — 罗盘 HUD 小尺寸专用渲染配置、字体/刻度/天池/十字线缩放
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Map\MapContainer.vue` — 固定屏幕 HUD 浮层外观、响应式边距、SVG overflow 保护
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Compass\CompassControlPanel.vue` — HUD 尺寸滑杆范围与 store 限制同步
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\tileSource\tileLifecycle.ts` — 外部瓦片直连失败后兜底请求既有 `/proxy/{URL}` 代理，解决第三方 CORS 拦截
- `d:\Dev\GitHub\WebGIS_Dev\frontend\.env.example` — 瓦片代理环境变量示例
- `d:\Dev\GitHub\WebGIS_Dev\README.md` — V3.3.2 版本记录与根项目结构说明
- `d:\Dev\GitHub\WebGIS_Dev\frontend\README.md` — 前端目录结构与 V3.3.2 版本记录
- `d:\Dev\GitHub\WebGIS_Dev\backend\README.md` — 后端目录结构同步说明（本次无后端代码结构变更）
- `d:\Dev\GitHub\WebGIS_Dev\Docs\26-06\26-06-09\2026-06-09-weather-chart-responsive.md` — 本维护日志
