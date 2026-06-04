/**
 * 地图交互选点功能
 * 包括公交选点、逆地理编码选点
 */

import { ref } from 'vue';

/**
 * 创建地图交互选点功能
 * @param {Object} deps - 依赖注入
 * @param {import('vue').Ref} deps.mapInstance - 地图实例
 */
export function createMapInteractionPickers({ mapInstance }) {
    // ========== 公交/逆地理编码选点 ==========
    const pendingBusPickRef = ref(null);
    const pendingReverseGeocodePickRef = ref(null);

    // ==================== 公交选点 ====================

    /**
     * 启动公交站点选点
     * 会自动取消进行中的逆地理编码选点
     * @param {string} type - 选点类型 ('start' | 'end')
     * @returns {Promise} 选点结果
     */
    function startBusPointPick(type) {
        if (!mapInstance.value) {
            return Promise.reject(new Error('地图尚未初始化'));
        }

        if (pendingReverseGeocodePickRef.value?.reject) {
            pendingReverseGeocodePickRef.value.reject(new Error('逆地理编码选点已取消'));
            pendingReverseGeocodePickRef.value = null;
        }

        const pickType = type === 'end' ? 'end' : 'start';

        if (pendingBusPickRef.value?.reject) {
            pendingBusPickRef.value.reject(new Error('上一次选点已取消'));
        }

        return new Promise((resolve, reject) => {
            pendingBusPickRef.value = { type: pickType, resolve, reject };
        });
    }

    // ==================== 逆地理编码选点 ====================

    /**
     * 启动逆地理编码选点
     * @returns {Promise} 选点结果 { lng, lat }
     */
    function startReverseGeocodePick() {
        if (!mapInstance.value) {
            return Promise.reject(new Error('地图尚未初始化'));
        }

        if (pendingReverseGeocodePickRef.value?.reject) {
            pendingReverseGeocodePickRef.value.reject(new Error('上一次逆地理编码选点已取消'));
        }

        return new Promise((resolve, reject) => {
            pendingReverseGeocodePickRef.value = { resolve, reject };
        });
    }

    // ==================== 销毁 ====================

    /**
     * 销毁所有交互选点状态
     * 组件卸载时调用，清理未完成的 Promise
     */
    function disposeAll() {
        // 清理公交选点
        if (pendingBusPickRef.value?.reject) {
            pendingBusPickRef.value.reject(new Error('地图已卸载'));
            pendingBusPickRef.value = null;
        }
        // 清理逆地理编码选点
        if (pendingReverseGeocodePickRef.value?.reject) {
            pendingReverseGeocodePickRef.value.reject(new Error('地图已卸载'));
            pendingReverseGeocodePickRef.value = null;
        }
    }

    return {
        // 公交/逆地理编码
        pendingBusPickRef,
        pendingReverseGeocodePickRef,
        startBusPointPick,
        startReverseGeocodePick,
        // 生命周期
        disposeAll,
    };
}
