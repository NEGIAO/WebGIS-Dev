/**
 * 功能名称：图层控制面板自定义 URL / WMS 图层枚举与地名检索转发 Composable
 * 日    期：2026/11/14
 * 说    明：从 LayerControlPanel.ts 拆分出自定义底图 URL 识别、WMS GetCapabilities 图层枚举
 *          与 LocationSearch 范围裁剪 / 定位跳转载荷转换，将面板主实例控制在 ~650 行内。
 */
import { ref, watch } from 'vue';
import { toLonLat } from 'ol/proj';
import { apiSearchLocations } from '@/api';
import { detectCustomTileServiceKind } from '@ol/tile-source/index';
import { ensureWmsServiceInfo, looksLikeWmsSourceUrl } from '@common/basemap/wmsService';
import { useRequestToken } from '@common/composables/useRequestToken';

export interface LayerCustomWmsAndSearchDeps {
	customMapUrl: () => string;
	mapInstance: () => any;
	tiandituTk: () => string;
	emitChangeLayer: (payload: {
		layerId: string;
		source: string;
		customUrl?: string;
		wmsLayers?: string;
	}) => void;
	emitSearchJump: (payload: {
		lng: number;
		lat: number;
		zoom: number;
		name: string;
		service: string;
		poiid: string;
		raw: any;
	}) => void;
}

export function useLayerCustomWmsAndSearch(deps: LayerCustomWmsAndSearchDeps) {
	const customUrlInput = ref(deps.customMapUrl() || '');
	const detectedServiceInfo = ref<any>(null);
	const wmsLayerOptions = ref<any[]>([]);
	const selectedWmsLayer = ref('');
	const wmsLayersLoading = ref(false);
	const wmsLayersToken = useRequestToken();

	const resetWmsLayerSelection = () => {
		wmsLayersToken.next();
		wmsLayerOptions.value = [];
		selectedWmsLayer.value = '';
		wmsLayersLoading.value = false;
	};

	const fetchWmsLayerOptions = async (url: string) => {
		const token = wmsLayersToken.next();
		wmsLayersLoading.value = true;
		wmsLayerOptions.value = [];
		selectedWmsLayer.value = '';

		const info: any = await ensureWmsServiceInfo(url);
		if (!wmsLayersToken.isCurrent(token) || !looksLikeWmsSourceUrl(customUrlInput.value)) return;

		wmsLayersLoading.value = false;
		if (info?.layerOptions?.length) {
			wmsLayerOptions.value = info.layerOptions;
			selectedWmsLayer.value = info.layers || info.layerOptions[0]?.name || '';
		}
	};

	const submitCustomUrl = () => {
		deps.emitChangeLayer({
			layerId: 'custom',
			source: 'custom-url',
			customUrl: customUrlInput.value,
			wmsLayers: wmsLayerOptions.value.length ? selectedWmsLayer.value : undefined,
		});
	};

	const onWmsLayerChange = () => {
		if (wmsLayersLoading.value || !wmsLayerOptions.value.length) return;
		if (!looksLikeWmsSourceUrl(customUrlInput.value)) return;
		submitCustomUrl();
	};

	const getCurrentMapBound = () => {
		try {
			const map = deps.mapInstance()?.value;
			if (!map) return undefined;
			const view = map.getView?.();
			const size = map.getSize?.();
			if (!view || !size) return undefined;

			const extent = view.calculateExtent(size);
			const sw = toLonLat([extent[0], extent[1]]);
			const ne = toLonLat([extent[2], extent[3]]);
			return `${sw[0].toFixed(6)},${sw[1].toFixed(6)},${ne[0].toFixed(6)},${ne[1].toFixed(6)}`;
		} catch {
			return undefined;
		}
	};

	const fetchLocationResults = (payload: any) => {
		return apiSearchLocations({
			service: payload.service,
			keywords: payload.keywords,
			page: payload.page ?? 1,
			pageSize: payload.pageSize ?? 10,
			tiandituTk: deps.tiandituTk(),
			mapBound: getCurrentMapBound(),
		}).then((response: any) => response?.data || { items: [], total: 0 });
	};

	const handleSearchJump = (payload: any) => {
		const lonVal = payload?.lon ?? payload?.x ?? payload?.lng ?? payload?.lonlat?.split?.(',')?.[0];
		const latVal = payload?.lat ?? payload?.y ?? payload?.latit ?? payload?.lonlat?.split?.(',')?.[1];
		const sourceService = String(payload?._service || (payload?.id ? 'amap' : ''))
			.trim()
			.toLowerCase();

		const lng = lonVal != null ? Number.parseFloat(lonVal) : NaN;
		const lat = latVal != null ? Number.parseFloat(latVal) : NaN;

		deps.emitSearchJump({
			lng,
			lat,
			zoom: 16,
			name: String(payload?.display_name || payload?.name || '').trim(),
			service: sourceService,
			poiid: payload?.id ? String(payload.id).trim() : '',
			raw: payload,
		});
	};

	watch(deps.customMapUrl, (value) => {
		customUrlInput.value = value || '';
	});

	watch(customUrlInput, (newUrl) => {
		if (!newUrl || !newUrl.trim()) {
			detectedServiceInfo.value = null;
			resetWmsLayerSelection();
			return;
		}
		const detected: any = detectCustomTileServiceKind(newUrl);
		detectedServiceInfo.value = detected.kind === 'unknown' ? null : detected;
		if (detected.kind === 'wms') {
			void fetchWmsLayerOptions(newUrl.trim());
		} else {
			resetWmsLayerSelection();
		}
	});

	return {
		customUrlInput,
		detectedServiceInfo,
		wmsLayerOptions,
		selectedWmsLayer,
		wmsLayersLoading,
		resetWmsLayerSelection,
		fetchWmsLayerOptions,
		submitCustomUrl,
		onWmsLayerChange,
		getCurrentMapBound,
		fetchLocationResults,
		handleSearchJump,
	};
}
