/**
 * useCesiumEffectsChart.ts — Cesium 高级特效面板的 ECharts 实时曲线子域
 *
 * 从 CesiumAdvancedEffects 抽离独立的监控图表域：
 * 懒加载 ECharts 运行时、采集相机高度/俯仰角/FPS 环形序列、监听 resize 与统一释放。
 */
import { nextTick, onUnmounted, ref } from 'vue';
import { useTimerRegistry } from '@common/composables/useTimerRegistry';

interface MessageLike {
    warning: (msg: string) => void;
    error: (...args: any[]) => void;
}

export interface UseCesiumEffectsChartOptions {
    getViewer: () => any;
    getCesium: () => any;
    getFpsValue: () => number;
    getCameraHeight: (viewer: any) => number;
    message: MessageLike;
}

function pad2(value: number): string {
    return String(value).padStart(2, '0');
}

function pushFixedLength<T>(arr: T[], value: T, maxLen: number): void {
    arr.push(value);
    if (arr.length > maxLen) arr.shift();
}

export function useCesiumEffectsChart(options: UseCesiumEffectsChartOptions) {
    const timers = useTimerRegistry();

    const chartRef = ref<HTMLElement | null>(null);
    const chartVisible = ref(false);

    let chartInstance: any = null;
    let echartsModule: any = null;
    let echartsRuntimePromise: Promise<any> | null = null;
    let samplingTimer: ReturnType<typeof setInterval> | null = null;
    let resizeHandler: (() => void) | null = null;

    const chartData: {
        labels: string[];
        cameraHeightKm: number[];
        pitchDeg: number[];
        fps: number[];
    } = {
        labels: [],
        cameraHeightKm: [],
        pitchDeg: [],
        fps: [],
    };

    function loadEchartsRuntime(): Promise<any> {
        if (echartsRuntimePromise) return echartsRuntimePromise;
        echartsRuntimePromise = import('@cesium-domain/utils/echartsFxRuntime')
            .then((runtimeModule: any) => {
                const runtime = runtimeModule?.getCesiumFxEchartsRuntime?.();
                if (!runtime) throw new Error('Cinematic FX 图表运行时加载失败');
                echartsModule = runtime;
                return runtime;
            })
            .catch((error) => {
                echartsRuntimePromise = null;
                throw error;
            });
        return echartsRuntimePromise;
    }

    async function ensureEchartsReady(): Promise<any> {
        if (echartsModule) return echartsModule;
        return loadEchartsRuntime();
    }

    function stopRealtimeSampling(): void {
        if (samplingTimer !== null) {
            timers.cancel(samplingTimer);
            samplingTimer = null;
        }
    }

    function renderChartOption(): void {
        if (!chartInstance) return;
        chartInstance.setOption({
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis' },
            legend: {
                top: 10,
                left: 'center',
                textStyle: { color: '#ddf7e8', fontSize: 11 },
                itemGap: 22,
            },
            grid: { left: 38, right: 20, top: 85, bottom: 24 },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: [],
                axisLine: { lineStyle: { color: 'rgba(190, 240, 210, 0.35)' } },
                axisLabel: { color: 'rgba(223, 248, 232, 0.85)', fontSize: 10 },
            },
            yAxis: [
                {
                    type: 'value',
                    name: '高度(km)/FPS',
                    nameTextStyle: { color: 'rgba(223, 248, 232, 0.85)' },
                    axisLine: { show: false },
                    splitLine: { lineStyle: { color: 'rgba(190, 240, 210, 0.12)' } },
                    axisLabel: { color: 'rgba(223, 248, 232, 0.85)', fontSize: 10 },
                },
                {
                    type: 'value',
                    name: '俯仰角(°)',
                    position: 'right',
                    min: -90,
                    max: 0,
                    nameTextStyle: { color: 'rgba(223, 248, 232, 0.85)' },
                    splitLine: { show: false },
                    axisLabel: { color: 'rgba(223, 248, 232, 0.85)', fontSize: 10 },
                },
            ],
            series: [
                {
                    name: '相机高度(km)',
                    type: 'line',
                    smooth: true,
                    showSymbol: false,
                    lineStyle: { width: 2, color: '#67e8f9' },
                    areaStyle: { color: 'rgba(103, 232, 249, 0.14)' },
                    data: [],
                },
                {
                    name: '俯仰角(°)',
                    type: 'line',
                    yAxisIndex: 1,
                    smooth: true,
                    showSymbol: false,
                    lineStyle: { width: 2, color: '#facc15' },
                    areaStyle: { color: 'rgba(250, 204, 21, 0.12)' },
                    data: [],
                },
                {
                    name: '帧率(FPS)',
                    type: 'line',
                    smooth: true,
                    showSymbol: false,
                    lineStyle: { width: 2, color: '#86efac' },
                    areaStyle: { color: 'rgba(134, 239, 172, 0.1)' },
                    data: [],
                },
            ],
        });
    }

    function collectAndRenderPoint(viewer: any, Cesium: any): void {
        if (!chartInstance) return;
        const now = new Date();
        const label = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
        const cameraHeightKm = Number((options.getCameraHeight(viewer) / 1000).toFixed(2));
        const pitchDeg = Number(Cesium.Math.toDegrees(viewer?.camera?.pitch ?? 0).toFixed(1));

        pushFixedLength(chartData.labels, label, 20);
        pushFixedLength(chartData.cameraHeightKm, cameraHeightKm, 20);
        pushFixedLength(chartData.pitchDeg, pitchDeg, 20);
        pushFixedLength(chartData.fps, options.getFpsValue(), 20);

        chartInstance.setOption({
            xAxis: { data: chartData.labels },
            series: [
                { data: chartData.cameraHeightKm },
                { data: chartData.pitchDeg },
                { data: chartData.fps },
            ],
        });
    }

    async function initEchartsRuntime(viewer: any, Cesium: any): Promise<void> {
        await ensureEchartsReady();
        await nextTick();
        if (!chartRef.value) return;

        if (!chartInstance) {
            chartInstance = echartsModule.init(chartRef.value);
            renderChartOption();
        }
        if (!resizeHandler) {
            resizeHandler = () => chartInstance?.resize();
            window.addEventListener('resize', resizeHandler);
        }
        chartInstance.resize();
        collectAndRenderPoint(viewer, Cesium);
    }

    function startRealtimeSampling(viewer: any, Cesium: any): void {
        if (samplingTimer !== null) return;
        samplingTimer = timers.every(() => {
            if (!chartInstance || !chartVisible.value) return;
            collectAndRenderPoint(viewer, Cesium);
        }, 1200);
    }

    const toggleChartVisibility = async (): Promise<void> => {
        const nextVisible = !chartVisible.value;
        chartVisible.value = nextVisible;
        if (!nextVisible) {
            stopRealtimeSampling();
            return;
        }

        const viewer = options.getViewer();
        const Cesium = options.getCesium() || (window as any).Cesium;
        if (!viewer || !Cesium) {
            chartVisible.value = false;
            options.message.warning('图表暂不可用：3D Viewer 尚未就绪。');
            return;
        }

        try {
            await initEchartsRuntime(viewer, Cesium);
            startRealtimeSampling(viewer, Cesium);
            collectAndRenderPoint(viewer, Cesium);
        } catch (error) {
            chartVisible.value = false;
            options.message.error('图表模块加载失败', error);
        }
    };

    function disposeChart(): void {
        stopRealtimeSampling();
        if (resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
            resizeHandler = null;
        }
        if (chartInstance) {
            chartInstance.dispose();
            chartInstance = null;
        }
        echartsModule = null;
    }

    onUnmounted(() => {
        disposeChart();
    });

    return {
        chartRef,
        chartVisible,
        toggleChartVisibility,
        disposeChart,
    };
}
