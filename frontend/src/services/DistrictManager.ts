import type OlMap from 'ol/Map';
import GeoJSON from 'ol/format/GeoJSON';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Style from 'ol/style/Style';
import Stroke from 'ol/style/Stroke';
import Fill from 'ol/style/Fill';
import Text from 'ol/style/Text';
import { getCenter as getExtentCenter } from 'ol/extent';
import { isEmpty as isExtentEmpty } from 'ol/extent';
import { toLonLat } from 'ol/proj';
import Feature from 'ol/Feature';

import { gcj02ToWgs84 as convertGCJ02ToWGS84 } from '@/utils/geo';
import type { useTOCStore } from '@/stores/useTOCStore';

type TOCStore = ReturnType<typeof useTOCStore>;

type DistrictManagerOptions = {
    map: OlMap;
    tocStore: TOCStore;
    userDataLayers?: any[];
    emitUserLayersChange?: () => void;
    emitGraphicsOverview?: () => void;
    serializeManagedFeatures?: (features: any[], layerName?: string) => any[];
    layerId?: string;
};

type DistrictLoadOptions = {
    adcode: string;
    name?: string;
    fit?: boolean;
};

type DistrictLoadResult = {
    adcode: string;
    name: string;
    featureCount: number;
    extent: number[];
};

const DISTRICT_ENDPOINT_BASE = 'https://geo.datav.aliyun.com/areas_v3/bound';

function normalizeAdcode(rawAdcode: unknown): string {
    return String(rawAdcode || '').trim();
}

function normalizeExtent(rawExtent: unknown): number[] {
    if (!Array.isArray(rawExtent) || rawExtent.length < 4) return [];

    const next = rawExtent
        .slice(0, 4)
        .map((value) => Number(value));

    return next.every((value) => Number.isFinite(value)) ? next : [];
}

function transformCoordinateValue(rawCoordinates: unknown): unknown {
    if (!Array.isArray(rawCoordinates)) return rawCoordinates;

    if (
        rawCoordinates.length >= 2
        && Number.isFinite(rawCoordinates[0])
        && Number.isFinite(rawCoordinates[1])
    ) {
        const [lon, lat] = convertGCJ02ToWGS84(Number(rawCoordinates[0]), Number(rawCoordinates[1]));
        const copy = [...rawCoordinates];
        copy[0] = lon;
        copy[1] = lat;
        return copy;
    }

    return rawCoordinates.map((item) => transformCoordinateValue(item));
}

/**
 * 递归处理 Feature Geometry，确保所有坐标点从 GCJ-02 转换为 WGS84。
 */
function transformGeometry(geometry: any): any {
    if (!geometry || typeof geometry !== 'object') return geometry;

    if (String(geometry.type || '') === 'GeometryCollection') {
        return {
            ...geometry,
            geometries: Array.isArray(geometry.geometries)
                ? geometry.geometries.map((item: any) => transformGeometry(item))
                : []
        };
    }

    if (!('coordinates' in geometry)) return geometry;

    return {
        ...geometry,
        coordinates: transformCoordinateValue(geometry.coordinates)
    };
}

function normalizeBoundaryGeoJSON(payload: any): any {
    const rawFeatures = Array.isArray(payload?.features)
        ? payload.features
        : (payload?.type === 'Feature' ? [payload] : []);

    return {
        type: 'FeatureCollection',
        features: rawFeatures.map((feature: any) => ({
            ...feature,
            geometry: transformGeometry(feature?.geometry)
        }))
    };
}

function resolveFeatureName(feature: Feature): string {
    const candidates = [
        feature.get('name'),
        feature.get('NAME'),
        feature.get('fullname'),
        feature.get('fullName')
    ];

    for (const item of candidates) {
        const text = String(item || '').trim();
        if (text) return text;
    }

    return '';
}

export class DistrictManager {
    private readonly map: OlMap;
    private readonly tocStore: TOCStore;
    private readonly userDataLayers: any[];
    private readonly emitUserLayersChange?: () => void;
    private readonly emitGraphicsOverview?: () => void;
    private readonly serializeManagedFeatures?: (features: any[], layerName?: string) => any[];
    private readonly format: GeoJSON;
    private readonly districtLayers: Map<string, VectorLayer<VectorSource>> = new Map();
    private readonly districtSources: Map<string, VectorSource> = new Map();

    constructor(options: DistrictManagerOptions) {
        this.map = options.map;
        this.tocStore = options.tocStore;
        this.userDataLayers = Array.isArray(options.userDataLayers) ? options.userDataLayers : [];
        this.emitUserLayersChange = options.emitUserLayersChange;
        this.emitGraphicsOverview = options.emitGraphicsOverview;
        this.serializeManagedFeatures = options.serializeManagedFeatures;
        this.format = new GeoJSON();
    }

