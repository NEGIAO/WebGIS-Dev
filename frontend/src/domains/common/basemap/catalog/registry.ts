/**
 * 统一底图目录注册表。
 *
 * 预设条目优先取源图层定义（common/basemap/definitions，经 catalog/layers 登记）
 * 中的显式元数据（catalogCategory/provider/coord/description），只有服务入口等
 * 没有源图层的条目才回退到 taxonomy 推断；编号与顺序完全沿用 ALL_BASEMAP_PRESETS。
 * 结果按 layers 登记版本缓存（V3.7.16）：搜索每键触发 getBasemapTree/searchBasemapCatalog，
 * 不再每次重建 148 条条目。
 */
import { ALL_BASEMAP_PRESETS } from '../basemapPresets';
import { RECOMMENDED_PRESET_IDS } from '../definitions/category-recommended';
import { getLayerDefinitionById, getLayerRegistryVersion } from './layers';
import {
    CATEGORY_LABELS,
    CATEGORY_ORDER,
    COORD_LABELS,
    COORD_ORDER,
    PROVIDER_ORDER,
    buildDescription,
    classifyCategory,
    classifyCoord,
    classifyProvider,
    entryToSearchText,
} from './taxonomy';
import type {
    BasemapCatalogEntry,
    BasemapCategoryNode,
    BasemapProviderNode,
} from './types';

/**
 * 预设条目构建（带版本缓存）：条目优先取源图层定义中的显式元数据
 * （catalogCategory/provider/coord/description），只有服务入口等没有源图层的
 * 条目才回退到 taxonomy 推断；layers 登记变更（热重载重登记）时缓存失效重建。
 */
let entriesCache: BasemapCatalogEntry[] | null = null;
let entriesCacheVersion = -1;

function buildEntries(): BasemapCatalogEntry[] {
    const version = getLayerRegistryVersion();
    if (entriesCache && entriesCacheVersion === version) return entriesCache;
    const entries = ALL_BASEMAP_PRESETS.map((preset: any, index: number) => {
        const id = String(preset.id ?? '');
        const displayLabel = String(preset.label ?? '');
        const label = displayLabel.replace(/^\d+\s+/, '');
        const stack: string[] = Array.isArray(preset.stack) ? [...preset.stack] : [];
        const layer = getLayerDefinitionById(stack[0] ?? '');
        const provider = layer?.provider ?? classifyProvider(id);
        const coord = layer?.coord ?? classifyCoord(id, label, provider);
        // V3.7.16：常用推荐改为显式清单（definitions/category-recommended.ts），
        // 与预设顺序解耦，用户可自由增删改；与位置规则彻底切割。
        const category = RECOMMENDED_PRESET_IDS.has(id)
            ? 'recommended'
            : layer?.catalogCategory ?? classifyCategory(id, label, provider);
        const date = layer?.date ?? id.match(/(20\d{2})/)?.[1];
        const description = layer?.description ?? buildDescription(id, label, provider, coord);
        // V3.7.16：纠偏/代理标识透传（登记方已判定：correction≠none 或 proxy='proxy'）
        const proxied = layer?.proxied === true;
        const tags: string[] = [];
        // 源定义的主分类同时作为标签：推荐条目仍出现在其原始分类中（快捷入口允许重复）
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
            keywords: [id, label, provider, COORD_LABELS[coord], description, ...(proxied ? ['proxy'] : [])],
            tags,
            ...(date ? { date } : {}),
            ...(layer?.source ? { source: layer.source } : {}),
            recommended: category === 'recommended',
            ...(proxied ? { proxied: true } : {}),
            ...(id === 'custom' ? { dynamic: 'custom-service' as const } : {}),
        };
    });
    entriesCache = entries;
    entriesCacheVersion = version;
    return entries;
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

/** 两大类层级：分类 → 服务商 → 条目（V3.7.16：第三级坐标目录整体移除，
 *  坐标信息由条目自身的坐标徽标/tooltip/搜索面包屑承载）；空节点不输出，顺序由 taxonomy 常量固定。 */
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

            // 条目按 COORD_ORDER（WGS84 → GCJ02 → BD09 → …）保持既有展示顺序后平铺
            const orderedEntries = COORD_ORDER.flatMap(
                (coord) => providerEntries.filter((entry) => entry.coord === coord),
            );
            providers.push({ provider, entries: orderedEntries });
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
            // V3.7.16：动态项（Wayback）number=0 是哨兵值，不参与数字编号精确匹配，
            // 否则搜索 "0" 会命中全部动态条目；其余文本 token 仍照常匹配。
            if (/^\d+$/.test(token) && entry.number > 0) {
                return String(entry.number) === token || haystack.includes(token);
            }
            return haystack.includes(token);
        });
    });
}

/** 面包屑：一级分类 / 服务商 / 坐标系，供搜索结果展示。 */
export function getBasemapBreadcrumb(entry: BasemapCatalogEntry): string[] {
    return [CATEGORY_LABELS[entry.category], entry.provider, COORD_LABELS[entry.coord]];
}
