/** 位置 / 罗盘状态短码编解码（自定义 pack 方案，位宽见常量区） */
import { DEFAULT_COMPASS_THEME_INDEX, getCompassThemeCid, getCompassThemeIndex } from '../compassThemeCode';

export const COORD_SCALE = 1e6;
export const LNG_OFFSET_SCALED = 180 * COORD_SCALE;
export const LAT_OFFSET_SCALED = 90 * COORD_SCALE;
export const LNG_MAX_SCALED = 360 * COORD_SCALE;
export const LAT_MAX_SCALED = 180 * COORD_SCALE;

export const LAT_BITS = 28n;
export const LAT_MASK = (1n << LAT_BITS) - 1n;
const MAX_PACKED = (BigInt(LNG_MAX_SCALED) << LAT_BITS) | BigInt(LAT_MAX_SCALED);

const RADIUS_SCALE = 10;
/** 历史短码（无前缀）：半径 23 bit，上限 500 km。保留解码以兼容旧分享链接。 */
const LEGACY_RADIUS_MAX_SCALED = 500000 * RADIUS_SCALE;
const LEGACY_RADIUS_BITS = 23n;
const LEGACY_RADIUS_MASK = (1n << LEGACY_RADIUS_BITS) - 1n;
const LEGACY_MAX_COMPASS_PACKED =
    (MAX_PACKED << LEGACY_RADIUS_BITS) | BigInt(LEGACY_RADIUS_MAX_SCALED);

/** V2 短码（r. 前缀）：半径 28 bit，上限 20000 km，与 UI 上限对齐。 */
const RADIUS_MAX_SCALED = 20000000 * RADIUS_SCALE;
const RADIUS_BITS = 28n;
const RADIUS_MASK = (1n << RADIUS_BITS) - 1n;
const MAX_COMPASS_PACKED = (MAX_PACKED << RADIUS_BITS) | BigInt(RADIUS_MAX_SCALED);
const COMPASS_STATE_V2_PREFIX = 'r.';

/** V3 短码（t. 前缀）：在 V2 基础上追加 3 bit 主题编号，五种罗盘样式 0~4。 */
const THEME_BITS = 3n;
const THEME_MASK = (1n << THEME_BITS) - 1n;
const MAX_THEME_INDEX = 4;
const COMPASS_STATE_V3_PREFIX = 't.';
const MAX_COMPASS_PACKED_V3 = (MAX_COMPASS_PACKED << THEME_BITS) | THEME_MASK;

export const CESIUM_HEIGHT_SCALE = 100;
export const CESIUM_HEIGHT_MAX_SCALED = 50000000 * CESIUM_HEIGHT_SCALE;
export const CESIUM_HEIGHT_BITS = 33n;
export const CESIUM_HEIGHT_MASK = (1n << CESIUM_HEIGHT_BITS) - 1n;
export const CESIUM_HEADING_SCALE = 1000;
export const CESIUM_HEADING_MAX_SCALED = 360 * CESIUM_HEADING_SCALE;
export const CESIUM_HEADING_BITS = 19n;
export const CESIUM_HEADING_MASK = (1n << CESIUM_HEADING_BITS) - 1n;
export const CESIUM_PITCH_OFFSET = 90;
export const CESIUM_PITCH_SCALE = 1000;
export const CESIUM_PITCH_MAX_SCALED = 180 * CESIUM_PITCH_SCALE;
export const CESIUM_PITCH_BITS = 18n;
export const CESIUM_PITCH_MASK = (1n << CESIUM_PITCH_BITS) - 1n;
export const CESIUM_ROLL_OFFSET = 180;
export const CESIUM_ROLL_SCALE = 1000;
export const CESIUM_ROLL_MAX_SCALED = 360 * CESIUM_ROLL_SCALE;
export const CESIUM_ROLL_BITS = 19n;
export const CESIUM_ROLL_MASK = (1n << CESIUM_ROLL_BITS) - 1n;
export const ANGLE_BOUNDARY_EPSILON = 1e-9;

