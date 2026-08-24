/**
 * kmlLoader.js
 * KML/KMZ 格式加载器
 * 设计要点(V3.5.24 重构):
 * - KML 是文本格式，直接交给 Cesium.KmlDataSource.load(blobUrl) 存在两个致命缺陷：
 *   ① Cesium内部固定按 UTF‑8 读取文本，GBK等编码的KML必然乱码、符号格式全部解析失败；
 *   ② blob URL无法加载相对路径资源(图标等)。
 *   因此本加载器统一先自行读取并多编码解码，再以文本 Blob 交给 Cesium。
 * - KMZ 统一手动解压流程(extractKmlFromKmz):doc.kml智能选择 + 多编码解码 +
 *   内嵌资源 href 重写为 blob URL，符号完整性不依赖 Cesium 原生 KMZ支持(其zip目录
 *   名称精确匹配策略对 ./ 前缀、大小写差异、URL编码等变体必然失配)。
 * - 重写产生的 blob URL记录到 record.blobUrls，由 useCesiumDataImport 的
 *   removeDataSource / clearAllDataSources 统一回收。
 *
 * 投影与命名空间(V3.5.24 修复):
 * - Cesium.KmlDataSource 只支持 WGS84(EPSG:4326)经纬度坐标；如果KML实际使用
 *   3857(Web Mercator)等其它投影，坐标会被误当成经纬度导致位置错误。
 *   本加载器复用 ol 管线同源的 crsAware 检测逻辑(detectKmlProjectionHint /
 *   resolveProjectionOrDefault)，对非 EPSG:4326 的KML 在XML层面把所有
 *   <coordinates> 重投影为 WGS84 之后再交给 Cesium。
 * - 部分KML使用 <kml:Placemark> 等带前缀标签，先统一归一化命名空间(移除 kml: 前缀)，
 *   再传给Cesium，保证要素格式可以被解析。
 */

import { decodeTextContent } from '@common/data-import/vectorUtils.js';
import {
    detectKmlProjectionHint,
    resolveProjectionOrDefault,
} from '@common/data-import/crsAware.js';
import { transform } from 'ol/proj';
import { flyToEntity, forceDataSourceClampToGround, revokeBlobUrl } from './utils.js';


const KML_MIME = 'application/vnd.google-earth.kml+xml';
const WGS84 = 'EPSG:4326';


function parseKmlDocument(kmlText) {
    return new Blob([kmlText], { type: KML_MIME });
}


/**
 * 归一化 KML 文本中的 kml: 前缀命名空间
 * 部分 KML 文件使用 <kml:Placemark> 等带前缀的标签，需要移除前缀
 * 以保证 DOMParser / Cesium 能够正确匹配元素。
 *
 * @param {string} kmlText - 原始 KML 文本
 * @returns {string} 归一化后的 KML 文本
 */
function normalizeKmlNamespace(kmlText) {
    if (/<\s*\/?\s*kml:/i.test(kmlText)) {
        return String(kmlText)
            .replace(/<(\/?)(\s*)kml:/gi, '<$1$2')
            .replace(/\s+xmlns:kml\s*=\s*(['"]).*?\1/gi, '');
    }
    return kmlText;
}


/**
 * 将 KML 文本中全部 <coordinates> 的坐标从源投影重投影到 WGS84(EPSG:4326)。
 * KML规范要求坐标为 WGS84 经纬度，但是现实中很多KML直接使用投影坐标
 * (3857、CGCS2000 等)。Cesium.KmlDataSource 只按经纬度解析，
 * 因此需要先在 XML 层面完成重投影。
 *
 * @param {string} kmlText - KML 文本
 * @param {string} sourceProjection - 源投影编码(例如 EPSG:3857)
 * @returns {Promise<string>} 重投影后的KML文本(解析失败原样返回)
 */
async function reprojectKmlToWgs84(kmlText, sourceProjection) {
    if (!sourceProjection || sourceProjection.toUpperCase() === WGS84) {
        return kmlText;
    }

    const xml = new DOMParser().parseFromString(kmlText, 'text/xml');
    if (xml.documentElement.tagName === 'parsererror') return kmlText;

    const coordinateNodes = Array.from(xml.getElementsByTagName('coordinates'));
    if (!coordinateNodes.length) return kmlText;

    for (const node of coordinateNodes) {
        const raw = String(node.textContent || '').trim();
        if (!raw) continue;

        const lines = raw.split('\n');
        const converted = lines.map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;

            // KML coordinates 格式: lon,lat[,alt]，可用空格分隔多个点
            return trimmed
                .split(/\s+/)
                .map((chunk) => {
                    const parts = chunk.split(',').map((v) => Number(v.trim()));
                    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
                        return chunk;
                    }
                    try {
                        const [lon, lat] = transform(
                            [parts[0], parts[1]],
                            sourceProjection,
                            WGS84,
                        );
                        const out = [Number(lon.toFixed(10)), Number(lat.toFixed(10))];
                        if (Number.isFinite(parts[2])) out.push(parts[2]);
                        return out.join(',');
                    } catch {
                        return chunk; // 投影不可用或者转换失败，原样保留
                    }
                })
                .join(' ');
        });

        node.textContent = converted.join('\n');
    }

    return new XMLSerializer().serializeToString(xml);
}


