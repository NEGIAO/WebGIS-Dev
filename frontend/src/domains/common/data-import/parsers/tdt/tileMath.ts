export const TILE_HOSTS = ['tile0.tianditu.gov.cn', 'tile1.tianditu.gov.cn', 'tile2.tianditu.gov.cn'];
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function lngLatToXyz(lng: number, lat: number, zoom: number) {
    const n = 2 ** zoom;
    const x = Math.floor(((lng + 180) / 360) * n);
    const s = Math.sin((lat * Math.PI) / 180);
    const y = Math.floor(((1 - Math.log((1 + s) / (1 - s)) / (2 * Math.PI)) / 2) * n);
    return [x, y];
}

export function pkEncode(x: number, y: number, z: number) {
    let n = '';
    for (let level = z; level >= 0; level -= 1) {
        const mask = 1 << level;
        let value = 0;
        if (x & mask) value |= 1;
        if (y & mask) value |= 2;
        n += value;
    }
    let encoded = n.split('').reverse().join('');
    const replaceAt = (value: string, index: number, replacement: string | number) => value.substring(0, index) + replacement + value.substring(index + 1);
    for (const index of [9, 8, 7, 6]) {
        if (index < encoded.length) encoded = replaceAt(encoded, index, 1 + Number(encoded[index]));
    }
    let result = '';
    let previous = '';
    let repeated = 0;
    for (let index = 0; index < encoded.length; index += 1) {
        const token = String.fromCharCode(97 + 3 * Number(encoded[index]));
        let insertion = result.length - 1;
        if (token === previous) {
            repeated += 1;
            if (repeated === 1) insertion += 1;
            else if (repeated > 10) insertion -= 1;
            result = result.slice(0, insertion) + repeated;
        } else {
            result += token;
            previous = token;
            repeated = 0;
        }
    }
    return result;
}

export function estimateTdtVectorTiles(bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number }, zoom: number) {
    const corners = [
        lngLatToXyz(bbox.minLng, bbox.minLat, zoom),
        lngLatToXyz(bbox.minLng, bbox.maxLat, zoom),
        lngLatToXyz(bbox.maxLng, bbox.minLat, zoom),
        lngLatToXyz(bbox.maxLng, bbox.maxLat, zoom),
    ];
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const tiles = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
    return { tiles, batches: tiles, seconds: Math.round(tiles * 0.8) };
}

