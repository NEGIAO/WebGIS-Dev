import GeoJSON from 'ol/format/GeoJSON';
import KML from 'ol/format/KML';
import { equivalent, fromLonLat, get as getProjection, toLonLat, transform, transformExtent } from 'ol/proj';
import WebGLTileLayer from 'ol/layer/WebGLTile';
import ImageLayer from 'ol/layer/Image';
import ImageStatic from 'ol/source/ImageStatic';
import {
    detectGeoJSONProjection,
    detectProjectionFromKmlText,
    ensureProjectionAvailable,
    isUnsupportedProjectedCrsError,
    UNSUPPORTED_PROJECTED_CRS_MESSAGE,
    normalizeProjectionCode
} from '../utils/geo';
import { parseShpPartsToGeoJSON } from '../utils/io';
import { useGisLoader } from './useGisLoader';
import { useMessage } from './useMessage';

export function useLayerDataImport({
    mapInstance,
    initialView,
    userDataLayers,
    addManagedLayerRecord,
    createManagedVectorLayer,
    styleTemplates,
    onImportProgress = null
}) {
    let cachedGeotiffFromBlob = null;
    let cachedGeoTIFFSourceCtor = null;
    const LABEL_FIELD_CANDIDATES = ['name', 'Name', 'NAME', '名称', 'title', 'Title', 'TITLE', 'label', 'Label'];
    const gisInlet = useGisLoader();
    const message = useMessage();

    /**
     * 从样式库中随机选择一个样式，用于增强多个导入数据的视觉区分度
     * @returns {Object} 随机选择的样式配置对象
     */
    function getRandomStyle() {
        const styleKeys = Object.keys(styleTemplates);
        if (styleKeys.length === 0) return styleTemplates.classic;
        const randomKey = styleKeys[Math.floor(Math.random() * styleKeys.length)];
        return styleTemplates[randomKey];
    }

    async function getGeotiffFromBlob() {
        if (!cachedGeotiffFromBlob) {
            const mod = await import('geotiff');
            cachedGeotiffFromBlob = mod.fromBlob;
        }
        return cachedGeotiffFromBlob;
    }

    async function getGeoTIFFSourceCtor() {
        if (!cachedGeoTIFFSourceCtor) {
            const mod = await import('ol/source/GeoTIFF');
            cachedGeoTIFFSourceCtor = mod.default;
        }
        return cachedGeoTIFFSourceCtor;
    }

    function getBandMinMax(data) {
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < data.length; i++) {
            const v = data[i];
            if (!Number.isFinite(v)) continue;
            if (v < min) min = v;
            if (v > max) max = v;
        }
        if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
            return { min: 0, max: 1 };
        }
        return { min, max };
    }

    function stretchToByte(value, min, max) {
        if (!Number.isFinite(value)) return 0;
        const n = (value - min) / (max - min);
        return Math.max(0, Math.min(255, Math.round(n * 255)));
    }

    function isNoDataValue(value, nodataValue) {
        if (nodataValue === null || nodataValue === undefined || !Number.isFinite(value)) return false;
        const eps = Math.max(1e-9, Math.abs(nodataValue) * 1e-9);
        return Math.abs(value - nodataValue) <= eps;
    }

    function computePercentileStretch(data, nodataValue, lowPct = 2, highPct = 98) {
        if (!data?.length) return { min: 0, max: 1 };

        const maxSamples = 200000;
        const step = Math.max(1, Math.floor(data.length / maxSamples));
        const values = [];

        for (let i = 0; i < data.length; i += step) {
            const v = data[i];
            if (!Number.isFinite(v) || isNoDataValue(v, nodataValue)) continue;
            values.push(v);
        }

        if (!values.length) return { min: 0, max: 1 };

        values.sort((a, b) => a - b);
        const lowIndex = Math.max(0, Math.floor((values.length - 1) * (lowPct / 100)));
        const highIndex = Math.max(0, Math.floor((values.length - 1) * (highPct / 100)));

        let min = values[lowIndex];
        let max = values[highIndex];
        if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
            min = values[0];
            max = values[values.length - 1];
        }
        if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
            return { min: 0, max: 1 };
        }
        return { min, max };
    }

    function inferFallbackNoDataValue(data, explicitNoDataValue) {
        if (Number.isFinite(explicitNoDataValue)) return explicitNoDataValue;
        if (!data?.length) return null;

        const sentinelCandidates = [0, -9999, -32768, 32767, 65535];
        const counts = new Map(sentinelCandidates.map((v) => [v, 0]));

        const maxSamples = 200000;
        const step = Math.max(1, Math.floor(data.length / maxSamples));
        let sampled = 0;

        for (let i = 0; i < data.length; i += step) {
            const v = data[i];
            if (!Number.isFinite(v)) continue;
            sampled += 1;
            if (counts.has(v)) {
                counts.set(v, counts.get(v) + 1);
            }
        }

        if (!sampled) return null;

        let bestValue = null;
        let bestCount = 0;
        for (const [value, count] of counts.entries()) {
            if (count > bestCount) {
                bestValue = value;
                bestCount = count;
            }
        }

        return bestCount / sampled >= 0.05 ? bestValue : null;
    }

    function isRasterUploadLayer(item) {
        const t = String(item?.type || '').toLowerCase();
        return item?.sourceType === 'upload' && (t === 'tif' || t === 'tiff');
    }

    function toProjectionObject(input) {
        if (!input) return null;
        if (typeof input?.getUnits === 'function') return input;
        if (typeof input === 'string') return getProjection(input);
        const normalized = normalizeProjectionCode(input);
        return normalized ? getProjection(normalized) : null;
    }

    function isEquivalentProjection(a, b) {
        const pa = toProjectionObject(a);
        const pb = toProjectionObject(b);
        if (!pa || !pb) return false;
        return equivalent(pa, pb);
    }

    function createGeoTiffSampler({ image, projection, nodataValue = null, stretchRange = null }) {
        if (!image) return null;
        const width = image.getWidth();
        const height = image.getHeight();
        const bbox = image.getBoundingBox();
        if (!bbox || bbox.length < 4) return null;

        return async (mapCoordinate, mapProjection) => {
            let coord = mapCoordinate;
            if (projection && mapProjection && !isEquivalentProjection(projection, mapProjection)) {
                coord = transform(mapCoordinate, mapProjection, projection);
            }

            const minX = bbox[0];
            const minY = bbox[1];
            const maxX = bbox[2];
            const maxY = bbox[3];
            if (coord[0] < minX || coord[0] > maxX || coord[1] < minY || coord[1] > maxY) {
                return null;
            }

            const xNorm = (coord[0] - minX) / Math.max(1e-12, maxX - minX);
            const yNorm = (maxY - coord[1]) / Math.max(1e-12, maxY - minY);
            const px = Math.min(width - 1, Math.max(0, Math.floor(xNorm * width)));
            const py = Math.min(height - 1, Math.max(0, Math.floor(yNorm * height)));

            const raster = await image.readRasters({ window: [px, py, px + 1, py + 1] });
            const bands = Array.isArray(raster) ? raster : [raster];
            const values = bands.map((band) => band?.[0]);
            const stretchMin = Number.isFinite(stretchRange?.min) ? stretchRange.min : null;
            const stretchMax = Number.isFinite(stretchRange?.max) ? stretchRange.max : null;
            const outOfStretch = values.length === 1
                && Number.isFinite(stretchMin)
                && Number.isFinite(stretchMax)
                && Number.isFinite(values[0])
                && (values[0] < stretchMin || values[0] > stretchMax);
            const allNoData = (nodataValue !== null && values.every((v) => isNoDataValue(v, nodataValue))) || outOfStretch;

            return {
                values,
                pixel: [px, py],
                nodataValue,
                allNoData
            };
        };
    }

    function createExtentRasterSampler({ bands, width, height, extent, projection, nodataValue = null, stretchRange = null }) {
        if (!bands?.length || !width || !height || !extent) return null;

        return async (mapCoordinate, mapProjection) => {
            let coord = mapCoordinate;
            if (projection && mapProjection && !isEquivalentProjection(projection, mapProjection)) {
                coord = transform(mapCoordinate, mapProjection, projection);
            }

            const [minX, minY, maxX, maxY] = extent;
            if (coord[0] < minX || coord[0] > maxX || coord[1] < minY || coord[1] > maxY) {
                return null;
            }

            const xNorm = (coord[0] - minX) / Math.max(1e-12, maxX - minX);
            const yNorm = (maxY - coord[1]) / Math.max(1e-12, maxY - minY);
            const px = Math.min(width - 1, Math.max(0, Math.floor(xNorm * width)));
            const py = Math.min(height - 1, Math.max(0, Math.floor(yNorm * height)));
            const idx = py * width + px;
            const values = bands.map((band) => band?.[idx]);
            const stretchMin = Number.isFinite(stretchRange?.min) ? stretchRange.min : null;
            const stretchMax = Number.isFinite(stretchRange?.max) ? stretchRange.max : null;
            const outOfStretch = values.length === 1
                && Number.isFinite(stretchMin)
                && Number.isFinite(stretchMax)
                && Number.isFinite(values[0])
                && (values[0] < stretchMin || values[0] > stretchMax);
            const allNoData = (nodataValue !== null && values.every((v) => isNoDataValue(v, nodataValue))) || outOfStretch;

            return {
                values,
                pixel: [px, py],
                nodataValue,
                allNoData
            };
        };
    }

    async function queryRasterValueAtCoordinate(mapCoordinate) {
        if (!mapInstance.value) return null;
        const mapProjection = mapInstance.value.getView().getProjection();
        const rasterLayers = [...userDataLayers]
            .filter(item => item.visible && isRasterUploadLayer(item) && typeof item.metadata?.rasterSampler === 'function')
            .sort((a, b) => (b.order ?? 0) - (a.order ?? 0));

        for (const item of rasterLayers) {
            try {
                const sampled = await item.metadata.rasterSampler(mapCoordinate, mapProjection);
                if (!sampled) continue;
                if (sampled.allNoData) continue;

                const lonlat = toLonLat(mapCoordinate);
                const payload = {
                    图层名称: item.name,
                    图层类型: '栅格',
                    像元列行: `${sampled.pixel[0]}, ${sampled.pixel[1]}`,
                    点击经度: Number(lonlat[0].toFixed(6)),
                    点击纬度: Number(lonlat[1].toFixed(6))
                };

                sampled.values.forEach((v, idx) => {
                    const key = `波段${idx + 1}`;
                    payload[key] = sampled.nodataValue !== null && isNoDataValue(v, sampled.nodataValue)
                        ? 'NoData'
                        : (Number.isFinite(v) ? Number(v.toFixed(6)) : String(v));
                });

                return payload;
            } catch (err) {
                message.warning(`Raster sample failed: ${err?.message || err}`, { duration: 3200 });
            }
        }

        return null;
    }

    function projectExtentToMapView(extent, sourceProjection) {
        if (!mapInstance.value || !extent || extent.some(v => !Number.isFinite(v))) return null;
        const viewProjection = mapInstance.value.getView().getProjection();
        if (!sourceProjection || isEquivalentProjection(sourceProjection, viewProjection)) {
            return extent;
        }
        try {
            return transformExtent(extent, sourceProjection, viewProjection);
        } catch (err) {
            message.warning(`Extent projection transform failed, fallback to original extent: ${err?.message || err}`, { duration: 3200 });
            return extent;
        }
    }

    async function createNonGeorefTiffLayer({
        blob,
        name,
        type,
        sourceType,
        fitView = false,
        imageExtent = null,
        projection = null,
        alertMessage = '该 TIF 未检测到坐标参考，已按当前视图中心临时加载。',
        metadata = { noGeorefFallback: true },
        nodataValue = null,
        stretchRange = null
    }) {
        if (!mapInstance.value) return null;

        const geotiffFromBlob = await getGeotiffFromBlob();
        const tiff = await geotiffFromBlob(blob);
        const image = await tiff.getImage();
        const width = image.getWidth();
        const height = image.getHeight();
        const rasters = await image.readRasters();

        const bands = Array.isArray(rasters) ? rasters : [rasters];
        const bandStats = bands.slice(0, 3).map(getBandMinMax);
        const alphaStats = bands.length >= 4 ? getBandMinMax(bands[3]) : null;
        const isSingleBand = bands.length === 1;
        const singleBandStretch = stretchRange && Number.isFinite(stretchRange.min) && Number.isFinite(stretchRange.max)
            ? stretchRange
            : (isSingleBand ? computePercentileStretch(bands[0], nodataValue) : null);
        const stretchMin = Number.isFinite(singleBandStretch?.min) ? singleBandStretch.min : null;
        const stretchMax = Number.isFinite(singleBandStretch?.max) ? singleBandStretch.max : null;

        const pixelCount = width * height;
        const rgba = new Uint8ClampedArray(pixelCount * 4);

        for (let i = 0; i < pixelCount; i++) {
            const hasRgb = bands.length >= 3;
            const rSrc = hasRgb ? bands[0][i] : bands[0]?.[i];
            const gSrc = hasRgb ? bands[1][i] : bands[0]?.[i];
            const bSrc = hasRgb ? bands[2][i] : bands[0]?.[i];

            let r;
            let g;
            let b;
            if (isSingleBand) {
                const outsideStretch = Number.isFinite(stretchMin) && Number.isFinite(stretchMax)
                    && (rSrc < stretchMin || rSrc > stretchMax);
                if (!Number.isFinite(rSrc) || isNoDataValue(rSrc, nodataValue) || outsideStretch) {
                    const p = i * 4;
                    rgba[p] = 0;
                    rgba[p + 1] = 0;
                    rgba[p + 2] = 0;
                    rgba[p + 3] = 0;
                    continue;
                }
                const v = stretchToByte(rSrc, singleBandStretch?.min ?? 0, singleBandStretch?.max ?? 1);
                r = v;
                g = 255 - v;
                b = 0;
            } else {
                r = stretchToByte(rSrc, bandStats[0]?.min ?? 0, bandStats[0]?.max ?? 1);
                g = stretchToByte(gSrc, bandStats[Math.min(1, bandStats.length - 1)]?.min ?? 0, bandStats[Math.min(1, bandStats.length - 1)]?.max ?? 1);
                b = stretchToByte(bSrc, bandStats[Math.min(2, bandStats.length - 1)]?.min ?? 0, bandStats[Math.min(2, bandStats.length - 1)]?.max ?? 1);
            }
            const a = bands.length >= 4
                ? stretchToByte(bands[3][i], alphaStats.min, alphaStats.max)
                : 255;

            const p = i * 4;
            rgba[p] = r;
            rgba[p + 1] = g;
            rgba[p + 2] = b;
            rgba[p + 3] = a;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('无法创建画布渲染上下文');
        ctx.putImageData(new ImageData(rgba, width, height), 0, 0);

        const pngBlob = await new Promise((resolve, reject) => {
            canvas.toBlob((out) => {
                if (out) resolve(out);
                else reject(new Error('无法生成影像预览'));
            }, 'image/png');
        });
        const pngUrl = URL.createObjectURL(pngBlob);

        const view = mapInstance.value.getView();
        const layerProjection = projection || view.getProjection();
        const center = view.getCenter() || fromLonLat(initialView.center);
        const resolution = view.getResolution() || 1;
        const extent = imageExtent && imageExtent.every(v => Number.isFinite(v))
            ? imageExtent
            : [
                center[0] - (width * resolution) / 2,
                center[1] - (height * resolution) / 2,
                center[0] + (width * resolution) / 2,
                center[1] + (height * resolution) / 2
            ];

        const layer = new ImageLayer({
            source: new ImageStatic({
                url: pngUrl,
                imageExtent: extent,
                projection: layerProjection
            }),
            zIndex: 120,
            properties: { name }
        });

        mapInstance.value.addLayer(layer);
        const rasterSampler = createExtentRasterSampler({
            bands,
            width,
            height,
            extent,
            projection: layerProjection,
            nodataValue,
            stretchRange: isSingleBand ? singleBandStretch : null
        });
        const id = addManagedLayerRecord({
            name,
            type,
            sourceType,
            featureCount: 1,
            styleConfig: null,
            metadata: {
                ...(metadata || {}),
                rasterSampler,
                rasterBandCount: bands.length,
                stretchRange: isSingleBand ? singleBandStretch : null,
                sourceProjection: layerProjection,
                sourceExtent: extent
            },
            layer
        });

        if (fitView) {
            const fitExtent = projectExtentToMapView(extent, layerProjection) || extent;
            mapInstance.value.getView().fit(fitExtent, {
                padding: [50, 50, 50, 50],
                duration: 700,
                maxZoom: 18
            });
        }

        if (alertMessage) {
            message.warning(alertMessage, { duration: 5200 });
        }
        return id;
    }

    async function createManagedRasterLayer({
        name,
        type,
        sourceType,
        data,
        fitView = false
    }) {
        if (!mapInstance.value || !(data instanceof ArrayBuffer)) return null;

        const blob = new Blob([data], { type: 'image/tiff' });
        const geotiffFromBlob = await getGeotiffFromBlob();
        const GeoTIFFSource = await getGeoTIFFSourceCtor();

        let sampleBandCount = 0;
        let nodataValue = null;
        let singleBandStretch = null;
        let firstImageRef = null;
        try {
            const tiff = await geotiffFromBlob(blob);
            const firstImage = await tiff.getImage();
            firstImageRef = firstImage;
            sampleBandCount = Number(
                firstImage?.getSamplesPerPixel?.() ?? firstImage?.fileDirectory?.SamplesPerPixel ?? 0
            );
            const nd = firstImage?.getGDALNoData?.();
            nodataValue = Number.isFinite(nd) ? nd : null;

            if (sampleBandCount === 1) {
                const singleBandData = await firstImage.readRasters({ samples: [0], interleave: true });
                nodataValue = inferFallbackNoDataValue(singleBandData, nodataValue);
                singleBandStretch = computePercentileStretch(singleBandData, nodataValue, 2, 98);
            }
        } catch (e) {
            sampleBandCount = 0;
            nodataValue = null;
            singleBandStretch = null;
        }

        const sourceInfo = { blob };
        if (sampleBandCount === 1 && nodataValue !== null) {
            sourceInfo.nodata = nodataValue;
        }
        const source = new GeoTIFFSource({
            convertToRGB: 'auto',
            normalize: sampleBandCount === 1 ? false : undefined,
            sources: [sourceInfo]
        });

        let viewCfg = null;
        let hasGeorefExtent = false;
        try {
            viewCfg = await source.getView();
            hasGeorefExtent = !!(viewCfg?.extent && viewCfg.extent.every(v => Number.isFinite(v)));
        } catch (e) {
            hasGeorefExtent = false;
        }

        if (!hasGeorefExtent) {
            return createNonGeorefTiffLayer({
                blob,
                name,
                type,
                sourceType,
                fitView,
                alertMessage: sampleBandCount === 1
                    ? '该 TIF 为单波段且未检测到坐标参考，已按当前视图中心临时加载。'
                    : '该 TIF 未检测到坐标参考，已按当前视图中心临时加载。',
                metadata: {
                    noGeorefFallback: true,
                    singleBandRendered: sampleBandCount === 1
                },
                nodataValue,
                stretchRange: singleBandStretch
            });
        }

        const sourceProjection = await resolveSupportedProjection(
            viewCfg?.projection,
            'EPSG:4326',
            'GeoTIFF'
        );

        const layerOptions = {
            source,
            zIndex: 120,
            properties: { name }
        };
        if (sampleBandCount === 1) {
            const minVal = Number.isFinite(singleBandStretch?.min) ? singleBandStretch.min : 0;
            const maxVal = Number.isFinite(singleBandStretch?.max) ? singleBandStretch.max : 1;
            const midVal = (minVal + maxVal) / 2;
            const baseColorExpr = [
                'interpolate',
                ['linear'],
                ['band', 1],
                minVal, ['color', 32, 164, 72, 1],
                midVal, ['color', 254, 224, 139, 1],
                maxVal, ['color', 215, 25, 28, 1]
            ];
            const transparentExpr = ['color', 0, 0, 0, 0];
            const maskedConditions = [
                ['<', ['band', 1], minVal],
                ['>', ['band', 1], maxVal]
            ];
            if (nodataValue !== null) {
                maskedConditions.unshift(['==', ['band', 1], nodataValue]);
            }
            layerOptions.style = {
                color: ['case', ['any', ...maskedConditions], transparentExpr, baseColorExpr]
            };
        }

        const layer = new WebGLTileLayer(layerOptions);

        mapInstance.value.addLayer(layer);
        const rasterSampler = createGeoTiffSampler({
            image: firstImageRef,
            projection: sourceProjection,
            nodataValue,
            stretchRange: sampleBandCount === 1 ? singleBandStretch : null
        });
        const id = addManagedLayerRecord({
            name,
            type,
            sourceType,
            featureCount: 1,
            styleConfig: null,
            metadata: {
                rasterSampler,
                rasterBandCount: sampleBandCount,
                nodataValue,
                stretchRange: sampleBandCount === 1 ? singleBandStretch : null,
                sourceProjection,
                sourceExtent: viewCfg?.extent
            },
            layer
        });

        if (fitView && mapInstance.value) {
            const fitExtent = projectExtentToMapView(viewCfg.extent, sourceProjection) || viewCfg.extent;
            mapInstance.value.getView().fit(fitExtent, {
                padding: [50, 50, 50, 50],
                duration: 900,
                maxZoom: 18
            });
        }

        return id;
    }

    function isTiffType(type) {
        const normalized = String(type || '').toLowerCase();
        return normalized === 'tif' || normalized === 'tiff';
    }

    async function resolveSupportedProjection(rawProjection, fallbackProjection = 'EPSG:4326', label = '数据') {
        const normalized = normalizeProjectionCode(rawProjection);
        if (!normalized) return fallbackProjection;

        const supported = await ensureProjectionAvailable(normalized);
        if (supported) return supported;

        throw new Error(`${label}坐标系 ${normalized} 当前不支持，请提供可识别 EPSG 定义或先转换为 EPSG:4326 / EPSG:3857。`);
    }

    function decodeTextContent(content) {
        if (typeof content === 'string') return content;
        if (content instanceof ArrayBuffer) {
            return new TextDecoder('utf-8', { fatal: false }).decode(content);
        }
        return String(content || '');
    }

    function getNormalizedUploadType(type, name = '') {
        const normalizedType = String(type || '').toLowerCase();
        const filename = String(name || '').trim().toLowerCase();
        const ext = filename.includes('.') ? filename.split('.').pop() : '';

        if (ext === 'kmz') return 'kmz';
        if (ext === 'kml') return 'kml';
        if (ext === 'geojson' || ext === 'json') return ext;
        if (ext === 'tif' || ext === 'tiff') return ext;
        if (ext === 'zip' || ext === 'shp') return ext;
        return normalizedType;
    }

    function getLayerNameFromEntry(entryName, fallbackName = '上传图层') {
        const normalized = String(entryName || '').replace(/\\/g, '/').trim();
        if (!normalized) return fallbackName;

        const filename = normalized.split('/').pop() || normalized;
        const idx = filename.lastIndexOf('.');
        const stem = idx > 0 ? filename.slice(0, idx) : filename;
        return stem || fallbackName;
    }

    function reportImportProgress(state = {}) {
        if (typeof onImportProgress !== 'function') return;
        onImportProgress({
            phase: 'idle',
            total: 0,
            current: 0,
            success: 0,
            failed: 0,
            message: '',
            warnings: 0,
            errors: 0,
            timestamp: Date.now(),
            ...state
        });
    }

    function pickFeatureLabelField(features = []) {
        if (!Array.isArray(features) || !features.length) return null;

        for (const key of LABEL_FIELD_CANDIDATES) {
            const hasValue = features.some((feature) => {
                const v = feature?.get?.(key);
                return v !== null && v !== undefined && String(v).trim();
            });
            if (hasValue) return key;
        }

        const firstFeature = features[0];
        const props = typeof firstFeature?.getProperties === 'function' ? firstFeature.getProperties() : null;
        if (!props) return null;

        const firstUsableKey = Object.keys(props).find((key) => {
            if (key === 'geometry' || key === 'style' || String(key).startsWith('_')) return false;
            const value = props[key];
            return value !== null && value !== undefined && String(value).trim();
        });

        return firstUsableKey || null;
    }

    async function parseKmlTextToFeatures(kmlText, label = 'KML') {
        const detectedProjection = detectProjectionFromKmlText(kmlText);
        const dataProjection = await resolveSupportedProjection(detectedProjection, 'EPSG:4326', label);
        const kmlFormat = new KML({ extractStyles: false });
        let features = kmlFormat.readFeatures(kmlText, {
            dataProjection,
            featureProjection: 'EPSG:3857'
        });

        // 兼容部分导出工具：全量使用 kml: 前缀时，OpenLayers 可能出现空解析。
        if ((!features || !features.length) && /<\s*\/?\s*kml:/i.test(kmlText)) {
            const normalizedKmlText = String(kmlText)
                .replace(/<(\/?)(\s*)kml:/gi, '<$1$2')
                .replace(/\s+xmlns:kml\s*=\s*(['"]).*?\1/gi, '');

            features = kmlFormat.readFeatures(normalizedKmlText, {
                dataProjection,
                featureProjection: 'EPSG:3857'
            });
        }

        return features;
    }

    async function parseKmlTextToFeaturesWithProjection(kmlText, dataProjection = 'EPSG:4326', label = 'KML') {
        const projectionToUse = await resolveSupportedProjection(dataProjection, 'EPSG:4326', label);
        const kmlFormat = new KML({ extractStyles: false });
        let features = kmlFormat.readFeatures(kmlText, {
            dataProjection: projectionToUse,
            featureProjection: 'EPSG:3857'
        });

        if ((!features || !features.length) && /<\s*\/?\s*kml:/i.test(kmlText)) {
            const normalizedKmlText = String(kmlText)
                .replace(/<(\/?)(\s*)kml:/gi, '<$1$2')
                .replace(/\s+xmlns:kml\s*=\s*(['"]).*?\1/gi, '');

            features = kmlFormat.readFeatures(normalizedKmlText, {
                dataProjection: projectionToUse,
                featureProjection: 'EPSG:3857'
            });
        }

        return features;
    }

    async function parseUploadedFeatures({ content, type, name = '' }) {
        const normalizedType = getNormalizedUploadType(type, name);

        if (normalizedType === 'kml') {
            const kmlText = decodeTextContent(content);
            return parseKmlTextToFeatures(kmlText, 'KML');
        }

        if (normalizedType === 'kmz' || normalizedType === 'zip') {
            const dispatched = await gisInlet.dispatch({ content, type: normalizedType, name });
            const vectorPacket = (dispatched.packets || []).find((item) => item.kind === 'kml' || item.kind === 'geojson' || item.kind === 'shp');

            if (!vectorPacket) {
                throw new Error('压缩包中未找到可用矢量数据');
            }

            if (vectorPacket.kind === 'kml') {
                return parseKmlTextToFeaturesWithProjection(
                    vectorPacket.kmlString,
                    vectorPacket.dataProjection || 'EPSG:4326',
                    normalizedType === 'kmz' ? 'KMZ/KML' : 'ZIP/KML'
                );
            }

            if (vectorPacket.kind === 'shp') {
                const geojson = await parseShpPartsToGeoJSON(vectorPacket.shpParts);
                const gjFormat = new GeoJSON();
                const featureCollection = Array.isArray(geojson)
                    ? { type: 'FeatureCollection', features: geojson.flatMap(item => item.features || []) }
                    : geojson;
                return gjFormat.readFeatures(featureCollection, {
                    dataProjection: 'EPSG:4326',
                    featureProjection: 'EPSG:3857'
                });
            }

            if (vectorPacket.kind === 'geojson') {
                const geojsonData = vectorPacket.geojsonData;
                const dataProjection = await resolveSupportedProjection(vectorPacket.dataProjection || 'EPSG:4326', 'EPSG:4326', 'GeoJSON');
                const gjFormat = new GeoJSON();
                return gjFormat.readFeatures(geojsonData, {
                    dataProjection,
                    featureProjection: 'EPSG:3857'
                });
            }

            throw new Error('不支持的文件格式：压缩包中未找到可用矢量数据');
        }

        if (normalizedType === 'geojson' || normalizedType === 'json') {
            const geojsonData = typeof content === 'string' ? JSON.parse(content) : content;
            const detectedProjection = detectGeoJSONProjection(geojsonData);
            const dataProjection = await resolveSupportedProjection(detectedProjection, 'EPSG:4326', 'GeoJSON');
            const gjFormat = new GeoJSON();
            return gjFormat.readFeatures(geojsonData, {
                dataProjection,
                featureProjection: 'EPSG:3857'
            });
        }

        if (normalizedType === 'shp') {
            const geojson = await parseShpPartsToGeoJSON({ shp: content });
            const gjFormat = new GeoJSON();
            const detectedProjection = detectGeoJSONProjection(geojson);
            const dataProjection = await resolveSupportedProjection(detectedProjection, 'EPSG:4326', 'SHP');
            return gjFormat.readFeatures(geojson, {
                dataProjection,
                featureProjection: 'EPSG:3857'
            });
        }

        throw new Error(`不支持的文件类型: ${normalizedType || type}`);
    }

    async function importDispatchedPackets(dispatched, normalizedType, name, batchLabel) {
        const packets = Array.isArray(dispatched.packets)
            ? dispatched.packets
            : (dispatched.packet ? [dispatched.packet] : []);

        const detectedCount = Number(dispatched?.summary?.detectedDatasets ?? packets.length);
        message.info(`已识别到 ${detectedCount} 个数据集，正在同步导入...`);

        if (!packets.length) {
            throw new Error('未找到可用 GIS 数据');
        }

        const importErrors = [];
        let importedCount = 0;
        const total = packets.length;
        let unsupportedProjectionDetected = false;

        reportImportProgress({
            phase: 'importing',
            total,
            current: 0,
            success: 0,
            failed: 0,
            warnings: Array.isArray(dispatched.warnings) ? dispatched.warnings.length : 0,
            errors: Array.isArray(dispatched.errors) ? dispatched.errors.length : 0,
            message: `准备导入 ${total} 个数据集...`
        });

        for (const packet of packets) {
            try {
                const layerName = getLayerNameFromEntry(packet.entryName, name || '上传图层');

                if (packet.kind === 'tiff') {
                    await createManagedRasterLayer({
                        name: layerName,
                        type: 'tiff',
                        sourceType: 'upload',
                        data: packet.arrayBuffer,
                        fitView: importedCount === 0
                    });
                    importedCount += 1;
                    continue;
                }

                let features = [];
                let layerType = packet.kind;

                if (packet.kind === 'kml') {
                    features = await parseKmlTextToFeaturesWithProjection(
                        packet.kmlString,
                        packet.dataProjection || 'EPSG:4326',
                        normalizedType === 'kmz' ? 'KMZ/KML' : 'ZIP/KML'
                    );
                    layerType = normalizedType === 'kmz' ? 'kmz' : 'kml';
                } else if (packet.kind === 'geojson') {
                    const dataProjection = await resolveSupportedProjection(packet.dataProjection || 'EPSG:4326', 'EPSG:4326', 'GeoJSON');
                    const gjFormat = new GeoJSON();
                    features = gjFormat.readFeatures(packet.geojsonData, {
                        dataProjection,
                        featureProjection: 'EPSG:3857'
                    });
                    layerType = 'geojson';
                } else if (packet.kind === 'shp') {
                    const geojson = await parseShpPartsToGeoJSON(packet.shpParts);
                    const gjFormat = new GeoJSON();
                    const featureCollection = Array.isArray(geojson)
                        ? { type: 'FeatureCollection', features: geojson.flatMap(item => item.features || []) }
                        : geojson;
                    features = gjFormat.readFeatures(featureCollection, {
                        dataProjection: 'EPSG:4326',
                        featureProjection: 'EPSG:3857'
                    });
                    layerType = 'shp';
                } else {
                    throw new Error(`不支持的 packet 类型: ${packet.kind}`);
                }

                if (!features.length) throw new Error('无有效要素');

                const labelField = pickFeatureLabelField(features);
                createManagedVectorLayer({
                    name: layerName,
                    type: layerType,
                    sourceType: 'upload',
                    features,
                    styleConfig: getRandomStyle(),
                    autoLabel: true,
                    metadata: {
                        labelField,
                        dispatchEntry: packet.entryName || ''
                    },
                    fitView: importedCount === 0
                });

                importedCount += 1;
                reportImportProgress({
                    phase: 'importing',
                    total,
                    current: importedCount + importErrors.length,
                    success: importedCount,
                    failed: importErrors.length,
                    warnings: Array.isArray(dispatched.warnings) ? dispatched.warnings.length : 0,
                    errors: (Array.isArray(dispatched.errors) ? dispatched.errors.length : 0) + importErrors.length,
                    message: `已导入：${layerName}`
                });
            } catch (err) {
                if (isUnsupportedProjectedCrsError(err) && !unsupportedProjectionDetected) {
                    unsupportedProjectionDetected = true;
                    if (!err?.notified) {
                        message.error(UNSUPPORTED_PROJECTED_CRS_MESSAGE, { closable: true, duration: 0 });
                    }
                }
                importErrors.push(`${packet.entryName || packet.kind}: ${err.message}`);
                reportImportProgress({
                    phase: 'importing',
                    total,
                    current: importedCount + importErrors.length,
                    success: importedCount,
                    failed: importErrors.length,
                    warnings: Array.isArray(dispatched.warnings) ? dispatched.warnings.length : 0,
                    errors: (Array.isArray(dispatched.errors) ? dispatched.errors.length : 0) + importErrors.length,
                    message: `导入失败：${packet.entryName || packet.kind}`
                });
            }
        }

        const dispatcherErrors = Array.isArray(dispatched.errors)
            ? dispatched.errors.map((item) => `${item.entryName || item.kind}: ${item.message}`)
            : [];

        const mergedErrors = [...dispatcherErrors, ...importErrors];
        const warningCount = gisInlet.warnings.value?.length || 0;

        const feedbackLines = [];
        if (gisInlet.warnings.value?.length) {
            feedbackLines.push('警告信息:');
            feedbackLines.push(...gisInlet.warnings.value);
        }
        if (mergedErrors.length) {
            feedbackLines.push(`失败 ${mergedErrors.length} 项（已跳过并继续处理其余数据）:`);
            feedbackLines.push(...mergedErrors);
        }

        if (feedbackLines.length) {
            message.warning(feedbackLines.slice(0, 6).join('\n'), { closable: true, duration: 6500 });
        }

        message.notifyBatch({
            label: batchLabel,
            success: importedCount,
            failed: mergedErrors.length,
            warnings: warningCount
        });

        if (!importedCount) {
            throw new Error('所有数据集导入失败');
        }

        reportImportProgress({
            phase: 'done',
            total,
            current: total,
            success: importedCount,
            failed: mergedErrors.length,
            warnings: warningCount,
            errors: mergedErrors.length,
            message: `导入完成：成功 ${importedCount}，失败 ${mergedErrors.length}`
        });
    }

    async function addUserDataLayer({ content, type, name, resources }) {
        if (!mapInstance.value) return;
        try {
            const isFolderImport = Array.isArray(resources) && resources.length > 0;
            const normalizedType = isFolderImport ? 'directory' : getNormalizedUploadType(type, name);
            reportImportProgress({
                phase: 'validating',
                message: `正在校验文件：${name || (isFolderImport ? '文件夹导入' : '未命名文件')}`
            });

            if (isFolderImport || normalizedType === 'zip' || normalizedType === 'kmz') {
                reportImportProgress({
                    phase: 'dispatching',
                    message: isFolderImport ? '正在递归扫描文件夹并识别数据集...' : '正在解析压缩包并识别数据集...'
                });

                const dispatched = await gisInlet.dispatch(
                    isFolderImport
                        ? { resources, type: normalizedType, name }
                        : { content, type: normalizedType, name }
                );

                await importDispatchedPackets(
                    dispatched,
                    normalizedType,
                    name,
                    isFolderImport
                        ? '文件夹批量导入'
                        : (normalizedType === 'kmz' ? 'KMZ 批量导入' : 'ZIP 批量导入')
                );

                return;
            }

            if (isTiffType(normalizedType)) {
                const tifName = name || `栅格_${Date.now()}.tif`;
                const buffer = content instanceof ArrayBuffer ? content : null;
                if (!buffer) throw new Error('TIF 数据读取失败');

                await createManagedRasterLayer({
                    name: tifName,
                    type: normalizedType,
                    sourceType: 'upload',
                    data: buffer,
                    fitView: true
                });
                reportImportProgress({
                    phase: 'done',
                    total: 1,
                    current: 1,
                    success: 1,
                    failed: 0,
                    message: `导入完成：${tifName}`
                });
                message.success(`导入完成：${tifName}`);
                return;
            }

            const features = await parseUploadedFeatures({ content, type: normalizedType, name });
            if (!features.length) throw new Error('无有效数据');
            const labelField = pickFeatureLabelField(features);

            createManagedVectorLayer({
                name,
                type: normalizedType,
                sourceType: 'upload',
                features,
                styleConfig: getRandomStyle(),
                autoLabel: true,
                metadata: {
                    labelField
                },
                fitView: true
            });
            reportImportProgress({
                phase: 'done',
                total: 1,
                current: 1,
                success: 1,
                failed: 0,
                message: `导入完成：${name || '上传图层'}`
            });
            message.success(`导入完成：${name || '上传图层'}`);
        } catch (e) {
            reportImportProgress({
                phase: 'error',
                message: `导入失败：${e.message}`
            });
            if (isUnsupportedProjectedCrsError(e)) {
                if (!e?.notified) {
                    message.error(UNSUPPORTED_PROJECTED_CRS_MESSAGE, { closable: true, duration: 0 });
                }
                return;
            }
            message.error('文件解析失败: ' + e.message, { closable: true, duration: 0 });
        }
    }

    return {
        createManagedRasterLayer,
        queryRasterValueAtCoordinate,
        projectExtentToMapView,
        addUserDataLayer,
        parseUploadedFeatures,
        isTiffType
    };
}