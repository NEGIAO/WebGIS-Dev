<template>
    <div class="weather-panel">
        <div class="weather-toolbar">
            <div class="weather-toolbar-left">
                <h2 class="weather-title">WebGIS 动态天气看板</h2>
                <p class="weather-subtitle">高德天气数据实时联动 · 默认 adcode: 410202</p>
            </div>
            <div class="weather-toolbar-right">
                <button class="toolbar-btn" :disabled="isBusy" @click="refreshWeather">
                    {{ isBusy ? '刷新中...' : '刷新天气' }}
                </button>
            </div>
        </div>

        <div class="weather-query-row">
            <div class="query-block">
                <label>按 adcode 查询</label>
                <div class="query-input-row">
                    <input
                        v-model.trim="adcodeInput"
                        class="query-input"
                        type="text"
                        maxlength="6"
                        placeholder="输入6位 adcode"
                        @keyup.enter="applyAdcodeQuery"
                    />
                    <button class="query-btn" :disabled="isBusy" @click="applyAdcodeQuery">查询</button>
                </div>
            </div>

            <div class="query-block">
                <label>按城市名称解析</label>
                <div class="query-input-row">
                    <input
                        v-model.trim="cityInput"
                        class="query-input"
                        type="text"
                        placeholder="输入城市/区县名称"
                        @keyup.enter="resolveCityAndQuery"
                    />
                    <button class="query-btn" :disabled="isBusy" @click="resolveCityAndQuery">解析</button>
                </div>
            </div>
        </div>

        <div class="live-cards">
            <div class="live-main-card">
                <div class="live-main-icon">{{ weatherIcon }}</div>
                <div class="live-main-content">
                    <div class="live-city">{{ liveCityLabel }}</div>
                    <div class="live-weather-text">{{ liveWeatherText }}</div>
                    <div class="live-report-time">{{ liveReportTimeText }}</div>
                </div>
                <div class="live-temp">{{ liveTemperatureText }}</div>
            </div>

            <div class="live-mini-card">
                <span class="mini-label">湿度</span>
                <span class="mini-value">{{ liveHumidityText }}</span>
            </div>
            <div class="live-mini-card">
                <span class="mini-label">风向</span>
                <span class="mini-value">{{ liveWindDirectionText }}</span>
            </div>
            <div class="live-mini-card">
                <span class="mini-label">风力</span>
                <span class="mini-value">{{ liveWindPowerText }}</span>
            </div>
            <div class="live-mini-card">
                <span class="mini-label">当前 adcode</span>
                <span class="mini-value">{{ weatherStore.currentAdcode }}</span>
            </div>
        </div>

        <div class="rain-focus-panel" :class="{ 'has-rain': rainFocus.hasRain, 'unknown': rainFocus.level === 'unknown' }">
            <div class="rain-focus-left">
                <div class="rain-focus-icon">{{ rainFocus.icon }}</div>
                <div class="rain-focus-text">
                    <div class="rain-focus-title">{{ rainFocus.title }}</div>
                    <div class="rain-focus-subtitle">{{ rainFocus.subtitle }}</div>
                </div>
            </div>
            <div class="rain-focus-right">
                <span class="rain-badge">{{ rainFocus.badge }}</span>
                <div class="rain-hit-list">
                    <span v-if="!rainFocus.hits.length" class="rain-hit empty">未来 4 天白天/夜间均未识别到“雨”关键词</span>
                    <span
                        v-for="(hit, idx) in rainFocus.hits"
                        :key="`${hit.date}_${hit.period}_${idx}`"
                        class="rain-hit"
                    >
                        {{ hit.date }} {{ hit.period }} {{ hit.icon }} {{ hit.weather }}
                    </span>
                </div>
            </div>
        </div>

        <div class="charts-layout">
            <div class="chart-panel trend-panel">
                <div class="chart-title">未来 4 天气温趋势</div>
                <div ref="trendChartRef" class="chart-canvas"></div>
            </div>

            <div class="chart-panel side-panel">
                <div class="chart-title">风力仪表 + 预报风级</div>
                <div ref="windChartRef" class="chart-canvas"></div>
            </div>
        </div>

        <div class="details-layout">
            <div class="detail-panel">
                <div class="detail-title">接口返回元信息</div>
                <div class="meta-grid two-columns">
                    <div class="meta-item">
                        <span class="meta-key">base.status</span>
                        <span class="meta-val">{{ baseApiMeta.status }}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-key">all.status</span>
                        <span class="meta-val">{{ forecastApiMeta.status }}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-key">base.count</span>
                        <span class="meta-val">{{ baseApiMeta.count }}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-key">all.count</span>
                        <span class="meta-val">{{ forecastApiMeta.count }}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-key">base.info</span>
                        <span class="meta-val">{{ baseApiMeta.info }}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-key">all.info</span>
                        <span class="meta-val">{{ forecastApiMeta.info }}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-key">base.infocode</span>
                        <span class="meta-val">{{ baseApiMeta.infocode }}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-key">all.infocode</span>
                        <span class="meta-val">{{ forecastApiMeta.infocode }}</span>
                    </div>
                </div>
            </div>

            <div class="detail-panel">
                <div class="detail-title">实况天气 lives 全字段</div>
                <div class="meta-grid">
                    <div class="meta-item"><span class="meta-key">province</span><span class="meta-val">{{ liveWeather?.province || '--' }}</span></div>
                    <div class="meta-item"><span class="meta-key">city</span><span class="meta-val">{{ liveWeather?.city || '--' }}</span></div>
                    <div class="meta-item"><span class="meta-key">adcode</span><span class="meta-val">{{ liveWeather?.adcode || '--' }}</span></div>
                    <div class="meta-item"><span class="meta-key">weather</span><span class="meta-val">{{ resolveWeatherIcon(liveWeather?.weather) }} {{ liveWeather?.weather || '--' }}</span></div>
                    <div class="meta-item"><span class="meta-key">temperature</span><span class="meta-val">{{ liveWeather?.temperature ?? '--' }} °C</span></div>
                    <div class="meta-item"><span class="meta-key">winddirection</span><span class="meta-val">{{ liveWeather?.windDirection || '--' }}</span></div>
                    <div class="meta-item"><span class="meta-key">windpower</span><span class="meta-val">{{ liveWeather?.windPowerText || '--' }}</span></div>
                    <div class="meta-item"><span class="meta-key">humidity</span><span class="meta-val">{{ liveWeather?.humidity ?? '--' }}</span></div>
                    <div class="meta-item"><span class="meta-key">reporttime</span><span class="meta-val">{{ liveWeather?.reportTime || '--' }}</span></div>
                </div>
            </div>

            <div class="detail-panel forecast-panel">
                <div class="detail-title">预报天气 forecasts.casts 全字段（4 日）</div>
                <div class="meta-grid forecast-meta-grid">
                    <div class="meta-item"><span class="meta-key">forecasts.province</span><span class="meta-val">{{ forecastWeather?.province || '--' }}</span></div>
                    <div class="meta-item"><span class="meta-key">forecasts.city</span><span class="meta-val">{{ forecastWeather?.city || '--' }}</span></div>
                    <div class="meta-item"><span class="meta-key">forecasts.adcode</span><span class="meta-val">{{ forecastWeather?.adcode || '--' }}</span></div>
                    <div class="meta-item"><span class="meta-key">forecasts.reporttime</span><span class="meta-val">{{ forecastWeather?.reportTime || '--' }}</span></div>
                </div>
                <div class="forecast-table-wrap">
                    <table class="forecast-table">
                        <thead>
                            <tr>
                                <th>date</th>
                                <th>week</th>
                                <th>dayweather</th>
                                <th>nightweather</th>
                                <th>daytemp</th>
                                <th>nighttemp</th>
                                <th>daywind</th>
                                <th>nightwind</th>
                                <th>daypower</th>
                                <th>nightpower</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(cast, idx) in casts" :key="`${cast.date}_${idx}`">
                                <td>{{ cast.date || '--' }}</td>
                                <td>{{ formatWeekLabel(cast.week) }}</td>
                                <td>{{ resolveWeatherIcon(cast.dayWeather) }} {{ cast.dayWeather || '--' }}</td>
                                <td>{{ resolveWeatherIcon(cast.nightWeather) }} {{ cast.nightWeather || '--' }}</td>
                                <td>{{ cast.dayTemp ?? '--' }} °C</td>
                                <td>{{ cast.nightTemp ?? '--' }} °C</td>
                                <td>{{ cast.dayWind || '--' }}</td>
                                <td>{{ cast.nightWind || '--' }}</td>
                                <td>{{ cast.dayPowerText || '--' }}</td>
                                <td>{{ cast.nightPowerText || '--' }}</td>
                            </tr>
                            <tr v-if="!casts.length">
                                <td colspan="10" class="forecast-empty">暂无预报数据</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <details class="raw-details">
            <summary>查看原始返回 JSON（base / all）</summary>
            <div class="raw-block">
                <h4>base raw</h4>
                <pre>{{ baseRawJson }}</pre>
            </div>
            <div class="raw-block">
                <h4>all raw</h4>
                <pre>{{ forecastRawJson }}</pre>
            </div>
        </details>
    </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMessage } from '../composables/useMessage';
