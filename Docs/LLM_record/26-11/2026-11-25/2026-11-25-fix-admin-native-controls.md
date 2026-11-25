# 2026-11-25 用户中心管理控件全面替换为系统自绘组件

- **日期与时间**：2026-11-25 13:01
- **任务等级**：L2（UI 一致性修复）
- **版本**：V3.7.11（按项目统一版本归并）

## 问题分析

用户中心管理界面多处直接依赖浏览器原生控件，与主题设计不一致：

1. 数据管理页删除行使用 `window.confirm`，API 密钥管理删除密钥/备份也用原生 `confirm`；
2. 数据表切换、每页条数、默认底图预设、API 统计天数、偏好设置（底图/语言/单位/模型）均使用原生 `<select>`，弹层样式、字体、配色不受系统主题控制。

## 解决方案

**统一由系统实现，不保留任何浏览器原生弹窗/下拉：**

- 新增可复用主题下拉组件 `frontend/src/domains/common/ui/ThemedSelect.{ts,vue}`：
  - props：`modelValue / options / placeholder / disabled / compact`；
  - emits：`update:modelValue / change`；
  - 自绘触发按钮与选项菜单，点击外部关闭，样式全部走 `--bg-primary / --text-primary / --brand-primary-rgb / --radius-*` 主题变量。
- `AdminControlPanel.vue` / `useAdminTable.ts`：
  - 删除 `window.confirm`，改为 Promise 化系统确认弹窗（主题化遮罩 + 对话框 + 取消/删除按钮）；
  - 表切换、每页条数、默认底图改为系统自绘下拉，状态由 composable 维护。
- `ApiKeysManagementPanel.{ts,vue}`：删除两处原生 `confirm`，替换为同主题确认弹窗。
- `ApiManagementPanel.{ts,vue}`：3 处统计天数 `<select>` 改为 `ThemedSelect`。
- `PreferencesTab.{ts,vue}`：4 处偏好设置 `<select>` 改为 `ThemedSelect`，选项文案统一走 i18n，新增 `handleThemedSelectChange()` 直接接收值。
- `frontend-structure.md` 已登记新增组件，结构树门禁保持零漂移。

## 验证

- `vue-tsc --noEmit`：0 错误
- `npx eslint src/domains/common/user src/domains/common/ui/ThemedSelect.ts --quiet`：0 错误
- `npm run build`：成功（4774 modules）
- 结构树 751/751、Vue 范式 73/73、领域隔离 TOTAL 0
- 未执行任何 Git 写操作。
