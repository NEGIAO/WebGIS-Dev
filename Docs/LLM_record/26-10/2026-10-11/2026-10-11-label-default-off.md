# 2026-10-11 图层数据标注默认关闭 → V3.6.12

## 日期与时间

2026-10-11（会话内执行）

## 任务等级

**L2 常规**（功能默认值变更：多文件改动 + 日志 + 版本号；依据 Force_command §1）

> 依据 Force_command §0：用户指令「默认关闭、手动打开」（P1）要求遵循本规范（P2），无冲突。

## 问题分析

### 核心症状

- 图层管理中的数据标注默认自动开启：数据导入/搜索落图后地图上直接压满文字，用户想要默认关闭、需要时手动打开。

### 根本原因

- `createManagedVectorLayer` 的 `labelVisible = !!autoLabel` 把「标注能力（autoLabel）」与「初始可见（labelVisible）」绑死；
  导入链路（`useLayerDataImport` 两处）、搜索落图（`useMapSearchAndCoordinateInput` 一处）、坐标输入
  （`shouldAutoLabel = payload.autoLabel !== false`）又显式传 `autoLabel: true`，导致新图层必带标注。
- `useManagedLayerRegistry.emitUserLayersChange` 的 `labelVisible: item.labelVisible !== false` 让缺省上游也被视为可见；
  而渲染侧 `useManagedLayerStyle` 要求 `autoLabel && labelVisible` 双真才会绘制——当前两者恒为真。

### 受影响模块

| 模块 | 文件 |
|---|---|
| 图层创建（能力与可见解耦） | `domains/ol/layer/composables/useCreateManagedVectorLayer.js` |
| 数据导入默认 | `domains/ol/data-import/composables/useLayerDataImport.js`（2 处 `autoLabel: true`） |
| 搜索/坐标落图默认 | `domains/ol/search/composables/useMapSearchAndCoordinateInput.js`（搜索结果、坐标输入） |
| 登记/树/菜单（缺省兜底） | `useManagedLayerRegistry.js`、`stores/layer/layerTreeBuilder.ts`、`common/layer-tree/components/TOCTreeItem.vue`、`common/layer-tree/menu/commandDispatcher.js` |
| 手动开关链路（保持可用） | `useUserLayerActions.setUserLayerLabelVisibility`、`contextMenu` 开启/关闭标注、`HomeView.handleToggleLayerLabelVisibility` |

### 候选方案对比

| 方案 | 说明 | 结论 |
|---|---|---|
| A. 调用点全部改 `autoLabel:false` | 简单，但 `autoLabel` 同时是能力闸门；`canToggleLabel` 依赖它，关掉后菜单「开启标注」消失 | 否决 |
| B. 解耦：`autoLabel` 保留为能力（默认 true），新增 `labelVisible` 初始默认 false | 渲染仍需双真；关闭只影响首屏可见，菜单仍可手动打开；调用点无需逐个改 true→false | **选定** |
| C. 加用户偏好/配置项 | 需求只是改默认值，引入配置属于范围膨胀 | 否决 |

## 修改内容

1. `useCreateManagedVectorLayer.js`：`autoLabel` 默认改 `true`（能力常开，保证菜单可用），新增 `labelVisible=false`（初始不可见）；
   删除 `labelVisible = !!autoLabel` 推导，`managedLayerState/labelLayer/登记记录` 统一用 `initialLabelVisible`。
2. `useManagedLayerRegistry.js`：`emitUserLayersChange` 缺省兜底改为 `autoLabel: item.autoLabel !== false`（能力缺省开）、
   `labelVisible: item.labelVisible === true`（可见缺省关）。
3. `layerTreeBuilder.ts`：`toLayerNode.labelVisible` 改为 `=== true`（缺省关）；`layerHelpers.canToggleLabel` 不动（能力闸）。
4. `TOCTreeItem.vue`：`isLabelVisible` 改为 `=== true`；`commandDispatcher.js` LABEL 事件改为 `visible: !(===true)`（缺省点一次即打开）。
5. `useMapSearchAndCoordinateInput.js`：坐标输入新增 `shouldLabelVisible = payload.labelVisible === true` 并透传（搜索结果/坐标落图默认无标注）。
6. `useUserLayerActions.js`：`setUserLayerLabelVisibility` 注释同步解耦语义（逻辑不动，仍只改 `labelVisible`）。

