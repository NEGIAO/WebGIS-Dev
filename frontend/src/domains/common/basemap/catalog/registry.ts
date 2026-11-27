/**
 * 统一底图目录注册表（阶段 1）。
 *
 * 现阶段以现有 basemapPresets.ts 为数据源生成分类元数据，编号与顺序完全沿用
 * ALL_BASEMAP_PRESETS；阶段 2 迁入完整图层定义后，本模块的数据源会切换到
 * catalog/layers，但对外 API 保持不变。
 */
import { ALL_BASEMAP_PRESETS } from '../basemapPresets';
import { getLayerDefinitionById } from './layers';
import {
    CATEGORY_LABELS,
    CATEGORY_ORDER,
    COORD_LABELS,
    COORD_ORDER,
    PROVIDER_ORDER,
    RECOMMENDED_FIRST_N,
    buildDescription,
    classifyCategory,
    classifyCoord,
    classifyProvider,
    entryToSearchText,
} from './taxonomy';
import type {
    BasemapCatalogEntry,
    BasemapCategoryNode,
    BasemapCoordNode,
    BasemapProviderNode,
} from './types';

/**
 * 每次按需构建：预设条目优先取源图层定义中的显式字段（catalogCategory/
 * provider/coord/description），只有服务入口等没有源图层的条目才回退到
 * taxonomy 推断。这样 group-1~4 才是真正的元数据 SSOT。
 */
function buildEntries(): BasemapCatalogEntry[] {
    return ALL_BASEMAP_PRESETS.map((preset: any, index: number) => {
        const id = String(preset.id ?? '');
        const displayLabel = String(preset.label ?? '');
        const label = displayLabel.replace(/^\d+\s+/, '');
        const stack: string[] = Array.isArray(preset.stack) ? [...preset.stack] : [];
        const layer = getLayerDefinitionById(stack[0] ?? '');
        const provider = layer?.provider ?? classifyProvider(id);
        const coord = layer?.coord ?? classifyCoord(id, label, provider);
        // 常用推荐暂定 = 原始顺序前 20 条；其余使用源定义的 catalogCategory
        const category = index < RECOMMENDED_FIRST_N
            ? 'recommended'
            : layer?.catalogCategory ?? classifyCategory(id, label, provider);
        const date = layer?.date ?? id.match(/(20\d{2})/)?.[1];
        const description = layer?.description ?? buildDescription(id, label, provider, coord);
        const tags: string[] = [];
        // 源定义的主分类同时作为标签：推荐前 20 里的矢量瓦片仍可在「矢量瓦片」中找到
        if (layer?.catalogCategory) tags.push(layer.catalogCategory);
        if (category === 'historical') tags.push('historical');
        if (date) tags.push('yearly');
        if (/^(vector_amap_256_ltype_|vector_google_combo_)/.test(id)) tags.push('combo');

        return {
            id,
            label,
            stack,
            number: index + 1,
            displayLabel,
            category,
            provider,
            coord,
            description,
            keywords: [id, label, provider, COORD_LABELS[coord], description],
            tags,
            ...(date ? { date } : {}),
            ...(layer?.source ? { source: layer.source } : {}),
            recommended: category === 'recommended',
            ...(id === 'custom' ? { dynamic: 'custom-service' as const } : {}),
        };
    });
}

/** 全部预设条目（与 URL_LAYER_OPTIONS 同序，编号 = index + 1）。 */
export function getBasemapEntries(): BasemapCatalogEntry[] {
    return buildEntries();
}

export function getBasemapEntryById(id: string): BasemapCatalogEntry | undefined {
    return buildEntries().find((entry) => entry.id === String(id ?? '').trim());
}

/** 按 URL 参数 l 的 1-based 编号取条目。 */
export function getBasemapEntryByNumber(number: number): BasemapCatalogEntry | undefined {
    return buildEntries()[number - 1];
}

/** 六大类 → 服务商 → 坐标系 → 条目；空节点不输出，顺序由 taxonomy 常量固定。 */
export function getBasemapTree(): BasemapCategoryNode[] {
    const entries = buildEntries();
    const nodes: BasemapCategoryNode[] = [];
    for (const category of CATEGORY_ORDER) {
        const categoryEntries = entries.filter((entry) => entry.category === category || entry.tags.includes(category));
        // service 是触发按钮，即使没有预设条目也必须保留节点
        if (!categoryEntries.length && category !== 'service') continue;

        if (category === 'recommended') {
            nodes.push({ category, providers: [], entries: categoryEntries });
            continue;
        }

        const providers: BasemapProviderNode[] = [];
        for (const provider of PROVIDER_ORDER) {
            const providerEntries = categoryEntries.filter((entry) => entry.provider === provider);
            if (!providerEntries.length) continue;

            const coords: BasemapCoordNode[] = [];
            for (const coord of COORD_ORDER) {
                const entries = providerEntries.filter((entry) => entry.coord === coord);
                if (entries.length) coords.push({ coord, entries });
            }
            providers.push({ provider, coords });
        }
        nodes.push({ category, providers });
    }
    return nodes;
}

/**
 * 常驻搜索：空格分词后全部命中；数字 token 可精确匹配编号。
 * 结果按原编号排序，便于和 URL l 一一对应。
 */
export function searchBasemapCatalog(
    query: string,
    extraEntries: readonly BasemapCatalogEntry[] = [],
): BasemapCatalogEntry[] {
    const tokens = String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const entries = buildEntries();
    const source = extraEntries.length ? [...entries, ...extraEntries] : entries;
    if (!tokens.length) return source;
    return source.filter((entry) => {
        const haystack = entryToSearchText(entry);
        return tokens.every((token) => {
            if (/^\d+$/.test(token)) return String(entry.number) === token || haystack.includes(token);
            return haystack.includes(token);
        });
    });
}

/** 面包屑：一级分类 / 服务商 / 坐标系，供搜索结果展示。 */
export function getBasemapBreadcrumb(entry: BasemapCatalogEntry): string[] {
    return [CATEGORY_LABELS[entry.category], entry.provider, COORD_LABELS[entry.coord]];
}
