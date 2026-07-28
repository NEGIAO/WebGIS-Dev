# V3.4.87 — AttributeTable / MapControlsBar / AmapAoiInjectDialog UI i18n

- **日期与时间**：2026-07-28（会话续写收尾）
- **任务等级**：L2
- **版本**：V3.4.87（tip 基线 V3.4.86 顺延 +1）

## 问题分析

- **核心症状**：属性表、底部坐标控制条、高德 AOI 注入弹窗仍有大量用户可见中文硬编码（标题、按钮、placeholder、toast）。
- **根本原因**：Vue 组件 UI 文案未接入 `useLocale` / full pack 键；此前 i18n 多停留在 API/composable toast。
- **受影响模块**：`AttributeTable.vue`、`MapControlsBar.vue`、`AmapAoiInjectDialog.vue`、`locales/zh-CN.js`、`locales/en-US.js`。

## 修改内容

1. 新增 `attrTable.*`、`mapControls.*` 全量键；扩展 `layer.aoiHintAria` / `aoiFetchSuccess` / `aoiFetchFailed` / `aoiRequestFailed` / `aoiPastePrompt` / `aoiUnknownError`。
2. `AttributeTable.vue`：`useLocale`；标题、工具栏、字段面板、空态、排序 tip、页脚全量 `t('attrTable.*')`；默认图层名 `defaultLayerName`。
3. `MapControlsBar.vue`：`useLocale`；坐标编辑 tip、复制、格式菜单、缩放、复位 tip、placeholder、复制成功/失败 toast。
4. `AmapAoiInjectDialog.vue`：模板 `layer.aoi*`；脚本 toast 与 paste prompt 全量 `t()`。

## 修改原因

用户明确要求 Vue 组件可见 UI 优先 i18n；本批覆盖 residual 排名中的 AttributeTable / MapControlsBar / AOI 弹窗。

## 影响范围

- 前端界面语言切换时上述三组件文案跟语种。
- 无后端 / 配置 key / 目录增删结构变更（仅 structure 注释同步）。

## 解决方案

- full pack 键 + 组件 `useLocale` 接线；复用既有 `layer.aoi*` 标题/方法文案，仅补 fetch/paste toast 键。
- leaf parity 对齐；不改业务逻辑。

## 性能指标

未实测（纯文案替换）。

## 测试方案

### Agent 已执行

- `node --check` zh-CN.js / en-US.js
- leaf parity：zh 1691 = en 1691
- `python CheckStructureTree.py` / `python CheckConfigRegistry.py`（收尾执行）

### 待用户实机验证

1. 中文界面打开属性表：标题/工具栏/字段面板/空态/页脚为中文。
2. 切换 English：上述英文；坐标条 tip/格式菜单/复制 toast 英文。
3. 打开高德 AOI 注入：方式1/2 按钮与 toast 跟语种。

## 变更文件清单

| 路径 | 说明 |
|---|---|
| `frontend/src/locales/zh-CN.js` | attrTable / mapControls + layer AOI 扩展键 |
| `frontend/src/locales/en-US.js` | 同上 en |
| `frontend/src/components/Layer/AttributeTable.vue` | UI t() |
| `frontend/src/components/Map/MapControlsBar.vue` | UI/toast t() |
| `frontend/src/components/Search/AmapAoiInjectDialog.vue` | UI/toast t() |
| `Docs/Guide/frontend-structure.md` | 三组件注释 |
| `Docs/Guide/CHANGELOG.md` | V3.4.87 条目 |
| `README.md` | 三处版本 tip |
| `Docs/LLM_record/26-07/2026-07-28/2026-07-28-v3487-attrtable-mapcontrols-aoi-i18n.md` | 本日志 |

## 遗留与风险

- 法律页（ToS/Privacy）与 Admin API Key 面板等高 residual 未纳入本刀。
- AttributeTable / MapControlsBar 内注释中文保留（非 UI）。
- 无 Git 提交（用户禁止写操作）。
