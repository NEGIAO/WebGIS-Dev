/**
 * 天地图全量矢量抓取（浏览器版，12 层）。
 *
 * 解码链逐函数对齐权威实现 tdt_vector_fetch.mjs（三编码 + Value 整数族 + ClosePath 修复）：
 *   - 修复①：几何链此前只做嵌套下降（pfind），从不直读命令流——真实瓦片 f1 几何即命令流
 *     （MoveTo2/LineTo3/ClosePath7 + zigzag 差分），导致所有标准层 0 要素；
 *     现对齐 mjs findCommands：先直读命令流，失败再按 f1 深嵌套递归（depth≤8）。
 *   - 修复②：前导层此前从 body（=raw.slice(5)）解析，实际前导层位于 raw[0..]（0x1a + XOR 长度
 *     + XOR 感知内容），导致前导层永远丢失；现对齐 mjs decodeTileFull 从 raw 解析。
 *
 * 实现按职责分层在同目录 `tdt/` 下：
 * - `tdt/tileMath`   经纬度↔瓦片、pk 编码、瓦片数估算、并发常量
 * - `tdt/pbf`        protobuf 底层（varint/字段/命令/值/标签/图层/要素）
 * - `tdt/decode`     三种编码变体（标准 / 前导层 / 裸块）解析与统一出口
 * - `tdt/fetch`      瓦片抓取（重试/限速/进度）与 GeoJSON 下载
 *
 * 拓扑分层见 tdtVectorLayers.ts 码表与 tdtVectorTopology.ts。
 */

export {
    ALL_TDT_VECTOR_LAYERS,
    normalizeTdtLayerSelection,
} from './tdtVectorLayers';
export { topoTdtVectorLayers } from './tdtVectorTopology';
export { TILE_HOSTS, estimateTdtVectorTiles, lngLatToXyz, pkEncode, sleep } from './tdt/tileMath';
export { decodeTdtVectorTile } from './tdt/decode';
export { downloadVectorGeoJSON, fetchTdtVectorLayers } from './tdt/fetch';


