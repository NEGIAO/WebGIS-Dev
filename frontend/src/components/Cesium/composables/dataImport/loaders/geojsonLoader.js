/**
 * geojsonLoader.js
 * GeoJSON/JSON 格式加载器
 */

import { flyToEntity } from './utils.js';

/**
 * 加载 GeoJSON/JSON 文件到 Cesium
 *
 * @param {Object} ctx
 * @param {File} ctx.file
 * @param {Function} ctx.getCesium
 * @param {Function} ctx.getViewer
 * @param {Object} ctx.message
 * @param {import('vue').Ref} ctx.loadedDataSources
 * @param {{ current: number }} ctx.nextId
 * @returns {Promise<{id: string, name: string, type: string, entity: Cesium.GeoJsonDataSource}>}
 */
export async function loadGeoJSON({ file, getCesium, getViewer, message, loadedDataSources, nextId }) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const text = await file.text();
    let geojsonData;
    try {
        geojsonData = JSON.parse(text);
    } catch {
        throw new Error('GeoJSON 文件格式无效，无法解析为 JSON');
    }

    const dataSource = await Cesium.GeoJsonDataSource.load(geojsonData, {
        stroke: Cesium.Color.fromCssColorString('#3ddc84'),
        fill: Cesium.Color.fromCssColorString('#3ddc84').withAlpha(0.3),
        markerColor: Cesium.Color.fromCssColorString('#3ddc84'),
        markerSize: 24,
    });

    const id = `geojson_${++nextId.current}`;
    dataSource.name = file.name;

    await viewer.dataSources.add(dataSource);
    flyToEntity(viewer, Cesium, dataSource, 'geojson');

    const record = { id, name: file.name, type: 'geojson', entity: dataSource };
    loadedDataSources.value = [...loadedDataSources.value, record];

    message.success(`GeoJSON "${file.name}" 加载成功`);
    return record;
}
