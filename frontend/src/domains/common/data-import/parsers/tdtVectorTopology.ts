/**
 * 天地图全量矢量分层拓扑（逐规则对齐 mjs tdt_vector_fetch.mjs §通用拓扑）。
 *
 * 输入：perLayer Map（层码 → records[{type,paths,props,partial,tx,ty,zoom,geomKind}]）。
 * 输出：每层独立 FeatureCollection + stats（in/out/union/fallback/fused/dedup/review…）。
 *
 * 分层规则（逐条对齐 mjs，零第三方依赖，复用 tdtBuildingTopology 的 Union 引擎）：
 *   1) BV 原样直出：不裁剪、不去重、不嵌套、不审计（补 _tile/_geom_partial 标记）。
 *   2) 有稳定 id 的面（CE 按 elemid / AP 按 objectid）：环先裁到 buffer 盒 [-82,4178]，
 *      再由 mergeIdPolygons 裁到瓦片【核心】[0,4096] → 同 id 跨瓦接缝才 Union →
 *      面积守恒校验（<99% 回退 union_fallback）→ 洞按包含嵌套。
 *   3) 无 id 覆盖面（CK/BM）：核心裁剪 → 按 S8 分组 → 完全一致去重 → 连通并查集 → Union。
 *   4) 有稳定 id 的点（respt/BI/AD）：buffer 亦保留，同 id 去重，MultiPoint 输出。
 *   5) 无 id 的线（AA/AB/AM/BK）：核心裁剪（逐段）+ 完全一致去重，接缝断开不断言拼接。
 *   6) 残余严格重叠审计：标 _topo_review=1，不改几何（AP 只报部分重叠）。
 *
 * 实现按职责分层在同目录 `tdt/topology/` 下：
 * - `geometry`  瓦片坐标/裁剪/面积/包含判定等几何原语
 * - `rings`     环嵌套、同 id 面合并、重叠审计
 * - `props`     标签提取、属性稳定化、环收集
 * - `builders`  面/线/点三类拓扑构建与 S8 融合
 */

import { topoTdtVectorLayers } from './tdt/topology/builders';
export { topoTdtVectorLayers };


