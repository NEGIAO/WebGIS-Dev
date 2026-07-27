# 2026-07-26 加载性能优化(L3 批次 1+2):首屏 −79% + 部署死重清理 + Cesium 多源回退

- **日期与时间**:2026-07-26 21:54(北京时间)
- **任务等级**:L3(涉及构建配置架构调整与打包链重构;方案先行,用户批准「批次 1+2 + 51.la 录屏关闭」后实施)
- **方案文档**:[`Docs/TODO/loading-performance-optimization-plan.md`](../../../TODO/loading-performance-optimization-plan.md)
- **基线版本**:V3.4.52 → **本次 V3.4.54**(实施期间并行会话占用 V3.4.53 后端安全批次,按规范「撞车后完成者顺延」)

---

## 问题分析(阶段一产出)

**核心症状**:GitHub Pages 部署后加载慢,国内尤甚(用户目标:零预算优化国内外加载速度)。

**根本原因**(云端沙盒克隆仓库真实构建 + rollup 依赖图分析定位,非估算):

1. **登录页首屏冷缓存需下载 ≈404KB gzip JS**,其中 286KB 不该存在:
   - `vendor-ol-all`(gzip 177.6KB)被 modulepreload,其 CSS 阻塞渲染——OpenLayers 经两条静态链混入登录页入口:
     - 链 A:`router → stores barrel → useAttrStore → composables/map/features barrel(约 40 个 feature 全量 re-export,多数 import ol)`
     - 链 B:`router → stores barrel → useUrlParamStore → basemapResolver → basemapConfig → ol/source/XYZ|OSM`
     - 两条链同时违反 dev-conventions「stores 禁止依赖 OL/Cesium」分层边界
   - `vendor-libs` 兜底桶(gzip 109.5KB)被 modulepreload:`zstddec`(63KB,geotiff 传递依赖,manualChunks 漏配)与 `knockout`(25KB,cesium-shim 用)混入
   - 入口 chunk 内含 60KB 金句库(gzip 16.2KB)
2. **Font Awesome 全量 CSS 阻塞渲染**(BootCDN,仅用 56 种图标);favicon 指向 79.5KB webp(4.3KB favicon.ico 闲置)
3. **dist 死重 7.5MB**:`useSharedResourceLoader` 的 `import.meta.glob('../../public/ShareData/**/*')` 把 ShareData 全目录再拷进 `dist/assets/`(哈希副本),但代码只消费 keys,副本零引用
4. **Cesium 单一 jsDelivr CDN**(国内时常不可达),失败无回退 = Cesium 永不加载

**受影响模块**:登录/注册首屏链路、构建分包配置、共享资源加载器、Cesium 引导链路。

## 修改内容

**批次 1(首屏关键路径瘦身)**
1. 新建 `frontend/src/constants/basemap/basemapPresets.ts`:预设纯数据(类型 + `DEFAULT_BASEMAP_PRESET_ID` + `BASEMAP_PRESETS` + `URL_LAYER_OPTIONS`)自 basemapConfig/basemapResolver **脚本化原文搬移**(零转写);basemapConfig、basemapResolver 原位 re-export,全部旧 import 路径兼容
2. `useUrlParamStore.ts`:`URL_LAYER_OPTIONS` 改从 basemapPresets 导入(切断链 B)
3. `useLayerMetadataNormalization.js`:`ol/extent getCenter`、`ol/proj toLonLat` 以本地纯函数替代(node 实测与 ol 原函数**逐位等价,最大偏差 0**,含边界样本);`useAttrStore.ts` 绕开 features barrel 直连该模块(切断链 A)
4. `vite.config.js`:manualChunks 补 `zstddec → vendor-geotiff`、`knockout/@math.gl/@probe.gl → vendor-cesium-deps`(新懒加载 chunk,列入 SKIP_PRELOAD)
5. `useMessage.js`:金句库懒加载(动态 import,load 后 2.5s 空闲预取,未就绪用兜底文案)
6. `index.html`:Font Awesome `media="print"`+onload 非阻塞(noscript 兜底);favicon → favicon.ico;`lang="zh-CN"`;`TopBar.vue` 顶栏高清 logo 与 favicon link 解耦(继续用 images/icon.webp)

