/**
 * useCesiumRouteRendering.js — Cesium 公交 / 驾车路线渲染器（引擎感知迁移 P2）
 *
 * 方案来源：Docs/TODO/engine-aware-map-operations-migration-plan.md §3-P2
 *
 * 与 OL 侧 useRouteRendering 同签名的 8 个回调 + 选点 Promise，由 HomeView
 * 桥接函数按当前引擎注入 RoutePlannerPanel。天地图请求/解析在面板内（引擎无关），
 * 本模块只消费其结果载荷：
 * - 公交 route.segments[].segmentLine[].linePoint（分号/竖线分隔的经纬度串）
 * - 驾车 payload.routeLatLonStr + stepLinePoints[]
 * 坐标串解析为本模块自包含纯函数（与 ol/routing/utils/transitRouteBuilder.js
 * 的 normalize 语义一致；域边界禁止 import @ol，故本地实现）。
 *
 * 渲染：贴地折线（地面图元仅支持纯色材质，步行段以细线+低透明度区分，
 * 不做虚线——与 OL 虚线视觉存在已知差异，见日志遗留）；站点为 point+label。
 * 建档：cesiumLayersStore.registerDrawing({category:'route'}) → 「三维数据」分组。
 */

import { pickEarthPoint, cartesianToLngLat } from './scenePicker.js';

/** 与 OL useRouteStepStyles 色板一致（域边界禁止反向 import @ol，本地常量化） */
const BUS_PALETTE = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'];
const DRIVE_MAIN_COLOR = '#10B981';
const DRIVE_PREVIEW_COLOR = '#F59E0B';

// ────────────────── 坐标串解析（纯函数，语义对齐 transitRouteBuilder.js） ──────────────────

function normalizeLonLatPair(lon, lat) {
    let lng = Number(lon);
    let latitude = Number(lat);
    if (!Number.isFinite(lng) || !Number.isFinite(latitude)) return null;
    if (
        (Math.abs(lng) <= 90 && Math.abs(latitude) > 90) ||
        (Math.abs(lng) <= 60 && Math.abs(latitude) >= 90)
    ) {
        [lng, latitude] = [latitude, lng];
    }
    if (Math.abs(lng) > 180 || Math.abs(latitude) > 90) return null;
    return [lng, latitude];
}

function parseLinePoints(rawText) {
    const raw = String(rawText || '').trim();
    if (!raw) return [];
    const chunks = raw
        .split(/[;；|]/)
        .map((item) => item.trim())
        .filter(Boolean);
    const fromChunks = chunks
        .map((chunk) => {
            const nums = chunk
                .split(',')
                .map((v) => Number(v.trim()))
                .filter((v) => Number.isFinite(v));
            if (nums.length < 2) return null;
            return normalizeLonLatPair(nums[0], nums[1]);
        })
        .filter(Boolean);
    if (fromChunks.length >= 2) return fromChunks;

    const pairMatches = raw.match(/-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/g) || [];
    const fallback = pairMatches
        .map((pairText) => {
            const [lonText, latText] = pairText.split(',');
            return normalizeLonLatPair(lonText, latText);
        })
        .filter(Boolean);
    return fallback.length >= 2 ? fallback : [];
}

function parseLonLatText(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const [lonText, latText] = raw.split(',');
    if (lonText == null || latText == null) return null;
    return normalizeLonLatPair(lonText, latText);
}

/**
 * @param {object} deps
 * @param {Function} deps.getCesium Cesium 命名空间 getter
 * @param {Function} deps.getViewer Viewer getter
 * @param {object} deps.cesiumLayersStore cesiumLayers pinia store 实例
 */
