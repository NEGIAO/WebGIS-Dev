// GCJ-02 <-> WGS-84 coordinate transforms for mainland China.

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function outOfChina(lon, lat) {
    return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(lon, lat) {
    let ret = -100.0 + 2.0 * lon + 3.0 * lat + 0.2 * lat * lat + 0.1 * lon * lat + 0.2 * Math.sqrt(Math.abs(lon));
    ret += (20.0 * Math.sin(6.0 * lon * PI) + 20.0 * Math.sin(2.0 * lon * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(lat * PI) + 40.0 * Math.sin(lat / 3.0 * PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(lat / 12.0 * PI) + 320 * Math.sin(lat * PI / 30.0)) * 2.0 / 3.0;
    return ret;
}

function transformLon(lon, lat) {
    let ret = 300.0 + lon + 2.0 * lat + 0.1 * lon * lon + 0.1 * lon * lat + 0.1 * Math.sqrt(Math.abs(lon));
    ret += (20.0 * Math.sin(6.0 * lon * PI) + 20.0 * Math.sin(2.0 * lon * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(lon * PI) + 40.0 * Math.sin(lon / 3.0 * PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(lon / 12.0 * PI) + 300.0 * Math.sin(lon / 30.0 * PI)) * 2.0 / 3.0;
    return ret;
}

/**
 * Convert GCJ-02 coordinates to WGS-84 coordinates.
 * @param {number} lon Longitude in GCJ-02
 * @param {number} lat Latitude in GCJ-02
 * @returns {[number, number]} [longitude, latitude] in WGS-84
 */
export function gcj02ToWgs84(lon, lat) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [lon, lat];
    if (outOfChina(lon, lat)) return [lon, lat];

    let dLat = transformLat(lon - 105.0, lat - 35.0);
    let dLon = transformLon(lon - 105.0, lat - 35.0);
    const radLat = lat / 180.0 * PI;
    let magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    const sqrtMagic = Math.sqrt(magic);

    dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
    dLon = (dLon * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);

    const mgLat = lat + dLat;
    const mgLon = lon + dLon;
    return [lon * 2 - mgLon, lat * 2 - mgLat];
}

/**
 * Convert WGS-84 coordinates to GCJ-02 coordinates.
 * @param {number} lon Longitude in WGS-84
 * @param {number} lat Latitude in WGS-84
 * @returns {[number, number]} [longitude, latitude] in GCJ-02
 */
export function wgs84ToGcj02(lon, lat) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [lon, lat];
    if (outOfChina(lon, lat)) return [lon, lat];

    let dLat = transformLat(lon - 105.0, lat - 35.0);
    let dLon = transformLon(lon - 105.0, lat - 35.0);
    const radLat = lat / 180.0 * PI;
    let magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    const sqrtMagic = Math.sqrt(magic);

    dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
    dLon = (dLon * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);

    const mgLat = lat + dLat;
    const mgLon = lon + dLon;
    return [mgLon, mgLat];
}
