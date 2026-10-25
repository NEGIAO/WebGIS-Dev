# 3D Tiles 沉到地形以下修复 + 图层动作可诊断性加固

## 元信息

- **日期与时间**：2026-10-25 12:50
- **任务等级**：**L2**（Bug 修复，3 个文件；未触及架构分层，不升 L3）
- **版本**：V3.6.25 → **V3.6.26**（同日三项修复合并计入该版本）
- **用户报告**：① 三维数据导入后，TOC 里透明度、调整高程等 action 都无法控制场景；② 3D Tiles 贴地逻辑有问题，**沉到地形下面了**。

---

## 一、问题分析

### 1.1 核心症状

| # | 症状 | 可观测性 |
|---|---|---|
| S1 | 3D Tiles 导入后整体位于地形之下 | 视觉可见，用户直接报告 |
| S2 | TOC 透明度滑杆、高程滑杆拉动后场景无变化 | 无报错、无 toast，纯静默 |

### 1.2 根因（S1，已定位）

`estimateTerrainOffset`（`tilesetLoader.js:375`）把 `sampleTerrainBatch` 的返回**无条件**视为真实地形：

```js
const results = await sampleTerrainBatch(viewer, Cesium, cartos);
if (!results) return null;
for (...) {
    const t = Number(results[i]?.height);
    if (!Number.isFinite(t)) continue;
    terrainHs.push(t);
    diffs.push(t - samples[i].baseH);   // ← 0 - baseH 也照收
}
const offset = sortedPercentile(diffs, 0.5);
```

而 `sampleTerrainBatch` 的「有效」判据只有「≥30% 采样点 height 为有限数」。**0 是有限数**。于是当地形瓦片尚未就绪、provider 以椭球 0 占位返回时：

```
est.offset = 0 − baseH  →  负值（如 −52 m）
tileset.modelMatrix = buildVerticalTranslation(center, −52)
```

整栋模型被**向下平移 52 m**，沉入真实地形之下。触发窗口包括：刚切换地形、自定义 `GeoTerrainProvider` 首帧、`sampleTerrainMostDetailed` 失败后回落显式层级仍取到占位值。

这解释了 S1，也**很可能**解释 S2——见 1.4。

### 1.3 根因（S2，链路核验结论：未发现断点）

逐段核验 TOC 动作到场景句柄的完整链路，全部通过：

| 环节 | 核验结果 |
|---|---|
| `TOCTreeItem` 滑杆载荷 | `opacity` 已归一到 0~1（`Math.min(1, Math.max(0, ...))`），无单位错配 |
| `TOCPanel` → `useTreeActionDispatcher` | `cesiumLayersStore` 已作为 ctx 注入（`TOCPanel.vue:720`），非 undefined |
| `handleCesiumLayerTreeAction` | `cesium:` 前缀剥离正确（`:40-42`），两种事件形态由 `readPayloadField` 兼容 |
| `cesiumLayers.setOpacity` | `3dtiles` 在 `OPACITY_SUPPORTED_TYPES` 内（`:22-35`），记录由 `syncFromImport` 建档（容器 `watch` 于 `:464`，`immediate: true`） |
| `registerAdapter` | 位于 setup 顶层（`CesiumContainer.vue:559`），非条件分支内，随组件创建即注册 |
| `findImportRecord` | 在 `loadedDataSources` 中按 id 精确匹配，3dtiles 记录由 loader 写入（`tilesetLoader.js:813-822`，`entity: tileset`） |
| `setRecordOpacity` | 有 `3dtiles` 专属分支，经 `applyTilesetMaterial` 重建外观，alpha 融入 shader |
| `setTilesetHeight` | `dataImport.setTilesetHeight` 已导出（`useCesiumDataImport.js:855`），按 `target − initialBaseHeight` 施加 ECEF 平移 |

**结论**：静态链路完整，不存在「方法缺失 / id 错配 / 单位错配 / adapter 未注册」这类结构性断点。

### 1.4 S1 与 S2 的关联假设（**标注为假设，未证实**）

若瓦片集沉在地形之下（S1），则它在视野中**不可见**。此时：
- 拉动透明度 → 不可见对象变半透明，肉眼无反馈；
- 拉动高程滑杆（范围 ±100 m）→ 若沉没深度接近或超过 100 m，仍在土里，肉眼无反馈。

