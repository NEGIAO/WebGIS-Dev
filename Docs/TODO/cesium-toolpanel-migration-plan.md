# CesiumToolPanel 功能迁移至统一 TOC 实施方案

> 起草：2026-08-25 ｜ 状态：**待用户批准** ｜ 预估总工作量：3 个阶段，每阶段半天~一天
> 前置文档：`Docs/TODO/unified-layer-management-refactor-plan.md`

---

## 一、审计结论摘要

### 1.1 CesiumToolPanel 功能清单与归属判定

| # | 功能 | 行数(估) | 归属建议 | 理由 |
|---|---|---|---|---|
| A1 | 底图预设选择（卡片网格） | ~55 | **保留在面板** | Cesium 渲染引擎需要独立的底图切换，与 OL 底图体系不同源 |
| A2 | 自定义 XYZ/WMS 输入 + WMS 子层下拉 | ~65 | **迁移到 SidePanel/TOC** | 与 OL LayerControlPanel 的同名功能完全重复 |
| A3 | 地形切换（4 种） | ~50 | **保留在面板** | Cesium 独有的地形系统 |
| A4 | 叠加层开关（国界线/文字标注/OSM建筑/Google 3D） | ~115 | **保留在面板** | Cesium 独有的叠加渲染 |
| A5 | 数据导入（文件拖拽/远程 URL/样例模型） | ~180 | **保留在面板** | 导入入口是动词操作不适合放树节点；导入结果已通过 cesiumLayersStore 自动出现在共享 TOC |
| A6 | 已加载数据卡片（显隐/透明度/重命名/FlyTo/移除/高程滑杆/材质选择） | ~200 | **迁移到共享 TOC 三维数据分组** | 与 TOC「三维数据」组 90% 重复，仅缺高程滑杆/材质选择/重定位三个扩展项 |
| A7 | 场景快捷操作（home/everest） | ~20 | **保留在面板** | 相机控制不属于图层管理 |
| A8 | 特效模块 + LilGui 控件 | ~120 | **保留在面板** | 会话工作流工具，不属于 TOC 语义 |

### 1.2 潜在 Bug（本次一并修复）

| # | 问题 | 位置 | 影响 |
|---|---|---|---|
| B1 | `emitOverlayFlyTo` 和 `updateOverlayOpacity` 在模板中引用但脚本未定义 | 470 / 509 | 叠加层 FlyTo 按钮和透明度滑条静默无效 |
| B2 | 死 prop 对 `customIonHeightOffset` + `customIonTilesetReady` 被绑定但组件内从未引用 | 1110–1112 | 死代码 |
| B3 | 死 emit `update:customIonHeightOffset` 声明但从未触发 | 1186 | 死代码 |
| B4 | 孤儿异步契约：`defineExpose(setSampledRange)` + emit `request-range-sample` 无消费者 | 1613 | 高程采样回填循环断路 |
| B5 | 复制粘贴条件 bug：`statusTone === 'success' \|\| statusTone === 'success'` | ~931 | warning 态模块卡片不高亮 |
| B6 | 远程服务 URL 输入框默认值硬编码 `'5115505'`（另一个 Ion asset id） | 1278 | 用户困惑 |

---

## 二、实施方案

### 阶段一：修复潜在 Bug（B1-B6）

| Bug | 文件 | 改法 |
|---|---|---|
| B1 | CesiumToolPanel.vue script | 补定义 `emitOverlayFlyTo(overlay)` 和 `updateOverlayOpacity(overlay, val)` 函数，分别调 `cesiumLayersStore.flyTo` 和 `setOpacity`（或 emit 给 CesiumContainer 处理） |
| B2/B3 | 同文件 | 移除死 prop 绑定和死 emit 声明 |
| B4 | 同文件 | 移除孤儿 `defineExpose(setSampledRange)` 或接通消费方 |
| B5 | 同文件 | 条件改为 `statusTone === 'success' || statusTone === 'info'` |
| B6 | 同文件 | 默认值改空串 |

### 阶段二：A6 迁移——已加载数据卡片能力补齐到共享 TOC

目标：用户在共享 TOC「三维数据」分组中即可完成全部数据卡片操作，不再需要切到 CesiumToolPanel。

