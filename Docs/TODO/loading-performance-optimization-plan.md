# 加载性能优化方案（L3 · 批次 1+2 已实施 V3.4.54）

> 目标：优化 GitHub Pages 部署后的加载速度与性能，国内外均可访问，零预算约束。
> **状态(2026-07-26 21:54)**:用户批准「批次 1+2 + 51.la 录屏关闭」,已全部实施并通过验证,
> 实测首屏 gzip JS **404KB → 86.5KB(−79%)**,超出方案预估(≈130KB)。批次 3 其余项保持建议态。
> 实施日志:[`Docs/LLM_record/26-07/2026-07-26/2026-07-26-loading-performance.md`](../LLM_record/26-07/2026-07-26/2026-07-26-loading-performance.md)。
> 勘误:§1.4/§三 的「dist 121.5MB」为目录清单 2000 条截断假象,真实 dist ≈388MB(tiles 307MB,按需加载不影响首屏);「−7.5MB 死重」结论不受影响。
> 起草:2026-07-26 会话(基线版本 V3.4.52)。
> 关联：[`requestrendermode-plan.md`](requestrendermode-plan.md)（运行时 GPU 渲染优化，另一条待批 L3 流水，与本方案零重叠——本方案管「网络加载」，它管「渲染耗电」）；
> [`bugfix-optimization-plan.md`](bugfix-optimization-plan.md)（滚动规划，顺带发现已登记至该文件）。

---

## 一、调查基线（真实构建实测，非估算）

沙盒克隆 GitHub main 实测 `npm run build`（35.9s）+ rollup-plugin-visualizer raw-data 分析。
已确认前端代码本地盘与 GitHub main 内容一致（仅 CRLF 差异），数据代表现状。

### 1.1 首屏（登录页）冷缓存实际下载量

| 资源 | 大小(gzip) | 加载方式 | 问题 |
|---|---:|---|---|
| `index-*.js`（入口） | 52.2 KB | script | 内含金句库 16.2KB + 瓦片工厂/底图配置图 |
| `vendor-vue` | 45.6 KB | modulepreload | 正常 |
| **`vendor-ol-all`** | **177.6 KB** | **modulepreload** | **OpenLayers 被静态拉进登录页！** |
| **`vendor-libs`** | **109.5 KB** | **modulepreload** | 兜底桶过肥：zstddec 62.6KB + knockout 25.1KB 混入 |
| `vendor-axios` | 17.7 KB | modulepreload | 正常 |
| `vendor-ol-all.css` + `index.css` | ~15 KB | **阻塞渲染** | ol 样式登录页无用 |
| Font Awesome all.min.css（BootCDN） | ~20 KB + 字体 ~80-150 KB | **阻塞渲染** | 全量 CSS 只为 56 种图标 |
| favicon `images/icon.webp` | 79.5 KB 原图 | 早期请求 | public 里现成 4.3KB favicon.ico 未用 |
| 合计 JS（gzip） | **≈ 404 KB** | | 优化后目标 **≈ 130 KB（−67%）** |

### 1.2 OpenLayers 混入登录页的两条实锤链条（已逐文件读码确认）

```
链A：router → stores 桶(index.ts 全量 re-export)
      → useAttrStore.ts:3 → composables/map/features 桶(~40 个 feature 全量 re-export)
      → useDrawMeasure / useGeometryEdit / … → import 'ol'
链B：router → stores 桶 → useUrlParamStore.ts:5
      → constants/basemap/basemapResolver → basemapConfig.ts:8-9
      → import XYZ from 'ol/source/XYZ' / OSM
```

注：dev-conventions「分层边界」明文规定 **stores 禁止依赖 OL/Cesium 类**——链 A/B 本身即违反既有约定，本方案顺势归位。

### 1.3 vendor-libs（预加载 109.5 KB gzip）实际构成

