/**
 * 功能名称：天气看板主面板（WeatherChartPanel）实例层
 * 日    期：2026/11/14
 * 说    明：组合 useWeatherCharts 与 useWeatherData，编排实况卡片、温度趋势图、风向仪表盘与预报表格。
 */
import {
	computed,
	defineComponent,
	onBeforeUnmount,
	onMounted,
	ref,
	watchEffect,
	type ExtractPropTypes,
	type SetupContext,
} from 'vue';
import { CloudSun, Hash, MapPin, RefreshCw } from '@lucide/vue';
import { useWeatherStore } from '@/stores';
import { useWeatherCharts } from '@common/weather/composables/useWeatherCharts';
import { useWeatherData } from '@common/weather/composables/useWeatherData';
import { useLocale } from '@common/app/useLocale';
import WeatherLiveCards from './WeatherLiveCards.vue';
import WeatherForecastTable from './WeatherForecastTable.vue';

type EmitsType = [];
const propDefine = {} as const;
export type WeatherChartPanelProps = ExtractPropTypes<typeof propDefine>;

export default defineComponent({
	name: 'WeatherChartPanel',
	components: {
		CloudSun,
		Hash,
		MapPin,
		RefreshCw,
		WeatherLiveCards,
		WeatherForecastTable,
	},
	props: propDefine,
	emits: [],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

export class Instance {
	public t: ReturnType<typeof useLocale>['t'];
	public weatherStore = useWeatherStore();

	public viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1366);
	public isMobile = computed(() => this.viewportWidth.value <= 768);
	public isCompact = computed(() => this.viewportWidth.value <= 1100);

	private sharedLiveWeather = ref<any>(null);
	private sharedForecastWeather = ref<any>(null);
	private sharedCasts = ref<any[]>([]);

	public trendChartRef: ReturnType<typeof useWeatherCharts>['trendChartRef'];
	public windChartRef: ReturnType<typeof useWeatherCharts>['windChartRef'];
	private handleWindowResize: ReturnType<typeof useWeatherCharts>['handleWindowResize'];

	public adcodeInput: ReturnType<typeof useWeatherData>['adcodeInput'];
	public cityInput: ReturnType<typeof useWeatherData>['cityInput'];
	public isBusy: ReturnType<typeof useWeatherData>['isBusy'];
	public liveWeather: ReturnType<typeof useWeatherData>['liveWeather'];
	public forecastWeather: ReturnType<typeof useWeatherData>['forecastWeather'];
	public baseApiMeta: ReturnType<typeof useWeatherData>['baseApiMeta'];
	public forecastApiMeta: ReturnType<typeof useWeatherData>['forecastApiMeta'];
	public casts: ReturnType<typeof useWeatherData>['casts'];
	public weatherIcon: ReturnType<typeof useWeatherData>['weatherIcon'];
	public liveCityLabel: ReturnType<typeof useWeatherData>['liveCityLabel'];
	public liveWeatherText: ReturnType<typeof useWeatherData>['liveWeatherText'];
	public liveTemperatureText: ReturnType<typeof useWeatherData>['liveTemperatureText'];
	public liveHumidityText: ReturnType<typeof useWeatherData>['liveHumidityText'];
	public liveWindDirectionText: ReturnType<typeof useWeatherData>['liveWindDirectionText'];
	public liveWindPowerText: ReturnType<typeof useWeatherData>['liveWindPowerText'];
	public liveReportTimeText: ReturnType<typeof useWeatherData>['liveReportTimeText'];
	public baseRawJson: ReturnType<typeof useWeatherData>['baseRawJson'];
	public forecastRawJson: ReturnType<typeof useWeatherData>['forecastRawJson'];
	public rainFocus: ReturnType<typeof useWeatherData>['rainFocus'];
	public applyAdcodeQuery: ReturnType<typeof useWeatherData>['applyAdcodeQuery'];
	public resolveCityAndQuery: ReturnType<typeof useWeatherData>['resolveCityAndQuery'];
	public refreshWeather: ReturnType<typeof useWeatherData>['refreshWeather'];

	constructor(
		_props: WeatherChartPanelProps,
		_ctx: SetupContext<EmitsType>,
	) {
		const { t } = useLocale();
		this.t = t;

		const charts = useWeatherCharts({
			liveWeather: this.sharedLiveWeather,
			forecastWeather: this.sharedForecastWeather,
			casts: this.sharedCasts,
			viewportWidth: this.viewportWidth,
			isMobile: this.isMobile,
			isCompact: this.isCompact,
		});
		this.trendChartRef = charts.trendChartRef;
		this.windChartRef = charts.windChartRef;
		this.handleWindowResize = charts.handleWindowResize;

		const weatherData = useWeatherData({
			ensureChartInstances: charts.ensureChartInstances,
			showChartsLoading: charts.showChartsLoading,
			hideChartsLoading: charts.hideChartsLoading,
			resizeCharts: charts.resizeCharts,
			renderTrendChart: charts.renderTrendChart,
			renderWindChart: charts.renderWindChart,
		});

		this.adcodeInput = weatherData.adcodeInput;
		this.cityInput = weatherData.cityInput;
		this.isBusy = weatherData.isBusy;
		this.liveWeather = weatherData.liveWeather;
		this.forecastWeather = weatherData.forecastWeather;
		this.baseApiMeta = weatherData.baseApiMeta;
		this.forecastApiMeta = weatherData.forecastApiMeta;
		this.casts = weatherData.casts;
		this.weatherIcon = weatherData.weatherIcon;
		this.liveCityLabel = weatherData.liveCityLabel;
		this.liveWeatherText = weatherData.liveWeatherText;
		this.liveTemperatureText = weatherData.liveTemperatureText;
		this.liveHumidityText = weatherData.liveHumidityText;
		this.liveWindDirectionText = weatherData.liveWindDirectionText;
		this.liveWindPowerText = weatherData.liveWindPowerText;
		this.liveReportTimeText = weatherData.liveReportTimeText;
		this.baseRawJson = weatherData.baseRawJson;
		this.forecastRawJson = weatherData.forecastRawJson;
		this.rainFocus = weatherData.rainFocus;
		this.applyAdcodeQuery = weatherData.applyAdcodeQuery;
		this.resolveCityAndQuery = weatherData.resolveCityAndQuery;
		this.refreshWeather = weatherData.refreshWeather;

		this.init();
	}

	private init() {
		watchEffect(() => {
			this.sharedLiveWeather.value = this.liveWeather.value;
			this.sharedForecastWeather.value = this.forecastWeather.value;
			this.sharedCasts.value = this.casts.value;
		});

		onMounted(() => {
			if (typeof window === 'undefined') return;
			window.addEventListener('resize', this.handleWindowResize, { passive: true });
		});

		onBeforeUnmount(() => {
			if (typeof window === 'undefined') return;
			window.removeEventListener('resize', this.handleWindowResize);
		});
	}
}
