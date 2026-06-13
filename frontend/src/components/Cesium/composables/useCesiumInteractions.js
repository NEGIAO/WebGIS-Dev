import { ref } from 'vue';

export function useCesiumInteractions({ getViewer, getCesium }) {
    let handler = null;
    const coordinateDisplay = ref('经度: 0.000000, 纬度: 0.000000, 海拔: 0.00米');

    function setupInteractions() {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer || !Cesium) return;

        cleanupInteractions();
        handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

        handler.setInputAction((movement) => {
            const ray = viewer.camera.getPickRay(movement.endPosition);
            if (!ray) return;
            const position = viewer.scene.globe.pick(ray, viewer.scene);
            if (!position) return;

            const cartographic = Cesium.Cartographic.fromCartesian(position);
            const lng = Cesium.Math.toDegrees(cartographic.longitude).toFixed(6);
            const lat = Cesium.Math.toDegrees(cartographic.latitude).toFixed(6);
            const height = cartographic.height.toFixed(2);
            coordinateDisplay.value = `经度: ${lng}, 纬度: ${lat}, 海拔: ${height}米`;
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        handler.setInputAction((movement) => {
            const deltaMove = movement.endPosition;
            const startPosition = movement.startPosition;

            if (!Cesium.defined(viewer.terrainProvider)) {
                return;
            }

            const ellipsoid = viewer.scene.globe.ellipsoid;
            const cartesian = viewer.camera.pickEllipsoid(startPosition, ellipsoid);
            if (!cartesian) {
                const camera = viewer.camera;
                const moveRate = 0.002;
                camera.rotate(Cesium.Cartesian3.UNIT_X, -moveRate * (deltaMove.y - startPosition.y));
                camera.rotate(Cesium.Cartesian3.UNIT_Y, -moveRate * (deltaMove.x - startPosition.x));
            }
        }, Cesium.ScreenSpaceEventType.RIGHT_DRAG);

        handler.setInputAction(() => {}, Cesium.ScreenSpaceEventType.RIGHT_DOWN);
        handler.setInputAction(() => {}, Cesium.ScreenSpaceEventType.RIGHT_UP);
    }

    function cleanupInteractions() {
        if (!handler) return;
        handler.destroy();
        handler = null;
    }

    return {
        coordinateDisplay,
        setupInteractions,
        cleanupInteractions,
    };
}