即 **S2 可能是 S1 的感知后果，而非独立的第二条故障**。此假设可被一次实验证伪：修复 S1 后若 S2 消失，则假设成立。

### 1.5 受影响模块

| 模块 | 影响 |
|---|---|
| `dataImport/loaders/tilesetLoader.js` | 贴地偏移计算、重贴地、材质构建 |
| `stores/cesiumLayers.ts` | TOC 动作入口（静默 no-op） |
| `components/CesiumContainer.vue` | adapter 层（静默 no-op） |

---

## 二、解决方案

### 2.1 S1 方案对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **A. 全 0 采样判据** | 采样全 ≈0 且基底显著非 0 → 视为不可用，`return null` 保持原位 | 精确打击「椭球占位」这一具体失败态；不改变正常路径；失败可回退（用户可手动贴合） | 无法覆盖「部分点为 0」的混合批次 | ✅ **采纳** |
| B. 改 `sampleTerrainBatch` 判据 | 把 0 高程视为无效样本 | 从源头统一 | 海平面地形（真实 0 m）会被误判为无效，影响面过大 | ❌ |
| C. 延迟贴地到 `tileset.ready` 之后 | 用事件驱动重试 | 时序最正确 | 需要改造 loader 生命周期，属 L3；且 ready 不等于地形就绪 | ⚠️ 后续 |
| D. 关闭自动贴地 | 只保留手动 | 最安全 | 丧失核心体验 | ❌ |

### 2.2 S2 方案对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **A. 静默 no-op 改为显式告警** | 在「记录缺失 / adapter 未注册 / 类型不支持」处 `console.warn` | 不改变行为；下次复现时控制台直接指出断点；符合 §2.8 | 需用户复现并回传控制台 | ✅ **采纳** |
| B. 加 toast 提示 | 用户可见 | 无需控制台 | 正常滚动滑杆时会刷屏；且这些分支理论上不可达，属内部一致性错误 | ❌ |
| C. 直接按猜测改链路 | 例如强制 `supportsOpacity=true` | 看起来"修了" | 无证据支撑，属臆造（§2.6） | ❌ |

### 2.3 实施步骤

1. `estimateTerrainOffset` 增加全 0 采样判据；
2. 清理 `fitTilesetToTerrain` / `refitTilesetToTerrain` 的重复 `console.warn` 与重复赋值；
3. `cesiumLayers.setVisible / setOpacity / setBaseHeight` 三处静默 return 改为带上下文的 `console.warn`；
4. 容器 `setBaseHeight` 的 `if (!record) return` 同上；
5. `refitTilesetToTerrain` 两个死初值改为无初值声明（消除 2 个 ESLint error）。

---

## 三、修改内容

| 文件 | 改动 |
|---|---|
| `composables/dataImport/loaders/tilesetLoader.js` | ① `estimateTerrainOffset` 新增「全 0 采样 + 基底 >1 m」防御，命中返回 null；② 合并 `fitTilesetToTerrain` 重复 warn/注释块；③ 合并 `refitTilesetToTerrain` 重复 `offset` 赋值；④ 死初值改无初值 |
| `stores/cesiumLayers.ts` | `setVisible` / `setOpacity` / `setBaseHeight` 三处：记录缺失、类型不支持透明度、adapter 未注册 → 显式 `console.warn`（含 id / type / 数值上下文） |
| `components/CesiumContainer.vue` | adapter `setBaseHeight` 记录缺失 → `console.warn` |

---

## 四、修改原因

1. **负向平移是破坏性的**：贴地算法的默认假设是「采样可信」。一旦采样是椭球占位，算法会主动把模型推入地下，比「不贴地」更糟。宁可不贴（保持原始位置 + 提示用户手动贴合），也不能贴错方向。
2. **静默降级无法排查**：S2 的所有失败分支原本都是 `return`，用户与开发者都拿不到任何线索，只能靠读代码猜。改为 `console.warn` 是零行为风险的可观测性投入（§2.8）。
3. **拒绝臆造**：链路核验通过后，没有证据支持任何具体改动，因此不对 S2 做"看起来像修好了"的猜测性修改，改为布设观测点。

