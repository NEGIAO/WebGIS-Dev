/**
 * FirstPersonFlyController
 * 手绘贴地线路 + 第一/第三人称相机漫游的无头控制器（toolPanel 模块卡片直驱）
 */

import { buildRouteKml, parseRouteJson, parseRouteKml } from './routeSerialize';
import {
    applyRouteFlyFollowTick,
    buildRouteFlyTimeline,
    createRouteDrawLines,
    exportRouteFlyFile,
    loadRouteFlyCzml,
    parseImportedRouteFlyFile,
    sampleRouteSurfaceHeights,
} from './routeFlyTimelineAndIo';

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
    modelUri: 'glb/drone.glb',
};

const MAX_INTERPOLATION_DEGREE = 5;
const SPEED_MIN = 0.125;
const SPEED_MAX = 256;

export class FirstPersonFlyController {
    private _getCesium: () => any;
    private _onStateChange: (patch: Record<string, unknown>) => void;
    private _onWorkingSetChange: (info: { present: boolean; name: string; dataSource: unknown }) => void;
    private _defaultSourceName: string;

    private _viewer: any = null;
    private _dataSource: any = null;

    private _isDrawing = false;
    private _handler: any = null;
    private _rafId: any = null;
    private _pendingPos: any = null;
    private _movingPosition: any = null;
    private _previewUpdateInterval = 120;
    private _lastPreviewUpdate = 0;
    private _previewLine: any = null;
    private _committedLine: any = null;
    private _markers: any[] = [];
    private _positions: any[] = [];

    private _czmlDataSource: any = null;
    private _entity: any = null;
    private _unlistenTick: any = null;
    private _hasRoute = false;
    private _isFlying = false;
    private _isPaused = false;
    private _viewMode = 'third';
    private _baselineFlyHeight: number | null = null;
    private _viewHeading = 0;
    private _viewPitch = -30;
    private _viewDistance = 100;
    private _exportFormat = 'geojson';
    private _fpDragHandler: any = null;
    private _wheelListener: any = null;
    private _savedCtrl: any = null;

    private _params = { ...DEFAULT_PARAMS };

    constructor({
        getCesium,
        onStateChange,
        onWorkingSetChange,
        defaultSourceName,
    }: {
        getViewer?: () => any;
        getCesium: () => any;
        onStateChange?: (patch: Record<string, unknown>) => void;
        onWorkingSetChange?: (info: { present: boolean; name: string; dataSource: unknown }) => void;
        defaultSourceName?: string;
    }) {
        this._getCesium = getCesium;
        this._onStateChange = onStateChange || (() => {});
        this._onWorkingSetChange = onWorkingSetChange || (() => {});
        this._defaultSourceName = defaultSourceName || '手绘漫游路线';
        this._params = { ...DEFAULT_PARAMS };
    }

    /* ================= 生命周期 ================= */

