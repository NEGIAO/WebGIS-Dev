# 2026-07-27 属性表 Shift range 多选链路核验 + 高亮查找器扫描兜底（规划 P0-4 B3）

- **日期与时间**：2026-07-27 15:40
- **任务等级**：L2
- **版本**：V3.4.59
- **执行说明**：B3 原口径为「Shift range 透传未实测，下游 range 语义未验证」。本会话开工时发现
  range 端到端代码已由前序会话实施完毕（AttributeTable / useMapUIEventHandlers 内含 B3 标注注释，
  但无对应日志、CHANGELOG 与规划勾选——与 B1 同模式的「代码先行、收尾中断」遗留）。本会话职责：
  ①逐环静态核验全链路语义；②修复核验中发现的一处真实缺口（高亮链路要素查找器无扫描兜底）；③补齐全部收尾记录。

---

## 问题分析

### 核心症状（B3 原始登记）

属性表 Shift 点击透传 `mode='range'`，但下游 `featureStyleStore` 的 range 语义未经验证——若下游未实现，
Shift 多选会静默无效或行为不可预期。

### 核验结论：链路已完整，五环语义一致

| 环节 | 文件 | 语义 | 结论 |
|---|---|---|---|
| 1. 表侧解析 | `AttributeTable.vue` | Shift 点击捕获锚点（`selectedFeatureId`，在覆盖前捕获）→ `resolveRangeFeatureIds` 按 **displayRows 当前展示顺序**（排序/搜索/视图筛选后）取锚点→目标连续区间；锚点失效返回空数组降级 replace 单选；首次进入多选先发 replace 规整 hover 残留 | ✅ |
| 2. 事件接线 | `MapContainer.vue` 模板 | `@focus-feature="handleAttributeTableFocusFeature"`（工厂注入 `batchHighlightManagedFeatures`） | ✅ |
| 3. UI handler | `useMapUIEventHandlers.js` | `mode='range' && featureIds[]` → `batchHighlightManagedFeatures({mode:'append'})`；无 featureIds 退化单要素透传 | ✅ |
| 4. 批量高亮 | `useManagedFeatureHighlight.js` | append → 逐要素以 `mode:'range'` 进 store（查不到的要素单跳不中断） | ✅ |
| 5. store 语义 | `useFeatureStyleStore.ts` | `range` = 保留旧高亮、仅追加未高亮项；`lastSelectedFeatureKey` 每次更新（连续 Shift 为「自上次点击行续接」的并集语义，与 store 文档契约一致）；`resolveRangeTargets` 回调全库无调用方——表侧已自行解析区间，该回调按设计闲置，非缺陷 | ✅ |

辅助语义同步核验：多选进行中 hover 预览暂停（防 replace 清空累积集合）、图层切换/面板重开重置多选态、
地图侧 Shift+点击走单要素 append（地图无行序概念，追加语义合理）。

### 核验中发现的真实缺口（本次唯一代码改动）

**高亮链路的要素查找器无扫描兜底**：`MapContainer.vue` 传给 `createManagedFeatureHighlightFeature` 的
内联 `findManagedFeature` 仅 `source.getFeatureById(featureId)`；而缩放链路
`useManagedFeatureOperations.findManagedFeature` 为 `getFeatureById` + 全量扫描（`getId`/`get('_gid')`）双策略。
B1 日志亦按「getFeatureById / _gid 扫描」描述 map 侧解析——文档与高亮链路实现存在漂移。

**触发面**：要素 ID 仅存在于属性（如 OBJECTID/FID，未经导入侧 `ensureFeatureId` 写入 OL id）的存量要素，
属性表解析出属性 ID，高亮/多选按该 ID `getFeatureById` 必 miss → 单选/Ctrl/Shift 高亮**静默丢目标**（缩放正常，
因缩放链路有扫描兜底）。主流路径（导入/绘制均过 `ensureFeatureId`，B1 写回补齐无 ID 数据）不受影响，属边缘存量数据防御。

### 受影响模块

属性表 → 地图高亮全链（单选 replace / Ctrl toggle / Shift range 批量 / hover 预览共用同一查找器）。

## 修改内容

