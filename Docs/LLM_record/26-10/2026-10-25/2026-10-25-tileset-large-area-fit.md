# 3D Tiles 大面积 / 大起伏贴地优化（P0 + P1）

## 元信息

- **日期与时间**：2026-10-25 13:35
- **任务等级**：**L3**（算法与能力扩展；先出方案经用户确认，再实施）
- **版本**：**V3.6.26**（与同日另两项修复合并计入，过程中曾记为 3.6.28）
- **用户确认**：实施方案选「P0 + P1」，默认分位选 **p75**
- **方案文档**：`Docs/Architecture/2026-10-25-tileset-large-area-terrain-fit-plan.md`

---

## 一、问题分析

### 1.1 症状

大面积（城市级 / 区县级）且地形起伏大的区域，3D Tiles 贴地后**局部悬空、局部埋入**，观感不可接受。

### 1.2 根因：目标函数选错，而非算法写错

原实现取 `d_i = terrain_i − baseH_i` 的**中位数**作为整块刚性平移量：

```js
const offset = sortedPercentile(diffs, 0.5);   // ← 中位数
```

**单一刚性平移在数学上无法同时满足「不嵌入」与「不悬空」**——二者下界由 `d_i` 的跨度决定：跨度 S 的场景，任何平移量都必然产生合计约 S 的嵌入+悬空。中位数最小化的是平均绝对误差，把误差均分到两侧，于是**一半基底埋在坡里**。

### 1.3 量化证据

模拟：10 km × 10 km、高差约 400 m、256 采样点（`d` 跨度 343 m、MAD 62.2 m），复刻源码分位口径：

| 策略 | offset | 嵌入率 | 最大埋深 | 最大悬空 | 平均偏差 |
|---|---|---|---|---|---|
| **原：p50** | −10.2 m | **50.0%** | **147.8 m** | 195.2 m | 62.6 m |
| **新：p75** | +54.0 m | 25.0% | 83.7 m | 259.3 m | 78.3 m |
| p90 | +72.9 m | 10.2% | 64.8 m | 278.3 m | 91.0 m |
| max（零嵌入） | +137.6 m | 0% | 0 m | **343.0 m** | 151.0 m |

选 p75 而非 p90 的理由：p90 虽把嵌入率压到 10%，但最大悬空升到 278 m，谷地出现明显"空中楼阁"；p75 在两类缺陷间更均衡。

### 1.4 受影响模块

| 模块 | 影响 |
|---|---|
| `tilesetLoader.estimateTerrainOffset` | 估算目标函数 |
| `bvToBaseSample` | 采样缺面积信息，密集小瓦片会主导分位 |
| TOC 菜单 / 动作链路 | 无「按视野贴合」入口 |

---

## 二、解决方案（用户已确认 P0 + P1 / p75）

| 方案 | 能否消除局部失配 | 成本 | 决策 |
|---|---|---|---|
| **P0 面积加权分位数 + 残余高差画像** | 缓解（50%→25%） | 0.5 人日 | ✅ 本次实施 |
| **P1 区域化贴合（当前视野）** | 局部消除 | 1 人日 | ✅ 本次实施 |
| P2 分区多 tileset 实例 | 近似消除 | 3–5 人日 | 保留，需先测内存 |
| P3 离线切分数据 | 彻底 | 5+ 人日 | 保留，长期 |
| 零嵌入 / 自定义着色器位移 | — | — | 已排除（观感更差 / 风险过高） |

### 实施步骤

1. `estimateTerrainOffset` 改面积加权分位数，默认 `DEFAULT_FIT_QUANTILE = 0.75`；
2. `bvToBaseSample` 三路补 `weight`（region：`Δlon·Δlat·cos(lat)`；box：`4·|hX|·|hY|`；sphere：`πr²`）；
3. 输出 `residual`（跨度 / 嵌入率 / 最大埋深 / 最大悬空 / regionApplied），跨度 > 50 m 时 toast；
4. `estimateTerrainOffset` 支持 `region` 过滤，命中 < `MIN_REGION_SAMPLES`(8) 退回整幅；
5. 打通 `terrain-fit-view` 菜单 → 动作 → store → adapter → `GroundCtx.region` → 策略 → loader。

