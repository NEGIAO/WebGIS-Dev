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
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { useLayerStore, type LayerRecord } from '../../stores/layerStore';

function isGeoJsonObject(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const type = String((value as any).type || '');
    return type === 'FeatureCollection' || type === 'Feature' || type === 'GeometryCollection';
}

function toVectorStyle(layer: LayerRecord): Style {
    const style = layer.style || {};
    const fillColor = String(style.fillColor || '#5fbf7a').replace('#', '');
    const r = Number.parseInt(fillColor.slice(0, 2) || '95', 16);
    const g = Number.parseInt(fillColor.slice(2, 4) || '191', 16);
    const b = Number.parseInt(fillColor.slice(4, 6) || '122', 16);
    const fillOpacity = Number.isFinite(Number(style.fillOpacity)) ? Number(style.fillOpacity) : 0.2;

    return new Style({
        fill: new Fill({ color: `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, fillOpacity))})` }),
        stroke: new Stroke({
            color: String(style.strokeColor || '#2f7d3c'),
            width: Math.max(0.5, Number(style.strokeWidth || 2))
        }),
        image: new CircleStyle({
            radius: Math.max(2, Number(style.pointRadius || 6)),
            fill: new Fill({ color: String(style.fillColor || '#5fbf7a') }),
            stroke: new Stroke({ color: String(style.strokeColor || '#2f7d3c'), width: 1.5 })
        })
    });
}

function createVectorSource(layer: LayerRecord): VectorSource {
    if (layer.olSource instanceof VectorSource) {
        return layer.olSource;
    }

    if (Array.isArray(layer.olFeatures) && layer.olFeatures.length) {
        return new VectorSource({ features: layer.olFeatures as any });
    }

    if (isGeoJsonObject(layer.olFeatures)) {
        const geojson = new GeoJSON();
        const features = geojson.readFeatures(layer.olFeatures as any, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
        });
        return new VectorSource({ features });
    }

    if ((layer.meta as any)?.format === 'kml' && typeof layer.olFeatures === 'string') {
        const kml = new KML({ extractStyles: true });
        const features = kml.readFeatures(layer.olFeatures, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
        });
        return new VectorSource({ features });
    }

    return new VectorSource();
}

function createRasterLayer(layer: LayerRecord): TileLayer<any> {
    if (layer.olSource && typeof (layer.olSource as any).getTile === 'function') {
        return new TileLayer({ source: layer.olSource as any });
    }

    const sourceUrl = String((layer.olSource as any)?.url || (layer.meta as any)?.url || '').trim();
    if (sourceUrl) {
        return new TileLayer({ source: new XYZ({ url: sourceUrl }) });
    }

    return new TileLayer({ source: new OSM() });
}

export class LayerRenderer {
    private readonly map: OlMap;
    private readonly layerStore = useLayerStore();
    private readonly olLayerMap = new globalThis.Map<string, BaseLayer>();
    private stopWatch: WatchStopHandle | null = null;

    constructor(map: OlMap) {
        this.map = map;

        this.stopWatch = watch(
            () => this.layerStore.layers,
            () => this.syncLayersFromStore(),
            { deep: true, immediate: true }
        );
    }

    destroy(): void {
        if (this.stopWatch) {
            this.stopWatch();
            this.stopWatch = null;
        }

        Array.from(this.olLayerMap.values()).forEach((layer) => {
            this.map.removeLayer(layer);
        });
        this.olLayerMap.clear();
    }

    private syncLayersFromStore(): void {
        const idsInStore = new Set(this.layerStore.layers.map((item) => item.id));

        for (const layer of this.layerStore.layers) {
            let olLayer = this.olLayerMap.get(layer.id);

            if (!olLayer) {
                olLayer = this.createOlLayer(layer);
                this.map.addLayer(olLayer);
                this.olLayerMap.set(layer.id, olLayer);
            }

            olLayer.setVisible(layer.visible !== false);
            olLayer.setOpacity(Math.max(0, Math.min(1, Number(layer.opacity ?? 1))));
            olLayer.setZIndex(this.layerStore.layers.length - this.layerStore.layers.indexOf(layer));

            if (olLayer instanceof VectorLayer) {
                olLayer.setStyle(toVectorStyle(layer));
            }
        }

        Array.from(this.olLayerMap.entries()).forEach(([layerId, olLayer]) => {
            if (idsInStore.has(layerId)) return;
            this.map.removeLayer(olLayer);
            this.olLayerMap.delete(layerId);
        });
    }

    private createOlLayer(layer: LayerRecord): BaseLayer {
        if (layer.type === 'raster') {
            return createRasterLayer(layer);
        }

        return new VectorLayer({
            source: createVectorSource(layer),
            style: toVectorStyle(layer)
        });
    }
}
