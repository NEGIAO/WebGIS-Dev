/**
 * 地图交互选点功能
 * 包括公交选点、逆地理编码选点、下载框选
 */

import { ref } from 'vue';
import { toLonLat } from 'ol/proj';
import DragBox from 'ol/interaction/DragBox';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import { Style, Stroke, Fill } from 'ol/style';

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

    // 下载框选选区覆盖层
    let extentOverlayLayer = null;
    let extentOverlaySource = null;

    /**
     * 在地图上显示框选范围覆盖层
     * @param {import('ol/geom/Geometry').default} geometry - 框选几何图形
     */
    function showExtentOverlay(geometry) {
        clearExtentOverlay();
        if (!mapInstance.value || !geometry) return;

        extentOverlaySource = new VectorSource();
        const feature = new Feature({ geometry });
        extentOverlaySource.addFeature(feature);

        extentOverlayLayer = new VectorLayer({
            source: extentOverlaySource,
            style: new Style({
                stroke: new Stroke({
                    color: '#0e77b8',
                    width: 2,
                    lineDash: [8, 4],
                }),
                fill: new Fill({
                    color: 'rgba(145, 192, 209, 0.81)',
                }),
            }),
            zIndex: 9999,
        });

        mapInstance.value.addLayer(extentOverlayLayer);
    }

    /**
     * 清除地图上的框选范围覆盖层
     */
    function clearExtentOverlay() {
        if (extentOverlayLayer && mapInstance.value) {
            mapInstance.value.removeLayer(extentOverlayLayer);
        }
        extentOverlayLayer = null;
        extentOverlaySource = null;
    }

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
        removePreviewLayer();
        clearExtentOverlay();
        if (pendingDownloadBoxPickRef.value?.reject) {
            pendingDownloadBoxPickRef.value.reject(new Error(reason));
        }
        pendingDownloadBoxPickRef.value = null;
    }

    // 拖拽过程中的实时预览图层
    let previewLayer = null;
    let previewSource = null;
    const PREVIEW_STYLE = new Style({
        stroke: new Stroke({ color: '#2f9a57', width: 2, lineDash: [8, 4] }),
        fill: new Fill({ color: 'rgba(47, 154, 87, 0.15)' }),
    });

    function ensurePreviewLayer() {
        if (previewLayer) return;
        previewSource = new VectorSource();
        previewLayer = new VectorLayer({
            source: previewSource,
            style: PREVIEW_STYLE,
            zIndex: 99999,
        });
        mapInstance.value?.addLayer(previewLayer);
    }

    function removePreviewLayer() {
        if (previewLayer && mapInstance.value) {
            mapInstance.value.removeLayer(previewLayer);
        }
        previewLayer = null;
        previewSource = null;
    }

    function updatePreviewGeometry(geometry) {
        if (!previewSource) return;
        previewSource.clear();
        if (geometry) {
            previewSource.addFeature(new Feature({ geometry }));
        }
    }

    /**
     * 启动下载范围框选
     * 拖拽过程中实时显示预览矩形，完成后转为持久化覆盖层
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
            downloadBoxInteraction = new DragBox({ condition: () => true });
            mapInstance.value.addInteraction(downloadBoxInteraction);

            // 拖拽过程中实时更新预览图层
            downloadBoxInteraction.on('boxdrag', () => {
                const geometry = downloadBoxInteraction?.getGeometry?.();
                if (geometry) {
                    ensurePreviewLayer();
                    updatePreviewGeometry(geometry);
                }
            });

            downloadBoxInteraction.on('boxend', () => {
                const geometry = downloadBoxInteraction?.getGeometry?.();
                const extent = geometry?.getExtent?.();

                // 移除交互和预览图层
                if (downloadBoxInteraction && mapInstance.value) {
                    mapInstance.value.removeInteraction(downloadBoxInteraction);
                }
                downloadBoxInteraction = null;
                removePreviewLayer();

                const pending = pendingDownloadBoxPickRef.value;
                pendingDownloadBoxPickRef.value = null;

                if (!extent || extent.length < 4) {
                    pending?.reject?.(new Error('下载范围获取失败'));
                    return;
                }

                // 转为持久化覆盖层
                if (geometry) {
                    showExtentOverlay(geometry);
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
        removePreviewLayer();
        clearExtentOverlay();
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
        clearExtentOverlay,
        disposeAll,
    };
}
