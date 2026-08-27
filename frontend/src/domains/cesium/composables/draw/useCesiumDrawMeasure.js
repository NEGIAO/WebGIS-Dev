/**
 * useCesiumDrawMeasure.js — Cesium 绘制 / 测量管理器（引擎感知迁移 P0）
 *
 * 方案来源：Docs/TODO/engine-aware-map-operations-migration-plan.md §3-P0
 *
 * 职责：
 * - ScreenSpaceEventHandler 单例交互：左击加点 / 移动预览 / 双击·右击结束
 * - 支持 Point / LineString / Polygon / MeasureDistance / MeasureArea /
 *   Clear / UndoLastDrawing；其余类型返回 false 交由宿主 toast 明示降级
 * - 取点链 scene.pickPosition → camera.pickEllipsoid（见 scenePicker.js）
 * - 测距 = EllipsoidGeodesic 表面距离（对齐 OL getLength 水平距离语义）；
 *   测面 = ENU 等距投影 shoelace
 * - 成品实体贴地（point heightReference / polyline clampToGround / 地面多边形），
 *   句柄表支撑 TOC 的显隐 / 透明度 / flyTo / 移除
 * - 元数据经 cesiumLayersStore.registerDrawing 建档（category='draw'），进「三维数据」分组
 */

import { formatDistanceMeasure, formatAreaMeasure } from '@common/map-view/units';
import { pickEarthPoint } from './scenePicker.js';

/** 默认绘制样式（与 OL drawingToolRegistry.DEFAULT_DRAWING_STYLE_PARAMS 视觉对齐；域边界禁止反向 import @ol，故本地常量化） */
const DEFAULT_STYLE = Object.freeze({
    strokeColor: '#27AE60',
    strokeWidth: 2,
    strokeOpacity: 1,
    fillColor: '#27AE60',
    fillOpacity: 0.2,
});

const SUPPORTED_INTERACTIONS = new Set([
    'Point',
    'LineString',
    'Polygon',
    'MeasureDistance',
    'MeasureArea',
    'Clear',
    'UndoLastDrawing',
]);

const DRAW_TYPE_LABELS = {
    Point: '点',
    LineString: '线',
    Polygon: '面',
    MeasureDistance: '距离',
    MeasureArea: '面积',
};

const EARTH_RADIUS = 6378137;

/**
 * @param {object} deps
 * @param {Function} deps.getCesium Cesium 命名空间 getter
 * @param {Function} deps.getViewer Viewer getter
 * @param {object} deps.cesiumLayersStore cesiumLayers pinia store 实例
 */
