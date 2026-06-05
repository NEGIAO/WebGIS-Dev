# TIF/GeoTIFF + 矢量导入性能优化

**日期**：2026-06-05
**版本**：3.0.x

---

## 修改内容

1. 新增 TIF 解码 Web Worker（`tiffWorker.js`），将 geotiff.js 的 TIFF 解析+像素解码从主线程移到后台 Worker
2. 新增 Shapefile 解析 Web Worker（`shpWorker.js`），将 shpjs 解析从主线程移到后台 Worker
3. 新增 TIF 工具模块（`tifUtils.js`），封装 Worker 调用、图层创建、样式生成等逻辑
4. 新增矢量 Worker 工具（`vectorWorkerUtils.js`），封装 Shapefile Worker 调用和 requestIdleCallback 分片处理
5. 重构 `useLayerDataImport.js`，大 TIF 文件（>50MB）自动走 Worker 解码路径
6. Vite 配置新增 `worker.format: 'es'`，支持 Worker 使用 ES 模块格式

---

## 修改原因

### 问题 1：大 TIF 文件导入卡顿

**根本原因**：`importLocalGeoTIFF` 使用 `geotiff.fromBlob(file)` 在主线程解析整个 TIF 文件，包括：
- TIFF 结构解析（IFD、标签读取）
- 像素数据解码（LZW/Deflate 解压）
- 波段数据交织

对于 300MB+ 的 TIF 文件，这些 CPU 密集操作会阻塞主线程 10-60 秒，期间页面完全无法操作。

**解决方案**：
- 大文件（>50MB）：将整个解码流程移到 Web Worker
- 小文件（≤50MB）：保持现有 `fromBlob` + `Pool` 路径（Pool 本身已在后台线程解压）

### 问题 2：大矢量导入页面冻结

**根本原因**：
- `shpjs(buffer)` 在主线程执行，解析大型 Shapefile 时阻塞 UI
- GeoJSON 处理使用 `requestAnimationFrame` 每帧处理 100 个 feature，单帧超 16ms 就会卡

**解决方案**：
- Shapefile 解析移到 Web Worker（`shpWorker.js`）
- 提供 `processGeoJsonIdle` 使用 `requestIdleCallback` 分片处理（浏览器空闲时才处理，不阻塞用户交互）

---

## 影响范围

- 栅格数据导入（TIF/TIFF）
- 矢量数据导入（Shapefile）
- Vite 构建配置
- 图层管理模块

---

## 技术方案

### Worker 架构

```
主线程                          Worker 线程
─────────                      ──────────
File 对象                       geotiff.fromArrayBuffer()
  ↓                              ↓
file.arrayBuffer()              image.readRasters()
  ↓                              ↓
postMessage(buffer, [buffer])   解码完成 → postMessage(result, [transferables])
  ↓                              ↓
接收解码数据                     Worker 自动终止
  ↓
创建图层/渲染
```

**关键优化点**：
1. **Transferable 传递**：`ArrayBuffer` 通过 Transferable 零拷贝传递，避免 300MB 数据的序列化开销
2. **进度回调**：大文件分块解码时，每 50 个 tile 发送一次进度，UI 实时显示
3. **自动路径选择**：根据文件大小自动选择 Worker 路径或主线程路径

### 文件大小阈值

| 文件大小 | 路径 | 预期效果 |
|----------|------|----------|
| <50MB | 主线程 `fromBlob` + `Pool` | 快速，Pool 并行解压 |
| ≥50MB | Worker 全量解码 | 主线程不阻塞，进度实时反馈 |

---

## 修改的文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/workers/tiffWorker.js` | 新建 | TIF 解码 Worker |
| `frontend/src/workers/shpWorker.js` | 新建 | Shapefile 解析 Worker |
| `frontend/src/utils/tifUtils.js` | 新建 | TIF 工具函数 |
| `frontend/src/utils/vectorWorkerUtils.js` | 新建 | 矢量 Worker 工具 |
| `frontend/src/composables/useLayerDataImport.js` | 修改 | 接入 Worker 路径 |
| `frontend/vite.config.js` | 修改 | 添加 Worker ES 模块配置 |

---

## 测试方案

1. **小 TIF**：`E:\Google\mt1.google.com_10m_06_05_01.tif` — 导入时页面可交互，<3s 完成
2. **大 TIF**：`C:\Users\NEGIAO\Desktop\湍北.tif`（300MB+） — Worker 解码不阻塞 UI，进度条实时更新
3. **大矢量**：10MB+ Shapefile — 导入过程中页面可拖动/缩放
4. **编译验证**：`npx vite build --mode development` 通过

---

## 性能指标

| 场景 | 优化前 | 优化后 |
|------|--------|--------|
| 300MB TIF 导入 | 主线程阻塞 30-60s | Worker 后台解码，主线程可交互 |
| 大 Shapefile 导入 | shpjs 主线程阻塞 5-15s | Worker 后台解析 |
| 小 TIF 导入 | 1-3s（Pool 并行） | 1-3s（不变） |
