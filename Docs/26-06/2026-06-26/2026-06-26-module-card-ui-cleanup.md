# 2026-06-26 模块卡片 UI 清理与视觉优化

## 日期和时间
2026-06-26

## 修改内容
1. **清理冗余 CSS 死代码** — 移除约 200 行已废弃的手写控制样式（`.control-row`、`.control-label` 等），这些样式在引入 lil-gui 库后已不再使用
2. **隐藏 lil-gui 重复标题** — lil-gui 自带的 title 栏与 module-head 标题重复，通过 `display: none` 隐藏
3. **模块卡片视觉增强**：
   - expanded 状态左侧 3px 绿色渐变色条
   - hover 时边框变亮 + 微阴影
   - 图标区域 32→36px，渐变背景 + 发光边框
   - 展开动画（opacity + translateY 过渡）
   - 状态标签加圆点指示器

## 修改原因
引入 lil-gui 库替换手写控制组件后，旧的控制样式成为死代码，增加了维护负担和文件体积。同时模块卡片视觉层次不够清晰，交互反馈不够明显。

## 影响范围
- Cesium 3D 面板 → 模块 Tab 卡片列表
- lil-gui 控件标题显示
- 嵌入模式 (is-embedded) 样式

## 优化解决方案

### 事件逻辑链条分析
1. **核心症状**：模块卡片视觉平淡、旧样式冗余
2. **根本原因**：lil-gui 引入后未清理旧样式；卡片缺乏层次设计
3. **受影响模块**：CesiumToolPanel.vue style 部分、LilGuiControls.vue
4. **解决方案**：删除死代码 + CSS-only 视觉增强

### 实施步骤
1. 删除 `.control-row` 全系列（约 130 行）
2. 删除 `.control-label` / `.control-help` / `.control-range` / `.control-number` / `.control-select` / `.control-color` 系列（约 70 行）
3. 删除 `.control-value` 及嵌入模式/媒体查询中的引用
4. LilGuiControls.vue 隐藏 `.lil-title`
5. 增强 `.module-item` / `.module-icon` / `.module-status` / `.module-body` 样式

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\CesiumToolPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\LilGuiControls.vue`
