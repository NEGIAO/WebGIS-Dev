import { ref } from 'vue';
import Wind2D from '../../Wind2D';

export function useCesiumWind({ getViewer, getCesium, message }) {
    const wind2D = ref(null);
    const windParams = ref({
        speedFactor: 1.0,
        arrowLength: 15000,
        trailLength: 20000,
        alphaFactor: 1.0,
        // UI 状态（与模块控件同步）
        windEnabled: false,
        particleCount: 10000,
        maxAge: 3.0,
        colorScale: 1.5,
        frameRate: 30,
        wind2DEnabled: false,
    });

    function clearWind2D() {
        const viewer = getViewer?.();
        if (!wind2D.value) return;

        try {
            viewer?.scene?.primitives?.remove(wind2D.value);
        } catch (e) {
            console.warn('Wind2D primitive remove warning:', e);
        }
        wind2D.value.destroy();
        wind2D.value = null;
        windParams.value = { ...windParams.value, windEnabled: false };
    }

    function loadSimulatedWind() {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer || !Cesium) {
            message.error('Cesium 尚未初始化');
            return;
        }

        clearWind2D();

        try {
            const data = generateSimulatedWindData(Cesium);
            wind2D.value = new Wind2D(viewer, {
                maxWindSpeed: 20,
                cesium: Cesium,
                speedFactor: windParams.value.speedFactor,
                arrowLength: windParams.value.arrowLength,
                trailLength: windParams.value.trailLength,
                alphaFactor: windParams.value.alphaFactor,
                decaySpeed: 1.0 / Math.max(1, windParams.value.maxAge * 60),
            });

            wind2D.value.loadData(data);
            wind2D.value.setParticleCount(windParams.value.particleCount);
            viewer.scene.primitives.add(wind2D.value);
            wind2D.value.flyTo();

            windParams.value = { ...windParams.value, windEnabled: true };
            message.success('风场加载成功，可通过下方滑块调节样式');
        } catch (e) {
            console.error('[Wind] 风场加载失败:', e);
            message.error(`风场加载失败: ${e.message || '未知错误'}。请检查浏览器是否支持 WebGL2。`);
            clearWind2D();
        }
    }

    function applyWindParams() {
        if (!wind2D.value) return;
        wind2D.value.speedFactor = windParams.value.speedFactor;
        wind2D.value.arrowLength = windParams.value.arrowLength;
        wind2D.value.trailLength = windParams.value.trailLength;
        wind2D.value.alphaFactor = windParams.value.alphaFactor;
        wind2D.value.decaySpeed = 1.0 / Math.max(1, windParams.value.maxAge * 60);
    }

    function setWindParam(controlId, value) {
        if (!(controlId in windParams.value)) return false;
        windParams.value = {
            ...windParams.value,
            [controlId]: Number(value),
        };
        // 部分参数需要额外操作
        if (controlId === 'particleCount' && wind2D.value) {
            wind2D.value.setParticleCount(Number(value));
        }
        applyWindParams();
        return true;
    }

    return {
        wind2D,
        windParams,
        clearWind2D,
        loadSimulatedWind,
        setWindParam,
    };
}

function generateSimulatedWindData(Cesium) {
    const centerLon = 104.0;
    const centerLat = 35.0;
    const layerCount = 5;
    const altitudes = [0, 2000, 5000, 10000, 15000];
    const sizeMesh = [30000, 30000, 25000, 25000, 20000];
    const counts = [30, 30, 25, 25, 20];

    const totalPoints = counts.reduce((sum, c) => sum + c * c, 0);
    const hspeed = new Array(totalPoints);
    const hdir = new Array(totalPoints);
    const vspeed = new Array(totalPoints);

    let offset = 0;
    for (let k = 0; k < layerCount; k++) {
        const nx = counts[k];
        const ny = counts[k];
        const gridSize = sizeMesh[k];
        for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) {
                const idx = offset + j * nx + i;
                const dx = (i - nx / 2) * (gridSize / 111320.0);
                const dy =
                    (j - ny / 2) *
                    (gridSize / 111320.0 / Math.cos(Cesium.Math.toRadians(centerLat)));
                const baseAngle = Math.atan2(dy, dx) + Math.PI / 2;
                const angle = baseAngle + 0.2 * Math.sin(i * 0.5) * Math.cos(j * 0.5);
                hdir[idx] = Cesium.Math.toDegrees(angle) % 360;

                const dist = Math.sqrt(dx * dx + dy * dy);
                const maxDist = 15;
                const factor = Math.max(0, 1 - dist / maxDist);
                hspeed[idx] = (5 + k * 2) * factor + 2 * Math.random();
                vspeed[idx] = 0.5 * Math.sin(i * 0.3) * Math.cos(j * 0.3);
            }
        }
        offset += nx * ny;
    }

    return {
        longitude: centerLon,
        latitude: centerLat,
        altitude: altitudes,
        sizeMesh,
        count: counts,
        hspeed,
        hdir,
        vspeed,
    };
}
