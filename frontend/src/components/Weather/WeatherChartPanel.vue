<template>
    <div class="weather-panel">
        <!-- 工具栏 -->
        <div class="weather-toolbar">
            <div class="weather-toolbar-left">
                <h2 class="weather-title">WebGIS 动态天气看板</h2>
                <p class="weather-subtitle">高德天气数据实时联动 · 默认 adcode: 410202</p>
            </div>
            <div class="weather-toolbar-right">
                <button
                    class="toolbar-btn"
                    :disabled="isBusy"
                    @click="refreshWeather"
                >
                    {{ isBusy ? '刷新中...' : '刷新天气' }}
                </button>
            </div>
        </div>

        <!-- 查询行 -->
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
                    <button
                        class="query-btn"
                        :disabled="isBusy"
                        @click="applyAdcodeQuery"
                    >
                        查询
                    </button>
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
                    <button
                        class="query-btn"
                        :disabled="isBusy"
                        @click="resolveCityAndQuery"
                    >
                        解析
                    </button>
                </div>
            </div>
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
                <div class="chart-title">未来 4 天气温趋势</div>
                <div
                    ref="trendChartRef"
                    class="chart-canvas"
                ></div>
            </div>

            <div class="chart-panel side-panel">
                <div class="chart-title">风力仪表 + 预报风级</div>
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
import { computed, ref, watchEffect } from 'vue';
import { useWeatherStore } from '../../stores';
import { useWeatherCharts } from '../../composables/weather/useWeatherCharts';
import { useWeatherData } from '../../composables/weather/useWeatherData';
import WeatherLiveCards from './WeatherLiveCards.vue';
import WeatherForecastTable from './WeatherForecastTable.vue';

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
if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleWindowResize);
}
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
        linear-gradient(145deg, var(--bg-brand-light) 0%, var(--bg-brand-light) 100%);
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
    color: var(--brand-accent-dark);
}

.weather-subtitle {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--brand-accent-muted);
}

.weather-toolbar-right {
    display: flex;
    align-items: center;
}

.toolbar-btn {
    border: 1px solid var(--brand-primary-light);
    border-radius: 8px;
    background: linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-dark) 100%);
    color: #fff;
    height: 34px;
    padding: 0 14px;
    font-size: 13px;
    cursor: pointer;
    transition:
        transform 0.16s ease,
        box-shadow 0.16s ease;
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
    color: var(--brand-primary-dark);
    font-weight: 600;
}

.query-input-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px;
}

.query-input {
    border: 1px solid var(--brand-primary-lighter);
    border-radius: 8px;
    height: 32px;
    padding: 0 10px;
    font-size: 12px;
    color: var(--brand-primary-dark);
    background: #fff;
}

.query-input:focus {
    outline: none;
    border-color: var(--brand-primary);
    box-shadow: 0 0 0 2px rgba(60, 165, 101, 0.15);
}

.query-btn {
    border: 1px solid var(--brand-primary-light);
    border-radius: 8px;
    min-width: 58px;
    height: 32px;
    background: var(--bg-brand-light);
    color: var(--brand-accent-dark);
    font-size: 12px;
    cursor: pointer;
}

/* 图表布局 */
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
    color: var(--brand-primary-dark);
}

.chart-canvas {
    width: 100%;
    height: clamp(240px, 34vh, 340px);
    min-height: 240px;
}

/* 禁用状态 */
.toolbar-btn:disabled,
.query-btn:disabled {
    opacity: 0.62;
    cursor: not-allowed;
}

/* 响应式 */
@media (max-width: 1200px) {
    .charts-layout {
        grid-template-columns: 1fr;
    }

    .chart-canvas {
        height: clamp(228px, 32vh, 300px);
        min-height: 228px;
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

    .chart-canvas {
        height: 230px;
        min-height: 210px;
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

    .chart-title {
        font-size: 12px;
    }

    .chart-canvas {
        height: 212px;
        min-height: 200px;
    }
}
</style>
