import { fromLonLat, toLonLat } from 'ol/proj';
import { olZoomToCesiumHeight } from '@/utils/map/viewScaleConverter.js';
import {
    getAgentBasemapPresetLabel,
    isAgentBasemapPresetId,
} from './agentMapPresets.js';

const DEFAULT_TRANSITION_DURATION_MS = 700;
const TRANSITION_TIMEOUT_BUFFER_MS = 1500;

function parseFiniteNumber(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}

function validateLngLat(lngValue, latValue) {
    const lng = parseFiniteNumber(lngValue);
    const lat = parseFiniteNumber(latValue);
    if (lng === null || lat === null) {
        return { error: 'lng and lat must be finite numbers' };
    }
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        return { error: 'Coordinates are outside longitude [-180, 180] or latitude [-90, 90]' };
    }
    return { lng, lat };
}

function validateBbox(bbox) {
    if (!Array.isArray(bbox) || bbox.length !== 4) {
        return { error: 'bbox must contain exactly four numbers: [minLng, minLat, maxLng, maxLat]' };
    }
    const values = bbox.map(parseFiniteNumber);
    if (values.some((value) => value === null)) {
        return { error: 'Every bbox value must be a finite number' };
    }
    const [lng1, lat1, lng2, lat2] = values;
    const normalized = [
        Math.min(lng1, lng2),
        Math.min(lat1, lat2),
        Math.max(lng1, lng2),
        Math.max(lat1, lat2),
    ];
    if (normalized[0] < -180 || normalized[2] > 180 || normalized[1] < -90 || normalized[3] > 90) {
        return { error: 'bbox is outside longitude [-180, 180] or latitude [-90, 90]' };
    }
    return { bbox: normalized };
}

function getTransitionError(reason) {
    if (reason === 'cancelled') return { code: 'TRANSITION_CANCELLED', message: 'Map animation was cancelled before completion' };
    if (reason === 'destroyed') return { code: 'MAP_RUNTIME_DESTROYED', message: 'Map runtime was destroyed before the animation completed' };
    if (reason === 'timeout') return { code: 'TRANSITION_TIMEOUT', message: 'Timed out waiting for map animation completion' };
    return { code: 'TRANSITION_FAILED', message: `Map animation failed: ${reason || 'unknown error'}` };
}

function runOlViewTransition({ map, view, start, duration = DEFAULT_TRANSITION_DURATION_MS }) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            clearInterval(disposeCheckId);
            resolve(result);
        };

        const timeoutId = setTimeout(
            () => finish({ completed: false, reason: 'timeout' }),
            Math.max(0, duration) + TRANSITION_TIMEOUT_BUFFER_MS,
        );
        const disposeCheckId = setInterval(() => {
            if (!map?.getView?.() || map.getView() !== view || !map.getTargetElement?.()) {
                finish({ completed: false, reason: 'destroyed' });
            }
        }, 50);

        try {
            start((completed) => finish({
                completed: completed !== false,
                reason: completed === false ? 'cancelled' : undefined,
            }));
        } catch (error) {
            finish({ completed: false, reason: error?.message || 'error' });
        }
    });
}

function runCesiumCameraFlight({ viewer, start, duration = DEFAULT_TRANSITION_DURATION_MS }) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            clearInterval(disposeCheckId);
            resolve(result);
        };
        const timeoutId = setTimeout(
            () => finish({ completed: false, reason: 'timeout' }),
            Math.max(0, duration) + TRANSITION_TIMEOUT_BUFFER_MS,
        );
        const disposeCheckId = setInterval(() => {
            if (!viewer || viewer.isDestroyed?.() || !viewer.camera) {
                finish({ completed: false, reason: 'destroyed' });
            }
        }, 50);

        try {
            start({
                complete: () => finish({ completed: true }),
                cancel: () => finish({ completed: false, reason: 'cancelled' }),
            });
        } catch (error) {
            finish({ completed: false, reason: error?.message || 'error' });
        }
    });
}

function captureOlState(map, getRuntimeState) {
    const providedState = getRuntimeState?.();
    if (providedState?.view === 'ol') return providedState;

    const view = map?.getView?.();
    const center = view?.getCenter?.();
    const zoom = parseFiniteNumber(view?.getZoom?.());
    if (!view || !Array.isArray(center) || center.length < 2 || zoom === null) return null;
    const [lng, lat] = toLonLat(center);
    const resolution = parseFiniteNumber(view.getResolution?.());
    return {
        view: 'ol',
        center: { lng: Number(lng.toFixed(6)), lat: Number(lat.toFixed(6)) },
        ol: {
            zoom: Number(zoom.toFixed(3)),
            resolution: resolution === null ? null : Number(resolution.toFixed(6)),
        },
    };
}

