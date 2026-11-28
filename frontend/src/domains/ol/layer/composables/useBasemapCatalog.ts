/**
 * 功能名称：底图目录与 ESRI Wayback 动态快照注入
 * 日    期：2026/11/13
 * 说    明：从 LayerControlPanel.vue 抽出的底图元数据能力层，不持有组件生命周期。
 *          V3.7.16：统一目录树接管全部预设展示（组合底图经 catalog tags 进入树内），
 *          ESRI Wayback 动态快照经 dynamicWaybackEntries 并入树内 historical 分类；
 *          V3.7.16：Wayback 拉取/映射下沉到 common 的 useWaybackCatalog，OL 与 Cesium 共用。
 */
import { computed } from 'vue';
import { BASEMAP_OPTIONS } from '@/constants';
import { useBasemapCatalogUi } from '@common/basemap/ui/useBasemapCatalogUi';
import { useWaybackCatalog } from '@common/basemap/useWaybackCatalog';

export interface BasemapCatalogDeps {
	/** 当前选中底图 id（getter，保持响应式） */
	selectedLayer: () => string;
	/** 当前自定义底图 URL（getter，保持响应式） */
	customMapUrl: () => string;
}

export function useBasemapCatalog(deps: BasemapCatalogDeps) {
	const { selectedLayer, customMapUrl } = deps;
	const wayback = useWaybackCatalog();

	const catalogUi = useBasemapCatalogUi(() => wayback.dynamicEntries.value);

	/** 展开历史影像时按需加载 ESRI Wayback 动态目录 */
	const toggleCatalogCategory = (category: string) => {
		catalogUi.toggleCategory(category);
		if (category === 'historical') void wayback.load();
	};

	/** 当前底图显示名：历史快照优先，其次按 BASEMAP_OPTIONS 查表 */
	const currentLayerLabel = computed(() => {
		if (selectedLayer() === 'custom' && customMapUrl()) {
			const snapshot = wayback.findByUrl(customMapUrl());
			if (snapshot) return `历史 ${snapshot.date}`;
		}
		const found = BASEMAP_OPTIONS.find((opt: any) => opt.value === selectedLayer());
		return found ? found.label : '底图';
	});

	return {
		...catalogUi,
		toggleCategory: toggleCatalogCategory,
		dynamicWaybackEntries: wayback.dynamicEntries,
		historicalImageryLoading: wayback.loading,
		currentLayerLabel,
	};
}
