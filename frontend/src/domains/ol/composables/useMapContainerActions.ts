/**
 * 功能名称：OpenLayers 地图容器对外动作集合（自定义底图切换、图层重命名与导出、范围查询）
 * 说    明：从 MapContainer 抽离底图激活/自定义 XYZ URL 切换与用户图层导出/重命名动作。
 */
import type { Ref } from 'vue';
import GeoJSON from 'ol/format/GeoJSON';
import { toLonLat } from 'ol/proj';
import type Map from 'ol/Map';

import { looksLikeWmsSourceUrl } from '@common/basemap/wmsService';
import { createLayerExporter } from '@common/layer-tree/actions/layerExportService';

export interface UseMapContainerActionsDeps {
    mapInstanceRef: Ref<Map | null>;
    selectedLayerRef: Ref<string>;
    userDataLayers: any[];
    message: any;
    getLayerIndexById: (layerId: string) => number | null | undefined;
    handleLayerChange: (payload: any) => Promise<any>;
    syncUrlFromActiveMap: () => void;
    setBaseLayerActiveDeferred: (layerId: string) => Promise<any>;
    switchLayerById: (layerId: string, opts?: any) => any;
    emitBaseLayersChangeBatched: (() => void) & { cancel?: () => void };
    emitUserLayersChange: () => void;
}

export function createMapContainerActions(deps: UseMapContainerActionsDeps) {
    const {
        mapInstanceRef,
        selectedLayerRef,
        userDataLayers,
        message,
        getLayerIndexById,
        handleLayerChange,
        syncUrlFromActiveMap,
        setBaseLayerActiveDeferred,
        switchLayerById,
        emitBaseLayersChangeBatched,
        emitUserLayersChange,
    } = deps;

    /**
     * 通过 XYZ URL 切换到自定义底图
     */
    async function setCustomBasemapByUrl(url: string) {
        const normalizedUrl = String(url || '').trim();
        const customLayerIndex = getLayerIndexById('custom');

        if (!normalizedUrl) {
            return {
                success: false,
                message: '自定义 XYZ 底图 URL 不能为空',
                layerId: 'custom',
                layerIndex: customLayerIndex,
            };
        }

        // 服务类地址（WMS/ArcGIS REST）由注册表 adapter 渲染，禁止以 XYZ 通道覆盖
        if (looksLikeWmsSourceUrl(normalizedUrl)) {
            return {
                success: false,
                message: '服务类地址已由「在线服务」分组接管，请通过 TOC 勾选子图层控制显示',
                layerId: 'custom',
                layerIndex: customLayerIndex,
            };
        }

        if (customLayerIndex !== 2) {
            return {
                success: false,
                message: `自定义底图索引配置异常：期望 l=2，当前为 l=${customLayerIndex}`,
                layerId: 'custom',
                layerIndex: customLayerIndex,
                url: normalizedUrl,
            };
        }

        try {
            const switchResult = await handleLayerChange({
                layerId: 'custom',
                source: 'custom-url',
                customUrl: normalizedUrl,
            });

            if (switchResult?.success === false) {
                return {
                    ...switchResult,
                    layerId: 'custom',
                    layerIndex: customLayerIndex,
                    url: normalizedUrl,
                };
            }

            if (selectedLayerRef.value !== 'custom') {
                return {
                    success: false,
                    message: '自定义底图图源已加载，但当前底图未切换到 custom',
                    layerId: selectedLayerRef.value,
                    layerIndex: getLayerIndexById(selectedLayerRef.value),
                    url: normalizedUrl,
                };
            }

            // Agent 切换自定义底图时必须落到 URL 索引 l=2，便于分享链接和状态恢复。
            syncUrlFromActiveMap();
            mapInstanceRef.value?.updateSize?.();

            return {
                success: true,
                message: `已切换到自定义 XYZ 底图（URL 图层索引 l=${customLayerIndex}）`,
                layerId: 'custom',
                layerIndex: customLayerIndex,
                url: normalizedUrl,
                customLoadResult: switchResult?.customLoadResult || null,
            };
        } catch (error: any) {
            return {
                success: false,
                message: `切换自定义 XYZ 底图失败：${error?.message || '未知错误'}`,
                layerId: 'custom',
                layerIndex: customLayerIndex,
                url: normalizedUrl,
            };
        }
    }

    /**
     * 设置底图激活状态并立即触发实际图层切换。
     */
    async function setBaseLayerActive(layerId: string): Promise<void> {
        if (!layerId) return;
        await setBaseLayerActiveDeferred(layerId);
        if (selectedLayerRef.value !== layerId) {
            selectedLayerRef.value = layerId;
        }
        switchLayerById?.(layerId, {
            onUpdated: () => {
                emitBaseLayersChangeBatched?.();
                mapInstanceRef.value?.updateSize?.();
            },
        });
    }

    // 初始化图层导出服务并包装为适配本组件的调用方式
    const exporterFn = createLayerExporter({ message });
    const exportLayerCoordinates = (payload: any): void => {
        exporterFn(payload, { userDataLayers });
    };

    /**
     * 导出用户图层为 GeoJSON 文本（WGS-84，保留原始属性；供跨引擎投递如导入 3D）。
     */
    function exportUserLayerGeoJSON(
        payload: { layerId?: string } = {},
    ): { name: string; text: string } | null {
        const layerId = String(payload?.layerId || '').trim();
        if (!layerId) return null;
        const target = userDataLayers.find((item) => String(item?.id) === layerId);
        const features = target?.layer?.getSource?.()?.getFeatures?.() || [];
        if (!target || !features.length) return null;
        try {
            const format = new GeoJSON();
            const obj = format.writeFeaturesObject(features, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857',
            });
            return { name: target.name || 'layer', text: JSON.stringify(obj) };
        } catch {
            return null;
        }
    }

    /**
     * 用户图层重命名（TOC 右键「重命名」/ 双击行名的统一落地入口）
     */
    function renameUserLayer(layerId: string, newName: string): boolean {
        const id = String(layerId || '').trim();
        const name = String(newName || '').trim();
        if (!id || !name) return false;

        const target = userDataLayers.find((item) => String(item?.id) === id);
        if (!target) return false;
        if (String(target.name || '') === name) return true;

        target.name = name;
        // standardTocItem 允许挂在记录或 metadata 上（normalizeEmittedStandardTocItem 两处都读）
        const standardItem = target.standardTocItem || target.metadata?.standardTocItem;
        if (standardItem && typeof standardItem === 'object') {
            standardItem.name = name;
        }
        emitUserLayersChange();
        return true;
    }

    /**
     * 获取当前地图视图的可视范围（BBox）
     */
    function getMapExtent(): {
        minLon: number;
        minLat: number;
        maxLon: number;
        maxLat: number;
    } | null {
        if (!mapInstanceRef.value) return null;
        const view = mapInstanceRef.value.getView();
        const extent = view.calculateExtent(mapInstanceRef.value.getSize());
        if (!extent || extent.length < 4) return null;
        const [minLon, minLat] = toLonLat([extent[0], extent[1]]);
        const [maxLon, maxLat] = toLonLat([extent[2], extent[3]]);
        return {
            minLon: Math.min(minLon, maxLon),
            minLat: Math.min(minLat, maxLat),
            maxLon: Math.max(minLon, maxLon),
            maxLat: Math.max(minLat, maxLat),
        };
    }

    return {
        setCustomBasemapByUrl,
        setBaseLayerActive,
        exportLayerCoordinates,
        exportUserLayerGeoJSON,
        renameUserLayer,
        getMapExtent,
    };
}
