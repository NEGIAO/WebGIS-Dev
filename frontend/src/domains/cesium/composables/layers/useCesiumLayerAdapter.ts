/**
 * 功能名称：Cesium 场景适配器、三维属性表与数据源管理 Composable
 * 说    明：统一承载 cesiumLayersStore.registerAdapter 场景句柄回调、loadedDataSources 差量同步、
 *           三维属性表数据集生命周期管理（build/open/drop/focusAttributeFeature）、坐标系重设与 Action Router。
 */
import { ref, toRaw, watch } from 'vue';
import { translate as t } from '@common/app/useLocale';
import { registerEngineHandlers, unregisterEngineHandlers } from '@common/layer-tree/actions/unifiedActionRouter';
import { useAttrStore } from '@common/attribute/stores/useAttrStore';
import { createCesiumCrsRedeclareFeature } from '../dataImport/useCesiumCrsRedeclare';
import {
    applyVectorDataSourceStyle,
    setRecordOpacity,
    setRecordVisible,
    setVectorLabelVisible,
} from '../dataImport/dataSourceDisplay';
import {
    fitGroundPlacement,
    resetGroundPlacement,
    setGroundOffset,
} from '../terrain/groundPlacementService';
import { collectEntityShapes, serializeShapes } from '../../utils/cesiumLayerSerialization';
import { copyTextToClipboard, downloadTextFile, sanitizeFileName } from '../../utils/browserIo';
import {
    buildCesiumAttrDataset,
    CESIUM_ATTR_DATASET_PREFIX,
} from '../../layers/toc-adapters/cesiumAttrDataset';

export const PLANAR_SOURCE_ID = 'planar_route_working';
export const ROUTE_FLY_SOURCE_ID = 'route_fly_working';

export interface UseCesiumLayerAdapterDeps {
    getCesium: () => any;
    getViewer: () => any;
    message: any;
    dataImport: any;
    cesiumLayersStore: any;
    drawMeasureFeature: any;
    routeFeature: any;
    zoomToRemoteService: (serviceId: string) => any;
    getRsvcHandlers: () => {
        setMaterial?: (payload: any) => void;
        reposition?: (payload: any) => void;
        stretchHeight?: (payload: any) => void;
    };
    getDetachCallbacks: () => {
        detachPlanarWorkingSet?: () => void;
        detachRouteFlyWorkingSet?: () => void;
    };
}

