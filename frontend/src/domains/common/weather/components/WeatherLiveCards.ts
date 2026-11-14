/**
 * WeatherLiveCards.vue 实例逻辑（实况天气卡片与降雨聚焦面板）
 */
import { computed, defineComponent, type ComputedRef } from 'vue';
import { useLocale } from '@common/app/useLocale';

export class Instance {
    public t: any;
    public rainFocusDefaults: ComputedRef<any>;
    public rainFocusResolved: ComputedRef<any>;
    public liveCityLabelResolved: ComputedRef<string>;
    public liveWeatherTextResolved: ComputedRef<string>;

    constructor(props: any) {
        const { t } = useLocale();
        this.t = t;

        this.rainFocusDefaults = computed(() => ({
            hasRain: false,
            level: 'unknown',
            icon: '🌫️',
            badge: this.t('weather.rainPending'),
            title: this.t('weather.rainNoText'),
            subtitle: this.t('weather.rainRetry'),
            hits: [],
        }));

        this.rainFocusResolved = computed(() => {
            if (props.rainFocus && typeof props.rainFocus === 'object') {
                return {
                    ...this.rainFocusDefaults.value,
                    ...props.rainFocus,
                    hits: Array.isArray(props.rainFocus.hits) ? props.rainFocus.hits : [],
                };
            }
            return this.rainFocusDefaults.value;
        });

        this.liveCityLabelResolved = computed(
            () => props.liveCityLabel || this.t('weather.unknownCity'),
        );
        this.liveWeatherTextResolved = computed(
            () => props.liveWeatherText || this.t('weather.weatherUnknown'),
        );
    }
}

export default defineComponent({
    name: 'WeatherLiveCards',
    props: {
        weatherIcon: { type: String, default: '🌤️' },
        liveCityLabel: { type: String, default: '' },
        liveWeatherText: { type: String, default: '' },
        liveTemperatureText: { type: String, default: '--°C' },
        liveHumidityText: { type: String, default: '--' },
        liveWindDirectionText: { type: String, default: '--' },
        liveWindPowerText: { type: String, default: '--' },
        liveReportTimeText: { type: String, default: '--' },
        currentAdcode: { type: String, default: '--' },
        rainFocus: {
            type: Object,
            default: null,
        },
    },
    setup(props) {
        return new Instance(props);
    },
});
