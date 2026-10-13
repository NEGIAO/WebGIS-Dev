import { mergeTdtBuildings } from './tdtBuildingTopology.js';

const TILE_HOSTS = ['tile0.tianditu.gov.cn', 'tile1.tianditu.gov.cn', 'tile2.tianditu.gov.cn'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readVarint(buf, offset) {
    let value = 0;
    let shift = 0;
    while (offset < buf.length && shift < 35) {
        const byte = buf[offset++];
        value += (byte & 0x7f) * 2 ** shift;
        if (!(byte & 0x80)) return { value, offset };
        shift += 7;
    }
    return null;
}

function fields(buf) {
    const result = [];
    let offset = 0;
    while (offset < buf.length) {
        const tag = readVarint(buf, offset);
        if (!tag) break;
        offset = tag.offset;
        const field = Math.floor(tag.value / 8);
        const wire = tag.value & 7;
        if (![0, 1, 2, 5].includes(wire)) break;
        if (wire === 0) {
            const value = readVarint(buf, offset);
            if (!value) break;
            result.push({ field, wire, value: value.value });
            offset = value.offset;
        } else if (wire === 1) {
            result.push({ field, wire, start: offset, length: 8 });
            offset += 8;
        } else if (wire === 5) {
            result.push({ field, wire, start: offset, length: 4 });
            offset += 4;
        } else {
            const length = readVarint(buf, offset);
            if (!length || length.value > buf.length - length.offset) break;
            result.push({ field, wire, start: length.offset, length: length.value });
            offset = length.offset + length.value;
        }
    }
    return result;
}

function text(buf) {
    return new TextDecoder().decode(buf);
}

function zigzag(value) {
    return value % 2 ? -(value + 1) / 2 : value / 2;
}

function pkEncode(x, y, z) {
    let n = '';
    for (let level = z; level >= 0; level -= 1) {
        const mask = 1 << level;
        let value = 0;
        if (x & mask) value |= 1;
        if (y & mask) value |= 2;
        n += value;
    }
    let encoded = n.split('').reverse().join('');
    const replaceAt = (value, index, replacement) =>
        value.substring(0, index) + replacement + value.substring(index + 1);
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

function parseValue(buf) {
    for (const field of fields(buf)) {
        if (field.field === 1 && field.wire === 2) {
            return text(buf.slice(field.start, field.start + field.length));
        }
        if (field.field === 3 && field.wire === 5) {
            return new DataView(buf.buffer, buf.byteOffset + field.start, 4).getFloat32(0, true);
        }
        if (field.field === 3 && field.wire === 1) {
            return new DataView(buf.buffer, buf.byteOffset + field.start, 8).getFloat64(0, true);
        }
    }
    return null;
}

function parseCommands(buf, depth = 0) {
    let offset = 0;
    let x = 0;
    let y = 0;
    let current = null;
    const paths = [];
    const direct = [];
    while (offset < buf.length) {
        const command = readVarint(buf, offset);
        if (!command) break;
        offset = command.offset;
        const id = command.value & 7;
        let count = command.value >>> 3;
        if (![2, 3, 7].includes(id) || count > 5000) {
            direct.length = 0;
            break;
        }
        if (id === 2) {
            if (current?.length >= 3) paths.push(current);
            current = [];
        }
        if (id === 7) {
            if (current?.length >= 3) {
                current.push(current[0]);
                paths.push(current);
            }
            current = null;
            continue;
        }
        while (count > 0) {
            const dx = readVarint(buf, offset);
            if (!dx) break;
            offset = dx.offset;
            const dy = readVarint(buf, offset);
            if (!dy) break;
            offset = dy.offset;
            x += zigzag(dx.value);
            y += zigzag(dy.value);
            if (!current || x < -82 || x > 4178 || y < -82 || y > 4178) {
                current = null;
                break;
            }
            current.push([x, y]);
            count -= 1;
        }
        if (count > 0) break;
        direct.push(true);
    }
    if (current?.length >= 3) paths.push(current);
    if (direct.length && paths.length) return paths;
    if (depth >= 8) return [];
    for (const field of fields(buf)) {
        if (field.field !== 1 || field.wire !== 2) continue;
        const nested = parseCommands(buf.slice(field.start, field.start + field.length), depth + 1);
        if (nested.length) return nested;
    }
    return [];
}

function parseFeature(buf) {
    let type = null;
    const tags = [];
    const paths = [];
    for (const field of fields(buf)) {
        if (field.field === 1 && field.wire === 2) {
            paths.push(...parseCommands(buf.slice(field.start, field.start + field.length)));
        } else if (field.field === 2 && field.wire === 0) {
            type = field.value;
        } else if (field.field === 3 && field.wire === 2) {
            const packed = buf.slice(field.start, field.start + field.length);
            let offset = 0;
            while (offset < packed.length) {
                const value = readVarint(packed, offset);
                if (!value) break;
                tags.push(value.value);
                offset = value.offset;
            }
        }
    }
    return { type, tags, paths };
}

function parseLayer(buf) {
    const layer = { name: '', keys: [], values: [], features: [] };
    for (const field of fields(buf)) {
        const value = buf.slice(field.start, field.start + field.length);
        if (field.field === 1 && field.wire === 2) layer.features.push(parseFeature(value));
        else if (field.field === 2 && field.wire === 2) layer.name = text(value);
        else if (field.field === 3 && field.wire === 2) layer.values.push(parseValue(value));
        else if (field.field === 4 && field.wire === 2) layer.keys.push(text(value));
    }
    return layer;
}

function detectLayers(body) {
    const result = [];
    for (let index = 0; index < body.length - 2; index += 1) {
        if (body[index] !== 0x1a) continue;
        const length = readVarint(body, index + 1);
        if (!length || length.value <= 0 || length.value > body.length - length.offset) continue;
        const content = body.slice(length.offset, length.offset + length.value);
        const layerFields = fields(content);
        if (
            layerFields.some((field) => field.field === 5 && field.wire === 0) &&
            layerFields.some((field) => field.field === 15 && field.wire === 0)
        ) {
            result.push(content);
            index = length.offset + length.value - 1;
        }
    }
    return result;
}

function lngLatToTile(lng, lat, zoom) {
    const n = 2 ** zoom;
    const x = Math.floor(((lng + 180) / 360) * n);
    const rad = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
    return [x, y];
}

function properties(layer, feature) {
    const result = {};
    for (let i = 0; i + 1 < feature.tags.length; i += 2) {
        const key = layer.keys[feature.tags[i]];
        const value = layer.values[feature.tags[i + 1]];
        if (key && value !== undefined) result[key] = value;
    }
    return result;
}

function decodeTile(arrayBuffer, tx, ty, zoom) {
    const raw = new Uint8Array(arrayBuffer);
    if (raw.length > 99) raw[99] ^= 0xff;
    const records = [];
    for (const layerBytes of detectLayers(raw.slice(5))) {
        const layer = parseLayer(layerBytes);
        if (layer.name !== 'CE') continue;
        for (const feature of layer.features) {
            if (feature.type !== 2) continue;
            const props = properties(layer, feature);
            if (!/^\d{14}$/.test(String(props.elemid || ''))) continue;
            const rings = feature.paths.filter((ring) => ring.length >= 3);
            if (rings.length) records.push({
                id: String(props.elemid),
                h: typeof props.h === 'number' ? props.h : null,
                floors: props.floor ?? null,
                A6: props.A6 ?? null,
                rings,
                tx,
                ty,
                zoom,
            });
        }
    }
    const names = new Map();
    for (const layerBytes of detectLayers(raw.slice(5))) {
        const layer = parseLayer(layerBytes);
        if (layer.name !== 'respt') continue;
        for (const feature of layer.features) {
            const props = properties(layer, feature);
            const label = ['lzh', 'name', 'label', 'title', 'Z5']
                .map((key) => props[key])
                .find((value) => typeof value === 'string' && value.trim() && !value.includes('\ufffd'));
            if (props.elemid && label) names.set(String(props.elemid), label.trim());
        }
    }
    for (const record of records) record.name = names.get(record.id) || null;
    return records;
}

export async function fetchTdtBuildings({ bbox, zoom = 16, tk, batchDelay = 400, signal, onProgress } = {}) {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const [x0, y1] = lngLatToTile(minLng, minLat, zoom);
    const [x1, y0] = lngLatToTile(maxLng, maxLat, zoom);
    const tiles = [];
    for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) tiles.push([x, y]);
    }
    const records = [];
    for (let index = 0; index < tiles.length; index += 1) {
        if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
        const [x, y] = tiles[index];
        const host = TILE_HOSTS[(x + y) % 3];
        const url = `https://${host}/vts?t=vt&pk=${encodeURIComponent(pkEncode(x, y, zoom))}&tk=${encodeURIComponent(tk)}&v=1.0`;
        const response = await fetch(url, { signal, referrer: 'https://map.tianditu.gov.cn/' });
        const payload = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || '';
        let serviceError = null;
        if (contentType.includes('json') || new TextDecoder().decode(payload.slice(0, 1)) === '{') {
            try {
                const body = JSON.parse(new TextDecoder().decode(payload));
                if (String(body?.code) === '301010') serviceError = 'tdt_permission';
                else if (body?.code != null || body?.msg) serviceError = String(body.msg || `tdt_code_${body.code}`);
            } catch {
                serviceError = null;
            }
        }
        if (serviceError) throw new Error(serviceError);
        if (!response.ok) throw new Error(`tdt_http_${response.status}`);
        try {
            records.push(...decodeTile(payload, x, y, zoom));
        } catch {
            // Keep other tiles when one response has an unsupported payload.
        }
        onProgress?.(index + 1, tiles.length, records.length);
        if (index + 1 < tiles.length) await sleep(batchDelay);
    }
    return mergeTdtBuildings(records);
}

export function estimateTdtTiles(bbox, zoom) {
    const corners = [
        lngLatToTile(bbox.minLng, bbox.minLat, zoom),
        lngLatToTile(bbox.minLng, bbox.maxLat, zoom),
        lngLatToTile(bbox.maxLng, bbox.minLat, zoom),
        lngLatToTile(bbox.maxLng, bbox.maxLat, zoom),
    ];
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const tiles = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
    return { tiles, batches: tiles, seconds: Math.round(tiles * 0.8) };
}

export { pkEncode };

export function downloadGeoJSON(featureCollection, filename = 'buildings_tianditu.geojson') {
    const blob = new Blob([JSON.stringify(featureCollection, null, 1)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}