---

## 五、影响范围

| 维度 | 是否受影响 | 说明 |
|---|---|---|
| 3D Tiles 导入贴地 | 是 | 仅在「采样全 0 且基底非 0」时改变行为（由错误下压改为保持原位） |
| 正常贴地路径 | 否 | 判据不命中时逻辑完全不变 |
| TOC 动作行为 | 否 | 仅增加日志，返回值与执行路径未变 |
| 控制台噪音 | 轻微 | 仅在异常分支输出，正常路径不触发 |
| 配置 / 部署面 | 否 | 零改动 |
| 构建 | — | 4401 modules 通过 |

---

## 六、性能指标

不适用（新增判据为 O(n) 数组遍历，n ≤ 采样点数，可忽略）。**未实测**。

---

## 七、测试方案

### 7.1 Agent 已执行

| 项目 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `tsc --noEmit` | ✅ 0 error |
| ESLint | `eslint cesiumLayers.ts tilesetLoader.js CesiumContainer.vue` | ✅ 0 problems（顺带消除 2 个既有 error） |
| 构建 | `npx vite build --outDir dist-fix` | ✅ 4401 modules / 24.25s |
| 链路核验 | 逐段读码（见 §1.3 表） | ✅ 静态无断点 |

### 7.2 待用户实机验证

| 步骤 | 预期结果 |
|---|---|
| 1. 开启真实地形 → 导入一个倾斜摄影 3D Tiles | 瓦片集**不再沉入地下**；若地形确实未就绪，控制台出现「地形采样全为 0…跳过自动贴地」，模型保持导入原位 |
| 2. 地形加载完成后，右键该图层 →「贴合地形」 | 模型贴合地表 |
| 3. 拖动 TOC 透明度滑杆 | 瓦片集透明度实时变化 |
| 4. 拖动高程滑杆 | 瓦片集整体升降，不跳变 |
| 5. **若 3/4 仍无反应**：把控制台全部输出（尤其 `[cesiumLayers]` / `[CesiumContainer]` / `[贴地]` 前缀）回传 | 日志会直接指出断点：`找不到记录`（store 无档）／`adapter 未注册`（容器未挂载）／`该类型不支持透明度`（判据不一致）／`找不到句柄记录`（loadedDataSources 无此 id） |

---

## 八、变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/cesium/composables/dataImport/loaders/tilesetLoader.js` | 全 0 采样防御 + 重复块清理 + 死初值 |
| `frontend/src/domains/cesium/stores/cesiumLayers.ts` | 三处静默 no-op → 显式告警 |
| `frontend/src/domains/cesium/components/CesiumContainer.vue` | adapter setBaseHeight 缺失句柄告警 |
| `README.md` | 版本号三处 → V3.6.26，版本表 3 行 |
| `Docs/Guide/CHANGELOG.md` | 顶部追加 V3.6.26 条目 |
| `Docs/LLM_record/26-10/2026-10-25/2026-10-25-tileset-sink-and-toc-actions.md` | 本日志（新增） |

---

## 九、遗留与风险

1. **S2（action 无效）未确证修复**：静态链路完整，无证据支持具体改动。本次只做了可观测性加固。**若用户复验后仍复现，请回传控制台输出**，据日志可一次定位。已在 TODO 登记。
2. **「全 0 采样」判据的边界**：若地形真实为 0 m（海平面）且数据基底也接近 0，判据不命中，行为不变；若地形真实为 0 m 但数据基底在 50 m（数据本身抬高放置），判据会命中并跳过自动贴地——此时**跳过是正确的**（自动下压 50 m 反而错）。极端场景下用户需手动贴合。
3. **未覆盖「部分点为 0」的混合批次**：`sampleTerrainBatch` 允许 ≥30% 有效，混合批次仍可能拉低中位数。彻底解决需要按点位有效性加权或剔除 0 值簇，属算法改进，已记 TODO。
4. **延迟贴地方案（C）未实施**：把贴地推迟到地形瓦片真正加载完成是更根本的解，但需要事件驱动的 loader 生命周期改造，属 L3，需方案批准。
5. **未做真机验证**：地形未就绪窗口在 Node 侧无法构造，本次结论以代码路径推导 + 构建验证为准。
