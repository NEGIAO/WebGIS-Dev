/**
 * 几何编辑会话功能库
 * 负责 Select + Modify + 删除选中 + Escape/Delete 快捷键。
 * 编辑范围：全部矢量托管图层（绘制/上传/搜索/行政区划均可编辑），
 * 仅排除路线图层（由规划器生成，手动改几何会破坏路线步骤联动）与栅格/WebGL 图层。
 */

import Select from 'ol/interaction/Select';
import Modify from 'ol/interaction/Modify';
import { unByKey } from 'ol/Observable';
import {
    applyDrawingFeatureStyle,
    createSelectionHighlightStyle,
    createGenericSelectionHighlightStyle,
    isDrawingStyledFeature,
    setDrawingFeatureMetadata,
} from '@ol/drawing/composables/useDrawingFeatureStyle';
import { normalizeDrawingStyleParams } from '@ol/drawing/registry/drawingToolRegistry';

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
     * 解析托管图层记录持有的 OL Layer
     * 兼容两种字段：常规托管图层的 layer 与行政区划托管记录的 _layer
     * @param {Object} layerItem
     * @returns {import('ol/layer/Layer').default|null}
     */
    function getOlLayerFromItem(layerItem) {
        return layerItem?.layer || layerItem?._layer || null;
    }

    /**
     * 判断图层是否可编辑：任意矢量托管图层（不再局限 sourceType=draw）
     * 排除项：路线图层（规划器生成）、非矢量源（栅格/瓦片）、WebGL 大数据图层
     * @param {Object} layerItem
     * @returns {boolean}
     */
    function isEditableLayer(layerItem) {
        const layer = getOlLayerFromItem(layerItem);
        if (!layer) return false;
        // 路线图层由路径规划器生成，几何与途径步骤强绑定，不开放手动编辑
        if (layerItem.sourceType === 'route') return false;
        if (typeof layer.getSource !== 'function') return false;
        // 仅矢量源可编辑（栅格/瓦片源没有 getFeatures）
        const source = layer.getSource?.();
        if (!source || typeof source.getFeatures !== 'function') return false;
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
        return userDataLayers.find((item) => getOlLayerFromItem(item) === layer) || null;
    }

    /**
     * 同步托管图层 features 快照
     * @param {Object} layerItem
     */
    function syncEditedLayerFeatures(layerItem) {
        const layer = getOlLayerFromItem(layerItem);
        if (!layer) return;
        const source = layer.getSource?.();
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
     * 绘制要素：基础样式 + 高亮叠加；非绘制来源要素（上传/搜索/区划）：仅通用高亮描边，
     * 不重建基础样式，避免覆盖其图层级样式语义。
     * @param {Feature} feature
     */
    function applySelectionHighlight(feature) {
        if (!feature) return;
        if (isDrawingStyledFeature(feature)) {
            feature.setStyle(createSelectionHighlightStyle(feature));
        } else {
            feature.setStyle(createGenericSelectionHighlightStyle());
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
     * 键盘快捷键：Escape 取消选择/退出编辑，Delete/Backspace 删除选中要素
     * 输入框聚焦时不响应，避免误删
     * @param {KeyboardEvent} event
     */
    function handleGeometryEditKeydown(event) {
        const target = event.target;
        const tagName = String(target?.tagName || '').toUpperCase();
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable) return;

        if (event.key === 'Escape') {
            if (selectedFeature) {
                clearSelectionState();
                return;
            }
            clearGeometryEditInteractions();
            return;
        }

        if ((event.key === 'Delete' || event.key === 'Backspace') && selectedFeature) {
            event.preventDefault();
            Promise.resolve(deleteSelectedDrawingFeature()).catch(() => {});
        }
    }

    /**
     * 激活选择编辑模式
     * @param {Object} [options]
     * @param {string} [options.layerId] - 仅编辑指定托管图层（TOC「编辑要素」定向入口）；为空则编辑全部可编辑图层
     * @returns {boolean}
     */
    function activateGeometryEdit(options = {}) {
        clearGeometryEditInteractions();
        const map = mapInstanceRef.value;
        if (!map) return false;

        const targetLayerId = String(options?.layerId || '').trim();

        selectInteraction = new Select({
            layers: (layer) => {
                const item = findLayerItemByOlLayer(layer);
                if (!isEditableLayer(item)) return false;
                return !targetLayerId || String(item.id) === targetLayerId;
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
                                const source = getOlLayerFromItem(item)?.getSource?.();
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
     * 删除当前选中要素（适用于全部可编辑图层）
     * 绘制图层清空后自动移除托管图层；上传/搜索/区划图层清空后保留空图层记录，
     * 是否移除交由 TOC 图层目录统一管理，避免绕过图层管理入口
     * @returns {Promise<boolean>}
     */
    async function deleteSelectedDrawingFeature() {
        if (!selectedFeature || !selectedLayerItem) return false;

        const source = getOlLayerFromItem(selectedLayerItem)?.getSource?.();
        if (!source) return false;

        source.removeFeature(selectedFeature);
        const remaining = source.getFeatures?.() || [];

        if (!remaining.length && selectedLayerItem.sourceType === 'draw') {
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
     * 非绘制来源要素首次调整样式时，按几何类型推导 drawType 并转为要素级样式托管
     * @param {Object} stylePatch
     * @returns {boolean}
     */
    function updateSelectedDrawingStyle(stylePatch = {}) {
        if (!selectedFeature) return false;
        const geometryType = String(selectedFeature.getGeometry?.()?.getType?.() || '');
        const fallbackDrawType = geometryType.includes('Point')
            ? 'Point'
            : geometryType.includes('LineString')
              ? 'LineString'
              : 'Polygon';
        const drawType = selectedFeature.get?.('drawType') || fallbackDrawType;
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