---

## 三、修改内容

| 文件 | 改动 |
|---|---|
| `dataImport/loaders/tilesetLoader.js` | ① `estimateTerrainOffset` 重写为面积加权分位数 + 区域过滤 + residual；② 新增 `weightedQuantile`；③ `bvToBaseSample` 三路补 `weight`；④ `fitTilesetToTerrain` / `refitTilesetToTerrain` 接受 `region`/`fitQuantile`，返回并持久化 `fitResidual`；⑤ 新增常量 `DEFAULT_FIT_QUANTILE` / `MIN_REGION_SAMPLES` / `RESIDUAL_WARN_SPAN` |
| `terrain/groundPlacementCapabilities.ts` | `GroundCtx` 增加 `region?` / `fitQuantile?` |
| `terrain/strategies/tilesetGroundStrategy.ts` | `fit` 透传 `region` / `fitQuantile` |
| `stores/cesiumLayers.ts` | adapter 接口 + store 方法 `fitToTerrainInView` 并暴露 |
| `components/CesiumContainer.vue` | adapter 实现：`camera.computeViewRectangle` → 度制 bbox → `fitGroundPlacement({...,region})` |
| `stores/cesiumLayerNodeBuilder.ts` | `actions.fitTerrainInView = supportsFit && type==='3dtiles'` |
| `common/layer-tree/protocol.js` | 新增 `FIT_TERRAIN_IN_VIEW: 'fit-terrain-view'` |
| `common/layer-tree/components/TOCTreeItem.vue` | 能力位 `canFitTerrainInView` |
| `common/layer-tree/menu/contextMenu.js` | 菜单项「贴合到当前视野」 |
| `common/layer-tree/menu/commandDispatcher.js` | `terrain-fit-view` 事件 |
| `cesium/layers/toc-adapters/cesiumTocActions.js` | `terrain-fit-view` 分支 |

---

## 四、修改原因

1. **换目标函数是唯一零架构代价的改善**：p75 直接把最刺眼的「一半被埋」降到 1/4，且不改变渲染与数据结构。
2. **面积加权修正采样偏差**：`decimate` 按树序遍历抽稀，密集小瓦片（远处 LOD 低层）数量占优会拉低分位；按水平足迹面积加权后，大块叶子代表真实占地。
3. **残余高差必须显式化**：单一平移的局限是数学必然，不告知会让用户反复尝试「贴合地形」而无改善（§2.8 禁止静默降级）。
4. **区域化贴合性价比最高**：用户关注的是当前视野，采样范围收敛后跨度从 343 m 降到该区实际高差，现有估算已足够；无需 N 份 tileset 实例的内存代价。

---

## 五、影响范围

| 维度 | 是否受影响 | 说明 |
|---|---|---|
| 小范围平坦数据 | 几乎不变 | MAD 小 → 分位数 ≈ 中位数（p75 略高） |
| 大范围高起伏数据 | 明显改善 | 嵌入率 50% → 25%，并有残余高差提示 |
| 导入耗时 | 略增 | 多一次分位数排序（O(n log n)，n ≤ 256）+ 一次 toast |
| TOC 菜单 | 新增一项 | 仅 `3dtiles` 且 `supportsFit` 时出现 |
| 数据/渲染架构 | 不变 | 仍为单 tileset + 单 modelMatrix |
| 配置面 | 无 | 未新增配置 key |
| 兼容性 | 向后兼容 | `region`/`fitQuantile` 均有缺省值 |

---

## 六、性能指标

- 估算：`weightedQuantile` 单次线性扫描 + 排序，n ≤ 256，可忽略。
- 区域化贴合：采样点更少（视野过滤），`sampleTerrainMostDetailed` 批量更小，反而更快。
- **未实测**真机帧率/导入耗时。

---

## 七、测试方案

### 7.1 Agent 已执行

