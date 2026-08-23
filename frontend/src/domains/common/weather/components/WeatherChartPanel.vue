<template>
    <div class="weather-panel">
        <!-- 工具栏 -->
        <div class="weather-toolbar">
            <div class="weather-toolbar-left">
                <span class="weather-badge">
                    <CloudSun
                        :size="16"
                        :stroke-width="1.9"
                    />
                </span>
                <div class="weather-heading">
                    <h2 class="weather-title">{{ t('weather.title') }}</h2>
                    <p class="weather-subtitle">{{ t('weather.subtitle') }}</p>
                </div>
            </div>
            <button
                class="refresh-btn"
                :class="{ busy: isBusy }"
                :disabled="isBusy"
                @click="refreshWeather"
            >
                <RefreshCw
                    :size="13"
                    :stroke-width="2.2"
                />
                <span>{{ isBusy ? t('weather.refreshing') : t('weather.refresh') }}</span>
            </button>
        </div>

        <!-- 查询条：Adcode / 城市 -->
        <div class="join-bar">
            <span class="join-lead">
                <Hash
                    :size="13"
                    :stroke-width="2"
                />
            </span>
            <input
                v-model.trim="adcodeInput"
                class="join-field"
                type="text"
                maxlength="6"
                :placeholder="t('weather.adcodePlaceholder')"
                @keyup.enter="applyAdcodeQuery"
            />
            <button
                class="join-go"
                :disabled="isBusy"
                @click="applyAdcodeQuery"
            >
                {{ t('weather.query') }}
            </button>
        </div>

        <div class="join-bar">
            <span class="join-lead">
                <MapPin
                    :size="13"
                    :stroke-width="2"
                />
            </span>
            <input
                v-model.trim="cityInput"
                class="join-field"
                type="text"
                :placeholder="t('weather.cityPlaceholder')"
                @keyup.enter="resolveCityAndQuery"
            />
            <button
                class="join-go soft"
                :disabled="isBusy"
                @click="resolveCityAndQuery"
            >
                {{ t('weather.resolve') }}
            </button>
        </div>

        <!-- 实况天气卡片 + 降雨聚焦面板 -->
        <WeatherLiveCards
            :weather-icon="weatherIcon"
            :live-city-label="liveCityLabel"
            :live-weather-text="liveWeatherText"
            :live-temperature-text="liveTemperatureText"
            :live-humidity-text="liveHumidityText"
            :live-wind-direction-text="liveWindDirectionText"
            :live-wind-power-text="liveWindPowerText"
            :live-report-time-text="liveReportTimeText"
            :current-adcode="weatherStore.currentAdcode"
            :rain-focus="rainFocus"
        />

        <!-- 图表区 -->
        <div class="charts-layout">
            <div class="chart-panel trend-panel">
                <div class="chart-title">{{ t('weather.tempTrend') }}</div>
                <div
                    ref="trendChartRef"
                    class="chart-canvas"
                ></div>
            </div>

            <div class="chart-panel side-panel">
                <div class="chart-title">{{ t('weather.windGauge') }}</div>
                <div
                    ref="windChartRef"
                    class="chart-canvas"
                ></div>
            </div>
        </div>

        <!-- 预报表格 + API 元信息 -->
        <WeatherForecastTable
            :live-weather="liveWeather"
            :forecast-weather="forecastWeather"
            :casts="casts"
            :base-api-meta="baseApiMeta"
            :forecast-api-meta="forecastApiMeta"
            :base-raw-json="baseRawJson"
            :forecast-raw-json="forecastRawJson"
        />
    </div>
</template>

<script setup>
/**
 * WeatherChartPanel.vue
 * 天气看板主面板（编排层）
 * - 组合 useWeatherCharts + useWeatherData 两个 Composable
 * - 渲染 WeatherLiveCards + WeatherForecastTable 两个子组件
 * - 保留工具栏、查询行、图表容器的直接控制
 *
 * 初始化策略：
 *   1. 创建占位 ref（liveWeather / forecastWeather / casts）
 *   2. 将占位 ref 传入 useWeatherCharts（图表渲染函数在回调时读取 .value）
 *   3. 初始化 useWeatherData，传入图表回调
 *   4. 用 watchEffect 将真实数据同步到占位 ref
 *   这样图表渲染函数被回调触发时，读到的始终是最新数据
 */
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue';
import { CloudSun, Hash, MapPin, RefreshCw } from '@lucide/vue';
import { useWeatherStore } from '@/stores';
import { useWeatherCharts } from '@common/weather/composables/useWeatherCharts';
import { useWeatherData } from '@common/weather/composables/useWeatherData';
import { useLocale } from '@common/app/useLocale';
import WeatherLiveCards from './WeatherLiveCards.vue';
import WeatherForecastTable from './WeatherForecastTable.vue';

