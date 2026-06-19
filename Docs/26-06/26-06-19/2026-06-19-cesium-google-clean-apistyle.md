# 2026-06-19 V3.3.8 Cesium 加载 Google apistyle 无标注样式失败修复

**日期和时间**：2026-06-19 19:35

**版本号**：V3.3.8

**修改内容**：

修复在 Cesium 3D 模式下加载 `vector_Google_clean`（Google 简洁，WGS84 + 后端代理 + 无标注样式）预设失败的问题。OL 端同一 URL 工作正常，根因是 OL 与 Cesium 在「未花括号包裹的 URL 编码字符」与「apistyle 字段语义」上的处理差异。

**事件逻辑链条分析**

### 核心症状

切换到 Cesium 模式，选「Google 简洁」预设（`vector_Google_clean_preset`）后瓦片请求全部 404 或返回有标签的样式，浏览器 Network 面板看到的请求是：

```
GET https://negiao-webgis.hf.space/proxy/gcj2wgs/https://mt0.google.com/vt/lyrs=p&x=210&y=124&z=8&s=Ga&apistyle=s.e:l%7Cp.v:off,s.t:1%7Cs.e.g%7Cp.v:off,s.t:2%7Cs.e.g%7Cp.v:off
                                                                                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                                                                                  | 被 URL 编码为 %7C，Google apistyle 解析器不识别
```

OL 端同 URL 工作正常，因为 OL 在构造 `Image.src` 之前会对整段 URL 做一次 `decodeURI`，把 `%7C` 还原为 `|`、`%2C` 还原为 `,`。

### 根本原因

`frontend/src/constants/basemap/sourceDescriptors.ts:625` 的 `vector_Google_clean` URL 与 `basemapConfig.ts:932` 的 `LAYER_SOURCE_DEFINITIONS.vector_Google_clean.url` **不一致**：

- OL 侧（`basemapConfig.ts:932`）：包含完整 `&apistyle=...%7C...%2C...`
- Cesium 侧（`sourceDescriptors.ts:625`，旧版本）：只有 `&s=Ga`，没有 apistyle

Cesium 侧实际拿到的 URL 是缺样式版本，导致 OL/Cesium 加载出来的视觉效果不一致；并且即使把 apistyle 加上，`Cesium.UrlTemplateImageryProvider` 不会对整段 URL 做 `decodeURI`，`%7C`、`%2C` 会以编码形式送达 Google 服务端，被 apistyle 解析器当作未知字符而忽略或拒绝。

`toCesiumUrlTemplate`（`cesiumProviderFactory.ts:103-119`）只负责把 `{-y}` 等占位符翻译成 `{reverseY}`，没有处理未花括号包裹的 URL 编码字符。

### 解决方案与实施步骤

1. **`sourceDescriptors.ts:619-635` 同步 OL 侧 URL**：把 `vector_Google_clean.url` 改成与 `basemapConfig.ts:932` 完全一致的版本（含 `apistyle=...%7C...%2C...`），让 OL/Cesium 视觉一致。
2. **`toCesiumUrlTemplate` 自动解码 URL 编码占位符**：在替换 `{z}/{x}/{y}/{s}` 之后追加两步 `replace(/%7C/gi, '|')` 与 `replace(/%2C/gi, ',')`，把 Google apistyle 里常见的两个 URL 编码字符还原成原字符。
3. **不动 `basemapConfig.ts`**：OL 侧原本就把 `%7C` 还原（OL 内部 decode），保留现状；Cesium 侧由工厂的归一化函数负责解码。
4. **不动腾讯矢量**：腾讯瓦片不走 apistyle，没有 `%7C/%2C`，本次解码逻辑对其是 no-op。

### 性能指标

| 指标 | Before | After |
| --- | --- | --- |
| `vector_Google_clean_preset` 在 Cesium 上是否带样式 | 不带标签版本（与 OL 视觉不一致） | 与 OL 完全一致的无标注极简样式 |
| apistyle `\|` 字符在 Cesium 发出 URL 里的形态 | `%7C`（编码） | `|`（原字符） |
| 其他源（腾讯 / Tianditu / CartoDB） | 正常 | 正常（解码逻辑是 no-op） |

### 影响范围

- `frontend/src/constants/basemap/cesiumProviderFactory.ts` — `toCesiumUrlTemplate` 新增 `%7C` / `%2C` 解码
- `frontend/src/constants/basemap/sourceDescriptors.ts` — `vector_Google_clean.url` 同步 OL 完整版本

### 测试方案

| 步骤 | 预期 |
| --- | --- |
| 3D 模式下选「Google 简洁」预设 | 瓦片请求 URL 中 `apistyle=...\|...\|...` 原字符输出；瓦片渲染无道路标签、无地点注记，与 OL 一致 |
| 3D 模式下选「腾讯矢量（GCJ）」预设 | `{-y}` 仍正确翻译为 `{reverseY`，瓦片正常 |
| 3D 模式下选「天地图矢量」 | `tiandituTk` 占位符仍正确替换，瓦片正常 |
| 3D 模式下选「CartoDB Light」 | `{a-d}` 仍展开为 `{s}` + 子域名数组，瓦片正常 |

### 修改的文件路径

- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\constants\basemap\cesiumProviderFactory.ts`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\constants\basemap\sourceDescriptors.ts`
- `d:\Dev\GitHub\WebGIS_Dev\Docs\26-06\26-06-19\2026-06-19-cesium-google-clean-apistyle.md`（本文件）

### 历史关联

- [2026-06-19-cesium-xyz-special-params.md](2026-06-19-cesium-xyz-special-params.md) — `{-y}` → `{reverseY}` 翻译
- [2026-06-19-unified-basemap-ol-cesium.md](2026-06-19-unified-basemap-ol-cesium.md) — 底图预设统一接入