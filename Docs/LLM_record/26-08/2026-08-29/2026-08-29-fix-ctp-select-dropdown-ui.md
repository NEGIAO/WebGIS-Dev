# 2026-08-29 修复 Cesium 工具面板下拉列表白底白字（option 弹出层 UI 接线）

**日期和时间**：2026-08-29 09:30

## 修改内容

- `CesiumToolPanel.vue` 两个原生 `<select>`（`.wms-layer-select` WMS 图层选择器、`.remote-service-type-select` 远程 3D 服务类型）补充下拉弹出层 UI：
  - select 元素声明 `color-scheme: dark`，浏览器原生弹层（边框/阴影/滚动条/键盘高亮）按暗色渲染，与面板暗色身份一致；
  - 新增共用 `<option>` 样式块：默认暗色底 `var(--ctp-option-bg)` + 浅色字 `var(--ctp-text)`，hover 态深绿高亮 `rgba(var(--ctp-active-rgb), .92)`，checked 选中态 `--ctp-active-deep-rgb` + 薄荷强调字；
  - `.is-embedded` 嵌入亮色态显式回退：`color-scheme: light` + option 白底（`--ctp-white-solid`）深灰字（`--ctp-ink-neutral`），防止亮色面板下弹层突兀变暗。
- `LilGuiControls.vue`（**modules 模块卡片内嵌控件，本次问题主战场**）：lil-gui 动态注入的 `<select>`（`.lil-selector`）补齐同款弹出层 UI：
  - select 声明 `color-scheme: dark`；
  - `<option>` 默认暗底 `var(--ctp-option-bg)` + 浅字 `var(--ctp-text)`，hover/checked 复用「深绿选中族」令牌；
  - lil-gui 宿主为自绘暗色卡片（无亮色变体），故无需 `.is-embedded` 回退。该组件被 `CesiumToolPanel`（模块卡片 controls）、`CesiumAdvancedEffects`（Cinematic FX）、`FluidSimulationPanel` 三处复用，一处修复全覆盖。

## 修改原因

**事件逻辑链条分析**：

1. **核心症状**：3D 工具面板中的下拉列表展开后，选项背景为白色，字体也是白色（继承面板浅色文字），"白底白字"不可读。
2. **排查过程**：
   - 面板为刻意设计的独立暗色身份（`cesium-tool-theme.css` 域约定），主文字 `--ctp-text: #eefbf3`（薄荷白）；
   - 两处 select 的文字色：`.wms-layer-select { color: inherit }` 继承面板浅色、`.remote-service-type-select { color: var(--ctp-text) }` 显式浅色——select 框本身暗底浅字显示正常；
   - 问题出在**展开的 `<option>` 弹出层**：该层由浏览器原生渲染，Windows Chrome/Edge 默认白色背景；组件未对 `<option>` 显式设置 `background-color`/`color`，也未声明 `color-scheme`，option 文字继承 select 的浅色 → 白底浅字；
   - 令牌侧验证：主题文件早已预留 `--ctp-option-bg: #0d202d`（注释「下拉 option 底」），但全项目搜索确认**从未被消费**——样式接线缺失而非设计缺失。
3. **根本原因**：暗色面板下的原生 `<select>` 未做 option 弹出层配色接线（`color-scheme` + option 显式配色双双缺失），浏览器默认白底与继承浅色字叠加。
4. **主战场补充（modules 内嵌下拉，用户实测指认）**：模块卡片展开区的下拉并非模板级 `<select>`，而是 `LilGuiControls.vue` 内 **lil-gui 库运行时动态注入**的 `<select class="lil-selector">`（`gui.add(target, id, options)` 生成的 select 控件）。`LilGuiControls.vue` 现有样式仅对 select 设置 `color: #eefbf3` 浅色字，select 框底来自 lil-gui `--widget-color` 半透明冰蓝——框内显示正常，但 **option 弹出层同样未做任何配色接线**，展开即白底浅字不可读。scoped `:deep()` 规则编译为 `.lil-gui-host[data-v-x] ... select option`（data-v 属性锚定在模板内宿主元素），对运行时注入 DOM 依然命中，因此可在该组件内安全修复。

