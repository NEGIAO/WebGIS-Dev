/**
 * ExtentPicker.ts — 地图范围框选组件逻辑层
 *
 * 采用视图层（ExtentPicker.vue）与逻辑层（ExtentPicker.ts）分离范式。
 * 完全自包含的框选组件，内置 DragBox 交互、红色预览、蓝色覆盖层。
 * 通过 provide('olMap') 自动获取地图实例，无需传入 props。
 */
import {
    defineComponent,
    inject,
    onUnmounted,
    ref,
    type ExtractPropTypes,
    type Ref,
    type SetupContext,
} from 'vue';
import type OlMap from 'ol/Map';
import type Geometry from 'ol/geom/Geometry';
import { toLonLat } from 'ol/proj';
import DragBox from 'ol/interaction/DragBox';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import { Fill, Stroke, Style } from 'ol/style';
import { Crosshair, Eraser, Eye } from '@lucide/vue';
import { formatCoordinateValue } from '@common/map-view/coordinateFormatter';
import { useLocale } from '@common/app/useLocale';

type ExtentChangePayload = {
    extent: [number, number, number, number];
    crs: 'EPSG:4326';
};

type EmitsType = {
    'extent-change': [payload: ExtentChangePayload];
    'extent-clear': [];
};

const propDefine = {
    /** 框选完成后是否保留蓝色覆盖层（默认 true，所有场景都显示） */
    showOverlay: {
        type: Boolean,
        default: true,
    },
    /** 按钮禁用状态 */
    disabled: {
        type: Boolean,
        default: false,
    },
} as const;

export type ExtentPickerProps = ExtractPropTypes<typeof propDefine>;

export default defineComponent({
    name: 'ExtentPicker',
    components: {
        Crosshair,
        Eraser,
        Eye,
    },
    props: propDefine,
    emits: ['extent-change', 'extent-clear'],
    setup(props, ctx) {
        return new Instance(props, ctx);
    },
});

export class Instance {
    public t: (key: string, params?: Record<string, any>) => string;

    // ========== 内部状态 ==========
    public picking = ref(false);
    public hasExtent = ref(false);
    public extentLabel = ref('');
    private currentExtent: [number, number, number, number] | null = null;

    // ========== 注入地图实例 ==========
    private olMapRef: Ref<any> | null = inject<Ref<any> | null>('olMap', null);

    // ========== OL 交互实例（非响应式） ==========
    private dragBoxInteraction: DragBox | null = null;
    private previewLayer: VectorLayer<VectorSource> | null = null;
    private previewSource: VectorSource | null = null;
    private overlayLayer: VectorLayer<VectorSource> | null = null;
    private overlaySource: VectorSource | null = null;

    // ========== 样式常量（懒加载） ==========
    private PREVIEW_STYLE: Style | null = null;
    private OVERLAY_STYLE: Style | null = null;

    constructor(
        private props: ExtentPickerProps,
        private ctx: SetupContext<EmitsType>,
    ) {
        const { t } = useLocale();
        this.t = t;

        // ========== 生命周期清理 ==========
        onUnmounted(() => {
            this.cleanupInteraction();
            this.clearOverlayLayer();
            this.currentExtent = null;
        });
    }

    public get disabled() {
        return this.props.disabled;
    }

    /**
     * 获取 OpenLayers Map 实例
     *
     * Provide/Inject 链路：
     * - HomeView: provide('olMap', computed(() => mapContainerRef.value?.mapInstance))
     * - MapContainer: mapInstance = shallowRef(null)
     *
     * 因此需要解包两层：
     * 1. olMapRef.value → computed 的值（shallowRef）
     * 2. val.value → Map 实例
     */
    private getMap(): OlMap | null {
        const val = this.olMapRef?.value;
        // val 可能是 shallowRef（需要 .value）或直接是 Map 实例
        return (val?.value ?? val ?? null) as OlMap | null;
    }

    /** 获取红色预览样式（拖拽过程中） */
    private getPreviewStyle(): Style {
        if (!this.PREVIEW_STYLE) {
            this.PREVIEW_STYLE = new Style({
                stroke: new Stroke({ color: '#e74c3c', width: 2, lineDash: [6, 4] }),
                fill: new Fill({ color: 'rgba(231, 76, 60, 0.12)' }),
            });
        }
        return this.PREVIEW_STYLE;
    }

    /** 获取蓝色完成样式（框选完成后） */
    private getOverlayStyle(): Style {
        if (!this.OVERLAY_STYLE) {
            this.OVERLAY_STYLE = new Style({
                stroke: new Stroke({ color: '#0e77b8', width: 2, lineDash: [8, 4] }),
                fill: new Fill({ color: 'rgba(145, 192, 209, 0.15)' }),
            });
        }
        return this.OVERLAY_STYLE;
    }

