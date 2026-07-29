/**
 * units - 单位制工具（用户偏好 unit_system 的统一消费入口）
 *
 * 数据源：useUserPreferencesStore 在 bootstrap/保存时写入的 runtime 缓存
 * （localStorage: webgis_pref_unit_system），本模块同步读取，避免消费方引入 Pinia 依赖。
 *
 * 提供：
 *   readPreferredUnitSystem()      → 'metric' | 'imperial'
 *   formatDistanceMeasure(meters)  → 按偏好格式化距离（米/千米 或 英尺/英里）
 *   formatAreaMeasure(sqMeters)    → 按偏好格式化面积（平方米/平方千米 或 平方英尺/英亩）
 */

import { USER_PREFERENCE_UNIT_KEY } from '@common/user/stores/useUserPreferencesStore';

/** 英制换算常量 */
const FEET_PER_METER = 3.28084;
const MILES_PER_METER = 1 / 1609.344;
const SQFEET_PER_SQMETER = 10.7639;
const ACRES_PER_SQMETER = 1 / 4046.8564224;

/**
 * 读取用户偏好单位制（未登录/未设置时回退公制）
 * @returns {'metric'|'imperial'}
 */
export function readPreferredUnitSystem() {
    try {
        const raw = String(localStorage.getItem(USER_PREFERENCE_UNIT_KEY) || '')
            .trim()
            .toLowerCase();
        return raw === 'imperial' ? 'imperial' : 'metric';
    } catch {
        return 'metric';
    }
}

/**
 * 按用户偏好格式化距离
 * 公制：>100m 显示 km，否则 m；英制：>=1mi 显示 mi，否则 ft
 * @param {number} meters - 距离（米）
 * @param {'metric'|'imperial'} [unitSystem] - 可选显式单位制（默认读用户偏好）
 * @returns {string}
 */
export function formatDistanceMeasure(meters, unitSystem = readPreferredUnitSystem()) {
    const len = Math.max(0, Number(meters) || 0);

    if (unitSystem === 'imperial') {
        const miles = len * MILES_PER_METER;
        if (miles >= 1) return `${miles.toFixed(2)} mi`;
        return `${(len * FEET_PER_METER).toFixed(1)} ft`;
    }

    return len > 100 ? `${(len / 1000).toFixed(2)} km` : `${len.toFixed(2)} m`;
}

/**
 * 按用户偏好格式化面积
 * 公制：>10000m² 显示 km²，否则 m²；英制：>=1acre 显示 acre，否则 ft²
 * @param {number} sqMeters - 面积（平方米）
 * @param {'metric'|'imperial'} [unitSystem] - 可选显式单位制（默认读用户偏好）
 * @returns {string}
 */
export function formatAreaMeasure(sqMeters, unitSystem = readPreferredUnitSystem()) {
    const area = Math.max(0, Number(sqMeters) || 0);

    if (unitSystem === 'imperial') {
        const acres = area * ACRES_PER_SQMETER;
        if (acres >= 1) return `${acres.toFixed(2)} acre`;
        return `${(area * SQFEET_PER_SQMETER).toFixed(1)} ft²`;
    }

    return area > 10000 ? `${(area / 1000000).toFixed(2)} km²` : `${area.toFixed(2)} m²`;
}
