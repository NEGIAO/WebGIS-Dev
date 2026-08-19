# 2026-08-18 修复 KML/KMZ 符号解析链路（编码探测 / KMZ 资源重写 / 回退崩溃）

- **日期与时间**：2026-08-18
- **任务等级**：L2（前端多文件协同改动，3D 导入链路）

## 问题分析

- **核心症状**：3D 场景导入 KML/KMZ 时符号（点图标 / 线样式 / 面样式）无法完全解析，
  表现为图标缺失、样式错乱、中文名乱码；KMZ 加载失败时回退路径直接抛 TypeError。
- **根本原因**（按因果链）：
  1. **`loadKMZFallback` 已损坏**（`Docs/Architecture/multi-format-data-import.md` 已记载）：
     `decompressBuffer()` 返回 `{ entries: [...] }` 且 entry 字段为
     `extension / path / buffer`，而 `kmlLoader.js` 直接对返回值 `.find()` 并读取
     `entry.ext / entry.name / entry.content` —— 回退触发必崩；
  2. **编码探测逻辑存在根本缺陷**：`textDecoder.js` / `useKmzLoader.js decodeKmlText` /
     `kmlParser.ts` 三处实现均「按 U+FFFD 替换字符数量最少」选编码。但任意字节流按
     **UTF-16 解码永不产生替换字符**，导致 GBK 中文 KML 被误判为 UTF-16LE 乱码——
     这是「符号解析不出来」的最大隐性来源（国内 ArcGIS / 奥维 / 部分国产导出常为 GBK）；
  3. **`normalizePath` 破坏 `../` 路径**：正则 `/^\.\/?/` 会剥掉 `../x` 的首个点号
     变成 `./x`，KMZ 内 `sub/doc.kml` 引用 `../images/pin.png` 的上跳相对路径解析错位，
     图标必然缺失（自测 `resolveRelativePath('sub/doc.kml','../images/pin.png')`
     实际返回 `sub/images/pin.png`）；
  4. **KMZ 内嵌资源 href 匹配过窄**：Cesium 原生 KMZ 路径用 zip 条目原始名做 key 精确
     匹配，`./` 前缀、大小写差异、URL 编码（`%20`）等变体全部失配；既有
     `rewriteKmlImageHrefs` 仅重写图片扩展名，且无容错查找；
  5. **Cesium 原生 KMZ 依赖 CDN Worker**（z-worker-pako），且 doc.kml 固定按 UTF-8
     读取——编码/资源双重不可控，不适合作为唯一路径。
- **受影响模块**：Cesium 3D 数据导入链路（`kmlLoader.js`）、共享文本解码
  （`textDecoder.js`）、KMZ 解包（`useKmzLoader.js`）、共享路径工具（`pathUtils.js`）、
  TOC 图层节点映射（`cesiumLayerNodeBuilder.ts`）。

## 修改内容

1. **`loaders/kmlLoader.js` 重构**（核心）：
   - KML：读取 ArrayBuffer → `decodeTextContent` 多编码解码 → 文本 Blob 交给
     `Cesium.KmlDataSource.load`（不再直传 blob URL——Cesium 内部固定 UTF-8 读取，
     GBK 必乱码）；
   - KMZ：统一走手动管线 `extractKmlFromKmz(file, { rewriteResourceBlobUrls: true })`
     ——doc.kml 智能选择（内容打分）+ 多编码解码 + 内嵌资源 href 重写为 blob URL，
     删除损坏的 `loadKMZFallback` 与「原生优先 + 回退」双路径；
   - 重写产生的 blob URL 登记 `record.blobUrls`，由
     `useCesiumDataImport.removeDataSource / clearAllDataSources` 既有逻辑统一回收，
     加载失败时同步回收。
