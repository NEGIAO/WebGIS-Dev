# 2026-10-17 12:25 — 落地页主卡嵌入产品预览图

- **任务等级**：L2（功能增强：主卡加图 + 左右分栏，跨模板/样式/script，向上取整按 L2 全流程）
- **本次版本**：V3.6.20（归并补记：本批次原拟独立 V3.6.21，2026-10-17 同日多批次暂存统一归并记档为 V3.6.20）

## 问题分析

- **核心症状**：`feature1` 主卡（2D/3D 双引擎）在桌面跨 2 列 2 行，文本 `max-width:42ch` 后右侧大面积留白
- **根本原因**：主卡只有图标 + 两行文案，无视觉载体；`preview.webp`（1995×1155，230K，已在 `public/images/`）未被引用
- **受影响模块**：`frontend/src/app/LandingView.vue`（模板/样式/script 各一处）

## 修改内容

1. 主卡模板：`v-if="feature.hero"` 条件渲染 `<img>`，`src=previewUrl`，`loading=lazy + decoding=async`，其它 9 卡 DOM 零变化
2. script：新增 `previewUrl = ASSET_BASE_URL + images/preview.webp`（与 logoUrl 同源派生，子路径部署兼容）
3. 样式（本轮定稿）：不分栏，文案保持原纵向流；裸图嵌入（无背景/边框/圆角/阴影），`right:0/bottom:0` 与卡片右下角贴齐，按原比放大（桌面 `min(68%,540px)` / 窄屏 `min(66%,480px)`）；文案收窄 + `margin-bottom` 留图位禁区防压字；卡片设 `min-height` 兜底防图溢出；装饰性配图不可选中/拖拽（`draggable=false + user-select:none + pointer-events:none`，桌面/窄屏一致）

## 修改原因

用户明确要求：首屏 2D/3D 双引擎放大主卡右侧空白，嵌入 `public/images/preview.webp`，别的不变。

## 影响范围

- 落地页核心功能区主卡视觉；其它卡片、Hero、导航、滚动条、i18n 均不动
- 新增 230K webp 懒加载，首屏不阻塞（Lighthouse 图片延迟计数外）

## 解决方案

- **选定**：主卡内左右分栏（左文案钉 1 列、右图跨全行），仅桌面生效，窄屏纵向兜底
- **被否**：整卡背景图（文本可读性崩）、Hero 统计条加图（用户明确只动主卡 div）

## 性能指标

未实测（沙盒无法跑 vite 预览；图片 230K + lazy，理论首屏零增量）

## 测试方案

- **Agent 已执行**：ESLint `src/app/LandingView.vue` 0 error（exit 0）；`grep` 确认模板/script/样式三处落点；`feature-hero-preview` 共 3 处（模板1 + CSS2）
- **待用户实机验证**：
  1. `npm run dev` 打开落地页 → 桌面 ≥1025px 主卡左文案右图，图左对齐裁切正常
  2. 拉窄到 ≤1024px → 主卡整行置顶，图在文案下 16/10 全宽
  3. 切换中英文 → 图 `alt` 跟随标题变化；深/浅主题描边联动

## 变更文件清单

- `frontend/src/app/LandingView.vue`：主卡模板加图 + previewUrl + 两栏 grid（含窄屏兜底）
- `Docs/LLM_record/26-10/2026-10-17/2026-10-17-landing-hero-card-preview.md`：本日志
- `README.md`：三处版本号 V3.6.20 → V3.6.21
- `Docs/Guide/CHANGELOG.md`：顶部追加 V3.6.21 条目

## 遗留与风险

- 图片 404 根因：`preview.webp` 在 git 暂存区（`A frontend/public/images/preview.webp`），线上 `NEGIAO.github.io/WebGIS/images/` 构建早于文件加入，无此文件——路径拼接本身无误（与 logoUrl 同源 `ASSET_BASE_URL`），下次前端构建/部署即恢复
- 本轮按用户要求改布局：图与文案同行并排 + `object-fit:contain` 按原比完整显示（不再 cover 裁切），窄屏亦按原比全宽
- 未跑 `tsc --noEmit`（LandingView 为纯 JS SFC，无新增 .ts；存量错误与本次无关）