**批次 2(部署重量与国内可达性)**
7. 新建 `frontend/scripts/generate-sharedata-manifest.mjs`;`vite.config.js` 配置求值时自动生成 `public/ShareData/manifest.json`(dev/build/build:* 全覆盖;产物确定性,无机器相关字段);`useSharedResourceLoader.ts` 移除 glob,原 manifest 降级路径转正(`scanViaManifest`)
8. `cesium-shim.js`:CDN 候选链 jsDelivr → BootCDN → unpkg,逐源尝试(onerror/10s 超时切换),`window.CESIUM_BASE_URL` 随生效源同步;新增 `getActiveCesiumBaseUrl()`;`cesiumRuntime.js` widgets.css 改用生效源

**批次 3 已批项**
9. `public/min-enhanced.js`:51.la `screenRecord: true → false`

## 修改原因

零预算约束下,字节瘦身是国内访问 GitHub Pages 唯一免费杠杆;OL 混入登录页与 vendor-libs 漏配属打包配置缺陷修复;glob 死重属纯浪费;Cesium 单源无回退是国内 3D 不可用的直接原因。

## 影响范围

登录/注册首屏加载链路(体积与阻塞资源)、底图预设常量的文件归属(消费方 import 路径全兼容)、属性表元数据归一化(数学等价替换)、共享资源发现机制(glob → manifest)、Cesium 引导(单源 → 多源)、构建分包。**不涉及**:鉴权逻辑、URL 参数语义、图层管理行为、后端。

## 解决方案(候选对比)

| 决策点 | 候选 | 选定与理由 |
|---|---|---|
| 链 B 切断 | a) store 内联常量副本 b) 预设数据抽纯文件 | **b**:副本会漂移;纯数据文件是 SSOT,且为未来入口安全常量提供归所 |
| 链 A 切断 | a) store 惰性动态 import feature b) feature 去 ol 化 + 直连导入 | **b**:a 会把同步 API 变异步,侵入店内调用方;b 仅替换两个小工具函数且可逐位验证 |
| ShareData 发现 | a) glob 改 `?url` 懒 b) 构建期 manifest | **b**:a 仍会射出资产副本;manifest 路径 loader 里本就有,转正即可 |
| Cesium 国内 | a) 换单一国内源 b) 多源回退链 | **b**:a 牺牲海外与现行为;b 保持 jsDelivr 主源零回归,国内获得逃生通道 |

## 性能指标(真实构建前后对比,gzip)

| 指标 | 优化前 | 优化后 | 变化 |
|---|---:|---:|---:|
| 首屏 JS 合计(入口+preload) | 404 KB | **86.5 KB** | **−79%** |
| 其中 vendor-ol-all | 177.6 KB(preload) | 退出首屏 | −100% |
| 其中 vendor-libs | 109.5 KB(preload) | 退出首屏(拆后 15.5KB 亦不再 preload) | −100% |
| 入口 chunk 本体 | 52.2 KB | 22.5 KB | −57% |
| 阻塞 CSS | index+ol.css+FA 全量 | index.css(7.6KB) | 只剩一项 |
| dist/assets KML/KMZ 死重 | 7.5 MB | 0 | −100% |
| favicon 首请求 | 79.5 KB | 4.3 KB | −95% |

注:全站 dist ≈388MB(tiles 307MB 等静态数据按需加载,不影响首屏;此前方案文档「121MB」为目录清单截断假象,已勘误)。

## 测试方案

**Agent 已执行(云端沙盒,克隆 GitHub main 且已确认与本地盘代码一致)**
- `npm run build` 成功(32.7s);`dist/index.html` 无 vendor-ol-all/vendor-libs 的 modulepreload,无 ol CSS;FA 为 media=print 异步加载
- `dist/assets` KML/KMZ 哈希副本为 0;`ShareData/manifest.json` 生成 7 条资源(含子目录递归)
- 本地纯函数 vs ol 原函数(`toLonLat`/`getCenter`)8 组坐标 + 3 组 extent 抽样:最大偏差 0
- `npx tsc --noEmit`:零新增报错(余留均为既有基线:cesium 模块解析噪音 + layerTreeBuilder.ts:389 既知项)
- ESLint 触改文件:0 error;3 warning 均为原文件既有 console.info 风格继承,数量不增
- 门禁:`CheckStructureTree.py` ✅ / `CheckConfigRegistry.py` ✅(在应用全部改动与文档同步后的沙盒树上执行,结果见交接块)
- unpkg cesium@1.132.0 可达性已验证;**BootCDN 1.132.0 未能从沙盒验证(⚠️ 未验证),回退链对 404 天然免疫**

