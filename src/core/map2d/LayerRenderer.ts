import { watch, type WatchStopHandle } from 'vue';
import type OlMap from 'ol/Map';
import type BaseLayer from 'ol/layer/Base';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import GeoJSON from 'ol/format/GeoJSON';
import KML from 'ol/format/KML';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { useLayerStore, type LayerRecord } from '../../stores/layerStore';

type LayerBridge = {
    addLayer: (layerId: string, layer: BaseLayer) => void;
    removeLayer: (layerId: string) => void;
};

type LayerRenderState = {
    type: string;
    olFeaturesRef: unknown;
    olSourceRef: unknown;
    format: string;
    dataProjection: string;
};

const LABEL_FIELD_CANDIDATES = ['name', 'Name', 'NAME', '名称', 'title', 'Title', 'TITLE', 'label', 'Label'];

function isGeoJsonObject(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const type = String((value as any).type || '');
    return type === 'FeatureCollection' || type === 'Feature' || type === 'GeometryCollection';
}

function parseHexToRgb(hexColor: string): [number, number, number] {
    const cleaned = String(hexColor || '').replace('#', '').trim();
    if (cleaned.length === 3) {
        const r = Number.parseInt(`${cleaned[0]}${cleaned[0]}`, 16);
        const g = Number.parseInt(`${cleaned[1]}${cleaned[1]}`, 16);
        const b = Number.parseInt(`${cleaned[2]}${cleaned[2]}`, 16);
        return [Number.isFinite(r) ? r : 95, Number.isFinite(g) ? g : 191, Number.isFinite(b) ? b : 122];
    }
    if (cleaned.length !== 6) {
        return [95, 191, 122];
    }
    const r = Number.parseInt(cleaned.slice(0, 2), 16);
    const g = Number.parseInt(cleaned.slice(2, 4), 16);
    const b = Number.parseInt(cleaned.slice(4, 6), 16);
    return [Number.isFinite(r) ? r : 95, Number.isFinite(g) ? g : 191, Number.isFinite(b) ? b : 122];
}

function normalizeDataProjection(rawProjection: unknown, fallback = 'EPSG:4326'): string {
    const projection = String(rawProjection || '').trim().toUpperCase();
    if (!projection) return fallback;
    if (/^EPSG:\d+$/.test(projection)) return projection;
    if (/^\d+$/.test(projection)) return `EPSG:${projection}`;
    return fallback;
}

function pickLabelField(source: VectorSource, explicitField: unknown): string | null {
    if (typeof explicitField === 'string' && explicitField.trim()) {
        return explicitField.trim();
    }

    const features = source.getFeatures();
    if (!features.length) return null;

    for (const fieldName of LABEL_FIELD_CANDIDATES) {
        const hasValue = features.some((feature) => {
            const value = feature?.get?.(fieldName);
            return value !== null && value !== undefined && String(value).trim();
        });
        if (hasValue) return fieldName;
    }

    const props = features[0]?.getProperties?.();
    if (!props || typeof props !== 'object') return null;

    const fallback = Object.keys(props).find((key) => {
        if (key === 'geometry' || key === 'style' || key.startsWith('_')) return false;
        const value = (props as Record<string, unknown>)[key];
        return value !== null && value !== undefined && String(value).trim();
    });

    return fallback || null;
}

function shouldAutoLabel(layer: LayerRecord): boolean {
    const meta = (layer.meta || {}) as Record<string, unknown>;
    if (typeof meta.autoLabel === 'boolean') {
        return meta.autoLabel;
    }

    const sourceType = String(meta.sourceType || meta.source || '').toLowerCase();
    return sourceType === 'upload' || sourceType === 'search' || sourceType === 'draw';
}

