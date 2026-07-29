/**
 * 业务工具 barrel — 聚合坐标格式化、输入处理、标签校验等纯工具函数
 */

export {
    COORDINATE_FORMATS,
    DECIMAL_PLACES,
    decimalToDMS,
    dmsToDecimal,
    formatCoordinate,
    formatSingleCoordinate,
    getDirectionSuffix,
    isValidCoordinate,
    normalizeCoordinate,
    parseCoordinate,
} from '@common/map-view/coordinateFormatter';

export {
    generatePointName,
    normalizeCoordinatePair,
    normalizeCoordinateValue,
    processCoordinateInput,
    validateCoordinateInput,
} from '@ol/search/utils/coordinateInputHandler';

export {
    getFirstValidLabel,
    isLabelValid,
    isValidLabel,
    sanitizeLabel,
    validateLabels,
} from '@common/utils/labelValidator';

export { decodePos, encodePos } from '@common/url-state/crypto';

export { parseAmapRectangleToExtent } from '@ol/utils/amapRectangle';
