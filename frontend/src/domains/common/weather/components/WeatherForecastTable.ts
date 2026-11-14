/**
 * WeatherForecastTable.vue 实例逻辑（预报表格 + API 元信息 + 原始 JSON 面板）
 */
import { defineComponent, type PropType } from 'vue';
import { formatWeekLabel, resolveWeatherIcon } from '@common/weather/utils/weatherUtils';
import { useLocale } from '@common/app/useLocale';

export class Instance {
    public t: any;
    public resolveWeatherIcon = resolveWeatherIcon;
    public formatWeekLabel = formatWeekLabel;

    constructor() {
        const { t } = useLocale();
        this.t = t;
    }
}

export default defineComponent({
    name: 'WeatherForecastTable',
    props: {
        liveWeather: { type: Object as PropType<Record<string, any> | null>, default: null },
        forecastWeather: { type: Object as PropType<Record<string, any> | null>, default: null },
        casts: { type: Array as PropType<any[]>, default: () => [] },
        baseApiMeta: {
            type: Object,
            default: () => ({ status: '--', count: '--', info: '--', infocode: '--' }),
        },
        forecastApiMeta: {
            type: Object,
            default: () => ({ status: '--', count: '--', info: '--', infocode: '--' }),
        },
        baseRawJson: { type: String, default: '{}' },
        forecastRawJson: { type: String, default: '{}' },
    },
    setup() {
        return new Instance();
    },
});