export function useCesiumLayerAdapter(deps: UseCesiumLayerAdapterDeps) {
    const {
        getCesium,
        getViewer,
        message,
        dataImport,
        cesiumLayersStore,
        drawMeasureFeature,
        routeFeature,
        zoomToRemoteService,
        getRsvcHandlers,
        getDetachCallbacks,
    } = deps;

    const attrStore = useAttrStore();
    const attrTableRecordId = ref('');
    const openedAttrDatasetIds = new Set<string>();

    /** 剥离 TOC 节点 id 的 cesium: 前缀（无前缀原样返回） */
    function stripCesiumPrefix(layerId: string): string {
        const raw = String(layerId || '');
        return raw.startsWith('cesium:') ? raw.slice(7) : raw;
    }

    /** 按 id 查 loadedDataSources 句柄记录 */
    function findImportRecord(id: string): any {
        return (dataImport.loadedDataSources.value || []).find((item: any) => item.id === id) || null;
    }

    const { redeclareLayerCrs: redeclareCrsCore } = createCesiumCrsRedeclareFeature({
        getCesium,
        getViewer,
        message,
        loadedDataSources: dataImport.loadedDataSources,
        nextId: dataImport.nextId,
    });

    /**
     * TOC / 属性弹窗入口：按新源坐标系重建三维图层并恢复原显隐与透明度
     */
    async function redeclareLayerCrs({
        layerId,
        crs,
    }: { layerId?: string; crs?: string } = {}): Promise<boolean> {
        const id = stripCesiumPrefix(layerId || '');
        const before = (cesiumLayersStore.records || []).find((item: any) => item.id === id);
        const ok = await redeclareCrsCore({ layerId: id, crs });
        if (!ok || !before) return ok;
        cesiumLayersStore.setVisible(id, before.visible !== false);
        cesiumLayersStore.setOpacity(id, Number.isFinite(before.opacity) ? before.opacity : 1);
        return ok;
    }

    function collectLayerShapes(id: string) {
        if (drawMeasureFeature.isManaged(id)) return drawMeasureFeature.getShapesById(id);
        if (routeFeature.isManaged(id)) return routeFeature.getShapesById?.(id) || [];
        const record = findImportRecord(id);
        const entities = toRaw(record?.entity)?.entities?.values;
        return Array.isArray(entities) ? collectEntityShapes(getCesium(), entities) : [];
    }

    function dropAttrDataset(layerId: string): void {
        const key = `${CESIUM_ATTR_DATASET_PREFIX}${String(layerId || '').trim()}`;
        if (!openedAttrDatasetIds.has(key)) return;
        openedAttrDatasetIds.delete(key);
        attrStore.dropExternalDataset(key);
    }

    function showAttributeTable(id: string): boolean {
        const record = findImportRecord(id);
        const entities = toRaw(record?.entity)?.entities?.values;
        if (!record || !Array.isArray(entities) || !entities.length) {
            message.warning(t('cesium.attributeTable.empty'));
            return false;
        }
        const { dataset, truncated, rowCount } = buildCesiumAttrDataset({
            Cesium: getCesium(),
            entities,
            layerId: id,
            layerName: record.name,
        });
        if (!dataset || !rowCount) {
            message.warning(t('cesium.attributeTable.empty'));
            return false;
        }
        attrStore.setExternalDataset(dataset as any);
        attrStore.openTable(dataset.id, dataset.layerName);
        openedAttrDatasetIds.add(dataset.id);
        attrTableRecordId.value = id;
        if (truncated) message.info(t('cesium.attributeTable.truncated'));
        return true;
    }

    function focusAttributeFeature(entityId: string): void {
        const record = findImportRecord(attrTableRecordId.value);
        const entity = toRaw(record?.entity)?.entities?.getById?.(String(entityId || ''));
        if (!entity) return;
        getViewer()?.flyTo(entity, { duration: 0.8 });
    }

    // 统一 Action Router：注册 Cesium 引擎处理器
    registerEngineHandlers('cesium', {
        setUserLayerVisibility: ({ layerId, visible }: { layerId: string; visible: boolean }) => {
            cesiumLayersStore.setVisible(stripCesiumPrefix(layerId), !!visible);
        },
        setUserLayerOpacity: ({ layerId, opacity }: { layerId: string; opacity: number }) => {
            cesiumLayersStore.setOpacity(stripCesiumPrefix(layerId), Number(opacity));
        },
        removeUserLayer: ({ layerId }: { layerId: string }) => {
            cesiumLayersStore.remove(stripCesiumPrefix(layerId));
        },
        zoomToUserLayer: ({ layerId }: { layerId: string }) => {
            cesiumLayersStore.flyTo(stripCesiumPrefix(layerId));
        },
        zoomToRemoteService: ({ serviceId }: { serviceId: string }) =>
            zoomToRemoteService(serviceId),
        redeclareLayerCrs: ({ layerId, crs }: { layerId: string; crs: string }) =>
            redeclareLayerCrs({ layerId, crs }),
    });

    // 导入列表 → 元数据店差量同步
    watch(
        () => dataImport.loadedDataSources.value,
        (list: any[]) => {
            cesiumLayersStore.syncFromImport(
                (list || []).map((item) => {
                    const base: Record<string, any> = {
                        id: item.id,
                        name: item.name,
                        type: item.type,
                    };
                    const entityValues = toRaw(item.entity)?.entities?.values;
                    if (Array.isArray(entityValues)) base.featureCount = entityValues.length;
                    if (item.type === '3dtiles') {
                        const rawInitial = Number.isFinite(item.currentBaseHeight)
                            ? item.currentBaseHeight
                            : Number(item.tilesetGeo?.initialBaseHeight ?? item.tilesetGeo?.bottomH);
                        const center = Number.isFinite(rawInitial) ? rawInitial : 0;
                        base.baseHeight = center;
                        base.heightRange = {
                            min: Math.max(Math.floor(center - 100), -10),
                            max: Math.max(Math.ceil(center + 100), Math.floor(center - 100) + 1),
                        };
                        base.materialMode = String(item.materialMode || 'baimo');
                    } else if (item.type === 'gltf') {
                        base.baseHeight = Number(item.modelHeightOffset) || 0;
                    }
                    return base;
                }),
            );

            const aliveIds = new Set((list || []).map((item) => String(item.id)));
            [...openedAttrDatasetIds].forEach((key) => {
                const layerId = key.slice(CESIUM_ATTR_DATASET_PREFIX.length);
                if (!aliveIds.has(layerId)) dropAttrDataset(layerId);
            });
        },
        { immediate: true, deep: false },
    );

    // 注册场景操作 adapter
    cesiumLayersStore.registerAdapter({
        setVisible(id: string, visible: boolean) {
            if (drawMeasureFeature.isManaged(id)) {
                drawMeasureFeature.setVisible(id, visible);
                return;
            }
            if (routeFeature.isManaged(id)) {
                routeFeature.setVisible(id, visible);
                return;
            }
            const record = findImportRecord(id);
            if (!record) {
                console.warn('[CesiumContainer] setVisible 找不到句柄记录', { id, visible });
                return;
            }
            setRecordVisible(getCesium(), record, visible);
            getViewer()?.scene?.requestRender?.();
        },
        setOpacity(id: string, opacity: number) {
            if (drawMeasureFeature.isManaged(id)) {
                drawMeasureFeature.setOpacity(id, opacity);
                return;
            }
            if (routeFeature.isManaged(id)) {
                routeFeature.setOpacity(id, opacity);
                return;
            }
            const record = findImportRecord(id);
            if (!record) {
                console.warn('[CesiumContainer] setOpacity 找不到句柄记录', { id, opacity });
                return;
            }
            const Cesium = getCesium();
            if (!Cesium) {
                console.warn('[CesiumContainer] setOpacity 场景未就绪（Cesium 命名空间缺失）', {
                    id,
                    opacity,
                });
                return;
            }
            setRecordOpacity(Cesium, record, opacity, () => {
                getViewer()?.scene?.requestRender?.();
            });
            getViewer()?.scene?.requestRender?.();
        },
        flyTo(id: string) {
            if (drawMeasureFeature.isManaged(id)) {
                drawMeasureFeature.flyTo(id);
                return;
            }
            if (routeFeature.isManaged(id)) {
                routeFeature.flyTo(id);
                return;
            }
            dataImport.flyToDataSource(id);
        },
        remove(id: string) {
            dropAttrDataset(id);
            if (drawMeasureFeature.isManaged(id)) {
                drawMeasureFeature.removeHandle(id);
                return;
            }
            if (routeFeature.isManaged(id)) {
                routeFeature.removeHandle(id);
                return;
            }
            const { detachPlanarWorkingSet, detachRouteFlyWorkingSet } = getDetachCallbacks();
            if (id === PLANAR_SOURCE_ID) {
                detachPlanarWorkingSet?.();
            } else if (id === ROUTE_FLY_SOURCE_ID) {
                detachRouteFlyWorkingSet?.();
            }
            dataImport.removeDataSource(id);
        },
        setBaseHeight(id: string, height: number) {
            const record = findImportRecord(id);
            if (!record) {
                console.warn(
                    '[CesiumContainer] setBaseHeight 找不到句柄记录（loadedDataSources 中无此 id）',
                    { id, height },
                );
                return;
            }
            const result = setGroundOffset(
                { record, viewer: getViewer(), Cesium: getCesium(), dataImport },
                Number(height) || 0,
            );
            if (!result.ok) message.warning(t('cesium.terrainOffsetUnsupported'));
            getViewer()?.scene?.requestRender?.();
        },
        async fitToTerrain(id: string) {
            const record = findImportRecord(id);
            const Cesium = getCesium();
            if (!record || !Cesium) return { ok: false, reason: 'no-handle' };
            const result = await fitGroundPlacement({
                record,
                viewer: getViewer(),
                Cesium,
                dataImport,
            });
            if (result.ok) {
                message.success(t('cesium.terrainFitDone', { name: record.name }));
            } else if (result.reason === 'terrain-off') {
                message.warning(t('cesium.terrainFitNeedTerrain'));
            } else if (result.reason === 'unsupported') {
                message.info(t('cesium.terrainFitUnsupported'));
            } else {
                message.warning(t('cesium.terrainFitFailed'));
            }
            getViewer()?.scene?.requestRender?.();
            return result;
        },
        async fitToTerrainInView(id: string) {
            const record = findImportRecord(id);
            const Cesium = getCesium();
            const viewer = getViewer();
            if (!record || !Cesium || !viewer) return { ok: false, reason: 'no-handle' };

            const rect = viewer.camera?.computeViewRectangle?.(viewer.scene.globe.ellipsoid);
            if (!rect) {
                message.warning(t('cesium.terrainFitUnsupported'));
                return { ok: false, reason: 'no-region' };
            }
            const region = {
                west: Cesium.Math.toDegrees(rect.west),
                south: Cesium.Math.toDegrees(rect.south),
                east: Cesium.Math.toDegrees(rect.east),
                north: Cesium.Math.toDegrees(rect.north),
            };
            const result = await fitGroundPlacement({
                record,
                viewer,
                Cesium,
                dataImport,
                region,
            });
            if (result.ok) {
                message.success(t('cesium.terrainFitDone', { name: record.name }));
            } else if (result.reason === 'terrain-off') {
                message.warning(t('cesium.terrainFitNeedTerrain'));
            } else {
                message.warning(t('cesium.terrainFitFailed'));
            }
            viewer.scene?.requestRender?.();
            return result;
        },
        resetTerrainFit(id: string) {
            const record = findImportRecord(id);
            const Cesium = getCesium();
            if (!record || !Cesium) return { ok: false, reason: 'no-handle' };
            const result = resetGroundPlacement({
                record,
                viewer: getViewer(),
                Cesium,
                dataImport,
            });
            if (result.ok) message.success(t('cesium.terrainResetDone', { name: record.name }));
            else message.warning(t('cesium.terrainResetFailed'));
            return result;
        },
        setMaterialMode(id: string, mode: string) {
            getRsvcHandlers().setMaterial?.({ id, mode });
        },
        reposition(id: string) {
            getRsvcHandlers().reposition?.({ id });
        },
        stretchToHeight(id: string) {
            getRsvcHandlers().stretchHeight?.({ id });
        },
        setStyle(id: string, patch: any) {
            if (drawMeasureFeature.isManaged(id)) {
                const ok = drawMeasureFeature.updateStyleById(id, patch);
                getViewer()?.scene?.requestRender?.();
                if (!ok) message.warning(t('cesium.drawMeasure.toast.failed'));
                return;
            }
            const Cesium = getCesium();
            const record = findImportRecord(id);
            if (!Cesium || !record) {
                console.warn('[CesiumContainer] setStyle 找不到可着色句柄', { id });
                return;
            }
            const applied = applyVectorDataSourceStyle(Cesium, toRaw(record.entity), patch, () => {
                getViewer()?.scene?.requestRender?.();
            });
            if (!applied) message.info(t('cesium.styleNotApplicable'));
        },
        setLabelVisible(id: string, visible: boolean) {
            if (drawMeasureFeature.isManaged(id)) {
                const ok = drawMeasureFeature.setLabelVisible(id, visible);
                if (!ok) message.info(t('cesium.noLabelToToggle'));
                getViewer()?.scene?.requestRender?.();
                return;
            }
            const record = findImportRecord(id);
            const applied = setVectorLabelVisible(toRaw(record?.entity), visible);
            if (!applied) message.info(t('cesium.noLabelToToggle'));
            getViewer()?.scene?.requestRender?.();
        },
        openAttributeTable(id: string) {
            return showAttributeTable(id);
        },
        editFeature(id: string) {
            if (!drawMeasureFeature.isManaged(id)) {
                message.info(t('cesium.editReadOnly'));
                return false;
            }
            if (drawMeasureFeature.isEditing(id)) {
                drawMeasureFeature.stopVertexEdit();
                message.info(t('cesium.editStopped'));
                return true;
            }
            const started = drawMeasureFeature.startVertexEdit(id);
            if (started) message.info(t('cesium.editStarted'));
            else message.warning(t('cesium.editUnsupported'));
            return started;
        },
        copyCoordinates(id: string) {
            const shapes = collectLayerShapes(id);
            if (!shapes.length) {
                message.warning(t('cesium.noCoordinates'));
                return false;
            }
            const text = shapes
                .map((shape: any) =>
                    shape.lonLats
                        .map(([lon, lat]: [number, number]) => `${lon.toFixed(6)},${lat.toFixed(6)}`)
                        .join('\n'),
                )
                .join('\n\n');
            void copyTextToClipboard(text).then((ok) => {
                if (ok) message.success(t('cesium.coordinatesCopied', { count: shapes.length }));
                else message.warning(t('cesium.copyCoordinatesFailed'));
            });
            return true;
        },
        exportData(id: string, format: string) {
            const shapes = collectLayerShapes(id);
            const record = cesiumLayersStore.getRecord(id);
            const serialized = serializeShapes(shapes, format, { id, name: record?.name });
            if (!serialized) {
                message.warning(t('cesium.noCoordinates'));
                return false;
            }
            const baseName = sanitizeFileName(record?.name || id, 'cesium-layer');
            downloadTextFile(
                serialized.text,
                `${baseName}.${serialized.extension}`,
                serialized.mime,
            );
            message.success(t('cesium.exported', { name: `${baseName}.${serialized.extension}` }));
            return true;
        },
    });

    function cleanupAdapter(): void {
        unregisterEngineHandlers('cesium');
        try {
            cesiumLayersStore.unregisterAdapter();
        } catch {
            /* ignore */
        }
        [...openedAttrDatasetIds].forEach((key) => {
            openedAttrDatasetIds.delete(key);
            try {
                attrStore.dropExternalDataset(key);
            } catch {
                /* ignore */
            }
        });
    }

    return {
        redeclareLayerCrs,
        focusAttributeFeature,
        cleanupAdapter,
    };
}
