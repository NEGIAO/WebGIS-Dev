export {
    UNSUPPORTED_PROJECTED_CRS_CODE,
    UNSUPPORTED_PROJECTED_CRS_MESSAGE,
    sanitizeWktText,
    createUnsupportedProjectedCrsError,
    isUnsupportedProjectedCrsError,
    resolveDatasetProjection,
    reprojectGeoJSON,
    ensureCrsDef,
} from './crs/crs-engine';

export type { ProjectionConfidence } from './crs/crs-engine';