## 影响范围

- `CesiumToolPanel.vue`「图层」页签 → WMS 图层选择器（输入 WMS 地址枚举后弹出）；
- 「数据」页签 → 远程 3D 服务（Ion/I3S/3D Tiles）类型下拉；
- **modules 模块卡片内嵌 lil-gui 下拉**（体积云质量预设、风场/水体/分析/漫游等所有含 `type: 'select'` 控件的模块），经 `LilGuiControls.vue` 一处修复同时覆盖 `CesiumAdvancedEffects`（Cinematic FX）与 `FluidSimulationPanel` 两个复用方；
- `.is-embedded` 嵌入亮色模式（SidePanel 内嵌场景）对模板级 select 显式回退保持原白底观感；lil-gui 宿主为自绘暗色卡片无亮色变体，不受嵌入态影响；
- 纯 CSS scoped 样式改动，无模板/逻辑变更，无 i18n、无全局污染（规则均锚定在组件类名/宿主下）。

## 优化解决方案

1. **标准解**：select 声明 `color-scheme: dark`（Chrome/Edge/Firefox 96+ 原生弹层暗色化），配合 option 显式配色双保险——`color-scheme` 治弹层框架，option 配色治选项本身；
2. **令牌复用**：默认底 `--ctp-option-bg`（激活悬空预留令牌）、文字 `--ctp-text`、hover/checked 走面板既有「深绿选中族」（`--ctp-active-rgb`/`--ctp-active-deep-rgb`）与薄荷强调（`--ctp-title`/`--ctp-mint-mark`），零新增硬编码，符合域约定"禁止回退硬编码"；`--ctp-*` 为 App.vue 全局 @import 的 `:root` 变量，LilGuiControls 内可直接引用；
3. **双态防御**：`.is-embedded` 亮色回退块置于暗色块之后声明（同特异性靠后者胜出），`color-scheme: light` + 白底深字，复用 `--ctp-ink-neutral`（注释语义即"白底控件深灰字"）；lil-gui 宿主自绘暗色无双态，无需回退。

## 性能指标

- 无性能影响：纯静态 CSS 规则追加（约 25 行），不涉及渲染管线、监听器或响应式开销。

## 测试方案

- **已验（静态，2026-08-29）**：
  1. ESLint 单文件校验 `CesiumToolPanel.vue` 通过（退出码 0，零告警）；
  2. `npx vite build` 生产构建成功（✓ built in 43.32s，chunk 体积告警为项目既有情况，与本次无关）；
  3. 令牌核对：`--ctp-option-bg` / `--ctp-text` / `--ctp-active-rgb` / `--ctp-active-deep-rgb` / `--ctp-title` / `--ctp-mint-mark` / `--ctp-white-solid` / `--ctp-ink-neutral` 均在 `cesium-tool-theme.css` 中有定义，无未声明变量引用。
- **待实机回归**：
  1. 打开 3D 工具面板 →「图层」页签 → 展开自定义 XYZ → 输入任意 WMS 地址触发图层枚举 → 点开 WMS 图层下拉：选项应为暗色底浅色字，hover 深绿高亮，当前选中项深绿底薄荷字；
  2. 「数据」页签 → 远程 3D 服务类型下拉（ion/i3s/3dtiles）：同上暗色观感；
  3. **modules 内嵌下拉（主战场）**：展开任意含 select 控件的模块卡片（如体积云「质量预设」、大气面板等），点开下拉：选项暗色底浅色字、hover/选中深绿高亮；
  4. 嵌入模式回归：SidePanel 内嵌工具面板处点开模板级下拉，应保持白底深灰字（与改动前一致）；
  5. 控制台无样式类报错。
