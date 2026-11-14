/**
 * Cesium 相机位姿短码编解码
 *
 * 从 crypto.js 拆出：相机状态（lng/lat/height/heading/pitch/roll）的定点打包与还原，
 * 与「位置/罗盘」共用位宽常量与角度归一化工具（见 ./positions）。
 */

import {
    ANGLE_BOUNDARY_EPSILON,
    BASE62_ALPHABET,
    CESIUM_POSE_PREFIX,
    COORD_SCALE,
    LAT_BITS,
    LAT_MASK,
    LAT_MAX_SCALED,
    LAT_OFFSET_SCALED,
    LNG_MAX_SCALED,
    LNG_OFFSET_SCALED,
    MAX_CESIUM_CAMERA_PACKED,
    MAX_CESIUM_POSE_PACKED,
    MIN_CODE_LENGTH,
    decodeBase62,
    encodeBase62,
    packCesiumCameraFields,
    CESIUM_HEIGHT_BITS,
    CESIUM_HEIGHT_MASK,
    CESIUM_HEIGHT_MAX_SCALED,
    CESIUM_HEIGHT_SCALE,
    CESIUM_HEADING_BITS,
    CESIUM_HEADING_MASK,
    CESIUM_HEADING_MAX_SCALED,
    CESIUM_HEADING_SCALE,
    CESIUM_PITCH_BITS,
    CESIUM_PITCH_MASK,
    CESIUM_PITCH_MAX_SCALED,
    CESIUM_PITCH_OFFSET,
    CESIUM_PITCH_SCALE,
    CESIUM_ROLL_BITS,
    CESIUM_ROLL_MASK,
    CESIUM_ROLL_MAX_SCALED,
    CESIUM_ROLL_OFFSET,
    CESIUM_ROLL_SCALE,
} from './positions';

/**
 * 编码 Cesium 相机视角状态：相机经纬度、高度和姿态。
 * @param {{lng:number|string, lat:number|string, height:number|string, heading?:number|string, pitch?:number|string, roll?:number|string}} state
 * @returns {string} Cesium 相机视角短码；异常时返回 '0'
 */
export const encodeCesiumCameraState = (state: any = {}) => {
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
export const encodeCesiumPoseState = (state: any = {}) => {
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
export const decodeCesiumPoseState = (code: string) => {
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
export const decodeCesiumCameraState = (code: string) => {
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

function normalizeHeadingDegrees(value: any) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return ((num % 360) + 360) % 360;
}

function normalizePitchDegrees(value: any) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    if (num < -90 - ANGLE_BOUNDARY_EPSILON || num > 90 + ANGLE_BOUNDARY_EPSILON) {
        return null;
    }
    return Math.max(-90, Math.min(90, num));
}

function normalizeRollDegrees(value: any) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return ((((num + 180) % 360) + 360) % 360) - 180;
}
