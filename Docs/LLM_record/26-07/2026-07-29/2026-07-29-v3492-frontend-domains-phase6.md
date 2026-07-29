# 前端 domains 架构 Phase 6：Layer / TOC 拆分

- **日期与时间**：2026-07-29 17:30
- **任务等级**：L3 架构级
- **版本号**：V3.4.92

---

## 问题分析

### 核心症状
前端 `components/Layer/` 下的 TOC 相关 UI（`TOCTreeItem.vue`、`LayerPropertiesDialog.vue`、`SharedResourceTreeItem.vue`）和 `composables/map/toc/` 下的 TOC 协议/动作/菜单逻辑，散落在旧目录中，与新的 `domains/ol`、`domains/cesium`、`domains/common` 三领域架构不匹配。

### 根本原因
TOC（图层目录树）是一个跨引擎 UI：UI 壳与协议属于 `common`，Cesium 侧的动作分流器属于 `cesium/layers/toc-adapters`，OL 侧的图层实现属于 `ol/layer/`。Phase 1/5 已下沉 Cesium 入口和 OL 地图核心，但 TOC 模块仍保留在 `components/Layer/` 和 `composables/map/toc/` 中。

### 受影响模块
- `domains/common/`：新增 `layer-tree/` 子模块，承接 TOC 协议、工厂、UI 组件、动作管理、菜单调度
- `domains/cesium/layers/toc-adapters/`：新增 Cesium 侧 TOC 动作分流器
- `components/Layer/TOCPanel.vue`：更新 import 为新 alias
- `components/Layer/LayerPanel.vue`：更新 TOCTreeItem 导入路径
- `composables/map/index.js`：移除已迁移 toc 模块的 re-export
- `utils/layerExportService.js`：更新 KML 导出导入路径

### 候选方案对比
1. **全量迁移 + 业务重构**：风险高，容易引入回归，且违反 Force_command.md「禁止越权扩大范围」
2. **仅路径迁移，不改业务逻辑**（选定）：严格按 Refactor.md Phase 6 定义执行，保持行为不变，只改 import 路径

### 选定方案与理由
按 Refactor.md Phase 6 既定计划执行，只做路径迁移 + import 更新，使用 `@common/layer-tree` 和 `@cesium-domain/layers/toc-adapters/cesiumTocActions` alias 替换深层相对路径。

---

## 修改内容

### 1. 新建 `domains/common/layer-tree/` 完整子树

迁移自 `composables/map/toc/` 和 `components/Layer/`：

| 源路径 | 目标路径 |
|--------|----------|
| `composables/map/toc/protocol.js` | `domains/common/layer-tree/protocol.js` |
| `composables/map/toc/factory.js` | `domains/common/layer-tree/factory.js` |
| `composables/map/toc/index.js` | `domains/common/layer-tree/index.js` |
| `composables/map/toc/actions/contextActionManager.js` | `domains/common/layer-tree/actions/contextActionManager.js` |
| `composables/map/toc/actions/selectionManager.js` | `domains/common/layer-tree/actions/selectionManager.js` |
| `composables/map/toc/actions/exportService.js` | `domains/common/layer-tree/actions/exportService.js` |
| `composables/map/toc/menu/contextMenu.js` | `domains/common/layer-tree/menu/contextMenu.js` |
| `composables/map/toc/menu/commandDispatcher.js` | `domains/common/layer-tree/menu/commandDispatcher.js` |
| `components/Layer/TOCTreeItem.vue` | `domains/common/layer-tree/components/TOCTreeItem.vue` |
| `components/Layer/LayerPropertiesDialog.vue` | `domains/common/layer-tree/components/LayerPropertiesDialog.vue` |
| `components/Layer/SharedResourceTreeItem.vue` | `domains/common/layer-tree/components/SharedResourceTreeItem.vue` |

内部 import 沿用相对路径（同域内已验证正确）。
`TOCTreeItem.vue` 内 `import { isValidLabel } from '@/utils/biz'` 由 linter 自动修正为 alias 形式，予以保留。

### 2. 新建 `domains/cesium/layers/toc-adapters/`

迁移 Cesium 侧 TOC 动作分流器：

| 源路径 | 目标路径 |
|--------|----------|
| `composables/map/toc/actions/cesiumTocActions.js` | `domains/cesium/layers/toc-adapters/cesiumTocActions.js` |

内部 import 从相对路径 `'../../../../stores/layer/cesiumLayerNodeBuilder'` 改为 alias `'@/stores/layer/cesiumLayerNodeBuilder'`。

### 3. 更新消费方 import

- `components/Layer/TOCPanel.vue`：
  - `from '../../composables/map/toc'` → `from '@common/layer-tree'`
  - `from '../../composables/map/toc/actions/cesiumTocActions'` → `from '@cesium-domain/layers/toc-adapters/cesiumTocActions'`
  - `from './SharedResourceTreeItem.vue'` → `from '@common/layer-tree/components/SharedResourceTreeItem.vue'`
  - `from './LayerPropertiesDialog.vue'` → `from '@common/layer-tree/components/LayerPropertiesDialog.vue'`
