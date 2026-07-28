/**
 * GISCommander - Agent-facing GIS tool facade.
 *
 * It owns geocoding and fixed tool-to-command mappings while all map mutations
 * go through MapCommandBus. No arbitrary URL or command path is exposed.
 */

import { apiAddressGeocode } from '@/api/index.js';

export function createGISCommander({ commandBus } = {}) {
    function execute(command, params) {
        if (!commandBus || typeof commandBus.execute !== 'function') {
            return Promise.resolve({
                success: false,
                code: 'MAP_COMMAND_BUS_NOT_READY',
                command,
                message: 'Map command bus is not ready',
            });
        }
        return commandBus.execute(command, params || {});
    }

    function setMapView(params = {}) {
        return execute('setMapView', params);
    }

    function setViewCenter(params = {}) {
        return execute('setViewCenter', params);
    }

    function setCameraOrientation(params = {}) {
        return execute('setCameraOrientation', params);
    }

    function zoomToExtent(params = {}) {
        return execute('zoomToExtent', params);
    }

    async function searchAndZoom({ query, city = '', zoom = 16 } = {}) {
        const normalizedQuery = String(query || '').trim();
        if (!normalizedQuery) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'Search query cannot be empty' };
        }

        try {
            const geocodeResult = await apiAddressGeocode(normalizedQuery, city);
            const result = geocodeResult?.data;
            if (!result || !Number.isFinite(result.lng) || !Number.isFinite(result.lat)) {
                return {
                    success: false,
                    code: 'GEOCODE_NOT_FOUND',
                    message: `No match found for "${normalizedQuery}"; try a more specific query`,
                };
            }

            const targetZoom = Math.min(Math.max(Number(zoom) || 16, 0), 22);
            const commandResult = await execute('setViewCenter', {
                lng: result.lng,
                lat: result.lat,
                zoom: targetZoom,
            });
            if (!commandResult.success) return commandResult;

            const address = result.formattedAddress || normalizedQuery;
            return {
                ...commandResult,
                message: `Located "${address}" at (${result.lng.toFixed(6)}, ${result.lat.toFixed(6)})`,
                location: {
                    lng: result.lng,
                    lat: result.lat,
                    address,
                    adcode: result.adcode || '',
                    level: result.level || '',
                },
            };
        } catch (error) {
            return {
                success: false,
                code: 'GEOCODE_FAILED',
                message: `Search failed for "${normalizedQuery}": ${error?.message || 'network or service error'}`,
            };
        }
    }

    function switchBasemap(params = {}) {
        return execute('switchBasemap', params);
    }

    function dispose() {}

    return {
        setMapView,
        setViewCenter,
        setCameraOrientation,
        zoomToExtent,
        searchAndZoom,
        switchBasemap,
        dispose,
    };
}

/**
 * @typedef {Object} GISCommanderAPI
 * @property {Function} setMapView
 * @property {Function} setViewCenter
 * @property {Function} setCameraOrientation
 * @property {Function} zoomToExtent
 * @property {Function} searchAndZoom
 * @property {Function} switchBasemap
 * @property {Function} dispose
 */