- 预期结果：浮层暗色模式下所有下拉选项清晰可读（对比度 ≥ WCAG AA），嵌入模式零变化。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\cesium\components\CesiumToolPanel.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\cesium\components\LilGuiControls.vue`

## 全项目同类问题排查矩阵（2026-08-29 追加，应用户要求全量核查）

排查方法：全项目 grep `<select`（src 下 13 个 .vue 文件）+ `new GUI(`（lil-gui 实例，仅 LilGuiControls 1 处）+ `datalist`（0 处）+ `color-scheme`（仅本次修复的两组件内 scoped 声明，无全局泄漏）+ `prefers-color-scheme`（仅 MapSwipeController 1 处装饰性媒体查询）。逐文件核验 select 框底色/文字色与 option 弹层继承链：

| 文件 | select（处数） | 框体配色 | option 弹层判定 |
|---|---|---|---|
| cesium/CesiumToolPanel.vue | 2 | 暗底浅字（暗色身份） | ❌白底白字 → **本次已修** |
| cesium/LilGuiControls.vue | 1（lil-gui 动态，覆盖 Cinematic FX/流体面板复用） | 暗底浅字（暗色身份） | ❌白底白字 → **本次已修** |
| ol/SpatialAnalysisPanel.vue | 8（param-select） | 白底 + `--brand-accent-muted`（#397d39 深绿） | ✅ 白底深绿字可读 |
| ol/routing/RoutePlannerPanel.vue | 1（join-select） | 白底 + `--text-brand-dark`（#2c4638） | ✅ 可读 |
| common/compass/CompassControlPanel.vue | 1（join-select） | 透明底 + 深字 | ✅ 可读 |
| common/layer-tree/TOCPanel.vue | 3（join/coord-crs/style-select） | 透明/浅底 + `--toc-text-*` 深字 | ✅ 可读 |
| common/layer-tree/TOCTreeItem.vue | 1（menu-material-select） | 透明底 + inherit（TOC 亮色菜单深字） | ✅ 可读 |
| common/user/AdminControlPanel.vue | 2（form/inline-select） | `--bg-primary`(#fff) + `--text-primary`(#333) | ✅ 可读 |
| common/user/ApiManagementPanel.vue | 3（filter-controls select） | rgba(255,255,255,.9) + #333 | ✅ 可读 |
| common/user/tabs/PreferencesTab.vue | 1（pref-select） | `--bg-secondary` + #333 | ✅ 可读 |
| ol/ControlsPanel.vue | 1（basemap-select） | white + `--brand-accent-muted` | ✅ 可读 |
| ol/MapDownloader.vue | 2（form-select） | rgba(255,255,255,.85) + #333 | ✅ 可读 |
| ol/layer/AttributeTable.vue | 1（pro-select） | #fff + #333 | ✅ 可读 |
| ol/layer/LayerControlPanel.vue | 1（wms-layer-select） | #fff + `--toc-text-primary, #333` | ✅ 可读 |

**结论**：全项目仅 cesium 暗色身份域的 2 个组件存在该 bug（均已修复）；其余 11 文件约 19 处 select 全部处于亮色宿主（theme.css 仅绿/蓝双亮色主题、无暗色模式；`--text-primary`/`--text-brand-dark`/`--brand-accent-muted` 均为深色系），option 白底继承深色字天然可读，**无新增修复项**。亮色 select 无需补 `color-scheme: light`（默认即 light，且全项目无 color-scheme: dark 泄漏，弹层不会被系统暗色误染）。

## 文档同步说明

- 根 README：项目简介当前版本 V3.5.34 → V3.5.35；「版本演进」新增 V3.5.35，保留最近三个版本（V3.5.35/34/33），V3.5.32 摘要归档 CHANGELOG（该版本在 CHANGELOG 已有完整条目）；页脚版本行同步；
- `Docs/Guide/CHANGELOG.md` 顶部新增 V3.5.35 条目；
- 本次无文件新增/删除、无目录调整，`Docs/Guide/project-structure.md` 及 frontend/backend README 的文件树无需改动。
