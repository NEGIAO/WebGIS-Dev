export {
    UNSUPPORTED_PROJECTED_CRS_CODE,
    UNSUPPORTED_PROJECTED_CRS_MESSAGE,
    sanitizeWktText,
    createUnsupportedProjectedCrsError,
    isUnsupportedProjectedCrsError,
    resolveDatasetProjection,
    reprojectGeoJSON,
} from './crs/crs-engine';
