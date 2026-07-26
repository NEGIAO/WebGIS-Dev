# 属性表交互二轮优化：hover 节流 / 多选透传 / 双击缩放 / 列宽拖拽 / 搜索防抖（V3.4.20）

## 日期和时间

2026-07-26 19:25

## 修改内容

- hover 高亮事件 rAF 合并 + 同值去重：行间快速划过不再产生「清除→高亮」事件风暴与地图闪烁；清除高亮改为鼠标离开整个表格滚动区时触发（行间移动由下一行 replace 覆盖）。
- Ctrl/⌘（toggle 多选）与 Shift（range 区间）点击模式透传：下游 `highlightManagedFeature` 本就支持 `mode` 参数，属性表此前固定发 replace，现按修饰键透传。
- 双击行缩放到要素：接通 `zoomToManagedFeature` 既有契约（此前在处理器中仅 `void` 占位保留引用），单击聚焦仍不缩放。
- 列宽拖拽：表头右缘 8px 热区拖拽调宽（80–600px 钳制），宽度写入 `fieldConfig.width` 随数据集生命周期保留（不参与内容签名，增量同步不受影响）；未拖拽的列保持弹性宽度。
- 搜索输入 200ms 防抖：大数据集下避免每击键触发全量行过滤；清除按钮立即生效不等防抖。
- 边角修复：切换图层时重置 hover 去重基准，保证新图层首次悬停必发送高亮。

## 修改原因

用户在 V3.4.18 稳定性修复后要求继续优化。本轮聚焦交互体验与事件开销：hover 事件风暴、下游已支持却未接线的多选/缩放契约（接口理顺的延续）、专业属性表的基础体验（列宽、搜索防抖）。

## 事件逻辑链条分析

### 核心症状

1. 鼠标快速划过表格行时，每行触发 mouseenter+mouseleave 各一次高亮事件（清除→高亮交替），地图侧样式反复重建，视觉闪烁；
2. 下游高亮引擎支持 `mode: toggle/range`、缩放函数 `zoomToManagedFeature` 存在，但属性表从未使用（处理器中 `void zoomToManagedFeature` 占位）；
3. 表头「resizable」类名与 grip 占位元素存在但无实现，列宽不可调；
4. 搜索框每击键同步 store 触发全量过滤。

### 根本原因

属性表 UI 层落后于下游能力契约：事件未做频控、既有 mode/zoom 契约未接线、装饰性 DOM 未实现对应交互。

### 受影响模块

- `frontend/src/components/Layer/AttributeTable.vue`（交互层全部改动）
- `frontend/src/stores/useAttrStore.ts`（fieldConfig.width 类型 + setFieldWidth + 重建保留宽度）
- `frontend/src/composables/map/features/useMapUIEventHandlers.js`（focus 处理器接通 zoom）

### 优化处理

- rAF 单帧合并 + lastSent 去重的 hover 管线；清除时机上移到滚动区 mouseleave；
- 点击 mode 解析（ctrl/meta→toggle、shift→range）随 payload 透传，focus/highlight 双事件保持既有结构；
- 双击行发 `focus-feature { zoom: true }`，处理器仅在 zoom 标记时调用视图 fit；
- 列宽状态归属 fieldConfig（与别名/可见性同生命周期），签名不含 fieldConfig 故与增量同步正交；
- 搜索本地 ref + 200ms 防抖 + store 外部变更回写，清除路径即时同步。

## 优化解决方案（实施步骤）

1. 核对下游契约（highlightManagedFeature 的 mode 分支、zoomToManagedFeature 签名、rows[].geometry 无外部消费者）；
2. store 三处小改（类型、重建保留、setFieldWidth action）；
3. 组件模板/脚本/样式按「优化处理」实施；
4. ESLint 验证与边角修复（图层切换重置 hover 基准）。

## 性能指标

- hover 事件：从每行 2 次（enter+leave）降为每帧最多 1 次且同值不发；行间连续划过 N 行由 2N 次 emit 降为 ≤N 次（去重后通常远小于 N）。
- 搜索过滤：从每击键全量过滤降为停顿 200ms 后一次。

## 测试方案

**静态验证（已执行）**：ESLint 对 useAttrStore.ts / AttributeTable.vue / useMapUIEventHandlers.js 零告警。

**人工验收步骤**：

1. 快速上下划过表格行：地图高亮平滑跟随、无闪烁；鼠标移出表格区域后高亮清除；
2. Ctrl+点击多行：地图上多要素同时高亮（toggle）；Shift+点击：区间高亮（range）；普通点击恢复单选；
3. 双击任意行：地图视图缩放至该要素范围；单击仅高亮不缩放；
4. 拖拽表头右缘：列宽实时变化，松手后保持；切换到其他图层再切回，宽度仍在；数据刷新（改样式等）不丢宽度；
5. 搜索框连续输入：停顿约 0.2s 后表格过滤；点 × 立即恢复全量。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Layer\AttributeTable.vue
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\stores\useAttrStore.ts
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\useMapUIEventHandlers.js
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.20）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.20 版本段）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-attribute-table-interaction-round2.md（本日志）

（无文件增删，前端文件树无结构变更。）
