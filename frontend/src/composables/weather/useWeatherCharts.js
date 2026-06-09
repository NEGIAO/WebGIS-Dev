/**
 * useWeatherCharts.js
 * 天气图表渲染 Composable
 * - 管理 ECharts 运行时加载与图表实例生命周期
 * - 封装气温趋势图、风力仪表+柱状组合图的渲染逻辑
 * - 处理响应式布局与 resize
 * - 使用 ResizeObserver 监听容器大小变化，动态适应父组件尺寸
 */
import { nextTick, onBeforeUnmount, ref } from 'vue';
import { useMessage } from '../useMessage';
import {
    clampValue,
    formatDateLabel,
    normalizeWindPower,
    toNumberOrNull,
} from '../../utils/weather/weatherUtils';

/**
 * 天气图表管理 Composable
 *
 * @param {Object} weatherData 响应式天气数据（来自 useWeatherData）
 * @param {import('vue').Ref} weatherData.liveWeather 实况天气 ref
 * @param {import('vue').Ref} weatherData.forecastWeather 预报天气 ref
 * @param {import('vue').ComputedRef} weatherData.casts 预报 casts 计算属性
 * @param {import('vue').Ref} weatherData.viewportWidth 视口宽度 ref
 * @param {import('vue').ComputedRef} weatherData.isMobile 是否移动端
 * @param {import('vue').ComputedRef} weatherData.isCompact 是否紧凑布局
 * @returns {Object} 图表 refs 与操作方法
 */
