import { inject } from 'vue';
import { useRoute } from 'vue-router';

import { buildAgentMapContextSnapshot } from '@common/chat/agent/mapContextSnapshot';

const DEFAULT_SETTLE_TIMEOUT_MS = 2600;
const SETTLE_POLL_INTERVAL_MS = 50;
const MAX_JOURNAL_ENTRIES = 20;

/**
 * Session-scoped previous snapshot cache and MapActionJournal.
 * Module-level so all callers within the same component tree share one state.
 */
let previousContextSnapshot = null;
const mapActionJournal = [];
let journalSeqCounter = 0;

/**
 * Generate a list of field-level changes between two AgentMapContextV1 snapshots.
 * @param {Object} current - latest snapshot
 * @param {Object} previous - prior snapshot (or null on first call)
 * @returns {Array<{field: string, from: unknown, to: unknown}>}
 */
function computeContextChanges(current, previous) {
    if (!previous) return [];

    const changes = [];
    const compareField = (field, from, to, formatter) => {
        const formattedFrom = formatter ? formatter(from) : from;
        const formattedTo = formatter ? formatter(to) : to;
        if (JSON.stringify(formattedFrom) !== JSON.stringify(formattedTo)) {
            changes.push({ field, from: formattedFrom, to: formattedTo });
        }
    };

    compareField('view', previous.view, current.view);
    compareField('basemap.id', previous.basemap?.id, current.basemap?.id);
    compareField('center', previous.center || null, current.center || null, (c) => {
        if (!c) return null;
        return { lng: roundTo(c.lng, 4), lat: roundTo(c.lat, 4) };
    });

    if (current.view === 'ol') {
        compareField('ol.zoom', previous.ol?.zoom, current.ol?.zoom);
    } else {
        compareField('cesium.cameraHeight', previous.cesium?.cameraHeight, current.cesium?.cameraHeight);
        compareField('cesium.pitch', previous.cesium?.pitch, current.cesium?.pitch);
    }

    return changes;
}

