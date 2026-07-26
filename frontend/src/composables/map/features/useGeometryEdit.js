/**
 * 几何编辑会话功能库
 * 负责 Select + Modify + 删除选中 + Escape，仅编辑 sourceType=draw 的托管图层。
 */

import Select from 'ol/interaction/Select';
import Modify from 'ol/interaction/Modify';
import { unByKey } from 'ol/Observable';
import {
    applyDrawingFeatureStyle,
    createSelectionHighlightStyle,
    isDrawingStyledFeature,
    setDrawingFeatureMetadata,
} from './useDrawingFeatureStyle';
import { normalizeDrawingStyleParams } from './drawingToolRegistry';

/**
 * 工厂函数：创建几何编辑交互
 * @param {Object} options
 * @returns {Object}
 */
export function createGeometryEditFeature({
    mapInstanceRef = { value: null },
    userDataLayers = [],
    serializeManagedFeatures = () => [],
    emitUserLayersChange = () => {},
    emitGraphicsOverview = () => {},
    removeManagedLayerById = null,
    onSelectionChange = () => {},
} = {}) {
    let selectInteraction = null;
    let modifyInteraction = null;
    const listenerKeys = [];
    let selectedFeature = null;
    let selectedLayerItem = null;
    let keydownHandler = null;

    /**
     * 判断图层是否可编辑
     * @param {Object} layerItem
     * @returns {boolean}
     */
    function isEditableLayer(layerItem) {
        if (!layerItem || layerItem.sourceType !== 'draw') return false;
        const layer = layerItem.layer;
        if (!layer || typeof layer.getSource !== 'function') return false;
        // 排除 WebGL 大数据图层
        if (layer.get?.('_useWebGL') || layer.get?.('properties')?._useWebGL) return false;
        if (layer.getProperties?.()?._useWebGL) return false;
        return true;
    }

    /**
     * 根据 OL Layer 查找托管图层记录
     * @param {import('ol/layer/Layer').default} layer
     * @returns {Object|null}
     */
    function findLayerItemByOlLayer(layer) {
        if (!layer) return null;
        const managedId = layer.get?.('managedLayerId');
        if (managedId) {
            return userDataLayers.find((item) => item.id === managedId) || null;
        }
        return userDataLayers.find((item) => item.layer === layer) || null;
    }

    /**
     * 同步托管图层 features 快照
     * @param {Object} layerItem
     */
    function syncEditedLayerFeatures(layerItem) {
        if (!layerItem?.layer) return;
        const source = layerItem.layer.getSource?.();
        const features = source?.getFeatures?.() || [];
        layerItem.features = serializeManagedFeatures(features, layerItem.name);
        layerItem.featureCount = features.length;
    }

    /**
     * 恢复要素原始绘制样式
     * @param {Feature} feature
     */
    function restoreFeatureStyle(feature) {
        if (!feature) return;
        if (isDrawingStyledFeature(feature)) {
            applyDrawingFeatureStyle(feature);
        } else {
            feature.setStyle?.(null);
        }
    }

    /**
     * 应用选中高亮
     * @param {Feature} feature
     */
    function applySelectionHighlight(feature) {
        if (!feature) return;
        if (isDrawingStyledFeature(feature)) {
            feature.setStyle(createSelectionHighlightStyle(feature));
        } else {
            // 无 drawType 的旧绘制要素：使用浅青描边提示
            feature.setStyle(
                createSelectionHighlightStyle({
                    get: (key) => {
                        if (key === 'drawType') return 'Polygon';
                        if (key === 'styleParams') {
                            return normalizeDrawingStyleParams({});
                        }
                        return undefined;
                    },
                    getGeometry: () => feature.getGeometry?.(),
                }),
            );
        }
    }

    /**
     * 清理选择状态
     */
    function clearSelectionState() {
        if (selectedFeature) restoreFeatureStyle(selectedFeature);
        selectedFeature = null;
        selectedLayerItem = null;
        selectInteraction?.getFeatures?.()?.clear?.();
        onSelectionChange(null);
    }

    /**
     * 清理编辑交互
     */
    function clearGeometryEditInteractions() {
        const map = mapInstanceRef.value;
        if (selectInteraction && map) map.removeInteraction(selectInteraction);
        if (modifyInteraction && map) map.removeInteraction(modifyInteraction);
        listenerKeys.forEach((key) => unByKey(key));
        listenerKeys.length = 0;
        selectInteraction = null;
        modifyInteraction = null;
        clearSelectionState();

        if (keydownHandler) {
            window.removeEventListener('keydown', keydownHandler);
            keydownHandler = null;
        }

        const viewport = map?.getViewport?.();
        if (viewport) viewport.style.cursor = '';
    }

    /**
     * Escape 处理
     * @param {KeyboardEvent} event
     */
    function handleGeometryEditKeydown(event) {
        if (event.key !== 'Escape') return;
        if (selectedFeature) {
            clearSelectionState();
            return;
        }
        clearGeometryEditInteractions();
    }

    /**
     * 激活选择编辑模式
     * @returns {boolean}
     */
    function activateGeometryEdit() {
        clearGeometryEditInteractions();
        const map = mapInstanceRef.value;
        if (!map) return false;

        selectInteraction = new Select({
            layers: (layer) => {
                const item = findLayerItemByOlLayer(layer);
                return isEditableLayer(item);
            },
            hitTolerance: 6,
        });

        modifyInteraction = new Modify({
            features: selectInteraction.getFeatures(),
        });

        listenerKeys.push(
            selectInteraction.on('select', (evt) => {
                (evt.deselected || []).forEach((feature) => restoreFeatureStyle(feature));

                if (evt.selected?.length) {
                    selectedFeature = evt.selected[0];
                    const layer = selectInteraction.getLayer?.(selectedFeature);
                    selectedLayerItem = findLayerItemByOlLayer(layer);
                    // 兼容：某些 OL 版本 getLayer 不可用，退回 source 扫描
                    if (!selectedLayerItem) {
                        selectedLayerItem =
                            userDataLayers.find((item) => {
                                if (!isEditableLayer(item)) return false;
                                const source = item.layer?.getSource?.();
                                return source?.getFeatures?.()?.includes?.(selectedFeature);
                            }) || null;
                    }
                    applySelectionHighlight(selectedFeature);
                    onSelectionChange({
                        feature: selectedFeature,
                        layerItem: selectedLayerItem,
                        drawType: selectedFeature.get?.('drawType') || null,
                        styleParams: selectedFeature.get?.('styleParams') || null,
                    });
                } else {
                    selectedFeature = null;
                    selectedLayerItem = null;
                    onSelectionChange(null);
                }
            }),
        );

        listenerKeys.push(
            modifyInteraction.on('modifyend', (evt) => {
                (evt.features?.getArray?.() || []).forEach((feature) => {
                    if (isDrawingStyledFeature(feature)) {
                        applyDrawingFeatureStyle(feature);
                    }
                    if (feature === selectedFeature) {
                        applySelectionHighlight(feature);
                    }
                });

                if (selectedLayerItem) {
                    syncEditedLayerFeatures(selectedLayerItem);
                    emitUserLayersChange();
                    emitGraphicsOverview();
                }
            }),
        );

        map.addInteraction(modifyInteraction);
        map.addInteraction(selectInteraction);

        keydownHandler = handleGeometryEditKeydown;
        window.addEventListener('keydown', keydownHandler);

        const viewport = map.getViewport?.();
        if (viewport) viewport.style.cursor = 'pointer';
        return true;
    }

    /**
     * 删除当前选中要素
     * @returns {Promise<boolean>}
     */
    async function deleteSelectedDrawingFeature() {
        if (!selectedFeature || !selectedLayerItem) return false;

        const source = selectedLayerItem.layer?.getSource?.();
        if (!source) return false;

        source.removeFeature(selectedFeature);
        const remaining = source.getFeatures?.() || [];

        if (!remaining.length) {
            const layerId = selectedLayerItem.id;
            clearSelectionState();
            if (typeof removeManagedLayerById === 'function') {
                await removeManagedLayerById(layerId);
            }
            emitUserLayersChange();
            emitGraphicsOverview();
            return true;
        }

        syncEditedLayerFeatures(selectedLayerItem);
        clearSelectionState();
        emitUserLayersChange();
        emitGraphicsOverview();
        return true;
    }

    /**
     * 更新选中要素样式
     * @param {Object} stylePatch
     * @returns {boolean}
     */
    function updateSelectedDrawingStyle(stylePatch = {}) {
        if (!selectedFeature) return false;
        const drawType = selectedFeature.get?.('drawType') || 'Polygon';
        const nextParams = normalizeDrawingStyleParams({
            ...(selectedFeature.get?.('styleParams') || {}),
            ...(stylePatch || {}),
        });

        // 圆轮廓：半径同步到几何
        if (drawType === 'CircleOutline' && Number.isFinite(Number(nextParams.radius))) {
            const geometry = selectedFeature.getGeometry?.();
            if (geometry?.setRadius) {
                geometry.setRadius(Number(nextParams.radius));
            }
        }

        setDrawingFeatureMetadata(selectedFeature, drawType, nextParams);
        applyDrawingFeatureStyle(selectedFeature);
        applySelectionHighlight(selectedFeature);

        if (selectedLayerItem) {
            selectedLayerItem.metadata = {
                ...(selectedLayerItem.metadata || {}),
                drawType,
                styleParams: nextParams,
            };
            if (selectedLayerItem.styleConfig) {
                selectedLayerItem.styleConfig = {
                    ...selectedLayerItem.styleConfig,
                    fillColor: nextParams.fillColor,
                    fillOpacity: nextParams.fillOpacity,
                    strokeColor: nextParams.strokeColor,
                    strokeWidth: nextParams.strokeWidth,
                    pointRadius: nextParams.radius,
                };
            }
            syncEditedLayerFeatures(selectedLayerItem);
            emitUserLayersChange();
        }

        onSelectionChange({
            feature: selectedFeature,
            layerItem: selectedLayerItem,
            drawType,
            styleParams: nextParams,
        });
        return true;
    }

    /**
     * 获取当前选中要素
     * @returns {Feature|null}
     */
    function getSelectedEditFeature() {
        return selectedFeature;
    }

    /**
     * 获取当前选中图层记录
     * @returns {Object|null}
     */
    function getSelectedEditLayerItem() {
        return selectedLayerItem;
    }

    return {
        activateGeometryEdit,
        clearGeometryEditInteractions,
        deleteSelectedDrawingFeature,
        updateSelectedDrawingStyle,
        getSelectedEditFeature,
        getSelectedEditLayerItem,
        isEditableLayer,
    };
}
