# 2026-06-06 卷帘滑块控制器移动端触摸支持修复

> **日期**: 2026-06-06 18:58
> **版本**: v3.3.0
> **类型**: Bug 修复 + 移动端适配

---

## 一、事件逻辑链条分析

### 核心症状
- `MapSwipeController.vue` 的卷帘滑块在移动端（手机/平板）上无法通过触摸拖拽操作
- 用户手指触摸分割线后无法滑动，页面反而跟随滚动
- 移动端控制按钮（模式切换/关闭）触摸区域过小，难以点击

### 根本原因
1. **`touchmove` 事件监听器缺少 `{ passive: false }`**：浏览器默认将 `touchmove` 视为 passive listener，无法调用 `preventDefault()` 阻止默认滚动行为
2. **`handleTouchMove` 函数中缺少 `e.preventDefault()` 调用**：即使设置了 `passive: false`，未显式阻止默认行为仍会导致页面滚动
3. **分割线触摸热区过小**：视觉宽度仅 4px，移动端手指触摸精度不足
4. **缺少 `touch-action: none`**：未在 CSS 层面阻止浏览器的默认触摸手势（如平移/缩放）

### 受影响模块
- 卷帘分析功能（MapSwipeController 组件）
- 移动端地图交互体验

---

## 二、修改内容

### 2.1 触摸事件处理修复

| 修改项 | 修复前 | 修复后 |
|--------|--------|--------|
| `touchmove` 监听器 | `addEventListener('touchmove', handler)` | `addEventListener('touchmove', handler, { passive: false })` |
| `touchend` 监听器 | `addEventListener('touchend', handler)` | `addEventListener('touchend', handler, { passive: false })` |
| `handleTouchMove` 函数 | 缺少 `e.preventDefault()` | 添加 `e.preventDefault()` 阻止页面滚动 |

### 2.2 触摸热区扩展

通过 `::before` 伪元素在分割线两侧增加透明触摸区域：

- **桌面端**：默认扩展至 24px（原 4px → 24px）
- **移动端（≤576px）**：进一步扩展至 36px

### 2.3 CSS 触摸优化

- **`touch-action: none`**：添加至 `.swipe-splitter`，阻止浏览器默认触摸手势
- **`touch-action: manipulation`**：添加至 `.control-btn`，禁用双击缩放等非必要手势
- **`-webkit-tap-highlight-color: transparent`**：去除 iOS 移动端点击高亮

### 2.4 移动端 UI 尺寸优化

| 元素 | 桌面端 | 移动端（≤576px） |
|------|--------|-----------------|
| 滑块句柄尺寸 | 40×40px | 40×40px（保持不变） |
| 句柄图标 | 20×20px | 18×18px |
| 控制按钮尺寸 | 36×36px | 40×40px（增大以符合触摸规范） |
| 控制按钮 SVG | 16×16px | 20×20px |
| 控制按钮圆角 | 4px | 8px |
| 触摸热区宽度 | 24px | 36px |

---

## 三、修改的文件路径

```
frontend/src/components/Map/MapSwipeController.vue
```

---

## 四、测试方案

1. **浏览器 DevTools 移动端模拟**：
   - 触摸拖拽分割线，滑块应跟随手指移动，页面不应滚动
   - 水平模式：左右拖拽
   - 垂直模式：上下拖拽
2. **控制按钮测试**：
   - 点击模式切换按钮，水平/垂直应正常切换
   - 点击关闭按钮，卷帘应正常关闭
3. **键盘无障碍测试**：
   - Tab 聚焦到分割线后，方向键应可控制滑块位置
4. **真机测试**：
   - iOS Safari / Android Chrome 上实际触摸操作验证

---

## 五、性能指标

本次修改仅涉及事件监听参数调整和 CSS 伪元素增加，无运行时性能影响。

---

*"移动端触摸体验的核心：足够大的热区 + 正确的事件阻止 + 恰到好处的手势控制。"*