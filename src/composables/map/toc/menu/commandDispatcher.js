import {
    TOC_MENU_COMMANDS,
    normalizeTocLayerId,
    normalizeTocLayerIdList,
    resolveTocExportFormatFromCommand
} from '../protocol';

function resolveBatchTargets(nodeId, selectedLayerIds = []) {
    const normalizedNodeId = normalizeTocLayerId(nodeId);
    const normalizedSelected = normalizeTocLayerIdList(selectedLayerIds);
    const selectedSet = new Set(normalizedSelected);

    if (normalizedNodeId && selectedSet.has(normalizedNodeId) && normalizedSelected.length > 0) {
        return normalizedSelected;
    }

    return normalizedNodeId ? [normalizedNodeId] : [];
}

function pushConfiguredEvent(bucket, eventName, payload) {
    const normalized = String(eventName || '').trim();
    if (!normalized) return;
    bucket.push({ type: normalized, payload: payload || {} });
}

export function dispatchContextMenuCommand({
    key,
    node,
    selectedLayerIds = []
} = {}) {
    const commandKey = String(key || '').trim().toLowerCase();
    if (!commandKey) return [];

    const actions = node?.actions || {};
    const nodeId = normalizeTocLayerId(node?.id);
    const events = [];

    const batchTargets = resolveBatchTargets(nodeId, selectedLayerIds);

    if (commandKey === TOC_MENU_COMMANDS.MULTI_SELECT_ADD) {
        events.push({ type: 'multi-select-add-layer', payload: { layerId: nodeId } });
        return events;
    }

    if (commandKey === TOC_MENU_COMMANDS.MULTI_SELECT_REMOVE) {
        events.push({ type: 'multi-select-remove-layer', payload: { layerId: nodeId } });
        return events;
    }

    if (commandKey === TOC_MENU_COMMANDS.MULTI_SELECT_CLEAR) {
        events.push({ type: 'multi-select-clear', payload: {} });
        return events;
    }

    if (
        commandKey === TOC_MENU_COMMANDS.FOLDER_MULTI_SELECT_ADD
        || commandKey === TOC_MENU_COMMANDS.FOLDER_MULTI_SELECT_REMOVE
    ) {
        events.push({
            type: 'multi-select-toggle-folder-recursive',
            payload: {
                nodeId,
                checked: commandKey === TOC_MENU_COMMANDS.FOLDER_MULTI_SELECT_ADD
            }
        });
        return events;
    }

    if (commandKey === TOC_MENU_COMMANDS.BATCH_SHOW || commandKey === TOC_MENU_COMMANDS.BATCH_HIDE) {
        events.push({
            type: 'batch-layer-operation',
            payload: {
                operation: 'set-visible',
                layerIds: batchTargets,
                visible: commandKey === TOC_MENU_COMMANDS.BATCH_SHOW
            }
        });
        return events;
    }

    if (commandKey === TOC_MENU_COMMANDS.BATCH_REMOVE) {
        events.push({
            type: 'batch-layer-operation',
            payload: {
                operation: 'remove',
                layerIds: batchTargets
            }
        });
        return events;
    }

    if (commandKey.startsWith('batch-export-')) {
        events.push({
            type: 'batch-layer-operation',
            payload: {
                operation: 'export',
                layerIds: batchTargets,
                format: resolveTocExportFormatFromCommand(commandKey)
            }
        });
        return events;
    }

    if (commandKey === TOC_MENU_COMMANDS.VIEW) {
        pushConfiguredEvent(events, actions.viewEvent, actions.viewPayload || { layerId: nodeId });
        return events;
    }

    if (commandKey === TOC_MENU_COMMANDS.SOLO) {
        pushConfiguredEvent(events, actions.soloEvent, actions.soloPayload || { layerId: nodeId });
        return events;
    }

    if (commandKey === TOC_MENU_COMMANDS.ATTRIBUTE) {
        events.push({ type: 'open-attribute-table', payload: { layerId: nodeId } });
        return events;
    }

    if (commandKey === TOC_MENU_COMMANDS.STYLE) {
        events.push({ type: 'set-style-target', payload: { layerId: actions.styleTarget || nodeId } });
        return events;
    }

    if (commandKey === TOC_MENU_COMMANDS.OPEN_AOI_PANEL) {
        events.push({
            type: 'open-amap-aoi-panel',
            payload: {
                layerId: nodeId,
                ...(actions.aoiPanelPayload || {})
            }
        });
        return events;
    }

    if (commandKey === TOC_MENU_COMMANDS.LABEL) {
        events.push({
            type: 'toggle-layer-label-visibility',
            payload: {
                layerId: nodeId,
                visible: node?.labelVisible === false
            }
        });
        return events;
    }

    if (commandKey === TOC_MENU_COMMANDS.COPY) {
        events.push({ type: 'copy-layer-coordinates', payload: { layer: node?.raw } });
        return events;
    }

    if (
        commandKey === TOC_MENU_COMMANDS.CONVERT_WGS84_TO_GCJ02
        || commandKey === TOC_MENU_COMMANDS.CONVERT_GCJ02_TO_WGS84
    ) {
        events.push({
            type: 'toggle-layer-crs',
            payload: {
                layerId: nodeId,
                fromCrs: commandKey === TOC_MENU_COMMANDS.CONVERT_WGS84_TO_GCJ02 ? 'wgs84' : 'gcj02',
                toCrs: commandKey === TOC_MENU_COMMANDS.CONVERT_WGS84_TO_GCJ02 ? 'gcj02' : 'wgs84'
            }
        });
        return events;
    }

    if (commandKey.startsWith('export-')) {
        events.push({
            type: 'export-layer-data',
            payload: {
                layerId: nodeId,
                format: resolveTocExportFormatFromCommand(commandKey)
            }
        });
        return events;
    }

    if (commandKey === TOC_MENU_COMMANDS.ZOOM) {
        pushConfiguredEvent(events, actions.zoomEvent || 'zoom-layer', actions.zoomPayload || { layerId: nodeId });
        return events;
    }

    if (commandKey === TOC_MENU_COMMANDS.REMOVE) {
        pushConfiguredEvent(events, actions.removeEvent || 'remove-layer', actions.removePayload || { layerId: nodeId });
        return events;
    }

    return events;
}
