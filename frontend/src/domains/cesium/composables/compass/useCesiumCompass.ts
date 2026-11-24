/**
 * 功能名称：Cesium 风水罗盘（贴地地理实体 + 点选定位 + 宫位拾取）
 * 日    期：2026-11-24
 * 说    明：与 OL CompassManager 对齐的 3D 侧实现。地理罗盘通过 Entity.polygon +
 *           ImageMaterialProperty 贴地渲染，HUD 由 CesiumContainer 复用公共 SVG 组件。
 */
import { watch, type Ref } from 'vue';
import { drawCompassTexture } from '@common/compass/services/drawCompassTexture';
import { resolveCompassPalaceByPolar } from '@common/compass/services/compassHitTest';
import { clamp } from '@common/compass/services/compassDrawUtils';
import type { useCompassStore } from '@common/compass/stores/useCompassStore';

type CompassStore = ReturnType<typeof useCompassStore>;

/** 数据源登记 id（TOC 节点会加 cesium: 前缀） */
export const CESIUM_COMPASS_SOURCE_ID = 'compass';

interface CesiumCompassOptions {
    getCesium: () => any;
    getViewer: () => any;
    compassStore: CompassStore;
    cesiumReady: Ref<boolean>;
    loadedDataSources: Ref<any[]>;
    sourceName: string;
}

/**
 * 创建并维护 Cesium 罗盘场景对象。
 * @returns dispose 供容器卸载时清理实体、事件与数据源记录
 */
