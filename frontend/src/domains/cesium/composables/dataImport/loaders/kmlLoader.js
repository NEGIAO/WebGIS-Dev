/**
 * kmlLoader.js
 * KML/KMZ 格式加载器
 *
 * 设计要点（V3.5.25 重构）：
 * - KML 是文本格式，直接交给 Cesium.KmlDataSource.load(blobUrl) 有两个致命缺陷：
 *   ① Cesium 内部固定按 UTF-8 读取文本，GBK 等编码的 KML 必然乱码，符号/样式全部解析失败；
 *   ② blob URL 无法承载相对路径资源（图标等）。
 *   因此本加载器统一先自行读取并多编码解码，再以文本 Blob 交给 Cesium。
 * - KMZ 统一走手动解压管线（extractKmlFromKmz）：doc.kml 智能选择 + 多编码解码 +
 *   内嵌资源 href 重写为 blob URL，符号完整性不依赖 Cesium 原生 KMZ 支持（其 zip 条目
 *   名精确匹配策略对 ./ 前缀、大小写差异、URL 编码等变体必然失配）。
 * - 重写产生的 blob URL 登记到 record.blobUrls，由 useCesiumDataImport 的
 *   removeDataSource / clearAllDataSources 统一回收。
 */

import { decodeTextContent } from '@common/data-import/vectorUtils.js';
import { flyToEntity, revokeBlobUrl } from './utils.js';

const KML_MIME = 'application/vnd.google-earth.kml+xml';

/**
 * 以已解码的 KML 文本加载 KmlDataSource
 * @param {Cesium} Cesium - Cesium 命名空间
 * @param {Cesium.Viewer} viewer - 场景
 * @param {string} kmlText - 已解码的 KML 文本
 * @returns {Promise<Cesium.KmlDataSource>}
 */
async function loadKmlDataSource(Cesium, viewer, kmlText) {
    return Cesium.KmlDataSource.load(
        new Blob([kmlText], { type: KML_MIME }),
        {
            camera: viewer.scene.camera,
            canvas: viewer.scene.canvas,
        },
    );
}

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

    const buffer = await file.arrayBuffer();
    const kmlText = decodeTextContent(buffer);

    const dataSource = await loadKmlDataSource(Cesium, viewer, kmlText);

    const id = `kml_${++nextId.current}`;
    dataSource.name = file.name;

    await viewer.dataSources.add(dataSource);
    flyToEntity(viewer, Cesium, dataSource, 'kml');

    const record = { id, name: file.name, type: 'kml', entity: dataSource };
    loadedDataSources.value = [...loadedDataSources.value, record];

    message.success(`KML "${file.name}" 加载成功`);
    return record;
}

/**
 * 加载 KMZ 文件到 Cesium
 * 统一走手动解压管线：doc.kml 智能选择 + 多编码解码 + 内嵌资源 href 重写为 blob URL
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

    const { extractKmlFromKmz } = await import('@common/data-import/useKmzLoader.js');
    const { kmlString, resourceBlobUrls } = await extractKmlFromKmz(file, {
        rewriteResourceBlobUrls: true,
    });

    try {
        const dataSource = await loadKmlDataSource(Cesium, viewer, kmlString);

        const id = `kmz_${++nextId.current}`;
        dataSource.name = file.name;

        await viewer.dataSources.add(dataSource);
        flyToEntity(viewer, Cesium, dataSource, 'kmz');

        const record = {
            id,
            name: file.name,
            type: 'kmz',
            entity: dataSource,
            blobUrls: resourceBlobUrls,
        };
        loadedDataSources.value = [...loadedDataSources.value, record];

        message.success(`KMZ "${file.name}" 加载成功`);
        return record;
    } catch (error) {
        for (const url of resourceBlobUrls) revokeBlobUrl(url);
        throw error;
    }
}