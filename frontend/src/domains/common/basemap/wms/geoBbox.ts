/**
 * 地理范围原语：经纬度 bbox 校验与并集、Web 墨卡托换算
 *
 * 被 WMS Capabilities 与 ArcGIS REST 两个协议适配器共用，独立为叶子模块，
 * 避免「REST 适配器反向依赖 XML 解析器」。
 */

/** Web 墨卡托半世界宽度（米），EPSG:3857 坐标上限 */
export const WEB_MERCATOR_MAX_EXTENT = Math.PI * 6378137;

/** 标准 XYZ 切片网格的 origin 绝对值（米） */
export const MERCATOR_HALF_WORLD = 20037508.342789244;

// ---- 地理范围提取（统一归一化为 EPSG:4326 经纬度 [w,s,e,n]）----

export function bboxUnion(target: number[] | null, box: any): number[] | null {
    if (!Array.isArray(box) || box.length !== 4) return target;
    if (!box.every((v: any) => Number.isFinite(v))) return target;
    if (!target) return [...box];
    // 跨经度 180° 的病态范围直接丢弃，避免并集成全球条带
    if (box[2] < box[0] || box[3] < box[1]) return target;
    return [
        Math.min(target[0], box[0]),
        Math.min(target[1], box[1]),
        Math.max(target[2], box[2]),
        Math.max(target[3], box[3]),
    ];
}

export function isValidLonLatBbox(box: any): boolean {
    return (
        Array.isArray(box) &&
        box.length === 4 &&
        box.every((v: any) => Number.isFinite(v)) &&
        box[2] > box[0] &&
        box[3] > box[1] &&
        box[0] >= -180.5 && box[2] <= 180.5 &&
        box[1] >= -90.5 && box[3] <= 90.5
    );
}

/** Web 墨卡托米制坐标 → 经纬度 */
export function mercatorToLonLat(x: number, y: number): [number, number] {
    const lon = (x / WEB_MERCATOR_MAX_EXTENT) * 180;
    const lat = (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * (180 / Math.PI);
    return [lon, lat];
}
