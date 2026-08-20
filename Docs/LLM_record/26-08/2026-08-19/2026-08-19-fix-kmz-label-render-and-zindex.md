# 2026-08-19 修复 KMZ/KML 标注不显示 + 数据层标注层级上移（V3.5.28）

## 日期与时间
2026-08-19

## 任务等级
L2（Bug 修复 + zIndex 带调整，2 个源码文件 + 版本文档）

## 问题分析

### 核心症状
1. 共享资源（`public/ShareData/`）中的 KMZ 数据（HENU 系列、中国山脉分布图）导入后
   **无法标注**：自动标注无显示，开启标注也无内容；部分 KML 同样异常。
2. 数据层上的标注文字显示层级**低于标注瓦片**（底图 label 类源），标注被瓦片文字遮挡。

### 根本原因
**症状 1（标注不显示）**，实证链（node + esbuild 打包真实模块运行，非臆测）：
- KMZ 数据（如 HENU 系列）由 OSM 导出，Placemark `<name>` 大量为 **"NULL"**
  （HENU道路 108/108、HENU建筑 58/116、HENU湖泊 1/6）；
- `getFeatureLabelText` 回退链缺陷：
  a. **`styleUrl` 等元数据字段被当标签**：name 为 "NULL" 被 `isValidLabel` 拒绝后，
     "第一个可用属性"回退选中 `styleUrl`（如 `#LineStyle00`）→ 地图上显示
     `#LineStyle00` 垃圾 ID（用户视为"标注坏了"）；
  b. **`'__empty__'` 缓存污染**：若首个渲染要素回退全失败（labelText 为空），
     空样式被缓存到 `__empty__` 键，**后续所有要素命中该缓存 → 全图层无标注**；
  c. 图层名若为 URL 编码（共享链接类导入），`getLayerLabelText` 不解码即校验，
     `isValidLabel` 拒收 → 回退链最后一环失效。
- 单文件 KML 正常是因为其 `<name>` 为真实地名（如"大疆限飞区 - 全国"），
  不会落入上述缺陷路径——与用户"kml 大部分可以、kmz 都不行"的观察一致。

**症状 2（标注层级）**：`Z_BAND.LABEL = 800` 恒置顶于数据带（200~799）之上，
数据层标注文字被标注瓦片遮挡。

### 受影响模块
托管图层样式（标注渲染）、zIndex 显示带。

## 修改内容
1. `useManagedLayerStyle.js`：
   - 新增 `IGNORED_LABEL_KEYS`（styleUrl/description/address/snippet/phoneNumber/
     open/visibility/extrude/tessellate/altitudeMode 等），"第一个可用属性"回退排除
     元数据字段——杜绝 `#LineStyle00` 式垃圾标签；
   - 空标签不再写入缓存（修复 `__empty__` 污染：首个无效要素不再拖垮全图层）；
   - `getLayerLabelText` 对图层名先 `decodeURIComponent` 再校验。
2. `zIndexBands.js`：`LABEL: 800 → 100`（标注瓦片带 100~149，底图之上、数据之下），
   底图带收敛为 0~99，卷帘对比带 150~199（`Z_BASEMAP_SWIPE_OFFSET` 不变）——数据层
   标注文字不再被标注瓦片遮挡；区划（600）/系统（900）不受影响。

## 修改原因
标注功能对 KMZ/含 NULL 名称的 KML 数据全面失效；数据层标注层级低于标注瓦片不符合
GIS 常规显示语义。

## 影响范围
托管图层标注渲染（上传矢量/搜索 POI/区划）、底图标注瓦片 zIndex、卷帘对比层 zIndex。

## 性能指标
未实测（修复不引入额外开销；空标签分支每次重建样式，仅发生在无效要素上）。

## 测试方案
### Agent 已执行
- node + esbuild 打包真实模块（ol + useManagedLayerStyle + vectorUtils）实证：
  - HENU道路形状（name 全 NULL + styleUrl）：标签从 `#LineStyle00` → **图层名** ✓
  - HENU湖泊形状（先闻湖 + NULL + 雪垠湖）：先闻湖 ✓ / NULL→图层名 ✓ / 雪垠湖 ✓，NULL 不污染 ✓
  - URL 编码图层名：解码后显示 ✓
  - 无 styleUrl 全 NULL：回退图层名，后续有效要素正常 ✓
- 真实 dispatch 实证（node 跑 dispatchGisData 解 HENU湖泊.kmz）：packet.kind='kml'、
  entryName='HENU湖泊.kmz'、kmlString 完整 27145 字符——KMZ 提取链路无缺陷，问题
  确在渲染层；
- `npx eslint`（useManagedLayerStyle.js）：0 报错；`npx tsc --noEmit`：0 报错；
  `npm run build`：成功（36.23s）；
- grep 确认 LABEL 引用均走 `Z_BAND.LABEL` 常量（useMapState.js:759/901），无硬编码。

### 待用户实机验证
1. 加载共享资源 HENU道路.kmz / HENU湖泊.kmz / 中国山脉分布图.kmz → 地图出现标注
   （有效 name 显示要素名；name 为 NULL 的要素显示图层名，不再出现 #XXX 垃圾）；
2. 开启底图标注瓦片（如高德标注）+ 上传小数据图层 → 数据层标注文字显示在瓦片标注之上；
3. 卷帘对比正常（右侧原图含标注、数据层仍在上）。

## 变更文件清单
| 文件 | 说明 |
|---|---|
| `frontend/src/domains/ol/layer/style/useManagedLayerStyle.js` | 标签回退排除元数据字段、空标签不缓存、图层名解码 |
| `frontend/src/domains/ol/layer/zIndexBands.js` | LABEL 800→100（标注瓦片降至数据带之下） |
| `README.md` | 版本号三处 → V3.5.28 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.5.28 条目 |

## 遗留与风险
- **版本状态漂移**：README 的 V3.5.27 三处修改（L83/版本表/footer）被并行会话覆盖回退
  至 V3.5.26，但 CHANGELOG 的 V3.5.27 条目仍在——本次按规范推进 V3.5.28 并补齐版本表
  V3.5.27 行，收敛为 3 行；若并行会话仍在推进版本号，请后完成者顺延；
- **WebGL 大数据图层（>5000 要素）无标注**：`WEBGL_DEFAULT_STYLE` 为 flat style 无
  text；且 `setUserLayerLabelVisibility` 对 WebGL 图层执行 `setStyle(Canvas 样式函数)`
  不兼容（OL WebGLVectorLayer.setStyle 仅接受 FlatStyleLike），开启标注可能破坏渲染。
  **已记入 TODO，未在本任务处理**（用户场景 <5000 要素）；
- `isValidLabel` 对含 2+ 冒号/斜杠等特殊符号的值（如"2026-08-19 10:30:00"）仍判无效
  ——属校验策略，未在本任务放宽（影响属性表/导出等调用方），已记入 TODO；
- 底图源上限 100 个（0~99），超过会与标注瓦片带冲突（现实中底图源数量远低于此）。

## 零散修补（L1）
无。