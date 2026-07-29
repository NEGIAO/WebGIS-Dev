/**
 * visibilityAnalysis.js
 * 通视分析器：以观察点为圆心，在给定方位角扇区内逐角度发射射线，
 * 与 3D Tiles / 地形求交，可见段与遮挡段分色渲染。
 *
 * 移植自 Docs/Demo/visibilityAnalysis.html（去 turf 依赖，扇形改用 analysisMath 自实现）。
 * 设计约束：不直接 import Cesium（注入 getCesium/getViewer），单一职责、可独立销毁。
 */

import { pickCartesian, cartesianToDegrees, destinationPoint, sectorRingDegrees } from './analysisMath';

export class VisibilityAnalysis {
    /**
     * @param {object} options
     * @param {() => object} options.getViewer - 返回 Cesium.Viewer
     * @param {() => object} options.getCesium - 返回 Cesium 命名空间
     * @param {(patch: object) => void} [options.onStateChange] - 状态回写（isPicking/hasResult/observerText/statusText）
     */
    constructor({ getViewer, getCesium, onStateChange = () => {} }) {
        this._getViewer = getViewer;
        this._getCesium = getCesium;
        this._emitState = onStateChange;

        /** 观察点（度/米）；null 表示尚未设置 */
        this.observer = null;

        /** 分析参数（由 applyParams 覆盖） */
        this.params = {
            distance: 300,       // 分析半径（米）
            step: 5,             // 方位角采样间隔（度）
            startAngle: -60,     // 起始方位角（度）
            endAngle: 60,        // 结束方位角（度）
            showSector: true,    // 是否显示扇形覆盖面
            lineWidth: 2,        // 射线宽度（像素）
            visibleColor: '#00ff7f',
            invisibleColor: '#ff4040',
        };

        this._observerEntity = null;   // 观察点标记
        this._sectorEntity = null;     // 扇形覆盖面
        this._lineEntities = [];       // 可见/遮挡线段集合
        this._pickHandler = null;      // 选点专用事件 handler
    }

    /** 合并参数并（若已有观察点）重算 */
    applyParams(partial = {}) {
        Object.assign(this.params, partial);
        if (this.observer) this.run();
        else if (this._sectorEntity) this._syncSectorVisibility();
    }

