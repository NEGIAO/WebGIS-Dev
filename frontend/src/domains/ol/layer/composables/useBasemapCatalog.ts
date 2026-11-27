/**
 * 功能名称：底图目录与历史影像（Sentinel 年份分组 / ESRI Wayback 懒加载）
 * 日    期：2026/11/13
 * 说    明：从 LayerControlPanel.vue 抽出的底图元数据能力层，不持有组件生命周期。
 */
import { computed, ref } from 'vue';
import { BASEMAP_OPTIONS } from '@/constants';
import { groupBasemapsByYear } from '@common/basemap/basemapRegistry';
import { buildComboProviderGroups, isComboBasemapId } from '@common/basemap/comboBasemaps';
import { useBasemapCatalogUi } from '@common/basemap/ui/useBasemapCatalogUi';
import type { BasemapCatalogEntry } from '@common/basemap/catalog';
import { apiGetHistoricalImageryLayers } from '@/api';

export interface BasemapCatalogDeps {
	/** 当前选中底图 id（getter，保持响应式） */
	selectedLayer: () => string;
	/** 当前自定义底图 URL（getter，保持响应式） */
	customMapUrl: () => string;
}

/** 历史影像日期格式化器（固定 Asia/Shanghai，避免用户时区导致跨日） */
const historyDateFormatter = new Intl.DateTimeFormat('en-US', {
	timeZone: 'Asia/Shanghai',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
});

