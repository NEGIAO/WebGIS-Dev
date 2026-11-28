# 2026-11-28 落地页核心功能卡片扩至 12 条

- **日期与时间**：2026-11-28 14:12
- **任务等级**：L2（UI 文案 + 布局改动）
- **本次版本**：V3.7.32（V3.7.31 已被并行会话占用，按 §5 顺延）

## 问题分析

用户要求：① 新增一条核心功能——瓦片架构与分类体系、瓦片定义与引擎解耦、详细属性信息与归类整理、汇集 300+ 常用底图（大众、小众 API、自研纠偏），简要概括；② 第 10、11 条文案过长，需简化；③ 加第 12 条后做成 7/8/9 那样的方块。

现状：`FEATURES` 11 条，其中 feature10/11 用 `wide: true` 跨满整行做横向汇总卡，文案各 150+ 字；7–9 是普通方块卡，文案约 30 字。

## 修改内容

1. **新增 feature12「底图资源库」**：
   - 中文 desc：`300+ 常用底图，分类清晰、定义与引擎解耦，含小众 API 与自研纠偏。`
   - 英文 desc：`300+ curated basemaps with clear categories and engine-agnostic definitions, incl. niche APIs and in-house rectification.`
   - 图标 `Grid2X2`（@lucide/vue），已加入 import 与 components 注册。
2. **精简 10/11 文案**（中英同步，压到与 7–9 同等长度）：
   - 建筑白模抓取：`腾讯、高德、天地图三源矢量瓦片统一解码，框选即抓、一键入库双引擎。`
   - 非标准瓦片在线纠偏：`服务端逐瓦片重采样，GCJ-02 / BD-09 对齐 WGS-84 网格，双引擎零改造。`
3. **布局改为全方块**：
   - `FEATURES` 去掉 feature10/11 的 `wide: true`；
   - 模板去掉 `feature-card--wide` 类绑定；
   - CSS 删除 `.feature-card--wide` 全部规则，注释改为 12 卡铺满算法；
   - 2 列断点注释更新（11 张普通卡恰满 6 行），保留末卡 `grid-column: auto` 防历史样式回潮。

## 布局数学

- 3 列（>1024px）：主卡 2×2 = 4 格 + 11 张普通卡 = 15 格 = 5 行，恰好铺满。
- 2 列（≤1024px）：主卡整行 = 1 格 + 11 张普通卡 = 12 格 = 6 行，恰好铺满。
- 7–9 与 10–12 各成一行三列方块，符合用户要求。

## 验证

- `npm run typecheck`（vue-tsc --noEmit）：0 错误。
- `npm run build`：通过（19.32s）。
- 待用户实机：确认 12 卡在桌面/平板/手机下无孤卡，7–9/10–12 成方块。

## 变更文件清单

- `frontend/src/app/LandingView.ts`（FEATURES + 图标导入/注册）
- `frontend/src/app/LandingView.vue`（模板类绑定 + CSS）
- `frontend/src/locales/core/zh-CN.ts`（feature10/11 精简 + feature12 新增）
- `frontend/src/locales/core/en-US.ts`（同上）
- `README.md`、`Docs/Guide/CHANGELOG.md`、本日志

## 遗留与风险

无。文案中的「300+」为概括性表述（实际定义 174 条图层 + 148 预设，含派生组合与历史源），如后续要求精确数字需再核对。
