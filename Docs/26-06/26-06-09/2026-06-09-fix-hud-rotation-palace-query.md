# 2026-06-09 修复 HUD 旋转方向反转 & PalaceQueryInput 类型不匹配

## 📅 日期和时间

2026-06-09 (对话时间)

## 📝 修改内容

1. **HUD 模式旋转方向修复**：设备朝向传感器同步时，罗盘 SVG 的旋转方向与设备旋转方向相同（错误），修正为反向旋转。
2. **PalaceQueryInput 字段命名修复**：`PalaceExplanationPanel.vue` 传递 `segmentIndex`，但接口期望 `_segmentIndex`，导致运行时解构为 `undefined`。

## 🔍 修改原因

### Bug 1: HUD 旋转方向反转

**核心症状**：HUD 模式下开启"硬件朝向同步"后，设备向右旋转时，屏幕上的罗盘也向右旋转。正确行为应为罗盘向左旋转（反向），以保持地理北方指向屏幕固定位置。

**根本原因分析**：

数据流链条：
```
deviceorientation 事件 → handleDeviceOrientation → heading (0-360°)
→ store.setRotation(heading) → rotation.value = heading
→ hudRenderConfig.rotate = normalizeAngle(rotation.value)
→ SVG: transform: rotate(heading deg)
```

问题出在最后一步。CSS `transform: rotate()` 是顺时针方向。当设备向右转 30° 时：
- `heading = 30`（设备朝向为北偏东 30°）
- 当前 SVG `rotate(30deg)` → 罗盘也顺时针转 30°（同向）❌
- 正确 SVG `rotate(-30deg)` → 罗盘逆时针转 30°（反向）✅

**物理类比**：想象你手持一个真正的指南针。你向右转时，指南针的指针（或刻度盘）相对你的视线应该向左转，这样北方始终指向真实的地理北方。

**受影响模块**：`useCompassStore.ts` → `hudRenderConfig` 计算属性 → `createHudRenderConfig` → SVG 渲染

### Bug 2: segmentIndex 命名不匹配

**核心症状**：TypeScript 编译报错 `'segmentIndex' does not exist in type 'PalaceQueryInput'. Did you mean '_segmentIndex'?`

**根本原因**：
- `SelectedPalace` 接口定义字段为 `segmentIndex`（无下划线）
- `PalaceQueryInput` 接口定义字段为 `_segmentIndex`（有下划线）
- 调用处从 `SelectedPalace` 解构出 `segmentIndex`，直接传给 `PalaceQueryInput`，字段名不匹配
- 运行时 `lookupThemeLayer` 内部解构 `_segmentIndex` 得到 `undefined`

**受影响模块**：宫位解释查询链路（`PalaceExplanationPanel.vue` → `ExplanationLookup.lookupThemeLayer` → `getSectionKey` / `extractExactExplanation`）

## 🛠️ 优化解决方案

### Fix 1: HUD 旋转方向

**方案**：在 `hudRenderConfig` 计算属性中，将 `rotation.value` 取反后传入 `createHudRenderConfig`。

```typescript
// 修改前
return createHudRenderConfig(baseConfig, size, rotation.value);

// 修改后
// HUD 模式：罗盘固定在屏幕上，设备旋转时罗盘需反向旋转以保持北方指向不变
return createHudRenderConfig(baseConfig, size, -rotation.value);
```

`normalizeAngle(-30)` → `330°`，即逆时针 30°，效果正确。Vector 模式不受影响，因为它直接使用 `rotation.value`。

### Fix 2: PalaceQueryInput 字段映射

**方案**：在调用处将 `segmentIndex` 映射为 `_segmentIndex`。

```typescript
// 修改前
const exactResult = ExplanationLookup.lookupThemeLayer(themeLayers, explanationJson, {
    layerIndex,
    segmentIndex,
    palaceName,
});

// 修改后
const exactResult = ExplanationLookup.lookupThemeLayer(themeLayers, explanationJson, {
    layerIndex,
    _segmentIndex: segmentIndex,
    palaceName,
});
```

## 🧪 测试方案

### HUD 旋转方向验证
1. 在移动设备上打开 WebGIS，切换到 HUD 模式
2. 开启"硬件朝向同步"
3. 设备向右旋转 → 罗盘应向左旋转（北方始终指向地理北方）
4. 设备向左旋转 → 罗盘应向右旋转
5. 验证 Vector 模式行为不受影响

### PalaceQueryInput 验证
1. 在 HUD 模式下点击罗盘上的宫位
2. 确认宫位解释面板能正确显示解释内容（`_segmentIndex` 不再为 `undefined`）
3. TypeScript 编译无报错

## 📂 修改的文件路径

| 文件 | 变动类型 |
|------|---------|
| `d:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\useCompassStore.ts` | HUD rotation 取反 |
| `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Compass\PalaceExplanationPanel.vue` | segmentIndex → _segmentIndex 映射 |
