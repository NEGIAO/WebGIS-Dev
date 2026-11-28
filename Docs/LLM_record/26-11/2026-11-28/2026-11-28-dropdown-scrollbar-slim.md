# 2026-11-28 底图下拉滚动条瘦身：消除横向溢出 + 收敛滚动条高度（V3.7.30）

- **日期与时间**：2026-11-28 13:56 – 14:00（CST）
- **任务等级**：L1（CSS 布局 + 滚动条样式）
- **本次版本**：V3.7.30
- **任务来源**：用户指令（附截图）：`custom-select-dropdown` 的左右滑动控件高度太高，要求调整优化 UI。

## 问题分析

**核心症状**：下拉列表底部出现一条明显的浅绿色横向滚动条（截图红框），高度约 15px，与 12px 字号、约 26px 行高的目录条目相比视觉重量过大。

**根因 1（溢出源）**：`.combo-provider-toggle` 同时命中 `.history-year-toggle { width: 100% }` 与自身 `margin: 2px 4px`。全局 `box-sizing: border-box` 下，`width: 100%` 只覆盖内容+内边距+边框，左右各 4px margin 仍额外占据父容器宽度，二级服务商行恒定横向溢出 8px，因此横向滚动条一直可见（截图中滑块接近满宽，符合 8px 微溢出的特征）。

**根因 2（尺寸源）**：原 `.custom-select-dropdown::-webkit-scrollbar` 仅设置 `width: 6px`（纵向），未设置 `height`；横向滚动条回退到浏览器默认约 15px。且缺少 Firefox/现代 Chromium 标准属性 `scrollbar-width` / `scrollbar-color`。

**受影响模块**：OL `LayerControlPanel.vue`（仅样式，无模板/逻辑变更）。Cesium 侧不存在 `.custom-select-dropdown`，无需镜像。

## 修改内容

1. **消除常驻溢出**（`LayerControlPanel.vue`）：
   - `.combo-provider-toggle` 增加 `width: calc(100% - 8px)`，精确抵扣左右 4px margin；保留原有 2px 上下 / 4px 左右外边距与 6px 圆角观感。
2. **滚动条瘦身**（同文件）：
   - `.custom-select-dropdown` 显式 `overflow-x: auto; overflow-y: auto;`，横向滚动能力保留为兜底而非常态显示；
   - 增加 `scrollbar-width: thin` 与 `scrollbar-color: rgba(var(--brand-primary-rgb), 0.35) transparent`；
   - WebKit 伪元素增加 `height: 4px`（横向），`width: 6px` 保持不变；thumb 保持 4px 圆角，新增 hover 加深至 0.55 透明度，`::-webkit-scrollbar-corner` 设透明。

## 修改原因

先消除不该存在的 8px 溢出（否则仅缩窄滚动条仍会在列表底部留下常驻条带），再把兜底滚动条尺寸收敛到与紧凑目录相称的量级；两处改动分别对应「不出现」与「出现时也轻」两个层次。

## 影响范围

仅 OL 底图下拉的滚动条可见性与厚度，以及二级服务商节的宽度计算（相对父容器仍左右各留 4px 边距，视觉位置不变）。不影响：目录数据、搜索、编号契约、选择/折叠交互、Cesium 面板。

## 解决方案

```mermaid
flowchart LR
    A[.combo-provider-toggle<br/>width:100% + margin 4px×2] -->|改为 calc(100% - 8px)| B[横向溢出 8px 消除<br/>横向条不再常驻]
    C[::-webkit-scrollbar 仅 width:6px] -->|补 height:4px<br/>+ scrollbar-width:thin| D[兜底横条 4px / 纵条 6px]
    B --> E[下拉底部视觉重量下降]
    D --> E
```

## 性能指标

不适用（纯 CSS，无运行时计算；DOM 结构与事件处理不变）。

## 测试方案

### Agent 已执行

- `vue-tsc --noEmit`：**0 错误**。
- `check-basemap-catalog` / `check-layer-definitions` / 结构树 / 配置登记 / 分域依赖：**全绿**（详见最终执行输出）。
- 源码核查：`.combo-provider-toggle` 宽度计算与 margin 代数抵消；dropdown 横纵滚动条伪元素声明完整。

### 待用户实机验证

1. OL 底图下拉展开全部分类：底部不再出现截图中的粗横向条；二级服务商节标题左右边距保持原样。
2. 将浏览器窗口压到极窄（或放大页面）：若确需横向滚动，条高为 4px、thumb hover 有加深反馈，且不遮挡最后一行条目。
3. Firefox 中滚动条同样为细条（由 `scrollbar-width: thin` 保证）。

## 变更文件清单

- `frontend/src/domains/ol/layer/components/LayerControlPanel.vue`——服务商行宽度补偿 + dropdown 滚动条尺寸/颜色
- `README.md` / `Docs/Guide/CHANGELOG.md`——V3.7.30 三处版本号 + 条目
- 本日志

## 遗留与风险

- 4px 是刻意偏细的档位：在极窄窗口下横向滚动条触摸目标较小；若后续确认移动端依赖横向拖动，可在 `@media (pointer: coarse)` 下单独放宽到 6px。
- 未对 `.custom-select-dropdown` 设 `overflow-x: hidden`，保留极端长文本（如搜索结果面包屑）场景的横向滚动兜底，避免内容被直接裁切。