    // ========== 预览图层管理 ==========

    private ensurePreviewLayer(): void {
        const map = this.getMap();
        if (!map || this.previewLayer) return;
        this.previewSource = new VectorSource();
        this.previewLayer = new VectorLayer({
            source: this.previewSource,
            style: this.getPreviewStyle(),
            zIndex: 99999,
        });
        map.addLayer(this.previewLayer);
    }

    private removePreviewLayer(): void {
        const map = this.getMap();
        if (this.previewLayer && map) map.removeLayer(this.previewLayer);
        this.previewLayer = null;
        this.previewSource = null;
    }

    private updatePreview(geometry: Geometry | null): void {
        if (!this.previewSource) return;
        this.previewSource.clear();
        if (geometry) this.previewSource.addFeature(new Feature({ geometry }));
    }

    // ========== 持久化覆盖层管理 ==========

    private showExtentOverlay(geometry: Geometry | null): void {
        this.clearOverlayLayer();
        const map = this.getMap();
        if (!map || !geometry) return;
        this.overlaySource = new VectorSource();
        this.overlaySource.addFeature(new Feature({ geometry }));
        this.overlayLayer = new VectorLayer({
            source: this.overlaySource,
            style: this.getOverlayStyle(),
            zIndex: 9999,
        });
        map.addLayer(this.overlayLayer);
    }

    private clearOverlayLayer(): void {
        const map = this.getMap();
        if (this.overlayLayer && map) map.removeLayer(this.overlayLayer);
        this.overlayLayer = null;
        this.overlaySource = null;
    }

    // ========== 框选交互 ==========

    private cleanupInteraction(): void {
        const map = this.getMap();
        if (this.dragBoxInteraction && map) map.removeInteraction(this.dragBoxInteraction);
        this.dragBoxInteraction = null;
        this.removePreviewLayer();
        this.picking.value = false;
    }

    /** 开始拖拽框选 */
    public startPick = (): void => {
        const map = this.getMap();
        if (!map) return;

        // 清除上一次的交互和覆盖层
        this.cleanupInteraction();
        this.clearOverlayLayer();

        this.picking.value = true;
        this.dragBoxInteraction = new DragBox({ condition: () => true });
        map.addInteraction(this.dragBoxInteraction);

        // 拖拽中：红色预览
        this.dragBoxInteraction.on('boxdrag', () => {
            const geom = this.dragBoxInteraction?.getGeometry?.() ?? null;
            if (geom) {
                this.ensurePreviewLayer();
                this.updatePreview(geom);
            }
        });

        // 框选完成
        this.dragBoxInteraction.on('boxend', () => {
            const geom = this.dragBoxInteraction?.getGeometry?.() ?? null;
            const ext = geom?.getExtent?.();

            // 移除交互和预览
            this.cleanupInteraction();

            if (!ext || ext.length < 4) return;

            // 蓝色覆盖层（按需）
            if (this.props.showOverlay && geom) {
                this.showExtentOverlay(geom);
            }

            // 坐标转换 3857 → 4326
            const [minLon, minLat] = toLonLat([ext[0], ext[1]]);
            const [maxLon, maxLat] = toLonLat([ext[2], ext[3]]);
            this.currentExtent = [minLon, minLat, maxLon, maxLat];

            this.hasExtent.value = true;
            this.extentLabel.value = `${formatCoordinateValue(minLon)},${formatCoordinateValue(minLat)} → ${formatCoordinateValue(maxLon)},${formatCoordinateValue(maxLat)}`;

            this.ctx.emit('extent-change', { extent: this.currentExtent, crs: 'EPSG:4326' });
        });
    };

    /** 获取当前地图可视范围 */
    public getMapViewExtent = (): void => {
        const map = this.getMap();
        if (!map) return;

        this.cleanupInteraction();
        this.clearOverlayLayer();

        const view = map.getView();
        const ext = view.calculateExtent(map.getSize());
        const [minLon, minLat] = toLonLat([ext[0], ext[1]]);
        const [maxLon, maxLat] = toLonLat([ext[2], ext[3]]);
        this.currentExtent = [minLon, minLat, maxLon, maxLat];

        this.hasExtent.value = true;
        this.extentLabel.value = `${formatCoordinateValue(minLon)},${formatCoordinateValue(minLat)} → ${formatCoordinateValue(maxLon)},${formatCoordinateValue(maxLat)}`;

        this.ctx.emit('extent-change', { extent: this.currentExtent, crs: 'EPSG:4326' });
    };

    /** 清除选区 */
    public clearExtent = (): void => {
        this.cleanupInteraction();
        this.clearOverlayLayer();
        this.hasExtent.value = false;
        this.extentLabel.value = '';
        this.currentExtent = null;
        this.ctx.emit('extent-clear');
    };
}