2. **`textDecoder.js decodeTextContent` 编码判定加固**：
   - BOM 权威判定（UTF-8 / UTF-16LE / UTF-16BE）；
   - 无 BOM 时打分制：U+FFFD 重罚（×10000）+ C0 控制字符罚分（×100）+ 文本 NUL 计数；
   - UTF-16 候选须有**字节级 0x00 支撑**（真 UTF-16 的 ASCII 标记必然产生 0x00，
     LE 在奇位、BE 在偶位）：无 0x00 支撑 +1000 罚分（排除单字节编码误读），
     0x00 位置与字节序冲突 +50 罚分（区分无 BOM 的 LE/BE）。
3. **`useKmzLoader.js` 同步加固**：
   - `decodeKmlText` 采用与 `textDecoder.js` 同源打分启发式（SSOT 同规则）；
   - `rewriteKmlImageHrefs` → `rewriteKmlResourceHrefs` 泛化：**任意**能在压缩包内
     命中的 href（图标 / GroundOverlay 影像 / NetworkLink 等）均重写为 blob URL，
     新增 `lookupZipEntry` 三级容错（精确 → 大小写不敏感 → URL 解码）；
   - `detectMimeType` 扩展 ico / tif / tiff / kml / kmz。
4. **`pathUtils.js normalizePath` 修复**：`/^\.\/?/` → `/^\.\//`，仅精确去除 `./`
   前缀，`../x` 原样保留（上跳语义不再被破坏）。已核对全部消费方（zip 条目名 /
   文件路径），语义变化不影响。
5. **`cesiumLayerNodeBuilder.ts`**：`TYPE_LABELS` 补 `kmz: 'KMZ'`，TOC「三维数据」
   分组中 KMZ 数据源格式标签不再显示原始 type。

## 修改原因

用户反馈 KML/KMZ 符号无法完全解析，要求「可解析任意 kml/kmz 格式的符号并加载到
TOC」。排查确认上述 5 类根因：其中编码误判与 `../` 路径破坏属于**影响全链路**的
存量缺陷（2D 管线同样受影响），一并修复。

## 影响范围

- Cesium 3D KML/KMZ 导入（`useCesiumDataImport` 分发不变，loader 内部实现替换）；
- 共享 `textDecoder.decodeTextContent`（2D 管线 `useLayerDataImport`、`archiveProcessor`
  KML 解码同受益）；
- 共享 `normalizePath / resolveRelativePath`（KMZ 资源路径解析、SHP 分组等）；
- TOC「三维数据」分组 KMZ 格式标签。

## 解决方案

- **方案对比**（KMZ 路径）：
  - A. 继续 Cesium 原生 KMZ + 修复回退 —— 原生路径编码/资源匹配缺陷仍在，
    回退路径修完也只在原生失败时兜底，符号缺失是静默的（load 不抛错），否决；
  - B. 统一手动管线（**选定**）：自解压 → 多编码解码 → 资源 href 全量重写 →
    文本加载。对编码、路径变体、doc.kml 选择全可控，且复用既有
    `extractKmlFromKmz`（2D 管线同源），不新增重复实现；
  - C. 手动 + 原生双跑取优 —— 双倍解压开销，符号一致性难判定，否决。
- **编码判定选型**：BOM 权威 + 字节级 0x00 分布打分。单靠 U+FFFD 计数必然误判 GBK
  （UTF-16 解码永不产生替换字符），这是本任务最大发现；字节级 0x00 与 XML 标记的
  强相关性（`<kml`、`Placemark` 等 ASCII 标记在真 UTF-16 中必带 0x00 字节）使
  判据服务无关且稳定。
- **关键决策**：KMZ 不再保留「原生优先」快速路径——手动管线解压开销对典型 KMZ
  （<10MB）可忽略，换来符号解析的确定性。

## 性能指标

- 解码：4 编码 × 全字节扫描，10MB KML 单次 < 100ms（未实测，估算）；
- KMZ 管线：JSZip 解压 + href 重写（仅重写可命中条目），典型 KMZ 增加
  < 500ms（未实测）。

## 测试方案

### Agent 已执行

