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
                <span class="mini-value">{{ currentAdcode }}</span>
            </div>
        </div>

        <!-- 降雨聚焦面板 -->
        <div
            class="rain-focus-panel"
            :class="{ 'has-rain': rainFocus.hasRain, unknown: rainFocus.level === 'unknown' }"
        >
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
                    <span
                        v-if="!rainFocus.hits.length"
                        class="rain-hit empty"
                        >未来 4 天白天/夜间均未识别到"雨"关键词</span
                    >
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
    </div>
</template>

<script setup>
/**
 * 实况天气卡片与降雨聚焦面板
 * 所有数据由父组件通过 props 传入
 */
defineProps({
    /** 天气 Emoji 图标 */
    weatherIcon: { type: String, default: '🌤️' },
    /** 城市显示标签 */
    liveCityLabel: { type: String, default: '未知城市' },
    /** 天气描述文本 */
    liveWeatherText: { type: String, default: '天气未知' },
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
        default: () => ({
            hasRain: false,
            level: 'unknown',
            icon: '🌫️',
            badge: '待判定',
            title: '暂未获取到可判定的天气文本',
            subtitle: '请刷新或切换 adcode 后重试',
            hits: [],
        }),
    },
});
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
    border: 1px solid rgba(54, 147, 88, 0.35);
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
    border: 1px solid rgba(54, 147, 88, 0.25);
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
