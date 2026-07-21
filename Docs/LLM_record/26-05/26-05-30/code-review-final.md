# Code Review — 最终暂存区变更

**日期**: 2026-05-30
**范围**: 47 files, +3117 / -2616
**类型**: Bug 修复 + 新功能 + 性能优化 + 模块拆分 + 后端裁剪功能

---

## 🔴 P0 — 无阻断性问题

---

## 🟡 P1 — 建议关注（2 个）

### 1. `tile_engine.py` — `clip_geotiff_to_bbox` 坐标转换精度

```python
min_x_3857 = min_lon * WEB_MERCATOR_EXTENT / 180.0
max_x_3857 = max_lon * WEB_MERCATOR_EXTENT / 180.0
min_y_3857 = (
    WEB_MERCATOR_EXTENT / math.pi
    * math.log(math.tan(math.pi / 4 + math.radians(min_lat) / 2))
)
```

**问题**: 这是墨卡托投影的标准公式，数学上正确。但高纬度地区（>85°）`math.tan()` 会趋向无穷大，虽然 `_normalize_bbox_4326` 有 `_clamp` 保护，但如果 `MAX_LATITUDE` 设置不当可能导致裁剪窗口异常。

**风险**: 低。`_normalize_bbox_4326` 已有 clamp 保护。仅提醒。

### 2. `useDownloadStore.ts` — `clearExtent` 未重置 bbox

```ts
clearExtent() {
    extentSet.value = false;
},
```

**问题**: `clearExtent` 只重置 `extentSet` 标记，但 `bbox` 值保留为用户框选的范围。如果用户清除选区后直接提交，仍会使用旧的 bbox 值。

**建议**: 清除时同时重置 bbox 为默认值，或在提交时检查 `extentSet` 状态。

---

## 🟢 P2 — 正确实现（无问题）

### 3. 后端裁剪功能 `clip_geotiff_to_bbox` — ✅

- WGS84 → EPSG:3857 转换正确（标准墨卡托公式）
- 使用 `rasterio.windows.from_bounds` 计算裁剪窗口
- 窗口取整并限制在源数据范围内
- 空窗口安全跳过
- 裁剪失败时保留原始文件，不阻断任务
- `os.replace` 原子替换避免文件损坏

### 4. 前端裁剪选项 — ✅

- `clipToExtent` checkbox 绑定 store
- 提交时传递 `clip_to_extent` 参数
- 提交成功后显示裁剪提示

### 5. 框选 UI 增强 — ✅

- 拖拽实时预览（绿色虚线）
- 松手后持久化覆盖层（蓝色半透明）
- "清除选区"按钮 + 状态文字
- `extentSet` 标记替代硬编码坐标判断

### 6. 路线 TOC 注册修复 — ✅

`busRouteLayerRef` 闭包 bug → getter 函数。

### 7. `setZIndex` 崩溃修复 — ✅

`item.layer?.setZIndex?.(zIndex)` 空值保护。

### 8. 性能优化（5 项）— ✅

- 图层可见性/透明度变更跳过全量刷新
- OL 方法调用值未变化时跳过
- 标签缓存按需清空
- layerHelpers 快速路径
- `forceRebuildStyle` 分离

### 9. 模块拆分（3 个）— ✅

- `api/backend.js` → 10 文件
- `useTileSourceFactory.ts` → 8 文件
- `dataDispatcher.js` → 3 文件

### 10. CSS 变更 — ✅

`.eco-header` 背景色 `--brand-primary-light` → `--brand-primary-dark`。

---

## 📊 变更分类

| 类别 | 文件数 | 说明 |
|------|--------|------|
| Bug 修复 | 4 | 路线 TOC、setZIndex、框选 UI、hasExtent |
| 新功能 | 6 | 裁剪选项、框选覆盖层、清除选区 |
| 性能优化 | 5 | 图层刷新、OL 调用、标签缓存 |
| 模块拆分 | 21 | backend/tileSource/dataDispatcher |
| 后端 | 2 | clip_geotiff_to_bbox + clip_to_extent 参数 |
| 文档 | 4 | Code review 记录 |

---

## 结论

0 阻断性问题。P1 #2（clearExtent 未重置 bbox）建议修复，其余可提交。