/**
 * 将 Cesium 相机字段按固定顺序封包为 BigInt。
 * 定义在 MAX_CESIUM_CAMERA_PACKED 之前，避免依赖函数提升（hoisting）。
 * @param {{packedPos: bigint, heightScaled: number, headingScaled: number, pitchScaled: number, rollScaled: number}} fields
 * @returns {bigint} 封包后的相机状态
 */
export function packCesiumCameraFields({
    packedPos,
    heightScaled,
    headingScaled,
    pitchScaled,
    rollScaled,
}: {
    packedPos: bigint | number;
    heightScaled: number;
    headingScaled: number;
    pitchScaled: number;
    rollScaled: number;
}) {
    let packed = BigInt(packedPos);
    packed = (packed << CESIUM_HEIGHT_BITS) | BigInt(heightScaled);
    packed = (packed << CESIUM_HEADING_BITS) | BigInt(headingScaled);
    packed = (packed << CESIUM_PITCH_BITS) | BigInt(pitchScaled);
    packed = (packed << CESIUM_ROLL_BITS) | BigInt(rollScaled);
    return packed;
}

export const MAX_CESIUM_CAMERA_PACKED = packCesiumCameraFields({
    packedPos: MAX_PACKED,
    heightScaled: CESIUM_HEIGHT_MAX_SCALED,
    headingScaled: CESIUM_HEADING_MAX_SCALED,
    pitchScaled: CESIUM_PITCH_MAX_SCALED,
    rollScaled: CESIUM_ROLL_MAX_SCALED,
});

export const CESIUM_POSE_PREFIX = 'p.';
export const MAX_CESIUM_POSE_PACKED =
    (BigInt(CESIUM_HEADING_MAX_SCALED) << (CESIUM_PITCH_BITS + CESIUM_ROLL_BITS)) |
    (BigInt(CESIUM_PITCH_MAX_SCALED) << CESIUM_ROLL_BITS) |
    BigInt(CESIUM_ROLL_MAX_SCALED);

// 打乱后的 Base62 字符表（非默认顺序）
export const BASE62_ALPHABET = '4CiHUu0oP7ahIA29xNQtgbOMDs6V3nREfw1mGlvWeqSjFT8dJXpBLYKr5kzyZc';
const BASE = 62n;
export const MIN_CODE_LENGTH = 8;

const BASE62_INDEX_MAP = (() => {
    const map = new Map();
    for (let i = 0; i < BASE62_ALPHABET.length; i += 1) {
        map.set(BASE62_ALPHABET[i], BigInt(i));
    }
    return map;
})();

export function encodeBase62(value: any) {
    let current = BigInt(value);
    if (current < 0n) return '';
    if (current === 0n) return BASE62_ALPHABET[0];

    const chars = [];
    while (current > 0n) {
        const remainder = current % BASE;
        chars.push(BASE62_ALPHABET[Number(remainder)]);
        current /= BASE;
    }

    return chars.reverse().join('');
}

export function decodeBase62(code: any) {
    const text = String(code || '').trim();
    if (!text) return null;

    let value = 0n;
    for (let i = 0; i < text.length; i += 1) {
        const index = BASE62_INDEX_MAP.get(text[i]);
        if (index === undefined) return null;
        value = value * BASE + index;
    }

    return value;
}

/**
 * 经纬度编码为短字符串。
 * 经纬度编码为短字符串。
 * - 保留 6 位小数
 * - lng 平移 +180，lat 平移 +90
 * - 使用 BigInt 位封包，再进行自定义 Base62 编码
 *
 * @param {number|string} lng
 * @param {number|string} lat
 * @returns {string} 8-10 位左右短字符串；异常时返回 '0'
 */
