/**
 * FirstPersonFlyController
 * 手绘贴地线路 + 第一/第三人称相机漫游的无头控制器（toolPanel 模块卡片直驱）
 *
 * 迁移自 Docs/Demo/first_person_fly.html，针对本项目做四点改造：
 * 1) 全程贴地：橡皮筋预览与最终路线均 clampToGround（宿主默认开地形）；
 *    预览段以 120ms 节流拾取压制 GroundPolylinePrimitive 重建频率，
 *    定稿后位置冻结无逐帧重建，兼顾贴地效果与流畅度。
 * 2) 表面高度三级采样：贴合建筑(scene.sampleHeight，含 3D Tiles) →
 *    sampleTerrainMostDetailed(异步精确地形，非椭球提供者时) → globe.getHeight 回退。
 * 3) CZML 时间轴 = 累积距离（1m:1s），速度完全交给 clock.multiplier——
 *    改速度滑块即时生效，无需重算时间轴。
 * 4) 相机跟随用 clock.onTick + camera.lookAt（不设 trackedEntity，避免抢控制权）；
 *    停止/解锁必须 lookAtTransform(IDENTITY)，否则鼠标操作失效。
 */

import JSZip from 'jszip';
import { downloadBlobFile } from '../planar-route/utils/comm';

const DEFAULT_PARAMS = {
    speed: 30,
    distance: 100,
    heading: 0,
    pitch: -30,
    flyHeight: 50,
    sampleStep: 20,
    clampToBuildings: true,
    showPath: true,
    showMarkers: true,
    showModel: true,
    modelScale: 1,
    modelHeadingOffset: 0,
    // 相对路径：public/glb/drone.glb，随 VITE_BASE_URL('./') 在部署子路径下同样可用
    modelUri: 'glb/drone.glb',
};

/** LAGRANGE 插值最高阶数（点数不足时自动降阶） */
const MAX_INTERPOLATION_DEGREE = 5;
/** 倍速上下限 */
const SPEED_MIN = 0.125;
const SPEED_MAX = 256;

export class FirstPersonFlyController {
    /**
     * @param {object} options
     * @param {() => object|null} options.getViewer 宿主 Viewer 获取器
     * @param {() => object|null} options.getCesium Cesium 命名空间获取器
     * @param {(patch: object) => void} [options.onStateChange] 运行时状态上报
     * @param {(info: { present: boolean, name: string, dataSource: object | null }) => void} [options.onWorkingSetChange] 图层管理工作集上报
     * @param {string} [options.defaultSourceName] 图层管理中的默认数据源名称
     */
    constructor({ getViewer, getCesium, onStateChange, onWorkingSetChange, defaultSourceName }) {
        this._getViewer = getViewer;
        this._getCesium = getCesium;
        this._onStateChange = onStateChange || (() => {});
        this._onWorkingSetChange = onWorkingSetChange || (() => {});
        this._defaultSourceName = defaultSourceName || '手绘漫游路线';

        this._viewer = null;
        this._dataSource = null;

        // 绘制态
        this._isDrawing = false;
        this._handler = null;
        this._rafId = null;
        this._pendingPos = null;
        this._movingPosition = null;
        /** 橡皮筋贴地线重建节流间隔（ms） */
        this._previewUpdateInterval = 120;
        this._lastPreviewUpdate = 0;
        this._previewLine = null;
        this._committedLine = null;
        this._markers = [];
        this._positions = [];

        // 飞行态
        this._czmlDataSource = null;
        this._entity = null;
        this._baseOrientation = null;
        this._unlistenTick = null;
        this._hasRoute = false;
        this._isFlying = false;
        this._isPaused = false;
        this._viewMode = 'third';
        /** 起飞时刻的离地高度基准，用于运行时动态偏移相机 target */
        this._baselineFlyHeight = null;
        /** 用户可控相机姿态：方位(°)/俯仰(°)/视距(m)——鼠标拖拽、滚轮、滑杆三向同步 */
        this._viewHeading = 0;
        this._viewPitch = -30;
        this._viewDistance = 100;
        /** 导出格式（geojson/kml/kmz），由模块控件写回 */
        this._exportFormat = 'geojson';
        /** 第一人称自由视角激活标志（位置跟模、朝向手控） */
        this._fpDragHandler = null;
        this._savedCtrl = null;

        this._params = { ...DEFAULT_PARAMS };
    }

    /* ================= 生命周期 ================= */

    /** 绑定宿主 Viewer（可重复调用；首次绑定时挂载数据源容器） */
    bind(viewer) {
        if (!viewer || this._viewer === viewer) return;
        this._viewer = viewer;
        this._ensureDataSource();
        if (this._hasRoute || this._markers.length > 0) {
            // viewer 重建后重挂已有内容由 dataSource 承载，此处仅刷新工作集可见性
            this._reportWorkingSet(this._hasRoute);
        }
    }