function validatePresetId(presetId) {
    const normalizedPresetId = String(presetId || '').trim();
    if (!isAgentBasemapPresetId(normalizedPresetId)) {
        return {
            error: 'presetId is not in the Agent basemap allowlist; URLs, custom sources, and unknown presets are rejected',
        };
    }
    return { presetId: normalizedPresetId };
}

export function createOlMapCommandAdapter({
    getMap,
    getRuntimeState,
    setBasemap,
} = {}) {
    const captureState = () => captureOlState(getMap?.(), getRuntimeState);

    async function setViewCenter({
        lng: lngValue,
        lat: latValue,
        zoom: zoomValue,
        height,
        duration = DEFAULT_TRANSITION_DURATION_MS,
    } = {}) {
        const coordinate = validateLngLat(lngValue, latValue);
        if (coordinate.error) return { success: false, code: 'INVALID_ARGUMENT', message: coordinate.error };
        if (height !== undefined && zoomValue === undefined) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'OpenLayers uses zoom; height cannot be supplied on its own' };
        }

        const map = getMap?.();
        const view = map?.getView?.();
        if (!map || !view) return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: 'OpenLayers runtime is not ready' };

        const zoom = zoomValue === undefined
            ? parseFiniteNumber(view.getZoom?.())
            : parseFiniteNumber(zoomValue);
        if (zoom === null || zoom < 0 || zoom > 22) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'zoom must be a finite number from 0 to 22' };
        }
        const durationMs = Math.max(0, parseFiniteNumber(duration) ?? DEFAULT_TRANSITION_DURATION_MS);
        const transition = await runOlViewTransition({
            map,
            view,
            duration: durationMs,
            start: (callback) => view.animate({
                center: fromLonLat([coordinate.lng, coordinate.lat]),
                zoom,
                duration: durationMs,
            }, callback),
        });
        const resultingMapState = captureState();
        if (!transition.completed) {
            const failure = getTransitionError(transition.reason);
            return { success: false, ...failure, resultingMapState };
        }
        return {
            success: true,
            code: 'OK',
            message: `Moved the 2D map center to (${coordinate.lng.toFixed(6)}, ${coordinate.lat.toFixed(6)}), zoom=${zoom}`,
            center: coordinate,
            resultingMapState,
        };
    }

    async function zoomToExtent({
        bbox: bboxValue,
        padding = 80,
        maxZoom = 11,
        duration = DEFAULT_TRANSITION_DURATION_MS,
    } = {}) {
        const normalized = validateBbox(bboxValue);
        if (normalized.error) return { success: false, code: 'INVALID_ARGUMENT', message: normalized.error };
        const [minLng, minLat, maxLng, maxLat] = normalized.bbox;
        const maxZoomValue = parseFiniteNumber(maxZoom);
        if (maxZoomValue === null || maxZoomValue < 0 || maxZoomValue > 22) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'maxZoom must be a finite number from 0 to 22' };
        }

        const map = getMap?.();
        const view = map?.getView?.();
        if (!map || !view) return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: 'OpenLayers runtime is not ready' };

        const lowerLeft = fromLonLat([minLng, minLat]);
        const upperRight = fromLonLat([maxLng, maxLat]);
        const extent = [lowerLeft[0], lowerLeft[1], upperRight[0], upperRight[1]];
        const width = Math.abs(upperRight[0] - lowerLeft[0]);
        const height = Math.abs(upperRight[1] - lowerLeft[1]);
        const durationMs = Math.max(0, parseFiniteNumber(duration) ?? DEFAULT_TRANSITION_DURATION_MS);
        const normalizedPadding = Array.isArray(padding)
            ? padding.slice(0, 4).map((value) => Math.max(0, parseFiniteNumber(value) ?? 0))
            : Array(4).fill(Math.max(0, parseFiniteNumber(padding) ?? 80));

        const transition = await runOlViewTransition({
            map,
            view,
            duration: durationMs,
            start: (callback) => {
                if (width < 1e-6 || height < 1e-6) {
                    view.animate({
                        center: [(lowerLeft[0] + upperRight[0]) / 2, (lowerLeft[1] + upperRight[1]) / 2],
                        zoom: maxZoomValue,
                        duration: durationMs,
                    }, callback);
                    return;
                }
                view.fit(extent, {
                    duration: durationMs,
                    padding: normalizedPadding,
                    maxZoom: maxZoomValue,
                    callback,
                });
            },
        });
        const resultingMapState = captureState();
        if (!transition.completed) {
            const failure = getTransitionError(transition.reason);
            return { success: false, ...failure, resultingMapState };
        }
        return {
            success: true,
            code: 'OK',
            message: `Fit the 2D map to [${normalized.bbox.map((value) => value.toFixed(4)).join(', ')}]`,
            resultingMapState,
        };
    }

    async function switchBasemap({ presetId: presetIdValue } = {}) {
        const validated = validatePresetId(presetIdValue);
        if (validated.error) return { success: false, code: 'INVALID_BASEMAP_PRESET', message: validated.error };
        if (typeof setBasemap !== 'function') {
            return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: 'OpenLayers basemap switching is not ready' };
        }
        await setBasemap(validated.presetId);
        const resultingMapState = captureState();
        return {
            success: true,
            code: 'OK',
            message: `Switched to preset basemap: ${getAgentBasemapPresetLabel(validated.presetId) || validated.presetId}`,
            layerId: validated.presetId,
            layerIndex: resultingMapState?.basemap?.index ?? null,
            resultingMapState,
        };
    }

    return {
        captureState,
        setViewCenter,
        zoomToExtent,
        switchBasemap,
    };
}

