<!--
  WeatherLiveCards.vue
  实况天气卡片 + 降雨聚焦面板
  - 纯展示组件，通过 props 接收数据
  - 不包含任何 API 调用或业务逻辑
-->
<template>
    <div class="live-cards-wrapper">
        <!-- 实况天气卡片组 -->
        <div class="live-cards">
            <div class="live-main-card">
                <div class="live-main-icon">{{ weatherIcon }}</div>
                <div class="live-main-content">
                    <div class="live-city">{{ liveCityLabelResolved }}</div>
                    <div class="live-weather-text">{{ liveWeatherTextResolved }}</div>
                    <div class="live-report-time">{{ liveReportTimeText }}</div>
                </div>
                <div class="live-temp">{{ liveTemperatureText }}</div>
            </div>

            <div class="live-mini-card">
                <span class="mini-label">{{ t('weather.humidity') }}</span>
                <span class="mini-value">{{ liveHumidityText }}</span>
            </div>
            <div class="live-mini-card">
                <span class="mini-label">{{ t('weather.windDir') }}</span>
                <span class="mini-value">{{ liveWindDirectionText }}</span>
            </div>
            <div class="live-mini-card">
                <span class="mini-label">{{ t('weather.windPower') }}</span>
                <span class="mini-value">{{ liveWindPowerText }}</span>
            </div>
            <div class="live-mini-card">
                <span class="mini-label">{{ t('weather.currentAdcode') }}</span>
                <span class="mini-value">{{ currentAdcode }}</span>
            </div>
        </div>

        <!-- 降雨聚焦面板 -->
        <div
            class="rain-focus-panel"
            :class="{ 'has-rain': rainFocusResolved.hasRain, unknown: rainFocusResolved.level === 'unknown' }"
        >
            <div class="rain-focus-left">
                <div class="rain-focus-icon">{{ rainFocusResolved.icon }}</div>
                <div class="rain-focus-text">
                    <div class="rain-focus-title">{{ rainFocusResolved.title }}</div>
                    <div class="rain-focus-subtitle">{{ rainFocusResolved.subtitle }}</div>
                </div>
            </div>
            <div class="rain-focus-right">
                <span class="rain-badge">{{ rainFocusResolved.badge }}</span>
                <div class="rain-hit-list">
                    <span
                        v-if="!rainFocusResolved.hits.length"
                        class="rain-hit empty"
                        >{{ t('weather.rainNoKeyword') }}</span
                    >
                    <span
                        v-for="(hit, idx) in rainFocusResolved.hits"
                        :key="`${hit.date}_${hit.period}_${idx}`"
                        class="rain-hit"
                    >
                        {{ hit.date }} {{ hit.period }} {{ hit.icon }} {{ hit.weather }}
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
/**
 * 实况天气卡片与降雨聚焦面板
 * 所有数据由父组件通过 props 传入
 */
import { computed } from 'vue';
import { useLocale } from '@common/app/useLocale';

const { t } = useLocale();

const props = defineProps({
    /** 天气 Emoji 图标 */
    weatherIcon: { type: String, default: '🌤️' },
    /** 城市显示标签 */
    liveCityLabel: { type: String, default: '' },
    /** 天气描述文本 */
    liveWeatherText: { type: String, default: '' },
    /** 温度文本 */
    liveTemperatureText: { type: String, default: '--°C' },
    /** 湿度文本 */
    liveHumidityText: { type: String, default: '--' },
    /** 风向文本 */
    liveWindDirectionText: { type: String, default: '--' },
    /** 风力文本 */
    liveWindPowerText: { type: String, default: '--' },
    /** 数据上报时间文本 */
    liveReportTimeText: { type: String, default: '--' },
    /** 当前 adcode */
    currentAdcode: { type: String, default: '--' },
    /** 降雨聚焦面板数据对象 */
    rainFocus: {
        type: Object,
        default: null,
    },
});

const rainFocusDefaults = computed(() => ({
    hasRain: false,
    level: 'unknown',
    icon: '🌫️',
    badge: t('weather.rainPending'),
    title: t('weather.rainNoText'),
    subtitle: t('weather.rainRetry'),
    hits: [],
}));

