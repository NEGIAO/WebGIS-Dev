# 2026-10-31 移动端信息层级收敛（坐标/姿态按需展开 + 目录逐级展开）

## 日期与时间

2026-10-31 10:05

## 任务等级

L2 常规

## 问题分析

### 核心症状

1. OL 控制条在触屏（移动端）直接隐藏整个坐标区，用户无法查看/复制坐标，也没有恢复入口。
2. Cesium 右下角坐标 HUD 在移动端默认展开「位置 / 姿态 / 相机海拔」三组，占屏较大，与「最简化」诉求冲突。
3. 落地页移动菜单关闭钮使用 `×` 文本字形，iOS Safari 上视觉不居中（文本基线/字体度量与按钮盒不一致）。
4. 图层目录（TOC）在移动端默认沿用 store 的展开态，打开后一屏铺满，需要逐级点击查看。

### 根本原因

1. `MapControlsBar.vue` 的 `@media (pointer: coarse)` 内 `.coordinate-section { display: none }` 是「整体隐藏」而非「可折叠」，缺少展开态与触发入口。
2. `CesiumContainer.vue` 的坐标 HUD 是单一复制按钮，没有展开/收起状态；移动端媒体查询只做纵向排布。
3. 关闭钮内容为文本 `×`，不是 SVG；`display: grid + place-items: center` 居中的是行盒，字形墨迹盒与行盒存在基线偏移，iOS 字体度量差异会放大该偏移。
4. `layerTreeBuilder` / `cesiumLayerNodeBuilder` / `remoteServiceNodeBuilder` 均以 `expanded: expandedState[id] !== false` 生成节点，未区分触屏；`syncLayers` 还会显式把上传目录置为 `true`。

### 受影响模块

OL 控制条、Cesium 坐标 HUD、落地页移动菜单、TOC 图层目录（OL / Cesium 共用 `LayerPanel → TOCTreeItem`）、i18n 文案。

## 修改内容

1. **OL `MapControlsBar.vue`**
   - 新增 `isTouch` 判定与 `coordPanelOpen` 开关：桌面默认显示、触屏默认收起；根节点 `coord-open` 类驱动显隐。
   - 新增 `.coord-toggle-btn` 图标按钮（`Eye` / `EyeOff`，lucide），桌面 28×28px、触屏 40×40px，桌面与触屏均可切换。
   - 关闭态 `.map-controls-group:not(.coord-open) .coordinate-section { display: none }`（桌面与触屏通用）；展开后坐标、复制、格式入口可用，复制按钮在触屏展开时常显。
   - 触屏布局：隐藏时保持右侧竖列；展开时恢复桌面式横向一行（`.coord-open { flex-direction: row }`），窄屏坐标文本省略、分隔线改竖向。
   - 触屏格式菜单 `min-width: 0` + `width: min(280px, calc(100vw - 48px))`，避免窄屏横向溢出。
2. **Cesium `CesiumContainer.vue`**
   - 坐标 HUD 改为「圆角胶囊 + 圆形显隐开关」：开关与 OL 控制条同款（`Eye` / `EyeOff`，桌面 28×28px、触屏 40×40px）。
   - 新增 `hudVisible`（桌面默认 `true`、触屏默认 `false`）与 `hudToggleTitle`；桌面与触屏均可点击开关显隐。
   - 数据区独立为 `<button class="coordinate-copy-area">` 点击复制；容器 `border-radius: 9999px`。
   - 媒体查询 `max-width: 767px` → `pointer: coarse`。
   - **触屏信息收敛**：新增 `mobileCoordinateText`，只输出「经度, 纬度, 海拔」单行（如 `116.3974, 39.9093, 45m`），不再渲染三组标签；桌面端 `coordinate-display-groups` 三组完整信息保持不变。`coordinateCopyText` 同步按 `isTouch` 分支。
   - **视觉基线对齐 OL**：外壳改用与 `MapControlsBar` 相同的浅色玻璃（`rgba(255,255,255,0.92)` + `blur(12px)`）、`1px rgba(var(--brand-primary-rgb),0.22)` 描边、`var(--toc-shadow-md)` + 内高光；数据区改为内层品牌色胶囊（`height: 36px`、`rgba(var(--brand-primary-rgb),0.06)`、`border-radius: 9999px`）；数值字体统一为 `JetBrains Mono` 13px/600/`letter-spacing .03em`，组名 11px/700 品牌色；新增 `Copy` 图标（桌面悬停浮现、触屏常显）。
   - 触屏档：数据区高度 40px（规范 §3 可点击目标 ≥40px），紧凑文本单行 + 窄屏省略。
   - **控制项补齐（与 OL 逐项对齐）**：新增瓦片请求级别圆牌 `.zoom-level-display` 与主页按钮 `.home-btn`、竖发丝分隔线 `.divider`，控制条顺序与 OL 完全一致（显隐开关 → 坐标胶囊 → 级别 → 分隔线 → 主页）。
     - 级别取值：新增 `tileZoomLevel` + `displayTileZoom`，由 `cesiumHeightToOlZoom({ height, viewportHeight, fovY })`（`@common/utils/viewScale` canonical 逆变换）把相机离地高度反解为 OL zoom，取整规则与 `MapControlsBar.displayZoom` 一致（z<4 取 `round`、z≥4 取 `ceil`）；在既有 `scene.postRender` 监听内量化到 0.1 级后写回，避免逐帧触发渲染。
     - 主页按钮：`handleHomeClick` → `flyToHome(1.2)`（复用 `useCesiumSceneActions`，与既有快捷键同一入口）。
   - 触屏布局与 OL 同构：收起态为右侧竖列（开关/级别/分隔线/主页），展开坐标时 `coord-open` 切回横向一行，分隔线随之由横线转竖线。
