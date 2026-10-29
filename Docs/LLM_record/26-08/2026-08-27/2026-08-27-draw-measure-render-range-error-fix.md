# 2026-08-27 — 修复 Cesium 绘制/测量标签 NaN 坐标导致的渲染崩溃（RangeError: Invalid array length）

> 归并于主版本 **V3.5.32**（2026-08-27）同一天更新记录。

## 基本信息

- **日期和时间**：2026-08-27 10:20
- **日志作者**：AI Agent（Cline）
- **变更类型**：Bug 修复（渲染崩溃级 P0）

## 事件逻辑链条分析

1. **核心症状**

   在 3D 场景进入「绘制/测量」交互（点/线/面/测距/测面）后，鼠标移动或点击过程中 Cesium 渲染中断，控制台抛出：

   ```
   An error occurred while rendering. Rendering has stopped.
   RangeError: Failed to set the 'length' property on 'Array': Invalid array length
   RangeError: Invalid array length
       at Vbt (Cesium.js:13177:9062)
       at oY.createPotentiallyVisibleSet (Cesium.js:13177:11217)
       ...
       at Ei.render
   ```

   崩溃发生在 Cesium 内部视锥裁剪 `createPotentiallyVisibleSet`（tile 潜在可见集计算），属于渲染管线底层的数组分配失败，**并非业务代码直接抛错**。

2. **根本原因**

   定位到 `frontend/src/domains/cesium/composables/draw/useCesiumDrawMeasure.js` 中的 `updatePreviewText()`（约 264~294 行）。

   该函数在**每次 MOUSE_MOVE / LEFT_CLICK** 都会取出当前已拾取点集 `positions = dynamicPositions()`，并试图据此刷新预览 Label 的位置。但此处存在一个严重的**数据类型误用**：

   - 本文件所有取点（`pickEarthPoint`，见 `scenePicker.js`）返回的都是 **Cesium `Cartesian3`** 对象（成员 `x/y/z`），即 `active.clicks` / `active.cursorPos` 均为 `Cartesian3`。
   - 而 `updatePreviewText()` 却按 **OpenLayers 的 `[lng, lat, h]` 数组语义**去下标访问：

     ```js
     const [lng, lat, h = 0] = positions[0];          // positions[0] 是 Cartesian3，[0] 为 undefined
     ...
     const last = positions[positions.length - 1];    // Cartesian3
     const lng = (last[0] + prev[0]) / 2;              // undefined
     const h = (last[2] || 0 + prev[2] || 0) / 2;      // NaN
     ...
     const lngs = positions.map((p) => p[0]);          // 全 undefined
     ```

   - 于是 `C.Cartesian3.fromDegrees(lng, lat, h)` 传入的全是 `NaN`，生成一个 **`position = NaN`** 的预览 Label 实体并挂到 `viewer.entities`。
   - Cesium 渲染该含 `NaN` 位置实体的 **bounding volume / 视锥裁剪** 时，内部数组长度分配越界抛出 `RangeError: Invalid array length`，且发生在 `render()` 阶段，最终"Rendering has stopped"。

   ┌─────┐   ┌────────────────────┐   ┌──────────────────────────┐   ┌────────────────────────────┐
   │pick │ → │ Cartographic3 点集   │ → │ 误当 [lng,lat,h] 数组下标  │→ │ Cartesian3.fromDegrees(NaN)  │
   └─────┘   └────────────────────┘   └──────────────────────────┘   └────────────────────────────┘
                                                                          │
        Cesium render 崩溃 ──────────────  boundingVolume NaN ────────────┘
        (createPotentiallyVisibleSet: Invalid array length)

3. **影响的模块**

   - `frontend/src/domains/cesium/composables/draw/useCesiumDrawMeasure.js`（绘制/测量引擎，三维「绘制/测量」面板交互）
   - Cesium 3D 渲染管线（渲染中断影响整个场景）

4. **优化解决方案（选定 B）**

   - 在 `secOnPreviewText()` 中，明确 `positions` 为 `Cartesian3` 点集，**禁用数组下标拆解**，改用 **Cesium `Cartesian3` 语义运算**：
     - 点（Point）：对首插点 `Cartesian3.clone`；
     - 线（LineString / MeasureDistance）：取折线末端点的克隆；
     - 面（Polygon / MeasureArea）：用现有 `centroidOf(...)`（已经对 `Cartesian3` 各坐标求均值）作为质心锚点。
   - 全程 `Number.isFinite` 防御，杜绝 `NaN` / `Infinity` 进入实体 `position`。
   - 保持原有 CallbackProperty 骨架与 `dynamicPositions()` 语义，仅修正预览 Label 锚点计算。

5. **性能指标**

   - 该修复消除每帧 MOUSE_MOVE 创建 NaN 实体的操作，避免渲染崩溃（原场景直接导致停止渲染）。
   - 无正收益数值，属于正确性修复（NaN 实体不再产生）。

6. **测试方案**

   - 环境：本地 `npm run dev`，浏览器进入 3D（Cesium）地图。
   - 步骤：进入「绘制/测量」面板 → 分别测试 点 / 线(测距) / 面(测面) → 鼠标移动 + 点击 + 双击/右击结束。
   - 预期结果：预览 Label 位于图形附近正确位置，无「An error occurred while rendering」、无 `RangeError: Invalid array length`，渲染持续正常。

7. **修改的文件路径**

   - `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\cesium\composables\draw\useCesiumDrawMeasure.js`
   - 本日志文件