import { getWeather } from '../api/weather';
import { addressToLocation, reverseGeocodeByPriority } from '../api/geocoding';
import {
    getGlobalUserLocationContext,
    USER_LOCATION_CONTEXT_CHANGE_EVENT
} from '../utils/userLocationContext';
import { useWeatherStore } from '../stores';

const message = useMessage();
const weatherStore = useWeatherStore();
const TIANDITU_TK = import.meta.env.VITE_TIANDITU_TK || '';

const adcodeInput = ref(weatherStore.currentAdcode || '410202');
const cityInput = ref('');
const isBusy = ref(false);
const liveWeather = ref(null);
const forecastWeather = ref(null);
const baseApiMeta = ref({ status: '--', count: '--', info: '--', infocode: '--' });
const forecastApiMeta = ref({ status: '--', count: '--', info: '--', infocode: '--' });
const baseRawPayload = ref(null);
const forecastRawPayload = ref(null);
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1366);

const isMobile = computed(() => viewportWidth.value <= 768);
const isCompact = computed(() => viewportWidth.value <= 1100);

const trendChartRef = ref(null);
const windChartRef = ref(null);

let echartsModule = null;
let trendChart = null;
let windChart = null;
let lastWeatherRequestId = 0;
let lastLoadedAdcode = '';
let resizeDebounceTimer = null;