    _ensureDataSource() {
        const viewer = this._viewer;
        const Cesium = this._getCesium();
        if (!viewer || !Cesium || this._dataSource) return;
        this._dataSource = new Cesium.CustomDataSource('route-fly');
        viewer.dataSources.add(this._dataSource);
    }

    _patch(patch) {
        this._onStateChange(patch);
    }

    _reportWorkingSet(present) {
        this._onWorkingSetChange({
            present,
            name: this._defaultSourceName,
            dataSource: present ? this._dataSource : null,
        });
    }

    /* ================= 绘制 ================= */

    /** 开始绘制：左键加点、鼠标橡皮筋预览、右键结束 */
    startDrawing() {
        const viewer = this._viewer;
        const Cesium = this._getCesium();
        if (!viewer || !Cesium || this._isDrawing) return;

        this.clearFlight();
        this._clearRouteEntities();
        this._ensureDataSource();

        this._positions = [];
        this._isDrawing = true;
        this._hasRoute = false;
        this._patch({ isDrawing: true, pointCount: 0, hasRoute: false, isFlying: false, isPaused: false });

        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        this._handler = handler;

        handler.setInputAction((click) => {
            const cartesian = this._pickPosition(click.position);
            if (!cartesian) return;
            this._positions.push(cartesian);
            this._addMarker(cartesian);
            this._ensureDrawLines();
            this._patch({ pointCount: this._positions.length });
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        // 橡皮筋预览：拾取节流至 PREVIEW_UPDATE_INTERVAL，控制贴地线重建频率
        handler.setInputAction((movement) => {
            this._pendingPos = movement.endPosition;
            if (this._rafId) return;
            const wait = Math.max(
                0,
                this._previewUpdateInterval - (performance.now() - this._lastPreviewUpdate),
            );
            this._rafId = setTimeout(() => {
                this._rafId = null;
                this._lastPreviewUpdate = performance.now();
                const pos = this._pendingPos;
                this._pendingPos = null;
                if (!pos) return;
                const cartesian = this._pickPosition(pos);
                if (cartesian) this._movingPosition = cartesian;
            }, wait);
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        handler.setInputAction(() => {
            this.finishDrawing();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    /** 结束绘制：冻结航点 → 移除预览线 → 提交 clampToGround 贴地定稿线 */
    finishDrawing() {
        if (!this._isDrawing) return;
        this._isDrawing = false;
        this._destroyHandler();
        this._movingPosition = null;

        // 移除绘制期双线（贴地确认线 + 橡皮筋虚线）
        if (this._previewLine) {
            this._dataSource.entities.remove(this._previewLine);
            this._previewLine = null;
        }
        if (this._committedLine) {
            this._dataSource.entities.remove(this._committedLine);
            this._committedLine = null;
        }

        const Cesium = this._getCesium();
        if (this._positions.length >= 2) {
            // 定稿线：位置不再变化，clampToGround 安全启用（无逐帧重建开销）
            this._dataSource.entities.add({
                polyline: {
                    positions: this._positions.slice(),
                    clampToGround: true,
                    width: 3,
                    material: Cesium.Color.fromCssColorString('#00e5ff'),
                    depthFailMaterial: Cesium.Color.fromCssColorString('#00e5ff').withAlpha(0.35),
                },
            });
            this._hasRoute = true;
            this._reportWorkingSet(true);
        } else {
            this._clearRouteEntities();
        }

        this._patch({
            isDrawing: false,
            hasRoute: this._hasRoute,
            pointCount: this._positions.length,
        });
    }

    /** 取消绘制（等同结束但不校验最少点数，无效路线自动清理） */
    cancelDrawing() {
        if (!this._isDrawing) return;
        this._destroyHandler();
        this._isDrawing = false;
        this._movingPosition = null;
        if (this._positions.length < 2) {
            this._clearRouteEntities();
            this._patch({ isDrawing: false, pointCount: 0, hasRoute: false });
        } else {
            this.finishDrawing();
        }
    }

    /** 深度缓冲优先拾取：命中建筑取屋顶；未命中回退地表求交 */
    _pickPosition(windowPosition) {
        const viewer = this._viewer;
        const Cesium = this._getCesium();
        const scene = viewer.scene;
        if (scene.pickPositionSupported) {
            const picked = scene.pickPosition(windowPosition);
            if (Cesium.defined(picked)) return picked;
        }
        const ray = viewer.camera.getPickRay(windowPosition);
        if (!ray) return null;
        return scene.globe.pick(ray, scene);
    }

    /** 确保绘制期双线就位：已确认段贴地线（每次点击才重建）+ 橡皮筋直连虚线 */
    _ensureDrawLines() {
        const Cesium = this._getCesium();
        if (!Cesium || this._committedLine) return;

        // 已确认航点段：clampToGround 贴地形起伏；positions 仅在左键加点时变化，
        // 重建频率 = 点击频率，规避「CallbackProperty 逐帧变位 + 贴地」的每帧重建掉帧问题
        this._committedLine = this._dataSource.entities.add({
            polyline: {
                positions: new Cesium.CallbackProperty(() => this._positions.slice(), false),
                clampToGround: true,
                width: 3,
                material: Cesium.Color.fromCssColorString('#00e5ff'),
                depthFailMaterial: Cesium.Color.fromCssColorString('#00e5ff').withAlpha(0.35),
            },
        });

        // 橡皮筋引导段：最后确认点 → 鼠标当前位置
        // 贴地版：clampToGround 让预览段直接 draped 到地形起伏；
        // 配合 MOUSE_MOVE 的 120ms 节流拾取，把 GroundPolylinePrimitive
        // 的重建频率从每帧(~60Hz)压到 ~8Hz，流畅与贴地兼得
        this._previewLine = this._dataSource.entities.add({
            polyline: {
                positions: new Cesium.CallbackProperty(() => {
                    const last = this._positions[this._positions.length - 1];
                    if (this._isDrawing && this._movingPosition && last) {
                        return [last, this._movingPosition];
                    }
                    return undefined;
                }, false),
                clampToGround: true,
                width: 2,
                material: Cesium.Color.CYAN.withAlpha(0.85),
                depthFailMaterial: Cesium.Color.CYAN.withAlpha(0.4),
            },
        });
    }

    _addMarker(cartesian) {
        const Cesium = this._getCesium();
        const marker = this._dataSource.entities.add({
            position: cartesian,
            point: {
                pixelSize: 8,
                color: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.RED,
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        });
        marker.show = this._params.showMarkers;
        this._markers.push(marker);
    }

    _setMarkersShow(show) {
        this._markers.forEach((m) => (m.show = show));
    }

    _destroyHandler() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this._pendingPos = null;
        if (this._handler) {
            this._handler.destroy();
            this._handler = null;
        }
    }

    _clearRouteEntities() {
        if (!this._dataSource) return;
        if (this._previewLine) {
            this._dataSource.entities.remove(this._previewLine);
            this._previewLine = null;
        }
        if (this._committedLine) {
            this._dataSource.entities.remove(this._committedLine);
            this._committedLine = null;
        }
        this._markers.forEach((m) => this._dataSource.entities.remove(m));
        this._markers = [];
        this._dataSource.entities.values
            .filter((e) => e.polyline && e.polyline.clampToGround)
            .forEach((e) => this._dataSource.entities.remove(e));
        this._positions = [];
    }

    /* ================= 规划与飞行 ================= */

    /**
     * 规划并起飞：重采样 → 表面高度采样 → CZML 时间轴 → 相机跟随
     * @returns {Promise<void>}
     */
    async startFly() {
        const Cesium = this._getCesium();
        const viewer = this._viewer;
        if (!Cesium || !viewer) return;
        if (this._isDrawing) throw new Error('DRAWING');
        if (this._positions.length < 2) throw new Error('NO_ROUTE');

        this.clearFlight(false);

        const built = await this._buildTimeline();
        if (!(built.duration > 0)) throw new Error('ZERO_LENGTH');

        const degree = Math.min(MAX_INTERPOLATION_DEGREE, Math.max(1, built.sampleCount - 1));
        this._czmlDataSource = new Cesium.CzmlDataSource('route-fly');
        await viewer.dataSources.add(this._czmlDataSource);
        await this._loadCzml(built.degrees, built.duration, degree);

        this._isFlying = true;
        this._isPaused = false;
        this._baselineFlyHeight = Number(this._params.flyHeight) || 0;
        viewer.clock.multiplier = this._params.speed;
        viewer.clock.shouldAnimate = true;
        this._syncCameraRig();
        this._reportWorkingSet(true);
        this._patch({
            isFlying: true,
            isPaused: false,
            multiplier: this._params.speed,
            routeLengthText: `${built.length.toFixed(1)} m`,
            durationText: `${built.duration.toFixed(1)} s`,
            lastPreset: this._viewMode,
        });
    }

    /**
     * 重采样 + 三级表面高度采样 + 时间轴构建
     * @returns {Promise<{degrees: number[], length: number, duration: number, sampleCount: number}>}
     */
    async _buildTimeline() {
        const Cesium = this._getCesium();
        const step = Math.max(1, Number(this._params.sampleStep) || 20);
        const cartos = this._positions.map((p) => Cesium.Cartographic.fromCartesian(p));

        // 沿各段按采样间距插值出平面坐标（末段终点单独补齐）
        const samples = [];
        for (let i = 0; i < cartos.length - 1; i++) {
            const a = cartos[i];
            const b = cartos[i + 1];
            const segLength = Cesium.Cartesian3.distance(this._positions[i], this._positions[i + 1]);
            const count = Math.max(1, Math.ceil(segLength / step));
            for (let k = 0; k < count; k++) {
                const t = k / count;
                samples.push(new Cesium.Cartographic(
                    Cesium.Math.lerp(a.longitude, b.longitude, t),
                    Cesium.Math.lerp(a.latitude, b.latitude, t),
                    Cesium.Math.lerp(a.height, b.height, t),
                ));
            }
        }
        samples.push(cartos[cartos.length - 1].clone());

        // 三级高度采样（采样期间隐藏标记点，防止把自绘实体计入表面）
        const markersWereVisible = this._params.showMarkers;
        this._setMarkersShow(false);
        let heights;
        try {
            heights = await this._sampleSurfaceHeights(samples);
        } finally {
            this._setMarkersShow(markersWereVisible);
        }

        // 时间轴：1m:1s 基准，速度交给 clock.multiplier
        const flyHeight = Number(this._params.flyHeight) || 0;
        const degrees = [];
        let elapsed = 0;
        let total = 0;
        let prev = null;
        for (let i = 0; i < samples.length; i++) {
            const c = samples[i];
            const h = (Number.isFinite(heights[i]) ? heights[i] : c.height) + flyHeight;
            const current = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, h);
            if (prev) {
                const d = Cesium.Cartesian3.distance(prev, current);
                total += d;
                elapsed += d;
            }
            degrees.push(elapsed, Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude), h);
            prev = current;
        }
        return { degrees, length: total, duration: elapsed, sampleCount: samples.length };
    }

    /**
     * 三级表面高度采样：
     * ① 贴合建筑开 → scene.sampleHeight（含 3D Tiles，同步）
     * ② 地形提供者非椭球 → sampleTerrainMostDetailed（异步批量精确）
     * ③ 回退 globe.getHeight / 采样点自带高程
     */
    async _sampleSurfaceHeights(samples) {
        const Cesium = this._getCesium();
        const scene = this._viewer.scene;
        const heights = new Array(samples.length);

        if (this._params.clampToBuildings && scene.sampleHeightSupported) {
            for (let i = 0; i < samples.length; i++) {
                const h = scene.sampleHeight(samples[i]);
                heights[i] = Number.isFinite(h) ? h : undefined;
            }
            return heights;
        }

        const provider = this._viewer.scene.globe.terrainProvider;
        const isEllipsoid = !provider || provider instanceof Cesium.EllipsoidTerrainProvider;
        if (!isEllipsoid && Cesium.sampleTerrainMostDetailed) {
            try {
                const resolved = await Cesium.sampleTerrainMostDetailed(provider, samples.map((c) => c.clone()));
                return resolved.map((c) => c.height);
            } catch {
                /* 落入下方回退 */
            }
        }

        return samples.map((c) => {
            const h = scene.globe.getHeight(c);
            return Number.isFinite(h) ? h : undefined;
        });
    }

    /** 装载 CZML 并接管实体朝向（模型偏航偏移只在实体层生效，相机用原始速度朝向） */
    async _loadCzml(degrees, duration, degree) {
        const Cesium = this._getCesium();
        const p = this._params;
        const startTime = Cesium.JulianDate.fromDate(new Date());
        const stopTime = Cesium.JulianDate.addSeconds(startTime, duration, new Cesium.JulianDate());
        const startStr = Cesium.JulianDate.toIso8601(startTime);
        const interval = `${startStr}/${Cesium.JulianDate.toIso8601(stopTime)}`;

        const czml = [
            {
                id: 'document',
                name: 'route-fly',
                version: '1.0',
                clock: { interval, currentTime: startStr, multiplier: 1 },
            },
            {
                id: 'route-fly',
                name: '手绘线路漫游',
                availability: interval,
                path: {
                    material: { polylineDash: { color: { rgba: [0, 255, 255, 255] } } },
                    width: 2,
                    show: p.showPath,
                },
                model: p.showModel && p.modelUri
                    ? {
                          gltf: p.modelUri,
                          scale: p.modelScale,
                          minimumPixelSize: 32,
                          maximumScale: 200,
                      }
                    : undefined,
                orientation: { velocityReference: '#position' },
                position: {
                    interpolationAlgorithm: 'LAGRANGE',
                    interpolationDegree: degree,
                    epoch: startStr,
                    cartographicDegrees: degrees,
                },
            },
        ];

        await this._czmlDataSource.load(czml);
        this._entity = this._czmlDataSource.entities.getById('route-fly');
        this._baseOrientation = this._entity.orientation;

        // 实体朝向 = 速度朝向 × 偏移；_baseOrientation 保持原样供相机解算
        const base = this._baseOrientation;
        this._entity.orientation = new Cesium.CallbackProperty((time, result) => {
            const q = base.getValue(time);
            if (!q) return undefined;
            const offset = Number(p.modelHeadingOffset) || 0;
            if (!offset) return Cesium.Quaternion.clone(q, result || new Cesium.Quaternion());
            const offsetQ = Cesium.Quaternion.fromHeadingPitchRoll(
                new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(offset), 0, 0),
            );
            return Cesium.Quaternion.multiply(q, offsetQ, result || new Cesium.Quaternion());
        }, false);
    }

    /* ================= 相机跟随 ================= */

    /* ================= 相机跟随（统一装配） ================= */

    /** 飞行期间接管相机：原生 rotate/tilt 关闭，拖拽语义按视角模式自行解释 */
    _startFollow() {
        const viewer = this._viewer;
        const Cesium = this._getCesium();
        if (!viewer || !Cesium) return;
        this._stopFollow();

        const ctrl = viewer.scene.screenSpaceCameraController;
        this._savedCtrl = { rotate: ctrl.enableRotate, tilt: ctrl.enableTilt };
        ctrl.enableRotate = false;
        ctrl.enableTilt = false;

        this._unlistenTick = viewer.clock.onTick.addEventListener(() => this._followTick());

        this._fpDragHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        // 双向绑定：拖拽 → 偏航角/俯仰角（滑杆实时同步）；第一/第三人称通用
        this._fpDragHandler.setInputAction(({ startPosition, endPosition }) => {
            const dx = endPosition.x - startPosition.x;
            const dy = endPosition.y - startPosition.y;
            // 直接驱动相机姿态：方位/俯仰
            this._viewHeading = (this._viewHeading + dx * 0.15 + 540) % 360 - 180;
            this._viewPitch = Math.max(-89, Math.min(89, this._viewPitch - dy * 0.15));
            this._patch({ heading: Math.round(this._viewHeading), pitch: Math.round(this._viewPitch) });
        }, Cesium.ScreenSpaceEventType.LEFT_DRAG);

        // 滚轮：直接驱动视距（<2m 即第一人称观感，模型自动隐藏）
        this._wheelListener = (event) => {
            event.preventDefault();
            const step = -Math.sign(event.deltaY);
            if (!step) return;
            this._viewDistance = Math.max(0, this._viewDistance * Math.pow(1.12, step));
            this._patch({ distance: Math.round(this._viewDistance * 10) / 10 });
        };
        viewer.scene.canvas.addEventListener('wheel', this._wheelListener, { passive: false });
    }

    _stopFollow() {
        if (this._unlistenTick) {
            this._unlistenTick();
            this._unlistenTick = null;
        }
        if (this._fpDragHandler) {
            this._fpDragHandler.destroy();
            this._fpDragHandler = null;
        }
        const viewer = this._viewer;
        if (this._wheelListener && viewer) {
            viewer.scene.canvas.removeEventListener('wheel', this._wheelListener);
            this._wheelListener = null;
        }
        if (viewer && this._savedCtrl) {
            const ctrl = viewer.scene.screenSpaceCameraController;
            ctrl.enableRotate = this._savedCtrl.rotate;
            ctrl.enableTilt = this._savedCtrl.tilt;
            this._savedCtrl = null;
        }
    }

    /** 第一人称判定：预设为 first，或距离被拉到贴脸(<2m) */
    _isFirstPersonView() {
        return this._viewMode === 'first' || Number(this._viewDistance) < 2;
    }

    /**
     * 每帧跟随：相机位置 = 模型位置（含离地偏移），姿态完全由
     * _viewHeading / _viewPitch / _viewDistance（鼠标与滑杆双向绑定）决定。
     * 距离 0 即第一人称——相机与模型重合、模型自动隐藏。
     */
    _followTick() {
        const viewer = this._viewer;
        const Cesium = this._getCesium();
        if (!viewer || !Cesium || !this._entity) return;

        // 模型显隐跟随视角：贴脸(<2m)自动隐藏，避免糊屏
        const fp = this._isFirstPersonView();
        if (this._entity?.model && Cesium.defined(this._entity.model.show)) {
            const show = !fp && this._params.showModel !== false;
            if (this._entity.model.show !== show) this._entity.model.show = show;
        }

        let center = this._entity.position.getValue(viewer.clock.currentTime);
        if (!center) return;

        const baseline = this._baselineFlyHeight;
        const current = Number(this._params.flyHeight) || 0;
        if (baseline != null && current !== baseline) {
            const carto = Cesium.Cartographic.fromCartesian(center);
            carto.height += current - baseline;
            center = Cesium.Cartesian3.fromRadians(
                carto.longitude,
                carto.latitude,
                carto.height,
                viewer.scene.globe.ellipsoid,
            );
        }

        // 直接以相机姿态三元组设置视图：方位/俯仰/翻滚全部由用户掌控
        viewer.camera.setView({
            destination: center,
            orientation: {
                heading: Cesium.Math.toRadians(this._viewHeading),
                pitch: Cesium.Math.toRadians(this._viewPitch),
                roll: 0,
            },
        });

        // 视距 > 0 时把相机沿视线反方向退后，形成第三人称跟拍；0 = 第一人称
        const dist = Math.max(0, Number(this._viewDistance) || 0);
        if (dist > 0.01) {
            const backward = viewer.camera.directionNegated ?? Cesium.Cartesian3.negate(viewer.camera.direction, new Cesium.Cartesian3());
            viewer.camera.setView({
                destination: Cesium.Cartesian3.add(center, Cesium.Cartesian3.multiplyByScalar(backward, dist, new Cesium.Cartesian3()), new Cesium.Cartesian3()),
                orientation: {
                    heading: Cesium.Math.toRadians(this._viewHeading),
                    pitch: Cesium.Math.toRadians(this._viewPitch),
                    roll: 0,
                },
            });
        }
    }

    /* ================= 参数 setter（lil-gui onChange 直驱，并回显状态） ================= */

    setSpeed(speed) {
        const v = Math.min(SPEED_MAX, Math.max(SPEED_MIN, Number(speed) || 1));
        this._params.speed = v;
        if (this._viewer) this._viewer.clock.multiplier = v;
        this._patch({ multiplier: v });
    }

    speedUp() {
        this.setSpeed((this._viewer?.clock.multiplier || this._params.speed) * 2);
    }

    speedDown() {
        this.setSpeed((this._viewer?.clock.multiplier || this._params.speed) / 2);
    }

    setDistance(v) {
        this._viewDistance = Math.max(0, Number(v) || 0);
        this._patch({ distance: Math.round(this._viewDistance * 10) / 10 });
    }

    setHeading(v) {
        this._viewHeading = ((Number(v) || 0) + 540) % 360 - 180;
        this._patch({ heading: Math.round(this._viewHeading) });
    }

    setPitch(v) {
        this._viewPitch = Math.max(-89, Math.min(89, Number(v) || 0));
        this._patch({ pitch: Math.round(this._viewPitch) });
    }

    setFlyHeight(v) {
        this._params.flyHeight = Number(v) || 0;
        this._patch({ flyHeight: this._params.flyHeight });
    }

    setSampleStep(v) {
        this._params.sampleStep = Number(v) || 20;
        this._patch({ sampleStep: this._params.sampleStep });
    }

    setClampToBuildings(v) {
        this._params.clampToBuildings = Boolean(v);
        this._patch({ clampToBuildings: this._params.clampToBuildings });
    }

    setModelUri(uri) {
        this._params.modelUri = String(uri || '');
    }

    setModelShow(show) {
        this._params.showModel = Boolean(show);
        if (this._entity?.model) this._entity.model.show = this._params.showModel;
        this._patch({ showModel: this._params.showModel });
    }

    setModelScale(scale) {
        this._params.modelScale = Number(scale) || 1;
        if (this._entity?.model) this._entity.model.scale = this._params.modelScale;
    }

    setModelHeadingOffset(v) {
        this._params.modelHeadingOffset = Number(v) || 0;
    }

    setPathShow(show) {
        this._params.showPath = Boolean(show);
        if (this._entity?.path) this._entity.path.show = this._params.showPath;
        this._patch({ showPath: this._params.showPath });
    }

    setShowMarkers(show) {
        this._params.showMarkers = Boolean(show);
        this._setMarkersShow(Boolean(show));
        this._patch({ showMarkers: this._params.showMarkers });
    }

    /** 第一/第三人称一键预设：仅给三个姿态参数赋推荐初值，滑杆随后仍可自由微调 */
    applyViewPreset(type) {
        const preset = type === 'first' ? 'first' : 'third';
        this._lastPreset = preset;
        this._viewMode = preset;
        if (preset === 'first') {
            this._viewDistance = 0.1;
            this._viewPitch = 0;
            this._params.showModel = false; // 贴脸时模型糊满屏幕
        } else {
            this._viewDistance = 100;
            this._viewPitch = -30;
            this._params.showModel = true;
        }
        if (this._isFlying) this._syncCameraRig();
        this._patch({
            lastPreset: preset,
            distance: Math.round(this._viewDistance * 10) / 10,
            pitch: Math.round(this._viewPitch),
            showModel: this._params.showModel,
        });
    }

    /* ================= 相机装配 ================= */

    /** 按当前状态选择相机装配方式（飞行中实时切换） */
    _syncCameraRig() {
        if (!this._isFlying) {
            this._stopFollow();
            const Cesium = this._getCesium();
            if (Cesium && this._viewer) {
                this._viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            }
            return;
        }
        this._startFollow();
    }

    /* ================= 路线导入 / 导出 ================= */

    setExportFormat(fmt) {
        const v = String(fmt || 'geojson').toLowerCase();
        this._exportFormat = ['geojson', 'kml', 'kmz'].includes(v) ? v : 'geojson';
        this._patch({ exportFormat: this._exportFormat });
    }

    /**
     * 按当前格式导出已绘路线（无路线时抛 NO_ROUTE）
     */
    exportRoute() {
        const Cesium = this._getCesium();
        if (!Cesium || this._positions.length < 2) throw new Error('NO_ROUTE');

        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const name = `route-fly-${stamp}`;
        const cartos = this._positions.map((p) => Cesium.Cartographic.fromCartesian(p));

        if (this._exportFormat === 'geojson') {
            // GeoJSON LineString FeatureCollection（coordinates: [lng,lat,height]）
            const geojson = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        properties: { name, createdAt: new Date().toISOString() },
                        geometry: {
                            type: 'LineString',
                            coordinates: cartos.map((c) => [
                                Number(Cesium.Math.toDegrees(c.longitude).toFixed(8)),
                                Number(Cesium.Math.toDegrees(c.latitude).toFixed(8)),
                                Number(c.height.toFixed(2)),
                            ]),
                        },
                    },
                ],
            };
            downloadBlobFile(JSON.stringify(geojson, null, 2), `${name}.geojson`);
            return;
        }

        const kml = this._buildKml(name, cartos);
        if (this._exportFormat === 'kml') {
            downloadBlobFile(kml, `${name}.kml`);
            return;
        }
        // kmz：kml 打包为 zip 容器
        const zip = new JSZip();
        zip.file(`${name}.kml`, kml);
        zip.generateAsync({ type: 'blob' }).then((blob) => downloadBlobFile(blob, `${name}.kmz`));
    }

    /** 生成 KML 文本（LineString + tessellate，坐标含高程） */
    _buildKml(name, cartos) {
        const Cesium = this._getCesium();
        const coords = cartos
            .map(
                (c) =>
                    `${Cesium.Math.toDegrees(c.longitude).toFixed(8)},${Cesium.Math.toDegrees(
                        c.latitude,
                    ).toFixed(8)},${c.height.toFixed(2)}`,
            )
            .join(' ');
        return (
            `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<kml xmlns="http://www.opengis.net/kml/2.0"><Document><name>${name}</name>` +
            `<Placemark><name>${name}</name>` +
            '<LineString><tessellate>true</tessellate>' +
            `<coordinates>${coords}</coordinates></LineString></Placemark>` +
            '</Document></kml>'
        );
    }

    /**
     * 应用导入的路线文件（文件选择框由编排器在手势栈内打开）
     * @param {File} file
     * @returns {Promise<void>}
     */
    async applyImportFile(file) {
        const Cesium = this._getCesium();
        if (!Cesium || !file) throw new Error('IMPORT_FAILED');

        const ext = String(file.name || '').split('.').pop().toLowerCase();
        let text = '';
        try {
            if (ext === 'kmz') {
                const zip = await JSZip.loadAsync(file);
                const kmlEntry = Object.keys(zip.files).find((n) =>
                    n.toLowerCase().endsWith('.kml'),
                );
                if (!kmlEntry) throw new Error('IMPORT_EMPTY');
                text = await zip.files[kmlEntry].async('string');
            } else {
                text = await file.text();
            }
        } catch (e) {
            if (e instanceof Error && e.message === 'IMPORT_EMPTY') throw e;
            throw new Error('IMPORT_FAILED');
        }

        const cartographics =
            ext === 'json' || ext === 'geojson'
                ? this._parseRouteJson(text)
                : this._parseRouteKml(text);
        if (cartographics.length < 2) throw new Error('IMPORT_EMPTY');

        // 清理既有飞行/绘制产物后，按定稿路径渲染（含 clampToGround 贴地线与航点标记）
        this.clearFlight();
        this._destroyHandler();
        this._isDrawing = false;
        this._movingPosition = null;
        this._clearRouteEntities();

        this._ensureDataSource();
        this._positions = cartographics.map((c) =>
            Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height),
        );
        this._ensureDrawLines();
        for (const p of this._positions) this._addMarker(p);

        this._hasRoute = true;
        this._reportWorkingSet(true);
        this._patch({
            isDrawing: false,
            pointCount: this._positions.length,
            hasRoute: true,
            isFlying: false,
            isPaused: false,
        });
    }