**待用户实机验证**
1. `npm run dev` / LocalDev.bat:登录页打开(图标短暂晚到属预期)→ 登录跳转进图 → 2D 底图/图层操作正常
2. 共享资源面板:列表照常列出 7 项,加载「全国禁飞区.kml」等成功上图
3. 3D 视图:Cesium 正常加载(控制台应出现「来源:jsDelivr」);可选断源模拟(hosts 屏蔽 cdn.jsdelivr.net)验证回退与 BootCDN 版本可用性
4. 属性表打开、字段/统计/定位正常(normalization 数学替换的行为验证)
5. 构建产物部署后 Pages 实测首屏(国内网络下体感应显著变快)

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/constants/basemap/basemapPresets.ts` | **新增**:预设纯数据 + URL_LAYER_OPTIONS(零 ol 依赖) |
| `frontend/src/constants/basemap/basemapConfig.ts` | 预设段搬出,原位 re-export;头注释对齐 |
| `frontend/src/constants/basemap/basemapResolver.ts` | URL_LAYER_OPTIONS 改 re-export |
| `frontend/src/stores/useUrlParamStore.ts` | 改从 basemapPresets 导入 |
| `frontend/src/stores/useAttrStore.ts` | 绕开 features barrel 直连 normalization 模块 |
| `frontend/src/composables/map/features/useLayerMetadataNormalization.js` | ol 两工具函数本地纯函数化(逐位等价) |
| `frontend/vite.config.js` | manualChunks 补漏 + vendor-cesium-deps + SKIP_PRELOAD + manifest 生成调用 |
| `frontend/scripts/generate-sharedata-manifest.mjs` | **新增**:ShareData 清单生成器(可独立运行) |
| `frontend/public/ShareData/manifest.json` | **新增(生成物,随构建自动刷新)** |
| `frontend/src/composables/useSharedResourceLoader.ts` | 移除 import.meta.glob,manifest 转正 |
| `frontend/src/composables/useMessage.js` | 金句库懒加载 |
| `frontend/index.html` | FA 非阻塞、favicon.ico、lang="zh-CN" |
| `frontend/src/components/Shell/TopBar.vue` | 顶栏 logo 与 favicon link 解耦 |
| `frontend/src/cesium-shim.js` | CDN 三源回退链 + getActiveCesiumBaseUrl |
| `frontend/src/components/Cesium/composables/core/cesiumRuntime.js` | widgets.css 用生效源 |
| `frontend/public/min-enhanced.js` | 51.la screenRecord 关闭 |
| `Docs/Guide/frontend-structure.md` | 登记 basemapPresets.ts,两行注释对齐 |
| `README.md` | 三处版本 → V3.4.54 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.4.54 条目 |
| `Docs/TODO/loading-performance-optimization-plan.md` | 状态更新(批次 1+2 已实施)+ 基线勘误 |
| `Docs/TODO/bugfix-optimization-plan.md` | 顺带发现登记(见下) |

## 遗留与风险

1. **后端 HF Space 国内不可达**(负载最重的遗留项):前端再快,国内登录/API/瓦片代理仍不通。建议单独立项评估(多活/可达性探测降级),涉及部署面与预算决策
2. **BootCDN cesium 1.132.0 可用性 ⚠️ 未验证**:若该源无此版本,回退链自动跳过(仅国内用户多一次 404 探测,约百毫秒级)
3. Font Awesome 异步化后图标可能晚到约百毫秒(视觉可接受;后续可评估 lucide 全面替换或子集自托管)
4. 金句首帧可能为兜底文案(2.5s 预取后恢复全量)
5. **既有不一致(顺带发现,未越权处理)**:①CHANGELOG 缺 V3.4.52 完整条目(README 表有摘要);②`Docs/TODO/next-sprint-bugfix-and-optimization.md` 自述「已并入应删除」但仍存在;③bugfix 规划 P0-2 标记「已完成 V3.4.43」但 `layerTreeBuilder.ts:389` 的 tsc 报错在本地与远端代码中均仍存在——版本记录与代码疑似脱节,需人工核实
6. 本地盘文档(V3.4.52/53)领先 GitHub main(V3.4.38)14+ 个版本未推送;线上 Pages 要吃到本次优化需用户 push 触发部署