- `components/Layer/LayerPanel.vue`：
  - `from './TOCTreeItem.vue'` → `from '@common/layer-tree/components/TOCTreeItem.vue'`
- `composables/map/index.js`：移除 `export * from './toc';`（toc 目录已不存在）
- `utils/layerExportService.js`：
  - `from '../composables/map/toc'` → `from '@common/layer-tree'`

### 4. 更新 `domains/common/index.js`

从空 stub 更新为 layer-tree 子模块的 barrel re-export：

```js
/**
 * domains/common
 * 跨 OL / Cesium 的应用壳、公共 UI、协议与共享能力入口。
 *
 * Phase 6 迁入图层树 UI / 协议 / 菜单（layer-tree/）。
 */

export * from './layer-tree/index.js';
```

---

## 修改原因

- **架构一致性**：TOC 是跨引擎公共 UI，协议层属于 `common` 域；Cesium 侧分流器属于 `cesium/layers/`。
- **依赖方向正确**：`common` 不依赖 `ol`/`cesium`，只被二者依赖，符合既定依赖规则。
- **可维护性**：集中管理 TOC 协议与 UI，避免后续在多个位置重复修改。

---

## 影响分析

- **行为无变化**：纯路径迁移，业务逻辑零修改。
- **构建影响**：`composables/map/index.js` 移除 toc re-export 后，未引入新的构建错误。
- **遗留风险**：`components/Layer/TOCPanel.vue`、`LayerPanel.vue`、`LayerControlPanel.vue`、`AttributeTable.vue` 仍保留在 `components/Layer/` 下（Agent B 的 Phase 5 迁移范围，其 `MapContainer.vue` 仍通过旧相对路径引用这些组件，暂不移动以避免冲突）。

---

## 性能影响

无。纯路径迁移，运行时行为与包体大小不变。

---

## 测试计划

- [x] `npm run build` 通过（仅 Agent A Phase 3 遗留的 `vectorUtils.js` 缺失错误，非本任务范围）
- [ ] `npm run dev` 实机验证：TOC 树渲染、右键菜单、图层显隐切换、重命名、拖拽排序
- [ ] Cesium 模式切换后 TOC 面板动作分流正常
- [ ] KML 导出功能正常

注：构建已通过；实机功能验证留待用户合并后执行。

---

## 文件清单

### 新增 / 迁移（git mv）
- `frontend/src/domains/common/layer-tree/index.js`
- `frontend/src/domains/common/layer-tree/protocol.js`
- `frontend/src/domains/common/layer-tree/factory.js`
- `frontend/src/domains/common/layer-tree/components/TOCTreeItem.vue`
- `frontend/src/domains/common/layer-tree/components/LayerPropertiesDialog.vue`
- `frontend/src/domains/common/layer-tree/components/SharedResourceTreeItem.vue`
- `frontend/src/domains/common/layer-tree/actions/contextActionManager.js`
- `frontend/src/domains/common/layer-tree/actions/selectionManager.js`
- `frontend/src/domains/common/layer-tree/actions/exportService.js`
- `frontend/src/domains/common/layer-tree/menu/contextMenu.js`
- `frontend/src/domains/common/layer-tree/menu/commandDispatcher.js`
- `frontend/src/domains/cesium/layers/toc-adapters/cesiumTocActions.js`

### 修改
- `frontend/src/domains/common/index.js` — barrel re-export layer-tree
- `frontend/src/components/Layer/TOCPanel.vue` — 更新 4 处 import
- `frontend/src/components/Layer/LayerPanel.vue` — 更新 1 处 import
- `frontend/src/composables/map/index.js` — 移除 toc re-export
- `frontend/src/utils/layerExportService.js` — 更新 1 处 import

### 文档
- `README.md` — 版本 V3.4.91 → V3.4.92（3 处：项目简介、版本表、页脚）
- `Docs/Guide/CHANGELOG.md` — 新增 V3.4.92 条目
- `Docs/Guide/frontend-structure.md` — 已同步（layer-tree 子树 + cesiumTocActions 已在树中）
- `Docs/LLM_record/26-07/2026-07-29/2026-07-29-v3492-frontend-domains-phase6.md` — 本文件

---

## 遗留与风险

1. **Agent A Phase 3 遗留**：`kmlLoader.js` 引用 `@cesium-domain/composables/dataImport/vectorUtils.js`，但 `vectorUtils.js` 仍在 `composables/dataImport/vectorUtils.js`（未被 Agent A 移动）。本任务不处理，待 Agent A 完成后修复。
2. **`components/Layer/` 残留**：`TOCPanel.vue`、`LayerPanel.vue`、`LayerControlPanel.vue`、`AttributeTable.vue` 仍保留在旧路径，待后续 Phase 统一迁移。
3. **未执行 git commit**：按 Force_command.md 规定，版本控制决策权归用户，Agent 只准备改动。