function createVectorStyleFunction(layer: LayerRecord, source: VectorSource): (feature: any) => Style {
    const styleConfig = layer.style || {};
    const [r, g, b] = parseHexToRgb(String(styleConfig.fillColor || '#5fbf7a'));
    const fillOpacity = Number.isFinite(Number(styleConfig.fillOpacity)) ? Number(styleConfig.fillOpacity) : 0.2;

    const fill = new Fill({ color: `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, fillOpacity))})` });
    const stroke = new Stroke({
        color: String(styleConfig.strokeColor || '#2f7d3c'),
        width: Math.max(0.5, Number(styleConfig.strokeWidth || 2))
    });
    const image = new CircleStyle({
        radius: Math.max(2, Number(styleConfig.pointRadius || 6)),
        fill: new Fill({ color: String(styleConfig.fillColor || '#5fbf7a') }),
        stroke: new Stroke({ color: String(styleConfig.strokeColor || '#2f7d3c'), width: 1.5 })
    });

    const plainStyle = new Style({ fill, stroke, image });
    const labelEnabled = shouldAutoLabel(layer);
    const labelField = labelEnabled ? pickLabelField(source, (layer.meta as any)?.labelField) : null;
    const styleCache = new globalThis.Map<string, Style>();

    return (feature: any) => {
        if (!labelField) return plainStyle;

        const value = feature?.get?.(labelField);
        const labelText = value === null || value === undefined ? '' : String(value).trim();
        if (!labelText) return plainStyle;

        const cached = styleCache.get(labelText);
        if (cached) return cached;

        const nextStyle = new Style({
            fill,
            stroke,
            image,
            text: new Text({
                text: labelText,
                font: '600 12px "Segoe UI", "Microsoft YaHei", sans-serif',
                fill: new Fill({ color: '#173f2d' }),
                stroke: new Stroke({ color: 'rgba(255,255,255,0.92)', width: 3 }),
                offsetY: -14,
                overflow: true,
                padding: [2, 4, 2, 4]
            })
        });

        styleCache.set(labelText, nextStyle);
        return nextStyle;
    };
}

