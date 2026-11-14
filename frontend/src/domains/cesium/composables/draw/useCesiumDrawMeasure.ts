/**
 * useCesiumDrawMeasure.js — Cesium 绘制 / 测量管理器（引擎感知迁移 P0 扩展：全类型）
 *
 * 方案来源：Docs/TODO/engine-aware-map-operations-migration-plan.md §3-P0
 * 扩展依据：Docs/Demo/draw_manager.html + DrawManager.js（矩形 / 圆 / 测高距 / 方位角 / 测量开关）
 * 任务日志：Docs/LLM_record/26-10/2026-10-25/2026-10-25-cesium-draw-measure-full-migration.md
 *
 * 职责：
 * - ScreenSpaceEventHandler 单例交互，三态状态机：
 *     multi     逐点取点，双击 / 右击 / 面板「完成」结束（线 / 面 / 测距 / 测面）
 *     anchor    首点定锚（矩形角点 / 圆心），移动预览，次点确认（矩形 / 圆）
 *     two-point 两点即完成，第二点落下自动出结果（测高距 / 方位角）
 * - 取点链 scene.pickPosition → camera.pickEllipsoid（见 scenePicker.js）
 * - 测距 = EllipsoidGeodesic 表面距离（对齐 OL getLength 语义）；
 *   测面 = ENU 等距投影 shoelace；矩形 / 圆 / 方位角 / 重心走 utils/drawGeometry.ts
 * - 成品实体贴地策略与语义配色见 drawEntityFactory.ts
 * - 句柄表、顶点拖拽编辑与 TOC 控制见 drawHandleRegistry.ts
 */

import { formatDistanceMeasure, formatAreaMeasure } from '@common/map-view/units';
import { pickEarthPoint } from './scenePicker';
import {
    createDrawEntityFactory,
    type MeasureOptions,
} from './drawEntityFactory';
import type { DrawStyleParams } from '../../stores/useDrawMeasureStore';
import { createDrawMeasureCalc } from './drawMeasureCalc';
import { createDrawHandleRegistry } from './drawHandleRegistry';
import {
    type ShapeType,
    MIN_POINTS,
    MULTI_CLICK_TYPES,
    TWO_POINT_TYPES,
    interactionModelOf,
    normalizeType,
} from './drawMeasureSpec';
import {
    circleRingLonLats,
    polygonAreaPerimeter,
    rectangleMetrics,
} from '../../utils/drawGeometry';

/**
 * 默认绘制样式：与 OL `drawingToolRegistry.DEFAULT_DRAWING_STYLE_PARAMS` 视觉对齐。
 * 域边界禁止反向 import @ol，故本地常量化；改这里需同步改 OL 侧，保持双引擎观感一致。
 */
const DEFAULT_STYLE = Object.freeze({
    fillColor: '#27AE60',
    fillOpacity: 0.2,
    outlineColor: '#27AE60',
    outlineWidth: 2,
    showVertices: true,
    vertexSize: 8,
});

/** 测量开关默认值：默认开启测量（面板可关成「只绘制」） */
const DEFAULT_MEASURE_OPTIONS = Object.freeze({
    measure: true,
    showArea: true,
    showPerimeter: true,
});

/** 双击结束去重阈值（屏幕像素） */
const DUPLICATE_CLICK_PX = 3;

export interface CesiumDrawMeasureDeps {
    getCesium: () => any;
    getViewer: () => any;
    cesiumLayersStore: any;
    getLabel?: (key: string) => string;
    onResult?: (result: any) => void;
    onStateChange?: (state: { drawing: boolean; mode: string | null; clickCount: number }) => void;
    onReject?: (code: string) => void;
    onRemoved?: (id: string) => void;
}

