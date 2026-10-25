# GLB 高程滑杆无效修复（ModelGraphics 无 height 属性）

## 元信息

- **日期与时间**：2026-10-25 13:01
- **任务等级**：**L2**（Bug 修复，3 个文件；不改架构分层）
- **版本**：**V3.6.26**（与同日另两项修复合并计入，过程中曾记为 3.6.27）
- **用户报告**：「调整高程对于 glb 数据还是没有用，给我修复」

---

## 一、问题分析

### 1.1 核心症状

TOC 中拖动 GLB 图层的「调整高程」滑杆，模型**零位移**，无报错、无 toast。

### 1.2 根因（有实测证据，非推测）

`setModelHeightOffset`（`gltfLoader.js`）原实现：

```js
entity.model.heightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;
entity.model.height = offset;   // ← 关键错误
```

**Cesium 的 `ModelGraphics` 没有 `height` 属性。** 证据：解析本仓库实际使用的 Cesium 1.146 构建（`public/cesium/Cesium.js`，5.5 MB），以 `incrementallyLoadTextures`（ModelGraphics 独有属性）为锚点提取类体属性集：

```
articulations, clampAnimations, clippingPlanes, color, colorBlendAmount,
colorBlendMode, customShader, distanceDisplayCondition,
enableVerticalExaggeration, environmentMapOptions,
heightReference, heightReferenceSubscription,      ← 只有 heightReference
imageBasedLightingFactor, incrementallyLoadTextures, lightColor,
maximumScale, minimumPixelSize, nodeTransformations, rotation,
runAnimations, scale, shadows, show, silhouetteColor, silhouetteSize,
translation, uri
```

`_height` / `_heightSubscription` **均不存在**。对照 `BillboardGraphics`（另一处 `this._heightReference` 命中点）则明确含 `height` / `heightSubscription`——说明这是 ModelGraphics 与 Billboard 的差异，不是解析遗漏。

因此 `entity.model.height = offset` 是**给对象凭空加一个非 schema 字段**，Cesium 从不读取它。实际生效的只有 `heightReference`（把模型从 CLAMP 切成 RELATIVE_TO_GROUND），而高度恒为 0 → 滑杆拖动看起来完全无反应。

### 1.3 补充背景：GLB 从来没有可用的高程通道

追溯 V3.6.24 之前：该滑杆走 `handleDataSetHeight → dataImport.setTilesetHeight`，而 `setTilesetHeight` 首行即：

```js
if (!record || record.type !== '3dtiles') { console.warn(...); return; }
```

**GLB 直接被排除**。V3.6.24 的贴地统一化补了 `modelGroundStrategy`，把 GLB 接到 `setModelHeightOffset`——但落到同一个无效属性上，问题只是从「走不到」变成「走到也无效」。

### 1.4 受影响模块

| 模块 | 影响 |
|---|---|
| `dataImport/loaders/gltfLoader.js` | `setModelHeightOffset` 无效赋值；两处导入建档缺 `modelHeightOffset` |
| `terrain/strategies/modelGroundStrategy.ts` | `fit` 传 `0` 会把语义高度压平 |
| TOC 高程滑杆 | GLB 类型完全失效 |

---

## 二、解决方案

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **A. 高度写入 position.z** | `RELATIVE_TO_GROUND` 时 z = 离地高度；`CLAMP_TO_GROUND` 时 z 被忽略 | 用 Cesium 官方语义，随地形跟随；与 `heightReference` 天然配套 | 需从当前位置反解经纬度 | ✅ **采纳** |
| B. 用 `model.translation` | 局部系平移 `Cartesian3(0,0,offset)` | 不动 position | 平移方向是**模型局部 Z**，模型自带旋转时方向不对；且 translation 与 position 语义重叠，易双重偏移 | ❌ |
| C. 重建 Entity | 按新高度重新 `entities.add` | 最直观 | 丢失引用（TOC 句柄、选中态、后续动作全断）；闪烁 | ❌ |
| D. 升级 Cesium | 换到有 `height` 的版本 | — | 本项目 Cesium 走 CDN 全局垫片，升级面极大；且 `height` 语义本就该由 position 承担 | ❌ |

### 实施步骤

1. `setModelHeightOffset` 改为读写 `position`（`Cartographic.fromCartesian` → `Cartesian3.fromRadians`）；
2. 首次调用自愈式记录 `record.modelBaseHeight`（当前 position 高度）作为 reset 基准；
3. 保留负值（兑现 `offsetRange.min = -20` 的下沉区间）；
4. `loadGLTF` / `loadGltfFromUrl` 建档补 `modelHeightOffset` + `modelBaseHeight`；
5. `modelGroundStrategy.fit` 偏移未知时改传 `null`。

---

## 三、修改内容

### 3.1 `gltfLoader.js` · `setModelHeightOffset`

| 项 | 改前 | 改后 |
|---|---|---|
| 高度载体 | `entity.model.height`（无效） | `entity.position` 的 z 分量 |
| 语义 | 无 | `RELATIVE_TO_GROUND` → z = 离地高度；`CLAMP_TO_GROUND` → 原点贴地 |
| reset 基准 | 硬编码 0 | `record.modelBaseHeight`（首次调用时自愈式捕获） |
| 负值 | `Number(meters) \|\| 0` 后直接使用 | 显式允许负值（能力表 min −20） |
| 返回值 | 句柄缺失 false | 句柄缺失 / 位置不可解析 false |

### 3.2 导入建档

