const COORD_SCALE = 1e6;
const LNG_OFFSET_SCALED = 180 * COORD_SCALE;
const LAT_OFFSET_SCALED = 90 * COORD_SCALE;
const LNG_MAX_SCALED = 360 * COORD_SCALE;
const LAT_MAX_SCALED = 180 * COORD_SCALE;

const LAT_BITS = 28n;
const LAT_MASK = (1n << LAT_BITS) - 1n;
const MAX_PACKED = (BigInt(LNG_MAX_SCALED) << LAT_BITS) | BigInt(LAT_MAX_SCALED);

const RADIUS_SCALE = 10;
const RADIUS_MAX_SCALED = 500000 * RADIUS_SCALE;
const RADIUS_BITS = 23n;
const RADIUS_MASK = (1n << RADIUS_BITS) - 1n;
const MAX_COMPASS_PACKED = (MAX_PACKED << RADIUS_BITS) | BigInt(RADIUS_MAX_SCALED);

const CESIUM_HEIGHT_SCALE = 100;
const CESIUM_HEIGHT_MAX_SCALED = 50000000 * CESIUM_HEIGHT_SCALE;
const CESIUM_HEIGHT_BITS = 33n;
const CESIUM_HEIGHT_MASK = (1n << CESIUM_HEIGHT_BITS) - 1n;
const CESIUM_HEADING_SCALE = 1000;
const CESIUM_HEADING_MAX_SCALED = 360 * CESIUM_HEADING_SCALE;
const CESIUM_HEADING_BITS = 19n;
const CESIUM_HEADING_MASK = (1n << CESIUM_HEADING_BITS) - 1n;
const CESIUM_PITCH_OFFSET = 90;
const CESIUM_PITCH_SCALE = 1000;
const CESIUM_PITCH_MAX_SCALED = 180 * CESIUM_PITCH_SCALE;
const CESIUM_PITCH_BITS = 18n;
const CESIUM_PITCH_MASK = (1n << CESIUM_PITCH_BITS) - 1n;
const CESIUM_ROLL_OFFSET = 180;
const CESIUM_ROLL_SCALE = 1000;
const CESIUM_ROLL_MAX_SCALED = 360 * CESIUM_ROLL_SCALE;
const CESIUM_ROLL_BITS = 19n;
const CESIUM_ROLL_MASK = (1n << CESIUM_ROLL_BITS) - 1n;
const ANGLE_BOUNDARY_EPSILON = 1e-9;

/**
 * 将 Cesium 相机字段按固定顺序封包为 BigInt。
 * 定义在 MAX_CESIUM_CAMERA_PACKED 之前，避免依赖函数提升（hoisting）。
 * @param {{packedPos: bigint, heightScaled: number, headingScaled: number, pitchScaled: number, rollScaled: number}} fields
 * @returns {bigint} 封包后的相机状态
 */
function packCesiumCameraFields({ packedPos, heightScaled, headingScaled, pitchScaled, rollScaled }) {
    let packed = BigInt(packedPos);
    packed = (packed << CESIUM_HEIGHT_BITS) | BigInt(heightScaled);
    packed = (packed << CESIUM_HEADING_BITS) | BigInt(headingScaled);
    packed = (packed << CESIUM_PITCH_BITS) | BigInt(pitchScaled);
    packed = (packed << CESIUM_ROLL_BITS) | BigInt(rollScaled);
    return packed;
}

const MAX_CESIUM_CAMERA_PACKED = packCesiumCameraFields({
    packedPos: MAX_PACKED,
    heightScaled: CESIUM_HEIGHT_MAX_SCALED,
    headingScaled: CESIUM_HEADING_MAX_SCALED,
    pitchScaled: CESIUM_PITCH_MAX_SCALED,
    rollScaled: CESIUM_ROLL_MAX_SCALED,
});

const CESIUM_POSE_PREFIX = 'p.';
const MAX_CESIUM_POSE_PACKED =
    (BigInt(CESIUM_HEADING_MAX_SCALED) << (CESIUM_PITCH_BITS + CESIUM_ROLL_BITS)) |
    (BigInt(CESIUM_PITCH_MAX_SCALED) << CESIUM_ROLL_BITS) |
    BigInt(CESIUM_ROLL_MAX_SCALED);

