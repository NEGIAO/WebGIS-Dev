/**
 * czmlLoader.js
 * CZML 格式加载器
 */

import { createBlobUrl, revokeBlobUrl, flyToEntity } from './utils.js';
import { clampDataSourceToGround } from '../../terrain/terrainClampService.js';

/**
 * 加载 CZML 文件到 Cesium
 *
 * @param {Object} ctx
 * @param {File} ctx.file
 * @param {Function} ctx.getCesium
 * @param {Function} ctx.getViewer
 * @param {Object} ctx.message
 * @param {import('vue').Ref} ctx.loadedDataSources
 * @param {{ current: number }} ctx.nextId
 */
export async function loadCZML({ file, getCesium, getViewer, message, loadedDataSources, nextId }) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const blobUrl = createBlobUrl(file);
    try {
        const dataSource = await Cesium.CzmlDataSource.load(blobUrl);

        const id = `czml_${++nextId.current}`;
        dataSource.name = file.name;

        await viewer.dataSources.add(dataSource);
        // 统一贴地（地形开启时生效）：点/线/面实体贴地，时间动态实体（采样轨迹）自动跳过
        const clampResult = clampDataSourceToGround(viewer, Cesium, dataSource);
        if (clampResult.clamped > 0) {
            console.warn(`[贴地] CZML "${file.name}": 地形已开启，${clampResult.clamped}/${clampResult.total} 个实体已贴地`);
        }
        flyToEntity(viewer, Cesium, dataSource, 'czml');

        const record = { id, name: file.name, type: 'czml', entity: dataSource, blobUrl };
        loadedDataSources.value = [...loadedDataSources.value, record];

        message.success(`CZML "${file.name}" 加载成功`);
        return record;
    } catch (error) {
        revokeBlobUrl(blobUrl);
        throw error;
    }
}
