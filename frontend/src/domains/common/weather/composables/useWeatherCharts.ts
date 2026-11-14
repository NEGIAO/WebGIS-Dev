/**
 * useWeatherCharts.ts
 * 天气图表渲染 Composable（装配层）
 *
 * 职责边界：只做「状态 ref → 运行时/布局/图表规格」的装配与对外暴露。
 * - 运行时与实例生命周期：`charts/runtime.ts`
 * - 布局度量：`charts/layoutMetrics.ts`
 * - 趋势图 option：`charts/trendChart.ts`
 * - 风图 option：`charts/windChart.ts`
 *
 * 拆出原因：原文件 886 行把 ECharts 生命周期、尺寸换算、两张图的规格混在一个闭包里；
 * 拆开后两个 option 构建器成为纯函数，可脱离 DOM 单测。
 */

import { onBeforeUnmount, ref } from 'vue';
import { useMessage } from '@common/shell/useMessage';
import { createWeatherChartsLayout } from './charts/layoutMetrics';
import { createWeatherChartsRuntime } from './charts/runtime';
import { buildTrendChartOption } from './charts/trendChart';
import { buildWindChartOption } from './charts/windChart';

/**
 * 天气图表管理 Composable
 *
 * @param weatherData 响应式天气数据（来自 useWeatherData）
 * @param weatherData.liveWeather 实况天气 ref
 * @param weatherData.forecastWeather 预报天气 ref
 * @param weatherData.casts 预报 casts 计算属性
 * @param weatherData.viewportWidth 视口宽度 ref
 * @param weatherData.isMobile 是否移动端
 * @param weatherData.isCompact 是否紧凑布局
 * @returns 图表 refs 与操作方法
 */
export function useWeatherCharts(weatherData: any) {
    const message = useMessage();

    /** 气温趋势图 DOM 容器 ref */
    const trendChartRef = ref<HTMLElement | null>(null);
    /** 风力图表 DOM 容器 ref */
    const windChartRef = ref<HTMLElement | null>(null);

    /** 渲染未来 4 天气温趋势折线图（白/夜双系列，带面积渐变） */
    function renderTrendChart() {
        const chart = runtime.getTrendChart();
        const echarts = runtime.getEchartsModule();
        if (!chart || !echarts) return;

        chart.setOption(
            buildTrendChartOption({
                echarts,
                weatherData,
                metrics: layout.getTrendLayoutMetrics(),
            }),
            { notMerge: true, lazyUpdate: true },
        );
    }

    /** 渲染风力仪表盘 + 预报风级柱状图组合 */
    function renderWindChart() {
        const chart = runtime.getWindChart();
        const echarts = runtime.getEchartsModule();
        if (!chart || !echarts) return;

        chart.setOption(
            buildWindChartOption({
                echarts,
                weatherData,
                metrics: layout.getWindLayoutMetrics(),
            }),
            { notMerge: true, lazyUpdate: true },
        );
    }

    /** 两张图一起重绘（resize 结束后由运行时回调） */
    function renderAllCharts() {
        renderTrendChart();
        renderWindChart();
    }

    const runtime = createWeatherChartsRuntime({
        trendChartRef,
        windChartRef,
        message,
        viewportWidth: weatherData?.viewportWidth ?? null,
        renderAll: renderAllCharts,
    });

    const layout = createWeatherChartsLayout({
        trendChartRef,
        windChartRef,
        weatherData,
        getTrendChart: runtime.getTrendChart,
        getWindChart: runtime.getWindChart,
    });

    onBeforeUnmount(() => {
        runtime.dispose();
    });

    return {
        // Refs（模板绑定用）
        trendChartRef,
        windChartRef,
        // 实例管理
        loadEchartsRuntime: runtime.loadEchartsRuntime,
        ensureEchartsReady: runtime.ensureEchartsReady,
        ensureChartInstances: runtime.ensureChartInstances,
        // Loading 控制
        showChartsLoading: runtime.showChartsLoading,
        hideChartsLoading: runtime.hideChartsLoading,
        // 渲染方法
        renderTrendChart,
        renderWindChart,
        // 布局计算
        getWindLayoutMetrics: layout.getWindLayoutMetrics,
        // Resize
        resizeCharts: runtime.resizeCharts,
        handleWindowResize: runtime.handleWindowResize,
        scheduleChartsResizeAndRender: runtime.scheduleChartsResizeAndRender,
        setupResizeObserver: runtime.setupResizeObserver,
    };
}
