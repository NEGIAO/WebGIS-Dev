/**
 * kmlLoader.js
 * KML/KMZ 格式加载器
 */

import { decodeTextContent } from '../../../../../composables/dataImport/vectorUtils.js';
import { createBlobUrl, revokeBlobUrl, ensureGisParsers, flyToEntity } from './utils.js';

/**
 * 加载 KML 文件到 Cesium
 *
 * @param {Object} ctx
 * @param {File} ctx.file
 * @param {Function} ctx.getCesium
 * @param {Function} ctx.getViewer
 * @param {Object} ctx.message
 * @param {import('vue').Ref} ctx.loadedDataSources
 * @param {{ current: number }} ctx.nextId
 */
export async function loadKML({ file, getCesium, getViewer, message, loadedDataSources, nextId }) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const blobUrl = createBlobUrl(file);
    try {
        const dataSource = await Cesium.KmlDataSource.load(blobUrl, {
            camera: viewer.scene.camera,
            canvas: viewer.scene.canvas,
        });

        const id = `kml_${++nextId.current}`;
        dataSource.name = file.name;

        await viewer.dataSources.add(dataSource);
        flyToEntity(viewer, Cesium, dataSource, 'kml');

        const record = { id, name: file.name, type: 'kml', entity: dataSource, blobUrl };
        loadedDataSources.value = [...loadedDataSources.value, record];

        message.success(`KML "${file.name}" 加载成功`);
        return record;
    } catch (error) {
        revokeBlobUrl(blobUrl);
        throw error;
    }
}

/**
 * 加载 KMZ 文件到 Cesium
 *
 * @param {Object} ctx
 * @param {File} ctx.file
 * @param {Function} ctx.getCesium
 * @param {Function} ctx.getViewer
 * @param {Object} ctx.message
 * @param {import('vue').Ref} ctx.loadedDataSources
 * @param {{ current: number }} ctx.nextId
 */
export async function loadKMZ({ file, getCesium, getViewer, message, loadedDataSources, nextId }) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const blobUrl = createBlobUrl(file);
    try {
        const dataSource = await Cesium.KmlDataSource.load(blobUrl, {
            camera: viewer.scene.camera,
            canvas: viewer.scene.canvas,
        });

        const id = `kmz_${++nextId.current}`;
        dataSource.name = file.name;

        await viewer.dataSources.add(dataSource);
        flyToEntity(viewer, Cesium, dataSource, 'kmz');

        const record = { id, name: file.name, type: 'kmz', entity: dataSource, blobUrl };
        loadedDataSources.value = [...loadedDataSources.value, record];

        message.success(`KMZ "${file.name}" 加载成功`);
        return record;
    } catch {
        revokeBlobUrl(blobUrl);
        return await loadKMZFallback({ file, getCesium, getViewer, message, loadedDataSources, nextId });
    }
}

/**
 * KMZ 手动解压回退方案
 */
async function loadKMZFallback({ file, getCesium, getViewer, message, loadedDataSources, nextId }) {
    const Cesium = getCesium();
    const viewer = getViewer();

    const buffer = await file.arrayBuffer();
    const { decompressBuffer } = await ensureGisParsers();
    const entries = await decompressBuffer(buffer, file.name);

    const kmlEntry = entries.find(
        (entry) => entry.ext === 'kml' || entry.name?.toLowerCase().endsWith('.kml'),
    );

    if (!kmlEntry) {
        throw new Error('KMZ 压缩包中未找到 KML 文件');
    }

    let kmlText;
    if (typeof kmlEntry.content === 'string') {
        kmlText = kmlEntry.content;
    } else if (kmlEntry.content instanceof ArrayBuffer || kmlEntry.content instanceof Uint8Array) {
        kmlText = decodeTextContent(kmlEntry.content);
    } else {
        kmlText = String(kmlEntry.content || '');
    }

    const kmlBlob = new Blob([kmlText], { type: 'application/vnd.google-earth.kml+xml' });
    const kmlUrl = URL.createObjectURL(kmlBlob);

    try {
        const dataSource = await Cesium.KmlDataSource.load(kmlUrl, {
            camera: viewer.scene.camera,
            canvas: viewer.scene.canvas,
        });

        const id = `kmz_${++nextId.current}`;
        dataSource.name = file.name;

        await viewer.dataSources.add(dataSource);
        flyToEntity(viewer, Cesium, dataSource, 'kmz');

        const record = { id, name: file.name, type: 'kmz', entity: dataSource };
        loadedDataSources.value = [...loadedDataSources.value, record];

        message.success(`KMZ "${file.name}" 加载成功（手动解压）`);
        return record;
    } finally {
        URL.revokeObjectURL(kmlUrl);
    }
}
