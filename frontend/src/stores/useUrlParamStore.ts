import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

/**
 * URL 参数提取和延迟应用存储
 * 
 * 职责：
 * 1. 在路由守卫阶段提取 URL 参数 (lng, lat, z, l, s, loc, p)
 * 2. 保存这些参数直到地图 GIS 引擎异步加载完毕
 * 3. 提供标志位表示参数是否已被应用（防止重复应用）
 * 4. 支持参数验证与格式规范化
 */
export const useUrlParamStore = defineStore('urlParamStore', () => {
    // 待应用的 URL 参数
    const pendingParams = ref({
        lng: null,
        lat: null,
        z: null,
        l: null,
        s: '0',
        loc: '0',
        p: null
    });

    // 是否已将参数应用到地图
    const isParamApplied = ref(false);

    // 是否是分享模式进入（s=1）
    const isShareModeEntry = computed(() => pendingParams.value.s === '1');

    /**
     * 从 URL 查询参数中提取并存储参数
     * 在路由守卫中调用，以便在组件挂载前做好准备
     * 
     * @param {Object} queryParams - 从路由查询提取的参数对象
     *   - lng: 经度
     *   - lat: 纬度
     *   - z: 缩放级别
     *   - l: 图层索引
     *   - s: 分享标记 ('0' | '1')
     *   - loc: 定位授权标记 ('0' | '1')
     *   - p: 加密位置编码
     */
    function extractAndStorePendingParams(queryParams = {}) {
        // 验证并规范化参数
        const normalizedLng = validateCoordinate(queryParams.lng);
        const normalizedLat = validateCoordinate(queryParams.lat);
        const normalizedZ = validateZoom(queryParams.z);
        const normalizedL = validateLayerIndex(queryParams.l);
        const normalizedS = normalizeBinaryFlag(queryParams.s, '0');
        const normalizedLoc = normalizeBinaryFlag(queryParams.loc, '0');
        const normalizedP = String(queryParams.p || '').trim() || null;

        // 存储已规范化的参数（仅存储有效值）
        pendingParams.value = {
            lng: normalizedLng,
            lat: normalizedLat,
            z: normalizedZ,
            l: normalizedL,
            s: normalizedS,
            loc: normalizedLoc,
            p: normalizedP
        };

        // 重置应用标志
        isParamApplied.value = false;

        console.info(
            '[UrlParamStore] Extracted pending params:',
            pendingParams.value
        );
    }

    /**
     * 获取待应用的参数
     * @returns {Object} 包含所有待应用参数的对象
     */
    function getPendingParams() {
        return { ...pendingParams.value };
    }

    /**
     * 获取仅包含有效地理坐标的参数 (用于地图初始化)
     * @returns {Object|null} 若坐标完整则返回 {lng, lat, z, l}，否则返回 null
     */
    function getValidCoordinateParams() {
        const { lng, lat, z, l } = pendingParams.value;
        if (
            lng !== null && lat !== null &&
            Number.isFinite(lng) && Number.isFinite(lat)
        ) {
            return {
                lng,
                lat,
                z: z !== null ? z : 17,
                l: l !== null ? l : 0
            };
        }
        return null;
    }

    /**
     * 标记参数已被应用到地图
     * 防止重复应用或在组件重新挂载时错误地重新应用
     */
    function markParamsAsApplied() {
        isParamApplied.value = true;
        console.info('[UrlParamStore] Params marked as applied');
    }

    /**
     * 清空所有待应用参数
     * 通常在成功应用参数后调用
     */
    function clearPendingParams() {
        pendingParams.value = {
            lng: null,
            lat: null,
            z: null,
            l: null,
            s: '0',
            loc: '0',
            p: null
        };
        isParamApplied.value = false;
    }

    /**
     * 获取分享链接还原所需的元数据
     * @returns {Object} {hasLocation, hasPositionCode, shareFlag}
     */
    function getShareMetadata() {
        return {
            hasLocation: pendingParams.value.lng !== null && pendingParams.value.lat !== null,
            hasPositionCode: !!pendingParams.value.p,
            shareFlag: pendingParams.value.s,
            locateFlag: pendingParams.value.loc
        };
    }

    return {
        pendingParams,
        isParamApplied,
        isShareModeEntry,
        extractAndStorePendingParams,
        getPendingParams,
        getValidCoordinateParams,
        markParamsAsApplied,
        clearPendingParams,
        getShareMetadata
    };
});

// ============ 辅助验证函数 ============

function validateCoordinate(value) {
    const num = parseFloat(value);
    if (!Number.isFinite(num)) return null;
    // 经纬度范围检查
    if (num < -180 || num > 180) return null;
    return num;
}

function validateZoom(value) {
    const num = parseInt(value, 10);
    if (!Number.isFinite(num)) return null;
    if (num < 0 || num > 30) return null;
    return num;
}

function validateLayerIndex(value) {
    const num = parseInt(value, 10);
    if (!Number.isFinite(num)) return null;
    if (num < 0 || num > 100) return null; // 合理的图层数量范围
    return num;
}

function normalizeBinaryFlag(value, fallback = '0') {
    const raw = String(value ?? '').trim().toLowerCase();
    if (raw === '1' || raw === 'true') return '1';
    if (raw === '0' || raw === 'false') return '0';
    return fallback === '1' ? '1' : '0';
}
