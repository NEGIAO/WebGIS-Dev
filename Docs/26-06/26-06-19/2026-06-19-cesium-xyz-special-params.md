# 2026-06-19 V3.3.8 Cesium XYZ 特殊参数占位符修复

**日期和时间**：2026-06-19 19:10

**版本号**：V3.3.8

**修改内容**：

修复 Cesium 端加载部分特殊 XYZ 瓦片模板时 URL 拼装错误的问题，让 Cesium 与 OL 共享同一套 `BASEMAP_PRESETS` 时不再因占位符差异导致瓦片 404。

**事件逻辑链条分析**

### 核心症状

切换到 Cesium 3D 模式后，腾讯矢量（GCJ）和 Google 简洁（WGS）等预设的瓦片全部 404，浏览器开发者工具里能看到形如下面的请求被发出：

```
https://rt0.map.gtimg.com/realtimerender?z=8&x=210&y=-124&type=vector&style=0
                                                                  ^^^^^^^^^^^^^^^^
                                                                  Y 轴为负数，腾讯服务端永远不会匹配到
```

OL 端同一预设（`vector_tengxun_preset`、`vector_google_clean_preset` 等）渲染完全正常。

### 根本原因

`cesiumProviderFactory.ts` 的 `toCesiumUrlTemplate` 函数在把 OL 风格的 URL 模板翻译成 Cesium 兼容模板时，**没有把 `{-y}` 翻译成 `{reverseY}`**。函数顶部注释写的是「同时将 OL 风格的 `{-y}` 转换为 Cesium 的 `{reverseY` 处理方式」，但实现里只做了大小写归一化，没有真正的占位符替换。

而 `Cesium.UrlTemplateImageryProvider` 识别的轴向占位符只有 `{x}`、`{y}`、`{z}`、`{reverseY}`，**不识别 `{-y}`**。所以腾讯模板里的 `{-y}` 会被原样写到请求 URL 里，导致请求里的 `y=-124` 这种永远命中不到服务端瓦片的负值坐标。

进一步，`default` 分支的占位符校验 `templateUrl.includes('{z}') || ... || templateUrl.includes('{y}')` 同样不识别 `{reverseY}`，将来如果出现只有 `{reverseY}` 而没有 `{y}` 的源（例如纯 TMS 源），仍会被这个校验误拒。

### 解决方案与实施步骤

1. **`toCesiumUrlTemplate` 显式翻译 `{-y}` → `{reverseY}`**：
   - 用正则 `/\{-\s*y\s*\}/gi` 匹配 `{-y}` / `{- y}` / `{-Y}` 等大小写容忍的写法
   - 顺序放在普通 `{y}` 替换之前，避免误伤

2. **`default` 分支占位符校验补上 `{reverseY}`**：
   - 任何 `{z}` / `{x}` / `{y}` / `{reverseY}` 之一即可放行

3. **未涉及**：
   - `&s=Ga`、`apistyle=...` 之类的纯查询串：OL/Cesium 都会原样保留，无需处理
   - `{a-d}` 子域名范围：Cesium 端已有 `normalizeSubdomainRange` 显式展开
   - MFF（maps-for-free）：当前 `buildMffCesiumUrl` 直接返回 `null`，由 OL 侧的 `NonStandardXYZAdapter` 单独处理，Cesium 端维持跳过；本次不动
   - 自定义 URL 走 `LayerControlPanel` 的 `detectCustomTileServiceKind` + `createAutoTileSourceFromUrl`，也走相同工厂路径，修复对其同样生效

### 性能指标

| 指标 | Before | After |
| --- | --- | --- |
| `vector_tengxun` 在 Cesium 上瓦片命中率 | 0%（请求 `y=-N&...`） | 与 OL 一致 |
| `vector_google_clean` 在 Cesium 上 | 已经正常（`&s=Ga` 走透传，无需修改） | 不变 |
| 占位符校验兼容性 | 不识别 `{reverseY}` | 识别 4 种轴向占位符 |

### 影响范围

- `frontend/src/constants/basemap/cesiumProviderFactory.ts` — `toCesiumUrlTemplate` + `default` 分支

### 测试方案

| 步骤 | 预期 |
| --- | --- |
| 进入 3D 模式，切到「腾讯矢量（GCJ）」预设 | 瓦片请求 URL 里出现 `&y=124`（正值），瓦片正常渲染 |
| 进入 3D 模式，切到「Google 简洁（WGS）」预设 | `&s=Ga` 透传，瓦片正常渲染 |
| 进入 3D 模式，切到「CartoDB Light」预设 | `{a-d}` 展开为 `{s}` + 4 个子域名，瓦片正常渲染 |
| 切回 OL 模式后再切回 Cesium | 占位符翻译幂等，无残留 |

### 修改的文件路径

- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\constants\basemap\cesiumProviderFactory.ts`
- `d:\Dev\GitHub\WebGIS_Dev\Docs\26-06\26-06-19\2026-06-19-cesium-xyz-special-params.md`（本文件）

### 历史关联

- [2026-06-19-cesium-data-import.md](2026-06-19-cesium-data-import.md) — Cesium 数据导入功能
- [2026-06-19-unified-basemap-ol-cesium.md](2026-06-19-unified-basemap-ol-cesium.md) — 底图预设统一接入
- [2026-06-19-v3-3-8-staged-code-review.md](2026-06-19-v3-3-8-staged-code-review.md) — V3.3.8 暂存区 Code Review