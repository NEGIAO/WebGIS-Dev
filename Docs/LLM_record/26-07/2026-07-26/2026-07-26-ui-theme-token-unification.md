# 2026-07-26 前端 UI 主题令牌统一治理（ui-theme-token-unification）

- **日期和时间**：2026-07-26 20:10
- **所属版本**：V3.4.14
- **变更类型**：前端样式治理（设计令牌基建 + 机械化同值替换 + 面板试点，零功能改动）

---

## 事件逻辑链条分析

| 环节 | 内容 |
|------|------|
| 核心症状 | UI 审计（48 组件扫描）发现四类系统性问题：① 大量组件硬编码颜色，切蓝色主题时不联动（Chat 111 处、AttributeTable 67 处等）；② z-index 魔数散布（1~9999 十余档），浮层遮挡隐患（当日注册页头部被遮挡即同类问题）；③ 面板设计语言割裂（TOC 独立 --toc-* 体系 / DrawPanel 硬编码绿 / 各面板圆角投影不一）；④ 字号碎片化（10~24px 共 490+ 处） |
| 根本原因 | theme.css 只定义了颜色类变量，缺少层级/面板/字号令牌；历史组件在无令牌约束下各自硬编码 |
| 受影响的模块 | theme.css（令牌基建）、30 个 Vue 组件的 `<style>` 块（颜色与 z-index 替换）、DrawPanel/MeasurePanel（面板试点） |
| 解决方案 | 分三档风险推进：零风险（同值替换：默认主题渲染逐字节不变）→ 低风险（近似色归一试点，限 ControlsPanel 面板族群）→ 基建（令牌定义 + 使用约定注释），高风险的全量近似归一与字号迁移列为后续迭代 |

---

## 修改内容

1. **theme.css 三组新令牌**（附使用约定注释）
   - 层级：`--z-float(100) / --z-panel(1000) / --z-popover(1200) / --z-modal(2000) / --z-modal-high(2200) / --z-toast(9999)`；约定跨组件浮层必用令牌，组件内局部堆叠（1~10）不用。
   - 面板：`--panel-radius(12px) / --panel-radius-sm(8px) / --panel-shadow / --panel-border / --panel-bg / --panel-header-gradient`。
   - 字号：`--fs-xs(11) / --fs-sm(12) / --fs-md(13) / --fs-base(14) / --fs-lg(16) / --fs-xl(20)`，新代码使用、存量渐进迁移。
2. **硬编码颜色同值替换（25 个组件 44 处，零视觉差）**
   - 脚本仅处理 `<style` 之后内容（不碰 script 中的图表色等）；23 组映射全部与 theme.css 取值完全一致：#4caf50→--brand-primary、#2e7d32→--brand-primary-dark、#81c784/#a5d6a7→light/lighter、#e8f5e9/#c8e6c9→bg-brand-light/lighter、#57b861/#0a6815/#5bcf89→accent 系、#397d39→--text-brand、#2c4638→--text-brand-dark、#333/#666/#999（含 6 位形式）→text 三级、#e0e0e0→--border-light、#f9f9f9→--bg-secondary、#ef4444/#fecaca/#f8b600/#1890ff/#52c41a→功能色。
   - #fff/#000 一律不替换（白字用于品牌色背景等语境，机械替换有风险）。
3. **z-index 魔数清零（35 处，值不变）**
   - 100→--z-float、1000→--z-panel、1200→--z-popover、1400→calc(popover+200)、2000→--z-modal、2001→calc(modal+1)、2200→--z-modal-high、9997/9998→calc(toast-2/-1)、9999→--z-toast。
   - 保留局部堆叠小值（1/2/3/4/5/10，共 31 处，组件内部相对层级，不属于跨组件冲突面）。
4. **DrawPanel/MeasurePanel 面板族群试点（近似色归一 + 框架令牌 + 移动端）**
   - 绿色家族 15 组归一：#6b8c6b/#5f7a5f/#3f6b3f→--text-brand；#d7e4d7/#d7e8d7/#c5dec5→--border-brand-light；#e8f0e8→--bg-brand-light；#f4faf4/#f6faf6/#eaf6ea→rgba(--brand-primary-rgb) 水洗底；红色系 #d44→--danger、#ffd0d0→--danger-light、#fff0f0/#ffe0e0/#ffb0b0→rgba(--danger-rgb)。
   - 面板框架接入令牌：background→--panel-bg、border-radius→--panel-radius、box-shadow→--panel-shadow、描边→rgba(--brand-primary-rgb,0.12)。
   - 新增 `@media (max-width:768px)`：面板宽度 `min(248px/200px, calc(100vw - 24px))`，修复固定宽小屏溢出。
5. **刻意排除项**（避免破坏有意设计）
   - vendored 模块 `cesium-navigation` / `cesium-wind-layer` 全程排除。
   - LogMonitor 暗色终端配色（#22c55e 等终端绿）为设计意图，仅同值替换命中的 2 处生效，不做归一。

## 修改原因

用户确认对 UI 审计结论"优化他们"。硬编码色导致蓝色主题残缺是最大体验破坏点；z-index 无治理已实际引发过遮挡类 BUG；面板规范与字号令牌为后续统一迭代打地基。

## 影响范围

