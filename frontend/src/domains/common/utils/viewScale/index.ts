/**
 * viewScale/index.js — 桶式导出（SSOT 入口）
 *
 * 使用方统一从 '@common/utils/viewScale' 导入；
 * 旧入口 '../viewScaleConverter' 已改为本桶的兼容再导出。
 */

export * from './constants';
export * from './precision';
export * from './webMercator';
export * from './openlayersScale';
export * from './cesiumScale';
export {
    olViewToCanonical,
    cesiumViewToCanonical,
    canonicalScaleToCesiumView,
    canonicalScaleToOlView,
    convertOlViewToCesium,
    convertCesiumViewToOl,
} from './conversion';

// 兼容别名：与旧 viewScaleConverter 命名对齐，减少调用方改动
export { olZoomToCesiumHeight, cesiumHeightToOlZoom } from './compat';
