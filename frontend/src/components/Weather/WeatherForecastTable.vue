<!--
  WeatherForecastTable.vue
  预报表格 + API 元信息面板 + 原始 JSON 折叠区
  - 纯展示组件，通过 props 接收数据
  - 封装 resolveWeatherIcon / formatWeekLabel 调用
-->
<template>
    <div class="details-layout">
        <!-- 接口元信息面板 -->
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

        <!-- 实况天气全字段面板 -->
        <div class="detail-panel">
            <div class="detail-title">实况天气 lives 全字段</div>
            <div class="meta-grid">
                <div class="meta-item">
                    <span class="meta-key">province</span>
                    <span class="meta-val">{{ liveWeather?.province || '--' }}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-key">city</span>
                    <span class="meta-val">{{ liveWeather?.city || '--' }}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-key">adcode</span>
                    <span class="meta-val">{{ liveWeather?.adcode || '--' }}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-key">weather</span>
                    <span class="meta-val"
                        >{{ resolveWeatherIcon(liveWeather?.weather) }}
                        {{ liveWeather?.weather || '--' }}</span
                    >
                </div>
                <div class="meta-item">
                    <span class="meta-key">temperature</span>
                    <span class="meta-val">{{ liveWeather?.temperature ?? '--' }} °C</span>
                </div>
                <div class="meta-item">
                    <span class="meta-key">winddirection</span>
                    <span class="meta-val">{{ liveWeather?.windDirection || '--' }}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-key">windpower</span>
                    <span class="meta-val">{{ liveWeather?.windPowerText || '--' }}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-key">humidity</span>
                    <span class="meta-val">{{ liveWeather?.humidity ?? '--' }}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-key">reporttime</span>
                    <span class="meta-val">{{ liveWeather?.reportTime || '--' }}</span>
                </div>
            </div>
        </div>

        <!-- 预报天气表格 -->
        <div class="detail-panel forecast-panel">
            <div class="detail-title">预报天气 forecasts.casts 全字段（4 日）</div>
            <div class="meta-grid forecast-meta-grid">
                <div class="meta-item">
                    <span class="meta-key">forecasts.province</span>
                    <span class="meta-val">{{ forecastWeather?.province || '--' }}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-key">forecasts.city</span>
                    <span class="meta-val">{{ forecastWeather?.city || '--' }}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-key">forecasts.adcode</span>
                    <span class="meta-val">{{ forecastWeather?.adcode || '--' }}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-key">forecasts.reporttime</span>
                    <span class="meta-val">{{ forecastWeather?.reportTime || '--' }}</span>
                </div>
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
                        <tr
                            v-for="(cast, idx) in casts"
                            :key="`${cast.date}_${idx}`"
                        >
                            <td>{{ cast.date || '--' }}</td>
                            <td>{{ formatWeekLabel(cast.week) }}</td>
                            <td>
                                {{ resolveWeatherIcon(cast.dayWeather) }}
                                {{ cast.dayWeather || '--' }}
                            </td>
                            <td>
                                {{ resolveWeatherIcon(cast.nightWeather) }}
                                {{ cast.nightWeather || '--' }}
                            </td>
                            <td>{{ cast.dayTemp ?? '--' }} °C</td>
                            <td>{{ cast.nightTemp ?? '--' }} °C</td>
                            <td>{{ cast.dayWind || '--' }}</td>
                            <td>{{ cast.nightWind || '--' }}</td>
                            <td>{{ cast.dayPowerText || '--' }}</td>
                            <td>{{ cast.nightPowerText || '--' }}</td>
                        </tr>
                        <tr v-if="!casts.length">
                            <td
                                colspan="10"
                                class="forecast-empty"
                            >
                                暂无预报数据
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 原始 JSON 折叠区 -->
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
/**
 * 预报表格 + API 元信息 + 原始 JSON 面板
 * 所有数据由父组件通过 props 传入
 */
import { resolveWeatherIcon, formatWeekLabel } from '../../utils/weather/weatherUtils';

defineProps({
    /** 实况天气数据对象 */
    liveWeather: { type: Object, default: null },
    /** 预报天气数据对象 */
    forecastWeather: { type: Object, default: null },
    /** 预报 casts 数组（已截取 4 天） */
    casts: { type: Array, default: () => [] },
    /** base 接口元信息 */
    baseApiMeta: {
        type: Object,
        default: () => ({ status: '--', count: '--', info: '--', infocode: '--' }),
    },
    /** all 接口元信息 */
    forecastApiMeta: {
        type: Object,
        default: () => ({ status: '--', count: '--', info: '--', infocode: '--' }),
    },
    /** base 原始 JSON 字符串 */
    baseRawJson: { type: String, default: '{}' },
    /** all 原始 JSON 字符串 */
    forecastRawJson: { type: String, default: '{}' },
});
</script>

<style scoped>
/* 详情布局 */
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
    color: var(--brand-primary-dark);
}

/* 元信息网格 */
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
    background: var(--bg-brand-light);
    padding: 6px 8px;
    min-width: 0;
}

.meta-key {
    display: block;
    font-size: 11px;
    color: var(--brand-accent-muted);
}

.meta-val {
    display: block;
    margin-top: 2px;
    color: var(--brand-primary-dark);
    font-size: 13px;
    font-weight: 600;
    word-break: break-word;
}

/* 预报表格 */
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
    color: var(--brand-primary-dark);
    background: rgba(255, 255, 255, 0.78);
    white-space: nowrap;
}

.forecast-table th {
    background: rgba(222, 242, 230, 0.92);
    color: var(--brand-primary-dark);
    font-weight: 700;
}

.forecast-empty {
    text-align: center;
    color: var(--brand-accent-muted);
    font-style: italic;
}

/* 原始 JSON 折叠区 */
.raw-details {
    border: 1px solid rgba(57, 142, 87, 0.18);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.82);
    padding: 8px 10px;
}

.raw-details summary {
    cursor: pointer;
    color: var(--brand-accent-dark);
    font-size: 13px;
    font-weight: 700;
}

.raw-block {
    margin-top: 10px;
}

.raw-block h4 {
    margin: 0 0 6px;
    color: var(--brand-primary-dark);
    font-size: 12px;
}

.raw-block pre {
    margin: 0;
    max-height: 220px;
    overflow: auto;
    background: rgba(10, 48, 30, 0.9);
    color: var(--bg-brand-light);
    border-radius: 8px;
    padding: 8px;
    font-size: 11px;
    line-height: 1.45;
}

/* 平板适配：缩小表格最小宽度，减少水平滚动 */
@media (max-width: 1024px) {
    .forecast-table {
        min-width: 700px;
    }

    .forecast-table th,
    .forecast-table td {
        padding: 4px 5px;
        font-size: 11px;
    }
}

/* 响应式 */
@media (max-width: 1200px) {
    .details-layout {
        grid-template-columns: 1fr;
    }

    .meta-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 768px) {
    .meta-grid,
    .meta-grid.two-columns {
        grid-template-columns: 1fr;
    }
}
</style>
