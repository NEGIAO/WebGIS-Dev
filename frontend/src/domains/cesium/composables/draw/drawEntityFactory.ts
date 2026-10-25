/**
 * drawEntityFactory.ts — 绘制成品与测量标注的实体构建器
 *
 * 单一职责：把「已算好的载荷 payload + 样式」翻译成 Cesium 实体，不含交互状态与事件。
 * 所有几何数值由 `utils/drawGeometry.ts` 与管理器提供，本文件只负责「画出来」。
 *
 * 贴地策略（与 Demo 对齐）：
 *   - 面类（Polygon / Rectangle / Circle）：classificationType = TERRAIN 让面贴合地形起伏；
 *     地面面图元不支持描边，故另建一条 clampToGround 的闭合折线做边界。
 *   - 折线类：clampToGround = true。
 *   - 测高距：三条线**必须**不贴地（斜边要保持三维直线）。
 *   - 方位角：箭头线贴地（跟随地形），正北参考虚线不贴地（保持水平基准）。
 *
 * 透明度回放：返回 styled 描述表 `{ entity, kind, hexColor, baseAlpha }`，
 * 由管理器按「基色 × 系数」重算材质，避免直接改 Color 造成不可逆失真。
 */

import {
    circleRingLonLats,
    isMeasurable,
    polygonAreaPerimeter,
    polygonCentroid,
    averageLonLat,
    rectangleCorners,
    rectangleMetrics,
    polylineLength,
} from '../../utils/drawGeometry';
import { formatAreaMeasure, formatDistanceMeasure } from '@common/map-view/units';
import { TYPE_META } from './drawMeasureSpec';
import type { DrawStyleParams } from '@cesium-domain/stores/useDrawMeasureStore';

/** 度制矩形边界 */
export interface LonLatBounds {
    west: number;
    south: number;
    east: number;
    north: number;
}

/**
 * 绘制载荷：管理器算出的纯数据（含全部测量值）。
 * 字段随类型而异，未用到的字段缺省；Cesium 对象（Cartesian3）只在 positions / 派生锚点里出现。
 */
export interface DrawPayload {
    type: string;
    /** 世界坐标点序（实体几何的来源） */
    positions: any[];
    /** 经纬度点序（导出 / 标注锚点计算用） */
    lonLats: Array<[number, number]>;
    /** 矩形边界（仅 Rectangle） */
    rectangle?: LonLatBounds;
    /** 圆心（仅 Circle，经纬度） */
    center?: { lonLats: [number, number] };
    /** 测高距三角形（仅 MeasureHeight） */
    triangle?: any;
    /** 方位角锚点（仅 MeasureAzimuth） */
    azimuthAnchor?: any;
    area?: number;
    perimeter?: number;
    length?: number;
    radius?: number;
    width?: number;
    height?: number;
    azimuth?: number;
    distance?: number;
    verticalDistance?: number;
    horizontalDistance?: number;
    slopeDistance?: number;
    heights?: [number, number];
}

/** 样式回放描述项：记录「这条实体用什么基色、基础透明度多少」 */
export interface StyledDescriptor {
    entity: any;
    kind: 'polyline' | 'polygon' | 'rectangle' | 'point';
    hexColor: string;
    baseAlpha: number;
}

/** 成品句柄：管理器持有的运行时句柄（禁止写入 pinia store） */
export interface DrawHandle {
    id: string;
    name: string;
    drawType: string;
    entities: any[];
    styled: StyledDescriptor[];
    vertices: any[];
    labels: any[];
    payload: DrawPayload;
    positions: any[];
}

/** 标注开关 */
export interface MeasureOptions {
    measure: boolean;
    showArea: boolean;
    showPerimeter: boolean;
}

/** 工厂依赖 */
export interface DrawEntityFactoryDeps {
    /** Cesium 命名空间 getter */
    getCesium: () => any;
    /** Viewer getter */
    getViewer: () => any;
    /** 标注前缀解析器 (key) => string，接 i18n */
    getLabel?: (key: string) => string | undefined;
}

