/**
 * 行政区划管理功能
 * 负责行政区边界加载、聚焦、可见性控制
 */

import { DistrictManager } from '../../../services/DistrictManager';

/**
 * 创建行政区划管理功能
 * @param {Object} deps - 依赖注入
 * @param {import('vue').Ref} deps.mapInstance - 地图实例
 * @param {Object} deps.tocStore - TOC Store
 * @param {Array} deps.userDataLayers - 用户图层数据
 * @param {Function} deps.emitUserLayersChange - 发射图层变更事件
 * @param {Function} deps.emitGraphicsOverview - 发射图形概览事件
 * @param {Function} deps.serializeManagedFeatures - 序列化托管要素
 */
export function createDistrictManagerFeature({
    mapInstance,
    tocStore,
    userDataLayers,
    emitUserLayersChange,
    emitGraphicsOverview,
    serializeManagedFeatures,
}) {
    let districtManagerRef = null;

    /**
     * 确保行政区划管理器已初始化
     * @returns {DistrictManager|null} 管理器实例
     */
    function ensureDistrictManager() {
        if (!mapInstance.value) return null;

        if (!districtManagerRef) {
            districtManagerRef = new DistrictManager({
                map: mapInstance.value,
                tocStore,
                userDataLayers,
                emitUserLayersChange,
                emitGraphicsOverview,
                serializeManagedFeatures,
            });
        }

        return districtManagerRef;
    }

    /**
     * 根据 adcode 加载行政区边界
     * @param {Object} payload - 参数对象
     * @param {string} payload.adcode - 6位行政区划代码
     * @param {string} payload.name - 行政区名称
     * @param {boolean} payload.fit - 是否自动聚焦
     */
    async function focusDistrictByAdcode(payload = {}) {
        const adcode = String(payload?.adcode || payload?.value || '').trim();
        if (!/^\d{6}$/.test(adcode)) {
            throw new Error('行政区 adcode 必须是 6 位数字');
        }

        const manager = ensureDistrictManager();
        if (!manager) {
            throw new Error('地图尚未初始化');
        }

        return manager.loadBoundary({
            adcode,
            name: String(payload?.name || payload?.label || '').trim(),
            fit: payload?.fit !== false,
        });
    }

    /**
     * 设置行政区图层可见性
     * @param {string} adcode - 行政区划代码
     * @param {boolean} visible - 是否可见
     */
    function setDistrictLayerVisibility(adcode, visible) {
        const manager = ensureDistrictManager();
        if (manager) {
            manager.setDistrictLayerVisibility(adcode, visible);
        }
    }

    /**
     * 移除行政区图层
     * @param {string} adcode - 行政区划代码
     */
    function removeDistrictLayer(adcode) {
        const manager = ensureDistrictManager();
        if (manager) {
            manager.removeDistrictLayer(adcode);
        }
    }

    /**
     * 销毁行政区划管理器，释放资源
     * 组件卸载时调用，避免内存泄漏
     */
    function disposeDistrictManager() {
        if (districtManagerRef) {
            districtManagerRef.dispose?.();
            districtManagerRef = null;
        }
    }

    return {
        ensureDistrictManager,
        focusDistrictByAdcode,
        setDistrictLayerVisibility,
        removeDistrictLayer,
        disposeDistrictManager,
    };
}
