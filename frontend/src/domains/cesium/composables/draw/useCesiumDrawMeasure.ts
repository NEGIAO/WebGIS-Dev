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
 * - 句柄表支撑 TOC 的显隐 / 透明度 / flyTo / 移除；测量标注按开关实时重算
 * - 元数据经 cesiumLayersStore.registerDrawing 建档（category='draw'），进「三维数据」分组
 */

import { formatDistanceMeasure, formatAreaMeasure } from '@common/map-view/units';
import { pickEarthPoint } from './scenePicker';
import {
    createDrawEntityFactory,
    type DrawHandle,
    type MeasureOptions,
    type StyledDescriptor,
} from './drawEntityFactory';
import type { DrawStyleParams } from '../../stores/useDrawMeasureStore';
import { createDrawMeasureCalc } from './drawMeasureCalc';
import {
    type ShapeType,
    EDITABLE_TYPES,
    MIN_POINTS,
    MULTI_CLICK_TYPES,
    TYPE_META,
    TYPE_SHORT_LABELS,
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

/**
 * 支持顶点编辑的类型由 `drawMeasureSpec.EDITABLE_TYPES` 统一声明（单一事实来源），
 * TOC 节点能力位与本管理器共用同一份判据，避免「菜单出现但点了不支持」。
 */

/**
 * @param {object} deps
 * @param {Function} deps.getCesium Cesium 命名空间 getter
 * @param {Function} deps.getViewer Viewer getter
 * @param {object} deps.cesiumLayersStore cesiumLayers pinia store 实例
 * @param {Function} [deps.getLabel] 标注前缀解析器（i18n）
 * @param {Function} [deps.onResult] 绘制完成回调（纯数据载荷，供面板渲染）
 * @param {Function} [deps.onStateChange] 交互态变化回调 { drawing, mode, clickCount }
 * @param {Function} [deps.onReject] 手势结束失败回调（取点不足等），宿主据此 toast
 * @param {Function} [deps.onRemoved] 成品被移除回调 (id)，宿主据此失效读数
 */
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
    /** 成品句柄表 id → handle */
    const registry = new Map<string, DrawHandle>();
    /** 成图顺序（撤销用） */
    const orderIds: string[] = [];
    let seed = 0;

    /** 顶点编辑会话：{ id, handle, markers, handler, positions, dragging } */
    let editSession: any = null;

    const styleParams: DrawStyleParams = { ...DEFAULT_STYLE };
    const measureOptions: MeasureOptions = { ...DEFAULT_MEASURE_OPTIONS };

    const factory = createDrawEntityFactory({ getCesium, getViewer, getLabel });

    // ────────────────────────── 内部工具 ──────────────────────────
    // 几何量测与读数载荷计算在 ./drawMeasureCalc（Cesium 与测量开关注入）
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
            // 预览矩形：previewRect 存**度制**边界（与成品载荷同构），渲染时才转 Cesium.Rectangle
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
            // 贴地与否必须与成品一致，否则落点瞬间会「跳」一下：
            // 测高距成品是三维直线（不贴地）；方位角箭头线贴地
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

        // 取点圆点标记（成图后由成品顶点标记接替）
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
                // 次点确认：先把预览定格，再结束
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

    /** 两点经纬度 → 度制矩形 */
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

    // ────────────────────────── 载荷 ──────────────────────────
    function createHandle(payload: any) {
        if (!viewerAlive() || !payload) return null;
        const viewer = getViewer();

        seed += 1;
        const id = `cesium-draw-${Date.now()}-${seed}`;
        const meta = TYPE_META[payload.type] || { prefix: '绘制' };
        const short = TYPE_SHORT_LABELS[payload.type] || payload.type;
        const name = `${meta.prefix}_${short}_${seed}`;

        /** 先建空句柄再逐段填充：任一段抛错都能按已落盘部分整体回滚 */
        const handle: DrawHandle = {
            id,
            name,
            drawType: payload.type,
            entities: [],
            styled: [],
            vertices: [],
            labels: [],
            payload,
            positions: payload.positions || [],
        };

        try {
            const built = factory.buildShape(payload, styleParams);
            if (!built.entities.length) return null;
            handle.entities = built.entities;
            handle.styled = built.styled;
            handle.vertices = factory.buildVertices(payload, styleParams);
            handle.labels = factory.buildLabels(payload, measureOptions);
        } catch (error) {
            // 回滚半成品：实体留在场景却不在句柄表时，TOC 无档、清空也清不掉，
            // 会成为「画出来了但图层管理里没有」的场景孤儿（P0 同款教训）
            [...handle.entities, ...handle.vertices, ...handle.labels].forEach((entity) => {
                try {
                    viewer.entities.remove(entity);
                } catch {
                    /* 已随异常销毁 */
                }
            });
            console.warn('[CesiumDraw] 成品落盘失败，已回滚半成品:', error);
            return null;
        }

        registry.set(id, handle);
        orderIds.push(id);
        // shapeType 携带具体几何类型（Point / Polygon / MeasureHeight…）：
        // record.type 只能表达 category（draw / route），TOC 能力位需要更细的判据
        cesiumLayersStore.registerDrawing({
            id,
            name,
            category: 'draw',
            shapeType: payload.type,
        });

        // 建档回执校验：元数据店未落档时该图形无法从 TOC 控制（显隐/透明度/移除全失效），
        // 必须显式暴露而非静默放过（Force_command §2-8）
        if (!cesiumLayersStore.getRecord?.(id)) {
            console.warn('[CesiumDraw] 绘制成品未进入元数据店，TOC 将不可控:', { id, name });
        }

        try {
            onResult?.(toPlainResult(handle));
        } catch {
            /* 面板回调异常不得影响成图 */
        }
        return handle;
    }

    /** 重算单条成品的测量标注（测量开关变化 / 显隐变化时调用） */
    function refreshLabels(handle: any) {
        if (!handle || !viewerAlive()) return;
        handle.labels.forEach((entity: any) => {
            try {
                getViewer().entities.remove(entity);
            } catch {
                /* 场景已销毁 */
            }
        });
        handle.labels = factory.buildLabels(handle.payload, measureOptions);

        const record = cesiumLayersStore.getRecord?.(handle.id);
        const visible = record ? record.visible !== false : true;
        handle.labels.forEach((entity: any) => {
            entity.show = visible;
        });
    }

    // ────────────────────────── 交互生命周期 ──────────────────────────

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
            // 预览标签为独立实体（未入 sketch 表）：必须显式摘除，
            // 否则每次交互都向 viewer.entities 泄漏一个无人认领的 Label 尸体
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

    /**
     * 结束当前绘制。
     * @param {'gesture'|'panel'} [source] 触发来源：手势（双击 / 右击 / 两点落定）失败时
     *        经 onReject 主动提示；面板按钮失败时把结果码回传给宿主提示，避免双重 toast
     * @returns {'ok'|'not-drawing'|'need-more-points'|'need-second-click'|'failed'} 结果码
     */
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
            // 双击结束前 Cesium 会先派发两次 LEFT_CLICK：像素距 ≤3px 视为同一点剔除，
            // 否则测距虚高、线面末端赘点（右击结束无此现象，两侧行为对齐）
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

        const handle = createHandle(payload);
        if (!handle) return reject('failed');
        return 'ok';
    }

    // ────────────────────────── 对外能力 ──────────────────────────

    /**
     * 引擎交互路由入口（HomeView 经容器 expose 调用）
     * @param {string} type ControlsPanel 交互类型
     * @returns {boolean} 是否被本引擎消费；false = 类型不支持（宿主应提示降级）
     */
    function activateInteraction(type: any) {
        const nextType = normalizeType(type);
        if (!nextType) return false;

        if (nextType === 'Clear') {
            // 清空成品前先终止进行中的交互：否则 sketch/handler 仍存活，
            // 「清空」只删档不清交互态，后续点击会继续向已清空的场景追加脏数据
            cancelActive();
            clearAllDrawings();
            return true;
        }
        if (nextType === 'UndoLastDrawing') {
            undoLastDrawing();
            return true;
        }

        cancelActive();
        const started = beginInteraction(nextType);
        if (!started) active = null;
        return started;
    }

    /** 面板「完成」按钮（触屏无右键，必须提供显式完成入口） */
    function finish() {
        return finishInteraction();
    }

    /** 面板「取消」按钮 */
    function cancel() {
        cancelActive();
        return true;
    }

    /** 测量开关（面板复选框）：已成品即时重算标注，无需重绘 */
    function setMeasureOptions(patch: any = {}) {
        if (typeof patch.measure === 'boolean') measureOptions.measure = patch.measure;
        if (typeof patch.showArea === 'boolean') measureOptions.showArea = patch.showArea;
        if (typeof patch.showPerimeter === 'boolean') measureOptions.showPerimeter = patch.showPerimeter;
        [...registry.values()].forEach(refreshLabels);
    }

    /**
     * 样式补丁归一化写入目标对象。
     * 字段口径与 OL `drawingToolRegistry.normalizeDrawingStyleParams` 对齐：
     * 同时接受 outline 系与 stroke 系两种命名，避免 2D/3D 调用方各写一套。
     * @param {object} target 目标样式对象（styleParams 或其副本）
     * @param {object} patch 补丁
     * @returns {object} 同一个 target
     */
    function mergeStylePatch(target: any, patch: any = {}) {
        const numeric = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
        if (typeof patch.fillColor === 'string') target.fillColor = patch.fillColor;
        if (typeof patch.outlineColor === 'string') target.outlineColor = patch.outlineColor;
        if (typeof patch.strokeColor === 'string') target.outlineColor = patch.strokeColor;
        const w = numeric(patch.outlineWidth ?? patch.strokeWidth);
        if (w !== undefined && w > 0) target.outlineWidth = w;
        const fo = numeric(patch.fillOpacity);
        if (fo !== undefined) target.fillOpacity = Math.min(1, Math.max(0, fo));
        if (typeof patch.showVertices === 'boolean') target.showVertices = patch.showVertices;
        const vs = numeric(patch.vertexSize);
        if (vs !== undefined && vs > 0) target.vertexSize = vs;
        return target;
    }

    /** 更新全局默认样式并回放全部成品（对齐面板「样式即时生效」） */
    function updateStyle(patch: any = {}) {
        mergeStylePatch(styleParams, patch);
        [...registry.values()].forEach((handle) => factory.applyStyleToHandle(handle, styleParams));
    }

    /**
     * 仅更新单条成品样式（TOC 右键「样式设置」/ 样式页签按 id 定向修改）。
     * 用 styleParams 的副本叠加补丁，**不污染**后续绘制的默认样式。
     * @param {string} id 成品 id
     * @param {object} patch 样式补丁
     * @returns {boolean} 句柄不存在时返回 false（宿主据此提示）
     */
    function updateStyleById(id: any, patch: any = {}) {
        const handle = registry.get(String(id || ''));
        if (!handle) return false;
        const scoped = mergeStylePatch({ ...styleParams }, patch);
        factory.applyStyleToHandle(handle, scoped);
        return true;
    }

    /** 是否为绘制管理器持有的成品句柄（adapter 分流判据） */
    function isManaged(id: any) {
        return registry.has(String(id || ''));
    }

    // ────────────────────────── 要素编辑（顶点拖拽） ──────────────────────────

    /** 编辑期间锁相机，避免拖顶点变成转地球 */
    function setCameraControlEnabled(enabled: any) {
        try {
            const controller = getViewer()?.scene?.screenSpaceCameraController;
            if (!controller) return;
            controller.enableRotate = enabled;
            controller.enableTranslate = enabled;
            controller.enableLook = enabled;
        } catch {
            /* 场景已销毁 */
        }
    }

    /** 把编辑中的顶点写回实体（面类同时更新多边形层级与描边折线） */
    function applyEditGeometry() {
        if (!editSession) return;
        const C = getC();
        const { handle, positions } = editSession;
        const isArea = handle.drawType === 'Polygon' || handle.drawType === 'MeasureArea';

        handle.styled.forEach(({ entity, kind }: StyledDescriptor) => {
            try {
                if (kind === 'polygon') {
                    entity.polygon.hierarchy = new C.PolygonHierarchy(positions);
                } else if (kind === 'polyline') {
                    entity.polyline.positions = isArea ? [...positions, positions[0]] : positions;
                } else if (kind === 'point') {
                    entity.position = positions[0];
                }
            } catch {
                /* 实体可能已销毁 */
            }
        });

        // 顶点标记跟随（被拖的那个已单独赋值，这里兜底其余）
        editSession.markers.forEach((marker: any, index: number) => {
            try {
                marker.position = positions[index];
            } catch {
                /* ignore */
            }
        });
    }

    /**
     * 提交编辑结果：重算载荷测量值 → 刷新标注 → 通知面板。
     * 只改几何不改 id / 名称，TOC 档案与面板选中态保持连续。
     */
    function commitEdit() {
        if (!editSession) return;
        const { handle, positions } = editSession;
        const payload = handle.payload;

        payload.positions = positions.slice();
        payload.lonLats = positions.map(toLonLat);
        handle.positions = payload.positions;

        if (payload.type === 'Polygon' || payload.type === 'MeasureArea') {
            const { area, perimeter } = polygonAreaPerimeter(payload.lonLats);
            payload.area = area;
            payload.perimeter = perimeter;
        } else if (payload.type === 'LineString' || payload.type === 'MeasureDistance') {
            payload.length = surfacePolylineLength(positions);
        } else if (payload.type === 'Point') {
            payload.lonLats = [toLonLat(positions[0])];
        }

        // 顶点标记实体需按新位置重建（旧标记已被编辑标记覆盖）
        handle.vertices.forEach((entity: any) => {
            try {
                getViewer()?.entities.remove(entity);
            } catch {
                /* ignore */
            }
        });
        handle.vertices = factory.buildVertices(payload, styleParams);

        refreshLabels(handle);

        try {
            onResult?.(toPlainResult(handle));
        } catch {
            /* 面板回调异常不影响编辑 */
        }
        getViewer()?.scene?.requestRender?.();
    }

    /**
     * 进入顶点编辑（TOC 右键「编辑要素」，仅绘制成品）。
     * @param {string} id 成品 id
     * @returns {boolean} 类型不支持 / 句柄不存在时 false（宿主据此提示）
     */
    function startVertexEdit(id: any) {
        const handle = registry.get(String(id || ''));
        if (!handle || !EDITABLE_TYPES.has(handle.drawType)) return false;
        if (!viewerAlive()) return false;

        stopVertexEdit();
        const C = getC();
        const viewer = getViewer();
        const positions = (handle.payload.positions || []).map((p: any) => C.Cartesian3.clone(p));
        if (!positions.length) return false;

        const markers = positions.map((position: any) => {
            const marker = viewer.entities.add({
                position,
                point: {
                    pixelSize: 12,
                    color: C.Color.ORANGE,
                    outlineColor: C.Color.WHITE,
                    outlineWidth: 2,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
            });
            return marker;
        });

        const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
        editSession = { id: handle.id, handle, markers, handler, positions, dragging: null };

        handler.setInputAction((movement: any) => {
            if (!editSession) return;
            const picked = viewer.scene.pick(movement.position);
            const index = editSession.markers.indexOf(picked?.id);
            if (index < 0) return;
            editSession.dragging = index;
            setCameraControlEnabled(false);
        }, C.ScreenSpaceEventType.LEFT_DOWN);

        handler.setInputAction((movement: any) => {
            if (!editSession || editSession.dragging === null) return;
            const point = pickEarthPoint({ getCesium, getViewer, pixel: movement.endPosition });
            if (!point) return;
            editSession.positions[editSession.dragging] = point;
            applyEditGeometry();
            viewer.scene.requestRender?.();
        }, C.ScreenSpaceEventType.MOUSE_MOVE);

        const release = () => {
            if (!editSession || editSession.dragging === null) return;
            editSession.dragging = null;
            setCameraControlEnabled(true);
            commitEdit();
        };
        handler.setInputAction(release, C.ScreenSpaceEventType.LEFT_UP);

        return true;
    }

    /** 退出顶点编辑（提交由 LEFT_UP 完成，这里只做清理） */
    function stopVertexEdit() {
        if (!editSession) return;
        try {
            editSession.handler?.destroy?.();
        } catch {
            /* ignore */
        }
        editSession.markers.forEach((marker: any) => {
            try {
                getViewer()?.entities.remove(marker);
            } catch {
                /* ignore */
            }
        });
        editSession = null;
        setCameraControlEnabled(true);
    }

    /** 是否正在编辑指定成品 */
    function isEditing(id: any) {
        return !!editSession && editSession.id === String(id || '');
    }

    /**
     * 单条成品的标注显隐（TOC 右键「开启 / 关闭标注」）。
     * 只切标注，不动图形本体；测量开关变化触发的重算会覆盖此状态（属预期：
     * 开关是全局语义，右键是单条临时语义，重算时以全局为准）。
     * @returns {boolean} 该成品是否有可切换的标注
     */
    function setLabelVisible(id: string | number, visible: boolean) {
        const handle = registry.get(String(id || ''));
        if (!handle) return false;
        handle.labels.forEach((entity: any) => {
            try {
                entity.show = !!visible;
            } catch {
                /* ignore */
            }
        });
        return handle.labels.length > 0;
    }

    /**
     * 取单条成品的几何（TOC 复制坐标 / 导出坐标用）。
     * 直接复用建档时的载荷经纬度，避免再从实体属性反解（贴地实体反解会有高程噪声）。
     * @param {string} id 成品 id
     * @returns {Array<{type:'point'|'line'|'polygon', lonLats:Array<[number,number]>}>}
     */
    function getShapesById(id: any) {
        const handle = registry.get(String(id || ''));
        const payload = handle?.payload;
        const lonLats = Array.isArray(payload?.lonLats) ? payload.lonLats : [];
        if (!payload || !lonLats.length) return [];

        const type = payload.type;
        if (type === 'Point') return [{ type: 'point', lonLats }];
        if (type === 'Polygon' || type === 'Rectangle' || type === 'Circle' || type === 'MeasureArea') {
            return [{ type: 'polygon', lonLats }];
        }
        // 线类与测高距 / 方位角：均为折线语义
        return [{ type: 'line', lonLats }];
    }

    function setVisible(id: string | number, visible: boolean) {
        const handle = registry.get(String(id));
        if (!handle) return;
        const show = !!visible;
        [...handle.entities, ...(handle.vertices || []), ...(handle.labels || [])].forEach((entity) => {
            try {
                entity.show = show;
            } catch {
                /* ignore */
            }
        });
    }

    /** 透明度：按建档时的基色 × 系数回放（标注保持可读，不参与缩放） */
    function setOpacity(id: string | number, opacity: unknown) {
        const handle = registry.get(String(id));
        if (!handle) return;
        // 非法 / 缺省值回落到 1（全不透明）：若按 0 处理，一次异常调用就会让整条图层「消失」
        const numeric = Number(opacity);
        const o = Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : 1;
        const C = getC();
        handle.styled.forEach(({ entity, kind, hexColor, baseAlpha }) => {
            try {
                const alpha = baseAlpha * o;
                if (kind === 'polyline') entity.polyline.material = C.Color.fromCssColorString(hexColor).withAlpha(alpha);
                else if (kind === 'polygon') entity.polygon.material = C.Color.fromCssColorString(hexColor).withAlpha(alpha);
                else if (kind === 'rectangle') entity.rectangle.material = C.Color.fromCssColorString(hexColor).withAlpha(alpha);
                else if (kind === 'point') entity.point.color = C.Color.fromCssColorString(hexColor).withAlpha(alpha);
            } catch {
                /* 实体可能已被场景销毁 */
            }
        });
    }

    function flyTo(id: any) {
        const handle = registry.get(String(id));
        if (!handle || !viewerAlive()) return;
        const points = (handle.positions || []).filter(isFiniteCartesian);
        if (!points.length) return;
        const C = getC() as any;
        const sphere = C.BoundingSphere.fromPoints(points);
        getViewer().camera.flyToBoundingSphere(sphere, {
            duration: 0.8,
            offset: new C.HeadingPitchRange(0, C.Math.toRadians(-45), Math.max(sphere.radius * 2.5, 500)),
        });
    }

    /** 飞到最近一条成品 */
    function flyToLast() {
        const lastId = orderIds[orderIds.length - 1];
        if (!lastId) return false;
        flyTo(lastId);
        return true;
    }

    /**
     * 移除单个成品（实体清理 + 建档删除由 store.remove → adapter 链路触发）。
     * 附带删除结果校验：逐一确认实体确已离开 viewer.entities，
     * 未消失者（引用被代理污染 / 句柄过期等异常情形）二次强制移除并告警。
     */
    function removeHandle(id: any) {
        const key = String(id);
        const handle = registry.get(key);
        if (!handle) return;
        // 正在编辑这条成品时先退出编辑，否则顶点标记会残留成场景孤儿
        if (editSession?.id === key) stopVertexEdit();

        const viewer = getViewer();
        const survivors: any[] = [];
        const all = [...handle.entities, ...(handle.vertices || []), ...(handle.labels || [])];

        all.forEach((entity) => {
            try {
                viewer?.entities.remove(entity);
            } catch {
                /* ignore */
            }
            if (entity && typeof entity === 'object' && viewer?.entities?.contains?.(entity)) {
                try {
                    viewer.entities.remove(entity);
                } catch {
                    /* 最终兜底失败 */
                }
                if (viewer.entities.contains(entity)) survivors.push(entity.id ?? '(unknown)');
            }
        });
        if (survivors.length) {
            console.warn('[drawMeasure] 成品实体未能从场景移除（疑似句柄失配），受影响 id:', key, survivors);
        }

        registry.delete(key);
        const idx = orderIds.indexOf(key);
        if (idx >= 0) orderIds.splice(idx, 1);

        // 通知宿主：若被移除的正是面板正在展示的那条，读数须同步失效
        try {
            onRemoved?.(key);
        } catch {
            /* 回调异常不得影响移除主流程 */
        }
    }

    function undoLastDrawing() {
        const lastId = orderIds[orderIds.length - 1];
        if (!lastId) return false;
        cesiumLayersStore.remove(lastId); // → adapter.remove → removeHandle + draw 类即时删档
        return true;
    }

    function clearAllDrawings() {
        [...orderIds].forEach((id) => {
            removeHandle(id);
            cesiumLayersStore.purgeRecord(id);
        });
    }

    /** viewer 重建 / 容器卸载时复位全部状态（旧实体随旧 viewer 销毁，无需逐个移除） */
    function reset() {
        stopVertexEdit();
        cancelActive();
        // viewer 重试重建链路（不经过 unregisterAdapter 全量清档）：
        // 句柄表随旧 viewer 销毁，TOC 档案须同步清理，否则 syncFromImport 的
        // MANAGED_CATEGORIES 剪枝豁免会让 cesium-draw-* 沦为 no-op 僵尸记录
        for (const id of registry.keys()) {
            try {
                cesiumLayersStore.purgeRecord(id);
            } catch {
                /* store 未就绪时忽略 */
            }
        }
        registry.clear();
        orderIds.length = 0;
    }

    /** 当前交互态快照（面板高亮 / 完成按钮可用性判断） */
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
        setMeasureOptions,
        updateStyle,
        updateStyleById,
        isManaged,
        getShapesById,
        setLabelVisible,
        startVertexEdit,
        stopVertexEdit,
        isEditing,
        setVisible,
        setOpacity,
        flyTo,
        flyToLast,
        removeHandle,
        clearAllDrawings,
        undoLastDrawing,
        getState,
        reset,
    };
}