export const encodePos = (lng: number | string, lat: number | string) => {
    const normalizedLng = Number(lng);
    const normalizedLat = Number(lat);

    if (!Number.isFinite(normalizedLng) || !Number.isFinite(normalizedLat)) {
        return '0';
    }

    if (normalizedLng < -180 || normalizedLng > 180 || normalizedLat < -90 || normalizedLat > 90) {
        return '0';
    }

    const lngScaled = Math.round((normalizedLng + 180) * COORD_SCALE);
    const latScaled = Math.round((normalizedLat + 90) * COORD_SCALE);

    if (
        lngScaled < 0 ||
        lngScaled > LNG_MAX_SCALED ||
        latScaled < 0 ||
        latScaled > LAT_MAX_SCALED
    ) {
        return '0';
    }

    const packed = (BigInt(lngScaled) << LAT_BITS) | BigInt(latScaled);
    const encoded = encodeBase62(packed);
    if (!encoded) return '0';

    if (encoded.length >= MIN_CODE_LENGTH) return encoded;
    return encoded.padStart(MIN_CODE_LENGTH, BASE62_ALPHABET[0]);
};

/**
 * 短字符串解码为经纬度。
 *
 * @param {string} code
 * @returns {{lng:number,lat:number}|null}
 */
export const decodePos = (code: any) => {
    const text = String(code || '').trim();
    if (!text || text === '0') return null;

    const packed = decodeBase62(text);
    if (packed === null || packed < 0n || packed > MAX_PACKED) {
        return null;
    }

    const lngScaled = Number(packed >> LAT_BITS);
    const latScaled = Number(packed & LAT_MASK);

    if (!Number.isFinite(lngScaled) || !Number.isFinite(latScaled)) {
        return null;
    }

    if (
        lngScaled < 0 ||
        lngScaled > LNG_MAX_SCALED ||
        latScaled < 0 ||
        latScaled > LAT_MAX_SCALED
    ) {
        return null;
    }

    const lng = (lngScaled - LNG_OFFSET_SCALED) / COORD_SCALE;
    const lat = (latScaled - LAT_OFFSET_SCALED) / COORD_SCALE;

    return {
        lng: Number(lng.toFixed(6)),
        lat: Number(lat.toFixed(6)),
    };
};

/**
 * 编码罗盘 URL 状态：经度 + 纬度 + 半径（米）+ 主题编号。
 *
 * 主题可传 cid 字符串或 0~4 数字；旧调用只传前三项时默认古朱砂（0）。
 *
 * @param {number|string} lng
 * @param {number|string} lat
 * @param {number|string} radiusMeters
 * @param {number|string} theme 主题 cid 或编号，默认古朱砂
 * @returns {string} 短字符串；异常时返回 '0'
 */
export const encodeCompassState = (
    lng: number | string,
    lat: number | string,
    radiusMeters: number | string,
    theme: number | string = DEFAULT_COMPASS_THEME_INDEX,
) => {
    const normalizedLng = Number(lng);
    const normalizedLat = Number(lat);
    const normalizedRadius = Number(radiusMeters);
    const themeIndex = getCompassThemeIndex(theme);

    if (!Number.isFinite(normalizedLng) || !Number.isFinite(normalizedLat)) {
        return '0';
    }

    if (normalizedLng < -180 || normalizedLng > 180 || normalizedLat < -90 || normalizedLat > 90) {
        return '0';
    }

    // 半径为 0 无业务意义（罗盘不可见），属脏值：编码为 '0' 而非合法短码，
    // 否则会写出 (0,0,0) 这类「解码成功但不可用」的 cs（见 V3.7.10 日志）。
    if (
        !Number.isFinite(normalizedRadius) ||
        normalizedRadius <= 0 ||
        normalizedRadius > RADIUS_MAX_SCALED / RADIUS_SCALE
    ) {
        return '0';
    }

    const lngScaled = Math.round((normalizedLng + 180) * COORD_SCALE);
    const latScaled = Math.round((normalizedLat + 90) * COORD_SCALE);
    const radiusScaled = Math.round(normalizedRadius * RADIUS_SCALE);

    if (
        lngScaled < 0 ||
        lngScaled > LNG_MAX_SCALED ||
        latScaled < 0 ||
        latScaled > LAT_MAX_SCALED ||
        radiusScaled < 0 ||
        radiusScaled > RADIUS_MAX_SCALED
    ) {
        return '0';
    }

    const packedPos = (BigInt(lngScaled) << LAT_BITS) | BigInt(latScaled);
    const packedV2 = (packedPos << RADIUS_BITS) | BigInt(radiusScaled);
    const packed = (packedV2 << THEME_BITS) | BigInt(themeIndex);

    const encoded = encodeBase62(packed);
    if (!encoded) return '0';

    const body =
        encoded.length >= MIN_CODE_LENGTH
            ? encoded
            : encoded.padStart(MIN_CODE_LENGTH, BASE62_ALPHABET[0]);
    return `${COMPASS_STATE_V3_PREFIX}${body}`;
};

