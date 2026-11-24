/**
 * 功能名称：坐标输入 / 高德 AOI JSON → GeoJSON 导入包（双引擎共用纯函数）
 * 说    明：只做 payload 解析、坐标归一与 GeoJSON 文件构造，不接触任何引擎对象或 UI。
 *          3D 侧由 useCesiumSceneFacade 消费；2D 仍走既有 createManagedVectorLayer 路径。
 */
import { gcj02ToWgs84 } from '@common/data-import/crs/coordTransform';
import { parseAmapAoiPayload } from '@common/data-import/parsers/amapAoiParser';

/** 导入包：可直接交给统一数据导入管线，并附带相机聚焦提示 */
export interface CoordinateImportPack {
    file: File;
    layerName: string;
    focus: { lng: number; lat: number; zoom: number };
}

/** 成功返回导入包，失败返回可读错误（不在此处触 UI） */
export type CoordinateImportOutcome = CoordinateImportPack | { error: string };

function isPack(value: CoordinateImportOutcome): value is CoordinateImportPack {
    return !('error' in value);
}

export { isPack };

/** 把 FeatureCollection 包成带 .geojson 后缀的 File，交给统一导入管线 */
function buildGeoJsonFile(feature: any, layerName: string): File {
    const collection = { type: 'FeatureCollection', features: [feature] };
    const safeName = String(layerName || 'import')
        .replace(/[\\/:*?"<>|]/g, '_')
        .slice(0, 80) || 'import';
    return new File([JSON.stringify(collection)], `${safeName}.geojson`, {
        type: 'application/geo+json',
    });
}

/** 从 AOI 外环取经纬度包围盒中心；无有效顶点时回退 0,0 */
function focusFromRing(ring: any[], zoomInput: unknown) {
    const points = (Array.isArray(ring) ? ring : [])
        .slice(0, -1)
        .map((point: any) => [Number(point?.[0]), Number(point?.[1])])
        .filter((pair: number[]) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
    const lngs = points.map((pair: number[]) => pair[0]);
    const lats = points.map((pair: number[]) => pair[1]);
    const lng = lngs.length ? (Math.min(...lngs) + Math.max(...lngs)) / 2 : 0;
    const lat = lats.length ? (Math.min(...lats) + Math.max(...lats)) / 2 : 0;
    const zoom = Number(zoomInput);
    return { lng, lat, zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 14 };
}

/**
 * 构造坐标输入点的 GeoJSON 导入包。
 * @param payload lng/lat、crsType(wgs84|gcj02)、displayName/label/layerName、zoom、properties
 * @returns 导入包或错误信息；语义与 2D drawPointByCoordinatesInput 对齐
 */
export function buildCoordinatePointImport(payload: any = {}): CoordinateImportOutcome {
    const rawLng = Number(payload?.lng);
    const rawLat = Number(payload?.lat);
    if (!Number.isFinite(rawLng) || !Number.isFinite(rawLat)) {
        return { error: '输入坐标无效，请检查经纬度' };
    }
    if (rawLng < -180 || rawLng > 180 || rawLat < -90 || rawLat > 90) {
        return { error: '输入坐标超出范围（经度 -180~180，纬度 -90~90）' };
    }

    const crsType = String(payload?.crsType || 'wgs84').toLowerCase();
    let mapLng = rawLng;
    let mapLat = rawLat;
    if (crsType === 'gcj02') {
        [mapLng, mapLat] = gcj02ToWgs84(rawLng, rawLat);
    }
    if (!Number.isFinite(mapLng) || !Number.isFinite(mapLat)) {
        return { error: '坐标转换失败，请稍后重试' };
    }

    const displayName = String(
        payload?.displayName || `输入点_${rawLng.toFixed(6)}_${rawLat.toFixed(6)}`,
    ).trim();
    const labelName = String(payload?.label || displayName || '').trim() || displayName;
    const layerName = String(payload?.layerName || labelName || displayName).trim() || displayName;
    const labelField = String(payload?.labelField || '名称').trim() || '名称';
    const extraProperties =
        payload?.properties && typeof payload.properties === 'object'
            ? { ...payload.properties }
            : {};
    delete extraProperties.geometry;
    delete extraProperties.style;

    const properties: Record<string, any> = {
        type: 'Point',
        名称: labelName,
        输入名称: displayName,
        经度: Number(rawLng.toFixed(6)),
        纬度: Number(rawLat.toFixed(6)),
        坐标系: crsType,
        解析后经度: Number(mapLng.toFixed(6)),
        解析后纬度: Number(mapLat.toFixed(6)),
        ...extraProperties,
    };
    if (
        properties[labelField] === null ||
        properties[labelField] === undefined ||
        String(properties[labelField]).trim() === ''
    ) {
        properties[labelField] = labelName;
    }

    const feature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [mapLng, mapLat] },
        properties,
    };
    const zoom = Number(payload?.zoom);
    return {
        file: buildGeoJsonFile(feature, layerName),
        layerName,
        focus: {
            lng: mapLng,
            lat: mapLat,
            zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 16,
        },
    };
}

/**
 * 构造高德详情 JSON 的 AOI 面 GeoJSON 导入包。
 * @param payload jsonText（高德详情 JSON）、可选 poiid / zoom
 * @returns 导入包或错误信息；ringsWgs84 直接复用 common 解析器
 */
export function buildAmapAoiImport(payload: any = {}): CoordinateImportOutcome {
    const jsonText = String(payload?.jsonText || '').trim();
    if (!jsonText) return { error: '请先粘贴高德详情 JSON 内容' };

    try {
        const detail = parseAmapAoiPayload(jsonText);
        const rings = (detail.ringsWgs84 || [])
            .map((ring: any) =>
                (Array.isArray(ring) ? ring : []).map((point: any) => [
                    Number(point?.[0]),
                    Number(point?.[1]),
                ]),
            )
            .filter(
                (ring: number[][]) =>
                    ring.length >= 4 &&
                    ring.every((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1])),
            );
        if (!rings.length) return { error: '未发现边界数据' };

        const poiid = String(payload?.poiid || detail?.poiid || '').trim();
        const layerName = detail.name
            ? `${detail.name} - AOI范围`
            : `AOI_${Date.now()} - AOI范围`;
        const feature = {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: rings },
            properties: {
                名称: layerName,
                POI_ID: poiid,
                来源: detail.source || 'amap-detail',
                ...(detail.base || {}),
            },
        };

        return {
            file: buildGeoJsonFile(feature, layerName),
            layerName,
            focus: focusFromRing(rings[0], payload?.zoom),
        };
    } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : '解析失败';
        return { error: `AOI 解析失败：${detail}` };
    }
}