export function createCesiumDrawMeasureFeature({ getCesium, getViewer, cesiumLayersStore }) {
    /** 进行中的交互态：{ type, clicks:Cartesian3[], handler, sketch:[], cursorPos, previewLabel } */
    let active = null;
    /** 成品句柄表 id → handle */
    const registry = new Map();
    /** 成图顺序（撤销用） */
    const orderIds = [];
    let seed = 0;
    const styleParams = { ...DEFAULT_STYLE };

    // ────────────────────────── 内部工具 ──────────────────────────

    function getC() {
        return getCesium?.();
    }

    function colorOf(hexColor, alpha) {
        try {
            return getC()
                .Color.fromCssColorString(String(hexColor || '#27AE60'))
                .withAlpha(alpha);
        } catch {
            return getC().Color.fromCssColorString('#27AE60').withAlpha(alpha);
        }
    }

    /** 椭球测地线表面距离（米）；退化时弦长兜底 */
    function surfaceDistanceMeters(a, b) {
        const C = getC();
        try {
            const geo = new C.EllipsoidGeodesic(
                C.Cartographic.fromCartesian(a),
                C.Cartographic.fromCartesian(b),
            );
            const d = Number(geo?.surfaceDistance);
            if (Number.isFinite(d) && d >= 0) return d;
        } catch {
            /* 共点等异常退化为弦长 */
        }
        return C.Cartesian3.distance(a, b);
    }

    function polylineLengthMeters(positions) {
        let total = 0;
        for (let i = 1; i < positions.length; i++) {
            total += surfaceDistanceMeters(positions[i - 1], positions[i]);
        }
        return total;
    }

    /**
     * ENU 等距投影 + shoelace 面积（m²）：以首点纬度为基准做局部等距展开。
     * 适用近地小范围（与测量工具典型使用场景一致）。
     */
    function polygonAreaSqMeters(positions) {
        if (!positions || positions.length < 3) return 0;
        const C = getC();
        let origin;
        try {
            origin = C.Cartographic.fromCartesian(positions[0]);
        } catch {
            return 0;
        }
        const cosLat0 = Math.cos(origin.latitude);
        const pts = positions.map((p) => {
            const c = C.Cartographic.fromCartesian(p);
            return {
                x: EARTH_RADIUS * (c.longitude - origin.longitude) * cosLat0,
                y: EARTH_RADIUS * (c.latitude - origin.latitude),
            };
        });
        let twice = 0;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            twice += a.x * b.y - b.x * a.y;
        }
        return Math.abs(twice) / 2;
    }

    function centroidOf(positions) {
        const sum = { x: 0, y: 0, z: 0 };
        positions.forEach((p) => {
            sum.x += p.x;
            sum.y += p.y;
            sum.z += p.z;
        });
        const n = positions.length || 1;
        return new (getC().Cartesian3)(sum.x / n, sum.y / n, sum.z / n);
    }

    function clampHeightReference() {
        return getC().HeightReference.CLAMP_TO_GROUND;
    }

    function makeLabelEntity(text, position) {
        return getViewer().entities.add({
            position,
            label: {
                text,
                font: '12px sans-serif',
                fillColor: getC().Color.WHITE,
                showBackground: true,
                backgroundColor: getC().Color.BLACK.withAlpha(0.55),
                backgroundPadding: new (getC().Cartesian2)(7, 4),
                pixelOffset: new (getC().Cartesian2)(0, -18),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                heightReference: clampHeightReference(),
            },
        });
    }

    /** 记录实体与其基础样式，供透明度回放 */
    function trackStyle(handle, entity, kind, hexColor, baseAlpha) {
        handle.styled.push({ entity, kind, hexColor, baseAlpha });
    }

    // ────────────────────────── 交互生命周期 ──────────────────────────

    function cancelActive() {
        if (!active) return;
        try {
            active.handler?.destroy?.();
        } catch {
            /* ignore */
        }
        // 预览标签为独立实体（不入 sketch 表）：必须在此摘除，否则每次交互
        // 都向 viewer.entities 泄漏一个无人认领的 Label 尸体（不入任何句柄表，
        // TOC 移除 / 清空全部均无法触达）——「移除后标注仍在」的历史根因之一。
        if (active.previewLabel) {
            try {
                getViewer()?.entities.remove(active.previewLabel);
            } catch {
                /* viewer 可能已销毁 */
            }
            active.previewLabel = null;
        }
        active.sketch.forEach((e) => {
            try {
                getViewer()?.entities.remove(e);
            } catch {
                /* viewer 可能已销毁 */
            }
        });
        active = null;
    }

    function beginInteraction(type) {
        const viewer = getViewer?.();
        const C = getC();
        if (!viewer || !C || viewer.isDestroyed?.()) return false;

        active = {
            type,
            clicks: [],
            /** 每次 LEFT_CLICK 的屏幕像素坐标（finishInteraction 双击重复点剔除用） */
            clickPixels: [],
            cursorPos: null,
            handler: null,
            sketch: [],
            previewLabel: null,
        };

        const isClosedShape = type === 'Polygon' || type === 'MeasureArea';
        const dynamicPositions = () =>
            active.cursorPos ? [...active.clicks, active.cursorPos] : [...active.clicks];

        // 动态骨架：已点击折线 + 橡皮筋段 (+ 地面填充)
        active.sketch.push(
            viewer.entities.add({
                polyline: {
                    positions: new C.CallbackProperty(() => dynamicPositions(), false),
                    width: styleParams.strokeWidth + 1,
                    material: colorOf(styleParams.strokeColor, 0.9),
                    clampToGround: true,
                },
            }),
        );
        if (isClosedShape) {
            active.sketch.push(
                viewer.entities.add({
                    polygon: {
                        hierarchy: new C.CallbackProperty(
                            () => new C.PolygonHierarchy(dynamicPositions()),
                            false,
                        ),
                        material: colorOf(styleParams.fillColor, styleParams.fillOpacity * 0.7),
                    },
                }),
            );
        }
        active.previewLabel = viewer.entities.add({
            position: new C.CallbackProperty(() => active?.cursorPos ?? C.Cartesian3.ZERO, false),
            show: new C.CallbackProperty(() => !!active?.cursorPos, false),
            label: {
                text: '',
                font: '12px sans-serif',
                fillColor: C.Color.WHITE,
                showBackground: true,
                backgroundColor: C.Color.BLACK.withAlpha(0.55),
                pixelOffset: new C.Cartesian2(0, -18),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        });

        const minClicks = isClosedShape ? 3 : 2;

        const updatePreviewText = () => {
            if (!active?.previewLabel) return;

            let text = '单击加点，双击 / 右击结束';
            if (type === 'Point') text = '单击放置点标记';
            else if (active.clicks.length >= 2 && !isClosedShape) {
                text = formatDistanceMeasure(polylineLengthMeters(dynamicPositions()));
            } else if (isClosedShape && active.clicks.length >= 3) {
                text = formatAreaMeasure(polygonAreaSqMeters(dynamicPositions()));
            }

            // 1. 更新文本内容（原有逻辑）
            active.previewLabel.label.text = text;

            // 2. 【关键修复】根据动态位置更新 Label 位置，防止重叠
            //    注意：positions 为 Cesium Cartesian3 点集（来自 scenePicker.pickEarthPoint），
            //    必须以 x/y/z 语义处理。若误按 [lng,lat,h] 数组下标访问会得 undefined，
            //    fromDegrees(NaN,…) 生成的 NaN position 实体将使 Cesium 渲染
            //    （createPotentiallyVisibleSet）崩溃为 RangeError: Invalid array length。
            const positions = dynamicPositions();
            if (positions && positions.length > 0) {
                const C = getCesium(); // 确保作用域有 getCesium()，否则用 window.Cesium

                // 校验坐标有限性，杜绝 NaN/Infinity 进入渲染
                const isValid = (p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
                const sanitized = positions.filter(isValid);
                if (sanitized.length === 0) return undefined;

                if (type === 'Point') {
                    // 点：使用首个有效取点
                    active.previewLabel.position = C.Cartesian3.clone(
                        sanitized[0],
                        new C.Cartesian3(),
                    );
                } else if (!isClosedShape) {
                    // 线（测距）：使用折线末端点（随点增量移动）
                    const last = sanitized[sanitized.length - 1];
                    active.previewLabel.position = C.Cartesian3.clone(last, new C.Cartesian3());
                } else {
                    // 面（测面）：使用各点 Cartesian3 均值作为中心锚点
                    const center = centroidOf(sanitized);
                    active.previewLabel.position = C.Cartesian3.clone(center, new C.Cartesian3());
                }
            }

            // 3. 【状态同步】同步 Label 显隐与图层状态（可选，解决第二个 Bug）
            // const layerVisible = cesiumLayersStore.getRecord(active.id)?.visible;
            // active.previewLabel.show = layerVisible;
        };

        const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
        active.handler = handler;

        handler.setInputAction((movement) => {
            const picked = pickEarthPoint({ getCesium, getViewer, pixel: movement.position });
            if (!picked) return;
            active.clicks.push(picked);
            active.clickPixels.push({ x: movement.position.x, y: movement.position.y });
            updatePreviewText();
            if (type === 'Point') finishInteraction();
        }, C.ScreenSpaceEventType.LEFT_CLICK);

        handler.setInputAction((movement) => {
            if (!active) return;
            active.cursorPos = pickEarthPoint({
                getCesium,
                getViewer,
                pixel: movement.endPosition,
            });
            updatePreviewText();
        }, C.ScreenSpaceEventType.MOUSE_MOVE);

        const tryFinish = () => {
            if (!active) return;
            if (active.clicks.length >= minClicks) finishInteraction();
        };
        handler.setInputAction(tryFinish, C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
        handler.setInputAction(tryFinish, C.ScreenSpaceEventType.RIGHT_CLICK);
        return true;
    }

    function finishInteraction() {
        const snapshot = active;
        cancelActive();

        // 双击结束去重：双击结束前 Cesium 会先派发两次 LEFT_CLICK（同屏两点几乎重合），
        // 不剔除会造成测距虚高 / 线面末端赘点（右击结束无此现象，两侧行为对齐）。
        // 以屏幕像素间距判定 —— 地理距离阈值无法脱离相机高度换算（近地厘米级也真实），
        // 像素距离恒定可靠；阈值 3px 内视为同一点。
        const px = snapshot.clickPixels;
        if (snapshot.type !== 'Point' && px.length >= 2) {
            const dx = px[px.length - 1].x - px[px.length - 2].x;
            const dy = px[px.length - 1].y - px[px.length - 2].y;
            if (Math.hypot(dx, dy) <= 3) snapshot.clicks.pop();
        }

        const type = snapshot.type;
        const positions = [...snapshot.clicks];
        seed += 1;
        const id = `cesium-draw-${Date.now()}-${seed}`;
        const label = DRAW_TYPE_LABELS[type] || '图形';
        const prefix = type === 'MeasureDistance' || type === 'MeasureArea' ? '测量' : '绘制';
        const name = `${prefix}_${label}_${seed}`;

        const viewer = getViewer();
        const handle = {
            id,
            name,
            drawType: type,
            entities: [],
            styled: [],
            positions,
        };

        const pushEntity = (entity, kind, hexColor, baseAlpha) => {
            handle.entities.push(entity);
            trackStyle(handle, entity, kind, hexColor, baseAlpha);
        };

        if (type === 'Point') {
            const dot = viewer.entities.add({
                position: positions[0],
                point: {
                    pixelSize: 10,
                    color: colorOf(styleParams.strokeColor, 1),
                    outlineColor: getC().Color.WHITE,
                    outlineWidth: 2,
                    heightReference: clampHeightReference(),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
            });
            pushEntity(dot, 'point', styleParams.strokeColor, 1);
        } else if (type === 'LineString' || type === 'MeasureDistance') {
            if (positions.length < 2) return;
            const line = viewer.entities.add({
                polyline: {
                    positions,
                    width: styleParams.strokeWidth,
                    material: colorOf(styleParams.strokeColor, styleParams.strokeOpacity),
                    clampToGround: true,
                },
            });
            pushEntity(line, 'polyline', styleParams.strokeColor, styleParams.strokeOpacity);
            const totalMeters = polylineLengthMeters(positions);
            pushEntity(
                makeLabelEntity(
                    formatDistanceMeasure(totalMeters),
                    positions[positions.length - 1],
                ),
                'label',
                '#000000',
                0.55,
            );
        } else {
            // Polygon / MeasureArea
            if (positions.length < 3) return;
            const C = getC();
            const polygon = viewer.entities.add({
                polygon: {
                    hierarchy: new C.PolygonHierarchy(positions),
                    material: colorOf(styleParams.fillColor, styleParams.fillOpacity),
                },
            });
            pushEntity(polygon, 'polygon', styleParams.fillColor, styleParams.fillOpacity);
            // 地面多边形不支持轮廓线材质，补贴地描边折线保证边界清晰
            const ring = [...positions, positions[0]];
            const border = viewer.entities.add({
                polyline: {
                    positions: ring,
                    width: styleParams.strokeWidth,
                    material: colorOf(styleParams.strokeColor, styleParams.strokeOpacity),
                    clampToGround: true,
                },
            });
            pushEntity(border, 'polyline', styleParams.strokeColor, styleParams.strokeOpacity);
            if (type === 'MeasureArea') {
                const area = polygonAreaSqMeters(positions);
                pushEntity(
                    makeLabelEntity(formatAreaMeasure(area), centroidOf(positions)),
                    'label',
                    '#000000',
                    0.55,
                );
            }
        }

        registry.set(id, handle);
        orderIds.push(id);
        cesiumLayersStore.registerDrawing({ id, name, category: 'draw' });
    }

    // ────────────────────────── 对外能力 ──────────────────────────

    /**
     * 引擎交互路由入口（HomeView 经容器 expose 调用）
     * @param {string} type ControlsPanel 交互类型
     * @returns {boolean} 是否被本引擎消费；false = 类型不支持（宿主应提示降级）
     */
    function activateInteraction(type) {
        const nextType = String(type || '').trim();
        if (!SUPPORTED_INTERACTIONS.has(nextType)) return false;
        if (nextType === 'Clear') {
            // 清空成品前先终止进行中的绘制交互：否则 sketch/handler 仍存活，
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

    /** 更新后续绘制的默认样式（对齐 OL「影响后续绘制」语义；不改已成品实体） */
    function updateStyle(patch = {}) {
        const numeric = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
        if (typeof patch.strokeColor === 'string') styleParams.strokeColor = patch.strokeColor;
        if (typeof patch.fillColor === 'string') styleParams.fillColor = patch.fillColor;
        const w = numeric(patch.strokeWidth);
        if (w !== undefined && w > 0) styleParams.strokeWidth = w;
        const so = numeric(patch.strokeOpacity);
        if (so !== undefined) styleParams.strokeOpacity = Math.min(1, Math.max(0, so));
        const fo = numeric(patch.fillOpacity);
        if (fo !== undefined) styleParams.fillOpacity = Math.min(1, Math.max(0, fo));
    }

    /** 是否为绘制管理器持有的成品句柄（adapter 分流判据） */
    function isManaged(id) {
        return registry.has(String(id || ''));
    }

    function setVisible(id, visible) {
        const handle = registry.get(String(id));
        if (!handle) return;
        handle.entities.forEach((e) => {
            try {
                e.show = !!visible;
            } catch {
                /* ignore */
            }
        });
    }

    /** 透明度：按建档时的基色 × 系数回放（标签背景保持半黑可读） */
    function setOpacity(id, opacity) {
        const handle = registry.get(String(id));
        if (!handle) return;
        const o = Math.min(1, Math.max(0, Number(opacity) || 0));
        const C = getC();
        handle.styled.forEach(({ entity, kind, hexColor, baseAlpha }) => {
            try {
                const alpha = baseAlpha * o;
                if (kind === 'polyline') entity.polyline.material = colorOf(hexColor, alpha);
                else if (kind === 'polygon') entity.polygon.material = colorOf(hexColor, alpha);
                else if (kind === 'point') entity.point.color = colorOf(hexColor, alpha);
                else if (kind === 'label') {
                    entity.label.backgroundColor = C.Color.BLACK.withAlpha(alpha);
                    entity.label.fillColor = C.Color.WHITE.withAlpha(Math.min(1, 0.35 + 0.65 * o));
                }
            } catch {
                /* 实体可能已被场景销毁 */
            }
        });
    }

    function flyTo(id) {
        const handle = registry.get(String(id));
        const viewer = getViewer?.();
        if (!handle || !viewer || viewer.isDestroyed?.()) return;
        const sphere = getC().BoundingSphere.fromPoints(handle.positions);
        viewer.camera.flyToBoundingSphere(sphere, { duration: 0.8 });
    }

    /**
     * 移除单个成品（实体清理 + 建档删除由 store.remove → adapter 链路触发）。
     * 附带删除结果校验：逐一确认实体确已离开 viewer.entities，
     * 未消失者（引用被代理污染 / 句柄过期等异常情形）二次强制移除并告警，
     * 杜绝「链路已走完、场景仍显示」的静默不同步。
     */
    function removeHandle(id) {
        const key = String(id);
        const handle = registry.get(key);
        if (!handle) return;

        const viewer = getViewer();
        const survivors = [];
        let removedCount = 0;
        handle.entities.forEach((e) => {
            try {
                if (viewer?.entities.remove(e)) removedCount += 1;
            } catch {
                /* ignore */
            }
            // 校验回执：remove 返回值不可靠时以 contains 兜底判定
            if (e && typeof e === 'object' && viewer?.entities?.contains?.(e)) {
                try { viewer.entities.remove(e); } catch { /* 最终兜底失败 */ }
                if (viewer.entities.contains(e)) survivors.push(e.id ?? '(unknown)');
            }
        });
        if (survivors.length) {
            console.warn('[drawMeasure] 成品实体未能从场景移除（疑似句柄失配），受影响 id:', key, survivors);
        }

        registry.delete(key);
        const idx = orderIds.indexOf(key);
        if (idx >= 0) orderIds.splice(idx, 1);

        if (!removedCount && handle.entities.length) {
            console.warn('[drawMeasure] 实体清理数为 0 但句柄含实体', {
                id: key,
                expect: handle.entities.length,
                viewerAlive: !!viewer && !viewer.isDestroyed?.(),
            });
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
        cancelActive();
        registry.clear();
        orderIds.length = 0;
    }

    return {
        activateInteraction,
        updateStyle,
        isManaged,
        setVisible,
        setOpacity,
        flyTo,
        removeHandle,
        clearAllDrawings,
        reset,
    };
}
