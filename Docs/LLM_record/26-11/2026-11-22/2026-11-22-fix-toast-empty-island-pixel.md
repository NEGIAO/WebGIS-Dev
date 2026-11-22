# 2026-11-22 修复灵动岛空闲态顶部残留黑点

- **日期与时间**：2026-11-22 17:10
- **任务等级**：L2（Bug 修复）
- **版本**：V3.7.8（曾用号 V3.7.9，按用户「整合为一个统一的版本：V3.7.8」指令归并，见 CHANGELOG 归并注）

## 问题分析

### 核心症状
用户实机截图：Toast 灵动岛消息自动消失后，页面**顶部中央残留一个约 1px 的黑色圆点**，存在于所有页面（含地图页、落地页），无交互时也在。

### 根本原因（浏览器实测确认）
`Message.vue` 的 `.message-host > .toast-list` 无条件渲染（无 `v-if`）。当 `messages` 与 `queued` 均为空时，`.toast-list` 仍是一个 DOM 节点：
- 实测 rect = **1.6px × 1.6px**、top=16px、left=517px（顶部中央）
- computed style：`background: rgb(0,0,0)`、`border: 0.8px rgba(255,255,255,0.08)`、`box-shadow`、`backdrop-filter: blur(20px)`、`children: 0`
- 岛体样式（黑底 + 边框 + 圆角 36px + 阴影）在零内容时塌缩成一个像素点，视觉上就是"顶部残留黑点"

### 受影响模块
`frontend/src/domains/common/shell/Message.vue`（仅模板渲染条件，不动逻辑/动画）。

### 候选方案对比
1. A：`v-if="messages.length || queued.length"` 直接不渲染——**否决**：最后一条 toast 离场时数组立即清空，容器瞬间移除会切断 leave 动画（黑岛"啪"地消失而非优雅收起）。
2. B：CSS `:empty { display:none }`——否决：TransitionGroup 退场期间节点仍在，判定不稳。
3. **C（选定）**：空态时只清除岛体视觉（背景/边框/阴影/backdrop-filter/圆角），DOM 与 TransitionGroup 结构保留，leave 动画完整播放；空态窗口极短（仅最后一条离场期间），视觉上等同"岛消失后不留痕"。

选 C：改动仅两行样式绑定，零逻辑改动、零动画风险。

## 修改内容
- `Message.vue`：`.toast-list` 绑定 `:class="{ 'toast-list-empty': messages.length === 0 && queued.length === 0 }"`；新增 `.toast-list-empty` 样式清除 background / border / box-shadow / backdrop-filter / border-radius。

## 测试方案
**Agent 已执行**：
- 修复前浏览器实测：`#global-message-host` 下 `.toast-list` rect=1.6×1.6px、background=rgb(0,0,0)、border=0.8px、box-shadow+blur 均生效、children=0 —— 黑点来源确证。
- 修复后实测：`class="toast-list toast-list-empty"`、background=rgba(0,0,0,0)、border-color=transparent、box-shadow=none、backdrop-filter=none —— 黑点消除；DOM 结构保留供 leave 动画。
- 门禁：tsc 0 / eslint 0 / vite build ✓ / 结构树 739/739 / 配置登记 ✓。
**待用户实机验证**：任意页面停留，确认顶部无黑点；触发 toast 确认进出场动画正常、消失后干净。
