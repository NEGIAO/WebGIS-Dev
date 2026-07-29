/**
 * czmlLoader.js
 * CZML 格式加载器
 */

import { createBlobUrl, revokeBlobUrl, flyToEntity } from './utils.js';

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
