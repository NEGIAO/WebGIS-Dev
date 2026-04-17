import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { LineString } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import {
    createEmpty,
    extend as extendExtent,
    isEmpty as isExtentEmpty,
    getWidth as getExtentWidth,
    getHeight as getExtentHeight
} from 'ol/extent';

function normalizeLonLatPair(lon, lat) {
    let lng = Number(lon);
    let latitude = Number(lat);
    if (!Number.isFinite(lng) || !Number.isFinite(latitude)) return null;

    // Some responses may provide lat/lon ordering.
    if ((Math.abs(lng) <= 90 && Math.abs(latitude) > 90) || (Math.abs(lng) <= 60 && Math.abs(latitude) >= 90)) {
        [lng, latitude] = [latitude, lng];
    }

    if (Math.abs(lng) > 180 || Math.abs(latitude) > 90) return null;
    return [lng, latitude];
}

function parseLonLatString(lonLatText) {
    const raw = String(lonLatText || '').trim();
    if (!raw) return null;
    const [lonText, latText] = raw.split(',');
    if (lonText == null || latText == null) return null;
    const pair = normalizeLonLatPair(lonText, latText);
    if (!pair) return null;
    return fromLonLat(pair);
}

function parseTransitLinePoint(linePointRaw) {
    const raw = String(linePointRaw || '').trim();
    if (!raw) return [];

    const chunks = raw
        .split(/[;；|]/)
        .map((item) => item.trim())
        .filter(Boolean);

    const parsedFromChunks = chunks
        .map((chunk) => {
            const nums = chunk
                .split(',')
                .map((v) => Number(v.trim()))
                .filter((v) => Number.isFinite(v));
            if (nums.length < 2) return null;
            return normalizeLonLatPair(nums[0], nums[1]);
        })
        .filter(Boolean)
        .map(([lng, lat]) => fromLonLat([lng, lat]));

    if (parsedFromChunks.length >= 2) return parsedFromChunks;

    const pairMatches = raw.match(/-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/g) || [];
    const fallbackPairs = pairMatches
        .map((pairText) => {
            const [lonText, latText] = pairText.split(',');
            return normalizeLonLatPair(lonText, latText);
        })
        .filter(Boolean);

    if (fallbackPairs.length < 2) return [];
    return fallbackPairs.map(([lng, lat]) => fromLonLat([lng, lat]));
}

function markerCoordKey(coord) {
    return `${coord[0].toFixed(2)},${coord[1].toFixed(2)}`;
}

function addOrMergeMarker(markerMap, coord, markerRole, stepIndex, stationName) {
    if (!coord) return;
    const key = markerCoordKey(coord);
    const name = String(stationName || '').trim();

    if (!markerMap.has(key)) {
        markerMap.set(key, {
            coord,
            roles: new Set([markerRole]),
            stepIndices: new Set([stepIndex]),
            stationNames: name ? new Set([name]) : new Set()
        });
        return;
    }

    const existing = markerMap.get(key);
    existing.roles.add(markerRole);
    existing.stepIndices.add(stepIndex);
    if (name) existing.stationNames.add(name);
}

function resolveMarkerRole(roleSet) {
    if (roleSet.has('segment-start') && roleSet.has('segment-end')) return 'segment-both';
    if (roleSet.has('segment-end')) return 'segment-end';
    return 'segment-start';
}

/**
 * Build OpenLayers features for a bus route.
 * - Draws route line segments.
 * - Deduplicates station markers at identical coordinates.
 * - Returns extent metadata for viewport fitting.
 */
export function buildBusRouteRenderData(route) {
    const segments = Array.isArray(route?.segments) ? route.segments : [];
    if (!segments.length) {
        return {
            features: [],
            fitExtent: createEmpty(),
            featureCount: 0,
            hasGeometry: false
        };
    }

    const features = [];
    const fitExtent = createEmpty();
    let hasGeometry = false;
    const markerMap = new Map();

    segments.forEach((segment, segmentIndex) => {
        const segmentLineItems = Array.isArray(segment?.segmentLine)
            ? segment.segmentLine
            : (segment?.segmentLine ? [{ linePoint: String(segment.segmentLine) }] : []);

        let segmentStartCoord = null;
        let segmentEndCoord = null;

        segmentLineItems.forEach((lineItem) => {
            const linePoint = String(lineItem?.linePoint || '').trim();
            if (!linePoint) return;

            const points = parseTransitLinePoint(linePoint);
            if (points.length < 2) return;

            if (!segmentStartCoord) segmentStartCoord = points[0];
            segmentEndCoord = points[points.length - 1];

            features.push(new Feature({
                geometry: new LineString(points),
                segmentType: Number(segment?.segmentType ?? 0),
                stepIndex: segmentIndex,
                routeMode: 'bus'
            }));

            points.forEach((coord) => {
                extendExtent(fitExtent, [coord[0], coord[1], coord[0], coord[1]]);
                hasGeometry = true;
            });
        });

        const stationStartCoord = parseLonLatString(segment?.stationStart?.lonlat);
        const stationEndCoord = parseLonLatString(segment?.stationEnd?.lonlat);
        const stationStartName = String(segment?.stationStart?.name || '').trim();
        const stationEndName = String(segment?.stationEnd?.name || '').trim();
        const startCoord = stationStartCoord || segmentStartCoord;
        const endCoord = stationEndCoord || segmentEndCoord;

        addOrMergeMarker(markerMap, startCoord, 'segment-start', segmentIndex, stationStartName);
        addOrMergeMarker(markerMap, endCoord, 'segment-end', segmentIndex, stationEndName);
    });

    markerMap.forEach((item) => {
        const stationName = Array.from(item.stationNames).join(' / ');
        const stepIndices = Array.from(item.stepIndices).sort((a, b) => a - b);

        features.push(new Feature({
            geometry: new Point(item.coord),
            routeMode: 'bus',
            markerRole: resolveMarkerRole(item.roles),
            stepIndices,
            stepIndex: stepIndices[0] ?? 0,
            stationName
        }));

        extendExtent(fitExtent, [item.coord[0], item.coord[1], item.coord[0], item.coord[1]]);
        hasGeometry = true;
    });

    return {
        features,
        fitExtent,
        featureCount: features.length,
        hasGeometry
    };
}