// 打乱后的 Base62 字符表（非默认顺序）
const BASE62_ALPHABET = '4CiHUu0oP7ahIA29xNQtgbOMDs6V3nREfw1mGlvWeqSjFT8dJXpBLYKr5kzyZc';
const BASE = 62n;
const MIN_CODE_LENGTH = 8;

const BASE62_INDEX_MAP = (() => {
    const map = new Map();
    for (let i = 0; i < BASE62_ALPHABET.length; i += 1) {
        map.set(BASE62_ALPHABET[i], BigInt(i));
    }
    return map;
})();

function encodeBase62(value) {
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

function decodeBase62(code) {
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
export const encodePos = (lng, lat) => {
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
export const decodePos = (code) => {
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
 * 编码罗盘 URL 状态：经度 + 纬度 + 半径（米）。
 *
 * @param {number|string} lng
 * @param {number|string} lat
 * @param {number|string} radiusMeters
 * @returns {string} 短字符串；异常时返回 '0'
 */
export const encodeCompassState = (lng, lat, radiusMeters) => {
    const normalizedLng = Number(lng);
    const normalizedLat = Number(lat);
    const normalizedRadius = Number(radiusMeters);

    if (!Number.isFinite(normalizedLng) || !Number.isFinite(normalizedLat)) {
        return '0';
    }

    if (normalizedLng < -180 || normalizedLng > 180 || normalizedLat < -90 || normalizedLat > 90) {
        return '0';
    }

    if (
        !Number.isFinite(normalizedRadius) ||
        normalizedRadius < 0 ||
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
    const packed = (packedPos << RADIUS_BITS) | BigInt(radiusScaled);

    const encoded = encodeBase62(packed);
    if (!encoded) return '0';

    if (encoded.length >= MIN_CODE_LENGTH) return encoded;
    return encoded.padStart(MIN_CODE_LENGTH, BASE62_ALPHABET[0]);
};

/**
 * 解码罗盘 URL 状态：经度 + 纬度 + 半径（米）。
 *
 * @param {string} code
 * @returns {{lng:number,lat:number,radius:number}|null}
 */
export const decodeCompassState = (code) => {
    const text = String(code || '').trim();
    if (!text || text === '0') return null;

    const packed = decodeBase62(text);
    if (packed === null || packed < 0n || packed > MAX_COMPASS_PACKED) {
        return null;
    }

    const packedPos = packed >> RADIUS_BITS;
    const radiusScaled = Number(packed & RADIUS_MASK);

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
        radiusScaled > RADIUS_MAX_SCALED
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
    };
};

/**
 * 编码 Cesium 相机视角状态：相机经纬度、高度和姿态。
 * @param {{lng:number|string, lat:number|string, height:number|string, heading?:number|string, pitch?:number|string, roll?:number|string}} state
 * @returns {string} Cesium 相机视角短码；异常时返回 '0'
 */
export const encodeCesiumCameraState = (state = {}) => {
    if (!state || typeof state !== 'object') return '0';

    const normalizedLng = Number(state.lng);
    const normalizedLat = Number(state.lat);
    const normalizedHeight = Number(state.height);
    const normalizedHeading = normalizeHeadingDegrees(state.heading ?? 0);
    const normalizedPitch = normalizePitchDegrees(state.pitch ?? -90);
    const normalizedRoll = normalizeRollDegrees(state.roll ?? 0);

    if (!Number.isFinite(normalizedLng) || !Number.isFinite(normalizedLat)) return '0';
    if (
        normalizedHeading === null ||
        normalizedPitch === null ||
        normalizedRoll === null
    ) {
        return '0';
    }
    if (normalizedLng < -180 || normalizedLng > 180 || normalizedLat < -90 || normalizedLat > 90) {
        return '0';
    }
    if (
        !Number.isFinite(normalizedHeight) ||
        normalizedHeight < 0 ||
        normalizedHeight > CESIUM_HEIGHT_MAX_SCALED / CESIUM_HEIGHT_SCALE
    ) {
        return '0';
    }
    if (!Number.isFinite(normalizedPitch) || normalizedPitch < -90 || normalizedPitch > 90) {
        return '0';
    }

    const lngScaled = Math.round((normalizedLng + 180) * COORD_SCALE);
    const latScaled = Math.round((normalizedLat + 90) * COORD_SCALE);
    const heightScaled = Math.round(normalizedHeight * CESIUM_HEIGHT_SCALE);
    const headingScaled = Math.round(normalizedHeading * CESIUM_HEADING_SCALE);
    const pitchScaled = Math.round((normalizedPitch + CESIUM_PITCH_OFFSET) * CESIUM_PITCH_SCALE);
    const rollScaled = Math.round((normalizedRoll + CESIUM_ROLL_OFFSET) * CESIUM_ROLL_SCALE);

    if (
        lngScaled < 0 ||
        lngScaled > LNG_MAX_SCALED ||
        latScaled < 0 ||
        latScaled > LAT_MAX_SCALED ||
        heightScaled < 0 ||
        heightScaled > CESIUM_HEIGHT_MAX_SCALED ||
        headingScaled < 0 ||
        headingScaled > CESIUM_HEADING_MAX_SCALED ||
        pitchScaled < 0 ||
        pitchScaled > CESIUM_PITCH_MAX_SCALED ||
        rollScaled < 0 ||
        rollScaled > CESIUM_ROLL_MAX_SCALED
    ) {
        return '0';
    }

    const packedPos = (BigInt(lngScaled) << LAT_BITS) | BigInt(latScaled);
    const packed = packCesiumCameraFields({
        packedPos,
        heightScaled,
        headingScaled,
        pitchScaled,
        rollScaled,
    });

    const encoded = encodeBase62(packed);
    if (!encoded) return '0';
    if (encoded.length >= MIN_CODE_LENGTH) return encoded;
    return encoded.padStart(MIN_CODE_LENGTH, BASE62_ALPHABET[0]);
};

/**
 * 编码 Cesium 相机姿态状态（不包含位置和高度）。
 * @param {{heading?:number|string, pitch?:number|string, roll?:number|string}} state
 * @returns {string} p.<base62> 姿态短码；异常时返回 '0'
 */
export const encodeCesiumPoseState = (state = {}) => {
    if (!state || typeof state !== 'object') return '0';

    const normalizedHeading = normalizeHeadingDegrees(state.heading ?? 0);
    const normalizedPitch = normalizePitchDegrees(state.pitch ?? -90);
    const normalizedRoll = normalizeRollDegrees(state.roll ?? 0);
    if (normalizedHeading === null || normalizedPitch === null || normalizedRoll === null) return '0';

    const headingScaled = Math.round(normalizedHeading * CESIUM_HEADING_SCALE);
    const pitchScaled = Math.round((normalizedPitch + CESIUM_PITCH_OFFSET) * CESIUM_PITCH_SCALE);
    const rollScaled = Math.round((normalizedRoll + CESIUM_ROLL_OFFSET) * CESIUM_ROLL_SCALE);
    if (
        headingScaled < 0 ||
        headingScaled > CESIUM_HEADING_MAX_SCALED ||
        pitchScaled < 0 ||
        pitchScaled > CESIUM_PITCH_MAX_SCALED ||
        rollScaled < 0 ||
        rollScaled > CESIUM_ROLL_MAX_SCALED
    ) {
        return '0';
    }

    let packed = BigInt(headingScaled);
    packed = (packed << CESIUM_PITCH_BITS) | BigInt(pitchScaled);
    packed = (packed << CESIUM_ROLL_BITS) | BigInt(rollScaled);

    const encoded = encodeBase62(packed);
    return encoded ? `${CESIUM_POSE_PREFIX}${encoded}` : '0';
};

/**
 * 解码 Cesium 相机姿态短码。
 * @param {string} code
 * @returns {{heading:number,pitch:number,roll:number}|null}
 */
export const decodeCesiumPoseState = (code) => {
    const text = String(code || '').trim();
    if (!text.startsWith(CESIUM_POSE_PREFIX)) return null;

    let packed = decodeBase62(text.slice(CESIUM_POSE_PREFIX.length));
    if (packed === null || packed < 0n || packed > MAX_CESIUM_POSE_PACKED) return null;

    const rollScaled = Number(packed & CESIUM_ROLL_MASK);
    packed >>= CESIUM_ROLL_BITS;
    const pitchScaled = Number(packed & CESIUM_PITCH_MASK);
    packed >>= CESIUM_PITCH_BITS;
    const headingScaled = Number(packed & CESIUM_HEADING_MASK);

    if (
        headingScaled < 0 ||
        headingScaled > CESIUM_HEADING_MAX_SCALED ||
        pitchScaled < 0 ||
        pitchScaled > CESIUM_PITCH_MAX_SCALED ||
        rollScaled < 0 ||
        rollScaled > CESIUM_ROLL_MAX_SCALED
    ) {
        return null;
    }

    return {
        heading: Number((headingScaled / CESIUM_HEADING_SCALE).toFixed(3)),
        pitch: Number((pitchScaled / CESIUM_PITCH_SCALE - CESIUM_PITCH_OFFSET).toFixed(3)),
        roll: Number((rollScaled / CESIUM_ROLL_SCALE - CESIUM_ROLL_OFFSET).toFixed(3)),
    };
};

/**
 * 解码 Cesium 相机视角短码。
 * @param {string} code
 * @returns {{lng:number,lat:number,height:number,heading:number,pitch:number,roll:number}|null}
 */
export const decodeCesiumCameraState = (code) => {
    const text = String(code || '').trim();
    if (!text || text === '0') return null;

    let packed = decodeBase62(text);
    if (packed === null || packed < 0n || packed > MAX_CESIUM_CAMERA_PACKED) return null;

    const rollScaled = Number(packed & CESIUM_ROLL_MASK);
    packed >>= CESIUM_ROLL_BITS;
    const pitchScaled = Number(packed & CESIUM_PITCH_MASK);
    packed >>= CESIUM_PITCH_BITS;
    const headingScaled = Number(packed & CESIUM_HEADING_MASK);
    packed >>= CESIUM_HEADING_BITS;
    const heightScaled = Number(packed & CESIUM_HEIGHT_MASK);
    const packedPos = packed >> CESIUM_HEIGHT_BITS;

    const lngScaled = Number(packedPos >> LAT_BITS);
    const latScaled = Number(packedPos & LAT_MASK);

    if (
        !Number.isFinite(lngScaled) ||
        !Number.isFinite(latScaled) ||
        !Number.isFinite(heightScaled) ||
        !Number.isFinite(headingScaled) ||
        !Number.isFinite(pitchScaled) ||
        !Number.isFinite(rollScaled)
    ) {
        return null;
    }

    if (
        lngScaled < 0 ||
        lngScaled > LNG_MAX_SCALED ||
        latScaled < 0 ||
        latScaled > LAT_MAX_SCALED ||
        heightScaled < 0 ||
        heightScaled > CESIUM_HEIGHT_MAX_SCALED ||
        headingScaled < 0 ||
        headingScaled > CESIUM_HEADING_MAX_SCALED ||
        pitchScaled < 0 ||
        pitchScaled > CESIUM_PITCH_MAX_SCALED ||
        rollScaled < 0 ||
        rollScaled > CESIUM_ROLL_MAX_SCALED
    ) {
        return null;
    }

    const lng = (lngScaled - LNG_OFFSET_SCALED) / COORD_SCALE;
    const lat = (latScaled - LAT_OFFSET_SCALED) / COORD_SCALE;
    const height = heightScaled / CESIUM_HEIGHT_SCALE;
    const heading = headingScaled / CESIUM_HEADING_SCALE;
    const pitch = pitchScaled / CESIUM_PITCH_SCALE - CESIUM_PITCH_OFFSET;
    const roll = rollScaled / CESIUM_ROLL_SCALE - CESIUM_ROLL_OFFSET;

    return {
        lng: Number(lng.toFixed(6)),
        lat: Number(lat.toFixed(6)),
        height: Number(height.toFixed(2)),
        heading: Number(heading.toFixed(3)),
        pitch: Number(pitch.toFixed(3)),
        roll: Number(roll.toFixed(3)),
    };
};

function normalizeHeadingDegrees(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return ((num % 360) + 360) % 360;
}

function normalizePitchDegrees(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    if (num < -90 - ANGLE_BOUNDARY_EPSILON || num > 90 + ANGLE_BOUNDARY_EPSILON) {
        return null;
    }
    return Math.max(-90, Math.min(90, num));
}

function normalizeRollDegrees(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return ((((num + 180) % 360) + 360) % 360) - 180;
}
