# 2026-11-28 修复 GeoQ 水系重复 id（零散修补）

- **日期与时间**：2026-11-28 15:11
- **任务等级**：L1 微改（删除重复定义 + 重编号）
- **本次版本**：V3.7.38（V3.7.37 已被并行会话占用，按 §5 顺延）

## 问题分析

用户截图：`[basemap-definitions] 图层定义校验失败：图层 vector_geoq_hydro 的 id 重复`

定位到 `category-electronic.ts` 两条同 id 定义：

| order | id | name | coord | correction |
|---|---|---|---|---|
| 91 | `vector_geoq_hydro` | GeoQ水(GCJ) | GCJ02 | 无（原始版） |
| 92 | `vector_geoq_hydro` | GeoQ水(wgs84) | WGS84 | gcj2wgs（派生版） |

**根因**：并行会话新增公共底图时插入了 WGS 派生副本，但误用了原始版 id。正确的派生定义 `vector_geoq_hydro_wgs` 已存在于文件后段（preset `vector_geoq_hydro_wgs_preset` 正常引用它）。重复块是多余插入，且缩进异常（` {` 少一格）。

## 修改内容

1. 删除 `category-electronic.ts` 中 order 92 的重复块（`vector_geoq_hydro` / GeoQ水(wgs84)）。
2. 205 条定义按文件字母序 + 出现顺序重编号为连续 1..205。

## 修改原因

id 重复触发 `validate.ts` 硬校验导致启动失败；删除多余副本恢复唯一性。

## 影响范围

仅定义层数据与 order 编号；preset 数量与编号不变（重复的 WGS 派生预设本来就已指向正确的 `vector_geoq_hydro_wgs`）。

## 验证

- `vue-tsc --noEmit`：0 错误。
- `check:layer-definitions`：OK（205 definitions, orders 1..205, stacks resolve）。
- `check:basemap-catalog`：OK（181 presets, 20 recommended）。
- `npm run build`：通过。
- id 唯一性：零重复；order 连续性：1..205 无空洞。
- 结构树 769/769、配置门禁全绿。

## 变更文件清单

- `frontend/src/domains/common/basemap/definitions/category-electronic.ts`（删重复块 + 重编号）
- 其余五个 category 分片（仅重编号）
- `README.md`、`Docs/Guide/CHANGELOG.md`、本日志

## 遗留与风险

- 本次与并行会话多次交叠（V3.7.34 新增底图、V3.7.37 修另一处重复 id）。若后续再出现类似重复，检查 `check:layer-definitions` 的 id 唯一性断言即可快速定位。
