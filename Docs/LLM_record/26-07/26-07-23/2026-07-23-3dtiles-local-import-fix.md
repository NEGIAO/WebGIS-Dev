# 3D Tiles 本地导入加载失败修复

**日期和时间**：2026-07-23 09:10

---

## 修改内容

修复了通过标准文件输入选择本地 `tileset.json` 时，3D Tiles 无法加载（`blob:` URL 解析失败）的问题。在浏览器环境下，检测到单文件场景时自动引导用户通过目录选择器选取完整 3D Tiles 目录。

---

## 修改原因

### 核心症状
用户选择本地 3D Tiles 目录中的 `tileset.json` 后，控制台报大量：
```
GET blob:http://localhost:5173/c6db5a5f-... net::ERR_FILE_NOT_FOUND
```
3D Tiles 场景完全无法显示。

### 事件逻辑链

```
用户选择 tileset.json（单文件）
  → loadTilesetJSON(file) 被调用
    → file.path 为空（标准浏览器不提供，仅 Electron 提供）
      → hasLocalPath = false
        → 回退到 createBlobUrl(file)
          → tilesetUrl = "blob:http://localhost:5173/xxx"
            → Cesium.Cesium3DTileset.fromUrl(blobUrl) 加载 tileset.json 成功
              → 解析 content.uri = "10_431_820.json"（相对路径）
                → 拼接后 = "blob:http://localhost:5173/10_431_820.json"
                  → ❌ 该 blob URL 不存在（对应文件从未被上传）
                    → ERR_FILE_NOT_FOUND
```

### 根本原因
3D Tiles 是**目录格式**，`tileset.json` 内部的 `content.uri`（如 `10_431_820.json`）是相对于 `tileset.json` 所在目录的路径。通过标准 `<input type="file">` 只能选择单个文件，无法获取同目录下的兄弟文件（282 个 JSON + 381 个 b3dm），导致 blob URL 回退方案失败。

---

## 影响范围

- 模块：`useCesiumDataImport.js` → `loadTilesetJSON()` 函数
- 前端 Cesium 3D Tiles 数据导入链路

---

## 优化解决方案

### 策略

| 环境 | 行为 |
|------|------|
| Electron（`file.path` 可用） | 原逻辑不变：构造 `file://` URL 直接加载 |
| 浏览器 | 不再回退 blob URL，自动弹出 `showDirectoryPicker` 让用户选择完整目录 |

### 实施步骤

1. **移除无效的 blob URL 回退**：当 `hasLocalPath = false` 时，不再调用 `createBlobUrl(file)`（该路径必然失败）
2. **自动引导目录选择**：显示 `message.warning` 提示后，调用已有的 `importTilesetFromDirectory()`（使用 File System Access API `showDirectoryPicker`），用户选择完整目录后正常加载
3. **消除不必要的 try/catch**：Electron 分支的 `catch` 仅 re-throw，属于无意义包装，直接移除

---

## 性能指标

无性能变化，仅改变调用路径。

---

## 测试方案

1. 浏览器环境（localhost）：通过文件输入选择 `tileset.json` → 预期显示 warning 提示并自动弹出目录选择器 → 选择完整 3D Tiles 文件夹 → 加载成功
2. Electron 环境：通过文件输入选择 `tileset.json` → 预期使用 `file://` URL 正常加载（行为不变）
3. 已有的「文件夹导入」按钮 → 预期行为不变
4. 已有的「ZIP 导入」按钮 → 预期行为不变

---

## 修改的文件路径

- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\composables\useCesiumDataImport.js` — `loadTilesetJSON()` 函数重写
