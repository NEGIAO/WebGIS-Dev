# 2026-06-19 V3.3.8 暂存区 Code Review 与 Bug 修复：Cesium 数据导入 + 底图预设统一接入

**日期和时间**：2026-06-19 18:30

**版本号**：V3.3.8

**修改内容**：

本轮 Code Review 在 V3.3.7 基础上对 21 个暂存区文件进行全量审查，识别并修复 5 处真实问题，并将本轮所涉及的关键 Bug / 隐患落实到具体行号。同时保持上一轮已经落实的「Cesium 数据导入 + 底图预设统一接入」功能完整性。

**事件逻辑链条分析**

### 核心症状

1. **拖拽上传覆盖层闪烁**：Cesium 容器内子节点（如 `cesium-tool-shell` 或 `drag-overlay` 自身）触发 dragleave 会导致覆盖层被错误关闭/再打开，闪烁明显。
2. **GLTF 重复导入时旧 BlobURL 泄漏**：用户连续选择多个无嵌入坐标的 GLTF 时，前一个待确认的 Blob URL 不会被回收，造成内存泄漏。
3. **CesiumDataImportDialog 重入残留**：上一轮修复用 `{ immediate: true }` 在组件挂载瞬间即触发 watcher，导致 `lngStr.value = ''` 把初始 placeholder 重置为空字符串（看似无影响，但有副作用）。
4. **`localDataSources` deep watch 性能浪费**：`CesiumToolPanel.vue` 中 `watch(() => props.loadedDataSources, ..., { immediate: true, deep: true })`，每次 `loadedDataSources` 数组元素变化都触发整组重建；实际只需要关注引用变化。
5. **死代码 `knownEntityIds`**：`useCesiumDataImport.clearAllDataSources` 中声明 `Set` 收集 ID 但从未被使用。

### 根本原因

| 问题 | 根因 |
| --- | --- |
| 拖拽闪烁 | `dragleave` 事件未区分「真正离开容器」与「子节点冒泡」 |
| GLTF 重复导入泄漏 | `pendingGltfFile.value = {...}` 直接覆盖，未先 revoke 旧 BlobURL |
| Dialog 重入残留 | `immediate: true` + 状态变化时无差别重置 |
| deep watch | 误以为需要监听数组内部变化，但下游 prop 是不可变替换语义 |
| 死代码 | 上一轮重构未清理辅助变量 |

### 解决方案与实施步骤

1. **`CesiumContainer.vue` — 优化 `onDragLeave`**：
   - 接收 `event`，检查 `event.relatedTarget` 是否仍是当前容器内节点
   - 仅在真正离开时关闭覆盖层

2. **`useCesiumDataImport.js` — `loadGLTF` 复用前回收旧 BlobURL**：
   ```js
   if (pendingGltfFile.value) {
       revokeBlobUrl(pendingGltfFile.value.blobUrl);
   }
   pendingGltfFile.value = { file, blobUrl, name: file.name };
   ```

3. **`CesiumDataImportDialog.vue` — 关闭 `immediate` + 仅在打开时重置**：
   - 移除 `{ immediate: true }`
   - `isVisible === false` 时只清空错误提示，不擦除用户输入
   - `isVisible === true` 时统一清空 + focus

4. **`CesiumToolPanel.vue` — `localDataSources` 改为引用比较**：
   - 去掉 `deep: true`
   - 仅在 `arr !== localDataSources.value` 时同步

5. **`useCesiumDataImport.js` — 移除 `knownEntityIds`**：
   - 删除无用 Set 声明与填充循环

### 性能指标

| 指标 | Before | After |
| --- | --- | --- |
| GLTF 重复导入 10 次 | 10× BlobURL 泄漏 | 0 泄漏（前一次 revoke） |
| CesiumToolPanel 数据更新回调 | deep 遍历整组 | 引用比较 O(1) |
| 拖拽覆盖层闪烁 | 子节点冒泡触发 1 次 | 仅真正离开触发 1 次 |

### 影响范围

- `Cesium/CesiumContainer.vue` — `onDragLeave` 事件处理
- `Cesium/CesiumDataImportDialog.vue` — watcher 语义
- `Cesium/composables/useCesiumDataImport.js` — `loadGLTF` + `clearAllDataSources`
- `Cesium/CesiumToolPanel.vue` — `localDataSources` watch

### 测试方案

| 步骤 | 预期 |
| --- | --- |
| 在 Cesium 容器上连续拖动一个文件进/出 | 覆盖层不闪烁 |
| 连续选择 2 个无嵌入坐标 GLTF | 第 2 个弹窗出现，旧 BlobURL 已 revoke |
| 关闭 GLTF 弹窗 | 输入框内容保留 |
| 加载 5 个 SHP 后清除 | `knownEntityIds` 警告不再出现（已删除） |
| CesiumToolPanel 数据源列表渲染 | push 新数据源只触发列表项渲染，不重建整组 |

### 修改的文件路径

- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\CesiumContainer.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\CesiumDataImportDialog.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\CesiumToolPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\composables\useCesiumDataImport.js`
- `d:\Dev\GitHub\WebGIS_Dev\README.md`（版本号 3.3.7 → 3.3.8）
- `d:\Dev\GitHub\WebGIS_Dev\frontend\README.md`（版本号 3.3.7 → 3.3.8 + 目录树更新 + V3.3.8 章节）
- `d:\Dev\GitHub\WebGIS_Dev\backend\README.md`（V3.3.8 章节补充）

### 历史关联

- [2026-06-19-cesium-data-import.md](2026-06-19-cesium-data-import.md) — Cesium 数据导入功能
- [2026-06-19-unified-basemap-ol-cesium.md](2026-06-19-unified-basemap-ol-cesium.md) — 底图预设统一接入
- [2026-06-19-staged-code-review.md](2026-06-19-staged-code-review.md) — V3.3.7 暂存区 Code Review