`loadGLTF`（本地文件）与 `loadGltfFromUrl`（远程直链）的 record 均补：

```js
modelHeightOffset: Math.max(0, Number(coords?.height) || 0),
modelBaseHeight:   Math.max(0, Number(coords?.height) || 0),
```

作用：TOC 滑杆初值等于导入语义高度（此前恒为 0，首次拖动会跳变）；reset 有明确基准。

### 3.3 `modelGroundStrategy.fit`

```js
const current = Number(ctx.record?.modelHeightOffset);
const target = Number.isFinite(current) ? current : null;   // 未知 → null（恢复原始高度）
```

原实现 `Number(...) || 0` 会在导入期（`applyOnImport`，gltf 为 AUTO 模式）把语义高度 50 m 的模型直接压到地面。

---

## 四、修改原因

1. **属性不存在就必须换载体**：`height` 不是 ModelGraphics schema 的一部分，任何"再写一次"的修法都无效。position.z 是 Cesium 里唯一被 `heightReference` 解释的高度载体。
2. **保持地形跟随**：若改用 `CLAMP_TO_GROUND + 绝对海拔`，模型将不再随地形起伏；`RELATIVE_TO_GROUND + position.z` 同时满足"跟随地形"与"整体抬升"两个诉求，这正是 `modelGroundStrategy` 头注释声明的设计意图。
3. **不能压平语义高度**：`fit` 传 0 会把按真实海拔放置的模型压到地面，属于修 A 破 B，必须一并纠正。

---

## 五、影响范围

| 维度 | 是否受影响 | 说明 |
|---|---|---|
| GLB 高程滑杆 | 是（修复） | 从"完全无效"变为按米位移 |
| GLB 导入初始位置 | 否 | 导入时 position.z 仍等于语义高度；`fit` 改为恢复该值，不改变结果 |
| GLB 贴地（地形跟随） | 否 | 仍为 RELATIVE_TO_GROUND |
| 3D Tiles 高程 | 否 | 走 `setTilesetHeight`，未改动 |
| 其他 model.height 调用点 | 无 | 全仓已无 `model.height =` 写入残留（已 grep 核验） |
| 配置 / 部署面 | 否 | 零改动 |
| 构建 | — | 4401 modules 通过 |

---

## 六、性能指标

不适用（每次滑杆回调一次 `Cartographic.fromCartesian` + `fromRadians`，O(1)）。**未实测**。

---

## 七、测试方案

### 7.1 Agent 已执行

| 项目 | 命令 / 方式 | 结果 |
|---|---|---|
| Cesium API 事实核验 | 解析 `public/cesium/Cesium.js` 中 ModelGraphics 类体属性集 | ✅ 确认无 `height`，有 `heightReference` |
| 残留写入扫描 | `grep -rn "model\.height\s*="` | ✅ 仅注释命中，无代码写入 |
| 类型检查 | `tsc --noEmit` | ✅ 0 error |
| ESLint | `eslint gltfLoader.js modelGroundStrategy.ts` | ✅ 0 problems |
| 构建 | `npx vite build --outDir dist-gltf` | ✅ 4401 modules / 13.40s |

### 7.2 待用户实机验证

| 步骤 | 预期结果 |
|---|---|
| 1. 导入一个 GLB（无嵌入坐标，自动放在相机中心） | 模型出现在视野中心，TOC 高程滑杆初值为 0 |
| 2. 拖动高程滑杆到 +50 | 模型整体上升约 50 m，随地形起伏仍保持跟随 |
| 3. 拖到 −10 | 模型微微下沉（允许负值区间） |
| 4. 右键「恢复原始高程」 | 回到导入时高度 |
| 5. 导入一个嵌入语义高度 50 m 的 GLB | 初始就在 50 m，**不会被压到地面**；滑杆初值显示 50 |

---

## 八、变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/cesium/composables/dataImport/loaders/gltfLoader.js` | `setModelHeightOffset` 重写为 position.z 载体；两处建档补高度字段 |
| `frontend/src/domains/cesium/composables/terrain/strategies/modelGroundStrategy.ts` | `fit` 偏移未知时传 null |
| `README.md` | 版本号三处 → V3.6.26（合并计入），版本表 3 行 |
| `Docs/Guide/CHANGELOG.md` | 顶部 V3.6.26 条目内追加第 ② 项 |
| `Docs/LLM_record/26-10/2026-10-25/2026-10-25-gltf-height-offset-fix.md` | 本日志（新增） |

---

## 九、遗留与风险

1. **未做真机验证**：模型是否按米位移需实机确认；本次结论基于 Cesium 构建的属性集核验与代码路径推导。
2. **`modelBaseHeight` 的自愈捕获时机**：首次调用 `setModelHeightOffset` 时取当时 position 高度作为基准。若在首次调用前用户已通过其他途径（如重定位弹窗）改变过位置，基准会取到新位置——该路径下 `useCesiumDataImport` 会重建 record 并显式写入 `modelHeightOffset`，故实际不受影响。
3. **负高度的视觉表现**：`RELATIVE_TO_GROUND` + 负 z 会让模型沉入地表以下（能力表允许 −20，用于"坐进地面"）。若产品认为不应允许下沉，改 `offsetRange.min = 0` 即可，属配置层调整。
4. **其他类型的高程通道未复核**：本次只修 GLB。若 `tif` 等类型也存在类似「写了不存在的属性」的隐患，需单独排查（已记 TODO）。
