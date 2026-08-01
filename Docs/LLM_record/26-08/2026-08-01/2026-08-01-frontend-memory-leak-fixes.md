# 前端内存泄漏与定时器修复

- **日期与时间**：2026-08-01 16:30
- **任务等级**：L2
- **问题分析**：
  - 核心症状：多个前端组件存在内存泄漏（定时器未清理、事件监听未移除、DOM 元素未释放）
  - 根本原因：onUnmounted 生命周期钩子缺失清理逻辑、onMounted 返回函数不会自动执行、destroy 函数遗漏 DOM 清理
  - 受影响模块：HomeView（根组件）、MapControlsBar、ChatMessageList、useSingularity、wind 模块、SidePanel

- **修改内容**：
  1. **HomeView watchdogTimer 泄漏**：添加模块级 `activeWatchdogTimer` 变量，onUnmounted 时清理
  2. **MapControlsBar 事件监听泄漏**：将清理逻辑从 onMounted 返回值（不会被调用）移到 onUnmounted 钩子
  3. **ChatMessageList copiedTimer 泄漏**：onUnmounted 清除 copiedTimer
  4. **useSingularity SVG 泄漏**：destroy 函数中添加 SVG 容器移除逻辑
  5. **wind console.log 性能问题**：删除打印整个 Float32Array 的 console.log，另一处添加 DEV 守卫
  6. **SidePanel fetch 超时**：添加 AbortController 8 秒超时保护

- **影响范围**：前端内存管理、用户体验（防止长时间使用后卡顿）

- **测试方案**：
  - **Agent 已执行**：门禁脚本通过、代码审查确认逻辑正确
  - **待用户实机验证**：长时间使用后浏览器内存无明显增长

- **变更文件清单**：
  - `frontend/src/app/HomeView.vue` — watchdogTimer 清理
  - `frontend/src/domains/ol/components/MapControlsBar.vue` — 事件监听清理修正
  - `frontend/src/domains/common/chat/components/ChatMessageList.vue` — copiedTimer 清理
  - `frontend/src/domains/common/components/Magic/useSingularity.js` — SVG 泄漏清理
  - `frontend/src/domains/cesium/modules/wind/index.mjs` — console.log 删除
  - `frontend/src/domains/common/shell/SidePanel.vue` — fetch 超时保护

- **遗留与风险**：无
