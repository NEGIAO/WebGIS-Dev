import type Map from 'ol/Map';
import GeoJSON from 'ol/format/GeoJSON';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Style from 'ol/style/Style';
import Stroke from 'ol/style/Stroke';
import Fill from 'ol/style/Fill';
import Text from 'ol/style/Text';
import { isEmpty as isExtentEmpty } from 'ol/extent';
import Feature from 'ol/Feature';

import { gcj02ToWgs84 as convertGCJ02ToWGS84 } from '@/utils/geo';
import type { useTOCStore } from '@/stores/useTOCStore';

type TOCStore = ReturnType<typeof useTOCStore>;

type DistrictManagerOptions = {
    map: Map;
    tocStore: TOCStore;
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
    private readonly map: Map;
    private readonly tocStore: TOCStore;
    private readonly layerId: string;
    private readonly format: GeoJSON;

    private layer: VectorLayer<VectorSource> | null = null;
    private source: VectorSource | null = null;

    constructor(options: DistrictManagerOptions) {
        this.map = options.map;
        this.tocStore = options.tocStore;
        this.layerId = String(options.layerId || 'district_boundary_layer').trim() || 'district_boundary_layer';
        this.format = new GeoJSON();
    }

    private ensureLayer(): void {
        if (this.layer && this.source) return;

        this.source = new VectorSource();

        this.layer = new VectorLayer({
            source: this.source,
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

        this.layer.set('layerId', this.layerId);
        this.layer.set('sourceType', 'district-boundary');
        this.layer.set('name', '行政区边界');
        this.map.addLayer(this.layer);
    }

    private pushLayerMeta(meta: {
        adcode: string;
        name: string;
        sourceUrl: string;
        featureCount: number;
        extent: number[];
    }): void {
        this.tocStore.upsertLayerMeta({
            id: this.layerId,
            name: meta.name,
            adcode: meta.adcode,
            sourceType: 'district-boundary',
            sourceUrl: meta.sourceUrl,
            visible: this.layer?.getVisible() !== false,
            featureCount: Number(meta.featureCount) || 0,
            extent: meta.extent,
            updatedAt: new Date().toISOString(),
            metadata: {
                endpoint: DISTRICT_ENDPOINT_BASE,
                projection: 'WGS84->WebMercator',
                fitApplied: true
            }
        });
    }

    async loadBoundary(options: DistrictLoadOptions): Promise<DistrictLoadResult> {
        const adcode = normalizeAdcode(options?.adcode);
        if (!/^\d{6}$/.test(adcode)) {
            throw new Error('行政区 adcode 必须是 6 位数字');
        }

        const sourceUrl = `${DISTRICT_ENDPOINT_BASE}/${adcode}.json`;
        const response = await fetch(sourceUrl, { method: 'GET' });
        if (!response.ok) {
            throw new Error(`行政区边界请求失败（${response.status}）`);
        }

        const rawGeoJSON = await response.json();
        const normalizedGeoJSON = normalizeBoundaryGeoJSON(rawGeoJSON);

        this.ensureLayer();
        if (!this.source) {
            throw new Error('行政区图层初始化失败');
        }

        const features = this.format.readFeatures(normalizedGeoJSON, {
            dataProjection: 'EPSG:4326',
            featureProjection: this.map.getView().getProjection()
        });

        if (!features.length) {
            throw new Error('当前行政区没有可绘制边界要素');
        }

        this.source.clear();
        this.source.addFeatures(features);

        const extent = normalizeExtent(this.source.getExtent());
        const fitEnabled = options?.fit !== false;

        if (fitEnabled && extent.length === 4 && !isExtentEmpty(extent)) {
            this.map.getView().fit(extent, {
                padding: [72, 72, 72, 72],
                duration: 760,
                maxZoom: 10
            });
        }

        const layerName = String(options?.name || resolveFeatureName(features[0]) || `行政区-${adcode}`).trim();
        this.layer?.set('name', layerName);

        this.pushLayerMeta({
            adcode,
            name: layerName,
            sourceUrl,
            featureCount: features.length,
            extent
        });

        return {
            adcode,
            name: layerName,
            featureCount: features.length,
            extent
        };
    }

    clear(): void {
        this.source?.clear();
        this.tocStore.removeLayerMeta(this.layerId);
    }

    dispose(): void {
        this.clear();

        if (this.layer) {
            this.map.removeLayer(this.layer);
        }

        this.layer = null;
        this.source = null;
    }
}
