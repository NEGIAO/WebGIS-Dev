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
} from '../coordinateFormatter';

export {
    generatePointName,
    normalizeCoordinatePair,
    normalizeCoordinateValue,
    processCoordinateInput,
    validateCoordinateInput,
} from '../coordinateInputHandler';

export {
    getFirstValidLabel,
    isLabelValid,
    isValidLabel,
    sanitizeLabel,
    validateLabels,
} from '../labelValidator';

export { decodePos, encodePos } from '../url/crypto';

export { parseAmapRectangleToExtent } from '../amapRectangle';