const { t } = useLocale();
const weatherStore = useWeatherStore();

/* ------------------------------------------------------------ */
/*  视口响应式状态                                                   */
/* ------------------------------------------------------------ */
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1366);
const isMobile = computed(() => viewportWidth.value <= 768);
const isCompact = computed(() => viewportWidth.value <= 1100);

/* ------------------------------------------------------------ */
/*  占位 ref（图表 Composable 持有引用，后续通过 watchEffect 同步）     */
/* ------------------------------------------------------------ */
const sharedLiveWeather = ref(null);
const sharedForecastWeather = ref(null);
const sharedCasts = ref([]);

/* ------------------------------------------------------------ */
/*  图表 Composable（先初始化，获取图表 refs 和方法）                   */
/* ------------------------------------------------------------ */
const {
    trendChartRef,
    windChartRef,
    ensureChartInstances,
    showChartsLoading,
    hideChartsLoading,
    resizeCharts,
    renderTrendChart,
    renderWindChart,
    handleWindowResize,
} = useWeatherCharts({
    liveWeather: sharedLiveWeather,
    forecastWeather: sharedForecastWeather,
    casts: sharedCasts,
    viewportWidth,
    isMobile,
    isCompact,
});

/* ------------------------------------------------------------ */
/*  数据 Composable（传入图表操作回调）                                */
/* ------------------------------------------------------------ */
const weatherData = useWeatherData({
    ensureChartInstances,
    showChartsLoading,
    hideChartsLoading,
    resizeCharts,
    renderTrendChart,
    renderWindChart,
});

// 将数据 Composable 的响应式状态持续同步到占位 ref
// 图表渲染函数在回调中读取 sharedCasts.value 等，始终获得最新数据
watchEffect(() => {
    sharedLiveWeather.value = weatherData.liveWeather.value;
    sharedForecastWeather.value = weatherData.forecastWeather.value;
    sharedCasts.value = weatherData.casts.value;
});

/* ------------------------------------------------------------ */
/*  模板解构                                                        */
/* ------------------------------------------------------------ */
const {
    adcodeInput,
    cityInput,
    isBusy,
    liveWeather,
    forecastWeather,
    baseApiMeta,
    forecastApiMeta,
    casts,
    weatherIcon,
    liveCityLabel,
    liveWeatherText,
    liveTemperatureText,
    liveHumidityText,
    liveWindDirectionText,
    liveWindPowerText,
    liveReportTimeText,
    baseRawJson,
    forecastRawJson,
    rainFocus,
    applyAdcodeQuery,
    resolveCityAndQuery,
    refreshWeather,
} = weatherData;

/* ------------------------------------------------------------ */
/*  注册窗口 resize 监听                                            */
/* ------------------------------------------------------------ */
onMounted(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', handleWindowResize, { passive: true });
});

onBeforeUnmount(() => {
    if (typeof window === 'undefined') return;
    window.removeEventListener('resize', handleWindowResize);
});
</script>

<style scoped>
/* 天气面板 - 启用容器查询 */
.weather-panel {
    height: 100%;
    width: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    box-sizing: border-box;
    background:
        radial-gradient(circle at 20% 10%, rgba(86, 184, 118, 0.24), transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(44, 133, 76, 0.22), transparent 35%),
        linear-gradient(145deg, var(--bg-brand-light) 0%, var(--bg-brand-light) 100%);
    border-radius: 12px;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    /* 启用容器查询，让子组件根据面板宽度自适应 */
    container-type: inline-size;
    container-name: weather-panel;
}

/* ===== 工具栏：去卡片化 ===== */
.weather-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 2px 2px 0;
}

.weather-toolbar-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}

.weather-badge {
    flex-shrink: 0;
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 11px;
    background: var(--brand-gradient);
    color: #ffffff;
    box-shadow:
        0 4px 10px rgba(var(--brand-primary-dark-rgb), 0.28),
        inset 0 1px 0 rgba(255, 255, 255, 0.28);
}

.weather-heading {
    min-width: 0;
}