/**
 * Build OpenLayers features for a drive route.
 * - Supports full route line string.
 * - Optionally supports per-step line strings for step click zoom.
 */
export function buildDriveRouteRenderData(routeInput) {
    const fullLinePoint = typeof routeInput === 'string'
        ? routeInput
        : String(routeInput?.routeLatLonStr || routeInput?.routelatlon || '');

    const stepLinePointsRaw = Array.isArray(routeInput?.stepLinePoints)
        ? routeInput.stepLinePoints
        : [];

    const fitExtent = createEmpty();
    const features = [];
    let hasGeometry = false;

    const fullPoints = parseTransitLinePoint(fullLinePoint);
    if (fullPoints.length >= 2) {
        features.push(new Feature({
            geometry: new LineString(fullPoints),
            routeMode: 'drive',
            stepIndex: -1
        }));
        fullPoints.forEach((coord) => {
            extendExtent(fitExtent, [coord[0], coord[1], coord[0], coord[1]]);
            hasGeometry = true;
        });
    }

    stepLinePointsRaw.forEach((linePoint, stepIndex) => {
        const stepPoints = parseTransitLinePoint(linePoint);
        if (stepPoints.length < 2) return;
        features.push(new Feature({
            geometry: new LineString(stepPoints),
            routeMode: 'drive',
            stepIndex
        }));
        stepPoints.forEach((coord) => {
            extendExtent(fitExtent, [coord[0], coord[1], coord[0], coord[1]]);
            hasGeometry = true;
        });
    });

    return {
        features,
        fitExtent,
        featureCount: features.length,
        hasGeometry,
        hasDriveSteps: stepLinePointsRaw.length > 0
    };
}

/**
 * Unified route render builder.
 * @param {'bus'|'drive'} mode route mode
 * @param {any} input raw route payload
 */
export function buildRouteRenderData(mode, input) {
    if (mode === 'bus') return buildBusRouteRenderData(input);
    if (mode === 'drive') return buildDriveRouteRenderData(input);
    return {
        features: [],
        fitExtent: createEmpty(),
        featureCount: 0,
        hasGeometry: false
    };
}

/**
 * Fit map view to geometry by target screen coverage.
 * Use this for both route-level and step-level zoom.
 */
export function fitExtentToCoverage(map, extent, {
    targetCoverage = 0.9,
    bufferRatio = 0.12,
    minBufferMeters = 80,
    maxBufferMeters = 1200,
    padding = [72, 72, 72, 72],
    duration = 700,
    minZoom = 6,
    maxZoom = 19
} = {}) {
    if (!map || !extent || isExtentEmpty(extent)) return;

    const view = map.getView();
    const size = map.getSize();
    if (!view || !size || !size[0] || !size[1]) return;

    const leftPad = Number(padding?.[3] ?? 0);
    const rightPad = Number(padding?.[1] ?? 0);
    const topPad = Number(padding?.[0] ?? 0);
    const bottomPad = Number(padding?.[2] ?? 0);
    const usableWidthPx = Math.max(1, size[0] - leftPad - rightPad);
    const usableHeightPx = Math.max(1, size[1] - topPad - bottomPad);

    const minCoverage = 0.55;
    const maxCoverage = 0.95;
    const coverage = Math.max(minCoverage, Math.min(maxCoverage, Number(targetCoverage) || 0.8));

    let width = getExtentWidth(extent);
    let height = getExtentHeight(extent);

    if (width < 1) width = 1;
    if (height < 1) height = 1;

    const span = Math.max(width, height);
    const centerX = (extent[0] + extent[2]) / 2;
    const centerY = (extent[1] + extent[3]) / 2;

    const bufferMeters = Math.max(minBufferMeters, Math.min(maxBufferMeters, span * bufferRatio));
    const targetWidthByCoverage = width / coverage;
    const targetHeightByCoverage = height / coverage;
    const finalWidth = Math.max(targetWidthByCoverage, width + bufferMeters * 2);
    const finalHeight = Math.max(targetHeightByCoverage, height + bufferMeters * 2);

    const targetExtent = [
        centerX - finalWidth / 2,
        centerY - finalHeight / 2,
        centerX + finalWidth / 2,
        centerY + finalHeight / 2
    ];

    const resolution = view.getResolutionForExtent(targetExtent, [usableWidthPx, usableHeightPx]);
    const zoomFromResolution = view.getZoomForResolution(resolution);
    const safeZoom = Number.isFinite(zoomFromResolution)
        ? Math.max(minZoom, Math.min(maxZoom, zoomFromResolution))
        : maxZoom;

    view.fit(targetExtent, {
        padding,
        duration,
        zoom: safeZoom,
        maxZoom,
        minZoom,
        nearest: true
    });
}
