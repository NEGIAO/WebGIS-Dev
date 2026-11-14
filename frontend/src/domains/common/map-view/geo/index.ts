/**
 * 地理工具 barrel — 仅聚合 CRS（坐标参考系统）相关模块
 *
 * 包含：坐标转换（GCJ-02/WGS-84）、CRS 检测、投影注册、重投影
 */

export { gcj02ToWgs84, wgs84ToGcj02 } from '@common/data-import/crs/coordTransform';

export {
    detectGeoJSONProjection,
    detectProjectionFromKmlText,
    ensureProjectionAvailable,
    normalizeProjectionCode,
} from '@common/data-import/crs/crsUtils';

export {
    UNSUPPORTED_PROJECTED_CRS_CODE,
    UNSUPPORTED_PROJECTED_CRS_MESSAGE,
    createUnsupportedProjectedCrsError,
    isUnsupportedProjectedCrsError,
    reprojectGeoJSON,
    resolveDatasetProjection,
    sanitizeWktText,
} from '@common/data-import/crs-engine';

export {
    detectGeoJsonProjection,
    detectKmlProjectionHint,
    detectShpProjectionFromPrj,
    precheckArchiveCrs,
    resolveProjectionOrDefault,
} from '@common/data-import/crsAware';
