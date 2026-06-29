# 2026-06-29 MapContainer.vue 全面 Code Review 与修复

## 📅 日期和时间
2026-06-29 22:30

## 📋 修改内容

对项目核心组件 `MapContainer.vue` 进行全面 Code Review，发现并修复 **2 个 P0 严重 Bug、5 个 P1 代码质量问题、2 个 P2 规范问题、2 个 P3 优化项**。

---

## 🔍 问题事件逻辑链条分析

### 核心症状
1. **token 轮换后逆地理编码静默失败**：天地图 token 失效切换到备用 token 后，逆地理编码功能仍使用旧 token，导致请求失败但无明显错误提示。
2. **normalizeBinaryFlag 的 fallback 参数语义错误**：函数接受 fallback 参数但实际实现硬编码为 `'0'`，与参数名语义不符。
3. **模块级变量在组件重挂载时残留**：当路由切换导致组件卸载/重挂载时，旧的 `searchSource`、`busRouteLayerRef` 等变量不会重置，可能导致幽灵引用。

### 根本原因
- **P0-1**: `TIANDITU_TK` 是模块级 `let` 变量，在 `applyRuntimeMapTokens()` 中被重新赋值，但 `resolveSharedAddressByLonLat` 和 `startReverseGeocodePickAndDraw` 两个函数通过闭包捕获了该变量的初始值，token 轮换后闭包内仍使用旧值。
- **P0-2**: `normalizeBinaryFlag` 最后一行 `return fallback === '1' ? '1' : '0'` 将 fallback 参数的判断硬编码为二选一，丢失了 fallback 本身的值语义。
- **P1-1**: 多个 `let` 变量（`searchSource`、`searchLayer`、`busRouteLayerRef`、`drawLayerInstance` 等）在组件 setup 作用域声明但未在 `onMounted` 中重置，组件重挂载时旧引用残留。

### 受影响模块
- 逆地理编码（`startReverseGeocodePickAndDraw`、`resolveSharedAddressByLonLat`）
- URL 分享标志解析（`parseSharedEntryFlagFromUrl` → `normalizeBinaryFlag`）
- 地图初始化（`initMap`）中的图层实例管理
- 组件生命周期管理（`onMounted`/`onUnmounted`）

---

## 🔧 优化解决方案

### P0-1: TIANDITU_TK 闭包捕获修复
**方案**: 将闭包中的 `TIANDITU_TK` 引用改为读取 `tiandituTk.value`（响应式 ref），确保 token 轮换后始终使用最新值。

**修改文件**: `MapContainer.vue` L319, L1598
- `resolveSharedAddressByLonLat`: `tiandituTk: TIANDITU_TK` → `tiandituTk: tiandituTk.value`
- `startReverseGeocodePickAndDraw`: 同上

### P0-2: normalizeBinaryFlag fallback 修复
**方案**: 最后一行改为 `return fallback`，直接返回 fallback 值而非硬编码判断。

**修改文件**: `MapContainer.vue` L273

### P1: 模块级变量 onMounted 重置
**方案**: 在 `onMounted` 开头统一重置所有模块级 `let` 变量，防止组件重挂载时残留旧引用。

**重置变量**: `searchSource`, `searchLayer`, `busRouteLayerRef`, `drawLayerInstance`, `rightDragZoomController`, `compassManagerRef`, `_cleanupMapEventHandlers`, `removeManagedLayerById`, `routeBuilderApiPromise`

### P1: selectedPalace 改用 storeToRefs
**方案**: 删除 `computed(() => compassStore.selectedPalace)`，改用 `const { selectedPalace } = storeToRefs(compassStore)`。同步移除未使用的 `computed` 导入。

### P1: 非响应式共享状态注释
**方案**: 为 `layerInstances` 和 `userDataLayers` 添加醒目注释，说明它们是刻意的非响应式共享可变状态，避免后续开发者误用 reactive 包装。

### P1: 死代码清理（共 8 处）
- 移除注释掉的 MapEasterEgg 模板、import、常量（DIHUAN_BOUNDS/IMAGES）
- 移除注释掉的 ScaleLine 控件代码
- 移除注释掉的 Google OverviewMap 图层代码
- 移除 `//bug：待修复,临时使用` 陈旧注释
- 移除 `// className: 'my-custom-scale'` 注释
- 移除 `/* 比例尺 */` 空注释和 `/* :deep(ol-scale-line) */` 注释块

### P1: console.warn 清理
**方案**: 删除正常流程中的 `console.warn`（`Applying deferred URL params` 和 `Deferred URL params applied successfully`），ESLint 仅允许 warn/error，正常流程不应有日志。

### P2: import 分组规范化
**方案**: 将散落在文件中部的 OpenLayers 和 utils 导入移至文件顶部，按 Vue → OL → Composables → Constants → Stores/Services → Utils → Components 分组。

### P3: Z_INDEX 常量化
**方案**: 提取 5 个硬编码 z-index 值为 `Z_INDEX` 常量对象：`DRAW(999)`, `USER_LOCATION(1000)`, `BUS_ROUTE(1080)`, `BUS_PICK(1085)`, `SEARCH(1100)`。

### P3: 版本号常量化
**方案**: 将硬编码的 `'V3.3.14'` 提取为 `APP_DISPLAY_VERSION` 常量。

---

## 📊 性能指标

本次修改不涉及性能优化，但有以下间接收益：
- 移除了 ~30 行注释掉的死代码，减少文件体积
- import 分组后 IDE 跳转和自动补全更高效
- `storeToRefs` 替代 `computed` 包装减少了 1 个不必要的响应式计算

---

## 🧪 测试方案

1. **token 轮换验证**: 在后端配置多个天地图 token，使第一个失效 → 验证逆地理编码仍能正常工作
2. **分享链接验证**: 通过分享链接进入 → 验证坐标/缩放/图层正确恢复
3. **组件重挂载验证**: 在 2D/3D 模式间切换多次 → 验证无图层泄漏或幽灵引用
4. **回归测试**: 底图切换、卷帘、绘图测量、路线规划、风水罗盘、搜索、鹰眼视图均正常
5. **构建验证**: `npm run build` 无报错

---

## 📁 修改的文件路径

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `frontend/src/components/Map/MapContainer.vue` | 修改 | 主要修复文件 |

---

## 📊 修改统计

| 类别 | 数量 |
|------|------|
| P0 严重 Bug | 2 |
| P1 代码质量 | 5 |
| P2 规范问题 | 2 |
| P3 优化项 | 2 |
| **总计** | **11** |
| 删除死代码行数 | ~30 行 |
| 新增常量 | 2 个（Z_INDEX, APP_DISPLAY_VERSION） |