    private createLayerForDistrict(adcode: string, name: string): { layer: VectorLayer<VectorSource>, source: VectorSource } {
        const layerId = `district_${adcode}`;
        
        // 如果已经存在，直接返回
        if (this.districtLayers.has(layerId)) {
            return {
                layer: this.districtLayers.get(layerId)!,
                source: this.districtSources.get(layerId)!
            };
        }

        const source = new VectorSource();
        const layer = new VectorLayer({
            source,
            zIndex: 1180,
            style: (feature) => {
                const districtName = resolveFeatureName(feature as Feature);
                const boundaryStyle = new Style({
                    stroke: new Stroke({
                        color: 'rgba(33, 188, 255, 0.95)',
                        width: 2.2
                    }),
                    fill: new Fill({
                        color: 'rgba(33, 188, 255, 0.10)'
                    })
                });

                if (!districtName) return boundaryStyle;

                const textStyle = new Style({
                    text: new Text({
                        text: districtName,
                        font: '600 14px "Microsoft YaHei", "PingFang SC", sans-serif',
                        fill: new Fill({ color: '#ffffff' }),
                        stroke: new Stroke({ color: 'rgba(0, 0, 0, 0.72)', width: 3 }),
                        overflow: true,
                    })
                });

                return [boundaryStyle, textStyle];
            }
        });

        layer.set('layerId', layerId);
        layer.set('sourceType', 'district-boundary');
        layer.set('name', name);
        layer.set('adcode', adcode);

        this.map.addLayer(layer);
        this.districtLayers.set(layerId, layer);
        this.districtSources.set(layerId, source);

        return { layer, source };
    }

    private pushLayerMeta(layerId: string, meta: {
        adcode: string;
        name: string;
        sourceUrl: string;
        featureCount: number;
        extent: number[];
        longitude?: number;
        latitude?: number;
        features?: any[];
    }): void {
        const layer = this.districtLayers.get(layerId);
        this.tocStore.upsertLayerMeta({
            id: layerId,
            name: meta.name,
            adcode: meta.adcode,
            sourceType: 'district-boundary',
            sourceUrl: meta.sourceUrl,
            visible: layer?.getVisible() !== false,
            featureCount: Number(meta.featureCount) || 0,
            extent: meta.extent,
            longitude: meta.longitude,
            latitude: meta.latitude,
            features: Array.isArray(meta.features) ? meta.features : [],
            updatedAt: new Date().toISOString(),
            metadata: {
                endpoint: DISTRICT_ENDPOINT_BASE,
                projection: 'WGS84->WebMercator',
                fitApplied: true
            }
        });
    }

    private syncManagedLayerRecord(layerId: string, name: string, features: any[], extent: number[]): void {
        const layer = this.districtLayers.get(layerId);
        if (!layer) return;

        const geometryCenter = Array.isArray(extent) && extent.length >= 4
            ? getExtentCenter(extent as [number, number, number, number])
            : null;
        const [longitude, latitude] = geometryCenter
            ? toLonLat(geometryCenter, this.map.getView().getProjection())
            : [undefined, undefined];

        const serializedFeatures = typeof this.serializeManagedFeatures === 'function'
            ? this.serializeManagedFeatures(features, name)
            : features.map((feature, index) => ({
                type: 'Feature',
                id: String(feature?.getId?.() || `${layerId}_${index + 1}`),
                _gid: String(feature?.getId?.() || `${layerId}_${index + 1}`),
                properties: {
                    ...(typeof feature?.getProperties === 'function' ? feature.getProperties() : {})
                },
                geometry: {
                    type: feature?.getGeometry?.()?.getType?.() || 'Geometry',
                    coordinates: feature?.getGeometry?.()?.getCoordinates?.() || null
                }
            }));

        const existingIndex = this.userDataLayers.findIndex((item) => item?.id === layerId);
        const nextRecord = {
            ...(existingIndex >= 0 ? this.userDataLayers[existingIndex] : {}),
            id: layerId,
            name,
            type: 'geojson',
            sourceType: 'district-boundary',
            order: existingIndex >= 0 ? this.userDataLayers[existingIndex].order : this.userDataLayers.length,
            visible: layer.getVisible() !== false,
            opacity: 1,
            featureCount: features.length,
            features: serializedFeatures,
            autoLabel: true,
            labelVisible: true,
            styleConfig: existingIndex >= 0 ? this.userDataLayers[existingIndex].styleConfig : undefined,
            metadata: {
                ...(existingIndex >= 0 ? this.userDataLayers[existingIndex].metadata || {} : {}),
                category: 'administrative-division',
                adcode: layer.get('adcode') || layerId.replace(/^district_/, ''),
                longitude,
                latitude,
                crs: 'wgs84',
                sourceProjection: 'EPSG:4326'
            },
            layer
        };

        if (existingIndex >= 0) {
            this.userDataLayers.splice(existingIndex, 1, nextRecord);
        } else {
            this.userDataLayers.push(nextRecord);
        }

        this.emitUserLayersChange?.();
        this.emitGraphicsOverview?.();
    }