function roundTo(value, digits) {
    if (!Number.isFinite(value)) return value;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

/**
 * Record a normalized map action into the session journal.
 * @param {{action: string, view: string, command: string, params?: Object}} entry
 */
function recordMapAction(entry) {
    if (!entry || !entry.command) return;
    const journalEntry = {
        seq: ++journalSeqCounter,
        action: entry.action || entry.command,
        view: entry.view || null,
        command: entry.command,
        summary: summarizeAction(entry),
    };
    mapActionJournal.push(journalEntry);
    if (mapActionJournal.length > MAX_JOURNAL_ENTRIES) {
        mapActionJournal.splice(0, mapActionJournal.length - MAX_JOURNAL_ENTRIES);
    }
}

function resetMapContextSession() {
    previousContextSnapshot = null;
    mapActionJournal.splice(0, mapActionJournal.length);
    journalSeqCounter = 0;
}

function summarizeAction(entry) {
    const params = entry.params || {};
    switch (entry.command) {
        case 'set_map_view':
            return `切换到 ${params.view === 'cesium' ? '3D' : '2D'} 视图`;
        case 'set_view_center':
            if (Number.isFinite(params.lng) && Number.isFinite(params.lat)) {
                return `移动中心到 (${params.lng.toFixed(4)}, ${params.lat.toFixed(4)})`;
            }
            return '移动地图中心';
        case 'set_camera_orientation':
            return '调整相机姿态';
        case 'zoom_to_extent':
            return '缩放到指定范围';
        case 'switch_basemap':
            return `切换底图${params.presetId ? `: ${params.presetId}` : ''}`;
        case 'search_and_zoom':
            return `搜索定位${params.query || ''}`;
        default:
            return entry.command;
    }
}

/**
 * Capture the active map once per request and merge it with the safe URL fallback.
 * @returns {{
 *   buildMapContext: () => Record<string, unknown>,
 *   buildSettledMapContext: (options?: {timeoutMs?: number}) => Promise<Record<string, unknown>>,
 *   recordMapAction: (entry: {action: string, view: string, command: string, params?: Object}) => void,
 *   getMapActionJournal: () => Array<{seq: number, action: string, view: string, command: string, summary: string}>,
 *   resetMapContextSession: () => void,
 * }}
 */
export function useAgentMapContext() {
    const route = useRoute();
    const runtimeBridge = inject('agentMapRuntimeBridge', null);

    function buildMapContext() {
        let runtimeState = null;
        try {
            runtimeState = runtimeBridge?.capture?.() || null;
        } catch (error) {
            console.warn('[AgentMapContext] Runtime capture failed; falling back to URL state.', error);
        }

        const snapshot = buildAgentMapContextSnapshot({
            runtimeState,
            routeQuery: route.query,
        });

        const changes = computeContextChanges(snapshot, previousContextSnapshot);
        previousContextSnapshot = snapshot;

        return {
            ...snapshot,
            changesSinceLastTurn: changes.length > 0 ? changes : undefined,
            recentActions: mapActionJournal.length > 0
                ? mapActionJournal.slice(-5).map((e) => `[${e.action}] ${e.summary}`)
                : undefined,
        };
    }

    /**
     * Lightweight snapshot for polling — skips change tracking to avoid
     * polluting the "changes since last turn" journal during settle waits.
     */
    function captureMapContextOnly() {
        let runtimeState = null;
        try {
            runtimeState = runtimeBridge?.capture?.() || null;
        } catch (error) {
            console.warn('[AgentMapContext] Runtime capture failed; falling back to URL state.', error);
        }
        return buildAgentMapContextSnapshot({
            runtimeState,
            routeQuery: route.query,
        });
    }

    /**
     * Wait for map animation/camera movement and URL synchronization before the tool follow-up request.
     * A timeout always falls back to the latest runtime snapshot, so chat cannot remain blocked.
     * Returns the full snapshot including Phase 3 fields (changesSinceLastTurn / recentActions).
     */
    async function buildSettledMapContext({ timeoutMs = DEFAULT_SETTLE_TIMEOUT_MS } = {}) {
        const normalizedTimeout = Math.max(200, Number(timeoutMs) || DEFAULT_SETTLE_TIMEOUT_MS);
        const startedAt = Date.now();

        try {
            await runtimeBridge?.waitForIdle?.({ timeoutMs: normalizedTimeout });
        } catch (error) {
            console.warn('[AgentMapContext] Failed to wait for map idle state.', error);
        }

        // Use lightweight capture during polling to avoid polluting previousContextSnapshot
        let snapshot = captureMapContextOnly();
        while (
            Date.now() - startedAt < normalizedTimeout
            && !isRuntimeUrlStateAligned(snapshot)
        ) {
            await delay(SETTLE_POLL_INTERVAL_MS);
            snapshot = captureMapContextOnly();
        }

        // If polling already aligned, reuse the last snapshot to avoid a redundant capture.
        // Otherwise fall back to buildMapContext() for a fresh capture.
        if (isRuntimeUrlStateAligned(snapshot)) {
            const changes = computeContextChanges(snapshot, previousContextSnapshot);
            previousContextSnapshot = snapshot;
            return {
                ...snapshot,
                changesSinceLastTurn: changes.length > 0 ? changes : undefined,
                recentActions: mapActionJournal.length > 0
                    ? mapActionJournal.slice(-5).map((e) => `[${e.action}] ${e.summary}`)
                    : undefined,
            };
        }

        return buildMapContext();
    }

    return {
        buildMapContext,
        buildSettledMapContext,
        recordMapAction: recordMapAction,
        getMapActionJournal: () => [...mapActionJournal],
        resetMapContextSession,
    };
}

function isRuntimeUrlStateAligned(context) {
    if (!context || context.source !== 'runtime+url') return true;

    const urlState = context.urlState || {};
    if (urlState.view && urlState.view !== context.view) return false;
    if (!sameOptionalNumber(context.center?.lng, urlState.lng, 0.00001)) return false;
    if (!sameOptionalNumber(context.center?.lat, urlState.lat, 0.00001)) return false;
    if (!sameOptionalInteger(context.basemap?.index, urlState.l)) return false;

    if (context.view === 'cesium') {
        const height = context.cesium?.cameraHeight;
        const tolerance = Number.isFinite(height) ? Math.max(1, Math.abs(height) * 0.001) : 1;
        return sameOptionalNumber(height, urlState.z, tolerance);
    }

    return sameOptionalNumber(context.ol?.zoom, urlState.z, 0.02);
}

function sameOptionalNumber(runtimeValue, urlValue, tolerance) {
    if (!Number.isFinite(runtimeValue) || !Number.isFinite(urlValue)) return true;
    return Math.abs(runtimeValue - urlValue) <= tolerance;
}

function sameOptionalInteger(runtimeValue, urlValue) {
    if (!Number.isInteger(runtimeValue) || !Number.isInteger(urlValue)) return true;
    return runtimeValue === urlValue;
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
