export function useCesiumSceneActions({ getViewer, getCesium, message }) {
    function flyToHome(param) {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer || !Cesium) return;

        const duration = typeof param === 'number' ? param : 2;
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(104.1954, 35.8617, 15000000),
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

    async function loadCustomTileset() {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer || !Cesium) return;

        try {
            const tileset = await Cesium.Cesium3DTileset.fromUrl(
                'https://raw.githubusercontent.com/CesiumGS/3d-tiles-samples/master/1.0/TilesetWithDiscreteLOD/tileset.json',
            );
            viewer.scene.primitives.add(tileset);
            viewer.flyTo(tileset, {
                duration: 3,
                offset: new Cesium.HeadingPitchRange(
                    Cesium.Math.toRadians(0.0),
                    Cesium.Math.toRadians(-25.0),
                    tileset.boundingSphere.radius * 2.5,
                ),
            });
        } catch (error) {
            message.error(`加载模型失败: ${error}`);
            message.error('加载3D模型失败，可能是网络原因无法访问 GitHub 资源。', {
                closable: true,
                duration: 6500,
            });
        }
    }

    return {
        flyToHome,
        flyToEverest,
        loadCustomTileset,
    };
}
