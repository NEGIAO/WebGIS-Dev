/**
 * heightLimitAnalysis.js
 * 限高分析器：在指定多边形范围内，用 ClassificationPrimitive 对超过限高的
 * 3D Tiles 建筑表面染色，并以黄色截面框可视化限高平面。
 *
 * 移植自 Docs/Demo/height_limit_analysis.html。
 * 范围来源两种：① 按场景中 3D Tileset 包围球自动框选（fitToTileset）
 *              ② 手绘多边形（左键加点、右键结束，≥3 点生效）。
 * 设计约束：不直接 import Cesium（注入 getCesium/getViewer），可独立销毁。
 */

import { pickCartesian, cartesianToDegrees } from './analysisMath';

export class HeightLimitAnalysis {
    /**
     * @param {object} options
     * @param {() => object} options.getViewer - 返回 Cesium.Viewer
     * @param {() => object} options.getCesium - 返回 Cesium 命名空间
     * @param {(patch: object) => void} [options.onStateChange] - 状态回写（isDrawing/hasRegion/statusText）
     */
    constructor({ getViewer, getCesium, onStateChange = () => {} }) {
        this._getViewer = getViewer;
        this._getCesium = getCesium;
        this._emitState = onStateChange;

        /** 分析参数（由 applyParams 覆盖） */
        this.params = {
            limitHeight: 80,          // 限高（米，椭球高）
            color: '#ff3b30',         // 超限染色
            opacity: 0.6,             // 染色不透明度
            showPlane: true,          // 显示限高截面框
        };

        /** 分析区域顶点（扁平 [lon, lat, ...]），≥3 点有效 */
        this.points = [];

        this._classification = null;  // ClassificationPrimitive（超限染色体）
        this._planeEntity = null;     // 限高截面框 Entity
        this._drawHandler = null;     // 绘制交互 handler
        this._draftPositions = [];    // 绘制中的顶点（度）
        this._draftEntities = [];     // 绘制辅助点
    }

    /** 合并参数并（若已有区域）重算 */
    applyParams(partial = {}) {
        Object.assign(this.params, partial);
        if (this.points.length >= 6) this.update();
    }