| 包 | gzip | 应属位置 |
|---|---:|---|
| zstddec（ol→geotiff 传递依赖，manualChunks 漏配） | 62.6 KB | vendor-geotiff（懒加载） |
| knockout（cesium-shim 用） | 25.1 KB | Cesium 侧（懒加载） |
| @math.gl/@probe.gl（loaders.gl 系） | ~19 KB | Cesium 侧（懒加载） |
| wkt-parser / mgrs / pbf / rbush 等真散件 | ~22 KB | 留守兜底桶 |

### 1.4 部署产物重复射出（dist 121 MB）

`useSharedResourceLoader.ts:188` 用 `import.meta.glob('../../public/ShareData/**/*', {query:'?url', eager:true})`
把 ShareData 全目录再拷一份进 `dist/assets/`（带哈希），**代码只用了 keys，哈希 URL 全部未消费**：
2026大疆限飞区 3.95MB + 全国限行 2.41MB + 全国禁飞 1.10MB + 4 个 KMZ ≈ **7.5 MB 纯死重**，
且每次部署双份传输（GitHub Pages + HF 前端包均含）。该 loader 本就内置 manifest.json 降级路径（:258），可转正。

### 1.5 其他确认事实

- Cesium 走 `cdn.jsdelivr.net`（cesium-shim.js:26 单一 CDN）——jsDelivr 国内时常抽风，无回退；Font Awesome 已走 BootCDN（国内友好 ✓）
- rapier 2MB 物理引擎：`await import` 动态加载 ✓ 仅人物漫游触发，无需处理
- 登录页 1s 后预热 GIS 资产（RegisterView:1306 deferredGisWarmup）✓ 好设计，保留并配合本方案
- adcode_tree.json 437KB：面板点击才加载 ✓；echarts/three/geotiff 等已在 SKIP_PRELOAD ✓（既有分包功底不错，本方案只补漏）
- 51.la `screenRecord: true`（min-enhanced.js:37）：录屏采集持续吃运行时性能（建议项，见 §4）
- 后端 HF Space（`negiao-webgis.hf.space`）**国内被墙**：前端再快，国内用户登录/API 也不通（见 §5 风险，超本方案范畴）

---

## 二、优化方案（3 批推进，每批独立验证、独立可回滚）

### 批次 1 — 首屏关键路径瘦身【核心收益：首屏 JS −67%，阻塞 CSS 减半】

| # | 改动 | 文件 | 方式 |
|---|---|---|---|
| 1.1 | 切断链 B：`URL_LAYER_OPTIONS` 等纯常量抽到新建无 ol 依赖文件 `constants/basemap/urlLayerCatalog.ts`，resolver 原地 re-export 保持全部旧 import 路径兼容 | useUrlParamStore.ts、basemapResolver.ts、+1 新文件 | 只搬不改 |
| 1.2 | 切断链 A：useAttrStore 改为**调用点惰性动态 import** normalization feature（首次用属性表时才拉，符合「stores 不依赖 OL」边界）| useAttrStore.ts | 行为等价 |
| 1.3 | manualChunks 补漏：zstddec → vendor-geotiff；knockout/@math.gl/@probe.gl → 新 vendor-cesium-deps（懒加载侧） | vite.config.js | 配置 |
| 1.4 | 金句库 16.2KB 懒加载：useMessage 动态 import，未就绪时用 1 条内置兜底文案 | useMessage.js | 行为微变(首帧金句) |
| 1.5 | Font Awesome 非阻塞：`media="print" onload` 交换 + noscript 兜底，仍用 BootCDN | index.html | 图标晚到~百ms |
| 1.6 | favicon 指回 4.3KB favicon.ico；`<html lang="zh-CN">` | index.html | 微改 |

**验收**：构建后 `dist/index.html` 无 vendor-ol-all 的 modulepreload 与 css；首屏 gzip 合计 ≤150KB；
登录→进图全流程冒烟无回归（GIS 预热在 1.2/1.3 后仍覆盖 home 所需 chunk，实施时核对 warmup 清单，缺则补 ⚠️ 未验证）。