.weather-title {
    margin: 0;
    font-size: 17px;
    line-height: 1.25;
    color: var(--brand-accent-dark);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.weather-subtitle {
    margin: 1px 0 0;
    font-size: 11px;
    color: var(--brand-accent-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* 刷新按钮：幽灵胶囊，忙碌时图标旋转 */
.refresh-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.35);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.72);
    color: var(--toc-primary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition:
        background var(--toc-transition-fast),
        color var(--toc-transition-fast),
        transform var(--toc-transition-fast);
}

.refresh-btn:hover:not(:disabled) {
    background: #ffffff;
    color: var(--brand-accent-dark);
    transform: translateY(-1px);
}

.refresh-btn:active:not(:disabled) {
    transform: scale(0.96);
}

.refresh-btn.busy svg {
    animation: refreshSpin 0.9s linear infinite;
}

@keyframes refreshSpin {
    to {
        transform: rotate(360deg);
    }
}

/* ===== 一体式查询条 ===== */
.join-bar {
    display: flex;
    align-items: stretch;
    min-height: 34px;
    background: rgba(255, 255, 255, 0.82);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    border-radius: 11px;
    overflow: hidden;
    transition:
        border-color 0.2s ease-out,
        box-shadow 0.2s ease-out,
        background 0.2s ease-out;
}

.join-bar:focus-within {
    border-color: var(--brand-primary-light);
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 0 0 3px rgba(60, 165, 101, 0.14);
}

.join-lead {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    padding-left: 11px;
    color: var(--brand-accent-muted);
    opacity: 0.7;
    transition: opacity 0.16s ease;
}

.join-bar:focus-within .join-lead {
    opacity: 1;
}

.join-field {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    padding: 8px 10px;
    font-size: 12px;
    color: var(--brand-primary-dark);
    outline: none;
}

.join-field::placeholder {
    color: var(--brand-accent-muted);
    opacity: 0.65;
}

/* 条尾操作段：主查询渐变 / 次解析软着色 */
.join-go {
    flex-shrink: 0;
    border: none;
    background: var(--brand-gradient);
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    padding: 0 14px;
    cursor: pointer;
    white-space: nowrap;
    transition:
        filter 0.12s ease,
        opacity 0.12s ease;
}

.join-go:hover:not(:disabled) {
    filter: brightness(1.06);
}

.join-go.soft {
    background: rgba(var(--brand-primary-rgb), 0.1);
    color: var(--brand-accent-dark);
}

.join-go.soft:hover:not(:disabled) {
    background: rgba(var(--brand-primary-rgb), 0.18);
    filter: none;
}

/* 图表布局 */
.charts-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.08fr) minmax(280px, 0.92fr);
    grid-auto-rows: minmax(clamp(230px, 32dvh, 390px), 1fr);
    gap: 10px;
    align-items: stretch;
    position: relative;
    width: 100%;
    min-width: 0;
    /* 图表区随可用页面高度伸缩，同时保留详情区的滚动空间 */
    flex: 0 0 auto;
    min-height: clamp(250px, 34dvh, 410px);
    container-type: inline-size;
    container-name: weather-charts;
}

.chart-panel {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    border-radius: 12px;
    background:
        linear-gradient(180deg, rgba(246, 253, 248, 0.98) 0%, rgba(255, 255, 255, 0.98) 44%),
        #ffffff;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    position: relative;
    overflow: hidden;
    box-shadow: var(--toc-shadow-sm);
}

.trend-panel {
    --chart-accent: #3cb46b;
}

.side-panel {
    --chart-accent: #2d8cff;
}

.chart-title {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 11px 12px 5px;
    font-size: 13px;
    font-weight: 700;
    color: var(--brand-primary-dark);
    flex-shrink: 0;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* 标题前主题色圆点，取代顶部渐变条 */
.chart-title::before {
    content: '';
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--chart-accent);
    box-shadow: 0 0 6px var(--chart-accent);
}

.chart-canvas {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    position: relative;
    overflow: hidden;
    /* 占满 chart-panel 减去 title 的剩余空间 */
    flex: 1 1 auto;
}

/* 禁用状态 */
.refresh-btn:disabled,
.join-go:disabled {
    opacity: 0.62;
    cursor: not-allowed;
}

/* 容器查询 - 根据父容器宽度自适应（优先级高于媒体查询） */
@container weather-panel (max-width: 900px) {
    .charts-layout {
        grid-template-columns: 1fr;
        grid-auto-rows: minmax(clamp(220px, 38dvh, 340px), auto);
        min-height: 0;
    }
}

@container weather-panel (max-width: 600px) {
    .weather-toolbar {
        flex-wrap: wrap;
    }

    .refresh-btn {
        flex: 1 0 auto;
        justify-content: center;
        height: 32px;
    }

    .charts-layout {
        gap: 8px;
        grid-auto-rows: minmax(clamp(190px, 50cqw, 280px), auto);
    }

    .chart-title {
        padding: 9px 10px 4px;
    }
}

@container weather-panel (max-width: 400px) {
    .weather-title {
        font-size: 16px;
    }

    .weather-subtitle {
        font-size: 11px;
    }

    .chart-title {
        font-size: 12px;
    }

    .charts-layout {
        grid-auto-rows: minmax(clamp(170px, 58cqw, 240px), auto);
    }
}

/* 媒体查询 - 作为兜底（视口级响应） */
@media (max-width: 768px) {
    .weather-panel {
        padding: 9px;
        gap: 8px;
    }
}

@media (max-width: 480px) {
    .weather-panel {
        padding: 8px;
    }
}
</style>
