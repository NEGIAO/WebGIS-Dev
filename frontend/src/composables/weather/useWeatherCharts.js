/**
 * useWeatherCharts.js
 * 天气图表渲染 Composable
 * - 管理 ECharts 运行时加载与图表实例生命周期
 * - 封装气温趋势图、风力仪表+柱状组合图的渲染逻辑
 * - 处理响应式布局与 resize
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
    /*  气温趋势图渲染                                                  */
    /* ------------------------------------------------------------ */

    /**
     * 渲染未来 4 天气温趋势折线图
     * 包含白天气温与晚间气温双系列，带面积渐变
     */
    function renderTrendChart() {
        if (!trendChart || !echartsModule) return;

        const mobile = weatherData.isMobile?.value ?? false;
        const compact = weatherData.isCompact?.value ?? false;
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
                top: 8,
                icon: 'roundRect',
                itemWidth: mobile ? 10 : 14,
                itemHeight: mobile ? 6 : 8,
                textStyle: { color: '#2a5a3f', fontSize: mobile ? 11 : 12 },
            },
            grid: {
                left: mobile ? 34 : 42,
                right: mobile ? 14 : 18,
                top: mobile ? 46 : 48,
                bottom: mobile ? 34 : 30,
                containLabel: true,
            },
            xAxis: {
                type: 'category',
                data: dates,
                axisLine: { lineStyle: { color: '#7fb79a' } },
                axisLabel: {
                    color: '#2c6045',
                    fontSize: mobile ? 11 : 12,
                    rotate: compact ? 14 : 0,
                },
                axisTick: { alignWithLabel: true },
            },
            yAxis: {
                type: 'value',
                name: '°C',
                min: yMin,
                max: yMax,
                axisLine: { show: false },
                axisLabel: { color: '#2c6045', fontSize: mobile ? 11 : 12 },
                nameTextStyle: { color: '#2c6045', fontSize: mobile ? 10 : 11 },
                splitLine: { lineStyle: { color: 'rgba(90, 150, 110, 0.18)' } },
            },
            series: [
                {
                    name: '白天气温',
                    type: 'line',
                    smooth: true,
                    showSymbol: !mobile,
                    symbolSize: mobile ? 6 : 8,
                    data: dayTemps,
                    connectNulls: true,
                    lineStyle: { width: mobile ? 2.5 : 3, color: '#3cb46b' },
                    itemStyle: { color: '#3cb46b' },
                    areaStyle: {
                        color: new echartsModule.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(60, 180, 107, 0.35)' },
                            { offset: 1, color: 'rgba(60, 180, 107, 0.02)' },
                        ]),
                    },
                    emphasis: { focus: 'series' },
                    markPoint: mobile
                        ? undefined
                        : {
                              symbolSize: 34,
                              label: { color: '#ffffff', fontSize: 10 },
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
                    showSymbol: !mobile,
                    symbolSize: mobile ? 6 : 8,
                    data: nightTemps,
                    connectNulls: true,
                    lineStyle: { width: mobile ? 2.5 : 3, color: '#2d8cff' },
                    itemStyle: { color: '#2d8cff' },
                    areaStyle: {
                        color: new echartsModule.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(45, 140, 255, 0.32)' },
                            { offset: 1, color: 'rgba(45, 140, 255, 0.02)' },
                        ]),
                    },
                    emphasis: { focus: 'series' },
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
        const rawWidth = Number(
            windChart?.getWidth?.() || windChartRef.value?.clientWidth || 640,
        );
        const rawHeight = Number(
            windChart?.getHeight?.() || windChartRef.value?.clientHeight || 280,
        );

        const width = Math.max(320, rawWidth);
        const height = Math.max(200, rawHeight);
        const ratio = width / Math.max(height, 1);

        const legendTopPx = clampValue(Math.round(height * 0.03), 4, 12);
        const legendFontSize = clampValue(Math.round(width * 0.018), 10, 14);
        const legendItemWidth = clampValue(Math.round(width * 0.02), 8, 16);
        const legendItemHeight = clampValue(Math.round(height * 0.022), 5, 9);

        const preferredGaugeByWidth = ratio >= 2.2 ? width * 0.12 : width * 0.15;
        const preferredGaugeByHeight = height * 0.3;
        const gaugeRadiusPx = clampValue(
            Math.round(Math.min(preferredGaugeByWidth, preferredGaugeByHeight)),
            46,
            96,
        );
        const gaugeCenterYPx = clampValue(
            Math.round(legendTopPx + 16 + gaugeRadiusPx * 0.85),
            60,
            Math.round(height * 0.42),
        );

        const minSide = Math.min(width, height);
        const gaugeRadiusPercent = `${clampValue(
            (gaugeRadiusPx / minSide) * 100,
            14,
            34,
        ).toFixed(2)}%`;
        const gaugeCenterYPercent = `${((gaugeCenterYPx / height) * 100).toFixed(2)}%`;

        const gaugeStroke = clampValue(Math.round(gaugeRadiusPx * 0.15), 6, 11);
        const gaugeSplitLength = clampValue(Math.round(gaugeRadiusPx * 0.15), 6, 11);
        const gaugeAxisFontSize = clampValue(Math.round(gaugeRadiusPx * 0.16), 8, 12);
        const gaugeDetailFontSize = clampValue(Math.round(gaugeRadiusPx * 0.35), 14, 24);
        const gaugeSplitNumber = gaugeRadiusPx >= 74 ? 6 : 4;
        const gaugeLabelStep = gaugeSplitNumber === 6 ? 2 : 4;
        const gaugeLabelDistance = clampValue(Math.round(gaugeRadiusPx * 0.2), 8, 18);

        const barsTopPx = clampValue(
            Math.round(gaugeCenterYPx + gaugeRadiusPx * 0.45 + height * 0.06),
            120,
            Math.round(height * 0.6),
        );
        const barsTopPercent = `${((barsTopPx / height) * 100).toFixed(2)}%`;

        const gridLeft = clampValue(Math.round(width * 0.055), 26, 52);
        const gridRight = clampValue(Math.round(width * 0.03), 12, 22);
        const gridBottom = clampValue(Math.round(height * 0.09), 24, 40);
        const axisFontSize = clampValue(Math.round(width * 0.017), 10, 13);
        const yNameFontSize = clampValue(axisFontSize - 1, 9, 12);
        const barMaxWidth = clampValue(Math.round(width * 0.028), 8, 20);
        const lineSymbolSize = clampValue(Math.round(width * 0.011), 4, 7);

        return {
            legendTopPx,
            legendFontSize,
            legendItemWidth,
            legendItemHeight,
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
            barsTopPercent,
            gridLeft,
            gridRight,
            gridBottom,
            axisFontSize,
            yNameFontSize,
            barMaxWidth,
            lineSymbolSize,
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

        const forecastMaxPower = Math.max(0, ...dayPowers, ...nightPowers);
        const axisMax = Math.max(8, Math.min(12, Math.ceil(forecastMaxPower + 1)));
        const xLabelRotate = dateLabels.some((item) => String(item || '').length > 5) ? 12 : 0;

        // NOTE: ECharts JS 内的颜色值无法使用 CSS 变量，如需同步主题色请手动与 theme.css 中的变量保持一致
        const option = {
            backgroundColor: 'transparent',
            animationDuration: 420,
            animationDurationUpdate: 300,
            legend: {
                data: ['白天风力', '夜间风力', '平均风力'],
                top: metrics.legendTopPx,
                icon: 'roundRect',
                itemWidth: metrics.legendItemWidth,
                itemHeight: metrics.legendItemHeight,
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
                },
                axisLine: { lineStyle: { color: '#7fb79a' } },
            },
            yAxis: {
                type: 'value',
                name: '级',
                min: 0,
                max: axisMax,
                axisLabel: { color: '#2c6045', fontSize: metrics.axisFontSize },
                nameTextStyle: { color: '#2c6045', fontSize: metrics.yNameFontSize },
                splitLine: { lineStyle: { color: 'rgba(90, 150, 110, 0.18)' } },
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
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
                    startAngle: 210,
                    endAngle: -30,
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
                        itemStyle: {
                            color: new echartsModule.graphic.LinearGradient(0, 0, 1, 0, [
                                { offset: 0, color: '#73c990' },
                                { offset: 1, color: '#24864c' },
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
                        length: metrics.gaugeSplitLength,
                        lineStyle: { color: '#7fb79a', width: 2 },
                    },
                    axisLabel: {
                        color: '#5b846f',
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
                        itemStyle: { color: '#2d8253' },
                        length: '45%',
                        width: Math.max(3, metrics.gaugeStroke * 0.4),
                    },
                    title: { show: false },
                    detail: {
                        valueAnimation: true,
                        fontSize: metrics.gaugeDetailFontSize,
                        fontWeight: 800,
                        color: '#1f5a37',
                        offsetCenter: [0, '52%'],
                        formatter: '{value} 级',
                    },
                    data: [{ value: currentWind }],
                },
                {
                    name: '白天风力',
                    type: 'bar',
                    barMaxWidth: metrics.barMaxWidth,
                    data: dayPowers,
                    itemStyle: {
                        borderRadius: [5, 5, 0, 0],
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
                    data: nightPowers,
                    itemStyle: {
                        borderRadius: [5, 5, 0, 0],
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
                    showSymbol: true,
                    symbolSize: metrics.lineSymbolSize,
                    data: averagePowers,
                    lineStyle: { width: 2.2, color: '#2f7f58', type: 'dashed' },
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

    /** 防抖窗口 resize 处理（同时更新视口宽度并重绘图表） */
    function handleWindowResize() {
        if (typeof window === 'undefined') return;

        if (resizeDebounceTimer !== null) {
            window.clearTimeout(resizeDebounceTimer);
        }

        resizeDebounceTimer = window.setTimeout(() => {
            if (weatherData.viewportWidth) {
                weatherData.viewportWidth.value = window.innerWidth;
            }
            resizeCharts();
            renderTrendChart();
            renderWindChart();
        }, 120);
    }

    /* ------------------------------------------------------------ */
    /*  生命周期                                                       */
    /* ------------------------------------------------------------ */

    onBeforeUnmount(() => {
        if (typeof window !== 'undefined') {
            window.removeEventListener('resize', handleWindowResize);
            if (resizeDebounceTimer !== null) {
                window.clearTimeout(resizeDebounceTimer);
                resizeDebounceTimer = null;
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
    };
}