### 批次 2 — 部署重量与国内可达性【dist −7.5MB，Cesium 国内可用性↑】

| # | 改动 | 文件 | 方式 |
|---|---|---|---|
| 2.1 | 移除 ShareData glob；新建 `scripts/generate-sharedata-manifest.mjs`（照抄既有 generate-boundary-index.mjs 模式），`prebuild` 钩子自动生成 `public/ShareData/manifest.json`；loader 的 manifest 降级路径转正为主路径 | useSharedResourceLoader.ts、package.json、+1 脚本 | 行为等价 |
| 2.2 | Cesium CDN 多源回退：cesium-shim 注入改为候选链逐个尝试（jsDelivr → unpkg → 其他，onerror 换下一源；Workers/静态资源与主脚本必须同源候选）。候选做**常量**不新增 env key（不触发配置登记；要可配则后续走登记流程） | cesium-shim.js | 容错增强 |

**验收**：dist/assets 无 KML/KMZ 哈希副本；共享资源面板照常列出并可加载全部文件；
断掉首选 CDN（本地 hosts 模拟）Cesium 仍能起 ⚠️ 各候选源 1.132 版本完整性实施时逐一验证。

### 批次 3 — 建议项（不动代码或用户定夺后微改）

- 51.la `screenRecord: true` → false（录屏对学习项目价值低、运行时开销真实存在）——你的统计配置，你拍板
- `stats.html`（1.8MB 旧分析产物）与 `frontend/dist/` 是否该入库：建议 .gitignore（仓库瘦身，不影响部署——CI 全新构建）
- tiles/ 38MB PNG 转 WebP、cloud-atmosphere 3×8MB bin：按需加载已成立，收益属长尾，本次不动

---

## 三、量化预期（gzip，冷缓存首屏）

| 指标 | 现状 | 批次 1 后 | 依据 |
|---|---:|---:|---|
| 首屏 JS 传输 | ≈404 KB | **≈130 KB** | 移除 ol 177.6 + libs 拆剩~10 + 金句 16.2 |
| 阻塞 CSS | index+ol+FA全量 | index.css 一项 | 1.1/1.5 |
| dist 体积 | 121.5 MB | −7.5 MB（批次2） | 2.1 |
| 国内首屏耗时（GH Pages 常见 50-200KB/s） | 8~30s | **2~8s** | 字节数等比 |

## 四、硬边界自查（Force_command §2）

- 不动 `.github/workflows/`、`.env*`、Dockerfile —— deploy.yml 优化想法只写建议（如 HF 包裁剪已由现有 workflow 完成）
- 不执行任何 git 写操作；顺带发现只登记不顺手改
- 新增文件全部登记 frontend-structure.md；无新增配置 key（2.2 特意规避）；门禁两脚本收尾必跑

## 五、遗留风险（本方案不解决，明示）

1. **后端 HF Space 国内不可达**：国内用户可打开页面但登录/瓦片代理/AI 均失败。零预算下无完美解（免费平台国内基本都不可达或不稳）；可选方向：后端多活+前端按可达性探测切换、或接受国内「分享模式/游客降级」。建议单独立项评估。
2. GitHub Pages 本体在国内的可达性波动无法根治，字节瘦身是唯一免费杠杆（本方案已做到主要部分）。
3. 版本号与日志：实施时按当日 README 实际版本 +1（并行会话撞车则顺延）；日志 `Docs/LLM_record/26-07/2026-07-26/2026-07-26-loading-performance.md`。

## 六、决策请求

- [ ] **批准批次 1**（首屏瘦身，核心收益，约 0.5 天）
- [ ] **批准批次 2**（部署重量 + Cesium 多源，约 0.5 天）
- [ ] 批次 3 建议项逐条拍板（screenRecord / .gitignore）
- [ ] 全部暂缓

> 批准形式：回复「批准批次 1」「批准 1+2」等即可。可当场改判范围。