#### 2a. 扩展 CesiumLayerAdapter 接口

**文件**: `src/domains/cesium/stores/cesiumLayers.ts`

```ts
export interface CesiumLayerAdapter {
    setVisible(id: string, visible: boolean): void;
    setOpacity(id: string, opacity: number): void;
    flyTo(id: string): void;
    remove(id: string): void;
    // ★ 新增
    setBaseHeight?(id: string, height: number): void;
    setMaterialMode?(id: string, mode: string): void;
    reposition?(id: string): void;
    stretchHeight?(id: string): void;
}
```

#### 2b. 扩展 CesiumLayerRecord

```ts
export interface CesiumLayerRecord {
    ...
+   heightRange?: { min: number; max: number };   // 3dtiles 高程范围
+   materialMode?: string;                         // 当前材质模式
}
```

#### 2c. 扩展 cesiumLayerNodeBuilder

```ts
// toCesiumLayerNode 中按 type 开启扩展操作
actions.attribute = false;
actions.edit = false;
// ★ 新增条件动作
if (record.type === '3dtiles') {
    actions.setHeight = true;       // 高程调节
    actions.setMaterial = true;     // 材质选择
}
if (record.type === 'gltf') {
    actions.reposition = true;      // 重定位
}
if (record.type === 'tif') {
    actions.stretchHeight = true;   // 拉伸
}
```

#### 2d. 扩展 cesiumTocActions 分流器

新增 case 分支调用 adapter 方法：
- `data-set-height` → adapter.setBaseHeight
- `data-set-material` → adapter.setMaterialMode  
- `data-reposition` → adapter.reposition
- `data-stretch-height` → adapter.stretchHeight

#### 2e. CesiumContainer 注册扩展 adapter

在现有 `registerAdapter({...})` 调用处补充新方法实现。

### 阶段三：A2 迁移——自定义 XYZ/WMS 输入收口到统一入口

目标：用户只需在一个地方输入服务地址（SidePanel/LayerControlPanel 或 CesiumToolPanel 二选一），不需要两个入口。

**推荐方案**：保留 CesiumToolPanel 的输入（因为 3D 模式下用户可能看不到 OL 面板），但确保提交后同时注册到共享注册表并通知 OL adapter。

现状检查：`handleCustomBasemapSubmit` 已经调用了 `registerRemoteService(...)` ✓。
所以实际上双入口已经收敛到同一注册表了。

剩余工作：确保 OL 侧的 watcher 不会因为共享 ref 变化而重复创建图层（已在之前轮次修复 ✓）。

**结论：此步骤无需额外改动**，当前架构已正确处理双入口收敛。

### 阶段四：TOCTreeItem 扩展控件渲染（高程滑杆/材质选择）

**方案 A**（推荐）：在 TOCTreeItem 展开区域添加条件渲染的控件行
- 当 node 有 `setHeight` capability 且展开时显示高程 range slider
- 当 node 有 `setMaterial` capability 时显示材质下拉

**方案 B**：保持这些控制在右键菜单中作为子菜单项

推荐方案 A（更直观），需修改 TOCTreeItem.vue 模板 + contextMenu.js 不变。

---

## 三、实施顺序与依赖

```
阶段一（B1-B6 bug 修复）     ← 无依赖，可立即执行
    ↓
阶段二（adapter 扩展）        ← 依赖阶段一完成
    ↓
阶段三（确认双入口收敛）       ← 无代码改动
    ↓
阶段四（TOCTreeItem 扩展控件） ← 依赖阶段二的 adapter 扩展
```

## 四、验收标准

| # | 场景 | 预期 |
|---|---|---|
| 1 | CesiumToolPanel 打开无 JS 错误 | 叠加层 FlyTo/透明度正常工作 |
| 2 | 共享 TOC 三维数据叶子右键 | 可见高程调节/材质选项（3dtiles 类型） |
| 3 | 调节高程滑杆 | 3D Tiles 模型实时升降 |
| 4 | 选择材质模式 | 3D Tiles 外观变化 |
| 5 | 双击属性表行 | 视图定位到要素范围 |
| 6 | OL/Cesium 切换 | 在线服务图层状态一致 |
