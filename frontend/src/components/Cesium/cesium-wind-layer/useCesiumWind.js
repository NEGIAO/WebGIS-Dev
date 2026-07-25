/**
 * useCesiumWind.js
 * 风场 Composable — 基于 cesium-wind-layer 的 2D 风场加载与控制
 *
 * 替换了旧的自研 Wind2D 管线，改用 cesium-wind-layer（WindLayer）：
 * - 数据源：frontend/public/json/wind_globe.json（GFS 全球风场 U/V 分量）
 * - 运行时参数面板通过 updateOptions() 动态更新
 * - 按需加载：用户点击「启用风场」才 fetch + 创建
 */
import { ref } from 'vue';
import Wind2D from './Wind2D';

export function useCesiumWind({ getViewer, getCesium, message }) {
    const wind2D = ref(null);
    const windParams = ref({
        windEnabled: false,
        particlesTextureSize: 600,
        particleHeight: 1000,
        lineWidthVal: 10,
        lineLengthVal: 800,
        speedFactor: 1.0,
        dropRate: 0.003,
        dropRateBump: 0.001,
        dynamic: true,
    });

    /** 清除风场 */
    function clearWind2D() {
        if (!wind2D.value) return;

        try {
            wind2D.value.destroy();
        } catch (e) {
            console.warn('Wind2D destroy warning:', e);
        }
        wind2D.value = null;
        windParams.value = { ...windParams.value, windEnabled: false };
    }

    /** 从 wind_globe.json 加载风场数据 */
    async function loadWindFromGlobe() {
        const viewer = getViewer?.();
        if (!viewer) {
            message.error('Cesium 尚未初始化');
            return;
        }

        clearWind2D();

        try {
            const response = await fetch('/json/wind_globe.json');
            if (!response.ok) {
                throw new Error(`风场数据加载失败：${response.status}`);
            }
            const raw = await response.json();
            const windData = normalizeWindData(raw);

            const wind = new Wind2D(viewer, windData, {
                particlesTextureSize: windParams.value.particlesTextureSize,
                particleHeight: windParams.value.particleHeight,
                lineWidth: { min: 1, max: windParams.value.lineWidthVal },
                lineLength: { min: 20, max: windParams.value.lineLengthVal },
                speedFactor: windParams.value.speedFactor,
                dropRate: windParams.value.dropRate,
                dropRateBump: windParams.value.dropRateBump,
                dynamic: windParams.value.dynamic,
                useViewerBounds: true,
            });

            wind2D.value = wind;
            wind.flyTo(3);

            windParams.value = { ...windParams.value, windEnabled: true };
            message.success('风场加载成功');
        } catch (e) {
            console.error('[Wind] 风场加载失败:', e);
            message.error(`风场加载失败: ${e.message || '未知错误'}`);
            clearWind2D();
        }
    }

    /** 将当前 windParams 同步到运行时引擎 */
    function applyWindParams() {
        if (!wind2D.value) return;
        const p = windParams.value;
        wind2D.value.updateOptions({
            particlesTextureSize: p.particlesTextureSize,
            particleHeight: p.particleHeight,
            lineWidth: { min: 1, max: p.lineWidthVal },
            lineLength: { min: 20, max: p.lineLengthVal },
            speedFactor: p.speedFactor,
            dropRate: p.dropRate,
            dropRateBump: p.dropRateBump,
            dynamic: p.dynamic,
        });
    }

    /** 设置单个风场参数并同步到运行时 */
    function setWindParam(controlId, value) {
        if (!(controlId in windParams.value)) return false;
        windParams.value = { ...windParams.value, [controlId]: value };
        applyWindParams();
        return true;
    }

    return {
        wind2D,
        windParams,
        clearWind2D,
        loadWindFromGlobe,
        /** 向后兼容：外部仍通过 loadSimulatedWind 调用 */
        loadSimulatedWind: loadWindFromGlobe,
        setWindParam,
    };
}

/**
 * 将 wind_globe.json（GFS 格式）转为 WindLayer 所需的 WindData
 * @param {Array} raw - JSON array，[0]=U 分量，[1]=V 分量
 * @returns {import('./index.mjs').WindData}
 */
function normalizeWindData(raw) {
    return {
        u: {
            array: raw[0].data,
            min: raw[0].header.min,
            max: raw[0].header.max,
        },
        v: {
            array: raw[1].data,
            min: raw[1].header.min,
            max: raw[1].header.max,
        },
        bounds: {
            west: raw[0].header.extent[0],
            south: raw[0].header.extent[1],
            east: raw[0].header.extent[2],
            north: raw[0].header.extent[3],
        },
        width: raw[0].header.nx,
        height: raw[0].header.ny,
    };
}
