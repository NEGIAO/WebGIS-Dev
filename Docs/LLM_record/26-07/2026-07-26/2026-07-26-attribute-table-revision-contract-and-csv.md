# 属性表三轮优化：图层内容修订号契约 + CSV 导出（V3.4.22）

## 日期和时间

2026-07-26 19:37

## 修改内容

- 建立图层内容修订号（revision）契约：`useManagedLayerRegistry.emitUserLayersChange` 出站时按「features 数组引用 + featureCount + name」单点判定内容变化并递增 revision，随 payload 下发；属性表 `attrStore.syncLayers` 据此走快路径——revision 未变的图层**完全跳过快照构建**（normalize + 行映射 + searchText 序列化），不再只是拦截下游重渲染。
- 新增独立工具模块 `frontend/src/utils/attributeTableCsv.ts`：RFC 4180 转义（逗号/引号/换行/对象 JSON 化/空值）、UTF-8 BOM（Excel 中文兼容）、安全文件名（非法字符过滤 + 60 字截断 + 分钟级时间戳）、Blob 下载。
- 属性表工具栏新增「导出CSV」按钮：导出当前视图（已筛选 + 已排序的行 × 可见列，表头用别名），空表禁用。
- 注册表修订戳随图层删除清理（防 Map 泄漏）；attrStore 侧 revision 缓存随幽灵数据集一并清理。

## 修改原因

V3.4.20 遗留的两项明确待办：`buildLayerDataset` 在每次图层事件仍全量构建（V3.4.18 的内容签名只拦住了下游替换，构建本身照跑）；属性表缺导出能力。用户确认继续实施。

## 事件逻辑链条分析

### 核心症状

任意图层事件（可见性/透明度/样式调整等与属性数据无关的操作）触发 `user-layers-change` 后，attrStore 对**每个**图层重跑完整快照构建，大数据图层下每次操作都有可感知的 CPU 开销。

### 根本原因

上游 payload 缺少「内容是否变化」的信号，下游只能构建后再比较（签名兜底）。

### 受影响模块

- `frontend/src/composables/useManagedLayerRegistry.js`（唯一出站漏斗，契约落点）
- `frontend/src/stores/useAttrStore.ts`（快路径消费方）
- `frontend/src/components/Layer/AttributeTable.vue` + `frontend/src/utils/attributeTableCsv.ts`（导出）

### 优化处理

- 关键前置调查：grep 全部 `features`/`featureCount` 变更点（useGeometryEdit / useCoordinateSystemConversion / useMapSearchAndCoordinateInput / useRouteRendering / 注册表本身），确认所有内容级变更均**整体重新赋值** features 数组（`serializeManagedFeatures` 返回新数组）——因此在唯一出站漏斗比较引用即可覆盖全部现有变更路径，无需改动任何变更点、无漏改风险。
- 防御性设计：revision 缺失（旧 payload/其他来源）时自动回退 V3.4.18 的「全量构建 + 签名」慢路径；契约注意事项已写入注册表模块注释（未来若出现"就地改属性不重建数组"的写法必须重建数组或扩展比较维度）。
- CSV 模块按仓库规范封装为独立 TS 纯函数文件，组件仅做一行编排调用。

## 优化解决方案（实施步骤）

1. 探查 `user-layers-change` 发射源与全部内容变更点，确认"重新赋值数组"不变式；
2. 注册表实现修订戳 Map + `resolveLayerRevision` + 删除清理，payload 增加 `revision` 字段；
3. attrStore `upsertDatasetSnapshot` 增加 revision 快路径（先于构建判断），保留签名慢路径兜底；
4. 新建 CSV 工具模块 + 工具栏按钮 + 禁用态样式；
5. ESLint 与转义规则断言验证；修复 BOM 字面量被 `no-irregular-whitespace` 拒绝的问题（改为 `String.fromCharCode(0xfeff)` 显式生成）。

## 性能指标

- 内容未变图层在图层事件下的属性表开销：从「全量构建 O(总字符数) + 签名比较」降为「一次数值比较」；样式/可见性/透明度/排序类操作对属性表的 CPU 影响趋近于零。
- 内容变化时成本不变（构建 + 签名照常），正确性由双层防线（revision 快路径 + 签名兜底）保证。

## 测试方案

**静态与逻辑验证（已执行，全部通过）**：

- ESLint：attributeTableCsv.ts / AttributeTable.vue / useAttrStore.ts / useManagedLayerRegistry.js 零告警；
- CSV 转义断言：空值→空串、含逗号/引号/换行包裹与引号翻倍、对象 JSON 化后必被包裹、混合行拼接结果逐字符匹配；
- 文件字节级检查：模块内无 BOM 字面量残留（由 `String.fromCharCode(0xfeff)` 运行时生成）。

**人工验收步骤**：

1. 打开大图层属性表，反复切换其他图层可见性/透明度/样式：属性表无卡顿、滚动与选中不受影响（快路径生效）；
2. 绘制新增要素 / 几何编辑删除要素：属性表行集合正确更新（revision 递增触发重建）；
3. 重命名图层：属性表标题同步（name 参与修订戳）；
4. 「导出CSV」：筛选 + 排序后导出，Excel 打开中文无乱码，列头为别名、含逗号/引号的值不串列；空表时按钮禁用。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\useManagedLayerRegistry.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\stores\useAttrStore.ts
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\utils\attributeTableCsv.ts（新增）
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Layer\AttributeTable.vue
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md（utils 树补录新模块）
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.22）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.22 版本段）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-attribute-table-revision-contract-and-csv.md（本日志）
