/**
 * CesiumDrawMeasurePanel.ts — 3D 绘制 / 测量面板逻辑层
 *
 * 采用视图层（CesiumDrawMeasurePanel.vue）与逻辑层（CesiumDrawMeasurePanel.ts）分离范式。
 * 单一职责：渲染 + 收集用户意图。所有场景动作通过 emit 上抛，
 * 由 HomeView 统一按引擎路由到 CesiumContainer（迁移方案 §2.1 引擎裁决单点）。
 * 测量开关与样式直接写 store（纯数据，无引擎依赖），由容器 watch 后下推管理器。
 */
import {
    computed,
    defineComponent,
    markRaw,
    type ComputedRef,
    type ExtractPropTypes,
    type SetupContext,
} from 'vue';
import { storeToRefs } from 'pinia';
import {
    Ban,
    Circle,
    CircleDot,
    Compass,
    Copy,
    Download,
    Eraser,
    Info,
    Maximize,
    PenLine,
    Pentagon,
    Play,
    Ruler,
    Square,
    SquareDashedBottom,
    TriangleRight,
    Undo2,
    X,
} from '@lucide/vue';
import { useLocale } from '@common/app/useLocale';
import { useMessage } from '@common/shell/useMessage';
import { formatAreaMeasure, formatDistanceMeasure } from '@common/map-view/units';
import {
    useDrawMeasureStore,
    type DrawMeasureOptions,
    type DrawStyleParams,
} from '@cesium-domain/stores/useDrawMeasureStore';
import { copyTextToClipboard, downloadTextFile } from '@cesium-domain/utils/browserIo';

interface ToolItem {
    type: string;
    icon: ReturnType<typeof markRaw>;
}

interface ResultRow {
    label: string;
    value: string;
    accent?: boolean;
}

const DRAW_TOOLS: ToolItem[] = [
    { type: 'Point', icon: markRaw(CircleDot) },
    { type: 'LineString', icon: markRaw(PenLine) },
    { type: 'Polygon', icon: markRaw(Pentagon) },
    { type: 'Rectangle', icon: markRaw(Square) },
    { type: 'Circle', icon: markRaw(Circle) },
];

const MEASURE_TOOLS: ToolItem[] = [
    { type: 'MeasureDistance', icon: markRaw(Ruler) },
    { type: 'MeasureArea', icon: markRaw(SquareDashedBottom) },
    { type: 'MeasureHeight', icon: markRaw(TriangleRight) },
    { type: 'MeasureAzimuth', icon: markRaw(Compass) },
];

type EmitsType = {
    close: [];
    action: [actionName: string];
    activate: [type: string];
};

const propDefine = {
    /** 面板形态：draw = 绘制工具，measure = 测量工具 */
    variant: {
        type: String,
        default: 'measure',
    },
} as const;

export type CesiumDrawMeasurePanelProps = ExtractPropTypes<typeof propDefine>;

export default defineComponent({
    name: 'CesiumDrawMeasurePanel',
    components: {
        Ban,
        Copy,
        Download,
        Eraser,
        Info,
        Maximize,
        Play,
        Undo2,
        X,
    },
    props: propDefine,
    emits: ['close', 'action', 'activate'],
    setup(props, ctx) {
        return new Instance(props, ctx);
    },
});

export class Instance {
    public t: (key: string, params?: Record<string, any>) => string;
    public measureOptions;
    public style;
    public activeType;
    public drawing;
    public lastResult;
    public records;
    public subOptionsDisabled;

    public tools: ComputedRef<ToolItem[]>;
    public title: ComputedRef<string>;
    public groupLabel: ComputedRef<string>;
    public hint: ComputedRef<string>;
    public rows: ComputedRef<ResultRow[]>;

    private message = useMessage();
    private store = useDrawMeasureStore();

    constructor(
        private props: CesiumDrawMeasurePanelProps,
        private ctx: SetupContext<EmitsType>,
    ) {
        const { t } = useLocale();
        this.t = t;

        const { measureOptions, style, activeType, drawing, lastResult, records, subOptionsDisabled } =
            storeToRefs(this.store);
        this.measureOptions = measureOptions;
        this.style = style;
        this.activeType = activeType;
        this.drawing = drawing;
        this.lastResult = lastResult;
        this.records = records;
        this.subOptionsDisabled = subOptionsDisabled;

        this.tools = computed(() => (this.props.variant === 'draw' ? DRAW_TOOLS : MEASURE_TOOLS));

        this.title = computed(() =>
            this.props.variant === 'draw'
                ? this.t('cesium.drawMeasure.title.draw')
                : this.t('cesium.drawMeasure.title.measure'),
        );

        this.groupLabel = computed(() =>
            this.props.variant === 'draw'
                ? this.t('cesium.drawMeasure.groups.draw')
                : this.t('cesium.drawMeasure.groups.measure'),
        );

        this.hint = computed(() => {
            const type = this.activeType.value;
            if (!type) return this.t('cesium.drawMeasure.hints.default');
            return this.t(`cesium.drawMeasure.hints.${type}`);
        });

        this.rows = computed(() => this.buildResultRows());
    }

