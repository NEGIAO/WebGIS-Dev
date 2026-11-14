/**
 * 数据源生命周期（从 useCesiumDataImport 拆出）
 *
 * 移除 / 清空两个操作共用「对象级宿主探测优先、type 分支兜底」的卸载策略；
 * 单独成模块后，卸载逻辑只有一处，避免两条链路再次漂移。
 */

import { toRaw } from 'vue';
import { revokeBlobUrl, detachEntityFromScene } from './loaders/utils';

export interface DataSourceLifecycleDeps {
    getCesium: () => any;
    getViewer: () => any;
    loadedDataSources: { value: any[] };
    rasterCache: Map<string, any>;
    /** 清空时回收待确认的 GLTF 临时文件 */
    cancelPendingGltf: () => void;
    message: any;
}

/**
 * 创建数据源生命周期操作
 * @param deps 依赖注入（见 DataSourceLifecycleDeps）
 * @returns removeDataSource / clearAllDataSources
 */
export function createDataSourceLifecycle({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    rasterCache,
    cancelPendingGltf,
}: DataSourceLifecycleDeps) {
    function removeDataSource(id: any) {
        const record = loadedDataSources.value.find((ds) => ds.id === id);
        if (!record) return;

        const viewer = getViewer();
        const Cesium = getCesium();
        if (!viewer || !Cesium) return;

        try {
            const entity = toRaw(record.entity);
            const type = record.type;

            // ── 对象级宿主探测优先（V3.5.32 不同步修复）──
            // 以句柄的真实容器挂载关系分派卸载，消除注册方 type 错配
            // （如影像/地形被记成 '3dtiles'）造成的 primitives.remove 静默 no-op。
            // 未命中任何容器时才回退到按 type 的兼容分支（100% 向后兼容）。
            const detached = detachEntityFromScene({ viewer, Cesium, entity, type });

            if (!detached) {
                if (type === '3dtiles') {
                    viewer.scene.primitives.remove(entity);
                } else if (type === 'gltf') {
                    // Entity 模型：从 viewer.entities 移除（兼容历史 primitive 记录）
                    if (entity?.model) {
                        viewer.entities.remove(entity);
                    } else {
                        viewer.scene.primitives.remove(entity);
                    }
                } else if (type === 'tif') {
                    if (entity instanceof Cesium.ImageryLayer) {
                        viewer.imageryLayers.remove(entity);
                    } else {
                        viewer.scene.primitives.remove(entity);
                    }
                } else {
                    viewer.dataSources.remove(entity, true);
                }
                console.warn('[CesiumDataImport] 数据源句柄未命中场景宿主容器，已回退 type 分支处理', { id, type });
            }
        } catch (e) {
            console.warn('[CesiumDataImport] 移除数据源失败:', e);
        }

        if (record.blobUrl) revokeBlobUrl(record.blobUrl);
        if (record.blobUrls && Array.isArray(record.blobUrls)) {
            for (const url of record.blobUrls) revokeBlobUrl(url);
        }

        const rasterEntry = rasterCache.get(id);
        if (rasterEntry?.heightMesh) {
            try { viewer.scene.primitives.remove(rasterEntry.heightMesh); } catch { /* ignore */ }
        }
        rasterCache.delete(id);

        loadedDataSources.value = loadedDataSources.value.filter((ds) => ds.id !== id);
        message.info(`已移除 "${record.name}"`);
    }

    function clearAllDataSources() {
        const viewer = getViewer();
        if (!viewer) {
            loadedDataSources.value = [];
            return;
        }

        const Cesium = getCesium();

        for (const record of loadedDataSources.value) {
            try {
                const entity = toRaw(record.entity);
                const type = record.type;

                // ── 对象级宿主探测优先（与 removeDataSource 同构）：──
                // 防注册方 type 错配时的 primitives.remove(ImageryLayer/TerrainProvider)
                // 静默 no-op 造成清空后场景残留
                const detached = detachEntityFromScene({ viewer, Cesium, entity, type });

                if (!detached) {
                    if (type === '3dtiles') {
                        viewer.scene.primitives.remove(entity);
                    } else if (type === 'gltf') {
                        // Entity 模型：从 viewer.entities 移除（兼容历史 primitive 记录），
                        // 与 removeDataSource 同构——primitives.remove 对 Entity 是静默 no-op
                        if (entity?.model) {
                            viewer.entities.remove(entity);
                        } else {
                            viewer.scene.primitives.remove(entity);
                        }
                    } else if (type === 'tif') {
                        if (Cesium && entity instanceof Cesium.ImageryLayer) {
                            viewer.imageryLayers.remove(entity);
                        } else {
                            viewer.scene.primitives.remove(entity);
                        }
                    } else {
                        viewer.dataSources.remove(entity, true);
                    }
                    console.warn('[CesiumDataImport] 数据源句柄未命中场景宿主容器，已回退 type 分支处理', { id: record.id, type });
                }
            } catch (e) {
                console.warn('[CesiumDataImport] 清除数据源失败:', e);
            }

            if (record.blobUrl) revokeBlobUrl(record.blobUrl);
            if (record.blobUrls && Array.isArray(record.blobUrls)) {
                for (const url of record.blobUrls) revokeBlobUrl(url);
            }
        }

        for (const [, entry] of rasterCache) {
            if (entry.heightMesh) {
                try { viewer.scene.primitives.remove(entry.heightMesh); } catch { /* ignore */ }
            }
        }
        rasterCache.clear();

        // 兜底：清空 DataSource
        if (Array.isArray(viewer.dataSources?.dataSources)) {
            const dataSourceList = viewer.dataSources.dataSources.slice();
            for (const ds of dataSourceList) {
                if (!ds || ds.isBaseLayerPickerDataSource) continue;
                try { viewer.dataSources.remove(ds, true); } catch (e) {
                    console.warn('[CesiumDataImport] 兜底清理 DataSource 失败:', e);
                }
            }
        }

        // 兜底：清除 scene.primitives 中的 3D Tiles / Model
        const CesiumRuntime = getCesium();
        if (CesiumRuntime && Array.isArray(viewer.scene?.primitives?.primitives)) {
            const primList = viewer.scene.primitives.primitives.slice();
            for (const prim of primList) {
                if (!prim) continue;
                const isOur =
                    prim instanceof CesiumRuntime.Cesium3DTileset ||
                    prim instanceof CesiumRuntime.Model ||
                    (prim.name && /^(geojson_|kml_|kmz_|shp_|czml_|tileset_|gltf_)/.test(String(prim.name || '')));
                if (!isOur) continue;
                try { viewer.scene.primitives.remove(prim); } catch (e) {
                    console.warn('[CesiumDataImport] 兜底清理 Primitive 失败:', e);
                }
            }
        }

        loadedDataSources.value = [];
        cancelPendingGltf();
        try { viewer.scene.requestRender?.(); } catch { /* ignore */ }
        message.info('已清除所有导入数据');
    }
    return { removeDataSource, clearAllDataSources };
}
