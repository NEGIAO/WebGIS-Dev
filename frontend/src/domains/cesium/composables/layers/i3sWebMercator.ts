/**
 * 功能名称：I3S / Web-Mercator 投影适配
 * 日    期：2026/11/13
 *
 * 从 useCesiumLayers 拆出：Cesium I3SDataProvider 仅接受 4326，这里把
 * Web Mercator 的 node center/extent/OBB 预变换为地理坐标，并按 URL 维度
 * 登记投影适配器（scene 销毁时 release）。与地图引擎零耦合。
 */

export const WEB_MERCATOR_WKIDS = new Set([3857, 102100, 102113, 900913]);
const WEB_MERCATOR_RADIUS = 6378137;
const WEB_MERCATOR_MAX = Math.PI * WEB_MERCATOR_RADIUS;
const i3sProjectionAdapterState = new WeakMap();

export function getI3SWkid(spatialReference: any) {
    if (!spatialReference || typeof spatialReference !== 'object') return null;
    const latestWkid = Number(spatialReference.latestWkid);
    if (Number.isFinite(latestWkid)) return latestWkid;
    const wkid = Number(spatialReference.wkid);
    return Number.isFinite(wkid) ? wkid : null;
}

export function getWkidFromCrsString(value: any) {
    if (typeof value !== 'string') return null;
    const match = value.match(/(?:EPSG(?:\/0\/|:)|\/)(\d+)\/?$/i);
    return match ? Number(match[1]) : null;
}

/** 计算瓦片在 EPSG:3857 下的米制 BBOX（供 ArcGIS export 模板填充） */
export function arcgisBboxParts(z: any, x: any, y: any) {
    const extentSize = (2 * WEB_MERCATOR_MAX) / 2 ** z;
    const minx = -WEB_MERCATOR_MAX + x * extentSize;
    const maxx = minx + extentSize;
    const maxy = WEB_MERCATOR_MAX - y * extentSize;
    const miny = maxy - extentSize;
    return {
        minx: minx.toFixed(2),
        miny: miny.toFixed(2),
        maxx: maxx.toFixed(2),
        maxy: maxy.toFixed(2),
    };
}

export function detectI3SWkid(value: any, visited = new WeakSet()) : any {
    if (!value || typeof value !== 'object' || visited.has(value)) return null;
    visited.add(value);

    if (!Array.isArray(value)) {
        const spatialWkid = getI3SWkid(value.spatialReference);
        if (spatialWkid !== null) return spatialWkid;

        for (const key of ['indexCRS', 'vertexCRS']) {
            const crsWkid = getWkidFromCrsString(value[key]);
            if (crsWkid !== null) return crsWkid;
        }
    }

    for (const item of Object.values(value)) {
        const wkid = detectI3SWkid(item, visited);
        if (wkid !== null) return wkid;
    }
    return null;
}

export function webMercatorToDegrees(x: any, y: any) {
    const clampedX = Math.max(-WEB_MERCATOR_MAX, Math.min(WEB_MERCATOR_MAX, Number(x)));
    const clampedY = Math.max(-WEB_MERCATOR_MAX, Math.min(WEB_MERCATOR_MAX, Number(y)));
    return [
        (clampedX / WEB_MERCATOR_RADIUS) * (180 / Math.PI),
        Math.atan(Math.sinh(clampedY / WEB_MERCATOR_RADIUS)) * (180 / Math.PI),
    ];
}

export function transformI3SCenter(center: any) {
    if (!Array.isArray(center) || center.length < 2) return false;
    if (!Number.isFinite(Number(center[0])) || !Number.isFinite(Number(center[1]))) return false;
    const [longitude, latitude] = webMercatorToDegrees(center[0], center[1]);
    center[0] = longitude;
    center[1] = latitude;
    return true;
}

export function transformI3SExtent(extent: any) {
    if (Array.isArray(extent) && extent.length >= 4) {
        const southwest = webMercatorToDegrees(extent[0], extent[1]);
        const northeast = webMercatorToDegrees(extent[2], extent[3]);
        extent[0] = southwest[0];
        extent[1] = southwest[1];
        extent[2] = northeast[0];
        extent[3] = northeast[1];
        return;
    }

    if (!extent || typeof extent !== 'object') return;
    const southwest = webMercatorToDegrees(extent.xmin, extent.ymin);
    const northeast = webMercatorToDegrees(extent.xmax, extent.ymax);
    extent.xmin = southwest[0];
    extent.ymin = southwest[1];
    extent.xmax = northeast[0];
    extent.ymax = northeast[1];
    if (extent.spatialReference) {
        extent.spatialReference.wkid = 4326;
        extent.spatialReference.latestWkid = 4326;
    }
}