export function useBasemapCatalog(deps: BasemapCatalogDeps) {
	const { selectedLayer, customMapUrl } = deps;

	const historicalProviderTab = ref('sentinel');
	const historicalImageryLoading = ref(false);
	const historicalCatalogLoaded = ref(false);
	const esriWaybackLayers = ref<any[]>([]);
	const historicalImageryUpdatedAt = ref('');
	const openHistoryYears = ref(new Set<string>());
	const openComboProviders = ref(new Set<string>());
	const openComboCoords = ref(new Set<string>());

	const sentinelBasemapOptions = computed(() =>
		BASEMAP_OPTIONS.filter((option: any) => String(option.value).startsWith('imagery_s2_cloudless_'))
	);
	const regularBasemapOptions = computed(() =>
		BASEMAP_OPTIONS.filter((option: any) => (
			!String(option.value).startsWith('imagery_s2_cloudless_') && !isComboBasemapId(option.value)
		))
	);
	/** AMAP / Google → GCJ / WGS → 简短要素组合，供折叠菜单逐层展开 */
	const comboProviderGroups = computed(() => buildComboProviderGroups(BASEMAP_OPTIONS));

	/** ESRI Wayback 动态快照映射为统一目录条目，进入历史影像 → ESRI Wayback → WGS84 */
	const dynamicWaybackEntries = computed<BasemapCatalogEntry[]>(() =>
		esriWaybackLayers.value.map((snapshot: any) => ({
			id: `wayback:${snapshot.id}`,
			label: String(snapshot.date ?? snapshot.id ?? ''),
			stack: ['custom'],
			number: 0,
			displayLabel: `历史 ${snapshot.date ?? ''}`,
			category: 'historical',
			provider: 'ESRI Wayback',
			coord: 'WGS84',
			description: String(snapshot.name || snapshot.id || ''),
			keywords: [String(snapshot.id ?? ''), String(snapshot.date ?? '')],
			tags: ['historical', 'wayback'],
			date: snapshot.date,
			recommended: false,
			dynamic: 'wayback',
			customUrl: String(snapshot.xyz_url ?? ''),
		})),
	);
	const catalogUi = useBasemapCatalogUi(() => dynamicWaybackEntries.value);

	/** 展开历史影像时按需加载 ESRI Wayback 动态目录 */
	const toggleCatalogCategory = (category: string) => {
		catalogUi.toggleCategory(category);
		if (category === 'historical' && !historicalCatalogLoaded.value && !historicalImageryLoading.value) {
			void loadHistoricalImageryCatalog();
		}
	};

	const sentinelYearGroups = computed(() =>
		Array.from(
			groupBasemapsByYear(
				sentinelBasemapOptions.value.map((item: any) => ({
					...item,
					date: String(item.value).match(/(\d{4})/)?.[1],
				}))
			)
		).map(([year, items]) => ({ year, items }))
	);
	const esriYearGroups = computed(() =>
		Array.from(groupBasemapsByYear(esriWaybackLayers.value)).map(([year, items]) => ({ year, items }))
	);

	/** 年份折叠键：provider:year，避免 sentinel/esri 同一年相互串开 */
	function historyYearKey(provider: string, year: string | number) {
		return `${provider}:${year}`;
	}

	function isHistoryYearOpen(provider: string, year: string | number) {
		return openHistoryYears.value.has(historyYearKey(provider, year));
	}

	function toggleHistoryYear(provider: string, year: string | number) {
		const key = historyYearKey(provider, year);
		const next = new Set(openHistoryYears.value);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		openHistoryYears.value = next;
	}

	/** 组合底图折叠键：provider 与 provider:coord 分别独立记忆展开状态 */
	function comboProviderKey(provider: string) {
		return provider;
	}

	function comboCoordKey(provider: string, coord: string) {
		return `${provider}:${coord}`;
	}

	function isComboProviderOpen(provider: string) {
		return openComboProviders.value.has(comboProviderKey(provider));
	}

	function toggleComboProvider(provider: string) {
		const key = comboProviderKey(provider);
		const next = new Set(openComboProviders.value);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		openComboProviders.value = next;
	}

	function isComboCoordOpen(provider: string, coord: string) {
		return openComboCoords.value.has(comboCoordKey(provider, coord));
	}

	function toggleComboCoord(provider: string, coord: string) {
		const key = comboCoordKey(provider, coord);
		const next = new Set(openComboCoords.value);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		openComboCoords.value = next;
	}

	/** 当前底图显示名：历史快照优先，其次按 BASEMAP_OPTIONS 查表 */
	const currentLayerLabel = computed(() => {
		if (selectedLayer() === 'custom' && customMapUrl()) {
			const snapshot = esriWaybackLayers.value.find((item: any) => item.xyz_url === customMapUrl());
			if (snapshot) return `历史 ${snapshot.date}`;
		}
		const found = BASEMAP_OPTIONS.find((opt: any) => opt.value === selectedLayer());
		return found ? found.label : '底图';
	});

	/** 历史影像日期格式化：无效值回落到前 10 字符 */
	function formatHistoryDate(value: string) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

		const dateParts: Record<string, string> = Object.fromEntries(
			historyDateFormatter.formatToParts(date).map(({ type, value: partValue }) => [type, partValue])
		);
		return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
	}

	/** 拉取 Wayback 目录；启动同步未完成时可能暂时为空，保持可重试 */
	async function loadHistoricalImageryCatalog() {
		if (historicalCatalogLoaded.value || historicalImageryLoading.value) return;
		historicalImageryLoading.value = true;
		try {
			const data: any = await apiGetHistoricalImageryLayers();
			const layers = Array.isArray(data?.layers) ? data.layers : [];
			esriWaybackLayers.value = layers;
			historicalImageryUpdatedAt.value = data?.updated_at || data?.sync?.last_success_at || '';
			historicalCatalogLoaded.value = layers.length > 0;
		} catch {
			// 次要目录失败不阻断地图启动，并允许下次进入页签时重试
			esriWaybackLayers.value = [];
			historicalCatalogLoaded.value = false;
		} finally {
			historicalImageryLoading.value = false;
		}
	}

	/** 切换历史影像来源页签；进入 ESRI 时懒加载目录 */
	function selectHistoricalProviderTab(tab: string) {
		historicalProviderTab.value = tab;
		if (tab === 'esri' && !historicalCatalogLoaded.value && !historicalImageryLoading.value) {
			void loadHistoricalImageryCatalog();
		}
	}

	return {
		...catalogUi,
		toggleCategory: toggleCatalogCategory,
		dynamicWaybackEntries,
		historicalProviderTab,
		historicalImageryLoading,
		historicalCatalogLoaded,
		esriWaybackLayers,
		historicalImageryUpdatedAt,
		openHistoryYears,
		openComboProviders,
		openComboCoords,
		sentinelBasemapOptions,
		regularBasemapOptions,
		comboProviderGroups,
		sentinelYearGroups,
		esriYearGroups,
		currentLayerLabel,
		historyYearKey,
		isHistoryYearOpen,
		toggleHistoryYear,
		isComboProviderOpen,
		toggleComboProvider,
		isComboCoordOpen,
		toggleComboCoord,
		formatHistoryDate,
		loadHistoricalImageryCatalog,
		selectHistoricalProviderTab,
	};
}
