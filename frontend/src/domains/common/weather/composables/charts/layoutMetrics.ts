/**
 * 天气图表布局度量 — 纯计算，不持有实例
 *
 * 从 useWeatherCharts 拆出：把「容器实测尺寸 → 字号/边距/仪表半径」的换算集中在此，
 * 两张图的规格（trendChart / windChart）只消费度量结果，不关心如何得出。
 */

import { clampValue } from '@common/weather/utils/weatherUtils';

export interface WeatherChartsLayoutDeps {
    /** 趋势图 DOM 容器 */
    trendChartRef: { value: any };
    /** 风图 DOM 容器 */
    windChartRef: { value: any };
    /** 天气响应式数据（读 isMobile / isCompact） */
    getTrendChart: () => any;
    getWindChart: () => any;
    weatherData: any;
}

/**
 * 创建布局度量工具集
 * @param deps 依赖注入（见 WeatherChartsLayoutDeps）
 */
export function createWeatherChartsLayout({
    trendChartRef,
    windChartRef,
    weatherData,
    getTrendChart,
    getWindChart,
}: WeatherChartsLayoutDeps) {
    /**
     * 读取图表容器的实际尺寸，优先使用 DOM 尺寸，避免 ECharts 缓存尺寸滞后。
     * @param {Object|null} chart ECharts 实例
     * @param {import('vue').Ref<HTMLElement|null>} chartRef 图表 DOM ref
     * @param {Object} fallback 兜底尺寸
     * @returns {{width: number, height: number, ratio: number, narrow: boolean, short: boolean, tiny: boolean}}
     */
    function getChartBoxMetrics(
        chart: any,
        chartRef: { value: any },
        fallback: { width?: number; height?: number } = {},
    ) {
        const rect = chartRef.value?.getBoundingClientRect?.();
        const rectWidth = Number(rect?.width);
        const rectHeight = Number(rect?.height);
        const width = Math.max(
            1,
            Math.round(
                rectWidth ||
                    chartRef.value?.clientWidth ||
                    chart?.getWidth?.() ||
                    fallback.width ||
                    640,
            ),
        );
        const height = Math.max(
            1,
            Math.round(
                rectHeight ||
                    chartRef.value?.clientHeight ||
                    chart?.getHeight?.() ||
                    fallback.height ||
                    280,
            ),
        );

        return {
            width,
            height,
            ratio: width / Math.max(height, 1),
            narrow: width < 460,
            short: height < 240,
            tiny: width < 360 || height < 210,
        };
    }

    /**
     * 气温趋势图布局参数。
     * @returns {Object} 趋势图响应式布局参数
     */
    function getTrendLayoutMetrics() {
        const box = getChartBoxMetrics(getTrendChart(), trendChartRef, {
            width: 640,
            height: 260,
        });
        const mobile = weatherData.isMobile?.value ?? false;
        const narrow = box.narrow || mobile;
        const short = box.short;

        const axisFontSize = clampValue(Math.round(box.width * 0.02), 10, 13);
        const legendFontSize = clampValue(Math.round(box.width * 0.019), 10, 13);
        const legendTop = clampValue(Math.round(box.height * 0.025), 4, 10);
        const gridTop = clampValue(Math.round(box.height * (short ? 0.21 : 0.18)), 42, 58);
        const gridBottom = clampValue(Math.round(box.height * (narrow ? 0.15 : 0.12)), 26, 44);

        return {
            ...box,
            legendTop,
            legendFontSize,
            legendItemWidth: clampValue(Math.round(box.width * 0.026), 9, 15),
            legendItemHeight: clampValue(Math.round(box.height * 0.026), 5, 8),
            gridLeft: clampValue(Math.round(box.width * 0.066), 30, 52),
            gridRight: clampValue(Math.round(box.width * 0.032), 10, 22),
            gridTop,
            gridBottom,
            axisFontSize,
            axisNameFontSize: clampValue(axisFontSize - 1, 9, 12),
            lineWidth: clampValue(Math.round(box.width * 0.006), 2, 3),
            symbolSize: clampValue(Math.round(box.width * 0.012), 5, 8),
            markPointSize: clampValue(Math.round(box.width * 0.048), 20, 34),
            showSymbols: !narrow && !short,
            markPointFontSize: clampValue(Math.round(box.width * 0.018), 9, 11),
            xLabelRotate: narrow || (weatherData.isCompact?.value ?? false) ? 16 : 0,
        };
    }    /**
     * 计算风力图表的响应式布局尺寸参数
     * 根据图表容器宽高动态计算仪表盘半径、字体大小、间距等
     * @returns {Object} 布局尺寸参数集
     */
    function getWindLayoutMetrics() {
        const box = getChartBoxMetrics(getWindChart(), windChartRef, {
            width: 640,
            height: 280,
        });
        const { width, height, narrow, short, tiny } = box;
        const splitYPx = Math.round(height * 0.5);
        const showLegend = !tiny && !short && width >= 430;

        const legendTopPx = splitYPx + clampValue(Math.round(height * 0.012), 2, 6);
        const legendFontSize = clampValue(Math.round(width * 0.017), 10, 12);
        const legendItemWidth = clampValue(Math.round(width * 0.022), 8, 13);
        const legendItemHeight = clampValue(Math.round(height * 0.022), 5, 7);

        const preferredGaugeByWidth = width * (narrow ? 0.17 : 0.14);
        const preferredGaugeByHeight = splitYPx * 0.48;
        const gaugeRadiusPx = clampValue(
            Math.round(Math.min(preferredGaugeByWidth, preferredGaugeByHeight)),
            tiny ? 34 : 42,
            92,
        );
        const gaugeCenterYPx = clampValue(
            Math.round(splitYPx * 0.5),
            Math.round(gaugeRadiusPx + 2),
            Math.round(splitYPx - gaugeRadiusPx - 2),
        );

        const minSide = Math.min(width, height);
        const gaugeRadiusPercent = `${clampValue(
            (gaugeRadiusPx / minSide) * 100,
            12,
            narrow ? 38 : 34,
        ).toFixed(2)}%`;
        const gaugeCenterYPercent = `${((gaugeCenterYPx / height) * 100).toFixed(2)}%`;

        const gaugeStroke = clampValue(Math.round(gaugeRadiusPx * 0.15), 7, 13);
        const gaugeSplitLength = 0;
        const gaugeAxisFontSize = 0;
        const gaugeDetailFontSize = clampValue(Math.round(gaugeRadiusPx * 0.36), 15, 25);
        const gaugeTitleFontSize = clampValue(Math.round(gaugeRadiusPx * 0.18), 10, 13);
        const gaugeSplitNumber: number = 4;
        const gaugeLabelStep = gaugeSplitNumber === 6 && !short ? 2 : 4;
        const gaugeLabelDistance = 0;

        const barsTopPx = clampValue(
            splitYPx + (showLegend ? legendFontSize + 14 : 4),
            splitYPx + 4,
            Math.round(height * 0.6),
        );
        const barsTopPercent = `${((barsTopPx / height) * 100).toFixed(2)}%`;

        const gridLeft = clampValue(Math.round(width * 0.05), 24, 46);
        const gridRight = clampValue(Math.round(width * 0.026), 8, 18);
        const gridBottom = clampValue(Math.round(height * 0.07), 18, 28);
        const axisFontSize = clampValue(Math.round(width * 0.017), 10, 13);
        const yNameFontSize = clampValue(axisFontSize - 1, 9, 12);
        const barMaxWidth = clampValue(Math.round(width * (narrow ? 0.036 : 0.028)), 8, 20);
        const lineSymbolSize = clampValue(Math.round(width * 0.012), 4, 7);

        return {
            ...box,
            legendTopPx,
            legendFontSize,
            legendItemWidth,
            legendItemHeight,
            legendItemGap: tiny ? 8 : 12,
            gaugeRadiusPercent,
            gaugeCenterYPercent,
            gaugeRadiusPx,
            gaugeStroke,
            gaugeSplitLength,
            gaugeSplitNumber,
            gaugeLabelStep,
            gaugeLabelDistance,
            gaugeAxisFontSize,
            gaugeDetailFontSize,
            gaugeTitleFontSize,
            barsTopPercent,
            gridLeft,
            gridRight,
            gridBottom,
            axisFontSize,
            yNameFontSize,
            barMaxWidth,
            lineSymbolSize,
            showLegend,
            splitYPercent: `${((splitYPx / height) * 100).toFixed(2)}%`,
            showGaugeLabels: false,
            splitLineWidth: tiny ? 1 : 1.4,
            showLineSymbol: !tiny,
        };
    }
    return { getChartBoxMetrics, getTrendLayoutMetrics, getWindLayoutMetrics };
}