    /**
     * 按场景中第一个 3D Tileset 自动框选分析区域并推荐限高、飞行定位。
     * @returns {boolean} 是否找到 tileset
     */
    fitToTileset() {
        const Cesium = this._getCesium();
        const viewer = this._getViewer();
        if (!Cesium || !viewer) return false;

        const tileset = this._findFirstTileset(Cesium, viewer);
        if (!tileset) {
            this._emitState({ statusText: '限高：场景中未找到 3D Tiles，请先加载城市模型' });
            return false;
        }

        const boundingSphere = tileset.boundingSphere;
        const center = Cesium.Cartographic.fromCartesian(boundingSphere.center);
        const centerLon = Cesium.Math.toDegrees(center.longitude);
        const centerLat = Cesium.Math.toDegrees(center.latitude);

        // 推荐限高：模型底部 + 40% 包围球半径（与 demo 保持一致的经验值）
        const groundHeight = center.height - boundingSphere.radius * 0.3;
        this.params.limitHeight = Math.round(groundHeight + boundingSphere.radius * 0.4);

        // 以包围球半径 60% 生成矩形范围（经度按纬度余弦校正）
        const deltaLon = (boundingSphere.radius * 0.6) /
            (111000 * Math.cos(Cesium.Math.toRadians(centerLat)));
        const deltaLat = (boundingSphere.radius * 0.6) / 111000;
        this.points = [
            centerLon - deltaLon, centerLat - deltaLat,
            centerLon + deltaLon, centerLat - deltaLat,
            centerLon + deltaLon, centerLat + deltaLat,
            centerLon - deltaLon, centerLat + deltaLat,
        ];

        viewer.camera.flyToBoundingSphere(boundingSphere, {
            duration: 1.5,
            offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), boundingSphere.radius * 2.5),
        });

        this.update();
        return true;
    }

    /** 进入手绘区域模式：左键加点、右键结束（≥3 点生效） */
    startDrawRegion() {
        const Cesium = this._getCesium();
        const viewer = this._getViewer();
        if (!Cesium || !viewer || this._drawHandler) return;

        this._draftPositions = [];
        this._clearDraftEntities();
        viewer.canvas.style.cursor = 'crosshair';
        this._emitState({ isDrawing: true, statusText: '限高：左键添加顶点，右键结束绘制（至少 3 点）' });

        this._drawHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

        this._drawHandler.setInputAction((click) => {
            const cartesian = pickCartesian(Cesium, viewer, click.position);
            if (!cartesian) return;
            const deg = cartesianToDegrees(Cesium, cartesian);
            this._draftPositions.push(deg.longitude, deg.latitude);
            this._draftEntities.push(viewer.entities.add({
                position: cartesian,
                point: {
                    pixelSize: 8,
                    color: Cesium.Color.ORANGE,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 1,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
            }));
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        this._drawHandler.setInputAction(() => {
            this._finishDrawRegion();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    _finishDrawRegion() {
        const viewer = this._getViewer();
        this._teardownDrawHandler();
        this._clearDraftEntities();

        if (this._draftPositions.length >= 6) {
            this.points = [...this._draftPositions];
            this.update();
        } else {
            this._emitState({
                isDrawing: false,
                statusText: '限高：顶点不足 3 个，绘制已取消',
            });
        }
        this._draftPositions = [];
        if (viewer) viewer.scene.requestRender?.();
    }

    /** 重建染色体与截面框（参数或区域变化后调用） */
    update() {
        const Cesium = this._getCesium();
        const viewer = this._getViewer();
        if (!Cesium || !viewer || this.points.length < 6) return;

        this._rebuildClassification(Cesium, viewer);
        this._rebuildPlaneEntity(Cesium, viewer);

        this._emitState({
            isDrawing: false,
            hasRegion: true,
            statusText: `限高：${this.params.limitHeight}m，区域 ${this.points.length / 2} 顶点，超限部分已染色`,
        });
    }

    /** ClassificationPrimitive：对限高平面以上的 3D Tiles 表面染色 */
    _rebuildClassification(Cesium, viewer) {
        if (this._classification) {
            viewer.scene.primitives.remove(this._classification);
            this._classification = null;
        }
        const color = Cesium.Color.fromCssColorString(this.params.color)
            .withAlpha(this.params.opacity);

        const polygonInstance = new Cesium.GeometryInstance({
            geometry: new Cesium.PolygonGeometry({
                polygonHierarchy: new Cesium.PolygonHierarchy(
                    Cesium.Cartesian3.fromDegreesArray(this.points),
                ),
                height: this.params.limitHeight,
            }),
            attributes: {
                color: Cesium.ColorGeometryInstanceAttribute.fromColor(color),
            },
        });

        this._classification = new Cesium.ClassificationPrimitive({
            geometryInstances: polygonInstance,
            appearance: new Cesium.PerInstanceColorAppearance({ translucent: true, closed: true }),
            classificationType: Cesium.ClassificationType.CESIUM_3D_TILE,
        });
        viewer.scene.primitives.add(this._classification);
    }

    /** 限高截面框（黄色半透明多边形 + 描边，CallbackProperty 跟随参数） */
    _rebuildPlaneEntity(Cesium, viewer) {
        if (this._planeEntity) {
            viewer.entities.remove(this._planeEntity);
            this._planeEntity = null;
        }
        if (!this.params.showPlane) return;

        this._planeEntity = viewer.entities.add({
            name: '限高截面框',
            polygon: {
                hierarchy: new Cesium.CallbackProperty(
                    () => new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(this.points)),
                    false,
                ),
                height: new Cesium.CallbackProperty(() => this.params.limitHeight, false),
                material: Cesium.Color.YELLOW.withAlpha(0.15),
                outline: true,
                outlineColor: Cesium.Color.YELLOW,
                outlineWidth: 2,
            },
        });
    }

    /** 从场景 primitives 中查找第一个 3D Tileset */
    _findFirstTileset(Cesium, viewer) {
        const primitives = viewer.scene.primitives;
        for (let i = 0; i < primitives.length; i += 1) {
            const primitive = primitives.get(i);
            if (primitive instanceof Cesium.Cesium3DTileset) return primitive;
        }
        return null;
    }

    _clearDraftEntities() {
        const viewer = this._getViewer();
        if (!viewer) return;
        for (const entity of this._draftEntities) viewer.entities.remove(entity);
        this._draftEntities = [];
    }

    _teardownDrawHandler() {
        const viewer = this._getViewer();
        if (viewer) viewer.canvas.style.cursor = 'default';
        if (this._drawHandler) {
            this._drawHandler.destroy();
            this._drawHandler = null;
        }
    }

    /** 清除分析结果与区域 */
    clear() {
        const viewer = this._getViewer();
        if (!viewer) return;
        this._teardownDrawHandler();
        this._clearDraftEntities();
        if (this._classification) { viewer.scene.primitives.remove(this._classification); this._classification = null; }
        if (this._planeEntity) { viewer.entities.remove(this._planeEntity); this._planeEntity = null; }
        this.points = [];
        this._emitState({ isDrawing: false, hasRegion: false, statusText: '限高：结果已清除' });
    }

    /** 完全销毁（模块关闭 / 组件卸载时调用） */
    destroy() {
        this.clear();
    }
}
