/**
 * 将高德 IP 定位返回的 rectangle 字符串（"x,y;x,y"）
 * 解析为 OpenLayers 可用的 Extent: [minX, minY, maxX, maxY]
 *
 * @param {string} rectangle 高德 rectangle 字符串
 * @returns {number[]|null} 解析成功返回 extent，失败返回 null
 */
export function parseAmapRectangleToExtent(rectangle) {
    if (!rectangle || typeof rectangle !== 'string') return null;

    const [firstPair, secondPair] = rectangle.split(';');
    if (!firstPair || !secondPair) return null;

    const [x1, y1] = firstPair.split(',').map((item) => Number(item));
    const [x2, y2] = secondPair.split(',').map((item) => Number(item));

    if (![x1, y1, x2, y2].every((item) => Number.isFinite(item))) {
        return null;
    }

    return [
        Math.min(x1, x2),
        Math.min(y1, y2),
        Math.max(x1, x2),
        Math.max(y1, y2)
    ];
}
