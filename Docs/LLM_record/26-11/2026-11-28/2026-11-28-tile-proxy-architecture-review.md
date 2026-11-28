# 2026-11-28 暂存区瓦片代理架构审核 + 架构文档更新

- **日期与时间**：2026-11-28 15:25
- **任务等级**：L3 审核 + 文档更新（用户明确指令，依 Force_command §0 优先级 1 视为批准）
- **本次版本**：V3.7.40（V3.7.39 已被并行会话占用，按 §5 顺延）

## 问题分析

用户要求：核查暂存区代码，审核新增的底图瓦片代理架构和逻辑；更新架构文档以实际代码为准。

审核 `git diff --cached` 的 124 个文件，聚焦代理相关实现，对照 `Docs/Architecture/basemap-catalog-redesign.md` 找偏差。

## 审核发现

### 1. 代理实为三层体系（文档完全未覆盖）

| 层 | 触发 | 实现 | 配置 |
|---|---|---|---|
| L1 定义层静态代理 | `correction != 'none'` / `proxy:'proxy'` | `definitions/resolveTileUrl.ts` | 无开关 |
| L2 显式全量代理 | `TILE_PROXY_MODE=always` | OL `tileLifecycle.ts` / Cesium `wrapProviderWithFetchFallback()` | `VITE_TILE_PROXY_MODE` |
| L3 容灾回退代理 | 直连 403/429/网络错误 | 同上 | `VITE_TILE_AUTO_PROXY_ENABLED`（V3.7.39 新增，缺省 0） |

后端契约：`/proxy/{target_url:path}`（通用透传）+ `/proxy/{segment}/{url}`（纠偏重采样）。

### 2. 代码缺陷：死参数 `tileProxyMode`

`TileUrlContext`（`resolveTileUrl.ts:33`）声明 `tileProxyMode: string`，函数体从未读取；`createOlSource.ts:64` 与 `basemapProviderFactory.ts:395` 仍传入。三层分工中 L2/L3 由引擎侧直接读全局 `TILE_PROXY_MODE`，定义层不需要该值。→ 删除字段与两处传入。

### 3. 设计差异（记录不强行统一）

- 同源排除：OL `canProxyTileUrl()` 排除同源 URL、`/proxy/*`、`/tiles/*`；Cesium `buildCesiumTileProxyUrl()` 仅排除 `TILE_PROXY_MODE=off`。潜在风险（同源自代理环）未触发，因为 Cesium 瓦片多为外部域。列为观察项。
- OSM 德国镜像：仅 Cesium 侧有（检测 6987 字节 403 拦截图 → 回退），OL 靠 `prioritizeTileSourceRequest` 的 Referrer 策略规避。

### 4. 暂存区卫生

`frontend/src/domains/common/basemap/renumber.cjs`（临时编号脚本，14:44 遗留、零引用）被 stage。→ 删除。

## 修改内容

1. `definitions/resolveTileUrl.ts`：删 `tileProxyMode` 字段，加设计原则注释。
2. `ol/basemap/loaders/createOlSource.ts`、`cesium/constants/basemapProviderFactory.ts`：删传入；OL 侧 `TILE_PROXY_MODE` 导入一并删（Cesium 侧仍用于 L2/L3，保留）。
3. `Docs/Architecture/basemap-catalog-redesign.md`：新增 §3.4 瓦片代理架构（表格 + Mermaid 三层触发图 + 后端契约 + 双引擎差异表 + 配置开关表 + 设计原则）；§3.3 要点修正「auto 回退」表述；§8 增阶段 9 审核记录。
4. 方案文档归档 `Docs/TODO/archive/`，TODO 索引补核验依据。
5. README 三处 + CHANGELOG V3.7.40 条目。

## 验证

- `vue-tsc --noEmit`：0 错误。
- `check:basemap-catalog`：OK（181 presets）；`check:layer-definitions`：OK（205）。
- `CheckStructureTree`：769/769；`CheckConfigRegistry`：全绿（12 个 VITE_ 配置含新增自动代理开关）。
- `tileProxyMode` 全仓零残留；临时脚本已删除。

## 遗留与风险

- Cesium 同源 URL 代理排除缺失：理论风险，当前无实际触发；若将来 Cesium 加载同源瓦片并开启容灾代理，需补 `canProxyTileUrl` 等价逻辑。
- 定义层 `proxy:'auto'` 语义现明确为「只返回原始 URL」，与 `TILE_PROXY_MODE` 运行时策略解耦——架构文档已固化此约定。

## 变更文件清单

- `frontend/src/domains/common/basemap/definitions/resolveTileUrl.ts`
- `frontend/src/domains/ol/basemap/loaders/createOlSource.ts`
- `frontend/src/domains/cesium/constants/basemapProviderFactory.ts`
- `frontend/src/domains/common/basemap/renumber.cjs`（删除）
- `Docs/Architecture/basemap-catalog-redesign.md`
- `Docs/TODO/archive/2026-11-28-tile-proxy-architecture-review.md`、`Docs/TODO/README.md`
- `README.md`、`Docs/Guide/CHANGELOG.md`、本日志
