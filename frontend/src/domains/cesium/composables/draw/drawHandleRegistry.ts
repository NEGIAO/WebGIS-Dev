/**
 * drawHandleRegistry.ts — Cesium 绘制/测量成品句柄管理与顶点拖拽编辑子模块
 *
 * 从 useCesiumDrawMeasure.ts 按职责拆分：
 * - 句柄注册表（registry + orderIds）与成品实体落地/回滚
 * - 样式补丁归一化、全局/单条样式回放、测量标注刷新
 * - 顶点拖拽编辑会话（startVertexEdit / stopVertexEdit / isEditing）
 * - TOC 控制接口（setVisible / setOpacity / setLabelVisible / getShapesById / flyTo / removeHandle / clear / undo / reset）
 */

import { pickEarthPoint } from './scenePicker';
import type {
    DrawHandle,
    MeasureOptions,
    StyledDescriptor,
} from './drawEntityFactory';
import type { DrawStyleParams } from '../../stores/useDrawMeasureStore';
import {
    EDITABLE_TYPES,
    TYPE_META,
    TYPE_SHORT_LABELS,
} from './drawMeasureSpec';
import { polygonAreaPerimeter } from '../../utils/drawGeometry';

export interface DrawHandleRegistryDeps {
    getCesium: () => any;
    getViewer: () => any;
    viewerAlive: () => boolean;
    cesiumLayersStore: any;
    factory: any;
    styleParams: DrawStyleParams;
    measureOptions: MeasureOptions;
    toLonLat: (cartesian: any) => [number, number];
    surfacePolylineLength: (positions: any[]) => number;
    isFiniteCartesian: (cartesian: any) => boolean;
    toPlainResult: (handle: DrawHandle) => any;
    onResult?: (result: any) => void;
    onRemoved?: (id: string) => void;
    cancelActive: () => void;
}

export function createDrawHandleRegistry({
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
}: DrawHandleRegistryDeps) {
    /** 成品句柄表 id → handle */
    const registry = new Map<string, DrawHandle>();
    /** 成图顺序（撤销用） */
    const orderIds: string[] = [];
    let seed = 0;

    /** 顶点编辑会话：{ id, handle, markers, handler, positions, dragging } */
    let editSession: any = null;

    function getC() {
        return getCesium?.();
    }

    // ────────────────────────── 成品句柄落地与标注刷新 ──────────────────────────

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
            // 回滚半成品：实体留在场景却不在句柄表时，TOC 无档、清空也清不掉
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
        cesiumLayersStore.registerDrawing({
            id,
            name,
            category: 'draw',
            shapeType: payload.type,
        });

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

    // ────────────────────────── 样式与测量开关 ──────────────────────────

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
     * 用 styleParams 的副本叠加补丁，不污染后续绘制的默认样式。
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

    // ────────────────────────── TOC 与句柄控制 ──────────────────────────

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

    function setOpacity(id: string | number, opacity: unknown) {
        const handle = registry.get(String(id));
        if (!handle) return;
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

    function flyToLast() {
        const lastId = orderIds[orderIds.length - 1];
        if (!lastId) return false;
        flyTo(lastId);
        return true;
    }

    function removeHandle(id: any) {
        const key = String(id);
        const handle = registry.get(key);
        if (!handle) return;
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

        try {
            onRemoved?.(key);
        } catch {
            /* 回调异常不得影响移除主流程 */
        }
    }

    function undoLastDrawing() {
        const lastId = orderIds[orderIds.length - 1];
        if (!lastId) return false;
        cesiumLayersStore.remove(lastId);
        return true;
    }

    function clearAllDrawings() {
        [...orderIds].forEach((id) => {
            removeHandle(id);
            cesiumLayersStore.purgeRecord(id);
        });
    }

    function reset() {
        stopVertexEdit();
        cancelActive();
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

    return {
        createHandle,
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
        reset,
    };
}
