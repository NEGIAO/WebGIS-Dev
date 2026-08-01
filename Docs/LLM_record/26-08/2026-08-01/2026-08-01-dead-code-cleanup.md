# 死代码清理

- **日期与时间**：2026-08-01 18:30
- **任务等级**：L2
- **问题分析**：
  - 核心症状：多个文件存在注释掉的死代码、已完成 TODO 标记
  - 根本原因：历史重构遗留、功能迁移后未清理
  - 受影响模块：HomeView、CompassControlPanel、useMapSearchAndCoordinateInput、feng-shui-compass-svg

- **修改内容**：
  1. **HomeView.vue**：移除废弃的 `// const currentNewsIndex = ref(0);`（新闻轮播功能已迁移到 SidePanel）
  2. **CompassControlPanel.vue**：移除 `// TODO:√` 及 URL 参数精简注释（标记为已完成但注释仍保留）
  3. **useMapSearchAndCoordinateInput.js**：移除 67 行注释掉的废弃函数 `drawAmapAoiByDetailJsonInput` 旧版本
  4. **feng-shui-compass-svg.vue**：移除 65 行注释掉的废弃函数（hasLayerFill/getLayerFillColor/memoize/getLayerPath）

- **影响范围**：代码可维护性（无运行时行为变更）

- **测试方案**：
  - **Agent 已执行**：代码审查确认移除的代码均为废弃版本
  - **待用户实机验证**：功能无回归

- **变更文件清单**：
  - `frontend/src/app/HomeView.vue` — 移除废弃变量
  - `frontend/src/domains/common/compass/components/CompassControlPanel.vue` — 移除已完成 TODO 注释
  - `frontend/src/domains/ol/search/composables/useMapSearchAndCoordinateInput.js` — 移除废弃函数（-67行）
  - `frontend/src/domains/common/compass/svg/feng-shui-compass-svg.vue` — 移除废弃缓存函数（-65行）

- **遗留与风险**：Cesium vendor 目录的 TODO 注释保留（第三方代码，不修改）