/** 标注样式（Cesium LabelGraphics 子集，heightReference 仅在贴地时出现） */
interface LabelStyleOptions {
    text: string;
    font: string;
    fillColor: any;
    showBackground: boolean;
    backgroundColor: any;
    pixelOffset: any;
    backgroundPadding: any;
    style: any;
    horizontalOrigin: any;
    verticalOrigin: any;
    disableDepthTestDistance: number;
    scaleByDistance: any;
    heightReference?: any;
}

/** 测高距三条线的语义配色（不随用户样式改变，否则直角三角形的语义会丢） */
export const HEIGHT_COLORS = Object.freeze({
    slope: '#ffd166',
    vertical: '#ff5d7a',
    horizontal: '#35e0f0',
});

/** 方位角：箭头 + 正北参考线 */
export const AZIMUTH_COLORS = Object.freeze({
    arrow: '#ffd166',
    north: '#9fb6cc',
});

const LABEL_FONT = '600 14px system-ui, "Microsoft YaHei", sans-serif';
const AREA_BG = 'rgba(18, 52, 110, 0.88)';
const LINE_BG = 'rgba(6, 62, 74, 0.88)';

/** 标注文案缺省值（未注入 i18n 解析器时的兜底） */
const DEFAULT_LABELS: Readonly<Record<string, string>> = {
    area: '面积',
    perimeter: '周长',
    length: '长度',
    vertical: '垂直',
    horizontal: '水平',
    azimuth: '方位角',
    radius: '半径',
};

