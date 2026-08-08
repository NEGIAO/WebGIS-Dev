export function useCesiumSceneActions({ getViewer, getCesium, message }) {
    function flyToHome(param) {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer || !Cesium) return;

        const duration = typeof param === 'number' ? param : 2;
        // 使用与 DEFAULT_CESIUM_CAMERA 一致的高度 6,000,000m（中国居中视角）
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(104.1954, 35.8617, 6000000),
            orientation: {
                heading: 0.0,
                pitch: -Cesium.Math.PI_OVER_TWO,
                roll: 0.0,
            },
            duration,
        });
    }

    function flyToEverest() {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer || !Cesium) return;

        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(86.925, 27.9881, 9000),
            orientation: {
                heading: Cesium.Math.toRadians(0.0),
                pitch: Cesium.Math.toRadians(-25.0),
                roll: 0.0,
            },
            duration: 3,
        });
    }

    return {
        flyToHome,
        flyToEverest,
    };
}