/**
 * 解码罗盘 URL 状态：经度 + 纬度 + 半径（米）+ 主题编号。
 * 无前缀按历史 23 bit 半径解码，r. 前缀按 V2 28 bit 解码，t. 前缀按 V3 28 bit + 3 bit 主题解码。
 * 历史短码主题回退为古朱砂（0）。
 *
 * @param {string} code
 * @returns {{lng:number,lat:number,radius:number,themeIndex:number,themeCid:string}|null}
 */
export const decodeCompassState = (code: any) => {
    let text = String(code || '').trim();
    if (!text || text === '0') return null;

    const isV3 = text.startsWith(COMPASS_STATE_V3_PREFIX);
    const isV2 = !isV3 && text.startsWith(COMPASS_STATE_V2_PREFIX);
    if (isV3) text = text.slice(COMPASS_STATE_V3_PREFIX.length);
    if (isV2) text = text.slice(COMPASS_STATE_V2_PREFIX.length);
    if (!text) return null;

    const radiusBits = isV3 || isV2 ? RADIUS_BITS : LEGACY_RADIUS_BITS;
    const radiusMask = isV3 || isV2 ? RADIUS_MASK : LEGACY_RADIUS_MASK;
    const radiusMaxScaled = isV3 || isV2 ? RADIUS_MAX_SCALED : LEGACY_RADIUS_MAX_SCALED;
    const maxPacked = isV3 ? MAX_COMPASS_PACKED_V3 : isV2 ? MAX_COMPASS_PACKED : LEGACY_MAX_COMPASS_PACKED;

    const packed = decodeBase62(text);
    if (packed === null || packed < 0n || packed > maxPacked) {
        return null;
    }

    let themeIndex = DEFAULT_COMPASS_THEME_INDEX;
    let packedCore = packed;
    if (isV3) {
        themeIndex = Number(packed & THEME_MASK);
        if (!Number.isInteger(themeIndex) || themeIndex < 0 || themeIndex > MAX_THEME_INDEX) {
            return null;
        }
        packedCore = packed >> THEME_BITS;
    }

    const packedPos = packedCore >> radiusBits;
    const radiusScaled = Number(packedCore & radiusMask);

    const lngScaled = Number(packedPos >> LAT_BITS);
    const latScaled = Number(packedPos & LAT_MASK);

    if (
        !Number.isFinite(lngScaled) ||
        !Number.isFinite(latScaled) ||
        !Number.isFinite(radiusScaled)
    ) {
        return null;
    }

    if (
        lngScaled < 0 ||
        lngScaled > LNG_MAX_SCALED ||
        latScaled < 0 ||
        latScaled > LAT_MAX_SCALED ||
        radiusScaled < 0 ||
        radiusScaled > radiusMaxScaled
    ) {
        return null;
    }

    const lng = (lngScaled - LNG_OFFSET_SCALED) / COORD_SCALE;
    const lat = (latScaled - LAT_OFFSET_SCALED) / COORD_SCALE;
    const radius = radiusScaled / RADIUS_SCALE;

    return {
        lng: Number(lng.toFixed(6)),
        lat: Number(lat.toFixed(6)),
        radius: Number(radius.toFixed(1)),
        themeIndex,
        themeCid: getCompassThemeCid(themeIndex),
    };
};