- 视觉：默认绿主题下除 DrawPanel/MeasurePanel 有极轻微色调归一（水洗底/灰绿文本向语义变量靠拢）外，其余组件渲染零变化；蓝色主题下 25 个组件首次正确联动。
- 结构/功能：零改动（纯 style 块与 theme.css）。
- 不影响：所有业务逻辑、模板、脚本、后端。

## 优化解决方案（实施步骤）

1. 令牌基建先行（theme.css），保证替换目标存在。
2. 编写幂等脚本（dry-run → apply）：仅 style 块、hex 边界断言（`#333` 不吞 `#333333`）、按长度降序替换、排除 vendored；先跑 dry-run 审阅 25 文件清单再落盘。
3. ControlsPanel 族群色值实测清点后curated 映射，避免盲目全局近似归一。
4. 残留复查闭环：映射色值 style 块残留 0、z-index 魔数仅剩局部小值、补齐 1400/9997 三处漏网。

## 性能指标

- 纯样式变量化，无运行时开销变化（CSS 变量解析开销可忽略）；无资源增减。

## 测试方案

- **静态验证（已执行，全部通过）**：30 个改动 Vue 文件 compiler-sfc `parse + compileScript + compileStyle` 编译通过；theme.css 花括号配平与 9 个新令牌存在性断言通过；已映射色值 style 块残留 0；z-index 令牌 35 处落地、遗留魔数复查仅剩约定内局部小值。
- **手动验收清单（建议执行）**：① 默认绿主题全站走查（重点 DrawPanel/MeasurePanel 观感应基本无感知）；② 切换 `data-theme="blue"`：TopBar、消息提示、图层面板、Chat 面板、绘制/测量面板应全部变蓝，无残留绿色；③ 浮层叠加实测：TOC 右键菜单 × 模态框 × toast 同屏层级正确；④ 小屏（<768px）打开绘制/测量面板不溢出视口。
- 预期结果：绿主题视觉近乎零变化，蓝主题一致性显著提升，浮层层级可预期。

## 补记（2026-07-27 02:00 面板令牌推广·V3.4.36）

按试点模式完成 ControlsPanel 面板族群剩余成员的令牌化（用户指示"继续"）：

- 覆盖：`SpatialAnalysisPanel.vue`（14 处）、`AdministrativeDivisionPanel.vue`（5 处）、`ControlsPanel.vue` 含卷帘对话框（10 处）、`MapControlsBar.vue`（1 处），共 30 处替换。
- 框架四件套：`rgba(255,255,255,0.95)`→`var(--panel-bg)`、`border-radius:12px`→`var(--panel-radius)`、`0 8px 32px` 投影→`var(--panel-shadow)`（均同值，零视觉差）、灰绿描边→`rgba(var(--brand-primary-rgb), 0.12)`。
- 绿色家族沿用试点映射（#e8f0e8/#f6faf6/#d44/#fff0f0/#ffd0d0/#6b8c6b 系）。
- 验证：4 组件 compiler-sfc + ESLint 零告警。
- 里程碑：ControlsPanel 面板族群（Draw/Measure/SpatialAnalysis/District/主容器/MapControlsBar）令牌化全部完成；UserCenter 已在 V3.4.28 单套化。

## 后续迭代建议（本次刻意不做）

- Routing（BusPlanner/DrivingPlanner）与 Cesium 工具面板按同模式接入 --panel-* 与语义色。
- 字号阶梯存量迁移（490+ 处，建议按组件分批）。
- TOC 的 --toc-* 独立体系与 brand 令牌合流。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\assets\theme.css`（新增三组令牌）
- 同值替换 25 个组件（均仅 style 块）：`components/Chat/ChatPanelContent.vue`、`components/Map/MapSwipeController.vue`、`components/Cesium/CesiumContainer.vue`、`components/Cesium/CesiumToolPanel.vue`、`components/ControlsPanel/ControlsPanel.vue`、`components/ControlsPanel/LogMonitor.vue`、`components/Layer/LayerControlPanel.vue`、`components/Map/MapControlsBar.vue`、`components/Map/MapEasterEgg.vue`、`components/Shell/TopBar.vue`、`components/UserCenter/AdminControlPanel.vue`、`views/HomeView.vue`、`components/Cesium/CesiumDataImportDialog.vue`、`components/Cesium/PlayerController/PlayerGuidePanel.vue`、`components/Common/ExtentPicker.vue`、`components/Layer/LayerPropertiesDialog.vue`、`components/Layer/TOCTreeItem.vue`、`components/Routing/MapPointPickerCard.vue`、`components/Shell/GlobalLoading.vue`、`components/Shell/MagicCursor.vue`、`components/Shell/Message.vue`、`components/Shell/ResizeHandle.vue`、`components/Shell/SidePanel.vue`、`components/UserCenter/FloatingAccountPanel.vue`、`views/RegisterView.vue`
- z-index 补漏 3 个组件：`components/Cesium/CesiumContainer.vue`、`components/Layer/AttributeTable.vue`、`components/Cesium/PlayerController/NavGuideHUD.vue`
- 面板试点：`components/ControlsPanel/DrawPanel.vue`、`components/ControlsPanel/MeasurePanel.vue`
- 文档：`README.md`（版本升至 V3.4.14）、`Docs/Guide/CHANGELOG.md`（新增 V3.4.14 条目）、本日志（新增）
