/**
 * 地图交互选点功能
 * 包括公交选点、逆地理编码选点、下载框选
 */

import { ref } from 'vue';
import { toLonLat } from 'ol/proj';
import DragBox from 'ol/interaction/DragBox';

/**
 * 创建地图交互选点功能
 * @param {Object} deps - 依赖注入
 * @param {import('vue').Ref} deps.mapInstance - 地图实例
 */
export function createMapInteractionPickers({ mapInstance }) {
    const pendingBusPickRef = ref(null);
    const pendingReverseGeocodePickRef = ref(null);
    const pendingDownloadBoxPickRef = ref(null);
    let downloadBoxInteraction = null;

    /**
     * 启动公交站点选点
     * 会自动取消进行中的逆地理编码选点和下载框选
     * @param {string} type - 选点类型 ('start' | 'end')
     * @returns {Promise} 选点结果
     */
    function startBusPointPick(type) {
        if (!mapInstance.value) {
            return Promise.reject(new Error('地图尚未初始化'));
        }

        // 取消进行中的下载框选，避免 DragBox 干扰点击
        cancelDownloadBoxPick('公交选点已取消');

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

    /**
     * 启动逆地理编码选点
     * 会自动取消进行中的下载框选
     * @returns {Promise} 选点结果 { lng, lat }
     */
    function startReverseGeocodePick() {
        if (!mapInstance.value) {
            return Promise.reject(new Error('地图尚未初始化'));
        }

        // 取消进行中的下载框选，避免 DragBox 干扰点击
        cancelDownloadBoxPick('逆地理编码选点已取消');

        if (pendingReverseGeocodePickRef.value?.reject) {
            pendingReverseGeocodePickRef.value.reject(new Error('上一次逆地理编码选点已取消'));
        }

        return new Promise((resolve, reject) => {
            pendingReverseGeocodePickRef.value = { resolve, reject };
        });
    }

    /**
     * 取消下载框选
     * @param {string} reason - 取消原因
     */
    function cancelDownloadBoxPick(reason = '下载范围选择已取消') {
        if (downloadBoxInteraction && mapInstance.value) {
            mapInstance.value.removeInteraction(downloadBoxInteraction);
        }
        downloadBoxInteraction = null;
        if (pendingDownloadBoxPickRef.value?.reject) {
            pendingDownloadBoxPickRef.value.reject(new Error(reason));
        }
        pendingDownloadBoxPickRef.value = null;
    }

    /**
     * 启动下载范围框选
     * @returns {Promise} 框选结果 { extent, crs }
     */
    function pickDownloadExtent() {
        if (!mapInstance.value) {
            return Promise.reject(new Error('地图尚未初始化'));
        }

        if (pendingDownloadBoxPickRef.value?.reject) {
            cancelDownloadBoxPick('上一次范围选择已取消');
        }

        return new Promise((resolve, reject) => {
            pendingDownloadBoxPickRef.value = { resolve, reject };
            downloadBoxInteraction = new DragBox({
                condition: () => true,
            });
            mapInstance.value.addInteraction(downloadBoxInteraction);

            downloadBoxInteraction.on('boxend', () => {
                const geometry = downloadBoxInteraction?.getGeometry?.();
                const extent = geometry?.getExtent?.();
                if (downloadBoxInteraction && mapInstance.value) {
                    mapInstance.value.removeInteraction(downloadBoxInteraction);
                }
                downloadBoxInteraction = null;
                const pending = pendingDownloadBoxPickRef.value;
                pendingDownloadBoxPickRef.value = null;

                if (!extent || extent.length < 4) {
                    pending?.reject?.(new Error('下载范围获取失败'));
                    return;
                }

                const [minX_3857, minY_3857, maxX_3857, maxY_3857] = extent;
                const [minLon, minLat] = toLonLat([minX_3857, minY_3857]);
                const [maxLon, maxLat] = toLonLat([maxX_3857, maxY_3857]);
                const wgs84Extent = [minLon, minLat, maxLon, maxLat];

                pending?.resolve?.({
                    extent: wgs84Extent,
                    crs: 'EPSG:4326',
                });
            });
        });
    }

    /**
     * 销毁所有交互选点状态
     * 组件卸载时调用，清理残留的 DragBox 交互和未完成的 Promise
     */
    function disposeAll() {
        if (downloadBoxInteraction && mapInstance.value) {
            mapInstance.value.removeInteraction(downloadBoxInteraction);
        }
        downloadBoxInteraction = null;
        if (pendingBusPickRef.value?.reject) {
            pendingBusPickRef.value.reject(new Error('地图已卸载'));
            pendingBusPickRef.value = null;
        }
        if (pendingReverseGeocodePickRef.value?.reject) {
            pendingReverseGeocodePickRef.value.reject(new Error('地图已卸载'));
            pendingReverseGeocodePickRef.value = null;
        }
        if (pendingDownloadBoxPickRef.value?.reject) {
            pendingDownloadBoxPickRef.value.reject(new Error('地图已卸载'));
            pendingDownloadBoxPickRef.value = null;
        }
    }

    return {
        pendingBusPickRef,
        pendingReverseGeocodePickRef,
        pendingDownloadBoxPickRef,
        startBusPointPick,
        startReverseGeocodePick,
        cancelDownloadBoxPick,
        pickDownloadExtent,
        disposeAll,
    };
}
