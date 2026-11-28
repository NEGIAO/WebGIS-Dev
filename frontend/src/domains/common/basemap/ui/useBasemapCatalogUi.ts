/**
 * 底图目录树 UI 状态（OL / Cesium 共用）。
 *
 * 只负责「搜索 + 两层展开」状态，不依赖任何引擎或组件；动态目录项（如 ESRI
 * Wayback 快照）由调用方注入，自动并入历史影像分类。V3.7.16：第三级坐标目录
 * 整体移除，条目平铺在服务商层（坐标信息由条目坐标徽标 / tooltip 承载）。
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
        providers: category.providers.map((provider) => ({ ...provider, entries: [...provider.entries] })),
    }));

    for (const entry of dynamic) {
        let categoryNode = result.find((node) => node.category === entry.category);
        if (!categoryNode) {
            categoryNode = { category: entry.category, providers: [] };
            result.push(categoryNode);
        }
        let providerNode = categoryNode.providers.find((node) => node.provider === entry.provider);
        if (!providerNode) {
            providerNode = { provider: entry.provider, entries: [] };
            categoryNode.providers.push(providerNode);
        }
        if (!providerNode.entries.some((item) => item.id === entry.id && item.customUrl === entry.customUrl)) {
            providerNode.entries.push(entry);
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

    const categoryLabel = (category: string) => CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category;
    const coordLabel = (coord: string) => COORD_LABELS[coord as keyof typeof COORD_LABELS] || coord;

    // 层级编号：一级中文数字、二级阿拉伯数字；序号由目录树下标推导，与 URL 预设编号无关。
    const CN_ORDINALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    const categoryOrdinal = (category: string) => {
        const index = catalogTree.value.findIndex((node) => node.category === category);
        return CN_ORDINALS[index] || String(index + 1);
    };
    const providerOrdinal = (category: string, provider: string) => {
        const node = catalogTree.value.find((item) => item.category === category);
        return String((node?.providers.findIndex((item) => item.provider === provider) ?? -1) + 1);
    };

    // 层级瓦片计数：条目直接平铺在服务商层（V3.7.16）。
    const providerEntryCount = (provider: any) => provider?.entries?.length ?? 0;
    const categoryEntryCount = (category: any) =>
        (category?.entries?.length || 0) + (category?.providers || []).reduce(
            (sum: number, provider: any) => sum + providerEntryCount(provider), 0
        );

    const entryTitle = (entry: BasemapCatalogEntry) => {
        // V3.7.16：动态项 number=0 是哨兵值，不在 tooltip 中显示
        const prefix = entry.number > 0 ? `${entry.number} · ` : '';
        return `${prefix}${entry.label} · ${entry.provider} / ${coordLabel(entry.coord)}\n${entry.description}`;
    };

    return {
        basemapQuery,
        catalogTree,
        searchResults,
        isSearchActive,
        isCategoryOpen,
        toggleCategory,
        isProviderOpen,
        toggleProvider,
        categoryLabel,
        coordLabel,
        categoryOrdinal,
        providerOrdinal,
        providerEntryCount,
        categoryEntryCount,
        entryTitle,
    };
}