    /**
     * 解析 JSON 文本：优先 GeoJSON（FeatureCollection/Feature/LineString），
     * 兼容旧版 { points: [{lng,lat,height?}] } 与 [[lng,lat],...] 数组形态
     */
    _parseRouteJson(text) {
        const Cesium = this._getCesium();
        if (!Cesium) return [];
        try {
            const data = JSON.parse(text);
            let rawPoints = null;

            if (Array.isArray(data)) {
                rawPoints = data;
            } else if (data?.type === 'FeatureCollection') {
                rawPoints = data.features?.[0]?.geometry?.coordinates;
            } else if (data?.type === 'Feature') {
                rawPoints = data.geometry?.coordinates;
            } else if (data?.geometry?.type === 'LineString') {
                rawPoints = data.geometry.coordinates;
            } else if (Array.isArray(data?.points)) {
                rawPoints = data.points;
            }
            if (!Array.isArray(rawPoints)) return [];

            return rawPoints
                .map((p) => {
                    const lng = Number(Array.isArray(p) ? p[0] : p?.lng);
                    const lat = Number(Array.isArray(p) ? p[1] : p?.lat);
                    const height = Number(Array.isArray(p) ? p[2] : p?.height ?? 0);
                    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
                    return new Cesium.Cartographic(
                        Cesium.Math.toRadians(lng),
                        Cesium.Math.toRadians(lat),
                        Number.isFinite(height) ? height : 0,
                    );
                })
                .filter(Boolean);
        } catch {
            return [];
        }
    }

