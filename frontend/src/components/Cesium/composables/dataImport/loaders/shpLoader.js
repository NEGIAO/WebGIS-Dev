/**
 * shpLoader.js
 * Shapefile 格式加载器
 */

import { ensureGisParsers, getExtension, flyToEntity } from './utils.js';

/**
 * 加载 Shapefile 到 Cesium
 *
 * @param {Object} ctx
 * @param {File} ctx.file - .shp 主文件
 * @param {File[]} [ctx.sidecarFiles] - 配套的 .dbf/.shx/.prj/.cpg 文件
 * @param {Function} ctx.getCesium
 * @param {Function} ctx.getViewer
 * @param {Object} ctx.message
 * @param {import('vue').Ref} ctx.loadedDataSources
 * @param {{ current: number }} ctx.nextId
 */
export async function loadSHP({ file, sidecarFiles = [], getCesium, getViewer, message, loadedDataSources, nextId }) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const { parseShpPartsToGeoJSON } = await ensureGisParsers();

    const parts = { shp: await file.arrayBuffer() };

    for (const sidecar of sidecarFiles) {
        const ext = getExtension(sidecar.name);
        if (ext === 'dbf') parts.dbf = await sidecar.arrayBuffer();
        if (ext === 'shx') parts.shx = await sidecar.arrayBuffer();
        if (ext === 'prj') parts.prj = await sidecar.arrayBuffer();
        if (ext === 'cpg') parts.cpg = await sidecar.arrayBuffer();
    }

    const geojson = await parseShpPartsToGeoJSON(parts);

    const featureCollections = Array.isArray(geojson) ? geojson : [geojson];
    const totalFeatureCount = featureCollections.reduce(
        (sum, fc) => sum + (fc?.features?.length || 0),
        0,
    );

    const payload = featureCollections.length === 1 ? featureCollections[0] : {
        type: 'FeatureCollection',
        features: featureCollections.flatMap((fc) => fc?.features || []),
    };

    const dataSource = await Cesium.GeoJsonDataSource.load(payload, {
        stroke: Cesium.Color.fromCssColorString('#ffcc00'),
        fill: Cesium.Color.fromCssColorString('#ffcc00').withAlpha(0.25),
        markerColor: Cesium.Color.fromCssColorString('#ffcc00'),
        markerSize: 20,
    });

    const id = `shp_${++nextId.current}`;
    dataSource.name = file.name;

    await viewer.dataSources.add(dataSource);
    flyToEntity(viewer, Cesium, dataSource, 'shp');

    const record = { id, name: file.name, type: 'shp', entity: dataSource };
    loadedDataSources.value = [...loadedDataSources.value, record];

    message.success(`Shapefile "${file.name}" 加载成功 (${totalFeatureCount} 个要素)`);

    return record;
}