export function createCesiumDrawMeasureFeature({
    getCesium,
    getViewer,
    cesiumLayersStore,
    getLabel,
    onResult,
    onStateChange,
    onReject,
    onRemoved,
}: CesiumDrawMeasureDeps) {
    /** 进行中的交互态 */
    let active: any = null;

    const styleParams: DrawStyleParams = { ...DEFAULT_STYLE };
    const measureOptions: MeasureOptions = { ...DEFAULT_MEASURE_OPTIONS };

    const factory = createDrawEntityFactory({ getCesium, getViewer, getLabel });

    // ────────────────────────── 内部工具 ──────────────────────────
    const {
        toLonLat,
        surfacePolylineLength,
        centroidOf,
        isFiniteCartesian,
        rectangleFromPoints,
        groundDistanceOf,
        buildPayload,
        toPlainResult,
    } = createDrawMeasureCalc({
        getCesium,
        getMeasureOptions: () => measureOptions,
        labelOf: (key) => factory.labelOf(key),
    });

    function getC() {
        return getCesium?.();
    }

    function viewerAlive() {
        const viewer = getViewer?.();
        return !!viewer && !viewer.isDestroyed?.();
    }

    function emitState() {
        try {
            onStateChange?.({
                drawing: !!active,
                mode: active?.type || null,
                clickCount: active?.clicks?.length || 0,
            });
        } catch {
            /* 回调异常不得影响绘制主流程 */
        }
    }

    // ────────────────────────── 交互生命周期清理 ──────────────────────────

    /** 摘除预览实体与事件处理器（不含成品） */
    function teardown() {
        if (active?.handler) {
            try {
                active.handler.destroy();
            } catch {
                /* ignore */
            }
        }
        if (active) {
            active.sketch.forEach((entity: any) => {
                try {
                    getViewer()?.entities.remove(entity);
                } catch {
                    /* viewer 可能已销毁 */
                }
            });
            active.sketch = [];
            if (active.previewLabel) {
                try {
                    getViewer()?.entities.remove(active.previewLabel);
                } catch {
                    /* viewer 可能已销毁 */
                }
                active.previewLabel = null;
            }
        }
        active = null;
        emitState();
    }

    /** 放弃当前交互（成品不受影响） */
    function cancelActive() {
        if (!active) return;
        teardown();
    }

    // 成品句柄表与顶点编辑会话委托给子模块
    const handleRegistry = createDrawHandleRegistry({
        getCesium,
        getViewer,
        viewerAlive,
        cesiumLayersStore,
        factory,
        styleParams,
        measureOptions,
        toLonLat,
        surfacePolylineLength,
        isFiniteCartesian,
        toPlainResult,
        onResult,
        onRemoved,
        cancelActive,
    });

    // ────────────────────────── 预览 ──────────────────────────

    /** 关闭默认双击追踪（否则双击会拉近相机 / 追踪实体） */
    function disableDefaultDoubleClick() {
        try {
            getViewer().cesiumWidget.screenSpaceEventHandler.removeInputAction(
                getC().ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
            );
        } catch {
            /* viewer 未就绪时忽略 */
        }
    }

    /** 预览：当前已取点 + 鼠标悬停点 */
    function dynamicPositions() {
        if (!active) return [];
        const list = [...active.clicks];
        if (active.cursorPos) list.push(active.cursorPos);
        return list;
    }

    /** 预览标注文本与锚点（线显长度、面显面积；矩形/圆显面积或半径） */
    function updatePreviewLabel() {
        if (!active?.previewLabel) return;
        const C = getC();
        const type = active.type;
        const positions = dynamicPositions().filter(isFiniteCartesian);

        let text = '';
        let anchor: any = null;

        if (MULTI_CLICK_TYPES.has(type)) {
            if (positions.length >= 2) {
                const lonLats = positions.map(toLonLat);
                if (type === 'Polygon' || type === 'MeasureArea') {
                    const { area } = polygonAreaPerimeter(lonLats as any);
                    if (positions.length >= 3) {
                        text = formatAreaMeasure(area);
                        anchor = centroidOf(positions);
                    }
                } else {
                    text = formatDistanceMeasure(surfacePolylineLength(positions));
                    anchor = positions[positions.length - 1];
                }
            }
        } else if (type === 'Rectangle' && active.previewRect) {
            const r = active.previewRect;
            const { area } = rectangleMetrics(r);
            text = formatAreaMeasure(area);
            anchor = C.Cartesian3.fromDegrees(
                (r.west + r.east) / 2,
                (r.south + r.north) / 2,
            );
        } else if (type === 'Circle' && active.previewRadius && active.anchor) {
            text = formatDistanceMeasure(active.previewRadius);
            anchor = active.anchor;
        } else if (TWO_POINT_TYPES.has(type) && positions.length >= 2) {
            text = formatDistanceMeasure(groundDistanceOf(positions[0], positions[1]));
            anchor = positions[positions.length - 1];
        }

        active.previewLabel.label.text = text;
        if (anchor && isFiniteCartesian(anchor)) {
            active.previewLabel.position = C.Cartesian3.clone(anchor, new C.Cartesian3());
            active.previewLabel.show = true;
        } else {
            active.previewLabel.show = false;
        }
    }

    /** 建预览实体（按交互模型分派） */
    function buildPreview() {
        const viewer = getViewer();
        const C = getC();
        const type = active.type;
        const model = active.model;

        if (model === 'multi') {
            const isClosed = type === 'Polygon' || type === 'MeasureArea';
            active.sketch.push(
                viewer.entities.add({
                    polyline: {
                        positions: new C.CallbackProperty(() => dynamicPositions(), false),
                        width: styleParams.outlineWidth + 1,
                        material: C.Color.CYAN,
                        clampToGround: true,
                    },
                }),
            );
            if (isClosed) {
                active.sketch.push(
                    viewer.entities.add({
                        polygon: {
                            hierarchy: new C.CallbackProperty(() => {
                                const p = dynamicPositions();
                                return p.length >= 3 ? new C.PolygonHierarchy(p) : undefined;
                            }, false),
                            material: C.Color.CYAN.withAlpha(0.15),
                            classificationType: C.ClassificationType.TERRAIN,
                        },
                    }),
                );
            }
        } else if (type === 'Rectangle') {
            active.sketch.push(
                viewer.entities.add({
                    show: new C.CallbackProperty(() => !!active?.previewRect, false),
                    rectangle: {
                        coordinates: new C.CallbackProperty(() => {
                            const r = active?.previewRect;
                            if (!r) return undefined;
                            return C.Rectangle.fromDegrees(r.west, r.south, r.east, r.north);
                        }, false),
                        material: C.Color.CYAN.withAlpha(0.18),
                        classificationType: C.ClassificationType.TERRAIN,
                    },
                }),
            );
            active.sketch.push(
                viewer.entities.add({
                    polyline: {
                        positions: new C.CallbackProperty(() => {
                            const r = active?.previewRect;
                            if (!r) return [];
                            return C.Cartesian3.fromDegreesArray([
                                r.west, r.south,
                                r.west, r.north,
                                r.east, r.north,
                                r.east, r.south,
                                r.west, r.south,
                            ]);
                        }, false),
                        width: styleParams.outlineWidth + 1,
                        material: C.Color.CYAN,
                        clampToGround: true,
                    },
                }),
            );
        } else if (type === 'Circle') {
            const ringOf = () => {
                if (!active?.anchor || !active.previewRadius) return [];
                const center = toLonLat(active.anchor);
                return circleRingLonLats(center as any, active.previewRadius).map(([lon, lat]) =>
                    C.Cartesian3.fromDegrees(lon, lat),
                );
            };
            active.sketch.push(
                viewer.entities.add({
                    polyline: {
                        positions: new C.CallbackProperty(() => {
                            const ring = ringOf();
                            return ring.length ? [...ring, ring[0]] : [];
                        }, false),
                        width: styleParams.outlineWidth + 1,
                        material: C.Color.CYAN,
                        clampToGround: true,
                    },
                }),
            );
            active.sketch.push(
                viewer.entities.add({
                    polygon: {
                        hierarchy: new C.CallbackProperty(() => {
                            const ring = ringOf();
                            return ring.length > 2 ? new C.PolygonHierarchy(ring) : undefined;
                        }, false),
                        material: C.Color.CYAN.withAlpha(0.15),
                        classificationType: C.ClassificationType.TERRAIN,
                    },
                }),
            );
        } else if (model === 'two-point') {
            active.sketch.push(
                viewer.entities.add({
                    polyline: {
                        positions: new C.CallbackProperty(() => dynamicPositions(), false),
                        width: 2,
                        material: C.Color.CYAN,
                        clampToGround: type === 'MeasureAzimuth',
                    },
                }),
            );
        }

        active.previewLabel = viewer.entities.add({
            position: C.Cartesian3.ZERO,
            show: false,
            label: {
                text: '',
                font: '600 13px system-ui, "Microsoft YaHei", sans-serif',
                fillColor: C.Color.WHITE,
                showBackground: true,
                backgroundColor: C.Color.BLACK.withAlpha(0.55),
                backgroundPadding: new C.Cartesian2(8, 4),
                pixelOffset: new C.Cartesian2(0, -18),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                scaleByDistance: new C.NearFarScalar(500, 1.0, 300000, 0.5),
            },
        });
    }

    // ────────────────────────── 事件 ──────────────────────────

    function addClickMarker(position: any) {
        const C = getC();
        active.sketch.push(
            getViewer().entities.add({
                position,
                point: {
                    pixelSize: styleParams.vertexSize,
                    color: C.Color.CYAN,
                    outlineColor: C.Color.WHITE,
                    outlineWidth: 1,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
            }),
        );
    }

    function handleLeftClick(movement: any) {
        if (!active) return;
        const picked = pickEarthPoint({ getCesium, getViewer, pixel: movement.position });
        if (!picked) return;

        const model = active.model;

        if (model === 'single') {
            active.clicks = [picked];
            finishInteraction('gesture');
            return;
        }

        if (model === 'two-point') {
            active.clicks.push(picked);
            active.clickPixels.push({ x: movement.position.x, y: movement.position.y });
            addClickMarker(picked);
            if (active.clicks.length >= 2) finishInteraction('gesture');
            else emitState();
            return;
        }

        if (model === 'anchor') {
            if (!active.anchor) {
                active.anchor = picked;
                addClickMarker(picked);
                emitState();
            } else {
                if (active.type === 'Rectangle') {
                    active.previewRect = rectangleFromPoints(active.anchor, picked);
                } else {
                    active.previewRadius = groundDistanceOf(active.anchor, picked);
                }
                active.clicks = [active.anchor, picked];
                finishInteraction('gesture');
            }
            return;
        }

        // multi
        active.clicks.push(picked);
        active.clickPixels.push({ x: movement.position.x, y: movement.position.y });
        addClickMarker(picked);
        updatePreviewLabel();
        emitState();
    }

    function handleMouseMove(movement: any) {
        if (!active) return;
        const picked = pickEarthPoint({ getCesium, getViewer, pixel: movement.endPosition });
        if (!picked) return;
        active.cursorPos = picked;

        if (active.model === 'anchor' && active.anchor) {
            if (active.type === 'Rectangle') {
                active.previewRect = rectangleFromPoints(active.anchor, picked);
            } else {
                active.previewRadius = groundDistanceOf(active.anchor, picked);
            }
        }
        updatePreviewLabel();
    }

    function bindEvents() {
        const C = getC();
        disableDefaultDoubleClick();
        const handler = new C.ScreenSpaceEventHandler(getViewer().scene.canvas);
        active.handler = handler;

        handler.setInputAction((movement: any) => handleLeftClick(movement), C.ScreenSpaceEventType.LEFT_CLICK);
        handler.setInputAction((movement: any) => handleMouseMove(movement), C.ScreenSpaceEventType.MOUSE_MOVE);

        if (active.model === 'multi') {
            const tryFinish = () => finishInteraction('gesture');
            handler.setInputAction(tryFinish, C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
            handler.setInputAction(tryFinish, C.ScreenSpaceEventType.RIGHT_CLICK);
        }
    }

    function beginInteraction(type: any) {
        const model = interactionModelOf(type);
        if (!model) return false;
        if (!viewerAlive() || !getC()) return false;

        active = {
            type,
            model,
            clicks: [],
            clickPixels: [],
            cursorPos: null,
            handler: null,
            sketch: [],
            previewLabel: null,
            anchor: null,
            previewRect: null,
            previewRadius: null,
        };

        buildPreview();
        bindEvents();
        emitState();
        return true;
    }

    function finishInteraction(source: 'gesture' | 'panel' = 'panel') {
        const reject = (code: string) => {
            if (source === 'gesture') {
                try {
                    onReject?.(code);
                } catch {
                    /* 提示回调异常不得影响交互 */
                }
            }
            return code;
        };

        const state = active;
        if (!state) return reject('not-drawing');

        const { type, model } = state;

        if (model === 'multi') {
            const min = MIN_POINTS[type as ShapeType] || 2;
            if (state.clicks.length >= 2) {
                const last = state.clickPixels[state.clickPixels.length - 1];
                const prev = state.clickPixels[state.clickPixels.length - 2];
                if (last && prev && Math.hypot(last.x - prev.x, last.y - prev.y) <= DUPLICATE_CLICK_PX) {
                    state.clicks.pop();
                    state.clickPixels.pop();
                }
            }
            if (state.clicks.length < min) return reject('need-more-points');
        } else if (model === 'anchor') {
            if (!state.anchor) return reject('need-more-points');
            const ready = type === 'Rectangle' ? !!state.previewRect : !!state.previewRadius;
            if (!ready) return reject('need-second-click');
        } else if (model === 'two-point') {
            if (state.clicks.length < 2) return reject('need-more-points');
        }

        const payload = buildPayload(state);
        teardown();
        if (!payload) return reject('failed');

        const handle = handleRegistry.createHandle(payload);
        if (!handle) return reject('failed');
        return 'ok';
    }

    // ────────────────────────── 对外能力 ──────────────────────────

    function activateInteraction(type: any) {
        const nextType = normalizeType(type);
        if (!nextType) return false;

        if (nextType === 'Clear') {
            cancelActive();
            handleRegistry.clearAllDrawings();
            return true;
        }
        if (nextType === 'UndoLastDrawing') {
            handleRegistry.undoLastDrawing();
            return true;
        }

        cancelActive();
        const started = beginInteraction(nextType);
        if (!started) active = null;
        return started;
    }

    function finish() {
        return finishInteraction();
    }

    function cancel() {
        cancelActive();
        return true;
    }

    function getState() {
        return {
            drawing: !!active,
            mode: active?.type || null,
            clickCount: active?.clicks?.length || 0,
        };
    }

    return {
        activateInteraction,
        finish,
        cancel,
        setMeasureOptions: handleRegistry.setMeasureOptions,
        updateStyle: handleRegistry.updateStyle,
        updateStyleById: handleRegistry.updateStyleById,
        isManaged: handleRegistry.isManaged,
        getShapesById: handleRegistry.getShapesById,
        setLabelVisible: handleRegistry.setLabelVisible,
        startVertexEdit: handleRegistry.startVertexEdit,
        stopVertexEdit: handleRegistry.stopVertexEdit,
        isEditing: handleRegistry.isEditing,
        setVisible: handleRegistry.setVisible,
        setOpacity: handleRegistry.setOpacity,
        flyTo: handleRegistry.flyTo,
        flyToLast: handleRegistry.flyToLast,
        removeHandle: handleRegistry.removeHandle,
        clearAllDrawings: handleRegistry.clearAllDrawings,
        undoLastDrawing: handleRegistry.undoLastDrawing,
        getState,
        reset: handleRegistry.reset,
    };
}