/**
 * 准备 KML 文本:命名空间归一化 + 投影检测与重投影。
 * 复用 ol 管线同源的 crsAware 检测逻辑，保证与 ol 行为一致。
 *
 * @param {string} kmlText - 已经解码的 KML 文本
 * @param {string} label - 日志标签(KML / KMZ)
 * @returns {Promise<{ kmlText: string, projection: string|null }>}
 */
async function prepareKmlText(kmlText, label = 'KML') {
    // 1. 归一化 kml: 前缀命名空间(就算不需要重投影也要做，保证要素可解析)
    let normalized = normalizeKmlNamespace(kmlText);

    // 1.5 贴地语义强制：剥掉显式 altitudeMode/extrude——
    //     文件若声明 absolute/relativeToGround，Cesium 会优先尊重文件语义，
    //     绕过 load 期 clampToGround 选项导致「埋地/悬浮」；项目要求矢量全部贴地。
    normalized = normalized
        .replace(/<gx:altitudeMode[\s\S]*?<\/gx:altitudeMode>/gi, '')
        .replace(/<altitudeMode[\s\S]*?<\/altitudeMode>/gi, '')
        .replace(/<extrude>[\s\S]*?<\/extrude>/gi, '');

    // 2. 检测投影(与 ol 管线同源)
    const hint = detectKmlProjectionHint(normalized);
    const resolved = await resolveProjectionOrDefault(hint, label);
    if (resolved.warning) {
        console.warn(`[${label}] ${resolved.warning}`);
    }

    // 3. 非 WGS84 时在XML层面重投影坐标
    const finalText = await reprojectKmlToWgs84(normalized, resolved.projection);

    return {
        kmlText: finalText,
        projection: resolved.projection,
    };
}


/**
 * 用已经解码的KML文本加载 KmlDataSource
 * @param {Cesium} Cesium - Cesium 命名空间
 * @param {Cesium.Viewer} viewer - 场景
 * @param {string} kmlText - 已经解码并且归一化的 KML 文本
 * @returns {Promise<Cesium.KmlDataSource>}
 */
async function loadKmlDataSource(Cesium, viewer, kmlText) {
    const kmlDocument = parseKmlDocument(kmlText);

    return Cesium.KmlDataSource.load(kmlDocument, {
        camera: viewer.scene.camera,
        canvas: viewer.scene.canvas,
        // 官方范式（DataSource.load 期选项）：true 时 Polygons/LineStrings/LinearRings
        // 经 GroundPrimitive/GroundPolyline 贴地渲染。
        // ⚠️ 已验证本地 Cesium 1.132 bundle：KmlDataSource 与 GeoJsonDataSource 的
        // clampToGround 默认值均为 false，不显式传入则图元按坐标原始高度生成，
        // 开启真实地形后被整体埋入地下（如 HENU湖泊.kmz 高度全 0 vs 当地地面 +70m）。
        clampToGround: true,
    });
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

    // 投影检测 + 命名空间归一化 + 坐标重投影(和ol行为保持一致)
    const { kmlText: preparedText } = await prepareKmlText(kmlText, 'KML');

    const dataSource = await loadKmlDataSource(Cesium, viewer, preparedText);

    const id = `kml_${++nextId.current}`;
    dataSource.name = file.name;

    await viewer.dataSources.add(dataSource);
    // 贴地双保险：加载期 clampToGround:true + 加载后实体级强制钳制
    // （防文件显式 altitudeMode=absolute/relativeToGround 绕过贴地）
    forceDataSourceClampToGround(dataSource, Cesium);
    flyToEntity(viewer, Cesium, dataSource, 'kml');

    const record = { id, name: file.name, type: 'kml', entity: dataSource };
    loadedDataSources.value = [...loadedDataSources.value, record];

    message.success(`KML "${file.name}" 加载成功`);
    return record;
}


/**
 * 加载 KMZ 文件到 Cesium
 * 统一手动解压流程:doc.kml 智能选择 + 多编码解码 + 内嵌资源 href 重写为 blob URL
 * 解压之后再走和KML相同的投影检测 / 命名空间归一化 / 坐标重投影。
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
        // 投影检测 + 命名空间归一化 + 坐标重投影
        const { kmlText: preparedText } = await prepareKmlText(kmlString, 'KMZ');

        const dataSource = await loadKmlDataSource(Cesium, viewer, preparedText);

        const id = `kmz_${++nextId.current}`;
        dataSource.name = file.name;

        await viewer.dataSources.add(dataSource);
        // 贴地双保险：同 loadKML，加载后实体级强制钳制
        forceDataSourceClampToGround(dataSource, Cesium);
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