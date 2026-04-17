# TOC 右键菜单与数据结构说明

本文档用于后续 TOC 架构重构，覆盖当前实现中的：

- 组件链路与职责
- TOC 节点数据结构
- 右键菜单 key 与 action 事件映射
- 多选与批量操作的当前实现
- 导出能力（含新增 KML）

## 1. 组件链路

当前链路：

1. `TOCTreeItem.vue`：单个树节点渲染、右键菜单、命令分发
2. `LayerPanel.vue`：树根渲染与基础事件转发（folder 展开/可见性联动）
3. `TOCPanel.vue`：聚合业务事件（导出、样式、属性表、批量操作）
4. `HomeView.vue`：桥接到 `MapContainer.vue`
5. `MapContainer.vue`：调用 `layerExportService.js` 等底层能力

## 2. TOC 节点数据结构（当前）

节点由 `useLayerStore.ts` 中 `buildLayerTree` / `toLayerNode` 生成。

### 2.1 通用字段

- `id: string`
- `name: string`
- `displayName: string`
- `type: 'folder' | 'layer'`
- `visible: boolean`
- `children: Node[]`
- `expanded: boolean`
- `level: number`
- `showCheckbox: boolean`

### 2.2 layer 节点字段

- `featureCount: number`
- `labelVisible: boolean`
- `raw: any`（原始图层对象）
- `draggable: boolean`
- `droppable: boolean`
- `actions: ActionConfig`

### 2.3 folder 节点字段

- `indeterminate: boolean`

### 2.4 ActionConfig（核心）

- 布尔能力：
  - `attribute`
  - `style`
  - `label`
  - `copyCoordinates`
  - `toggleLayerCRS`
  - `exportLayerData`
  - `openAoiPanel`
  - `zoom`
  - `remove`
- 事件映射：
  - `viewEvent`, `viewPayload`
  - `zoomEvent`, `zoomPayload`
  - `removeEvent`, `removePayload`
  - `soloEvent`, `soloPayload`

## 3. 右键菜单 key -> action 映射

菜单定义在 `TOCTreeItem.vue` 的 `menuItems`，执行逻辑在 `handleMenuCommand`。

### 3.1 单图层命令（已存在 + 本次新增）

- `view` -> 动态 `viewEvent`
- `solo` -> 动态 `soloEvent`
- `attribute` -> `open-attribute-table`
- `style` -> `set-style-target`
- `open-aoi-panel` -> `open-amap-aoi-panel`
- `label` -> `toggle-layer-label-visibility`
- `copy` -> `copy-layer-coordinates`
- `convert-wgs84-to-gcj02` -> `toggle-layer-crs`
- `convert-gcj02-to-wgs84` -> `toggle-layer-crs`
- `export-csv` -> `export-layer-data` (`format=csv`)
- `export-txt` -> `export-layer-data` (`format=txt`)
- `export-geojson` -> `export-layer-data` (`format=geojson`)
- `export-kml` -> `export-layer-data` (`format=kml`)  **新增**
- `zoom` -> 动态 `zoomEvent`
- `remove` -> 动态 `removeEvent`

### 3.2 多选控制命令（本次新增）

- `multi-select-add` -> `multi-select-add-layer`
- `multi-select-remove` -> `multi-select-remove-layer`
- `multi-select-clear` -> `multi-select-clear`

### 3.3 批量操作命令（本次新增）

统一发出：`batch-layer-operation`

- `batch-show` -> `{ operation: 'set-visible', visible: true }`
- `batch-hide` -> `{ operation: 'set-visible', visible: false }`
- `batch-export-csv` -> `{ operation: 'export', format: 'csv' }`
- `batch-export-txt` -> `{ operation: 'export', format: 'txt' }`
- `batch-export-geojson` -> `{ operation: 'export', format: 'geojson' }`
- `batch-export-kml` -> `{ operation: 'export', format: 'kml' }`
- `batch-remove` -> `{ operation: 'remove' }`

## 4. 多选状态模型（当前实现）

多选状态托管在 `TOCPanel.vue`：

- `multiSelectedLayerIds: string[]`
- 规范化：去重 + 非空 + 存在性校验
- 图层集变化时自动剪枝（防止删除图层后残留脏选择）

批量执行策略：

- 若右键节点本身属于多选集合，则对整组执行
- 否则退化为仅当前节点执行（防误操作）

## 5. 导出能力说明（更新后）

导出入口：

- `TOCTreeItem.vue` / `TOCPanel.vue` -> `HomeView.vue` -> `MapContainer.vue` -> `layerExportService.js`

当前支持格式：

- `csv`
- `txt`
- `geojson`
- `kml`（本次新增）

KML 实现要点：

- 使用 OpenLayers `KML` writer
- 以 `featureProjection=EPSG:3857` 写出到 `dataProjection=EPSG:4326`
- 保留要素 `name` 与来源元信息字段

## 6. 重构建议（面向下一步）

建议将 TOC 的“数据模型”与“菜单协议”抽离为独立 schema：

1. `toc-node.schema.ts`
2. `toc-menu.schema.ts`
3. `toc-command-dispatcher.ts`

这样可以让：

- TOCTreeItem 仅负责渲染
- 菜单能力由 schema 驱动
- 批量逻辑集中在 dispatcher，避免组件层膨胀
