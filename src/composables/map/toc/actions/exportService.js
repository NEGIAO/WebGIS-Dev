import KML from 'ol/format/KML';

function sanitizeFileName(name) {
    const base = String(name || 'layer').trim() || 'layer';
    return base.replace(/[\\/:*?"<>|]+/g, '_');
}

function triggerTextDownload(fileName, content, mimeType = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return blob.size;
}

function resolveFeatureName(feature, fallbackName) {
    const candidates = [
        feature?.get?.('name'),
        feature?.get?.('Name'),
        feature?.get?.('名称'),
        fallbackName
    ];
    const hit = candidates.find((item) => String(item || '').trim().length > 0);
    return String(hit || fallbackName || 'feature');
}

export function buildKmlContent({
    features = [],
    layerId = '',
    layerName = 'layer',
    sourceCrs = 'wgs84',
    featureProjection = 'EPSG:3857',
    dataProjection = 'EPSG:4326',
    decimals = 6
} = {}) {
    const clonedFeatures = [];

    (Array.isArray(features) ? features : []).forEach((feature, index) => {
        if (!feature || typeof feature.clone !== 'function') return;

        const featureId = index + 1;
        const fallbackName = `${layerName}_${featureId}`;
        const cloned = feature.clone();
        if (!cloned) return;

        cloned.set('name', resolveFeatureName(feature, fallbackName), true);
        cloned.set('sourceLayerId', String(layerId || ''), true);
        cloned.set('sourceLayerName', String(layerName || ''), true);
        cloned.set('sourceCRS', String(sourceCrs || 'wgs84').toLowerCase(), true);
        clonedFeatures.push(cloned);
    });

    if (!clonedFeatures.length) {
        return {
            content: '',
            featureCount: 0,
            clonedFeatures: []
        };
    }

    const kmlWriter = new KML({
        writeStyles: false,
        extractStyles: false
    });

    const content = kmlWriter.writeFeatures(clonedFeatures, {
        featureProjection,
        dataProjection,
        decimals
    });

    return {
        content,
        featureCount: clonedFeatures.length,
        clonedFeatures
    };
}

export function exportFeaturesAsKml({
    features = [],
    layerId = '',
    layerName = 'layer',
    sourceCrs = 'wgs84',
    featureProjection = 'EPSG:3857',
    dataProjection = 'EPSG:4326',
    decimals = 6,
    triggerDownload = true,
    fileName
} = {}) {
    const built = buildKmlContent({
        features,
        layerId,
        layerName,
        sourceCrs,
        featureProjection,
        dataProjection,
        decimals
    });

    if (!built.featureCount || !built.content) {
        return {
            ...built,
            fileName: '',
            sizeBytes: 0
        };
    }

    const safeName = sanitizeFileName(layerName);
    const outputFileName = String(fileName || `${safeName}_${String(sourceCrs || 'wgs84').toLowerCase()}.kml`);

    let sizeBytes = 0;
    if (triggerDownload) {
        sizeBytes = triggerTextDownload(
            outputFileName,
            built.content,
            'application/vnd.google-earth.kml+xml;charset=utf-8'
        );
    } else {
        sizeBytes = new Blob([built.content], {
            type: 'application/vnd.google-earth.kml+xml;charset=utf-8'
        }).size;
    }

    return {
        ...built,
        fileName: outputFileName,
        sizeBytes
    };
}