    bind(viewer: any) {
        if (!viewer || this._viewer === viewer) return;
        this._viewer = viewer;
        this._ensureDataSource();
        if (this._hasRoute || this._markers.length > 0) {
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

    _patch(patch: any) {
        this._onStateChange(patch);
    }

    _reportWorkingSet(present: any) {
        this._onWorkingSetChange({
            present,
            name: this._defaultSourceName,
            dataSource: present ? this._dataSource : null,
        });
    }

    /* ================= 绘制 ================= */

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

        handler.setInputAction((click: any) => {
            const cartesian = this._pickPosition(click.position);
            if (!cartesian) return;
            this._positions.push(cartesian);
            this._addMarker(cartesian);
            this._ensureDrawLines();
            this._patch({ pointCount: this._positions.length });
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        handler.setInputAction((movement: any) => {
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

    finishDrawing() {
        if (!this._isDrawing) return;
        this._isDrawing = false;
        this._destroyHandler();
        this._movingPosition = null;

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

    _pickPosition(windowPosition: any) {
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

    _ensureDrawLines() {
        const Cesium = this._getCesium();
        if (!Cesium || this._committedLine) return;

        const { committedLine, previewLine } = createRouteDrawLines({
            Cesium,
            dataSource: this._dataSource,
            getPositions: () => this._positions,
            isDrawing: () => this._isDrawing,
            getMovingPosition: () => this._movingPosition,
        });
        this._committedLine = committedLine;
        this._previewLine = previewLine;
    }

    _addMarker(cartesian: any) {
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

    _setMarkersShow(show: any) {
        this._markers.forEach((m) => (m.show = show));
    }

    _destroyHandler() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId as number);
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
            .filter((e: any) => e.polyline && e.polyline.clampToGround)
            .forEach((e: any) => this._dataSource.entities.remove(e));
        this._positions = [];
    }

    /* ================= 规划与飞行 ================= */

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

    async _buildTimeline() {
        return buildRouteFlyTimeline({
            Cesium: this._getCesium(),
            viewer: this._viewer,
            positions: this._positions,
            params: this._params,
            setMarkersShow: (show: boolean) => this._setMarkersShow(show),
        });
    }

    async _sampleSurfaceHeights(samples: any) {
        return sampleRouteSurfaceHeights(
            this._getCesium(),
            this._viewer,
            samples,
            Boolean(this._params.clampToBuildings),
        );
    }

    async _loadCzml(degrees: any, duration: any, degree: any) {
        const { entity } = await loadRouteFlyCzml({
            Cesium: this._getCesium(),
            czmlDataSource: this._czmlDataSource,
            degrees,
            duration,
            degree,
            params: this._params,
        });
        this._entity = entity;
    }

    /* ================= 相机跟随（统一装配） ================= */

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
        this._fpDragHandler.setInputAction(({ startPosition, endPosition }: { startPosition: any; endPosition: any }) => {
            const dx = endPosition.x - startPosition.x;
            const dy = endPosition.y - startPosition.y;
            this._viewHeading = (this._viewHeading + dx * 0.15 + 540) % 360 - 180;
            this._viewPitch = Math.max(-89, Math.min(89, this._viewPitch - dy * 0.15));
            this._patch({ heading: Math.round(this._viewHeading), pitch: Math.round(this._viewPitch) });
        }, Cesium.ScreenSpaceEventType.LEFT_DRAG);

        this._wheelListener = (event: any) => {
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

    _isFirstPersonView() {
        return this._viewMode === 'first' || Number(this._viewDistance) < 2;
    }

    _followTick() {
        applyRouteFlyFollowTick({
            viewer: this._viewer,
            Cesium: this._getCesium(),
            entity: this._entity,
            isFirstPerson: this._isFirstPersonView(),
            params: this._params,
            baselineFlyHeight: this._baselineFlyHeight,
            viewHeading: this._viewHeading,
            viewPitch: this._viewPitch,
            viewDistance: this._viewDistance,
        });
    }

    /* ================= 参数 setter ================= */

    setSpeed(speed: any) {
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

    setDistance(v: any) {
        this._viewDistance = Math.max(0, Number(v) || 0);
        this._patch({ distance: Math.round(this._viewDistance * 10) / 10 });
    }

    setHeading(v: any) {
        this._viewHeading = ((Number(v) || 0) + 540) % 360 - 180;
        this._patch({ heading: Math.round(this._viewHeading) });
    }

    setPitch(v: any) {
        this._viewPitch = Math.max(-89, Math.min(89, Number(v) || 0));
        this._patch({ pitch: Math.round(this._viewPitch) });
    }

    setFlyHeight(v: any) {
        this._params.flyHeight = Number(v) || 0;
        this._patch({ flyHeight: this._params.flyHeight });
    }

    setSampleStep(v: any) {
        this._params.sampleStep = Number(v) || 20;
        this._patch({ sampleStep: this._params.sampleStep });
    }

    setClampToBuildings(v: any) {
        this._params.clampToBuildings = Boolean(v);
        this._patch({ clampToBuildings: this._params.clampToBuildings });
    }

    setModelUri(uri: any) {
        this._params.modelUri = String(uri || '');
    }

    setModelShow(show: any) {
        this._params.showModel = Boolean(show);
        if (this._entity?.model) this._entity.model.show = this._params.showModel;
        this._patch({ showModel: this._params.showModel });
    }

    setModelScale(scale: any) {
        this._params.modelScale = Number(scale) || 1;
        if (this._entity?.model) this._entity.model.scale = this._params.modelScale;
    }

    setModelHeadingOffset(v: any) {
        this._params.modelHeadingOffset = Number(v) || 0;
    }

    setPathShow(show: any) {
        this._params.showPath = Boolean(show);
        if (this._entity?.path) this._entity.path.show = this._params.showPath;
        this._patch({ showPath: this._params.showPath });
    }

    setShowMarkers(show: any) {
        this._params.showMarkers = Boolean(show);
        this._setMarkersShow(Boolean(show));
        this._patch({ showMarkers: this._params.showMarkers });
    }

    applyViewPreset(type: any) {
        const preset = type === 'first' ? 'first' : 'third';
        this._viewMode = preset;
        if (preset === 'first') {
            this._viewDistance = 0.1;
            this._viewPitch = 0;
            this._params.showModel = false;
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

    setExportFormat(fmt: any) {
        const v = String(fmt || 'geojson').toLowerCase();
        this._exportFormat = ['geojson', 'kml', 'kmz'].includes(v) ? v : 'geojson';
        this._patch({ exportFormat: this._exportFormat });
    }

    exportRoute() {
        exportRouteFlyFile(this._getCesium(), this._positions, this._exportFormat);
    }

    async applyImportFile(file: any) {
        const Cesium = this._getCesium();
        const cartographics = await parseImportedRouteFlyFile(Cesium, file);

        this.clearFlight();
        this._destroyHandler();
        this._isDrawing = false;
        this._movingPosition = null;
        this._clearRouteEntities();

        this._ensureDataSource();
        this._positions = cartographics.map((c: any) =>
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

    _buildKml(name: any, cartos: any) {
        return buildRouteKml(this._getCesium(), name, cartos);
    }

    _parseRouteJson(text: any) {
        return parseRouteJson(this._getCesium(), text);
    }

    _parseRouteKml(text: any) {
        return parseRouteKml(this._getCesium(), text);
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

    clearFlight(restoreClock = true) {
        this.stop();
        if (this._czmlDataSource && this._viewer) {
            this._viewer.dataSources.remove(this._czmlDataSource, true);
        }
        this._czmlDataSource = null;
        this._entity = null;
        if (this._viewer && restoreClock) this._viewer.clock.multiplier = 1;
    }

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

    detachForExternalRemoval() {
        this.stop();
        this._czmlDataSource = null;
        this._entity = null;
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

    destroy() {
        this.clearAll();
        if (this._dataSource && this._viewer) {
            this._viewer.dataSources.remove(this._dataSource, true);
        }
        this._dataSource = null;
        this._viewer = null;
    }
}