function createVectorSource(layer: LayerRecord): VectorSource {
    if (layer.olSource instanceof VectorSource) {
        return layer.olSource;
    }

    if (Array.isArray(layer.olFeatures) && layer.olFeatures.length) {
        return new VectorSource({ features: layer.olFeatures as any });
    }

    if (isGeoJsonObject(layer.olFeatures)) {
        const dataProjection = normalizeDataProjection((layer.meta as any)?.dataProjection, 'EPSG:4326');
        const geojson = new GeoJSON();
        const features = geojson.readFeatures(layer.olFeatures as any, {
            dataProjection,
            featureProjection: 'EPSG:3857'
        });
        return new VectorSource({ features });
    }

    if ((layer.meta as any)?.format === 'kml' && typeof layer.olFeatures === 'string') {
        const dataProjection = normalizeDataProjection((layer.meta as any)?.dataProjection, 'EPSG:4326');
        const kml = new KML({ extractStyles: false });

        let features = kml.readFeatures(layer.olFeatures, {
            dataProjection,
            featureProjection: 'EPSG:3857'
        });

        if ((!features || !features.length) && /<\s*\/?\s*kml:/i.test(layer.olFeatures)) {
            const normalizedKmlText = String(layer.olFeatures)
                .replace(/<(\/?)(\s*)kml:/gi, '<$1$2')
                .replace(/\s+xmlns:kml\s*=\s*(['"]).*?\1/gi, '');

            features = kml.readFeatures(normalizedKmlText, {
                dataProjection,
                featureProjection: 'EPSG:3857'
            });
        }

        return new VectorSource({ features });
    }

    return new VectorSource();
}

function createRasterSource(layer: LayerRecord): XYZ | OSM | any {
    if (layer.olSource && typeof (layer.olSource as any).getTile === 'function') {
        return layer.olSource as any;
    }

    const sourceUrl = String((layer.olSource as any)?.url || (layer.meta as any)?.url || '').trim();
    if (sourceUrl) {
        return new XYZ({ url: sourceUrl });
    }

    return new OSM();
}

function createRasterLayer(layer: LayerRecord): TileLayer<any> {
    return new TileLayer({ source: createRasterSource(layer) });
}

function buildRenderState(layer: LayerRecord): LayerRenderState {
    return {
        type: layer.type,
        olFeaturesRef: layer.olFeatures,
        olSourceRef: layer.olSource,
        format: String((layer.meta as any)?.format || ''),
        dataProjection: normalizeDataProjection((layer.meta as any)?.dataProjection || '', '')
    };
}

function isSameRenderState(a: LayerRenderState | undefined, b: LayerRenderState): boolean {
    if (!a) return false;
    return a.type === b.type
        && a.olFeaturesRef === b.olFeaturesRef
        && a.olSourceRef === b.olSourceRef
        && a.format === b.format
        && a.dataProjection === b.dataProjection;
}

export class LayerRenderer {
    private readonly map: OlMap;
    private readonly bridge: LayerBridge;
    private readonly layerStore = useLayerStore();
    private readonly olLayerMap = new globalThis.Map<string, BaseLayer>();
    private readonly renderStateMap = new globalThis.Map<string, LayerRenderState>();
    private stopWatch: WatchStopHandle | null = null;

    constructor(map: OlMap, bridge?: LayerBridge) {
        this.map = map;
        this.bridge = bridge || {
            addLayer: (_layerId, layer) => this.map.addLayer(layer),
            removeLayer: (layerId) => {
                const target = this.olLayerMap.get(layerId);
                if (target) this.map.removeLayer(target);
            }
        };

        this.stopWatch = watch(
            () => this.layerStore.layers.map((layer) => ({
                id: layer.id,
                type: layer.type,
                isRequested: layer.isRequested,
                visible: layer.visible,
                opacity: layer.opacity,
                style: layer.style,
                olFeaturesRef: layer.olFeatures,
                olSourceRef: layer.olSource,
                format: String((layer.meta as any)?.format || ''),
                dataProjection: String((layer.meta as any)?.dataProjection || '')
            })),
            () => this.syncLayersFromStore(),
            { immediate: true }
        );
    }

    destroy(): void {
        if (this.stopWatch) {
            this.stopWatch();
            this.stopWatch = null;
        }

        Array.from(this.olLayerMap.keys()).forEach((layerId) => {
            this.bridge.removeLayer(layerId);
        });
        this.olLayerMap.clear();
        this.renderStateMap.clear();
    }

    private syncLayersFromStore(): void {
        const requestedIds = new Set(
            this.layerStore.layers
                .filter((item) => item.isRequested)
                .map((item) => item.id)
        );

        this.layerStore.layers.forEach((layer, index) => {
            if (!layer.isRequested) {
                if (this.olLayerMap.has(layer.id)) {
                    this.bridge.removeLayer(layer.id);
                    this.olLayerMap.delete(layer.id);
                    this.renderStateMap.delete(layer.id);
                }
                return;
            }

            const nextState = buildRenderState(layer);
            let olLayer = this.olLayerMap.get(layer.id);

            if (!olLayer) {
                olLayer = this.createOlLayer(layer);
                this.bridge.addLayer(layer.id, olLayer);
                this.olLayerMap.set(layer.id, olLayer);
                this.renderStateMap.set(layer.id, nextState);
            }

            const currentState = this.renderStateMap.get(layer.id);
            if (!isSameRenderState(currentState, nextState)) {
                this.refreshLayerSource(layer, olLayer);
                this.renderStateMap.set(layer.id, nextState);
            }

            olLayer.setVisible(layer.visible !== false);
            olLayer.setOpacity(Math.max(0, Math.min(1, Number(layer.opacity ?? 1))));
            olLayer.setZIndex(this.layerStore.layers.length - index + 100);

            if (olLayer instanceof VectorLayer) {
                const source = olLayer.getSource() as VectorSource;
                olLayer.setStyle(createVectorStyleFunction(layer, source));
            }
        });

        Array.from(this.olLayerMap.entries()).forEach(([layerId]) => {
            if (requestedIds.has(layerId)) return;
            this.bridge.removeLayer(layerId);
            this.olLayerMap.delete(layerId);
            this.renderStateMap.delete(layerId);
        });
    }

    private refreshLayerSource(layer: LayerRecord, olLayer: BaseLayer): void {
        if (layer.type === 'raster' && olLayer instanceof TileLayer) {
            olLayer.setSource(createRasterSource(layer));
            return;
        }

        if (layer.type !== 'raster' && olLayer instanceof VectorLayer) {
            const source = createVectorSource(layer);
            olLayer.setSource(source);
            olLayer.setStyle(createVectorStyleFunction(layer, source));
        }
    }

    private createOlLayer(layer: LayerRecord): BaseLayer {
        if (layer.type === 'raster') {
            return createRasterLayer(layer);
        }

        const source = createVectorSource(layer);
        return new VectorLayer({
            source,
            style: createVectorStyleFunction(layer, source)
        });
    }
}