const WEATHER_ICON_MAP = {
    晴: '☀️',
    多云: '⛅',
    阴: '☁️',
    阵雨: '🌦️',
    雷阵雨: '⛈️',
    小雨: '🌧️',
    中雨: '🌧️',
    大雨: '🌧️',
    暴雨: '🌧️',
    小雪: '🌨️',
    中雪: '🌨️',
    大雪: '❄️',
    雾: '🌫️',
    霾: '🌫️',
    有风: '🌬️',
    大风: '🌬️',
    台风: '🌪️',
    沙尘暴: '🌪️'
};

const WEEK_LABEL_MAP = {
    '1': '周一',
    '2': '周二',
    '3': '周三',
    '4': '周四',
    '5': '周五',
    '6': '周六',
    '7': '周日'
};

const RAIN_KEYWORD_REGEXP = /雨|雷|暴雨|阵雨|冻雨|雨夹雪|毛毛雨|强对流/;

function resolveWeatherIcon(weatherText) {
    const text = String(weatherText || '').trim();
    if (!text) return '🌤️';

    const exact = WEATHER_ICON_MAP[text];
    if (exact) return exact;

    const matchedKey = Object.keys(WEATHER_ICON_MAP).find((key) => text.includes(key));
    return matchedKey ? WEATHER_ICON_MAP[matchedKey] : '🌤️';
}

function hasRainSignal(weatherText) {
    return RAIN_KEYWORD_REGEXP.test(String(weatherText || '').trim());
}

function formatWeekLabel(weekValue) {
    const text = String(weekValue || '').trim();
    if (!text) return '--';
    return WEEK_LABEL_MAP[text] || text;
}

function toFixedNumber(value, fallback = '--') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return numeric;
}