export function useCesiumCompass({
    getCesium,
    getViewer,
    compassStore,
    cesiumReady,
    loadedDataSources,
    sourceName,
}: CesiumCompassOptions) {
    let entity: any = null;
    let clickHandler: any = null;

    function removeEntity(): void {
        const viewer = getViewer();
        if (viewer && entity) {
            viewer.entities.remove(entity);
        }
        entity = null;
        syncSourceRecord(null);
    }

    function syncSourceRecord(target: any): void {
        const list = loadedDataSources.value || [];
        const exists = list.some((item: any) => item.id === CESIUM_COMPASS_SOURCE_ID);
        if (target && !exists) {
            loadedDataSources.value = [
                ...list,
                {
                    id: CESIUM_COMPASS_SOURCE_ID,
                    name: sourceName,
                    type: 'imagery',
                    entity: target,
                    managedByModule: true,
                },
            ];
        } else if (!target && exists) {
            loadedDataSources.value = list.filter(
                (item: any) => item.id !== CESIUM_COMPASS_SOURCE_ID,
            );
        }
    }

    /** 根据经纬度与米制半径构造贴地矩形顶点 */
    function buildHierarchy(Cesium: any): any {
        const lng = Number(compassStore.position.lng);
        const lat = Number(compassStore.position.lat);
        const radius = Math.max(1, Number(compassStore.physicalRadiusMeters || 1000));
        const safeLat = clamp(lat, -89.99, 89.99);
        const latDelta = radius / 111320;
        const lngDelta = radius / (111320 * Math.max(0.02, Math.cos((safeLat * Math.PI) / 180)));
        const positions = Cesium.Cartesian3.fromDegreesArray([
            lng - lngDelta, safeLat + latDelta,
            lng + lngDelta, safeLat + latDelta,
            lng + lngDelta, safeLat - latDelta,
            lng - lngDelta, safeLat - latDelta,
        ]);
        return new Cesium.PolygonHierarchy(positions);
    }

    /** 重建或刷新贴地罗盘实体 */
    function syncEntity(): void {
        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer) return;

        if (!compassStore.enabled || compassStore.mode !== 'vector' || !compassStore.hasValidPosition) {
            removeEntity();
            return;
        }

        const canvas = drawCompassTexture(compassStore.vectorRenderConfig, {
            size: 1024,
            backgroundColor: compassStore.bgColor,
            rotation: compassStore.rotation,
            selectedPalace: compassStore.selectedPalace,
        });
        const material = new Cesium.ImageMaterialProperty({
            image: canvas,
            transparent: true,
            color: new Cesium.Color(1, 1, 1, clamp(Number(compassStore.opacity), 0.1, 1)),
        });
        const hierarchy = buildHierarchy(Cesium);

        if (!entity) {
            entity = viewer.entities.add({
                id: `cesium-${CESIUM_COMPASS_SOURCE_ID}`,
                polygon: {
                    hierarchy,
                    material,
                    classificationType: Cesium.ClassificationType.BOTH,
                },
            });
            syncSourceRecord(entity);
            return;
        }

        entity.polygon.hierarchy = hierarchy;
        entity.polygon.material = material;
        syncSourceRecord(entity);
    }

    /** 取点击位置的地面 Cartographic：优先地形/模型命中，失败回退椭球 */
    function pickCartographic(Cesium: any, viewer: any, position: any): any | null {
        let cartesian: any = null;
        try {
            cartesian = viewer.scene.pickPosition(position);
        } catch {
            // pickPosition 在无深度纹理时会抛错，下面统一回退椭球
        }
        if (!cartesian) {
            cartesian = viewer.camera.pickEllipsoid(position, viewer.scene.globe?.ellipsoid);
        }
        if (!cartesian) return null;
        return Cesium.Cartographic.fromCartesian(cartesian);
    }

    /** 取点击位置的经纬度 */
    function pickLonLat(Cesium: any, viewer: any, position: any): [number, number] | null {
        const carto = pickCartographic(Cesium, viewer, position);
        if (!carto) return null;
        return [Cesium.Math.toDegrees(carto.longitude), Cesium.Math.toDegrees(carto.latitude)];
    }

    /** 处理点选定位与宫位拾取 */
    function handleLeftClick(click: any): void {
        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer || !compassStore.enabled || compassStore.mode !== 'vector') return;

        if (compassStore.placementMode) {
            const picked = pickLonLat(Cesium, viewer, click.position);
            if (picked) compassStore.setPosition(picked[0], picked[1]);
            return;
        }

        if (!compassStore.hasValidPosition) return;
        const clickCarto = pickCartographic(Cesium, viewer, click.position);
        if (!clickCarto) {
            compassStore.setSelectedPalace(null);
            return;
        }
        const centerCarto = Cesium.Cartographic.fromDegrees(
            Number(compassStore.position.lng),
            Number(compassStore.position.lat),
        );
        const geodesic = new Cesium.EllipsoidGeodesic(centerCarto, clickCarto);
        const hit = resolveCompassPalaceByPolar({
            distance: geodesic.surfaceDistance,
            bearingRad: geodesic.startHeading,
            radius: Number(compassStore.physicalRadiusMeters || 1000),
            config: compassStore.vectorRenderConfig,
            rotationDeg: Number(compassStore.rotation || 0),
        });

        if (!hit) {
            compassStore.setSelectedPalace(null);
            return;
        }
        compassStore.setSelectedPalace({
            layerIndex: hit.layerIndex,
            segmentIndex: hit.segmentIndex,
            data: hit.data,
            coord: [
                Cesium.Math.toDegrees(clickCarto.longitude),
                Cesium.Math.toDegrees(clickCarto.latitude),
            ],
        });
    }

    function bindClickHandler(): void {
        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer || clickHandler) return;
        clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        clickHandler.setInputAction(handleLeftClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    watch(
        () => [
            cesiumReady.value,
            compassStore.enabled,
            compassStore.mode,
            compassStore.position.lng,
            compassStore.position.lat,
            compassStore.physicalRadiusMeters,
            compassStore.rotation,
            compassStore.opacity,
            compassStore.bgColor,
            compassStore.renderCacheToken,
            compassStore.selectedPalace?.layerIndex,
            compassStore.selectedPalace?.segmentIndex,
        ],
        () => {
            if (!cesiumReady.value) return;
            bindClickHandler();
            syncEntity();
        },
        { immediate: true },
    );

    function dispose(): void {
        if (clickHandler) {
            clickHandler.destroy();
            clickHandler = null;
        }
        removeEntity();
    }

    return { dispose, syncEntity };
}