export function createCesiumMapCommandAdapter({
    getViewer,
    getCesium,
    getRuntimeState,
    setBasemap,
} = {}) {
    const captureState = () => getRuntimeState?.() || null;

    function getRuntime() {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer || viewer.isDestroyed?.() || !viewer.camera || !Cesium) return null;
        return { viewer, Cesium };
    }

    async function flyTo(options, durationMs) {
        const runtime = getRuntime();
        if (!runtime) return { completed: false, reason: 'destroyed' };
        return runCesiumCameraFlight({
            viewer: runtime.viewer,
            duration: durationMs,
            start: ({ complete, cancel }) => runtime.viewer.camera.flyTo({
                ...options(runtime),
                duration: durationMs / 1000,
                complete,
                cancel,
            }),
        });
    }

    async function setViewCenter({
        lng: lngValue,
        lat: latValue,
        height: heightValue,
        zoom: zoomValue,
        duration = DEFAULT_TRANSITION_DURATION_MS,
    } = {}) {
        const coordinate = validateLngLat(lngValue, latValue);
        if (coordinate.error) return { success: false, code: 'INVALID_ARGUMENT', message: coordinate.error };
        const runtime = getRuntime();
        if (!runtime) return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: 'Cesium runtime is not ready' };

        let height = heightValue === undefined ? null : parseFiniteNumber(heightValue);
        if (heightValue !== undefined && (height === null || height <= 0 || height > 50_000_000)) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'height must be a finite number from 1 to 50000000 meters' };
        }
        if (height === null && zoomValue !== undefined) {
            const zoom = parseFiniteNumber(zoomValue);
            if (zoom === null || zoom < 0 || zoom > 22) {
                return { success: false, code: 'INVALID_ARGUMENT', message: 'zoom must be a finite number from 0 to 22' };
            }
            height = olZoomToCesiumHeight({
                zoom,
                mapSize: [runtime.viewer.canvas?.clientWidth, runtime.viewer.canvas?.clientHeight],
                centerLat: coordinate.lat,
                cesiumFovy: runtime.viewer.camera.frustum?.fovy,
                clamp: true,
            });
        }
        const currentHeight = parseFiniteNumber(runtime.viewer.camera.positionCartographic?.height);
        height ??= currentHeight !== null && currentHeight > 0 ? currentHeight : 1_000_000;

        const durationMs = Math.max(0, parseFiniteNumber(duration) ?? DEFAULT_TRANSITION_DURATION_MS);
        const transition = await flyTo(
            ({ Cesium }) => ({
                destination: Cesium.Cartesian3.fromDegrees(coordinate.lng, coordinate.lat, height),
                orientation: {
                    heading: runtime.viewer.camera.heading,
                    pitch: runtime.viewer.camera.pitch,
                    roll: runtime.viewer.camera.roll,
                },
            }),
            durationMs,
        );
        const resultingMapState = captureState();
        if (!transition.completed) {
            const failure = getTransitionError(transition.reason);
            return { success: false, ...failure, resultingMapState };
        }
        return {
            success: true,
            code: 'OK',
            message: `Moved the 3D camera center to (${coordinate.lng.toFixed(6)}, ${coordinate.lat.toFixed(6)}), height=${Math.round(height)}m`,
            center: coordinate,
            resultingMapState,
        };
    }

    async function zoomToExtent({ bbox: bboxValue, duration = DEFAULT_TRANSITION_DURATION_MS } = {}) {
        const normalized = validateBbox(bboxValue);
        if (normalized.error) return { success: false, code: 'INVALID_ARGUMENT', message: normalized.error };
        const runtime = getRuntime();
        if (!runtime) return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: 'Cesium runtime is not ready' };
        const durationMs = Math.max(0, parseFiniteNumber(duration) ?? DEFAULT_TRANSITION_DURATION_MS);
        const transition = await flyTo(
            ({ Cesium }) => ({
                destination: Cesium.Rectangle.fromDegrees(...normalized.bbox),
            }),
            durationMs,
        );
        const resultingMapState = captureState();
        if (!transition.completed) {
            const failure = getTransitionError(transition.reason);
            return { success: false, ...failure, resultingMapState };
        }
        return {
            success: true,
            code: 'OK',
            message: `Fit the 3D camera to [${normalized.bbox.map((value) => value.toFixed(4)).join(', ')}]`,
            resultingMapState,
        };
    }

    async function setCameraOrientation({
        heading: headingValue,
        pitch: pitchValue,
        roll: rollValue,
        duration = DEFAULT_TRANSITION_DURATION_MS,
    } = {}) {
        const runtime = getRuntime();
        if (!runtime) return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: 'Cesium runtime is not ready' };
        if (headingValue === undefined && pitchValue === undefined && rollValue === undefined) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'At least one of heading, pitch, or roll is required' };
        }
        const headingDegrees = headingValue === undefined ? null : parseFiniteNumber(headingValue);
        const pitchDegrees = pitchValue === undefined ? null : parseFiniteNumber(pitchValue);
        const rollDegrees = rollValue === undefined ? null : parseFiniteNumber(rollValue);
        if (
            (headingValue !== undefined && headingDegrees === null)
            || (pitchValue !== undefined && pitchDegrees === null)
            || (rollValue !== undefined && rollDegrees === null)
            || (pitchDegrees !== null && (pitchDegrees < -90 || pitchDegrees > 90))
        ) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'Camera angles must be finite; pitch must be in [-90, 90] degrees' };
        }
        const heading = headingDegrees === null
            ? runtime.viewer.camera.heading
            : runtime.Cesium.Math.toRadians(headingDegrees);
        const pitch = pitchDegrees === null
            ? runtime.viewer.camera.pitch
            : runtime.Cesium.Math.toRadians(pitchDegrees);
        const roll = rollDegrees === null
            ? runtime.viewer.camera.roll
            : runtime.Cesium.Math.toRadians(rollDegrees);
        if (![heading, pitch, roll].every(Number.isFinite)) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'Camera angles must be finite; pitch must be in [-90, 90] degrees' };
        }
        const durationMs = Math.max(0, parseFiniteNumber(duration) ?? DEFAULT_TRANSITION_DURATION_MS);
        const transition = await flyTo(
            () => ({
                destination: runtime.viewer.camera.position.clone?.() || runtime.viewer.camera.position,
                orientation: { heading, pitch, roll },
            }),
            durationMs,
        );
        const resultingMapState = captureState();
        if (!transition.completed) {
            const failure = getTransitionError(transition.reason);
            return { success: false, ...failure, resultingMapState };
        }
        return {
            success: true,
            code: 'OK',
            message: 'Updated the Cesium camera orientation',
            resultingMapState,
        };
    }

    async function switchBasemap({ presetId: presetIdValue } = {}) {
        const validated = validatePresetId(presetIdValue);
        if (validated.error) return { success: false, code: 'INVALID_BASEMAP_PRESET', message: validated.error };
        if (typeof setBasemap !== 'function') {
            return { success: false, code: 'MAP_RUNTIME_NOT_READY', message: 'Cesium basemap switching is not ready' };
        }
        const switched = await setBasemap(validated.presetId);
        const resultingMapState = captureState();
        if (switched === false) {
            return {
                success: false,
                code: 'BASEMAP_SWITCH_FAILED',
                message: `Cesium failed to switch basemap: ${validated.presetId}`,
                resultingMapState,
            };
        }
        return {
            success: true,
            code: 'OK',
            message: `Switched to preset basemap: ${getAgentBasemapPresetLabel(validated.presetId) || validated.presetId}`,
            layerId: validated.presetId,
            layerIndex: resultingMapState?.basemap?.index ?? null,
            resultingMapState,
        };
    }

    return {
        captureState,
        setViewCenter,
        setCameraOrientation,
        zoomToExtent,
        switchBasemap,
    };
}