function toNumberOrNull(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function normalizeWindPower(value) {
    const text = String(value ?? '').trim();
    const matched = text.match(/\d+(?:\.\d+)?/);
    const numeric = matched ? Number(matched[0]) : 0;
    return Number.isFinite(numeric) ? numeric : 0;
}

function formatDateLabel(dateText) {
    const text = String(dateText || '').trim();
    if (!text) return '--';

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}-${day}`;
}

const casts = computed(() => {
    const list = Array.isArray(forecastWeather.value?.casts) ? forecastWeather.value.casts : [];
    return list.slice(0, 4);
});

const weatherIcon = computed(() => {
    const weatherText = String(liveWeather.value?.weather || '').trim();
    return resolveWeatherIcon(weatherText);
});

const liveCityLabel = computed(() => {
    const province = String(liveWeather.value?.province || forecastWeather.value?.province || weatherStore.currentProvince || '').trim();
    const city = String(liveWeather.value?.city || forecastWeather.value?.city || weatherStore.currentCity || '').trim();
    return `${province}${city}`.trim() || '未知城市';
});

const liveWeatherText = computed(() => String(liveWeather.value?.weather || '天气未知').trim() || '天气未知');
const liveTemperatureText = computed(() => {
    const temp = toFixedNumber(liveWeather.value?.temperature, '--');
    return temp === '--' ? '--°C' : `${temp}°C`;
});
const liveHumidityText = computed(() => {
    const humidity = toFixedNumber(liveWeather.value?.humidity, '--');
    return humidity === '--' ? '--' : `${humidity}%`;
});
const liveWindDirectionText = computed(() => String(liveWeather.value?.windDirection || '--').trim() || '--');
const liveWindPowerText = computed(() => String(liveWeather.value?.windPowerText || '--').trim() || '--');
const liveReportTimeText = computed(() => String(liveWeather.value?.reportTime || forecastWeather.value?.reportTime || '--').trim() || '--');

const baseRawJson = computed(() => JSON.stringify(baseRawPayload.value || {}, null, 2));
const forecastRawJson = computed(() => JSON.stringify(forecastRawPayload.value || {}, null, 2));

const rainFocus = computed(() => {
    const liveText = String(liveWeather.value?.weather || '').trim();
    const liveHasRain = hasRainSignal(liveText);

    const hits = [];
    casts.value.forEach((cast) => {
        const date = formatDateLabel(cast?.date || '');

        if (hasRainSignal(cast?.dayWeather)) {
            hits.push({
                date,
                period: '白天',
                weather: String(cast?.dayWeather || '--'),
                icon: resolveWeatherIcon(cast?.dayWeather)
            });
        }

        if (hasRainSignal(cast?.nightWeather)) {
            hits.push({
                date,
                period: '夜间',
                weather: String(cast?.nightWeather || '--'),
                icon: resolveWeatherIcon(cast?.nightWeather)
            });
        }
    });

    const hasRain = liveHasRain || hits.length > 0;
    const hasAnyText = !!liveText || casts.value.some((cast) => String(cast?.dayWeather || cast?.nightWeather || '').trim());

    if (!hasAnyText) {
        return {
            hasRain: false,
            level: 'unknown',
            icon: '🌫️',
            badge: '待判定',
            title: '暂未获取到可判定的天气文本',
            subtitle: '请刷新或切换 adcode 后重试',
            hits
        };
    }

    if (hasRain) {
        return {
            hasRain: true,
            level: 'rain',
            icon: '🌧️',
            badge: '降雨信号',
            title: liveHasRain
                ? `当前实况：${resolveWeatherIcon(liveText)} ${liveText}`
                : '未来 4 日预报存在降雨时段',
            subtitle: hits.length
                ? `未来 4 日识别到 ${hits.length} 个可能降雨时段`
                : '当前天气文本中包含降雨关键词',
            hits
        };
    }

    return {
        hasRain: false,
        level: 'clear',
        icon: '☀️',
        badge: '无雨信号',
        title: '当前与未来 4 日未识别到降雨关键词',
        subtitle: '如需更精细的降雨概率，建议接入分钟级降水或雷达数据',
        hits
    };
});

function renderTrendChart() {
    if (!trendChart || !echartsModule) return;

    const mobile = isMobile.value;
    const compact = isCompact.value;

    const dates = casts.value.map((item) => formatDateLabel(item.date));
    const dayTemps = casts.value.map((item) => toNumberOrNull(item?.dayTemp));
    const nightTemps = casts.value.map((item) => toNumberOrNull(item?.nightTemp));
    const validTemps = [...dayTemps, ...nightTemps].filter((temp) => Number.isFinite(temp));

    const yMin = validTemps.length ? Math.max(-50, Math.floor(Math.min(...validTemps) - 2)) : 0;
    const yMax = validTemps.length ? Math.min(60, Math.ceil(Math.max(...validTemps) + 2)) : 40;

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
            }
        },
        legend: {
            data: ['白天气温', '晚间气温'],
            top: 8,
            icon: 'roundRect',
            itemWidth: mobile ? 10 : 14,
            itemHeight: mobile ? 6 : 8,
            textStyle: { color: '#2a5a3f', fontSize: mobile ? 11 : 12 }
        },
        grid: {
            left: mobile ? 34 : 42,
            right: mobile ? 14 : 18,
            top: mobile ? 46 : 48,
            bottom: mobile ? 34 : 30,
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: dates,
            axisLine: { lineStyle: { color: '#7fb79a' } },
            axisLabel: {
                color: '#2c6045',
                fontSize: mobile ? 11 : 12,
                rotate: compact ? 14 : 0
            },
            axisTick: { alignWithLabel: true }
        },
        yAxis: {
            type: 'value',
            name: '°C',
            min: yMin,
            max: yMax,
            axisLine: { show: false },
            axisLabel: { color: '#2c6045', fontSize: mobile ? 11 : 12 },
            nameTextStyle: { color: '#2c6045', fontSize: mobile ? 10 : 11 },
            splitLine: { lineStyle: { color: 'rgba(90, 150, 110, 0.18)' } }
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
                        { offset: 1, color: 'rgba(60, 180, 107, 0.02)' }
                    ])
                },
                emphasis: { focus: 'series' },
                markPoint: mobile ? undefined : {
                    symbolSize: 34,
                    label: { color: '#ffffff', fontSize: 10 },
                    itemStyle: { color: '#2f9b58' },
                    data: [{ type: 'max', name: '最高' }, { type: 'min', name: '最低' }]
                }
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
                        { offset: 1, color: 'rgba(45, 140, 255, 0.02)' }
                    ])
                },
                emphasis: { focus: 'series' }
            }
        ]
    };

    trendChart.setOption(option, { notMerge: true, lazyUpdate: true });
}

function clampValue(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

function getWindLayoutMetrics() {
    const rawWidth = Number(windChart?.getWidth?.() || windChartRef.value?.clientWidth || 640);
    const rawHeight = Number(windChart?.getHeight?.() || windChartRef.value?.clientHeight || 280);

    const width = Math.max(320, rawWidth);
    const height = Math.max(200, rawHeight);
    const ratio = width / Math.max(height, 1);

    const legendTopPx = clampValue(Math.round(height * 0.03), 4, 12);
    const legendFontSize = clampValue(Math.round(width * 0.018), 10, 14);
    const legendItemWidth = clampValue(Math.round(width * 0.02), 8, 16);
    const legendItemHeight = clampValue(Math.round(height * 0.022), 5, 9);

    const preferredGaugeByWidth = ratio >= 2.2 ? width * 0.12 : width * 0.15;
    const preferredGaugeByHeight = height * 0.3;
    const gaugeRadiusPx = clampValue(Math.round(Math.min(preferredGaugeByWidth, preferredGaugeByHeight)), 46, 96);
    const gaugeCenterYPx = clampValue(Math.round(legendTopPx + 16 + gaugeRadiusPx * 0.85), 60, Math.round(height * 0.42));

    const minSide = Math.min(width, height);
    const gaugeRadiusPercent = `${clampValue((gaugeRadiusPx / minSide) * 100, 14, 34).toFixed(2)}%`;
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
        Math.round(height * 0.6)
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
        lineSymbolSize
    };
}

function renderWindChart() {
    if (!windChart || !echartsModule) return;

    const metrics = getWindLayoutMetrics();

    const currentWind = normalizeWindPower(liveWeather.value?.windPowerText);
    const dateLabels = casts.value.map((item) => formatDateLabel(item.date));
    const dayPowers = casts.value.map((item) => {
        const numeric = Number(item?.dayPower);
        return Number.isFinite(numeric) ? numeric : normalizeWindPower(item?.dayPowerText);
    });
    const nightPowers = casts.value.map((item) => {
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
            textStyle: { color: '#2a5a3f', fontSize: metrics.legendFontSize }
        },
        grid: {
            left: metrics.gridLeft,
            right: metrics.gridRight,
            top: metrics.barsTopPercent,
            bottom: metrics.gridBottom,
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: dateLabels,
            axisLabel: {
                color: '#2c6045',
                fontSize: metrics.axisFontSize,
                rotate: xLabelRotate
            },
            axisLine: { lineStyle: { color: '#7fb79a' } }
        },
        yAxis: {
            type: 'value',
            name: '级',
            min: 0,
            max: axisMax,
            axisLabel: { color: '#2c6045', fontSize: metrics.axisFontSize },
            nameTextStyle: { color: '#2c6045', fontSize: metrics.yNameFontSize },
            splitLine: { lineStyle: { color: 'rgba(90, 150, 110, 0.18)' } }
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
                const cast = casts.value[dataIndex] || {};
                const lines = list.map((item) => {
                    const value = Number(item?.data);
                    const text = Number.isFinite(value) ? `${value}级` : '--';
                    return `${item.marker}${item.seriesName}: ${text}`;
                });

                return [
                    String(list[0]?.axisValue || '--'),
                    ...lines,
                    `白天风向: ${String(cast?.dayWind || '--')}`,
                    `夜间风向: ${String(cast?.nightWind || '--')}`
                ].join('<br/>');
            }
        },
        series: [
            {
                type: 'gauge',
                startAngle: 210,
                endAngle: -30,
                tooltip: {
                    trigger: 'item',
                    formatter: `当前实况风力：${currentWind} 级`
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
                            { offset: 1, color: '#24864c' }
                        ])
                    } 
                },
                axisLine: {
                    roundCap: true,
                    lineStyle: {
                        width: metrics.gaugeStroke,
                        color: [[1, 'rgba(65, 150, 95, 0.12)']]
                    }
                },
                axisTick: { show: false },
                splitLine: { 
                    length: metrics.gaugeSplitLength, 
                    lineStyle: { color: '#7fb79a', width: 2 } 
                },
                axisLabel: {
                    color: '#5b846f',
                    fontSize: metrics.gaugeAxisFontSize,
                    distance: metrics.gaugeLabelDistance,
                    formatter(value) {
                        const numeric = Number(value);
                        if (!Number.isFinite(numeric)) return '';
                        return numeric % metrics.gaugeLabelStep === 0 ? String(numeric) : '';
                    }
                },
                pointer: { 
                    itemStyle: { color: '#2d8253' }, 
                    length: '45%',
                    width: Math.max(3, metrics.gaugeStroke * 0.4)
                },
                title: { show: false },
                detail: {
                    valueAnimation: true,
                    fontSize: metrics.gaugeDetailFontSize,
                    fontWeight: 800,
                    color: '#1f5a37',
                    offsetCenter: [0, '52%'],
                    formatter: '{value} 级'
                },
                data: [{ value: currentWind }]
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
                        { offset: 1, color: 'rgba(63, 183, 110, 0.48)' }
                    ])
                }
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
                        { offset: 1, color: 'rgba(43, 139, 255, 0.45)' }
                    ])
                }
            },
            {
                name: '平均风力',
                type: 'line',
                smooth: true,
                showSymbol: true,
                symbolSize: metrics.lineSymbolSize,
                data: averagePowers,
                lineStyle: { width: 2.2, color: '#2f7f58', type: 'dashed' },
                itemStyle: { color: '#2f7f58' }
            }
        ]
    };

    windChart.setOption(option, { notMerge: true, lazyUpdate: true });
}

function showChartsLoading() {
    trendChart?.showLoading?.('default', { text: '天气数据加载中...' });
    windChart?.showLoading?.('default', { text: '天气数据加载中...' });
}

function hideChartsLoading() {
    trendChart?.hideLoading?.();
    windChart?.hideLoading?.();
}

async function ensureEchartsReady() {
    if (echartsModule) return;
    const module = await import('echarts');
    echartsModule = module;
}

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

function resizeCharts() {
    trendChart?.resize?.();
    windChart?.resize?.();
}

function handleWindowResize() {
    if (typeof window === 'undefined') return;

    if (resizeDebounceTimer !== null) {
        window.clearTimeout(resizeDebounceTimer);
    }

    resizeDebounceTimer = window.setTimeout(() => {
        viewportWidth.value = window.innerWidth;
        resizeCharts();
        renderTrendChart();
        renderWindChart();
    }, 120);
}

async function loadWeatherByAdcode(adcode, options = {}) {
    const normalizedAdcode = String(adcode || '').trim();
    const force = !!options.force;

    if (!/^\d{6}$/.test(normalizedAdcode)) {
        message.warning('请输入有效的 6 位 adcode');
        return;
    }

    if (!force && normalizedAdcode === lastLoadedAdcode) {
        await nextTick();
        resizeCharts();
        renderTrendChart();
        renderWindChart();
        return;
    }

    const requestId = ++lastWeatherRequestId;
    isBusy.value = true;

    try {
        await ensureChartInstances();
        showChartsLoading();

        const [baseResult, allResult] = await Promise.all([
            getWeather(normalizedAdcode, 'base'),
            getWeather(normalizedAdcode, 'all')
        ]);

        if (requestId !== lastWeatherRequestId) return;

        liveWeather.value = baseResult?.live || null;
        forecastWeather.value = allResult?.forecast || null;
        baseApiMeta.value = {
            status: String(baseResult?.status || baseResult?.raw?.status || '--'),
            count: String(baseResult?.count || baseResult?.raw?.count || '--'),
            info: String(baseResult?.info || baseResult?.raw?.info || '--'),
            infocode: String(baseResult?.infocode || baseResult?.raw?.infocode || '--')
        };
        forecastApiMeta.value = {
            status: String(allResult?.status || allResult?.raw?.status || '--'),
            count: String(allResult?.count || allResult?.raw?.count || '--'),
            info: String(allResult?.info || allResult?.raw?.info || '--'),
            infocode: String(allResult?.infocode || allResult?.raw?.infocode || '--')
        };
        baseRawPayload.value = baseResult?.raw || null;
        forecastRawPayload.value = allResult?.raw || null;
        lastLoadedAdcode = normalizedAdcode;

        weatherStore.setAdcode(normalizedAdcode, {
            city: baseResult?.city || allResult?.city || weatherStore.currentCity,
            province: baseResult?.province || allResult?.province || weatherStore.currentProvince,
            source: String(options.source || 'weather-fetch')
        });

        await nextTick();
        resizeCharts();
        renderTrendChart();
        renderWindChart();
    } catch {
        // getWeather 内部已完成错误提示，这里吞掉异常以避免 watcher 链路产生未处理拒绝。
    } finally {
        if (requestId === lastWeatherRequestId) {
            isBusy.value = false;
            hideChartsLoading();
        }
    }
}

function applyAdcodeFromLocationContext(context, source = 'location-context') {
    const currentContext = context || getGlobalUserLocationContext();
    const adcode = String(currentContext?.encodedLocation?.adcode || '').trim();
    if (!/^\d{6}$/.test(adcode)) return false;

    weatherStore.setAdcode(adcode, {
        city: currentContext?.encodedLocation?.city || weatherStore.currentCity,
        province: currentContext?.encodedLocation?.province || weatherStore.currentProvince,
        source
    });
    adcodeInput.value = adcode;
    return true;
}

async function resolveAdcodeByLonLat(lon, lat, source = 'map-event') {
    const longitude = Number(lon);
    const latitude = Number(lat);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;

    try {
        const reverseResult = await reverseGeocodeByPriority(longitude, latitude, {
            tiandituTk: TIANDITU_TK,
            silent: true
        });

        const nextAdcode = String(reverseResult?.adcode || '').trim();
        if (!/^\d{6}$/.test(nextAdcode)) return;

        weatherStore.setAdcode(nextAdcode, {
            city: reverseResult?.city || weatherStore.currentCity,
            province: reverseResult?.province || weatherStore.currentProvince,
            source
        });
        adcodeInput.value = nextAdcode;
    } catch {
        // 地图联动解析失败时不打断主流程。
    }
}

async function applyAdcodeQuery() {
    const nextAdcode = String(adcodeInput.value || '').trim();
    if (!/^\d{6}$/.test(nextAdcode)) {
        message.warning('请输入有效的 6 位 adcode');
        return;
    }

    weatherStore.setAdcode(nextAdcode, { source: 'manual-adcode' });
    await loadWeatherByAdcode(nextAdcode, { force: true, source: 'manual-adcode' });
}

async function resolveCityAndQuery() {
    const cityText = String(cityInput.value || '').trim();
    if (!cityText) {
        message.warning('请输入城市或区县名称');
        return;
    }

    isBusy.value = true;
    try {
        const geocode = await addressToLocation(cityText, cityText, { silent: true });
        const reverseResult = await reverseGeocodeByPriority(geocode.lng, geocode.lat, {
            tiandituTk: TIANDITU_TK,
            silent: true
        });

        const nextAdcode = String(geocode?.adcode || reverseResult?.adcode || '').trim();
        if (!/^\d{6}$/.test(nextAdcode)) {
            message.warning('未解析到有效 adcode，请尝试更详细的地名');
            return;
        }

        weatherStore.setAdcode(nextAdcode, {
            city: reverseResult?.city || cityText,
            province: reverseResult?.province || weatherStore.currentProvince,
            source: 'city-input'
        });

        adcodeInput.value = nextAdcode;
        await loadWeatherByAdcode(nextAdcode, { force: true, source: 'city-input' });
    } finally {
        isBusy.value = false;
    }
}

async function refreshWeather() {
    await loadWeatherByAdcode(weatherStore.currentAdcode || adcodeInput.value || '410202', {
        force: true,
        source: 'manual-refresh'
    });
}

function handleLocationContextChange(event) {
    const context = event?.detail?.context || null;
    const changed = applyAdcodeFromLocationContext(context, 'location-context-change');
    if (!changed) return;

    void loadWeatherByAdcode(weatherStore.currentAdcode, {
        force: true,
        source: 'location-context-change'
    });
}

watch(
    () => weatherStore.currentAdcode,
    (nextAdcode) => {
        const normalized = String(nextAdcode || '').trim();
        if (!/^\d{6}$/.test(normalized)) return;
        adcodeInput.value = normalized;
        void loadWeatherByAdcode(normalized, { source: 'store-watch' });
    }
);

watch(
    () => weatherStore.mapPointTrigger?.timestamp,
    () => {
        const payload = weatherStore.mapPointTrigger;
        if (!payload) return;
        void resolveAdcodeByLonLat(payload.lon, payload.lat, payload.source || 'map-event');
    }
);

onMounted(async () => {
    await ensureChartInstances();
    viewportWidth.value = typeof window !== 'undefined' ? window.innerWidth : 1366;

    const loadedFromContext = applyAdcodeFromLocationContext(null, 'location-context-initial');
    const initAdcode = loadedFromContext
        ? weatherStore.currentAdcode
        : (weatherStore.currentAdcode || '410202');

    await loadWeatherByAdcode(initAdcode, {
        force: true,
        source: 'component-mounted'
    });

    if (typeof window !== 'undefined') {
        window.addEventListener(USER_LOCATION_CONTEXT_CHANGE_EVENT, handleLocationContextChange);
        window.addEventListener('resize', handleWindowResize);
    }
});

onBeforeUnmount(() => {
    if (typeof window !== 'undefined') {
        window.removeEventListener(USER_LOCATION_CONTEXT_CHANGE_EVENT, handleLocationContextChange);
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
</script>

<style scoped>
.weather-panel {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    box-sizing: border-box;
    background:
        radial-gradient(circle at 20% 10%, rgba(86, 184, 118, 0.24), transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(44, 133, 76, 0.22), transparent 35%),
        linear-gradient(145deg, #f4fbf6 0%, #e9f5ed 100%);
    border-radius: 12px;
    overflow: auto;
}

.weather-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(66, 147, 92, 0.26);
    background: rgba(255, 255, 255, 0.78);
    backdrop-filter: blur(6px);
}

.weather-title {
    margin: 0;
    font-size: 20px;
    line-height: 1.2;
    color: #1f5a37;
}

.weather-subtitle {
    margin: 4px 0 0;
    font-size: 12px;
    color: #4e7b60;
}

.weather-toolbar-right {
    display: flex;
    align-items: center;
}

.toolbar-btn {
    border: 1px solid #5ba679;
    border-radius: 8px;
    background: linear-gradient(135deg, #41a668 0%, #2f8551 100%);
    color: #fff;
    height: 34px;
    padding: 0 14px;
    font-size: 13px;
    cursor: pointer;
    transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.toolbar-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 14px rgba(47, 133, 81, 0.22);
}

.weather-query-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}

.query-block {
    border: 1px solid rgba(66, 147, 92, 0.24);
    background: rgba(255, 255, 255, 0.72);
    border-radius: 10px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.query-block label {
    font-size: 12px;
    color: #356749;
    font-weight: 600;
}

.query-input-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px;
}

.query-input {
    border: 1px solid #9dcdb0;
    border-radius: 8px;
    height: 32px;
    padding: 0 10px;
    font-size: 12px;
    color: #234d35;
    background: #fff;
}

.query-input:focus {
    outline: none;
    border-color: #3ca565;
    box-shadow: 0 0 0 2px rgba(60, 165, 101, 0.15);
}

.query-btn {
    border: 1px solid #7db898;
    border-radius: 8px;
    min-width: 58px;
    height: 32px;
    background: #ebf7ef;
    color: #1f6b42;
    font-size: 12px;
    cursor: pointer;
}

.live-cards {
    display: grid;
    grid-template-columns: minmax(260px, 2.1fr) repeat(4, minmax(0, 1fr));
    gap: 8px;
}

.live-main-card {
    border: 1px solid rgba(57, 142, 87, 0.26);
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(227, 244, 233, 0.92));
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
}

.live-main-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: rgba(54, 154, 91, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 27px;
    flex-shrink: 0;
}

.live-main-content {
    min-width: 0;
    flex: 1;
}

.live-city {
    font-size: 15px;
    font-weight: 700;
    color: #204f35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.live-weather-text {
    margin-top: 3px;
    font-size: 12px;
    color: #48725a;
}

.live-report-time {
    margin-top: 2px;
    font-size: 11px;
    color: #6a8b77;
}

.live-temp {
    font-size: 28px;
    font-weight: 700;
    color: #28874f;
    flex-shrink: 0;
}

.live-mini-card {
    border: 1px solid rgba(57, 142, 87, 0.18);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.76);
    padding: 8px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
}

.mini-label {
    font-size: 11px;
    color: #5f836e;
}

.mini-value {
    font-size: 15px;
    font-weight: 700;
    color: #25583b;
    word-break: break-word;
}

.rain-focus-panel {
    border: 1px solid rgba(57, 142, 87, 0.22);
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(245, 252, 247, 0.95), rgba(232, 246, 237, 0.92));
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.rain-focus-panel.has-rain {
    border-color: rgba(34, 126, 192, 0.35);
    background: linear-gradient(135deg, rgba(236, 248, 255, 0.92), rgba(228, 241, 252, 0.95));
}

.rain-focus-panel.unknown {
    border-color: rgba(122, 152, 139, 0.32);
    background: linear-gradient(135deg, rgba(243, 248, 245, 0.95), rgba(233, 241, 237, 0.92));
}

.rain-focus-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}

.rain-focus-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(72, 157, 103, 0.14);
    font-size: 24px;
    flex-shrink: 0;
}

.rain-focus-title {
    font-size: 15px;
    font-weight: 700;
    color: #1f4f35;
}

.rain-focus-subtitle {
    margin-top: 3px;
    font-size: 12px;
    color: #4b7461;
}

.rain-focus-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    min-width: 260px;
}

.rain-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid rgba(54, 147, 88, 0.35);
    color: #1f6d45;
    font-size: 12px;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.75);
}

.rain-hit-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
}

.rain-hit {
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid rgba(54, 147, 88, 0.25);
    background: rgba(255, 255, 255, 0.75);
    color: #1f5b3b;
    font-size: 11px;
    white-space: nowrap;
}

.rain-hit.empty {
    border-style: dashed;
    color: #597a68;
}

.charts-layout {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    align-items: stretch;
    position: relative;
}

.chart-panel {
    border: 1px solid rgba(57, 142, 87, 0.2);
    border-radius: 10px;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    min-height: 0;
    position: relative;
    overflow: hidden;
}

.chart-title {
    padding: 10px 12px 4px;
    font-size: 13px;
    font-weight: 700;
    color: #25583b;
}

.chart-canvas {
    width: 100%;
    height: clamp(240px, 34vh, 340px);
    min-height: 240px;
}

.details-layout {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
}

.detail-panel {
    border: 1px solid rgba(57, 142, 87, 0.2);
    border-radius: 10px;
    background: #ffffff;
    padding: 10px;
    position: relative;
    z-index: 2;
}

.detail-panel.forecast-panel {
    grid-column: 1 / -1;
}

.detail-title {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 700;
    color: #25583b;
}

.meta-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

.meta-grid.two-columns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

.forecast-meta-grid {
    margin-bottom: 8px;
}

.meta-item {
    border: 1px solid rgba(83, 157, 112, 0.2);
    border-radius: 8px;
    background: #f4fbf6;
    padding: 6px 8px;
    min-width: 0;
}

.meta-key {
    display: block;
    font-size: 11px;
    color: #5b846f;
}

.meta-val {
    display: block;
    margin-top: 2px;
    color: #22573a;
    font-size: 13px;
    font-weight: 600;
    word-break: break-word;
}

.forecast-table-wrap {
    width: 100%;
    overflow-x: auto;
}

.forecast-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 940px;
}

.forecast-table th,
.forecast-table td {
    border: 1px solid rgba(93, 163, 121, 0.22);
    padding: 6px 7px;
    text-align: left;
    font-size: 12px;
    color: #24563a;
    background: rgba(255, 255, 255, 0.78);
    white-space: nowrap;
}

.forecast-table th {
    background: rgba(222, 242, 230, 0.92);
    color: #1e5638;
    font-weight: 700;
}

.forecast-empty {
    text-align: center;
    color: #638773;
    font-style: italic;
}

.raw-details {
    border: 1px solid rgba(57, 142, 87, 0.18);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.82);
    padding: 8px 10px;
}

.raw-details summary {
    cursor: pointer;
    color: #1f5f3f;
    font-size: 13px;
    font-weight: 700;
}

.raw-block {
    margin-top: 10px;
}

.raw-block h4 {
    margin: 0 0 6px;
    color: #24563a;
    font-size: 12px;
}

.raw-block pre {
    margin: 0;
    max-height: 220px;
    overflow: auto;
    background: rgba(10, 48, 30, 0.9);
    color: #dff9ea;
    border-radius: 8px;
    padding: 8px;
    font-size: 11px;
    line-height: 1.45;
}

.toolbar-btn:disabled,
.query-btn:disabled {
    opacity: 0.62;
    cursor: not-allowed;
}

@media (max-width: 1200px) {
    .live-cards {
        grid-template-columns: 1fr 1fr;
    }

    .live-main-card {
        grid-column: 1 / -1;
    }

    .charts-layout {
        grid-template-columns: 1fr;
    }

    .chart-canvas {
        height: clamp(228px, 32vh, 300px);
        min-height: 228px;
    }

    .details-layout {
        grid-template-columns: 1fr;
    }

    .meta-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 768px) {
    .weather-panel {
        padding: 9px;
        gap: 8px;
        border-radius: 10px;
    }

    .weather-toolbar {
        flex-direction: column;
        align-items: flex-start;
    }

    .weather-title {
        font-size: 18px;
    }

    .weather-toolbar-right {
        width: 100%;
    }

    .toolbar-btn {
        width: 100%;
        height: 36px;
    }

    .weather-query-row {
        grid-template-columns: 1fr;
    }

    .query-input-row {
        grid-template-columns: 1fr;
    }

    .live-cards {
        grid-template-columns: 1fr;
    }

    .live-main-card {
        grid-column: auto;
    }

    .live-main-icon {
        width: 42px;
        height: 42px;
        font-size: 24px;
    }

    .live-temp {
        font-size: 24px;
    }

    .rain-focus-panel {
        flex-direction: column;
        align-items: flex-start;
    }

    .rain-focus-right {
        min-width: 0;
        width: 100%;
        align-items: flex-start;
    }

    .rain-hit-list {
        justify-content: flex-start;
    }

    .chart-canvas {
        height: 230px;
        min-height: 210px;
    }

    .meta-grid,
    .meta-grid.two-columns {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 480px) {
    .weather-panel {
        padding: 8px;
    }

    .weather-title {
        font-size: 16px;
    }

    .weather-subtitle {
        font-size: 11px;
    }

    .live-city {
        font-size: 14px;
    }

    .mini-value {
        font-size: 14px;
    }

    .chart-title {
        font-size: 12px;
    }

    .chart-canvas {
        height: 212px;
        min-height: 200px;
    }
}
</style>
