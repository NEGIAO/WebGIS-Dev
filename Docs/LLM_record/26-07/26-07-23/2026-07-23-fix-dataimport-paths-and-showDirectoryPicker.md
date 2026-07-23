# 2026-07-23 修复数据导入模块路径损坏及 showDirectoryPicker 兼容性问题

---

## 日期和时间

2026-07-23 15:23 - 15:40

---

## 修改内容

1. **修复 `tilesetLoader.js`**：为 `showDirectoryPicker` 添加降级方案（`<input webkitdirectory>`）
2. **修复 `CesiumContainer.vue`**：ZIP 导入 input 元素未挂载到 DOM 导致 `click()` 无效
3. **修复 `importUtils.js`**：`dbfParser` 动态导入路径损坏，指向不存在的旧路径

---

## 修改原因

### 问题分析（事件逻辑链条）

**核心症状**：
- 用户点击"导入 3D Tiles 目录"无反应，控制台报错 `window.showDirectoryPicker is not a function`
- 用户点击"导入 3D Tiles ZIP 包"无反应，文件选择对话框不弹出

**根本原因**：

1. **`showDirectoryPicker` 不可用**（`tilesetLoader.js`）：
   - `showDirectoryPicker` 是 File System Access API，仅在 Chromium 86+ 的**安全上下文（HTTPS）**中可用
   - 开发环境（`localhost`）也被视为安全上下文，但如果用户通过非 HTTPS 访问或浏览器不支持，则该 API 不存在
   - 代码中调用 `window.showDirectoryPicker()` 前未做降级检测，直接抛出 TypeError

2. **ZIP 导入 input 未挂载 DOM**（`CesiumContainer.vue`）：
   - `handleImportTilesetZip()` 中创建了 `<input type="file">` 但未调用 `document.body.appendChild(input)` 将其挂载到 DOM
   - 未挂载的 input 元素调用 `.click()` 在某些浏览器中不会触发文件选择对话框
   - 同时缺少用户取消选择的清理机制

3. **dbfParser 动态导入路径损坏**（`importUtils.js`）：
   - composable 目录重构后，`dbfParser.js` 实际已迁移至 `frontend/src/utils/gis/parsers/dbfParser.ts`
   - 但 `importUtils.js` 中的 `ensureGisParsers()` 函数仍指向旧路径 `../../../../composables/dataImport/dbfParser.js`
   - 导致 SHP 文件解析时动态 import 失败，SHP 格式导入功能完全不可用

**影响范围**：
- 3D Tiles 目录导入（`dataImport` 模块 → `tilesetLoader.js`）
- 3D Tiles ZIP 包导入（`dataImport` 模块 → `CesiumContainer.vue`）
- SHP 文件导入（`dataImport` 模块 → `importUtils.js` → `ensureGisParsers()`）
- 所有依赖 SHP 解析的功能（KMZ 内嵌 SHP 等）

---

## 优化解决方案

### 1. tilesetLoader.js — showDirectoryPicker 降级方案

**方案**：在调用 `showDirectoryPicker` 前检测 API 可用性，不可用时回退到 `<input webkitdirectory>` 方式。

```
if (typeof window.showDirectoryPicker !== 'function') {
    // 回退方案：使用 <input type="file" webkitdirectory>
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    // ... 挂载到 DOM，注册 change 事件，触发 click
    // 读取 input.files 后用相同的流程处理
}
```

**关键点**：
- 使用 `webkitdirectory` 属性（兼容 Chrome/Edge/Firefox 50+）
- input 必须挂载到 DOM 才能可靠触发 click
- 添加 `window.focus` 事件监听以检测用户取消选择

### 2. CesiumContainer.vue — ZIP 导入 input 挂载修复

**修改**：
- 在 `handleImportTilesetZip()` 中创建 input 后调用 `document.body.appendChild(input)`
- 添加 `cleanup()` 函数在文件选择完成/取消后移除 DOM 节点
- 添加 `window.focus` 事件监听检测用户取消选择并清理

### 3. importUtils.js — dbfParser 路径修复

**修改**：将动态导入路径从：
```
import('../../../../composables/dataImport/dbfParser.js')
```
修正为实际路径：
```
import('../../../../utils/gis/parsers/dbfParser.ts')
```

---

## 测试方案

1. **3D Tiles 目录导入**：
   - 在非 HTTPS 环境（如 `http://localhost`）中点击"导入 3D Tiles 文件夹"
   - 预期：弹出文件夹选择框（通过 webkitdirectory 降级方案）
   - 选择包含 `tileset.json` 的文件夹后能正常加载

2. **3D Tiles ZIP 导入**：
   - 点击"导入 3D Tiles ZIP 包"
   - 预期：弹出文件选择对话框，选择 `.zip` 文件后能正常解压加载

3. **SHP 文件导入**：
   - 拖入或通过面板导入 `.shp` 文件（含配套 `.dbf`）
   - 预期：SHP 文件正常解析为 GeoJSON 并加载到场景中
   - 验证：控制台不应出现 `Failed to resolve module` 错误

---

## 修改的文件路径

1. `WebGIS-Dev/frontend/src/components/Cesium/composables/dataImport/loaders/tilesetLoader.js`
2. `WebGIS-Dev/frontend/src/components/Cesium/CesiumContainer.vue`
3. `WebGIS-Dev/frontend/src/components/Cesium/composables/dataImport/importUtils.js`

---

## 备注

- 本次为紧急 Bug 修复，属于同日第二次更新（大版本 3.0.2）
- `showDirectoryPicker` 降级方案使用 `webkitdirectory` 属性，兼容主流浏览器，但功能上略有差异（无法获取目录句柄，只能逐个读取文件）
- 后续可考虑使用 `File System Access API` 的 ponyfill 或 polyfill 以获得更一致的体验