export function transformI3SObb(obb: any, Cesium: any) {
    if (!obb || !transformI3SCenter(obb.center)) return;
    if (!Array.isArray(obb.quaternion) || obb.quaternion.length < 4) return;
    if (!Cesium?.Cartesian3 || !Cesium?.Quaternion || !Cesium?.Transforms) return;

    const center = Cesium.Cartesian3.fromDegrees(
        obb.center[0],
        obb.center[1],
        Number(obb.center[2]) || 0,
    );
    const enuQuaternion = Cesium.Transforms.headingPitchRollQuaternion(
        center,
        new Cesium.HeadingPitchRoll(0, 0, 0),
    );
    const sourceQuaternion = new Cesium.Quaternion(
        Number(obb.quaternion[0]) || 0,
        Number(obb.quaternion[1]) || 0,
        Number(obb.quaternion[2]) || 0,
        Number(obb.quaternion[3]) || 0,
    );
    const converted = Cesium.Quaternion.multiply(
        enuQuaternion,
        sourceQuaternion,
        new Cesium.Quaternion(),
    );
    Cesium.Quaternion.normalize(converted, converted);
    obb.quaternion = [converted.x, converted.y, converted.z, converted.w];
}

export function normalizeI3SCrsString(value: any) {
    if (typeof value !== 'string') return value;
    return value.replace(
        /(EPSG(?:\/0\/|:))(?:3857|102100|102113|900913)\b/gi,
        (_match, prefix) => `${prefix}4326`,
    );
}

export function transformI3SJsonFromWebMercator(data: any, Cesium: any) {
    const visited = new WeakSet();

    function visit(value: any) {
        if (!value || typeof value !== 'object' || visited.has(value)) return;
        visited.add(value);

        if (!Array.isArray(value)) {
            transformI3SObb(value.obb, Cesium);
            transformI3SCenter(value.mbs);
            transformI3SExtent(value.fullExtent);

            if (
                Array.isArray(value.extent) &&
                (value.profile || value.indexCRS || value.vertexCRS)
            ) {
                transformI3SExtent(value.extent);
            }

            if (value.spatialReference) {
                value.spatialReference.wkid = 4326;
                value.spatialReference.latestWkid = 4326;
            }
            if (value.indexCRS) value.indexCRS = normalizeI3SCrsString(value.indexCRS);
            if (value.vertexCRS) value.vertexCRS = normalizeI3SCrsString(value.vertexCRS);
        }

        for (const item of Object.values(value)) visit(item);
    }

    visit(data);
    return data;
}

export function normalizeI3SServiceScope(url: any) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw, typeof window !== 'undefined' ? window.location.href : undefined);
        return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '').toLowerCase();
    } catch {
        return raw.split(/[?#]/, 1)[0].replace(/\/+$/, '').toLowerCase();
    }
}

export function registerI3SProjectionAdapter(Cesium: any, url?: any) {
    // useCesiumLayers normally receives window.Cesium, but prefer the global runtime
    // explicitly so this also works when a caller passes the lazy cesium-shim Proxy.
    const runtimeCesium = (globalThis as { Cesium?: any }).Cesium || Cesium;
    const Resource = runtimeCesium?.Resource || Cesium?.Resource;
    const resourcePrototype = Resource?.prototype;
    if (!resourcePrototype || typeof resourcePrototype.fetchJson !== 'function') {
        return { release() : any {}, get wkid() : any { return null; } };
    }

    let state = i3sProjectionAdapterState.get(resourcePrototype);
    if (!state) {
        const originalFetchJson = resourcePrototype.fetchJson;
        state = { contexts: new Map() };
        resourcePrototype.fetchJson = async function fetchJsonWithProjectionAdapter(...args: any[]) {
            const data = await originalFetchJson.apply(this, args);
            const resourceScope = normalizeI3SServiceScope(
                this?.url || this?.getUrlComponent?.(),
            );
            let matchedContext: any = null;
            for (const context of state.contexts.values()) {
                if (
                    resourceScope === context.scope ||
                    resourceScope.startsWith(`${context.scope}/`)
                ) {
                    if (!matchedContext || context.scope.length > matchedContext.scope.length) {
                        matchedContext = context;
                    }
                }
            }
            if (!matchedContext) return data;

            if (matchedContext.wkid === null) {
                matchedContext.wkid = detectI3SWkid(data);
            }
            if (WEB_MERCATOR_WKIDS.has(matchedContext.wkid)) {
                return transformI3SJsonFromWebMercator(data, Cesium);
            }
            return data;
        };
        i3sProjectionAdapterState.set(resourcePrototype, state);
    }

    const scope = normalizeI3SServiceScope(url);
    let context = state.contexts.get(scope);
    if (!context) {
        context = { scope, wkid: null, references: 0 };
        state.contexts.set(scope, context);
    }
    context.references += 1;

    let released = false;
    return {
        get wkid() {
            return context.wkid;
        },
        release() {
            if (released) return;
            released = true;
            context.references -= 1;
            if (context.references <= 0) state.contexts.delete(scope);
        },
    };
}
