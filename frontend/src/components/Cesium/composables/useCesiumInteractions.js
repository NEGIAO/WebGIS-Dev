import { ref } from 'vue';

const EMPTY_COORDINATE_DISPLAY = '经度: --, 纬度: --, 海拔: --米';

export function useCesiumInteractions({ getViewer, getCesium }) {
    let handler = null;
    let interactionCanvas = null;
    let canvasMouseLeaveHandler = null;
    const coordinateDisplay = ref('经度: 0.000000, 纬度: 0.000000, 海拔: 0.00米');

    function setupInteractions() {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer || !Cesium) return;

        cleanupInteractions();
        interactionCanvas = viewer.scene.canvas;
        handler = new Cesium.ScreenSpaceEventHandler(interactionCanvas);
        canvasMouseLeaveHandler = () => {
            coordinateDisplay.value = EMPTY_COORDINATE_DISPLAY;
        };
        interactionCanvas.addEventListener('mouseleave', canvasMouseLeaveHandler);

        handler.setInputAction((movement) => {
            updateCoordinateDisplay(movement.endPosition, viewer, Cesium);
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

    function updateCoordinateDisplay(windowPosition, viewer, Cesium) {
        const cartesian = pickCartesian(windowPosition, viewer, Cesium);
        if (!cartesian) {
            coordinateDisplay.value = EMPTY_COORDINATE_DISPLAY;
            return;
        }

        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        if (!cartographic || !Number.isFinite(cartographic.longitude) || !Number.isFinite(cartographic.latitude)) {
            coordinateDisplay.value = EMPTY_COORDINATE_DISPLAY;
            return;
        }

        const lng = Cesium.Math.toDegrees(cartographic.longitude).toFixed(6);
        const lat = Cesium.Math.toDegrees(cartographic.latitude).toFixed(6);
        const height = (Number.isFinite(cartographic.height) ? cartographic.height : 0).toFixed(2);
        coordinateDisplay.value = `经度: ${lng}, 纬度: ${lat}, 海拔: ${height}米`;
    }

    function pickCartesian(windowPosition, viewer, Cesium) {
        if (!windowPosition) return null;

        const scene = viewer.scene;
        const pickPosition = pickSceneDepthPosition(windowPosition, scene, Cesium);
        if (pickPosition) return pickPosition;

        const ray = viewer.camera.getPickRay(windowPosition);
        if (ray) {
            const globePosition = scene.globe.pick(ray, scene);
            if (isValidCartesian(globePosition)) return globePosition;
        }

        const ellipsoidPosition = viewer.camera.pickEllipsoid(windowPosition, scene.globe.ellipsoid);
        return isValidCartesian(ellipsoidPosition) ? ellipsoidPosition : null;
    }

    function pickSceneDepthPosition(windowPosition, scene, Cesium) {
        if (!scene.pickPositionSupported || typeof scene.pickPosition !== 'function') {
            return null;
        }

        const pickedObject = typeof scene.pick === 'function' ? scene.pick(windowPosition) : null;
        if (!Cesium.defined(pickedObject)) return null;

        const position = scene.pickPosition(windowPosition);
        return isValidCartesian(position) ? position : null;
    }

    function isValidCartesian(position) {
        return !!position
            && Number.isFinite(position.x)
            && Number.isFinite(position.y)
            && Number.isFinite(position.z);
    }

    function cleanupInteractions() {
        if (canvasMouseLeaveHandler && interactionCanvas) {
            interactionCanvas.removeEventListener('mouseleave', canvasMouseLeaveHandler);
            canvasMouseLeaveHandler = null;
        }
        interactionCanvas = null;

        if (handler) {
            handler.destroy();
            handler = null;
        }
    }

    return {
        coordinateDisplay,
        setupInteractions,
        cleanupInteractions,
    };
}
