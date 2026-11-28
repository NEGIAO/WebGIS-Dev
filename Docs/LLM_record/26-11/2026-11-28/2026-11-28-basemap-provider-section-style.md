# 2026-11-28 二级服务商行「节标题」样式分层（V3.7.25）

- **日期与时间**：2026-11-28 12:23 – 12:30（CST）
- **任务等级**：L2（双引擎样式分层）
- **本次版本**：V3.7.25
- **任务来源**：用户指令——两级目录展开到条目后，二级分类（服务商行）与条目行 UI 区别不大，需优化区分度。

## 问题分析

**核心症状**：服务商行与条目行同为 12px 常规字重、同为无底色行式，静态观感几乎一致；层级区分仅靠缩进与序号，扫读时层级感弱。

**根本原因**：服务商行完全继承通用折叠行基类（OL `.history-year-toggle` / Cesium `.section-toggle`），未做「节标题」化；条目行也未反向弱化。

**受影响模块**：OL `LayerControlPanel.vue`、Cesium `CesiumToolPanel.vue`（纯 CSS；序号/计数由并行会话已落地的 `catalog-ordinal-l2`/`catalog-count` 提供）。

## 修改内容

1. OL `.combo-provider-toggle`：加粗 700 + 主色淡底色块（静态 0.06 / hover 0.11，只加深不改几何）+ 圆角 6px + 行距收紧——升级为「节标题」。
2. Cesium `.catalog-provider-toggle`：同款淡底（`section-head` 已是 700 字重，补底色块即与卡片网格条目分层）。
3. 条目行保持轻量平铺（无底色、常规字重、编号徽标 + 坐标/proxy 徽标承载信息）——静态下三级视觉梯度：分类行（accent 色 + 大写序号）→ 服务商行（加粗 + 淡底 + 计数）→ 条目行（平铺 + 徽标）。

## 修改原因

层级区分度不足导致扫读困难；节标题化是最小成本的强区分手段，且不引入新控件。

## 影响范围

双引擎目录树服务商行观感。不影响：交互逻辑、数据、编号契约、移动端触屏档（行高不变）。

## 解决方案

静态三级视觉梯度：
```
一级  一、影像底图            accent 色 · 大写中文序号
二级  ┃ 1. Google      7 条   加粗 · 淡底色块 · 阿拉伯序号 · 计数
三级      [27] proxy Google卫星(GCJ) (GCJ02)   平铺 · 编号/代理/坐标徽标
```

## 性能指标

不适用（纯 CSS）。

## 测试方案

### Agent 已执行

- `vue-tsc --noEmit`：**0 错误**。
- `check-layer-definitions` / `check-basemap-catalog` / 结构树 / 配置登记：**全绿**。

### 待用户实机验证

1. OL/Cesium 目录：服务商行呈淡底加粗色块、右侧有计数；条目行为平铺轻量行——静态即可分层。
2. hover 服务商行仅底色加深、行高不变；展开/收起几何无跳动。

## 变更文件清单

- `frontend/src/domains/ol/layer/components/LayerControlPanel.vue`——服务商行节标题样式
- `frontend/src/domains/cesium/components/CesiumToolPanel.vue`——同款镜像
- `README.md` / `Docs/Guide/CHANGELOG.md`——V3.7.25 三处版本号 + 条目
- 本日志

## 遗留与风险

- 淡底强度（0.06/0.11）为起始档，过重/过轻改一处常量即可。
- 并行会话仍在迭代同区域样式（序号/计数已由其落地）；本任务仅叠加分层底色，如其后续调整行内边距，二者叠加兼容。
