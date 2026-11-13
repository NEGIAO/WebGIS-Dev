/**
 * 数据源操作（从 useCesiumDataImport 拆出）
 *
 * 覆盖注册外部数据源 / 远程 GLB / 定位 / 3D Tiles 贴地高度四类轻操作，
 * 只读写 loadedDataSources 与 Cesium 场景，不涉及导入分发。
 */

import { toRaw } from 'vue';
import { flyToEntity } from './loaders/utils';
import { loadGltfFromUrl } from './loaders/gltfLoader';

export interface DataSourceOpsDeps {
    getCesium: () => any;
    getViewer: () => any;
    message: any;
    loadedDataSources: { value: any[] };
    nextId: { current: number };
    /** 复用主入口的 loader 上下文（getCesium/getViewer/message/loadedDataSources/nextId/heightSampler） */
    loaderCtx: () => any;
}

/**
 * 创建数据源操作集合
 * @param deps 依赖注入（见 DataSourceOpsDeps）
 * @returns registerExternalDataSource / loadRemoteGlb / flyToDataSource / setTilesetHeight
 */
export function createDataSourceOps({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
    loaderCtx,
}: DataSourceOpsDeps) {
    function registerExternalDataSource({ name, entity, type: customType, tilesetGeo, currentBaseHeight, terrainElevation, terrainFitSamples, tilesetOverride }) {
        const id = `tileset_${++nextId.current}`;
        const record = {
            id,
            name,
            type: customType || '3dtiles',
            entity,
            materialMode: 'none',
            ...(tilesetOverride ? { tileset: tilesetOverride } : {}),
            ...(tilesetGeo ? { tilesetGeo } : {}),
            ...(currentBaseHeight !== undefined ? { currentBaseHeight } : {}),
            ...(terrainElevation ? { terrainElevation } : {}),
            ...(terrainFitSamples ? { terrainFitSamples } : {}),
        };
        loadedDataSources.value = [...loadedDataSources.value, record];
        return id;
    }

    /**
     * 远程 GLB/GLTF 直链加载（与本地 File 导入同一条数据源注册路径）。
     * @param {string} url - http(s) 直链
     * @param {string} [name] - 显示名
     */
    async function loadRemoteGlb(url, name) {
        return await loadGltfFromUrl({ url, name, ...loaderCtx() });
    }

    function flyToDataSource(id) {
        const viewer = getViewer();
        const Cesium = getCesium();
        if (!viewer || !Cesium) return;

        const record = loadedDataSources.value.find((ds) => ds.id === id);
        if (!record || !record.entity) {
            message.warning('未找到对应的数据源');
            return;
        }

        flyToEntity(viewer, Cesium, toRaw(record.entity), record.type);
        message.info(`已定位到 "${record.name}"`);
    }

    /**
     * 手动设置 3D Tiles 的贴地高度（垂直平移滑杆）
     * 将 tileset 底部放置到指定海拔高度
     * @param {string} id - 数据源 ID
     * @param {number} targetBaseHeight - 目标底部海拔（米）
     */
    function setTilesetHeight(id, targetBaseHeight) {
        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer) return;

        const record = loadedDataSources.value.find((ds) => ds.id === id);
        if (!record || record.type !== '3dtiles') {
            console.warn('[贴地] setTilesetHeight: 未找到 tileset 记录, id=', id);
            return;
        }

        const { tilesetGeo } = record;
        if (!tilesetGeo) {
            console.warn('[贴地] setTilesetHeight: 记录缺少 tilesetGeo');
            return;
        }

        const targetHeight = Number(targetBaseHeight);
        if (!Number.isFinite(targetHeight)) {
            console.warn('[贴地] setTilesetHeight: 高度值无效, height=', targetBaseHeight);
            return;
        }

        const { initialBaseHeight = tilesetGeo.bottomH } = tilesetGeo;
        const offset = targetHeight - initialBaseHeight;

        // I3S 等复合 primitive：优先使用内部 tileset 引用（entity 本身无 modelMatrix）
        const tileset = toRaw(record.tileset || record.entity);

        // 垂直平移向量：取模型中心点径向方向（地心→模型中心），乘以偏移量。
        // 不能用 fromRadians 两点相减——绕经纬度转换有精度损失，且对 Ion 等
        // 非标准投影数据方向不准；直接用模型中心点坐标归一化才是真·垂直方向。
        const modelCenter = tileset.boundingSphere.center;
        const up = Cesium.Cartesian3.normalize(modelCenter, new Cesium.Cartesian3());
        const translation = Cesium.Cartesian3.multiplyByScalar(up, offset, new Cesium.Cartesian3());
        const translationMatrix = Cesium.Matrix4.fromTranslation(translation);

        // 首次调整时缓存当前 matrix 作为基准（含加载时的地理参考位姿 + 贴地偏移），
        // 后续调整始终基于该基准复合，避免多次拖动累积偏移。
        // 左乘（世界坐标平移），不能右乘——右乘是在模型局部坐标系中平移，
        // 对 Cesium Ion 等 modelMatrix 含旋转的数据会偏向，导致模型斜移/随镜头漂移。
        if (!tileset._originMatrix) {
            tileset._originMatrix = Cesium.Matrix4.clone(tileset.modelMatrix);
        }
        tileset.modelMatrix = Cesium.Matrix4.multiply(
            translationMatrix,
            tileset._originMatrix,
            new Cesium.Matrix4(),
        );
        record.currentBaseHeight = targetHeight;
        loadedDataSources.value = [...loadedDataSources.value];

        console.warn('[贴地] 手动贴地: 底部高度=', targetHeight.toFixed(1),
            'm, ECEF偏移量级=', Cesium.Cartesian3.magnitude(translation).toFixed(1), 'm');
    }
    return { registerExternalDataSource, loadRemoteGlb, flyToDataSource, setTilesetHeight };
}
