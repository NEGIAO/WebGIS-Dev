const COORD_SCALE = 1e6;
const LNG_OFFSET_SCALED = 180 * COORD_SCALE;
const LAT_OFFSET_SCALED = 90 * COORD_SCALE;
const LNG_MAX_SCALED = 360 * COORD_SCALE;
const LAT_MAX_SCALED = 180 * COORD_SCALE;

const LAT_BITS = 28n;
const LAT_MASK = (1n << LAT_BITS) - 1n;
const MAX_PACKED = (BigInt(LNG_MAX_SCALED) << LAT_BITS) | BigInt(LAT_MAX_SCALED);

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

    if (lngScaled < 0 || lngScaled > LNG_MAX_SCALED || latScaled < 0 || latScaled > LAT_MAX_SCALED) {
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

    if (lngScaled < 0 || lngScaled > LNG_MAX_SCALED || latScaled < 0 || latScaled > LAT_MAX_SCALED) {
        return null;
    }

    const lng = (lngScaled - LNG_OFFSET_SCALED) / COORD_SCALE;
    const lat = (latScaled - LAT_OFFSET_SCALED) / COORD_SCALE;

    return {
        lng: Number(lng.toFixed(6)),
        lat: Number(lat.toFixed(6))
    };
};
