import { resolveBatchTargetLayerIds } from './selectionManager';
import { normalizeTocExportFormat } from '../protocol';

const LAYER_ID_FORWARD_EVENT_TYPES = new Set(['zoom-layer', 'view-layer', 'remove-layer', 'solo-layer']);

function canLayerExportFormat(layerActions, format) {
    if (!layerActions || typeof layerActions !== 'object') return true;
    if (layerActions.exportLayerData === false) return false;

    if (format === 'csv') return layerActions.canExportCSV !== false;
    if (format === 'txt') return layerActions.canExportTXT !== false;
    if (format === 'geojson') return layerActions.canExportGeoJSON !== false;
    if (format === 'kml') return layerActions.canExportKML !== false;

    return true;
}

export function handleLayerTreeContextAction({
    evt,
    selectedLayerIds = [],
    availableLayerIds = [],
    addMultiSelectedLayer,
    removeMultiSelectedLayer,
    clearMultiSelectedLayers,
    setFolderRecursiveSelection,
    emit,
    message,
    openAttributeTable,
    setStyleTarget,
    copyLayerCoordinates,
    openManualAoiDialogByPoi,
    onDragStart,
    onDrop,
    resolveLayerActionsById
} = {}) {
    const type = String(evt?.type || '').trim();
    if (!type) return false;

    if (type === 'multi-select-add-layer') {
        addMultiSelectedLayer?.(evt.layerId);
        return true;
    }

    if (type === 'multi-select-remove-layer') {
        removeMultiSelectedLayer?.(evt.layerId);
        return true;
    }

    if (type === 'multi-select-clear') {
        clearMultiSelectedLayers?.();
        return true;
    }

    if (type === 'multi-select-toggle-folder-recursive') {
        setFolderRecursiveSelection?.(evt.nodeId, !!evt.checked);
        return true;
    }

    if (type === 'batch-layer-operation') {
        const targets = resolveBatchTargetLayerIds({
            inputLayerIds: evt.layerIds,
            fallbackLayerId: evt.layerId,
            selectedLayerIds,
            availableLayerIds
        });

        if (!targets.length) {
            message?.warning?.('未找到可执行批量操作的图层');
            return true;
        }

        const operation = String(evt.operation || '').trim().toLowerCase();
        if (operation === 'set-visible') {
            targets.forEach((layerId) => {
                emit?.('toggle-layer-visibility', {
                    layerId,
                    visible: !!evt.visible
                });
            });
            message?.success?.(`已批量${evt.visible ? '显示' : '隐藏'} ${targets.length} 个图层`);
            return true;
        }

        if (operation === 'export') {
            const format = normalizeTocExportFormat(evt.format);
            const exportTargets = targets.filter((layerId) => canLayerExportFormat(resolveLayerActionsById?.(layerId), format));

            if (!exportTargets.length) {
                message?.warning?.(`所选图层均不支持 ${format.toUpperCase()} 导出`);
                return true;
            }

            exportTargets.forEach((layerId) => {
                emit?.('export-layer-data', { layerId, format });
            });

            if (exportTargets.length < targets.length) {
                message?.info?.(`已过滤 ${targets.length - exportTargets.length} 个不支持 ${format.toUpperCase()} 的图层`);
            }

            message?.success?.(`已触发 ${exportTargets.length} 个图层的 ${format.toUpperCase()} 导出`);
            return true;
        }

        if (operation === 'remove') {
            targets.forEach((layerId) => {
                emit?.('remove-layer', layerId);
            });
            clearMultiSelectedLayers?.();
            message?.success?.(`已批量移除 ${targets.length} 个图层`);
            return true;
        }

        message?.warning?.(`未识别的批量操作：${operation || 'unknown'}`);
        return true;
    }

    if (type === 'open-attribute-table') {
        openAttributeTable?.(evt.layerId);
        return true;
    }

    if (type === 'set-style-target') {
        setStyleTarget?.(evt.layerId);
        return true;
    }

    if (type === 'copy-layer-coordinates') {
        copyLayerCoordinates?.(evt.layer);
        return true;
    }

    if (type === 'open-amap-aoi-panel') {
        openManualAoiDialogByPoi?.({
            poiid: evt?.poiid,
            layerName: evt?.layerName
        }, {
            showMissingIdHint: true
        });
        return true;
    }

    if (type === 'toggle-layer-crs' || type === 'toggle-search-layer-crs') {
        emit?.('toggle-layer-crs', {
            layerId: evt.layerId,
            crs: evt.crs,
            fromCrs: evt.fromCrs,
            toCrs: evt.toCrs
        });
        return true;
    }

    if (type === 'export-layer-data') {
        const format = normalizeTocExportFormat(evt.format);
        if (!canLayerExportFormat(resolveLayerActionsById?.(evt.layerId), format)) {
            message?.warning?.(`当前图层不支持 ${format.toUpperCase()} 导出`);
            return true;
        }

        emit?.('export-layer-data', {
            layerId: evt.layerId,
            format
        });
        return true;
    }

    if (type === 'drag-layer-start') {
        onDragStart?.(evt.layerId);
        return true;
    }

    if (type === 'drop-layer') {
        onDrop?.(evt.layerId);
        return true;
    }

    if (type === 'toggle-layer-label-visibility') {
        emit?.('toggle-layer-label-visibility', { layerId: evt.layerId, visible: !!evt.visible });
        return true;
    }

    if (LAYER_ID_FORWARD_EVENT_TYPES.has(type)) {
        emit?.(type, evt.layerId);
        return true;
    }

    if (type === 'interaction') {
        emit?.('interaction', evt.interaction);
        return true;
    }

    return false;
}