    public get variant() {
        return this.props.variant;
    }

    // ────────────────────────── 交互 ──────────────────────────

    public selectTool = (type: string): void => {
        // 再次点击同一工具 = 取消当前交互（与侧栏二次点击收起的既有手感一致）
        if (this.activeType.value === type) {
            this.ctx.emit('action', 'cancel');
            return;
        }
        this.ctx.emit('activate', type);
    };

    public toggleOption = (key: keyof DrawMeasureOptions, event: Event): void => {
        const target = event.target as HTMLInputElement | null;
        this.store.setMeasureOption(key, Boolean(target?.checked));
    };

    public patchStyle = (patch: Partial<DrawStyleParams>): void => {
        this.store.setStyle(patch);
    };

    public onStyleColorInput = (key: 'outlineColor' | 'fillColor', event: Event): void => {
        const target = event.target as HTMLInputElement | null;
        if (!target) return;
        this.patchStyle({ [key]: target.value });
    };

    public onStyleNumberInput = (
        key: 'outlineWidth' | 'fillOpacity' | 'vertexSize',
        event: Event,
    ): void => {
        const target = event.target as HTMLInputElement | null;
        if (!target) return;
        this.patchStyle({ [key]: Number(target.value) });
    };

    public onStyleCheckChange = (key: 'showVertices', event: Event): void => {
        const target = event.target as HTMLInputElement | null;
        if (!target) return;
        this.patchStyle({ [key]: target.checked });
    };

    public clearRecords = (): void => {
        this.store.clearRecords();
    };

    // ────────────────────────── 结果读数 ──────────────────────────

    /**
     * 载荷 → 面板键值行。
     * 口径与场景标注一致：measure 为总开关，showArea 管面积，showPerimeter 管周长/长度/距离/角度。
     */
    private buildResultRows(): ResultRow[] {
        const r = this.lastResult.value;
        if (!r) return [];

        const onArea = this.measureOptions.value.measure && this.measureOptions.value.showArea;
        const onLength =
            this.measureOptions.value.measure && this.measureOptions.value.showPerimeter;
        const out: ResultRow[] = [];

        const coord = (p?: [number, number] | null) =>
            p ? `${p[0].toFixed(6)}, ${p[1].toFixed(6)}` : '—';
        const pushArea = (value: number | null, label: string) => {
            if (!onArea || typeof value !== 'number' || !Number.isFinite(value)) return;
            out.push({ label, value: formatAreaMeasure(value), accent: true });
        };
        const pushLength = (value: number | null, label: string, accent = false) => {
            if (!onLength || typeof value !== 'number' || !Number.isFinite(value)) return;
            out.push({ label, value: formatDistanceMeasure(value), accent });
        };

        const K = (key: string) => this.t(`cesium.drawMeasure.result.${key}`);

        switch (r.type) {
            case 'Point':
                out.push({ label: K('position'), value: coord(r.lonLats[0]) });
                break;

            case 'LineString':
            case 'MeasureDistance':
                out.push({ label: K('pointCount'), value: `${r.lonLats.length}` });
                pushLength(r.length, K('length'), true);
                out.push({ label: K('start'), value: coord(r.lonLats[0]) });
                out.push({ label: K('end'), value: coord(r.lonLats[r.lonLats.length - 1]) });
                break;

            case 'Polygon':
            case 'MeasureArea':
                out.push({ label: K('vertexCount'), value: `${r.lonLats.length}` });
                pushArea(r.area, K('area'));
                pushLength(r.perimeter, K('perimeter'));
                out.push({ label: K('first'), value: coord(r.lonLats[0]) });
                break;

            case 'Rectangle':
                pushLength(r.width, K('spanEW'));
                pushLength(r.height, K('spanNS'));
                pushArea(r.area, K('area'));
                pushLength(r.perimeter, K('perimeter'));
                if (r.rectangle) {
                    out.push({
                        label: K('southWest'),
                        value: coord([r.rectangle.west, r.rectangle.south]),
                    });
                    out.push({
                        label: K('northEast'),
                        value: coord([r.rectangle.east, r.rectangle.north]),
                    });
                }
                break;

            case 'Circle':
                out.push({ label: K('center'), value: coord(r.center) });
                pushLength(r.radius, K('radius'), true);
                pushArea(r.area, K('area'));
                pushLength(r.perimeter, K('perimeter'));
                break;

            case 'MeasureHeight':
                pushLength(r.verticalDistance, K('vertical'), true);
                pushLength(r.horizontalDistance, K('horizontal'), true);
                pushLength(r.slopeDistance, K('slope'));
                if (r.heights) {
                    out.push({
                        label: K('heightStart'),
                        value: formatDistanceMeasure(r.heights[0]),
                    });
                    out.push({
                        label: K('heightEnd'),
                        value: formatDistanceMeasure(r.heights[1]),
                    });
                }
                out.push({ label: K('start'), value: coord(r.lonLats[0]) });
                out.push({ label: K('end'), value: coord(r.lonLats[1]) });
                break;

            case 'MeasureAzimuth':
                if (onLength && typeof r.azimuth === 'number' && Number.isFinite(r.azimuth)) {
                    out.push({
                        label: K('azimuth'),
                        value: `${r.azimuth.toFixed(2)}°`,
                        accent: true,
                    });
                }
                pushLength(r.distance, K('horizontal'));
                out.push({ label: K('start'), value: coord(r.lonLats[0]) });
                out.push({ label: K('end'), value: coord(r.lonLats[1]) });
                break;

            default:
                break;
        }

        return out;
    }