3. **落地页 `LandingView.vue`**
   - 关闭钮 `×` 文本改为 lucide `X` SVG（`:size="18"`）。
   - 按钮 `padding: 0; font-size: 0; line-height: 0`，`svg { display: block; width/height: 18px }`；触屏档放大到 20px。
4. **TOC `TOCTreeItem.vue` / `LayerPanel.vue`**
   - 新增 `searchActive` prop；触屏下 `isExpanded` 由本地 `mobileExpanded`（默认 `false`）控制。
   - 点击文件夹行、行标题或箭头均可展开/收起；桌面端仍写回 store。
   - 搜索时沿用 `node.expanded`（`filterTree` 强制展开），保证命中项可见。
5. **i18n**
   - `mapControls.toggleCoord`、`cesium.expandCoordHud`、`cesium.collapseCoordHud`、`cesium.homeTip`（中英各一份）。

## 控制条结构对照（对齐结果）

```mermaid
flowchart LR
    subgraph OL["OL · MapControlsBar.vue"]
        O1[.coord-toggle-btn<br/>Eye / EyeOff] --> O2[.coordinate-section<br/>.coordinate-display 内层胶囊]
        O2 --> O3[.zoom-level-display<br/>displayZoom]
        O3 --> O4[.divider]
        O4 --> O5[.home-btn<br/>reset-view / locate-me]
    end
    subgraph CE["Cesium · CesiumContainer.vue"]
        C1[.coord-toggle-btn<br/>Eye / EyeOff] --> C2[.coordinate-section<br/>.coordinate-copy-area 内层胶囊]
        C2 --> C3[.zoom-level-display<br/>displayTileZoom]
        C3 --> C4[.divider]
        C4 --> C5[.home-btn<br/>flyToHome]
    end
    T["@common/utils/viewScale<br/>cesiumHeightToOlZoom"] -. 相机高度 → OL zoom .-> C3
    S["scene.postRender<br/>（既有逐帧监听）"] -. 量化 0.1 级 .-> C3
    OL -. 同款玻璃外壳 / 内层胶囊 / 等宽数值字体 .-> CE
```

## 修改原因

用户要求移动端默认「最简化」：坐标/姿态等信息默认收起，仅保留可点击入口；同时修复 iOS 关闭钮不居中；目录默认只显示一级以降低首屏信息密度。

## 影响范围

OL 控制条、Cesium 坐标控制条（含瓦片级别与主页按钮）、落地页移动菜单、TOC 图层目录（OL 与 Cesium 共用）。触屏（`pointer: coarse`）行为与桌面端 Cesium 控制条视觉均有变化，OL 桌面端布局保持原状。无后端、无配置 key、无数据源加载链路改动。

## 解决方案

方案对比：

- **A. 在 store 层把触屏默认展开态改为 `false`**：需同步 `layerTreeBuilder` / `cesiumLayerNodeBuilder` / `remoteServiceNodeBuilder` / `syncLayers`，影响面大，且搜索强制展开需额外处理。
- **B. 在 `TOCTreeItem` 渲染层引入触屏本地展开态 + `searchActive` 透传**：改动集中、桌面零影响、搜索兼容。

选定 **B**。实施顺序：补 i18n → OL → Cesium → 落地页 → TOC → Cesium 控制项补齐 → ESLint → 构建 → 门禁。

Cesium 瓦片级别取值方案对比：

- **A. 逐帧 `getCesiumGroundResolution(viewer)` 射线实测**：语义最准（含倾斜相机），但每帧一次射线拾取，`postRender` 内成本高。
- **B. `cesiumHeightToOlZoom({ height, viewportHeight, fovY })`**：走仓库既有 viewScale canonical 逆变换，与 OL↔Cesium 尺度换算同源，纯算术、零拾取。

选定 **B**；`postRender` 内量化到 0.1 级后写回，仅在整数量化值变化时才触发 Vue 更新。

## 性能指标

未实测（非性能任务）。设计上已规避新增逐帧开销：级别换算复用既有 `scene.postRender` 监听，且写入前量化去抖。

## 测试方案

### Agent 已执行