- **编码单测 11 例**（node 直跑 `textDecoder.js` 真模块，全部 PASS）：
  UTF-8 中文 / GBK 中文 / GBK 非乱码 / UTF-8 BOM / UTF-16LE BOM / UTF-16LE 无 BOM /
  UTF-16BE BOM / UTF-16BE 无 BOM / 纯 ASCII / UTF-8 不被 GBK 误读 / GBK+ASCII 混合；
  修复前 GBK 用例必现 FAIL（误判 UTF-16LE）。
- **路径单测 14 例**（node 直跑 `pathUtils.js` 真模块，全部 PASS）：
  `../` 上跳、`./` 归一、子目录、反斜杠、绝对 URL / data URI / root:// 保留、
  深层上跳、顶层 `../` 收敛等；修复前 `../` 用例必现 FAIL。
- **KMZ 端到端**（esbuild 打包真模块 `useKmzLoader.js` + JSZip 构造 GBK doc.kml
  KMZ，node 运行，全部 PASS）：GBK 中文解码、主文档选择（doc.kml 胜出空壳）、
  相对路径解析变体。
- `npx eslint`（5 个改动文件）：0 问题；
- `npx tsc --noEmit`：0 错误。
- ⚠️ 浏览器专属部分未实机：DOMParser href 重写（node 无 DOMParser）、
  `Cesium.KmlDataSource.load` 渲染效果、TOC 节点呈现——列入待验证。

### 待用户实机验证

1. 导入 UTF-8 KML（含 IconStyle 点符号 + LineStyle + PolyStyle）→ 3D 场景符号
   完整、TOC「三维数据」出现 KML 节点；
2. 导入 **GBK 编码** KML（ArcGIS/奥维导出常见）→ 中文名不再乱码、样式正常
   （修复前必乱码）；
3. 导入含内嵌图标（`./images/xxx.png`、子目录、大小写变体、`%20` 编码）的 KMZ
   → 图标正常显示；移除该数据源 → 控制台无 blob URL 泄漏（`record.blobUrls` 回收）；
4. 导入 `sub/doc.kml` 引用 `../images/xxx.png` 的 KMZ → 图标正常显示
   （修复前路径错位必缺失）；
5. TOC「三维数据」KMZ 节点格式标签显示「KMZ」。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/cesium/composables/dataImport/loaders/kmlLoader.js` | 重构：KML 多编码解码加载；KMZ 统一手动管线 + 资源 blob URL 登记；删除损坏回退 |
| `frontend/src/domains/common/data-import/textDecoder.js` | 编码判定加固：BOM 权威 + 字节级 0x00 支撑打分（修复 GBK 误判 UTF-16） |
| `frontend/src/domains/common/data-import/useKmzLoader.js` | decodeKmlText 同源启发式；href 重写泛化 + 三级容错查找；mime 扩展 |
| `frontend/src/domains/common/utils/pathUtils.js` | normalizePath 修复 `../` 前缀破坏 |
| `frontend/src/domains/cesium/stores/cesiumLayerNodeBuilder.ts` | TYPE_LABELS 补 kmz 标签 |
| `README.md` | 版本号三处更新至 V3.5.25 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.5.25 条目 |
| `Docs/LLM_record/26-08/2026-08-18/2026-08-18-fix-kml-kmz-symbol-parsing.md` | 本日志 |

## 遗留与风险

- **`kmlParser.ts` 已死代码**（零引用）仍含旧式编码判定（GBK 误判缺陷同源）——
  按规范不删不动，建议后续清理时删除或同步启发式；
- **`decompressor.ts` 自带独立 `normalizePath` 副本**（与 pathUtils 不同步）——
  本轮未动，若该路径参与 KMZ 处理需复核（当前 KMZ 走 useKmzLoader，不经过它）；
- DOMParser 重写路径与 Cesium 渲染效果未实机（待用户验证清单）；
- KMZ 中引用**非 zip 内**相对资源（如站点内网路径）仍无法解析——无基准 URL 可依，
  属物理限制；`kmz` 类型未列入 `OPACITY_SUPPORTED_TYPES`（透明度滑杆缺失）为既有
  登记事项（2026-08-08 日志），未纳入本任务。