## 修改原因

- 用户明确要求：默认关闭自动标注，改为手动打开，减少首屏文字压盖。

## 影响范围

- 2D 托管矢量图层（导入/搜索/坐标/空间分析/区划走同一创建漏斗，首屏默认无标注）；
  绘制（已 `autoLabel:false`）、路线（label 能力已关）、栅格（无标注）不受影响。
- TOC 右键「开启标注/关闭标注」文案随 `labelVisible` 翻转，行为不变。

## 解决方案

1. `useCreateManagedVectorLayer`：签名新增 `labelVisible`（默认 `false`），不再 `!!autoLabel` 推导；
   `autoLabel` 默认改为 `true`（能力常开，保证菜单可用），文档注释同步。
2. 导入/搜索/坐标三处显式 `autoLabel:true` 保持（能力），不再隐式决定可见；`shouldAutoLabel` 语义改为能力位。
3. `useManagedLayerRegistry.emitUserLayersChange`：`labelVisible: item.labelVisible === true`（缺省视为关闭）。
4. `layerTreeBuilder.toLayerNode`：`labelVisible: layer.labelVisible === true`；
   `TOCTreeItem.isLabelVisible`：`props.node?.labelVisible === true`；
   `commandDispatcher` LABEL 事件：`visible: !(node?.labelVisible === true)`。
5. `layerHelpers.canToggleLabel` 保持 `!!autoLabel`（能力闸），不受默认关闭影响。
6. 渲染侧 `useManagedLayerStyle` 不动（仍 `autoLabel && labelVisible` 双真才画）。

## 性能指标

- 未实测（默认值变更，无渲染路径改动）。

## 测试方案

### Agent 已执行

- `node --check` ×5（创建漏斗/登记/动作/搜索输入/菜单分发）全部通过。
- ESLint（5 个改动 JS 文件）零告警。
- `python Scripts/CheckStructureTree.py`：文档 486 · 磁盘 486 · 零漂移 ✅。
- `python Scripts/CheckConfigRegistry.py`：全部通过 ✅（无新增配置 key）。
- `tsc --noEmit`：零输出（无新增类型错误）✅。

### 待用户实机验证

1. 导入任意 GeoJSON/SHP：落图后无标注；右键「开启标注」→ 出现；「关闭标注」→ 消失。
2. 地名搜索落图、坐标输入落图：同上默认无标注、可手动打开。
3. 存量标注开启的图层：开关一次后状态正常翻转。

## 变更文件清单

- `frontend/src/domains/ol/layer/composables/useCreateManagedVectorLayer.js` — 能力与可见解耦 + 默认关闭
- `frontend/src/domains/ol/layer/composables/useManagedLayerRegistry.js` — 登记缺省兜底默认关闭
- `frontend/src/domains/ol/stores/layer/layerTreeBuilder.ts` — 树节点缺省默认关闭
- `frontend/src/domains/common/layer-tree/components/TOCTreeItem.vue` — 菜单可见态缺省默认关闭
- `frontend/src/domains/common/layer-tree/menu/commandDispatcher.js` — LABEL 翻转逻辑对齐新缺省
- `frontend/src/domains/ol/search/composables/useMapSearchAndCoordinateInput.js` — 坐标输入透传 `labelVisible`
- `frontend/src/domains/ol/layer/composables/useUserLayerActions.js` — 手动开关注释同步
- `Docs/LLM_record/26-10/2026-10-11/2026-10-11-label-default-off.md` — 本日志
- `README.md` ×3 + `Docs/Guide/CHANGELOG.md` — V3.6.12

## 遗留与风险

- 行政区划（`DistrictManager` 自绘 style 常带文字、走 `district-boundary` 独立链路）本次不动；
  若用户也要默认关闭区划名，需单独排期（其开关链路与托管图层不同）。