- `npx eslint` 改动文件（`CesiumContainer.vue` / `MapControlsBar.vue` / `TOCTreeItem.vue` / `LayerPanel.vue` / `LandingView.vue` / 两个 locale）：0 problems。
- `npx vite build --outDir .verify-build-1`：构建成功（`✓ built in 13.26s`），无编译/模板错误；验证目录已删除。**注**：默认 `npx vite build`（写入 `dist/`）在本机被 safe-delete 守卫拦截（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`，203 个文件），与代码无关。
- `python Scripts/CheckStructureTree.py`：521/521，漏登记 0，幽灵条目 0。
- `python Scripts/CheckConfigRegistry.py`：B1~B4、F1~F3 全通过，catalog 130 key。
- 未执行 `tsc --noEmit`（本次未新增 `.ts` 文件）。
- **未做浏览器截图验证**：本机无 Playwright/Chromium 可用，控制条的实际像素效果未目视确认。

### 待用户实机验证

1. iOS / Android 真机或 F12 设备模式（`pointer: coarse` 生效）打开 OL：控制条默认仅图标竖列；点眼睛图标展开为横向一行（坐标、复制、格式入口可用）；再点收起为竖列。
2. 桌面端 OL：控制条默认横向一行并显示坐标；点眼睛图标隐藏坐标、控制条收缩；再点恢复。
3. 桌面端 Cesium：右下角控制条应与 OL 外观一致（浅色玻璃胶囊 + 内层品牌色胶囊 + 等宽数值），依次为 开关 / 坐标三组 / 瓦片级别圆牌 / 竖分隔线 / 绿色渐变主页圆钮；点眼睛只收起坐标段，级别与主页仍在；点主页回到中国全境视角。
4. 触屏 Cesium：默认竖列（开关 / 级别 / 分隔线 / 主页）；点眼睛展开为横向一行，坐标只显示「经度, 纬度, 海拔」单行；再点收起。
5. Cesium 瓦片级别数值：在正俯视下与同一位置的 OL 缩放级别应基本一致（允许 1 级以内偏差，倾斜视角下按高度反解会偏大）。
6. 落地页移动菜单：关闭钮 `X` 在 iOS 居中。
7. TOC：打开默认仅一级；点文件夹行/箭头展开二级；搜索时命中项可见。

## 变更文件清单

- `frontend/src/domains/ol/components/MapControlsBar.vue` — OL 坐标显示开关（桌面/触屏）+ 触屏横向/竖列布局
- `frontend/src/domains/cesium/components/CesiumContainer.vue` — Cesium 控制条全面对齐 OL：玻璃胶囊 + 内层胶囊 + 显隐开关 + 瓦片级别 + 分隔线 + 主页；触屏坐标收敛为单行
- `frontend/src/app/LandingView.vue` — 关闭钮改 SVG 并修复 iOS 居中
- `frontend/src/domains/common/layer-tree/components/TOCTreeItem.vue` — 触屏逐级展开
- `frontend/src/domains/common/layer-tree/components/LayerPanel.vue` — 透传 `searchActive`
- `frontend/src/locales/zh-CN.js` — 新增 `mapControls.toggleCoord` / `cesium.expandCoordHud` / `cesium.collapseCoordHud` / `cesium.homeTip`
- `frontend/src/locales/en-US.js` — 同上英文键
- `README.md` — 版本号三处
- `Docs/Guide/CHANGELOG.md` — 追加 V3.6.34

## 遗留与风险

- TOC 触屏展开态为组件本地状态；`SidePanel` 按设计「首次加载后常驻」，因此关闭再打开不会重置为一级。如需每次打开重置，需要在面板可见性变化时下发重置信号。
- 未做 iOS 真机验证（沙箱无 WebKit），关闭钮居中为按 GitHub 式 SVG 设置的理论修复。
- 未做浏览器截图验证（本机无 Chromium），Cesium 控制条与 OL 的像素级一致性未经目视确认，需用户实机比对。
- **主页按钮语义差异**：OL 为「单击复位 / 双击定位」，Cesium 侧仅实现单击复位（`flyToHome`），故使用独立文案 `cesium.homeTip`（「回到默认视角」）而非复用 `mapControls.homeTip`，避免出现「双击无响应」的假承诺。若需双击定位，需在三维域补一套 `useUserLocation` 等价能力。
- **触屏横向展开的宽度压力**：固定控件（开关 40 + 级别 40 + 主页 42 + 分隔线 + 间距）约 163px，375px 宽机型上坐标文本仅剩约 150px，`116.3974, 39.9093, 45m`（23 字符 @12px）可能触发省略号；412px 及以上机型可完整显示。若要在窄屏完整显示，需考虑收起态与展开态改用两行或去掉复制图标。
- **瓦片级别精度**：`cesiumHeightToOlZoom` 按正俯视高度反解，倾斜视角下会高估级别（视野远端分辨率更粗）；如需严格对齐实际请求层级，应改用射线实测分辨率。
- OL 触屏格式菜单宽度使用 `min(280px, calc(100vw - 48px))`，极窄屏（<320px）下可能偏窄。
- Cesium 控制条触屏展开后「文本区点击复制」与桌面端一致，但收起/展开入口只有眼睛按钮（OL 同款），已在 `title` / `aria-label` 中标注。
