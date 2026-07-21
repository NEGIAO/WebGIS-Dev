# WebGIS_Dev 维护日志

## 2026-06-22 AOI 面板无法弹出修复

- **日期和时间**：2026-06-22 21:xx
- **修改内容**：
  - 修复搜索结果点击后 AOI 解析面板无法弹出的状态同步问题。
  - 优化 `TOCPanel.vue` 内联 AOI 面板的打开逻辑，避免相同 POI 重复命中时被错误重置。
  - 补充相关事件链的容错判断，保持组件职责清晰。
- **修改原因**：
  - 用户点击搜索结果后，原本应通过 `latestSearchPoi -> TOCPanel watch -> manualAoiDialogVisible` 打开 AOI 面板，但当前逻辑在重复命中或状态复用时可能没有正确触发可见状态，导致面板看起来“打不开”。
- **影响范围**：
  - 前端搜索结果交互链路
  - TOC 工具箱内联 AOI 面板
  - 侧边栏 / 搜索结果联动状态
- **优化解决方案**：
  - 检查并修复 `TOCPanel.vue` 中监听 `latestSearchPoi` 的 `watch` 条件，增加对已打开且同一 POI 的判断，避免无效状态抖动。
  - 调整 `openManualAoiDialogByPoi`，仅在切换到新 POI 或首次打开时重置 JSON / 错误状态，保留已打开面板的可编辑内容。
  - 保持 AOI 面板仍然作为 `TOCPanel.vue` 的内联子组件，避免不必要的结构性重构。
- **性能指标**：
  - 本次为事件链修复，不涉及性能优化指标。
- **测试方案**：
  - 在前端点击一个高德搜索结果，确认侧边栏切换到工具箱并自动展开 AOI 面板。
  - 对同一搜索结果重复点击，确认面板保持可见且不会异常闪烁或丢失输入。
  - 对不同 POI 连续点击，确认 POI ID 与来源图层随结果刷新。
- **修改的文件路径**：
  - `d:/Dev/GitHub/WebGIS_Dev/frontend/src/components/Layer/TOCPanel.vue`
  - `C:/Users/NEGIAO/.claude/projects/d--Dev-GitHub/memory/webgis-aoi-panel-inline-fix.md`