    private removeManagedLayerRecord(layerId: string): void {
        const index = this.userDataLayers.findIndex((item) => item?.id === layerId);
        if (index < 0) return;
        this.userDataLayers.splice(index, 1);
        this.emitUserLayersChange?.();
        this.emitGraphicsOverview?.();
    }

    async loadBoundary(options: DistrictLoadOptions): Promise<DistrictLoadResult> {
        const adcode = normalizeAdcode(options?.adcode);
        if (!/^\d{6}$/.test(adcode)) {
            throw new Error('行政区 adcode 必须是 6 位数字');
        }

        const layerId = `district_${adcode}`;
        const sourceUrl = `${DISTRICT_ENDPOINT_BASE}/${adcode}.json`;
        const layerName = String(options?.name || `行政区-${adcode}`).trim();

        // 创建或获取图层和数据源
        const { layer, source } = this.createLayerForDistrict(adcode, layerName);

        const response = await fetch(sourceUrl, { 
            method: 'GET',
            referrerPolicy: 'no-referrer' 
        });

        if (!response.ok) {
            throw new Error(`行政区边界请求失败（${response.status}）`);
        }

        const rawGeoJSON = await response.json();
        const normalizedGeoJSON = normalizeBoundaryGeoJSON(rawGeoJSON);

        const features = this.format.readFeatures(normalizedGeoJSON, {
            dataProjection: 'EPSG:4326',
            featureProjection: this.map.getView().getProjection()
        });

        if (!features.length) {
            throw new Error('当前行政区没有可绘制边界要素');
        }

        source.clear();
        source.addFeatures(features);

        const extent = normalizeExtent(source.getExtent());
        const geometryCenter = extent.length === 4
            ? getExtentCenter(extent as [number, number, number, number])
            : null;
        const [longitude, latitude] = geometryCenter
            ? toLonLat(geometryCenter, this.map.getView().getProjection())
            : [undefined, undefined];
        const fitEnabled = options?.fit !== false;

        if (fitEnabled && extent.length === 4 && !isExtentEmpty(extent)) {
            this.map.getView().fit(extent, {
                padding: [72, 72, 72, 72],
                duration: 760,
                maxZoom: 10
            });
        }

        this.pushLayerMeta(layerId, {
            adcode,
            name: layerName,
            sourceUrl,
            featureCount: features.length,
            extent,
            longitude,
            latitude,
            features: typeof this.serializeManagedFeatures === 'function'
                ? this.serializeManagedFeatures(features, layerName)
                : []
        });

        this.syncManagedLayerRecord(layerId, layerName, features, extent);

        return {
            adcode,
            name: layerName,
            featureCount: features.length,
            extent
        };
    }

    setDistrictLayerVisibility(adcode: string, visible: boolean): void {
        const layerId = `district_${adcode}`;
        const layer = this.districtLayers.get(layerId);
        if (layer) {
            layer.setVisible(visible);
            const meta = this.tocStore.getLayerMeta(layerId);
            if (meta) {
                this.tocStore.upsertLayerMeta({
                    ...meta,
                    visible
                });
            }
        }
    }

    removeDistrictLayer(adcode: string): void {
        const layerId = `district_${adcode}`;
        const layer = this.districtLayers.get(layerId);
        const source = this.districtSources.get(layerId);

        if (layer) {
            this.map.removeLayer(layer);
            this.districtLayers.delete(layerId);
        }

        if (source) {
            source.clear();
            this.districtSources.delete(layerId);
        }

        this.tocStore.removeLayerMeta(layerId);
        this.removeManagedLayerRecord(layerId);
    }

    clear(): void {
        Array.from(this.districtLayers.keys()).forEach(layerId => {
            const layer = this.districtLayers.get(layerId);
            if (layer) {
                this.map.removeLayer(layer);
            }
        });

        Array.from(this.districtSources.keys()).forEach(layerId => {
            const source = this.districtSources.get(layerId);
            if (source) {
                source.clear();
            }
        });

        this.districtLayers.clear();
        this.districtSources.clear();

        // 清除所有行政区划元数据
        this.tocStore.layerMetadataList
            .filter(meta => meta.sourceType === 'district-boundary')
            .forEach(meta => this.tocStore.removeLayerMeta(meta.id));
    }

    dispose(): void {
        this.clear();
    }
}
