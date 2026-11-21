# 2026-11-21 裸 defineAsyncComponent 批量加固（14 处 → defineResilientAsync）

- **日期与时间**：2026-11-21 20:15
- **任务等级**：L2（可用性加固）
- **版本**：V3.7.7（批次 C）

## 问题分析

### 核心症状（bugfix-plan 2026-10-31 登记项）

仓库仍存在大量裸 `defineAsyncComponent`：分片请求偶发超时/中断后组件**永久空白**、无占位、无重试、无超时反馈——与 V3.6.35 已修复的账号中心空白属同类成因。

### 根本原因

`defineResilientAsync`（占位/重试/超时三合一，2026-10-31 落地）只替换了 6 处关键组件，其余按需组件未跟进。

### 受影响模块

`app/HomeView.ts`、`domains/cesium/components/CesiumContainer.ts`、`domains/ol/components/ControlsPanel.ts`、`domains/common/shell/SidePanel.ts`、`domains/common/layer-tree/components/TOCPanel.ts`。

## 解决方案

全量扫描（实际 **15 处**，多于台账估的 12——ControlsPanel 的 4 个子面板登记时未列全）→ 逐处替换为 `defineResilientAsync`，label/minHeight 按面板语境定制。**1 处有意保留**：`HomeView` 的 SidePanel 为对象形态 + 定制 `onError`（stale Optimize Dep 重试 + 失败 toast），`defineResilientAsync` 不支持 onError 回调，且该处已有自愈路径——保留并在日志注明。

替换清单（14）：LogMonitor、AttributeTable、ShallowWaterOverlay、DrawPanel、MeasurePanel、SpatialAnalysisPanel、CesiumDrawMeasurePanel、ChatPanelContent、ToolboxPanel（共享 Promise 预加载兼容）、RoutePlannerPanel、CompassControlPanel、BuildingFetchPanel、WeatherChartPanel、MapDownloader。

## 修改内容

1. **fix（可用性）**：14 处替换，全部带失败文案与占位 minHeight；各文件清理不再使用的 `defineAsyncComponent` 导入（vue-tsc/eslint 验证）。
2. **chore**：SidePanel/TOCPanel/ControlsPanel/HomeView/CesiumContainer 导入 `defineResilientAsync`。

## 影响范围

五处面板宿主的按需加载行为（加载期出现轻量占位块、失败可点击重试）；不改任何面板内部逻辑与数据流。

## 性能指标

不涉及（占位延迟 180ms 内不闪烁；重试上限 2 次 ×线性退避与既有实现一致）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `vue-tsc --noEmit` 0 错误；eslint（6 文件）0 problems；全仓残留 `defineAsyncComponent` 仅 4 处（resilient 自身实现 1 + 保留处 import/用法 2 + 注释 1） | ① 断网/限速打开侧栏各面板（对话/路线/罗盘/建筑/天气/工具箱）与 TOC 底图下载、LogMonitor、属性表 → 出现占位块而非永久空白，恢复网络后点击重试可恢复；② 3D 模式 ShallowWaterOverlay 正常渲染 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `app/HomeView.ts` | 2 处替换（SidePanel 对象形态保留） |
| `domains/cesium/components/CesiumContainer.ts` | 1 处 |
| `domains/ol/components/ControlsPanel.ts` | 4 处 |
| `domains/common/shell/SidePanel.ts` | 6 处 |
| `domains/common/layer-tree/components/TOCPanel.ts` | 1 处 |
| `Docs/LLM_record/26-11/2026-11-21/2026-11-21-resilient-async-batch.md` | 本日志 |

## 遗留与风险

1. 台账登记的「懒加载重试覆盖范围被高估」与「发版后旧 chunk 失效」两个上游问题不在本批范围（后者需产品确认 reload 方案）。
2. 失败文案暂为硬编码中文（与既有 6 处 resilient 用法一致）；en-US i18n 补齐为独立项时统一迁移。