| 项目 | 命令 | 结果 |
|---|---|---|
| 估算策略量化 | 模拟脚本（复刻源码分位口径） | ✅ p50 嵌入率 50% / p75 25% / p90 10.2% |
| 类型检查 | `tsc --noEmit` | ✅ 0 error |
| ESLint | 10 个改动文件 | ✅ 0 problems |
| 构建 | `npx vite build --outDir dist-fit2` | ✅ 4401 modules / 18.48s |
| 门禁 | CheckStructureTree / CheckConfigRegistry | ✅ 通过 |

### 7.2 待用户实机验证

| 步骤 | 预期结果 |
|---|---|
| 1. 导入大面积、高起伏 3D Tiles | 贴地后**明显不再「一半埋」**；控制台出现 `[贴地] 区域高差 XXX m，分位 p75 → 估算嵌入率 XX%…`；同时弹 toast 提示可用「贴合到当前视野」 |
| 2. 相机飞到某个 1–2 km² 子区，右键 →「贴合到当前视野」 | 该区贴合明显改善（最大埋深从百米级降到十米级） |
| 3. 相机拉到全国尺度（视野覆盖整个数据）后执行同一操作 | 行为与「贴合地形」接近（视野≈全幅），不报错 |
| 4. 相机平视地平线（无有效地面矩形）时执行 | 提示「不支持」而非崩溃 |
| 5. 小范围平坦数据（如单个小区） | 与修复前观感一致 |

---

## 八、变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/cesium/composables/dataImport/loaders/tilesetLoader.js` | 估算器重写 + 权重 + 残余画像 + 区域过滤 |
| `frontend/src/domains/cesium/composables/terrain/groundPlacementCapabilities.ts` | `GroundCtx` 扩展 |
| `frontend/src/domains/cesium/composables/terrain/strategies/tilesetGroundStrategy.ts` | 透传 region/分位 |
| `frontend/src/domains/cesium/stores/cesiumLayers.ts` | `fitToTerrainInView` |
| `frontend/src/domains/cesium/components/CesiumContainer.vue` | adapter 实现（视野矩形） |
| `frontend/src/domains/cesium/stores/cesiumLayerNodeBuilder.ts` | 能力位 |
| `frontend/src/domains/common/layer-tree/protocol.js` / `components/TOCTreeItem.vue` / `menu/contextMenu.js` / `menu/commandDispatcher.js` | 菜单与命令链路 |
| `frontend/src/domains/cesium/layers/toc-adapters/cesiumTocActions.js` | 动作分流 |
| `README.md` / `Docs/Guide/CHANGELOG.md` / `Docs/TODO/bugfix-optimization-plan.md` | 版本（合并计入 V3.6.26）与待办 |
| `Docs/Architecture/2026-10-25-tileset-large-area-terrain-fit-plan.md` | 方案文档（新增） |
| `Docs/LLM_record/26-10/2026-10-25/2026-10-25-tileset-large-area-fit.md` | 本日志（新增） |

---

## 九、遗留与风险

1. **单一平移的固有局限仍在**：p75 只是把矛盾从「埋 50%」移到「埋 25% + 悬空 259 m」。要彻底解决必须空间分段（P2/P3）。
2. **P2 的关键未知项未验证**：N 份 tileset 实例是否导致瓦片内容重复下载/驻留（Cesium 无跨实例内容共享），预计内存 N 倍。建议先写最小验证脚本实测再立项。
3. **区域化贴合是「就地重算」而非「分区记忆」**：对 A 区贴合后，再对 B 区贴合会整体平移，A 区又失配。当前语义是「把整块数据对齐到你正在看的那一片」，符合直觉但需在 UI 文案上说清（现菜单名已表达「贴合到当前视野」）。
4. **`fitResidual` 仅落记录，未在 TOC 面板展示**：本次用 toast 承载（避免新增 UI 组件）。若要常驻展示，需在 TOC 卡片增加一行（属 UI 改动，另行评估）。
5. **未做真机验证**：贴地观感与右键入口均需实机确认。
