import { watch, type WatchStopHandle } from 'vue';
import type OlMap from 'ol/Map';
import type { EventsKey } from 'ol/events';
import { unByKey } from 'ol/Observable';
import Draw from 'ol/interaction/Draw';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Fill, Stroke, Style, Circle as CircleStyle } from 'ol/style';
import { toLonLat } from 'ol/proj';
import { getLength, getArea } from 'ol/sphere';
import type LineString from 'ol/geom/LineString';
import type Polygon from 'ol/geom/Polygon';
import { useToolStore } from '../../stores/toolStore';
import { useLayerStore } from '../../stores/layerStore';

const drawPreviewStyle = new Style({
    fill: new Fill({ color: 'rgba(16, 185, 129, 0.2)' }),
    stroke: new Stroke({ color: '#059669', width: 2 }),
    image: new CircleStyle({
        radius: 5,
        fill: new Fill({ color: '#10b981' }),
        stroke: new Stroke({ color: '#047857', width: 1.5 })
    })
});

export class DrawController {
    private readonly map: OlMap;
    private readonly toolStore = useToolStore();
    private readonly layerStore = useLayerStore();

    private readonly drawSource = new VectorSource();
    private readonly drawLayer = new VectorLayer({
        source: this.drawSource,
        style: drawPreviewStyle,
        zIndex: 1500
    });

    private activeInteraction: Draw | null = null;
    private singleClickKey: EventsKey | null = null;
    private stopWatch: WatchStopHandle | null = null;

    constructor(map: OlMap) {
        this.map = map;
        this.map.addLayer(this.drawLayer);

        this.stopWatch = watch(
            () => this.toolStore.currentTool,
            (tool) => this.applyTool(tool),
            { immediate: true }
        );
    }

    destroy(): void {
        if (this.stopWatch) {
            this.stopWatch();
            this.stopWatch = null;
        }

        this.clearCurrentInteraction();

        if (this.singleClickKey) {
            unByKey(this.singleClickKey);
            this.singleClickKey = null;
        }

        this.drawSource.clear();
        this.map.removeLayer(this.drawLayer);
    }

    private applyTool(tool: string): void {
        this.clearCurrentInteraction();

        if (tool === 'pick-point') {
            this.bindPickPointClick();
            return;
        }

        if (tool === 'draw-polygon') {
            this.bindPolygonDraw();
            return;
        }

        if (tool === 'measure-length') {
            this.bindLengthMeasure();
            return;
        }

        if (tool === 'measure-area') {
            this.bindAreaMeasure();
        }
    }

    private clearCurrentInteraction(): void {
        if (this.activeInteraction) {
            this.map.removeInteraction(this.activeInteraction);
            this.activeInteraction = null;
        }

        if (this.singleClickKey) {
            unByKey(this.singleClickKey);
            this.singleClickKey = null;
        }

        this.drawSource.clear();
    }

    private bindPickPointClick(): void {
        this.singleClickKey = this.map.once('singleclick', (evt) => {
            const [lng, lat] = toLonLat(evt.coordinate);
            this.toolStore.resolvePickPoint({ lng, lat });
        });
    }

    private bindPolygonDraw(): void {
        const draw = new Draw({
            source: this.drawSource,
            type: 'Polygon'
        });

        draw.on('drawend', (evt) => {
            const feature = evt.feature;
            this.layerStore.addLayer({
                id: `draw_polygon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                name: `绘制面 ${new Date().toLocaleTimeString()}`,
                type: 'vector',
                visible: true,
                opacity: 1,
                olFeatures: [feature.clone()],
                style: {
                    strokeColor: '#0f766e',
                    strokeWidth: 2,
                    fillColor: '#14b8a6',
                    fillOpacity: 0.25,
                    pointRadius: 5
                },
                meta: { source: 'draw-controller', geometry: 'polygon' }
            });

            this.toolStore.setTool('none');
        });

        this.activeInteraction = draw;
        this.map.addInteraction(draw);
    }

    private bindLengthMeasure(): void {
        const draw = new Draw({
            source: this.drawSource,
            type: 'LineString'
        });

        draw.on('drawend', (evt) => {
            const geom = evt.feature.getGeometry() as LineString | null;
            if (geom) {
                const meters = getLength(geom, { projection: this.map.getView().getProjection() });
                const text = meters >= 1000
                    ? `测距结果: ${(meters / 1000).toFixed(2)} km`
                    : `测距结果: ${meters.toFixed(1)} m`;
                this.toolStore.setLastMeasure(text);
            }
            this.toolStore.setTool('none');
        });

        this.activeInteraction = draw;
        this.map.addInteraction(draw);
    }

    private bindAreaMeasure(): void {
        const draw = new Draw({
            source: this.drawSource,
            type: 'Polygon'
        });

        draw.on('drawend', (evt) => {
            const geom = evt.feature.getGeometry() as Polygon | null;
            if (geom) {
                const area = getArea(geom, { projection: this.map.getView().getProjection() });
                const text = area >= 1_000_000
                    ? `测面结果: ${(area / 1_000_000).toFixed(2)} km2`
                    : `测面结果: ${area.toFixed(1)} m2`;
                this.toolStore.setLastMeasure(text);
            }
            this.toolStore.setTool('none');
        });

        this.activeInteraction = draw;
        this.map.addInteraction(draw);
    }
}
