# 2026-08-18 新增 Google 水系图层（纠偏叠加）

- **日期与时间**：2026-08-18
- **任务等级**：L2（新增底图图层 + 预设，多文件协同）

## 问题分析

- **核心需求**：用户提供「纠偏过的 Google 单独水系图层」URL，要求加入底图，作为叠加在卫星影像上的新影像瓦片。
- **根本原因/URL 拆解**：用户 URL
  `https://negiao-webgis.hf.space/proxy/gcj2wgs/https://mt0.google.com/vt/lyrs=m&x={x}&&hl=zh-CN&y={y}&z={z}&apistyle=s.t:0|p.v:off,s.t:6|p.v:on`
  正是 `gcj2wgsProxyUrl(upstreamUrl)` 的产物（生产 `VITE_TILE_PROXY_BASE_URL=https://negiao-webgis.hf.space`）：
  - 上游 = Google `lyrs=m`（道路图），`apistyle=s.t:0|p.v:off,s.t:6|p.v:on` 关闭陆地（type 0）、仅保留水系（type 6）→ 透明底水系瓦片；
  - 经 `/proxy/gcj2wgs/` 完成 GCJ-02 → WGS-84 纠偏，与 WGS 影像底图套合。
- **受影响模块**：底图配置 SSOT（`basemapConfig.ts` 图层定义）与预设目录（`basemapPresets.ts`）。

## 修改内容

1. `basemapConfig.ts`：新增图层 `imagery_google_water`「Google水系(WGS)」（category=imagery / group=影像），
   URL 由 `gcj2wgsProxyUrl('https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=zh-CN&apistyle=s.t:0%7Cp.v:off,s.t:6%7Cp.v:on')` 派生。
2. `basemapPresets.ts`：末尾追加预设 `imagery_google_water_preset`「Google影像水系」，stack = `['imagery_google', 'imagery_google_water']`（底部影像 + 顶部水系叠加）。

## 修改原因

用户新增需求：将 Google 独立水系图层作为影像底图上的叠加瓦片层。

## 影响范围

- 底图链路（图层定义 / 预设目录 / URL 参数 `l` 索引 / 图层管理面板 / Cesium 描述符自动派生）

## 解决方案

- **方案对比**：
  - A. 硬编码用户给的完整 HF Space URL —— 违反 `publicRuntime.ts` 单点基址派生规范，本地 dev 环境（`VITE_TILE_PROXY_BASE_URL=/api`）将失效。
  - B. 采用 `gcj2wgsProxyUrl()` 派生（选定）—— 与既有 `imagery_amap_wgs` / `vector_Google_clean` 完全同模式，生产/本地自动适配，SSOT 一致。
- **关键决策**：
  - 用户 URL 的 `&&hl=zh-CN` 归一为单 `&`（双 && 为笔误，单 & 语义等价）；
  - `|` 按既有 `vector_Google_clean` 惯例编码为 `%7C`；
  - 预设追加在 `BASEMAP_PRESETS` **末尾**，保证 `ALL_BASEMAP_PRESETS` 序号与 URL 参数 `l` 的既有索引不变；
  - 默认预设（China Blender2）不改动。
- **实施步骤**：图层定义 → 预设 → 版本号 → 日志 → 门禁。

## 性能指标

未实测（瓦片叠加层，无前置可比数据）。

## 测试方案

### Agent 已执行

- `tsc --noEmit`（frontend，无新增类型错误）
- `python CheckStructureTree.py`（通过）
- `python CheckConfigRegistry.py`（通过；本次无新增配置 key，不涉及登记）

### 待用户实机验证

1. `npm run dev` 启动前端，底图选择器（URL 参数 `l` 或界面切换）选择新的「Google影像水系」预设；
2. 预期：卫星影像上叠加半透明水系（河流/湖泊轮廓），与影像套合无偏移（gcj2wgs 纠偏生效）；
3. 图层管理面板中可单独开关「Google水系(WGS)」图层；
4. 生产环境 `npm run build` 后，瓦片请求域名应为 `https://negiao-webgis.hf.space/proxy/gcj2wgs/https://mt0.google.com/...`。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/ol/basemap/constants/basemapConfig.ts` | 新增 `imagery_google_water` 图层定义 |
| `frontend/src/domains/common/basemap/basemapPresets.ts` | 末尾追加「Google影像水系」预设 |
| `README.md` | 版本号三处更新至 V3.5.23 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.5.23 条目 |
| `Docs/LLM_record/26-08/2026-08-18/2026-08-18-add-google-water-layer.md` | 本日志 |

## 遗留与风险

- ⚠️ 未验证：Google 对 `&&` 与 `%7C` 编码的容忍度——已按既有惯例归一，若实机出现瓦片 4xx，回退为原始编码重试；
- ⚠️ 未验证：水系图层在不同缩放级（z 上限约 19-20）的显示完整度；
- 水系图层为透明底叠加层，单独使用（无影像垫底）时几乎不可见，属预期行为。
