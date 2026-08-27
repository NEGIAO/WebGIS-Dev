import { TOC_MENU_COMMANDS, normalizeTocLayerIdList } from '../protocol';
import { RSVC_NODE_PREFIX } from '@common/basemap/remoteServices';

function flattenMenuGroups(groups = []) {
    const flattened = [];
    groups.forEach((group, index) => {
        if (!Array.isArray(group) || !group.length) return;
        if (flattened.length > 0 && index > 0) {
            flattened.push({ key: `divider_${index}`, divider: true });
        }
        flattened.push(...group);
    });
    return flattened;
}

export function buildContextMenuItems({ node, capabilities = {}, selectionState = {} } = {}) {
    if (!node) return [];

    const nodeType = String(node.type || '').toLowerCase();
    const groups = [];

    const selectedLayerIds = normalizeTocLayerIdList(selectionState.selectedLayerIds);
    const currentNodeId = String(selectionState.currentNodeId || node.id || '').trim();
    const selectedSet = new Set(selectedLayerIds);
    const isCurrentLayerSelected =
        !!selectionState.isCurrentLayerSelected || selectedSet.has(currentNodeId);

    const folderSelectionState = selectionState.folderSelectionState || {
        totalCount: 0,
        selectedCount: 0,
        isAllSelected: false,
        hasAnySelected: false,
        isPartialSelected: false,
    };

    if (nodeType === 'layer') {
        const batchTargetIds =
            isCurrentLayerSelected && selectedLayerIds.length > 0
                ? selectedLayerIds
                : currentNodeId
                  ? [currentNodeId]
                  : [];

        const selection = [
            {
                key: isCurrentLayerSelected
                    ? TOC_MENU_COMMANDS.MULTI_SELECT_REMOVE
                    : TOC_MENU_COMMANDS.MULTI_SELECT_ADD,
                label: isCurrentLayerSelected ? '移出多选' : '加入多选',
            },
        ];
        if (selectedLayerIds.length > 0) {
            selection.push({
                key: TOC_MENU_COMMANDS.MULTI_SELECT_CLEAR,
                label: `清空多选 (${selectedLayerIds.length})`,
            });
        }
        groups.push(selection);

        const batch = [];
        if (batchTargetIds.length > 1) {
            batch.push({
                key: TOC_MENU_COMMANDS.BATCH_SHOW,
                label: `批量显示 (${batchTargetIds.length})`,
            });
            batch.push({
                key: TOC_MENU_COMMANDS.BATCH_HIDE,
                label: `批量隐藏 (${batchTargetIds.length})`,
            });

            if (capabilities.canExportData) {
                if (capabilities.canExportCSV)
                    batch.push({
                        key: TOC_MENU_COMMANDS.BATCH_EXPORT_CSV,
                        label: `批量导出坐标(CSV) (${batchTargetIds.length})`,
                    });
                if (capabilities.canExportTXT)
                    batch.push({
                        key: TOC_MENU_COMMANDS.BATCH_EXPORT_TXT,
                        label: `批量导出坐标(TXT) (${batchTargetIds.length})`,
                    });
                if (capabilities.canExportGeoJSON)
                    batch.push({
                        key: TOC_MENU_COMMANDS.BATCH_EXPORT_GEOJSON,
                        label: `批量导出坐标(GeoJSON) (${batchTargetIds.length})`,
                    });
                if (capabilities.canExportKML)
                    batch.push({
                        key: TOC_MENU_COMMANDS.BATCH_EXPORT_KML,
                        label: `批量导出坐标(KML) (${batchTargetIds.length})`,
                    });
            }

            if (capabilities.canRemove) {
                batch.push({
                    key: TOC_MENU_COMMANDS.BATCH_REMOVE,
                    label: `批量移除图层 (${batchTargetIds.length})`,
                    danger: true,
                });
            }
        }
        if (batch.length) groups.push(batch);

        const primary = [];
        if (capabilities.canView) primary.push({ key: TOC_MENU_COMMANDS.VIEW, label: '查看图层' });
        if (capabilities.canSolo)
            primary.push({ key: TOC_MENU_COMMANDS.SOLO, label: '仅显示此图层' });
        if (primary.length) groups.push(primary);

        const edit = [];
        if (capabilities.canEdit)
            edit.push({ key: TOC_MENU_COMMANDS.EDIT, label: '编辑要素' });
        edit.push({ key: TOC_MENU_COMMANDS.RENAME, label: '重命名' });
        if (capabilities.canOpenAttributeTable)
            edit.push({ key: TOC_MENU_COMMANDS.ATTRIBUTE, label: '打开属性表' });
        if (capabilities.canStyle) edit.push({ key: TOC_MENU_COMMANDS.STYLE, label: '样式设置' });
        if (capabilities.canOpenAoiPanel)
            edit.push({ key: TOC_MENU_COMMANDS.OPEN_AOI_PANEL, label: '打开 AOI 面板' });
        if (capabilities.canToggleLabel) {
            edit.push({
                key: TOC_MENU_COMMANDS.LABEL,
                label: capabilities.isLabelVisible ? '关闭标注' : '开启标注',
            });
        }
        if (capabilities.canCopyCoordinates)
            edit.push({ key: TOC_MENU_COMMANDS.COPY, label: '复制坐标' });
        edit.push({ key: TOC_MENU_COMMANDS.OPACITY, label: '透明度', opacity: capabilities.currentOpacity ?? 1 });
        edit.push({ key: TOC_MENU_COMMANDS.PROPERTIES, label: '图层属性' });

        if (capabilities.canToggleLayerCRS) {
            edit.push({ divider: true, key: 'divider_crs' });
            edit.push({ key: TOC_MENU_COMMANDS.CONVERT_WGS84_TO_GCJ02, label: 'WGS-84 =>GCJ-02' });
            edit.push({ key: TOC_MENU_COMMANDS.CONVERT_GCJ02_TO_WGS84, label: 'GCJ-02 =>WGS-84' });
        }

        if (capabilities.canExportData) {
            edit.push({ divider: true, key: 'divider_export' });
            if (capabilities.canExportCSV)
                edit.push({ key: TOC_MENU_COMMANDS.EXPORT_CSV, label: '导出坐标(CSV)' });
            if (capabilities.canExportTXT)
                edit.push({ key: TOC_MENU_COMMANDS.EXPORT_TXT, label: '导出坐标(TXT)' });
            if (capabilities.canExportGeoJSON)
                edit.push({ key: TOC_MENU_COMMANDS.EXPORT_GEOJSON, label: '导出坐标(GeoJSON)' });
            if (capabilities.canExportKML) {
                edit.push({ key: TOC_MENU_COMMANDS.EXPORT_KML, label: '导出为 KML' });
            }
        }
        if (edit.length) groups.push(edit);

        const ops = [];
        if (capabilities.canZoom) ops.push({ key: TOC_MENU_COMMANDS.ZOOM, label: '缩放至图层' });
        if (capabilities.canRemove)
            ops.push({
                key: TOC_MENU_COMMANDS.REMOVE,
                label: capabilities.removeLabel || '移除图层',
                danger: true,
            });
        if (ops.length) groups.push(ops);

        // 三维数据专属（cesium:* 节点）：高程滑杆/材质切换/重定位/拉伸
        // 高程滑杆复用菜单内嵌滑杆模式（同透明度），min/max 来自节点 heightRange
        const threeD = [];
        if (capabilities.canSetHeight) {
            threeD.push({
                key: TOC_MENU_COMMANDS.SET_HEIGHT,
                label: '调整高程',
                slider: capabilities.heightRange,
                value: capabilities.currentHeight ?? 0,
            });
        }
        if (capabilities.canSetMaterial) {
            threeD.push({
                key: TOC_MENU_COMMANDS.MATERIAL,
                label: '材质模式',
                choices: [
                    { value: 'pureWhite', label: '纯白' },
                    { value: 'baimo', label: '白膜' },
                    { value: 'heightStyle', label: '高度着色' },
                    { value: 'gradient', label: '渐变' },
                    { value: 'none', label: '原始' },
                ],
                value: capabilities.materialMode || 'baimo',
            });
        }
        if (capabilities.canReposition)
            threeD.push({ key: TOC_MENU_COMMANDS.REPOSITION, label: '调整位置' });
        if (capabilities.canStretchHeight)
            threeD.push({ key: TOC_MENU_COMMANDS.STRETCH_HEIGHT, label: '拉伸至高程' });
        if (threeD.length) groups.push(threeD);

        return flattenMenuGroups(groups);
    }

    if (nodeType === 'folder') {
        const totalCount = Number(folderSelectionState.totalCount) || 0;
        const folderNodeId = String(node?.id || '').trim();
        if (totalCount <= 0 && !capabilities.canRemove) return [];

        const selection = [];
        if (totalCount > 0) {
            if (folderSelectionState.isAllSelected) {
                selection.push({
                    key: TOC_MENU_COMMANDS.FOLDER_MULTI_SELECT_REMOVE,
                    label: `取消勾选文件夹 (${totalCount})`,
                });
            } else {
                selection.push({
                    key: TOC_MENU_COMMANDS.FOLDER_MULTI_SELECT_ADD,
                    label: `勾选文件夹（递归）(${totalCount})`,
                });
            }

            if (selectedLayerIds.length > 0) {
                selection.push({
                    key: TOC_MENU_COMMANDS.MULTI_SELECT_CLEAR,
                    label: `清空多选 (${selectedLayerIds.length})`,
                });
            }
        }
        if (selection.length) groups.push(selection);

        // 文件夹级移除（如在线服务节点）：由 node.actions.remove 显式声明，
        // 普通分组文件夹（folder-draw 等，无 actions）不受影响
        if (capabilities.canZoom) {
            groups.push([
                { key: TOC_MENU_COMMANDS.ZOOM, label: '缩放至图层' },
            ]);
        }
        if (capabilities.canRemove) {
            // 在线服务文件夹本身可移除（注销该服务）；普通分组文件夹无此语义，
            // 仅提供「清空图层」批量项（由 TOCPanel 清空分支逐叶子走移除链路）
            if (folderNodeId.startsWith(RSVC_NODE_PREFIX)) {
                groups.push([
                    {
                        key: TOC_MENU_COMMANDS.REMOVE,
                        label: capabilities.removeLabel || '移除图层',
                        danger: true,
                    },
                ]);
            }
            if (totalCount > 0) {
                groups.push([
                    {
                        key: TOC_MENU_COMMANDS.FOLDER_CLEAR_LAYERS,
                        label: `清空图层 (${totalCount})`,
                        danger: true,
                    },
                ]);
            }
        }

        return flattenMenuGroups(groups);
    }

    return [];
}