    // ────────────────────────── 导出 / 复制 ──────────────────────────

    /** 组装 GeoJSON Feature（圆按绘制时的 64 边形环导出） */
    private buildFeature() {
        const r = this.lastResult.value;
        if (!r) return null;

        const properties: Record<string, any> = {
            id: r.id,
            name: r.name,
            drawType: r.type,
        };
        if (typeof r.area === 'number' && Number.isFinite(r.area)) {
            properties.area_m2 = Number(r.area.toFixed(2));
        }
        if (typeof r.perimeter === 'number' && Number.isFinite(r.perimeter)) {
            properties.perimeter_m = Number(r.perimeter.toFixed(2));
        }
        if (typeof r.length === 'number' && Number.isFinite(r.length)) {
            properties.length_m = Number(r.length.toFixed(2));
        }
        if (typeof r.radius === 'number' && Number.isFinite(r.radius)) {
            properties.radius_m = Number(r.radius.toFixed(2));
        }
        if (typeof r.azimuth === 'number' && Number.isFinite(r.azimuth)) {
            properties.azimuth_deg = Number(r.azimuth.toFixed(2));
        }
        if (typeof r.verticalDistance === 'number' && Number.isFinite(r.verticalDistance)) {
            properties.vertical_m = Number(r.verticalDistance.toFixed(2));
        }
        if (typeof r.horizontalDistance === 'number' && Number.isFinite(r.horizontalDistance)) {
            properties.horizontal_m = Number(r.horizontalDistance.toFixed(2));
        }

        const ring = r.lonLats.map((p) => [p[0], p[1]]);
        let geometry: Record<string, any>;

        if (r.type === 'Point') {
            geometry = { type: 'Point', coordinates: ring[0] };
        } else if (
            r.type === 'LineString' ||
            r.type === 'MeasureDistance' ||
            r.type === 'MeasureHeight' ||
            r.type === 'MeasureAzimuth'
        ) {
            geometry = { type: 'LineString', coordinates: ring };
        } else {
            // 面类：补闭合点
            const first = ring[0];
            const last = ring[ring.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
            geometry = { type: 'Polygon', coordinates: [ring] };
        }

        return { type: 'Feature', properties, geometry };
    }

    /**
     * 导出 GeoJSON。剪贴与落盘兜底逻辑统一走 utils/browserIo
     * （与 TOC 右键「导出坐标」同一实现，避免两套各写一份）。
     */
    public exportGeoJson = (): void => {
        const feature = this.buildFeature();
        if (!feature) return;
        const filename = `${feature.properties.id}-${feature.properties.drawType}.geojson`;
        downloadTextFile(JSON.stringify(feature, null, 2), filename, 'application/geo+json');
        this.message.success(this.t('cesium.exported', { name: filename }));
    };

    /**
     * 复制坐标。非安全上下文（http / 内网 IP）的兜底在 browserIo 内处理，
     * 此处只关心结果反馈（Force_command §2-8：不允许静默成功 / 失败）。
     */
    public copyCoords = async (): Promise<void> => {
        const r = this.lastResult.value;
        if (!r) return;
        const text = r.lonLats.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join('\n');
        const ok = await copyTextToClipboard(text);
        if (ok) {
            this.message.success(
                this.t('cesium.drawMeasure.toast.coordsCopied', { count: r.lonLats.length }),
            );
        } else {
            this.message.warning(this.t('cesium.copyCoordinatesFailed'));
        }
    };
}
