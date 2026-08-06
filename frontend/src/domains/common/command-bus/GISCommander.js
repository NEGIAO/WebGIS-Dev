/**
 * GISCommander - Agent-facing GIS tool facade.
 *
 * It owns geocoding and fixed tool-to-command mappings while all map mutations
 * go through MapCommandBus. No arbitrary URL or command path is exposed.
 */

import { apiAddressGeocode } from '@/api/index.js';
import { searchWithNominatim } from '@/api/locationSearch.js';

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

    /**
     * 通过 Nominatim（OpenStreetMap）地理编码。
     * 用于国外地名 / POI，Amap 无法覆盖时使用。
     * @returns {Promise<{lng:number,lat:number,formattedAddress:string}|null>}
     */
    async function geocodeWithNominatim(query) {
        const { items } = await searchWithNominatim({ keywords: query, pageSize: 1 });
        const best = Array.isArray(items) && items[0];
        if (!best) return null;
        const lng = Number(best.lon);
        const lat = Number(best.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return {
            lng,
            lat,
            formattedAddress: best.display_name || best.name || query,
        };
    }

    /**
     * 搜索地名并缩放到目标位置。
     *
     * @param {Object} params
     * @param {string} params.query - 地名、地址或 POI
     * @param {string} [params.city=''] - 城市限定（仅 Amap 生效）
     * @param {number} [params.zoom=16] - 目标缩放级别
     * @param {'auto'|'amap'|'nominatim'} [params.engine='auto'] - 地理编码引擎：
     *   - 'auto': 优先 Amap（国内），无结果时降级到 Nominatim（国际）
     *   - 'amap': 强制使用高德（仅国内有效）
     *   - 'nominatim': 强制使用 Nominatim（国际地名推荐）
     * @returns {Promise<Object>}
     */
    async function searchAndZoom({ query, city = '', zoom = 16, engine = 'auto' } = {}) {
        const normalizedQuery = String(query || '').trim();
        if (!normalizedQuery) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'Search query cannot be empty' };
        }

        const targetZoom = Math.min(Math.max(Number(zoom) || 16, 0), 22);

        /**
         * 执行地图定位（公共逻辑）。
         * @param {number} lng WGS-84 经度
         * @param {number} lat WGS-84 纬度
         * @param {string} address 显示地址
         * @param {string} provider 来源引擎标识
         */
        async function locate(lng, lat, address, provider) {
            const commandResult = await execute('setViewCenter', { lng, lat, zoom: targetZoom });
            if (!commandResult.success) return commandResult;
            return {
                ...commandResult,
                message: `Located "${address}" at (${lng.toFixed(6)}, ${lat.toFixed(6)}) [${provider}]`,
                location: { lng, lat, address, provider },
            };
        }

        try {
            // 引擎 1：高德 Amap（国内首选）
            if (engine === 'auto' || engine === 'amap') {
                try {
                    const geocodeResult = await apiAddressGeocode(normalizedQuery, city);
                    const result = geocodeResult?.data;
                    if (result && Number.isFinite(result.lng) && Number.isFinite(result.lat)) {
                        const address = result.formattedAddress || normalizedQuery;
                        return await locate(result.lng, result.lat, address, 'amap');
                    }
                } catch (amapError) {
                    if (engine === 'amap') {
                        return {
                            success: false,
                            code: 'GEOCODE_FAILED',
                            message: `Amap search failed for "${normalizedQuery}": ${amapError?.message || 'service error'}`,
                        };
                    }
                    // auto 模式：Amap 异常（非"无结果"），记录后降级到 Nominatim
                    console.warn(`[GISCommander] Amap 异常 "${normalizedQuery}"，降级到 Nominatim: ${amapError?.message || 'unknown'}`);
                }

                // auto 模式：Amap 无结果 → 降级到 Nominatim
                if (engine === 'auto') {
                    console.warn(`[GISCommander] Amap 无结果 "${normalizedQuery}"，降级到 Nominatim`);
                }
            }

            // 引擎 2：Nominatim / OpenStreetMap（国际兜底或强制指定）
            if (engine === 'auto' || engine === 'nominatim') {
                const nominatimResult = await geocodeWithNominatim(normalizedQuery);
                if (nominatimResult) {
                    return await locate(
                        nominatimResult.lng,
                        nominatimResult.lat,
                        nominatimResult.formattedAddress,
                        'nominatim',
                    );
                }
            }

            return {
                success: false,
                code: 'GEOCODE_NOT_FOUND',
                message: `No match found for "${normalizedQuery}" across available geocoding services; try a more specific query`,
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