`MapContainer.vue` 内联 `findManagedFeature`：`getFeatureById` 未命中时退化全量扫描
（`String(getId() ?? get('_gid') ?? '')` 比较，`??` 保数值 0 合法 ID，与 B1 语义对齐），与缩放链路解析策略同构。

## 修改原因

B3 是 P0-4 B 簇仅剩两项之一（另一项 B4）；核验中发现的查找器漂移会使 B1/B3 的修复效果在边缘数据上静默失效，
属同簇联测应修项（规划 B1 行明确「+ 高亮链路联测」）。

## 影响范围

仅 2D 托管图层高亮查找路径。`getFeatureById` 命中时行为与改前逐位相同（扫描仅在 miss 后触发），
主流数据零行为变化；此前静默丢高亮的属性 ID 存量要素恢复可达。

## 解决方案

| 方案 | 说明 | 结论 |
|---|---|---|
| a. 内联查找器补扫描兜底（选定） | 与缩放链路同构，改动 1 处 ~10 行，miss 才扫描无热路径成本 | ✅ |
| b. 抽公共 findManagedFeature 模块供两处复用 | 更彻底，但涉及工厂初始化顺序调整（highlight 工厂先于 operations 工厂创建），属结构优化，留 P3-1 容器瘦身时顺并 | ✖ 本次 |

## 性能指标

未实测（功能性修复）。理论：命中路径零开销；miss 路径 O(n) 扫描仅对边缘数据触发，且与缩放链路既有成本同级。

## 测试方案

### Agent 已执行

- 五环链路静态核验（上表，逐文件读源码比对契约）；
- `resolveRangeTargets` 全库调用方扫描（确认闲置属设计而非断链）；
- 改动文件 + B3 链路 4 文件 ESLint：`node node_modules/eslint/bin/eslint.js` exit 0 零告警
  （MapContainer.vue / AttributeTable.vue / useMapUIEventHandlers.js / useManagedFeatureHighlight.js / useFeatureStyleStore.ts）；
- 导入侧 `ensureFeatureId` 与 B1 `readExistingFeatureId`/`ensureStableFeatureId` 候选链一致性复核。

### 待用户实机验证（B3 首次实测清单）

1. 导入含多行数据的图层 → 打开属性表 → 单击行 A → **Shift+点击行 E** → 地图上 A–E 区间全部要素高亮（红色系）；
2. 对任意列**排序后**重复步骤 1 → 区间按**表格当前展示顺序**取行（而非原始行序）；
3. 搜索/视图筛选缩小行集后 Shift 区间 → 仅当前展示行参与区间；
4. Shift 区间后再 **Ctrl+点击**区间内某行 → 仅该行取消高亮（其余保留）；
5. 无前置选中（关表重开）直接 Shift+点击 → 降级为单行选中（不报错）；
6. 连续两段 Shift（A→C，再 F→H）→ 两段并集高亮（本实现为续接并集语义，确认符合预期后可关账；若期望 Excel 式「第二段替换第一段」需另立小项）；
7. 【查找器修复】若有属性含 OBJECTID 但要素未 setId 的存量数据：点选行 → 高亮不再静默失效。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/components/Map/MapContainer.vue` | 高亮链路内联 `findManagedFeature` 补 getId/_gid 全量扫描兜底（与缩放链路同构） |
| `README.md` | 版本三处 → V3.4.59 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.4.59 条目 |
| `Docs/TODO/bugfix-optimization-plan.md` | P0-4 表 B3 勾选 ✅ V3.4.59 |

## 遗留与风险

- **实机联测未做**（沙盒无 vite 运行时），上方 7 步清单待用户执行；第 6 步的「并集 vs 替换」语义需用户确认偏好；
- B 簇仅剩 **B4**（3D 视域筛选）——B4 完成且 B1/B3 实机验证通过后，按规划打 **V3.5.0** 里程碑；
- 顺带发现（只记不改，按 §2.5）：`HomeView.vue` 的 `handleHighlightAttributeFeature` → `mapContainerRef.highlightManagedFeature` 直连路径不带 featureIds 批量分支（该路径现无 range 调用方，若未来复用需走 `handleAttributeTableFocusFeature`）；查找器公共化留 P3-1 顺并；
- 本任务与今日「版本对账」会话并行，版本号 V3.4.59 于写入前经 README/CHANGELOG 双重 grep 复核无撞号。
