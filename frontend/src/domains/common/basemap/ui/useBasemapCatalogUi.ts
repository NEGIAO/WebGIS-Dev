/**
 * 底图目录树 UI 状态（OL / Cesium 共用）。
 *
 * 只负责「搜索 + 三层展开」状态，不依赖任何引擎或组件；动态目录项（如 ESRI
 * Wayback 快照）由调用方注入，自动并入历史影像分类。
 */
import { computed, ref, type Ref } from 'vue';
import {
    CATEGORY_LABELS,
    COORD_LABELS,
} from '../catalog/taxonomy';
import {
    getBasemapTree,
    searchBasemapCatalog,
} from '../catalog/registry';
import type { BasemapCatalogEntry, BasemapCategoryNode } from '../catalog/types';

function mergeDynamic(tree: BasemapCategoryNode[], dynamic: BasemapCatalogEntry[]): BasemapCategoryNode[] {
    if (!dynamic.length) return tree;
    const result = tree.map((category) => ({
        ...category,
        providers: category.providers.map((provider) => ({ ...provider, coords: [...provider.coords] })),
    }));

    for (const entry of dynamic) {
        let categoryNode = result.find((node) => node.category === entry.category);
        if (!categoryNode) {
            categoryNode = { category: entry.category, providers: [] };
            result.push(categoryNode);
        }
        let providerNode = categoryNode.providers.find((node) => node.provider === entry.provider);
        if (!providerNode) {
            providerNode = { provider: entry.provider, coords: [] };
            categoryNode.providers.push(providerNode);
        }
        let coordNode = providerNode.coords.find((node) => node.coord === entry.coord);
        if (!coordNode) {
            coordNode = { coord: entry.coord, entries: [] };
            providerNode.coords.push(coordNode);
        }
        if (!coordNode.entries.some((item) => item.id === entry.id && item.customUrl === entry.customUrl)) {
            coordNode.entries.push(entry);
        }
    }
    return result;
}

export function useBasemapCatalogUi(dynamicEntries: Ref<BasemapCatalogEntry[]> | (() => BasemapCatalogEntry[])) {
    const readDynamic = typeof dynamicEntries === 'function'
        ? dynamicEntries
        : () => dynamicEntries.value;

    const basemapQuery = ref('');
    const openCategories = ref(new Set<string>());
    const openProviders = ref(new Set<string>());
    const openCoords = ref(new Set<string>());

    const catalogTree = computed(() => mergeDynamic(getBasemapTree(), readDynamic()));
    const searchResults = computed(() => {
        const query = basemapQuery.value.trim();
        if (!query) return [];
        return searchBasemapCatalog(query, readDynamic());
    });

    const isSearchActive = computed(() => basemapQuery.value.trim().length > 0);

    const toggleSet = (set: Ref<Set<string>>, key: string) => {
        const next = new Set(set.value);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        set.value = next;
    };

    const isCategoryOpen = (category: string) => openCategories.value.has(category);
    const toggleCategory = (category: string) => toggleSet(openCategories, category);
    const isProviderOpen = (category: string, provider: string) => openProviders.value.has(`${category}:${provider}`);
    const toggleProvider = (category: string, provider: string) => toggleSet(openProviders, `${category}:${provider}`);
    const isCoordOpen = (category: string, provider: string, coord: string) =>
        openCoords.value.has(`${category}:${provider}:${coord}`);
    const toggleCoord = (category: string, provider: string, coord: string) =>
        toggleSet(openCoords, `${category}:${provider}:${coord}`);

    const categoryLabel = (category: string) => CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category;
    const coordLabel = (coord: string) => COORD_LABELS[coord as keyof typeof COORD_LABELS] || coord;

    const entryTitle = (entry: BasemapCatalogEntry) =>
        `${entry.number} · ${entry.label} · ${entry.provider} / ${coordLabel(entry.coord)}\n${entry.description}`;

    return {
        basemapQuery,
        catalogTree,
        searchResults,
        isSearchActive,
        isCategoryOpen,
        toggleCategory,
        isProviderOpen,
        toggleProvider,
        isCoordOpen,
        toggleCoord,
        categoryLabel,
        coordLabel,
        entryTitle,
    };
}
