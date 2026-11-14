/**
 * 风力图表规格（实况仪表盘 + 预报风级柱线组合）
 *
 * 纯函数：输入 ECharts 运行时、天气数据与布局度量，输出 option；不持有实例、不触碰 DOM。
 */

import { translate as t } from '@common/app/useLocale';
import { clampValue, formatDateLabel, normalizeWindPower } from '@common/weather/utils/weatherUtils';

export interface WindChartOptionInput {
    /** 来自 createWeatherChartsLayout().getWindLayoutMetrics() */
    echarts: any;
    metrics: any;
    weatherData: any;
}

/** 构建风力仪表盘 + 风级柱状图 option */
export function buildWindChartOption({ echarts, weatherData, metrics }: WindChartOptionInput) {
    const castsList = weatherData.casts?.value ?? [];

    const currentWind = normalizeWindPower(
        weatherData.liveWeather?.value?.windPowerText,
    );
    const dateLabels = castsList.map((item: any) => formatDateLabel(item.date));
    const dayPowers = castsList.map((item: any) => {
        const numeric = Number(item?.dayPower);
        return Number.isFinite(numeric) ? numeric : normalizeWindPower(item?.dayPowerText);
    });
    const nightPowers = castsList.map((item: any) => {
        const numeric = Number(item?.nightPower);
        return Number.isFinite(numeric) ? numeric : normalizeWindPower(item?.nightPowerText);
    });
    const averagePowers = dayPowers.map((dayPower: any, index: number) => {
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
    const xLabelRotate = dateLabels.some((item: any) => String(item || '').length > 5) ? 12 : 0;

    // NOTE: ECharts JS 内的颜色值无法使用 CSS 变量，如需同步主题色请手动与 theme.css 中的变量保持一致
    const option = {
        backgroundColor: 'transparent',
        animationDuration: 420,
        animationDurationUpdate: 300,
        legend: {
            show: metrics.showLegend,
            data: [t('weather.dayWindPower'), t('weather.nightWindPower'), t('weather.avgWindPower')],
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
            name: t('weather.windLevelUnit'),
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
            formatter(params: any) {
                const list = Array.isArray(params) ? params : [];
                if (!list.length) return '--';

                const dataIndex = Number(list[0]?.dataIndex);
                const cast = castsList[dataIndex] || {};
                const lines = list.map((item) => {
                    const value = Number(item?.data);
                    const text = Number.isFinite(value)
                        ? t('weather.windLevelValue', { n: value })
                        : '--';
                    return `${item.marker}${item.seriesName}: ${text}`;
                });

                return [
                    String(list[0]?.axisValue || '--'),
                    ...lines,
                    t('weather.dayWindDir', { dir: String(cast?.dayWind || '--') }),
                    t('weather.nightWindDir', { dir: String(cast?.nightWind || '--') }),
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
                    formatter: t('weather.liveWindTooltip', { n: currentWind }),
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
                        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
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
                    formatter(value: any) {
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
                    formatter: t('weather.windLevelFmt'),
                },
                data: [{ value: currentWind, name: t('weather.liveWindGauge') }],
            },
            {
                name: t('weather.dayWindPower'),
                type: 'bar',
                barMaxWidth: metrics.barMaxWidth,
                barGap: '20%',
                barCategoryGap: '42%',
                data: dayPowers,
                itemStyle: {
                    borderRadius: [4, 4, 0, 0],
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(63, 183, 110, 0.92)' },
                        { offset: 1, color: 'rgba(63, 183, 110, 0.48)' },
                    ]),
                },
            },
            {
                name: t('weather.nightWindPower'),
                type: 'bar',
                barMaxWidth: metrics.barMaxWidth,
                barGap: '20%',
                barCategoryGap: '42%',
                data: nightPowers,
                itemStyle: {
                    borderRadius: [4, 4, 0, 0],
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(43, 139, 255, 0.9)' },
                        { offset: 1, color: 'rgba(43, 139, 255, 0.45)' },
                    ]),
                },
            },
            {
                name: t('weather.avgWindPower'),
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
    return option;
}