    /** 进入地图选点模式：左键拾取观察点（自动 +1.5m 防嵌入模型），选完即分析 */
    startPickObserver() {
        const Cesium = this._getCesium();
        const viewer = this._getViewer();
        if (!Cesium || !viewer || this._pickHandler) return;

        viewer.canvas.style.cursor = 'crosshair';
        this._emitState({ isPicking: true, statusText: '通视：左键点击地图设置观察点' });

        this._pickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        this._pickHandler.setInputAction((click) => {
            const cartesian = pickCartesian(Cesium, viewer, click.position);
            this._teardownPickHandler();
            if (!cartesian) {
                this._emitState({ isPicking: false, statusText: '通视：未拾取到有效位置，请重试' });
                return;
            }
            const deg = cartesianToDegrees(Cesium, cartesian);
            this.observer = {
                longitude: Number(deg.longitude.toFixed(6)),
                latitude: Number(deg.latitude.toFixed(6)),
                height: Number((deg.height + 1.5).toFixed(2)),
            };
            this._emitState({
                isPicking: false,
                observerText: `${this.observer.longitude}, ${this.observer.latitude} @${this.observer.height}m`,
            });
            this.run();
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    /** 执行通视计算与渲染（需已有观察点） */
    run() {
        const Cesium = this._getCesium();
        const viewer = this._getViewer();
        if (!Cesium || !viewer || !this.observer) return;

        this._clearLines();
        this._ensureObserverEntity();
        this._rebuildSectorEntity();

        const { longitude, latitude, height } = this.observer;
        const { distance, step, startAngle, endAngle } = this.params;
        const origin = Cesium.Cartesian3.fromDegrees(longitude, latitude, height);
        const excludes = this._collectExcludes();

        const from = Math.min(startAngle, endAngle);
        const to = Math.max(startAngle, endAngle);
        const safeStep = Math.max(1, step);
        let blocked = 0;
        let total = 0;

        for (let angle = from; angle <= to; angle += safeStep) {
            total += 1;
            const dest = destinationPoint(latitude, longitude, angle, distance);
            const end = Cesium.Cartesian3.fromDegrees(dest.longitude, dest.latitude, height);
            if (this._castSight(Cesium, viewer, origin, end, excludes)) blocked += 1;
        }

        this._emitState({
            hasResult: true,
            statusText: `通视：${total} 条射线，遮挡 ${blocked} 条（半径 ${distance}m）`,
        });
    }

    /**
     * 单条视线：pickFromRay 求首个交点，按命中距离拆分可见/遮挡两段
     * @returns {boolean} 是否存在遮挡
     */
    _castSight(Cesium, viewer, origin, end, excludes) {
        const direction = Cesium.Cartesian3.normalize(
            Cesium.Cartesian3.subtract(end, origin, new Cesium.Cartesian3()),
            new Cesium.Cartesian3(),
        );
        const visColor = Cesium.Color.fromCssColorString(this.params.visibleColor);
        const invisColor = Cesium.Color.fromCssColorString(this.params.invisibleColor);

        let result = null;
        // pickFromRay 为 scene 私有扩展 API，个别环境不支持时整段视为可见
        if (typeof viewer.scene.pickFromRay === 'function') {
            const ray = new Cesium.Ray(origin, direction);
            result = viewer.scene.pickFromRay(ray, excludes);
        }

        if (Cesium.defined(result) && Cesium.defined(result.position)) {
            const hitDistance = Cesium.Cartesian3.distance(result.position, origin);
            if (hitDistance < this.params.distance) {
                this._drawLine(Cesium, viewer, origin, result.position, visColor);
                this._drawLine(Cesium, viewer, result.position, end, invisColor);
                return true;
            }
        }
        this._drawLine(Cesium, viewer, origin, end, visColor);
        return false;
    }

    /** 画一段视线（depthFail 同色保证遮挡处仍可见轨迹） */
    _drawLine(Cesium, viewer, p1, p2, color) {
        const line = viewer.entities.add({
            polyline: {
                positions: [p1, p2],
                width: this.params.lineWidth,
                material: color,
                depthFailMaterial: color.withAlpha(0.35),
            },
        });
        this._lineEntities.push(line);
    }

    /** 观察点标记（黄色穿透点） */
    _ensureObserverEntity() {
        const Cesium = this._getCesium();
        const viewer = this._getViewer();
        if (this._observerEntity) {
            viewer.entities.remove(this._observerEntity);
        }
        this._observerEntity = viewer.entities.add({
            name: '通视观察点',
            position: Cesium.Cartesian3.fromDegrees(
                this.observer.longitude, this.observer.latitude, this.observer.height,
            ),
            point: {
                pixelSize: 10,
                color: Cesium.Color.YELLOW,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        });
    }

    /** 扇形覆盖面（半透明青色，随参数重建） */
    _rebuildSectorEntity() {
        const Cesium = this._getCesium();
        const viewer = this._getViewer();
        if (this._sectorEntity) {
            viewer.entities.remove(this._sectorEntity);
            this._sectorEntity = null;
        }
        const ring = sectorRingDegrees(
            this.observer.longitude,
            this.observer.latitude,
            this.params.distance,
            this.params.startAngle,
            this.params.endAngle,
        );
        this._sectorEntity = viewer.entities.add({
            name: '通视覆盖扇形',
            polygon: {
                hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(ring)),
                height: this.observer.height - 0.5,
                material: Cesium.Color.CYAN.withAlpha(0.18),
                show: this.params.showSector,
            },
        });
    }

    _syncSectorVisibility() {
        if (this._sectorEntity) this._sectorEntity.show = this.params.showSector;
    }

    /** pickFromRay 需排除自身辅助实体，避免射线打在自己画的线/面上 */
    _collectExcludes() {
        return [this._observerEntity, this._sectorEntity, ...this._lineEntities].filter(Boolean);
    }

    _clearLines() {
        const viewer = this._getViewer();
        if (!viewer) return;
        for (const entity of this._lineEntities) viewer.entities.remove(entity);
        this._lineEntities = [];
    }

    /** 清除全部结果（保留参数与观察点坐标不变） */
    clear() {
        const viewer = this._getViewer();
        if (!viewer) return;
        this._clearLines();
        if (this._observerEntity) { viewer.entities.remove(this._observerEntity); this._observerEntity = null; }
        if (this._sectorEntity) { viewer.entities.remove(this._sectorEntity); this._sectorEntity = null; }
        this.observer = null;
        this._emitState({ hasResult: false, observerText: '', statusText: '通视：结果已清除' });
    }

    _teardownPickHandler() {
        const viewer = this._getViewer();
        if (viewer) viewer.canvas.style.cursor = 'default';
        if (this._pickHandler) {
            this._pickHandler.destroy();
            this._pickHandler = null;
        }
    }

    /** 完全销毁（模块关闭 / 组件卸载时调用） */
    destroy() {
        this._teardownPickHandler();
        this.clear();
    }
}