export function createCesiumRouteFeature({ getCesium, getViewer, cesiumLayersStore }) {
    /** 已成图的路线句柄：mode('bus'|'drive') → { id, entities, stepPositions, positions } */
    const routeHandles = new Map();
    /** 当前步骤预览临时实体 */
    let previewEntities = [];
    /** 进行中的选点：{ type, resolve, handler } */
    let pendingPick = null;
    let seed = 0;

    // ────────────────────────── 内部工具 ──────────────────────────

    function getC() {
        return getCesium?.();
    }

    function colorOf(hexColor, alpha = 1) {
        try {
            return getC().Color.fromCssColorString(String(hexColor)).withAlpha(alpha);
        } catch {
            return getC().Color.fromCssColorString('#10B981').withAlpha(alpha);
        }
    }

    function toCartesians(lngLatList) {
        return lngLatList.map(([lng, lat]) => getC().Cartesian3.fromDegrees(lng, lat));
    }

    function safeViewer() {
        const v = getViewer?.();
        return v && !v.isDestroyed?.() ? v : null;
    }

    function addEntity(entity) {
        const viewer = safeViewer();
        if (!viewer) return null;
        try {
            return viewer.entities.add(entity);
        } catch {
            return null;
        }
    }

    function removeEntitySafe(entity) {
        if (!entity) return;
        try {
            safeViewer()?.entities.remove(entity);
        } catch {
            /* ignore */
        }
    }

    function makeStationMarker(position, stationName) {
        const C = getC();
        const name = String(stationName || '').trim();
        return [
            addEntity({
                position,
                point: {
                    pixelSize: 9,
                    color: colorOf('#FFFFFF', 1),
                    outlineColor: colorOf('#2980B9', 1),
                    outlineWidth: 2,
                    heightReference: C.HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
            }),
            name
                ? addEntity({
                      position,
                      label: {
                          text: name,
                          font: '11px sans-serif',
                          fillColor: C.Color.WHITE,
                          showBackground: true,
                          backgroundColor: C.Color.BLACK.withAlpha(0.55),
                          pixelOffset: new C.Cartesian2(0, -16),
                          disableDepthTestDistance: Number.POSITIVE_INFINITY,
                          heightReference: C.HeightReference.CLAMP_TO_GROUND,
                      },
                  })
                : null,
        ].filter(Boolean);
    }

    function clearPreview() {
        previewEntities.forEach(removeEntitySafe);
        previewEntities = [];
    }

    function destroyHandle(mode) {
        const handle = routeHandles.get(mode);
        if (!handle) return;
        handle.entities.forEach(removeEntitySafe);
        routeHandles.delete(mode);
    }

    function boundingSphereOf(cartesians) {
        return getC().BoundingSphere.fromPoints(cartesians);
    }

    function flyToSphere(sphere) {
        const viewer = safeViewer();
        if (!viewer || !sphere || !Number.isFinite(sphere.radius)) return;
        viewer.camera.flyToBoundingSphere(sphere, { duration: 0.9 });
    }

    function registerRecord(id, name) {
        cesiumLayersStore.registerDrawing({ id, name, category: 'route' });
    }

    // ────────────────────────── 公交 ──────────────────────────

    /**
     * 解析公交方案 → { lines:[{lngLats, segmentType, stepIndex}], markers:[{lngLat,name}] }
     * 站点按坐标去重合并（与 OL markerMap 语义一致）
     */
    function parseBusRoute(route) {
        const segments = Array.isArray(route?.segments) ? route.segments : [];
        const lines = [];
        const markerMap = new Map();

        segments.forEach((segment, stepIndex) => {
            const lineItems = Array.isArray(segment?.segmentLine)
                ? segment.segmentLine
                : segment?.segmentLine
                  ? [{ linePoint: String(segment.segmentLine) }]
                  : [];

            lineItems.forEach((lineItem) => {
                const pts = parseLinePoints(lineItem?.linePoint);
                if (pts.length < 2) return;
                lines.push({
                    lngLats: pts,
                    segmentType: Number(segment?.segmentType ?? 0),
                    stepIndex,
                });
            });

            const startCoord = parseLonLatText(segment?.stationStart?.lonlat);
            const endCoord = parseLonLatText(segment?.stationEnd?.lonlat);
            const merge = (coord, name) => {
                if (!coord) return;
                const key = `${coord[0].toFixed(4)},${coord[1].toFixed(4)}`;
                const existing = markerMap.get(key);
                if (!existing) {
                    markerMap.set(key, { coord, names: new Set(name ? [name] : []) });
                } else if (name) {
                    existing.names.add(name);
                }
            };
            merge(startCoord, String(segment?.stationStart?.name || '').trim());
            merge(endCoord, String(segment?.stationEnd?.name || '').trim());
        });

        const markers = [...markerMap.values()].map((item) => ({
            lngLat: item.coord,
            name: [...item.names].join(' / '),
        }));
        return { lines, markers };
    }

    async function drawBusRoute(route) {
        const { lines, markers } = parseBusRoute(route);
        if (!lines.length) throw new Error('公交方案中未找到分段信息（segments 为空）');

        destroyHandle('bus');
        clearPreview();
        seed += 1;
        const id = `cesium-route-bus-${Date.now()}-${seed}`;
        const handle = { id, entities: [], stepPositions: [], positions: [] };

        lines.forEach(({ lngLats, segmentType, stepIndex }) => {
            const cartesians = toCartesians(lngLats);
            const isWalk = segmentType === 0;
            const paletteColor = BUS_PALETTE[Math.abs(stepIndex) % BUS_PALETTE.length];
            const entity = addEntity({
                polyline: {
                    positions: cartesians,
                    width: isWalk ? 3 : 5,
                    material: colorOf(paletteColor, isWalk ? 0.6 : 0.88),
                    clampToGround: true,
                },
            });
            if (entity) handle.entities.push(entity);
            handle.stepPositions[stepIndex] = [
                ...(handle.stepPositions[stepIndex] || []),
                ...cartesians,
            ];
            handle.positions.push(...cartesians);
        });

        markers.forEach(({ lngLat, name }) => {
            const position = getC().Cartesian3.fromDegrees(lngLat[0], lngLat[1]);
            handle.entities.push(...makeStationMarker(position, name));
            handle.positions.push(position);
        });

        routeHandles.set('bus', handle);
        registerRecord(id, `公交方案_${seed}`);
        flyToSphere(boundingSphereOf(handle.positions));
    }

    // ────────────────────────── 驾车 ──────────────────────────

    function parseDrivePayload(payload) {
        const input = typeof payload === 'string' ? { routeLatLonStr: payload } : payload || {};
        const fullPts = parseLinePoints(input.routeLatLonStr || input.routelatlon || '');
        const steps = (Array.isArray(input.stepLinePoints) ? input.stepLinePoints : [])
            .map((text) => parseLinePoints(text))
            .filter((pts) => pts.length >= 2);
        return { fullPts, steps };
    }

    async function drawDriveRoute(payload) {
        const { fullPts, steps } = parseDrivePayload(payload);
        if (fullPts.length < 2) throw new Error('驾车方案未解析到可绘制的有效坐标点');

        destroyHandle('drive');
        clearPreview();
        seed += 1;
        const id = `cesium-route-drive-${Date.now()}-${seed}`;
        const handle = { id, entities: [], stepPositions: [], positions: [] };

        const fullCartesians = toCartesians(fullPts);
        const mainLine = addEntity({
            polyline: {
                positions: fullCartesians,
                width: 6,
                material: colorOf(DRIVE_MAIN_COLOR, 0.9),
                clampToGround: true,
            },
        });
        if (mainLine) handle.entities.push(mainLine);
        handle.positions.push(...fullCartesians);

        steps.forEach((pts, stepIndex) => {
            const stepCartesians = toCartesians(pts);
            handle.stepPositions[stepIndex] = stepCartesians;
        });

        // 起终点标注（首尾点，无名称）
        handle.entities.push(
            ...makeStationMarker(fullCartesians[0], ''),
            ...makeStationMarker(fullCartesians[fullCartesians.length - 1], ''),
        );

        routeHandles.set('drive', handle);
        registerRecord(id, `驾车方案_${seed}`);
        flyToSphere(boundingSphereOf(handle.positions));
    }

    // ────────────────────────── 步骤定位 / 预览 / 清理 ──────────────────────────

    function zoomToRouteStep(mode, stepIndex) {
        const handle = routeHandles.get(mode);
        const step = handle?.stepPositions?.[Number(stepIndex)];
        if (!step || !step.length) return false;
        flyToSphere(boundingSphereOf(step));
        return true;
    }

    function previewRouteStep(mode, stepIndex) {
        const handle = routeHandles.get(mode);
        const step = handle?.stepPositions?.[Number(stepIndex)];
        if (!step || !step.length) return false;
        clearPreview();
        const highlight = addEntity({
            polyline: {
                positions: step,
                width: 8,
                material: colorOf(DRIVE_PREVIEW_COLOR, 0.95),
                clampToGround: true,
            },
        });
        if (highlight) previewEntities.push(highlight);
        return true;
    }

    /**
     * 起终点选点（Promise 语义对齐 OL startBusPointPick）
     * @param {'start'|'end'} type
     * @returns {Promise<{lng:number,lat:number}|null>}
     */
    function startPointPick(type) {
        const viewer = safeViewer();
        const C = getC();
        if (!viewer || !C) return Promise.reject(new Error('三维场景尚未初始化'));

        cancelPendingPick();
        return new Promise((resolve) => {
            const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
            pendingPick = {
                type: type === 'end' ? 'end' : 'start',
                resolve,
                handler,
            };
            handler.setInputAction(async (movement) => {
                const picked = pickEarthPoint({ getCesium, getViewer, pixel: movement.position });
                const lngLat = picked ? cartesianToLngLat(C, picked) : null;
                settlePendingPick(lngLat);
            }, C.ScreenSpaceEventType.LEFT_CLICK);
            handler.setInputAction(() => settlePendingPick(null), C.ScreenSpaceEventType.RIGHT_CLICK);
        });
    }

    function settlePendingPick(result) {
        if (!pendingPick) return;
        try {
            pendingPick.handler.destroy();
        } catch {
            /* ignore */
        }
        pendingPick.resolve(result);
        pendingPick = null;
    }

    /** 取消进行中的选点（新选点/容器清理前调用，防悬挂 Promise） */
    function cancelPendingPick() {
        settlePendingPick(null);
    }

    /** TOC 移除路由：adapter.remove(id) 命中 route 句柄时走此清理 */
    function isManaged(id) {
        for (const handle of routeHandles.values()) {
            if (handle.id === String(id)) return true;
        }
        return false;
    }

    /**
     * 移除路线句柄（实体清理 + 显式校验）：
     * 与绘制管理器同款回执判定——remove 后仍 contains 者二次强制移除并告警，
     * 防「链路已走完、场景仍显示」的静默不同步。
     */
    function removeHandle(id) {
        const viewer = safeViewer();
        for (const [mode, handle] of routeHandles.entries()) {
            if (handle.id === String(id)) {
                handle.entities.forEach((e) => {
                    try {
                        viewer?.entities.remove(e);
                    } catch {
                        /* ignore */
                    }
                    if (e && typeof e === 'object' && viewer?.entities?.contains?.(e)) {
                        try { viewer.entities.remove(e); } catch { /* 最终兜底失败 */ }
                        if (viewer.entities.contains(e)) {
                            console.warn('[routeRender] 站点/折线实体未能从场景移除', { mode, entityId: e.id ?? '(unknown)' });
                        }
                    }
                });
                destroyHandle(mode);
                return true;
            }
        }
        return false;
    }

    function setVisible(id, visible) {
        const handle = [...routeHandles.values()].find((h) => h.id === String(id));
        handle?.entities.forEach((e) => {
            try {
                e.show = !!visible;
            } catch {
                /* ignore */
            }
        });
    }

    function setOpacity(id, opacity) {
        // 路线实体颜色在创建时已带透明度基线，此处整体乘系数需逐实体回放；
        // 方案 P2 简化：TOC 对 route 类关闭 supportsOpacity（见 store OPACITY_SUPPORTED_TYPES），本方法留作接口对齐
        void id;
        void opacity;
    }

    function flyTo(id) {
        const handle = [...routeHandles.values()].find((h) => h.id === String(id));
        if (handle?.positions?.length) flyToSphere(boundingSphereOf(handle.positions));
    }

    /** 容器卸载 / viewer 重建时复位（旧实体随旧 viewer 销毁） */
    function reset() {
        clearPreview();
        routeHandles.clear();
        settlePendingPick(null);
    }

    return {
        drawBusRoute,
        drawDriveRoute,
        zoomToRouteStep,
        previewRouteStep,
        clearPreview,
        startPointPick,
        cancelPendingPick,
        isManaged,
        removeHandle,
        setVisible,
        setOpacity,
        flyTo,
        reset,
    };
}