    /** 解析 KML 文本：取首个 LineString 的 coordinates */
    _parseRouteKml(text) {
        const Cesium = this._getCesium();
        if (!Cesium) return [];
        try {
            const doc = new DOMParser().parseFromString(text, 'text/xml');
            const node = doc.getElementsByTagName('coordinates')[0];
            const raw = String(node?.textContent || '').trim();
            if (!raw) return [];
            return raw
                .split(/\s+/)
                .map((triplet) => {
                    const [lngText, latText, hText] = triplet.split(',');
                    const lng = Number(lngText);
                    const lat = Number(latText);
                    const height = Number(hText ?? 0);
                    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
                    return new Cesium.Cartographic(
                        Cesium.Math.toRadians(lng),
                        Cesium.Math.toRadians(lat),
                        Number.isFinite(height) ? height : 0,
                    );
                })
                .filter(Boolean);
        } catch {
            return [];
        }
    }

    /* ================= 播放控制 ================= */

    suspend() {
        const viewer = this._viewer;
        if (!viewer || !this._isFlying) return this._isFlying;
        viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate;
        this._isPaused = !viewer.clock.shouldAnimate;
        this._patch({ isPaused: this._isPaused });
        return !this._isPaused;
    }

    /** 停止漫游：暂停时钟 + 解锁相机（保留路线与图层条目） */
    stop() {
        const viewer = this._viewer;
        if (viewer) viewer.clock.shouldAnimate = false;
        this._stopFollow();
        const Cesium = this._getCesium();
        if (Cesium && viewer) viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        this._isFlying = false;
        this._isPaused = false;
        this._patch({ isFlying: false, isPaused: false });
    }

