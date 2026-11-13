/**
 * GLTF 坐标弹窗与位置调整（从 useCesiumDataImport 拆出）
 *
 * 只处理「用户输入坐标 → 建模 → 落数据源 / 重定位 → 失败回滚」这一条链路；
 * 状态 ref 由调用方持有并注入，保证弹窗与导出对象仍是同一份状态。
 */

import { toRaw } from 'vue';
import { loadGltfWithCoords } from './loaders/gltfLoader';
import { revokeBlobUrl } from './loaders/utils';

/** 本模块依赖（全部由 useCesiumDataImport 注入，保持闭包同源） */
export interface GltfRepositionDeps {
    getCesium: () => any;
    getViewer: () => any;
    message: any;
    loadedDataSources: { value: any[] };
    nextId: { current: number };
    pendingGltfFile: { value: any };
    repositionTarget: { value: any };
    gltfLoading: { value: boolean };
    gltfLoadError: { value: string };
}

/**
 * 创建 GLTF 坐标/重定位工具集
 * @param deps 依赖注入（见 GltfRepositionDeps）
 * @returns 坐标确认、位置调整相关函数
 */
export function createGltfRepositionTools({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
    pendingGltfFile,
    repositionTarget,
    gltfLoading,
    gltfLoadError,
}: GltfRepositionDeps) {
    /**
     * 使用用户输入的坐标加载 GLTF/GLB 模型
     * 失败时保留 pendingGltfFile 与用户输入：弹窗不关闭，可重试或显式取消
     * @param {{ lng: number, lat: number, height: number }} coords
     */
    async function loadGltfWithUserCoords(coords) {
        const Cesium = getCesium();
        const viewer = getViewer();
        if (!pendingGltfFile.value) throw new Error('没有等待确认的模型文件');

        const { blobUrl, name } = pendingGltfFile.value;
        gltfLoading.value = true;
        gltfLoadError.value = '';

        try {
            const model = await loadGltfWithCoords(Cesium, viewer, blobUrl, name, coords);
            const id = `gltf_${++nextId.current}`;

            // modelHeightOffset 保存用户输入的语义高度：贴地策略据此保持
            // 「相对地形的高度」，避免 applyOnImport 把语义高度抹成 0
            const record = {
                id,
                name,
                type: 'gltf',
                entity: model,
                blobUrl,
                modelHeightOffset: Number(coords?.height) || 0,
            };
            loadedDataSources.value = [...loadedDataSources.value, record];

            message.success(
                `3D 模型 "${name}" 加载成功 (${coords.lng.toFixed(4)}, ${coords.lat.toFixed(4)}, ${coords.height.toFixed(1)}m)`,
            );

            const position = Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, coords.height + 500);
            viewer.camera.flyTo({
                destination: position,
                orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-30), roll: 0 },
                duration: 2,
            });

            pendingGltfFile.value = null;
            return record;
        } catch (error) {
            // 仅记录失败原因，不动 pendingGltfFile：弹窗保持打开、坐标保留可重试
            gltfLoadError.value = error?.message || String(error);
            throw error;
        } finally {
            gltfLoading.value = false;
        }
    }

    function cancelPendingGltf() {
        if (pendingGltfFile.value) {
            gltfLoadError.value = '';
            revokeBlobUrl(pendingGltfFile.value.blobUrl);
            pendingGltfFile.value = null;
        }
    }

    function startGltfReposition(id) {
        const record = loadedDataSources.value.find((ds) => ds.id === id);
        if (!record || record.type !== 'gltf') {
            message.warning('该数据源不支持位置调整');
            return;
        }
        repositionTarget.value = record;
    }

    async function confirmGltfReposition(coords) {
        const record = repositionTarget.value;
        if (!record) return;

        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer) return;

        gltfLoading.value = true;
        gltfLoadError.value = '';

        const oldEntity = toRaw(record.entity);
        const oldHadModel = !!oldEntity?.model;
        // 新模型是否已成功替换（替换成功后失败不再回滚旧实体，防双份挂载）
        let swapped = false;

        try {
            // Entity 模型：从 viewer.entities 移除旧实体后按新坐标重建
            // 远程 GLB 无 blobUrl，用 sourceUrl；本地 File 用 blobUrl
            const uri = record.sourceUrl || record.blobUrl;
            if (!uri) {
                message.error('缺少模型地址，无法重定位');
                return;
            }
            if (oldHadModel) {
                viewer.entities.remove(oldEntity);
            } else {
                viewer.scene.primitives.remove(oldEntity);
            }
            const model = await loadGltfWithCoords(
                Cesium,
                viewer,
                uri,
                record.name,
                coords,
            );
            swapped = true;
            record.entity = model;
            record.position = { ...coords };

            const position = Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, coords.height + 500);
            viewer.camera.flyTo({
                destination: position,
                orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-30), roll: 0 },
                duration: 1.5,
            });

            message.success(`模型已移动到 (${coords.lng.toFixed(4)}, ${coords.lat.toFixed(4)}, ${coords.height.toFixed(1)}m)`);
            try { viewer.scene.requestRender?.(); } catch { /* ignore */ }
            repositionTarget.value = null;
        } catch (error) {
            // 失败时保留 repositionTarget：弹窗不自动关闭；若新模型尚未成功替换，
            // 把已移除的旧实体/图元挂回场景，用户可修正坐标重试或显式取消
            if (!swapped && oldEntity) {
                try {
                    if (oldHadModel) {
                        viewer.entities.add(oldEntity);
                    } else {
                        viewer.scene.primitives.add(oldEntity);
                    }
                } catch { /* ignore */ }
            }
            gltfLoadError.value = error?.message || String(error);
            message.error(`位置调整失败: ${error.message || error}（弹窗保留，可重试或取消）`);
        } finally {
            gltfLoading.value = false;
        }
    }

    function cancelGltfReposition() {
        repositionTarget.value = null;
    }
    return {
        loadGltfWithUserCoords,
        cancelPendingGltf,
        startGltfReposition,
        confirmGltfReposition,
        cancelGltfReposition,
    };
}