/** 数值兜底：非有限数（undefined / null / NaN）一律取 fallback，避免 NaN 透明度让实体整片消失 */
function finiteOr(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * 创建绘制实体工厂。
 * @param deps 依赖注入（Cesium / Viewer getter + 可选标注解析器）
 */
export function createDrawEntityFactory({ getCesium, getViewer, getLabel }: DrawEntityFactoryDeps) {
    const C = () => getCesium();
    const V = () => getViewer();
    const label = (key: string): string => {
        try {
            const text = getLabel?.(key);
            return text || DEFAULT_LABELS[key] || '';
        } catch {
            return DEFAULT_LABELS[key] || '';
        }
    };

    /** CSS 颜色 + 透明度 → Cesium.Color（非法色值回退到默认蓝） */
    function colorOf(hexColor: string, alpha = 1): any {
        const Cesium = C();
        const a = finiteOr(alpha, 1);
        try {
            return Cesium.Color.fromCssColorString(String(hexColor || '#2e5bff')).withAlpha(a);
        } catch {
            return Cesium.Color.fromCssColorString('#2e5bff').withAlpha(a);
        }
    }

    function add(options: any): any {
        return V().entities.add(options);
    }

    // ────────────────────────── 成品实体 ──────────────────────────

    /**
     * 按类型创建成品实体。
     * @param payload 绘制载荷（含 type / positions / lonLats / 各类测量值）
     * @param style 样式参数（fillColor / fillOpacity / outlineColor / outlineWidth）
     */
    function buildShape(
        payload: DrawPayload,
        style: DrawStyleParams,
    ): { entities: any[]; styled: StyledDescriptor[] } {
        const Cesium = C();
        const entities: any[] = [];
        const styled: StyledDescriptor[] = [];
        const push = (entity: any, kind: StyledDescriptor['kind'], hexColor: string, baseAlpha: number) => {
            entities.push(entity);
            styled.push({ entity, kind, hexColor, baseAlpha });
        };

        const fill = colorOf(style.fillColor, style.fillOpacity);
        const stroke = colorOf(style.outlineColor, 1);
        const width = Math.max(1, Number(style.outlineWidth) || 2);
        const type = payload.type;
        const kind = TYPE_META[type]?.kind;

        if (type === 'Point') {
            push(
                add({
                    position: payload.positions[0],
                    point: {
                        pixelSize: 10,
                        color: colorOf(style.outlineColor, 1),
                        outlineColor: Cesium.Color.WHITE,
                        outlineWidth: 2,
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    },
                }),
                'point',
                style.outlineColor,
                1,
            );
            return { entities, styled };
        }

        if (kind === 'line') {
            push(
                add({
                    polyline: {
                        positions: payload.positions,
                        width,
                        material: stroke,
                        clampToGround: true,
                    },
                }),
                'polyline',
                style.outlineColor,
                1,
            );
            return { entities, styled };
        }

        if (kind === 'area') {
            // 面：贴地面图元（不描边） + 贴地闭合折线描边
            if (type === 'Rectangle' && payload.rectangle) {
                const r = payload.rectangle;
                push(
                    add({
                        rectangle: {
                            coordinates: Cesium.Rectangle.fromDegrees(r.west, r.south, r.east, r.north),
                            material: fill,
                            classificationType: Cesium.ClassificationType.TERRAIN,
                        },
                    }),
                    'rectangle',
                    style.fillColor,
                    finiteOr(style.fillOpacity, 1),
                );
            } else {
                push(
                    add({
                        polygon: {
                            hierarchy: new Cesium.PolygonHierarchy(payload.positions),
                            material: fill,
                            classificationType: Cesium.ClassificationType.TERRAIN,
                        },
                    }),
                    'polygon',
                    style.fillColor,
                    finiteOr(style.fillOpacity, 1),
                );
            }

            const ring = [...payload.positions, payload.positions[0]];
            push(
                add({
                    polyline: {
                        positions: ring,
                        width,
                        material: stroke,
                        clampToGround: true,
                    },
                }),
                'polyline',
                style.outlineColor,
                1,
            );
            return { entities, styled };
        }

        if (type === 'MeasureHeight') {
            const t = payload.triangle;
            if (!t) return { entities, styled };
            // ① 斜边：两点三维直连
            push(
                add({
                    polyline: {
                        positions: [t.a, t.b],
                        clampToGround: false,
                        width,
                        material: colorOf(HEIGHT_COLORS.slope, 1),
                    },
                }),
                'polyline',
                HEIGHT_COLORS.slope,
                1,
            );
            // ② 垂线：低点 → 低点正上方的最高高程
            push(
                add({
                    polyline: {
                        positions: [t.low, t.up],
                        clampToGround: false,
                        width,
                        material: colorOf(HEIGHT_COLORS.vertical, 1),
                    },
                }),
                'polyline',
                HEIGHT_COLORS.vertical,
                1,
            );
            // ③ 水平线：最高高程处，垂线顶端 → 高点
            push(
                add({
                    polyline: {
                        positions: [t.up, t.high],
                        clampToGround: false,
                        width,
                        material: colorOf(HEIGHT_COLORS.horizontal, 1),
                    },
                }),
                'polyline',
                HEIGHT_COLORS.horizontal,
                1,
            );
            return { entities, styled };
        }

        if (type === 'MeasureAzimuth') {
            const g = payload.azimuthAnchor;
            if (!g) return { entities, styled };
            // 箭头线贴地：GroundPolylinePrimitive 支持箭头材质，贴地与箭头可兼得
            push(
                add({
                    polyline: {
                        positions: [g.a, g.b],
                        clampToGround: true,
                        width: Math.max(3, width),
                        material: new Cesium.PolylineArrowMaterialProperty(
                            colorOf(AZIMUTH_COLORS.arrow, 1),
                        ),
                    },
                }),
                'polyline',
                AZIMUTH_COLORS.arrow,
                1,
            );
            // 正北参考虚线：沿同一经线，长度等于水平距离，夹角即真实方位角
            push(
                add({
                    polyline: {
                        positions: [g.a, g.north],
                        clampToGround: false,
                        width: 2,
                        material: new Cesium.PolylineDashMaterialProperty({
                            color: colorOf(AZIMUTH_COLORS.north, 1),
                            dashLength: 16,
                        }),
                    },
                }),
                'polyline',
                AZIMUTH_COLORS.north,
                1,
            );
            return { entities, styled };
        }

        return { entities, styled };
    }

    // ────────────────────────── 顶点标记 ──────────────────────────

    /**
     * 顶点标记实体（受 showVertices / vertexSize 控制）。
     * - 点：图形本身就是点，无需再叠标记
     * - 方位角：终点即箭头尖端，再叠圆点会与标注挤在一起
     * - 圆：环由 64 段折线近似，逐点标记纯属噪点
     */
    function buildVertices(payload: DrawPayload, style: DrawStyleParams): any[] {
        const Cesium = C();
        const type = payload.type;
        if (type === 'Point' || type === 'MeasureAzimuth' || type === 'Circle') return [];

        const positions = Array.isArray(payload.positions) ? payload.positions : [];
        const pixelSize = Math.max(3, Number(style.vertexSize) || 8);
        // 线 / 面类成品本身贴地，顶点也必须贴地：
        // 矩形与圆的位置由 fromDegrees 构造（高程 0），不贴地会沉到地形以下看不见
        const clampToGround = TYPE_META[type]?.kind !== 'height';

        return positions.map((position) =>
            add({
                position,
                show: style.showVertices !== false,
                point: {
                    pixelSize,
                    color: Cesium.Color.CYAN,
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 1,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    ...(clampToGround
                        ? { heightReference: Cesium.HeightReference.CLAMP_TO_GROUND }
                        : {}),
                },
            }),
        );
    }

    // ────────────────────────── 测量标注 ──────────────────────────

    /** 面积类图形的中心锚点：多边形取面积重心，矩形/圆取几何中心 */
    function areaCenter(payload: DrawPayload): any {
        const Cesium = C();
        if (payload.type === 'Rectangle' && payload.rectangle) {
            const r = payload.rectangle;
            return Cesium.Cartesian3.fromDegrees((r.west + r.east) / 2, (r.south + r.north) / 2);
        }
        if (payload.type === 'Circle' && payload.center) {
            return Cesium.Cartesian3.fromDegrees(payload.center.lonLats[0], payload.center.lonLats[1]);
        }
        const centroid = polygonCentroid(payload.lonLats) || averageLonLat(payload.lonLats);
        if (!centroid) return null;
        return Cesium.Cartesian3.fromDegrees(centroid[0], centroid[1]);
    }

    /** 线的末端点（周长 / 长度标注落点） */
    function lastPosition(payload: DrawPayload): any {
        const positions = payload.positions || [];
        if (positions.length) return positions[positions.length - 1];
        const lonLats = payload.lonLats || [];
        if (!lonLats.length) return null;
        const p = lonLats[lonLats.length - 1];
        return C().Cartesian3.fromDegrees(p[0], p[1]);
    }

    /**
     * 标注样式。
     * @param text 标注文本
     * @param opts area=true 蓝底（结果值）/ false 青底（线性标注）；
     *        高距的标注必须 clampToGround=false，否则高程被压平、标注跑到线的一头。
     */
    function labelStyle(
        text: string,
        opts?: { area?: boolean; clampToGround?: boolean; offsetY?: number },
    ): LabelStyleOptions {
        const Cesium = C();
        const o = opts || {};
        const isArea = o.area === true;
        const clampToGround = o.clampToGround !== false;
        const offsetY = o.offsetY === undefined ? (isArea ? 0 : -15) : o.offsetY;

        const style: LabelStyleOptions = {
            text,
            font: LABEL_FONT,
            fillColor: Cesium.Color.WHITE,
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString(isArea ? AREA_BG : LINE_BG),
            pixelOffset: new Cesium.Cartesian2(0, offsetY),
            backgroundPadding: new Cesium.Cartesian2(9, 5),
            style: Cesium.LabelStyle.FILL,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(500, 1.0, 300000, 0.5),
        };
        if (clampToGround) {
            style.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
        }
        return style;
    }

    /**
     * 按测量开关生成标注实体。
     * 口径：measure 为总开关；showArea 管面积；showPerimeter 管周长 / 长度 / 距离 / 角度。
     */
    function buildLabels(payload: DrawPayload, options: MeasureOptions): any[] {
        const opt = options || ({} as MeasureOptions);
        if (!opt.measure) return [];

        const out: any[] = [];
        const addLabel = (position: any, text: string, style?: any) => {
            if (!position) return;
            out.push(add({ position, label: labelStyle(text, style) }));
        };
        const kind = TYPE_META[payload.type]?.kind;

        if (kind === 'area') {
            if (opt.showArea && isMeasurable(payload.area)) {
                addLabel(areaCenter(payload), `${label('area')} ${formatAreaMeasure(payload.area)}`, {
                    area: true,
                });
            }
            if (opt.showPerimeter && isMeasurable(payload.perimeter)) {
                addLabel(
                    lastPosition(payload),
                    `${label('perimeter')} ${formatDistanceMeasure(payload.perimeter)}`,
                );
            }
            return out;
        }

        if (kind === 'line') {
            if (opt.showPerimeter && isMeasurable(payload.length)) {
                addLabel(lastPosition(payload), `${label('length')} ${formatDistanceMeasure(payload.length)}`);
            }
            return out;
        }

        if (kind === 'height' && payload.triangle) {
            if (opt.showPerimeter) {
                addLabel(
                    payload.triangle.verticalMid,
                    `${label('vertical')} ${formatDistanceMeasure(payload.verticalDistance)}`,
                    { clampToGround: false },
                );
                addLabel(
                    payload.triangle.horizontalMid,
                    `${label('horizontal')} ${formatDistanceMeasure(payload.horizontalDistance)}`,
                    { area: true, clampToGround: false },
                );
            }
            return out;
        }

        if (kind === 'azimuth' && payload.azimuthAnchor) {
            if (opt.showPerimeter && isMeasurable(payload.azimuth)) {
                addLabel(
                    payload.azimuthAnchor.b,
                    `${label('azimuth')} ${Number(payload.azimuth).toFixed(2)}°`,
                    { area: true, offsetY: -15 },
                );
            }
            return out;
        }

        return out;
    }

    // ────────────────────────── 样式回放 ──────────────────────────

    /**
     * 把样式回放到既有成品上（对应面板「样式即时生效」与 TOC 右键「样式设置」）。
     *
     * 两个必须同时做的事：
     * ① 写实体材质 —— 颜色取**当前** style，而不是建档时快照的 hexColor，
     *    否则「改颜色」会被静默吞掉（只生效线宽）；
     * ② 回写 styled 描述表的 hexColor/baseAlpha —— 后续拖透明度时按该基色重算，
     *    若不回写，改完颜色再动透明度会跳回旧色。
     *
     * 测高距 / 方位角跳过色彩覆盖：它们的线色是语义色，覆盖后三角形与箭头的含义就丢了。
     */
    function applyStyleToHandle(handle: DrawHandle | null | undefined, style: DrawStyleParams): void {
        if (!handle) return;
        const semantic = handle.drawType === 'MeasureHeight' || handle.drawType === 'MeasureAzimuth';
        const width = Math.max(1, Number(style.outlineWidth) || 2);
        const fillAlpha = Math.min(1, Math.max(0, finiteOr(style.fillOpacity, 1)));

        if (!semantic) {
            handle.styled.forEach((descriptor) => {
                const { entity, kind } = descriptor;
                try {
                    if (kind === 'polyline') {
                        descriptor.hexColor = style.outlineColor;
                        descriptor.baseAlpha = 1;
                        entity.polyline.width = width;
                        entity.polyline.material = colorOf(style.outlineColor, 1);
                    } else if (kind === 'polygon' || kind === 'rectangle') {
                        descriptor.hexColor = style.fillColor;
                        descriptor.baseAlpha = fillAlpha;
                        if (entity.polygon) {
                            entity.polygon.material = colorOf(style.fillColor, fillAlpha);
                        }
                        if (entity.rectangle) {
                            entity.rectangle.material = colorOf(style.fillColor, fillAlpha);
                        }
                    } else if (kind === 'point') {
                        descriptor.hexColor = style.outlineColor;
                        descriptor.baseAlpha = 1;
                        entity.point.color = colorOf(style.outlineColor, 1);
                    }
                } catch {
                    /* 实体可能已随场景销毁 */
                }
            });
        }

        (handle.vertices || []).forEach((entity) => {
            try {
                entity.show = style.showVertices !== false;
                entity.point.pixelSize = Math.max(3, Number(style.vertexSize) || 8);
            } catch {
                /* ignore */
            }
        });
    }

    return {
        buildShape,
        buildVertices,
        buildLabels,
        applyStyleToHandle,
        /** 标注前缀解析器透出：管理器组装记录摘要时复用同一套文案 */
        labelOf: label,
        // 供管理器组装载荷时复用（避免两套口径）
        polygonAreaPerimeter,
        polylineLength,
        rectangleMetrics,
        rectangleCorners,
        circleRingLonLats,
    };
}