    /** 清除飞行产物（保留已绘路线）；keepClock=false 时恢复倍速 */
    clearFlight(restoreClock = true) {
        this.stop();
        if (this._czmlDataSource && this._viewer) {
            this._viewer.dataSources.remove(this._czmlDataSource, true);
        }
        this._czmlDataSource = null;
        this._entity = null;
        this._baseOrientation = null;
        if (this._viewer && restoreClock) this._viewer.clock.multiplier = 1;
    }

    /** 全部清空：飞行产物 + 绘制路线 + 工作集撤下 */
    clearAll() {
        this.clearFlight();
        this._clearRouteEntities();
        this._hasRoute = false;
        this._reportWorkingSet(false);
        this._patch({
            isDrawing: false,
            pointCount: 0,
            hasRoute: false,
            isFlying: false,
            isPaused: false,
        });
    }

    /**
     * 外部删除托管数据源前的复位：不触碰已被销毁的 DataSource 引用
     */
    detachForExternalRemoval() {
        this.stop();
        this._czmlDataSource = null;
        this._entity = null;
        this._baseOrientation = null;
        this._dataSource = null;
        this._markers = [];
        this._previewLine = null;
        this._committedLine = null;
        this._positions = [];
        this._hasRoute = false;
        this._isDrawing = false;
        this._destroyHandler();
        this._patch({
            isDrawing: false,
            pointCount: 0,
            hasRoute: false,
            isFlying: false,
            isPaused: false,
        });
    }

    /** 销毁：清空全部产物并摘除数据源 */
    destroy() {
        this.clearAll();
        if (this._dataSource && this._viewer) {
            this._viewer.dataSources.remove(this._dataSource, true);
        }
        this._dataSource = null;
        this._viewer = null;
    }
}
