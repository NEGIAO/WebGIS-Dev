/**
 * 气温趋势图规格（未来 4 天白/夜双系列折线）
 *
 * 纯函数：输入 ECharts 运行时、天气数据与布局度量，输出 option；不持有实例、不触碰 DOM，
 * 便于与渲染解耦后单测配色/坐标轴/标记点。
 */

import { translate as t } from '@common/app/useLocale';
import { formatDateLabel, toNumberOrNull } from '@common/weather/utils/weatherUtils';

export interface TrendChartOptionInput {
    /** 来自 createWeatherChartsLayout().getTrendLayoutMetrics() */
    echarts: any;
    metrics: any;
    weatherData: any;
}

/** 构建气温趋势图 option */
export function buildTrendChartOption({ echarts, weatherData, metrics }: TrendChartOptionInput) {
    const castsList = weatherData.casts?.value ?? [];

    const dates = castsList.map((item: any) => formatDateLabel(item.date));
    const dayTemps = castsList.map((item: any) => toNumberOrNull(item?.dayTemp));
    const nightTemps = castsList.map((item: any) => toNumberOrNull(item?.nightTemp));
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
            formatter(params: any) {
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
            data: [t('weather.dayTemp'), t('weather.nightTemp')],
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
                name: t('weather.dayTemp'),
                type: 'line',
                smooth: true,
                showSymbol: metrics.showSymbols,
                symbolSize: metrics.symbolSize,
                data: dayTemps,
                connectNulls: true,
                lineStyle: { width: metrics.lineWidth, color: '#3cb46b' },
                itemStyle: { color: '#3cb46b' },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
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
                        formatter(params: any) {
                            const value = Number(params?.value);
                            return Number.isFinite(value) ? `${value}°` : '';
                        },
                    },
                    itemStyle: { color: '#2f9b58' },
                    data: [
                        { type: 'max', name: t('weather.maxMark') },
                        { type: 'min', name: t('weather.minMark') },
                    ],
                },
            },
            {
                name: t('weather.nightTemp'),
                type: 'line',
                smooth: true,
                showSymbol: metrics.showSymbols,
                symbolSize: metrics.symbolSize,
                data: nightTemps,
                connectNulls: true,
                lineStyle: { width: metrics.lineWidth, color: '#2d8cff' },
                itemStyle: { color: '#2d8cff' },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
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
                        formatter(params: any) {
                            const value = Number(params?.value);
                            return Number.isFinite(value) ? `${value}°` : '';
                        },
                    },
                    itemStyle: { color: '#1f73d6' },
                    data: [
                        { type: 'max', name: t('weather.maxMark') },
                        { type: 'min', name: t('weather.minMark') },
                    ],
                },
            },
        ],
    };
    return option;
}