const rainFocusResolved = computed(() => {
    if (props.rainFocus && typeof props.rainFocus === 'object') {
        return {
            ...rainFocusDefaults.value,
            ...props.rainFocus,
            hits: Array.isArray(props.rainFocus.hits) ? props.rainFocus.hits : [],
        };
    }
    return rainFocusDefaults.value;
});

// Expose i18n defaults for city/weather labels when parent passes empty strings
const liveCityLabelResolved = computed(
    () => props.liveCityLabel || t('weather.unknownCity'),
);
const liveWeatherTextResolved = computed(
    () => props.liveWeatherText || t('weather.weatherUnknown'),
);
</script>

<style scoped>
/* 实况卡片容器 - 启用容器查询 */
.live-cards-wrapper {
    container-type: inline-size;
    container-name: live-cards;
}

/* 实况卡片组 */
.live-cards {
    display: grid;
    grid-template-columns: minmax(180px, 2.1fr) repeat(4, minmax(0, 1fr));
    gap: 8px;
}

.live-main-card {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(232, 246, 237, 0.94));
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: var(--toc-shadow-sm);
}

.live-main-icon {
    width: 48px;
    height: 48px;
    border-radius: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 27px;
    flex-shrink: 0;
    background: linear-gradient(135deg, rgba(var(--brand-primary-rgb), 0.16), rgba(var(--brand-primary-rgb), 0.06));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.live-main-content {
    min-width: 0;
    flex: 1;
}

.live-city {
    font-size: 15px;
    font-weight: 700;
    color: var(--brand-primary-dark);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.live-weather-text {
    margin-top: 3px;
    font-size: 12px;
    color: var(--brand-accent-muted);
}

.live-report-time {
    margin-top: 2px;
    font-size: 11px;
    color: var(--brand-accent-muted);
}

.live-temp {
    font-size: 28px;
    font-weight: 700;
    color: var(--brand-primary-dark);
    flex-shrink: 0;
}

.live-mini-card {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.16);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.78);
    padding: 8px 9px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    transition:
        border-color var(--toc-transition-fast),
        transform var(--toc-transition-fast),
        box-shadow var(--toc-transition-fast);
}

.live-mini-card:hover {
    border-color: rgba(var(--brand-primary-dark-rgb), 0.4);
    background: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 5px 12px rgba(var(--brand-primary-rgb), 0.12);
}

.mini-label {
    font-size: 11px;
    color: var(--brand-accent-muted);
}

.mini-value {
    font-size: 15px;
    font-weight: 700;
    color: var(--brand-primary-dark);
    word-break: break-word;
}

/* 降雨聚焦面板 */
.rain-focus-panel {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(245, 252, 247, 0.95), rgba(232, 246, 237, 0.92));
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.rain-focus-panel.has-rain {
    border-color: rgba(34, 126, 192, 0.4);
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
    border-radius: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    flex-shrink: 0;
    background: linear-gradient(135deg, rgba(var(--brand-primary-rgb), 0.15), rgba(var(--brand-primary-rgb), 0.05));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.rain-focus-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--brand-accent-dark);
}

.rain-focus-subtitle {
    margin-top: 3px;
    font-size: 12px;
    color: var(--brand-accent-muted);
}

.rain-focus-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    min-width: 200px;
}

.rain-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.35);
    color: var(--brand-accent-dark);
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
    border: 1px solid rgba(var(--brand-primary-rgb), 0.25);
    background: rgba(255, 255, 255, 0.75);
    color: var(--brand-accent-dark);
    font-size: 11px;
    white-space: nowrap;
}

.rain-hit.empty {
    border-style: dashed;
    color: var(--brand-accent-muted);
}

/* 响应式 */
@media (max-width: 1200px) {
    .live-cards {
        grid-template-columns: 1fr 1fr;
    }

    .live-main-card {
        grid-column: 1 / -1;
    }
}

@media (max-width: 768px) {
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
}

@media (max-width: 480px) {
    .live-city {
        font-size: 14px;
    }

    .mini-value {
        font-size: 14px;
    }
}

/* 容器查询 - 根据父容器宽度自适应（优先级高于媒体查询） */
@container live-cards (max-width: 600px) {
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
}

@container live-cards (max-width: 400px) {
    .live-city {
        font-size: 14px;
    }

    .mini-value {
        font-size: 14px;
    }

    .rain-focus-title {
        font-size: 14px;
    }

    .rain-focus-subtitle {
        font-size: 11px;
    }
}
</style>
