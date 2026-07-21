# 2026-06-04 修复 ExtentPicker 蓝色覆盖层默认不显示

## 📅 日期和时间
2026-06-04 16:15

---

## 📋 修改内容

**Bug 修复**：修改 ExtentPicker 组件 `showOverlay` 默认值从 `false` 改为 `true`

---

## 🔍 问题分析

### 核心症状
- 框选结束后，没有蓝色的样式保留给用户
- 用户无法直观看到框选的范围

### 根本原因
- `showOverlay` 默认值为 `false`，导致框选完成后不显示蓝色覆盖层
- SpatialAnalysisPanel 中使用 ExtentPicker 时未设置 `:show-overlay="true"`
- 只有 MapDownloader 设置了 `:show-overlay="true"`

### 受影响模块
- `ExtentPicker.vue` 的 `showOverlay` prop 默认值
- 所有使用 ExtentPicker 的场景（空间聚合、渔网分析等）

---

## 🛠️ 优化解决方案

**修复方案**：修改 `showOverlay` 默认值为 `true`

```javascript
// 修复前
showOverlay: {
    type: Boolean,
    default: false,  // ❌ 默认不显示蓝色覆盖层
},

// 修复后
showOverlay: {
    type: Boolean,
    default: true,  // ✅ 默认显示蓝色覆盖层
},
```

**设计变更**：
- 所有场景默认显示蓝色覆盖层，提供更好的视觉反馈
- 如需不显示覆盖层，可显式设置 `:show-overlay="false"`

---

## 📁 修改的文件路径

```
D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Common\ExtentPicker.vue  # 修改默认值
```

---

*"代码是写给机器看的，但文档是写给未来的自己看的。"*