export function useWeatherCharts(weatherData) {
    const message = useMessage();

    /* ------------------------------------------------------------ */
    /*  Refs                                                          */
    /* ------------------------------------------------------------ */

    /** 气温趋势图 DOM 容器 ref */
    const trendChartRef = ref(null);
    /** 风力图表 DOM 容器 ref */
    const windChartRef = ref(null);

    /* ------------------------------------------------------------ */
    /*  内部状态                                                       */
    /* ------------------------------------------------------------ */

    /** ECharts 模块引用 */
    let echartsModule = null;
    /** ECharts 运行时加载 Promise（防重复加载） */
    let echartsRuntimePromise = null;
    /** 气温趋势图实例 */
    let trendChart = null;
    /** 风力图表实例 */
    let windChart = null;
    /** resize 防抖定时器 */
    let resizeDebounceTimer = null;
    /** resize 动画帧 id */
    let resizeFrameId = null;
    /** ResizeObserver 实例（监听容器大小变化） */
    let resizeObserver = null;

    /* ------------------------------------------------------------ */
    /*  ECharts 运行时管理                                             */
    /* ------------------------------------------------------------ */

    /**
     * 加载 ECharts 运行时模块（懒加载，仅首次调用时实际加载）
     * @returns {Promise<Object>} ECharts 运行时模块
     */
    function loadEchartsRuntime() {
        if (echartsRuntimePromise) return echartsRuntimePromise;

        echartsRuntimePromise = import('../../utils/echarts/weatherRuntime.js')
            .then((runtimeModule) => {
                const runtime = runtimeModule?.getWeatherEchartsRuntime?.();
                if (!runtime) {
                    throw new Error('天气图表运行时加载失败');
                }

                echartsModule = runtime;
                return runtime;
            })
            .catch((error) => {
                echartsRuntimePromise = null;
                throw error;
            });

        return echartsRuntimePromise;
    }

    /**
     * 确保 ECharts 运行时已就绪
     * @returns {Promise<Object>} ECharts 模块
     */
    async function ensureEchartsReady() {
        if (echartsModule) return echartsModule;

        try {
            return await loadEchartsRuntime();
        } catch (error) {
            message.error('ECharts 模块加载失败', error);
            throw error instanceof Error ? error : new Error('ECharts 模块加载失败');
        }
    }

    /**
     * 确保图表 DOM 容器已初始化为 ECharts 实例
     */
    async function ensureChartInstances() {
        await ensureEchartsReady();
        await nextTick();

        if (!trendChart && trendChartRef.value) {
            trendChart = echartsModule.init(trendChartRef.value);
        }

        if (!windChart && windChartRef.value) {
            windChart = echartsModule.init(windChartRef.value);
        }

        // 初始化 ResizeObserver 监听容器大小变化
        setupResizeObserver();
    }

    /* ------------------------------------------------------------ */
    /*  图表 Loading 状态                                              */
    /* ------------------------------------------------------------ */

    /** 显示图表 loading 遮罩 */
    function showChartsLoading() {
        trendChart?.showLoading?.('default', { text: '天气数据加载中...' });
        windChart?.showLoading?.('default', { text: '天气数据加载中...' });
    }

    /** 隐藏图表 loading 遮罩 */
    function hideChartsLoading() {
        trendChart?.hideLoading?.();
        windChart?.hideLoading?.();
    }

    /* ------------------------------------------------------------ */
    /*  图表布局尺寸计算                                                */
    /* ------------------------------------------------------------ */

    /**
     * 读取图表容器的实际尺寸，优先使用 DOM 尺寸，避免 ECharts 缓存尺寸滞后。
     * @param {Object|null} chart ECharts 实例
     * @param {import('vue').Ref<HTMLElement|null>} chartRef 图表 DOM ref
     * @param {Object} fallback 兜底尺寸
     * @returns {{width: number, height: number, ratio: number, narrow: boolean, short: boolean, tiny: boolean}}
     */
    function getChartBoxMetrics(chart, chartRef, fallback = {}) {
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
        const box = getChartBoxMetrics(trendChart, trendChartRef, {
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
    }

    /* ------------------------------------------------------------ */
    /*  气温趋势图渲染                                                  */
    /* ------------------------------------------------------------ */

    /**
     * 渲染未来 4 天气温趋势折线图
     * 包含白天气温与晚间气温双系列，带面积渐变
     */
    function renderTrendChart() {
        if (!trendChart || !echartsModule) return;

        const metrics = getTrendLayoutMetrics();
        const castsList = weatherData.casts?.value ?? [];

        const dates = castsList.map((item) => formatDateLabel(item.date));
        const dayTemps = castsList.map((item) => toNumberOrNull(item?.dayTemp));
        const nightTemps = castsList.map((item) => toNumberOrNull(item?.nightTemp));
        const validTemps = [...dayTemps, ...nightTemps].filter((temp) => Number.isFinite(temp));

        const yMin = validTemps.length
            ? Math.max(-50, Math.floor(Math.min(...validTemps) - 2))
            : 0;
        const yMax = validTemps.length
            ? Math.min(60, Math.ceil(Math.max(...validTemps) + 2))
            : 40;

        // NOTE: ECharts JS 内的颜色值无法使用 CSS 变量，如需同步主题色请手动与 theme.css 中的变量保持一致
        const option = {
            backgroundColor: 'transparent',
            animationDuration: 420,
            animationDurationUpdate: 300,
            tooltip: {
                trigger: 'axis',
                confine: true,
                backgroundColor: 'rgba(16, 44, 31, 0.88)',
                borderColor: 'rgba(101, 183, 132, 0.65)',
                borderWidth: 1,
                textStyle: { color: '#ecfff2' },
                formatter(params) {
                    const list = Array.isArray(params) ? params : [];
                    if (!list.length) return '--';

                    const title = String(list[0]?.axisValue || '--');
                    const lines = list
                        .map((item) => {
                            const value = Number(item?.data);
                            const text = Number.isFinite(value) ? `${value}°C` : '--';
                            return `${item.marker}${item.seriesName}: ${text}`;
                        })
                        .join('<br/>');
                    return `${title}<br/>${lines}`;
                },
            },
            legend: {
                data: ['白天气温', '晚间气温'],
                top: metrics.legendTop,
                left: 'center',
                icon: 'roundRect',
                itemWidth: metrics.legendItemWidth,
                itemHeight: metrics.legendItemHeight,
                itemGap: metrics.narrow ? 10 : 14,
                textStyle: { color: '#2a5a3f', fontSize: metrics.legendFontSize },
            },
            grid: {
                left: metrics.gridLeft,
                right: metrics.gridRight,
                top: metrics.gridTop,
                bottom: metrics.gridBottom,
                containLabel: true,
            },
            xAxis: {
                type: 'category',
                data: dates,
                axisLine: { lineStyle: { color: '#7fb79a' } },
                axisLabel: {
                    color: '#2c6045',
                    fontSize: metrics.axisFontSize,
                    rotate: metrics.xLabelRotate,
                },
                axisTick: { alignWithLabel: true },
            },
            yAxis: {
                type: 'value',
                name: '°C',
                min: yMin,
                max: yMax,
                axisLine: { show: false },
                axisLabel: { color: '#2c6045', fontSize: metrics.axisFontSize },
                nameTextStyle: { color: '#2c6045', fontSize: metrics.axisNameFontSize },
                splitLine: { lineStyle: { color: 'rgba(90, 150, 110, 0.18)' } },
            },
            series: [
                {
                    name: '白天气温',
                    type: 'line',
                    smooth: true,
                    showSymbol: metrics.showSymbols,
                    symbolSize: metrics.symbolSize,
                    data: dayTemps,
                    connectNulls: true,
                    lineStyle: { width: metrics.lineWidth, color: '#3cb46b' },
                    itemStyle: { color: '#3cb46b' },
                    areaStyle: {
                        color: new echartsModule.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(60, 180, 107, 0.35)' },
                            { offset: 1, color: 'rgba(60, 180, 107, 0.02)' },
                        ]),
                    },
                    emphasis: { focus: 'series' },
                    markPoint: {
                        symbolSize: metrics.markPointSize,
                        label: {
                            color: '#ffffff',
                            fontSize: metrics.markPointFontSize,
                            formatter(params) {
                                const value = Number(params?.value);
                                return Number.isFinite(value) ? `${value}°` : '';
                            },
                        },
                        itemStyle: { color: '#2f9b58' },
                        data: [
                            { type: 'max', name: '最高' },
                            { type: 'min', name: '最低' },
                        ],
                    },
                },
                {
                    name: '晚间气温',
                    type: 'line',
                    smooth: true,
                    showSymbol: metrics.showSymbols,
                    symbolSize: metrics.symbolSize,
                    data: nightTemps,
                    connectNulls: true,
                    lineStyle: { width: metrics.lineWidth, color: '#2d8cff' },
                    itemStyle: { color: '#2d8cff' },
                    areaStyle: {
                        color: new echartsModule.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(45, 140, 255, 0.32)' },
                            { offset: 1, color: 'rgba(45, 140, 255, 0.02)' },
                        ]),
                    },
                    emphasis: { focus: 'series' },
                    markPoint: {
                        symbolSize: metrics.markPointSize,
                        label: {
                            color: '#ffffff',
                            fontSize: metrics.markPointFontSize,
                            formatter(params) {
                                const value = Number(params?.value);
                                return Number.isFinite(value) ? `${value}°` : '';
                            },
                        },
                        itemStyle: { color: '#1f73d6' },
                        data: [
                            { type: 'max', name: '最高' },
                            { type: 'min', name: '最低' },
                        ],
                    },
                },
            ],
        };

        trendChart.setOption(option, { notMerge: true, lazyUpdate: true });
    }

    /* ------------------------------------------------------------ */
    /*  风力图表渲染                                                    */
    /* ------------------------------------------------------------ */

    /**
     * 计算风力图表的响应式布局尺寸参数
     * 根据图表容器宽高动态计算仪表盘半径、字体大小、间距等
     * @returns {Object} 布局尺寸参数集
     */
    function getWindLayoutMetrics() {
        const box = getChartBoxMetrics(windChart, windChartRef, {
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
        const gaugeSplitNumber = 4;
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

    /**
     * 渲染风力仪表盘 + 预报风级柱状图组合
     * 上半部分：当前实况风力仪表盘
     * 下半部分：4 天预报白天/夜间/平均风力柱状+折线图
     */
    function renderWindChart() {
        if (!windChart || !echartsModule) return;

        const metrics = getWindLayoutMetrics();
        const castsList = weatherData.casts?.value ?? [];

        const currentWind = normalizeWindPower(
            weatherData.liveWeather?.value?.windPowerText,
        );
        const dateLabels = castsList.map((item) => formatDateLabel(item.date));
        const dayPowers = castsList.map((item) => {
            const numeric = Number(item?.dayPower);
            return Number.isFinite(numeric) ? numeric : normalizeWindPower(item?.dayPowerText);
        });
        const nightPowers = castsList.map((item) => {
            const numeric = Number(item?.nightPower);
            return Number.isFinite(numeric) ? numeric : normalizeWindPower(item?.nightPowerText);
        });
        const averagePowers = dayPowers.map((dayPower, index) => {
            const nightPower = Number(nightPowers[index]);
            if (!Number.isFinite(dayPower) && !Number.isFinite(nightPower)) return null;
            if (!Number.isFinite(dayPower)) return nightPower;
            if (!Number.isFinite(nightPower)) return dayPower;
            return Number(((dayPower + nightPower) / 2).toFixed(1));
        });

        const forecastPowers = [...dayPowers, ...nightPowers, ...averagePowers].filter((value) =>
            Number.isFinite(value),
        );
        const forecastMinPower = forecastPowers.length ? Math.min(...forecastPowers) : 0;
        const forecastMaxPower = forecastPowers.length ? Math.max(...forecastPowers) : 3;
        const axisMin = Math.max(0, Math.floor(forecastMinPower - 1));
        const axisMax = Math.min(12, Math.max(axisMin + 2, Math.ceil(forecastMaxPower + 1)));
        const axisInterval = clampValue(Math.ceil((axisMax - axisMin) / 4), 1, 3);
        const xLabelRotate = dateLabels.some((item) => String(item || '').length > 5) ? 12 : 0;

        // NOTE: ECharts JS 内的颜色值无法使用 CSS 变量，如需同步主题色请手动与 theme.css 中的变量保持一致
        const option = {
            backgroundColor: 'transparent',
            animationDuration: 420,
            animationDurationUpdate: 300,
            legend: {
                show: metrics.showLegend,
                data: ['白天风力', '夜间风力', '平均风力'],
                top: metrics.legendTopPx,
                left: 'center',
                icon: 'roundRect',
                itemWidth: metrics.legendItemWidth,
                itemHeight: metrics.legendItemHeight,
                itemGap: metrics.legendItemGap,
                textStyle: { color: '#2a5a3f', fontSize: metrics.legendFontSize },
            },
            grid: {
                left: metrics.gridLeft,
                right: metrics.gridRight,
                top: metrics.barsTopPercent,
                bottom: metrics.gridBottom,
                containLabel: true,
            },
            xAxis: {
                type: 'category',
                data: dateLabels,
                axisLabel: {
                    color: '#2c6045',
                    fontSize: metrics.axisFontSize,
                    rotate: xLabelRotate,
                    margin: 10,
                },
                axisLine: { lineStyle: { color: '#7fb79a' } },
            },
            yAxis: {
                type: 'value',
                name: '级',
                min: axisMin,
                max: axisMax,
                interval: axisInterval,
                axisLabel: {
                    color: '#2c6045',
                    fontSize: metrics.axisFontSize,
                    margin: 8,
                },
                nameGap: 10,
                nameTextStyle: { color: '#2c6045', fontSize: metrics.yNameFontSize },
                splitLine: { lineStyle: { color: 'rgba(90, 150, 110, 0.18)' } },
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                confine: true,
                backgroundColor: 'rgba(16, 44, 31, 0.88)',
                borderColor: 'rgba(101, 183, 132, 0.65)',
                borderWidth: 1,
                textStyle: { color: '#ecfff2' },
                formatter(params) {
                    const list = Array.isArray(params) ? params : [];
                    if (!list.length) return '--';

                    const dataIndex = Number(list[0]?.dataIndex);
                    const cast = castsList[dataIndex] || {};
                    const lines = list.map((item) => {
                        const value = Number(item?.data);
                        const text = Number.isFinite(value) ? `${value}级` : '--';
                        return `${item.marker}${item.seriesName}: ${text}`;
                    });

                    return [
                        String(list[0]?.axisValue || '--'),
                        ...lines,
                        `白天风向: ${String(cast?.dayWind || '--')}`,
                        `夜间风向: ${String(cast?.nightWind || '--')}`,
                    ].join('<br/>');
                },
            },
            series: [
                {
                    type: 'gauge',
                    startAngle: 215,
                    endAngle: -35,
                    tooltip: {
                        trigger: 'item',
                        formatter: `当前实况风力：${currentWind} 级`,
                    },
                    center: ['50%', metrics.gaugeCenterYPercent],
                    radius: metrics.gaugeRadiusPercent,
                    min: 0,
                    max: 12,
                    splitNumber: metrics.gaugeSplitNumber,
                    progress: {
                        show: true,
                        width: metrics.gaugeStroke,
                        roundCap: true,
                        overlap: false,
                        itemStyle: {
                            color: new echartsModule.graphic.LinearGradient(0, 0, 1, 0, [
                                { offset: 0, color: '#8ddca6' },
                                { offset: 0.58, color: '#42b970' },
                                { offset: 1, color: '#207a46' },
                            ]),
                        },
                    },
                    axisLine: {
                        roundCap: true,
                        lineStyle: {
                            width: metrics.gaugeStroke,
                            color: [[1, 'rgba(65, 150, 95, 0.12)']],
                        },
                    },
                    axisTick: { show: false },
                    splitLine: {
                        show: metrics.showGaugeLabels,
                        length: metrics.gaugeSplitLength,
                        distance: 3,
                        lineStyle: {
                            color: 'rgba(78, 142, 104, 0.42)',
                            width: metrics.splitLineWidth,
                        },
                    },
                    axisLabel: {
                        show: metrics.showGaugeLabels,
                        color: '#6a907a',
                        fontSize: metrics.gaugeAxisFontSize,
                        distance: metrics.gaugeLabelDistance,
                        formatter(value) {
                            const numeric = Number(value);
                            if (!Number.isFinite(numeric)) return '';
                            return numeric % metrics.gaugeLabelStep === 0
                                ? String(numeric)
                                : '';
                        },
                    },
                    pointer: {
                        show: false,
                    },
                    anchor: { show: false },
                    title: {
                        show: true,
                        offsetCenter: [0, '62%'],
                        color: '#5d856c',
                        fontSize: metrics.gaugeTitleFontSize,
                        fontWeight: 600,
                    },
                    detail: {
                        valueAnimation: true,
                        fontSize: metrics.gaugeDetailFontSize,
                        fontWeight: 800,
                        color: '#1f5a37',
                        lineHeight: metrics.gaugeDetailFontSize + 2,
                        offsetCenter: [0, '18%'],
                        formatter: '{value} 级',
                    },
                    data: [{ value: currentWind, name: '当前实况' }],
                },
                {
                    name: '白天风力',
                    type: 'bar',
                    barMaxWidth: metrics.barMaxWidth,
                    barGap: '20%',
                    barCategoryGap: '42%',
                    data: dayPowers,
                    itemStyle: {
                        borderRadius: [4, 4, 0, 0],
                        color: new echartsModule.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(63, 183, 110, 0.92)' },
                            { offset: 1, color: 'rgba(63, 183, 110, 0.48)' },
                        ]),
                    },
                },
                {
                    name: '夜间风力',
                    type: 'bar',
                    barMaxWidth: metrics.barMaxWidth,
                    barGap: '20%',
                    barCategoryGap: '42%',
                    data: nightPowers,
                    itemStyle: {
                        borderRadius: [4, 4, 0, 0],
                        color: new echartsModule.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(43, 139, 255, 0.9)' },
                            { offset: 1, color: 'rgba(43, 139, 255, 0.45)' },
                        ]),
                    },
                },
                {
                    name: '平均风力',
                    type: 'line',
                    smooth: true,
                    showSymbol: metrics.showLineSymbol,
                    symbolSize: metrics.lineSymbolSize,
                    data: averagePowers,
                    lineStyle: { width: 2, color: '#2f7f58', type: 'dashed' },
                    itemStyle: { color: '#2f7f58' },
                },
            ],
        };

        windChart.setOption(option, { notMerge: true, lazyUpdate: true });
    }

    /* ------------------------------------------------------------ */
    /*  Resize 处理                                                    */
    /* ------------------------------------------------------------ */

    /** 触发图表实例 resize */
    function resizeCharts() {
        trendChart?.resize?.();
        windChart?.resize?.();
    }

    /**
     * 延迟到布局稳定后再 resize + render，适配侧栏拖拽、折叠动画和容器查询换行。
     * @param {Object} options 调度选项
     * @param {number} options.delay 防抖延迟
     * @param {boolean} options.updateViewport 是否同步视口宽度
     */
    function scheduleChartsResizeAndRender(options = {}) {
        if (typeof window === 'undefined') return;

        const delay = Number.isFinite(options.delay) ? options.delay : 90;

        if (resizeDebounceTimer !== null) {
            window.clearTimeout(resizeDebounceTimer);
            resizeDebounceTimer = null;
        }

        if (resizeFrameId !== null) {
            window.cancelAnimationFrame(resizeFrameId);
            resizeFrameId = null;
        }

        resizeDebounceTimer = window.setTimeout(() => {
            resizeDebounceTimer = null;

            if (options.updateViewport && weatherData.viewportWidth) {
                weatherData.viewportWidth.value = window.innerWidth;
            }

            resizeFrameId = window.requestAnimationFrame(() => {
                resizeFrameId = null;
                resizeCharts();
                renderTrendChart();
                renderWindChart();
            });
        }, delay);
    }

    /**
     * 设置 ResizeObserver 监听图表容器大小变化
     * 当父组件尺寸改变时（如侧边栏折叠、面板展开），自动触发图表 resize
     */
    function setupResizeObserver() {
        // 如果已经设置过，先断开
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }

        // 浏览器不支持 ResizeObserver 时降级到窗口监听
        if (typeof ResizeObserver === 'undefined') {
            return;
        }

        resizeObserver = new ResizeObserver(() => {
            scheduleChartsResizeAndRender({ delay: 90 });
        });

        const observedElements = new Set(
            [
                trendChartRef.value,
                windChartRef.value,
                trendChartRef.value?.parentElement,
                windChartRef.value?.parentElement,
                trendChartRef.value?.parentElement?.parentElement,
                trendChartRef.value?.parentElement?.parentElement?.parentElement,
            ].filter(Boolean),
        );

        for (const element of observedElements) {
            resizeObserver.observe(element);
        }
    }

    /** 防抖窗口 resize 处理（同时更新视口宽度并重绘图表） */
    function handleWindowResize() {
        if (typeof window === 'undefined') return;

        scheduleChartsResizeAndRender({ delay: 120, updateViewport: true });
    }

    /* ------------------------------------------------------------ */
    /*  生命周期                                                       */
    /* ------------------------------------------------------------ */

    onBeforeUnmount(() => {
        // 清理 ResizeObserver
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }

        if (typeof window !== 'undefined') {
            window.removeEventListener('resize', handleWindowResize);
            if (resizeDebounceTimer !== null) {
                window.clearTimeout(resizeDebounceTimer);
                resizeDebounceTimer = null;
            }
            if (resizeFrameId !== null) {
                window.cancelAnimationFrame(resizeFrameId);
                resizeFrameId = null;
            }
        }

        trendChart?.dispose?.();
        windChart?.dispose?.();
        trendChart = null;
        windChart = null;
    });

    /* ------------------------------------------------------------ */
    /*  暴露                                                          */
    /* ------------------------------------------------------------ */

    return {
        // Refs（模板绑定用）
        trendChartRef,
        windChartRef,
        // 实例管理
        loadEchartsRuntime,
        ensureEchartsReady,
        ensureChartInstances,
        // Loading 控制
        showChartsLoading,
        hideChartsLoading,
        // 渲染方法
        renderTrendChart,
        renderWindChart,
        // 布局计算
        getWindLayoutMetrics,
        // Resize
        resizeCharts,
        handleWindowResize,
        scheduleChartsResizeAndRender,
        setupResizeObserver,
    };
}
