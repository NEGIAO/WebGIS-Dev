/**
 * GISCommander — Agent 可调用的 GIS 功能封装库
 *
 * 采用工厂函数 + 依赖注入模式（与项目既有的 createXxxFeature 一致），
 * 封装 Agent 需要的核心地图操作：缩放、搜索定位、底图切换。
 *
 * 通过 inject('olMap') 获取地图实例，直接调用 OpenLayers API 实现功能，
 * 保证与 MapContainer 的解耦。
 *
 * @module GISCommander
 */

import { fromLonLat } from 'ol/proj';
import { apiAddressGeocode } from '@/api/index.js';

// ============================================================
//  工厂函数
// ============================================================

/**
 * 创建 GISCommander 实例
 *
 * @param {Object} options - 配置项
 * @param {import('vue').ComputedRef<import('ol/Map').Map|null>} options.mapInstanceRef - 地图实例 Ref（来自 inject('olMap')）
 * @param {Function} [options.onCustomXYZSwitch] - 自定义 XYZ 底图切换回调（由 MapContainer.setCustomBasemapByUrl 提供）
 * @returns {GISCommanderAPI} GISCommander API 对象
 */
export function createGISCommander({ mapInstanceRef, onCustomXYZSwitch } = {}) {

    // ============================================================
    //  zoomToExtent — 缩放至指定地理范围
    // ============================================================

    /**
     * 将地图缩放到指定的经纬度边界框范围
     *
     * @param {Object} params
     * @param {number[]} params.bbox - [minLng, minLat, maxLng, maxLat] 经纬度边界框
     * @param {number} [params.padding=80] - 视图边距（像素）
     * @param {number} [params.maxZoom=11] - 最大缩放级别
     * @returns {Promise<{success: boolean, message: string, center?: {lng: number, lat: number}}>}
     */
    async function zoomToExtent({ bbox, padding = 80, maxZoom = 11 } = {}) {
        // 参数校验
        if (!Array.isArray(bbox) || bbox.length < 4) {
            return { success: false, message: 'bbox 必须是包含 4 个数字的数组 [minLng, minLat, maxLng, maxLat]' };
        }

        const values = bbox.slice(0, 4).map(Number);
        if (!values.every((v) => Number.isFinite(v))) {
            return { success: false, message: 'bbox 中的所有值必须是有效数字' };
        }

        // 值域校验
        const [minLng, minLat, maxLng, maxLat] = [
            Math.min(values[0], values[2]),
            Math.min(values[1], values[3]),
            Math.max(values[0], values[2]),
            Math.max(values[1], values[3]),
        ];

        if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) {
            return { success: false, message: `坐标值超出有效范围：经度 [-180, 180]，纬度 [-90, 90]` };
        }

        const map = mapInstanceRef?.value;
        const view = map?.getView?.();
        if (!map || !view) {
            return { success: false, message: '地图实例未就绪' };
        }

        try {
            const lowerLeft = fromLonLat([minLng, minLat]);
            const upperRight = fromLonLat([maxLng, maxLat]);
            const extent = [lowerLeft[0], lowerLeft[1], upperRight[0], upperRight[1]];

            // 宽或高极小的边界框，退化为中心点缩放
            const width = Math.abs(upperRight[0] - lowerLeft[0]);
            const height = Math.abs(upperRight[1] - lowerLeft[1]);

            if (width < 1e-6 || height < 1e-6) {
                const center = [(lowerLeft[0] + upperRight[0]) / 2, (lowerLeft[1] + upperRight[1]) / 2];
                view.animate({ center, zoom: maxZoom, duration: 700 });
            } else {
                view.fit(extent, {
                    duration: 700,
                    padding: Array.isArray(padding) ? padding : [padding, padding, padding, padding],
                    maxZoom,
                });
            }

            const centerLng = ((minLng + maxLng) / 2).toFixed(6);
            const centerLat = ((minLat + maxLat) / 2).toFixed(6);

            return {
                success: true,
                message: `已缩放到范围 [${minLng.toFixed(4)}, ${minLat.toFixed(4)}, ${maxLng.toFixed(4)}, ${maxLat.toFixed(4)}]`,
                center: { lng: Number(centerLng), lat: Number(centerLat) },
            };
        } catch (err) {
            return { success: false, message: `缩放失败：${err.message || '未知错误'}` };
        }
    }

    // ============================================================
    //  searchAndZoom — 搜索地名并缩放
    // ============================================================

    /**
     * 根据地名或地址搜索位置，并将地图缩放定位到该位置
     *
     * @param {Object} params
     * @param {string} params.query - 搜索关键词（地名、地址、POI）
     * @param {string} [params.city=''] - 限定搜索的城市
     * @param {number} [params.zoom=16] - 目标缩放级别（1-22）
     * @returns {Promise<{success: boolean, message: string, location?: object}>}
     */
    async function searchAndZoom({ query, city = '', zoom = 16 } = {}) {
        const normalizedQuery = String(query || '').trim();
        if (!normalizedQuery) {
            return { success: false, message: '搜索关键词不能为空' };
        }

        const map = mapInstanceRef?.value;
        const view = map?.getView?.();
        if (!map || !view) {
            return { success: false, message: '地图实例未就绪' };
        }

        try {
            const geocodeResult = await apiAddressGeocode(normalizedQuery, city);
            const result = geocodeResult?.data;

            if (!result || !Number.isFinite(result.lng) || !Number.isFinite(result.lat)) {
                return { success: false, message: `未找到 "${normalizedQuery}" 的匹配结果，请尝试更精确的关键词` };
            }

            const targetZoom = Math.min(Math.max(Number(zoom) || 16, 1), 22);
            view.animate({
                center: fromLonLat([result.lng, result.lat]),
                zoom: targetZoom,
                duration: 700,
            });

            const address = result.formattedAddress || normalizedQuery;
            return {
                success: true,
                message: `已定位到 "${address}"（${result.lng.toFixed(6)}, ${result.lat.toFixed(6)}），缩放级别 ${targetZoom}`,
                location: {
                    lng: result.lng,
                    lat: result.lat,
                    address,
                    adcode: result.adcode || '',
                    level: result.level || '',
                },
            };
        } catch (err) {
            return { success: false, message: `搜索 "${normalizedQuery}" 失败：${err.message || '网络错误或服务不可用'}` };
        }
    }

    // ============================================================
    //  switchBasemap — 切换底图
    // ============================================================

    /**
     * 切换地图底图
     *
     * @param {Object} params
     * @param {Object} [params.customXYZ] - 自定义 XYZ 图源配置
     * @param {string} params.customXYZ.url - XYZ URL 模板（含 {x},{y},{z}）
     * @param {string} [params.customXYZ.name='自定义图源'] - 图源名称
     * @param {string} [params.customXYZ.attribution=''] - 版权信息
     * @param {string} [params.url] - XYZ 瓦片 URL（扁平参数，与 customXYZ.url 等价）
     * @param {string} [params.name] - 图源名称（扁平参数，与 customXYZ.name 等价）
     * @returns {Promise<{success: boolean, message: string, layerId?: string, layerIndex?: number, url?: string}>}
     */
    async function switchBasemap({ customXYZ, url, name } = {}) {
        const map = mapInstanceRef?.value;
        if (!map) {
            return { success: false, message: '地图实例未就绪' };
        }

        // Agent 底图切换唯一通道：HTTPS XYZ URL -> custom 底图 -> URL 图层索引 l=1。
        const xyzUrl = url || customXYZ?.url;
        if (xyzUrl) {
            return await switchBasemapByXYZ({
                url: xyzUrl,
                name: name || customXYZ?.name || '自定义图源',
                attribution: customXYZ?.attribution || '',
            });
        }

        return { success: false, message: '请提供 https XYZ URL 参数' };
    }

    /**
     * 切换到自定义 XYZ 图源
     * @private
     */
    function _switchToCustomXYZ({ url, name = '自定义图源', attribution = '' }, _map) {
        if (!url.includes('{x}') || !url.includes('{y}') || !url.includes('{z}')) {
            return {
                success: false,
                message: 'XYZ URL 模板必须包含 {x}、{y}、{z} 占位符。',
            };
        }

        // 复用 switchBasemapByXYZ 的完整逻辑
        return switchBasemapByXYZ({ url, name, attribution });
    }

    // ============================================================
    //  switchBasemapByXYZ — 通过 XYZ URL 切换底图
    // ============================================================

    /**
     * 通过标准 XYZ 瓦片 URL 切换底图
     *
     * 复用 MapContainer 的 custom 底图机制（l=1）：
     * 1. 校验 URL 格式
     * 2. 调用 MapContainer.setCustomBasemapByUrl(url)
     * 3. MapContainer 自动识别 URL 类型、创建瓦片源、切换底图
     *
     * @param {Object} params
     * @param {string} params.url - XYZ 瓦片 URL 模板
     * @param {string} [params.name='自定义图源'] - 图源名称
     * @returns {Promise<{success: boolean, message: string, layerName?: string, layerId?: string, layerIndex?: number, url?: string}>}
     */
    async function switchBasemapByXYZ({ url, name = '自定义图源' } = {}) {
        if (!url || typeof url !== 'string') {
            return { success: false, message: '缺少 url 参数' };
        }

        const trimmedUrl = url.trim();
        if (!trimmedUrl.includes('{x}') || !trimmedUrl.includes('{y}') || !trimmedUrl.includes('{z}')) {
            return {
                success: false,
                message: 'URL 格式无效：必须包含 {x}、{y}、{z} 占位符。示例：https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            };
        }
        if (!trimmedUrl.startsWith('https://')) {
            return { success: false, message: 'Agent 切换自定义 XYZ 底图只接受 https:// 开头的 URL' };
        }

        // 通过 MapContainer 的 custom 底图机制切换
        if (typeof onCustomXYZSwitch === 'function') {
            try {
                const switchResult = await onCustomXYZSwitch(trimmedUrl);
                if (switchResult?.success === false) {
                    return switchResult;
                }

                return {
                    success: true,
                    message: switchResult?.message || `已切换到底图：${name}`,
                    layerName: name,
                    layerId: switchResult?.layerId || 'custom',
                    layerIndex: switchResult?.layerIndex ?? 1,
                    url: trimmedUrl,
                    customLoadResult: switchResult?.customLoadResult || null,
                };
            } catch (err) {
                return { success: false, message: `切换底图失败：${err.message || '未知错误'}` };
            }
        }

        return { success: false, message: '自定义底图切换功能未就绪（MapContainer 未注入回调）' };
    }

    // ============================================================
    //  dispose — 清理资源
    // ============================================================

    /**
     * 清理 GISCommander 持有的资源
     */
    function dispose() {
        // 自定义底图由 MapContainer 管理，此处无需清理
    }

    // ============================================================
    //  返回 API
    // ============================================================

    return {
        zoomToExtent,
        searchAndZoom,
        switchBasemap,
        switchBasemapByXYZ,
        dispose,
    };
}

/**
 * @typedef {Object} GISCommanderAPI
 * @property {Function} zoomToExtent - 缩放至指定范围
 * @property {Function} searchAndZoom - 搜索地名并缩放
 * @property {Function} switchBasemap - 切换底图
 * @property {Function} dispose - 清理资源
 */
