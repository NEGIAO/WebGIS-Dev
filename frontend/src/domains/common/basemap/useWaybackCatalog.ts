/**
 * ESRI Wayback 动态历史影像目录（OL / Cesium 共用）。
 *
 * 后端缓存 199 条快照，目录按需加载（展开历史影像时触发一次），
 * 映射为统一目录条目后经 useBasemapCatalogUi 注入 historical 分类。
 * 纯 composable，不持有组件生命周期，不依赖任何引擎。
 */
import { computed, ref } from 'vue';
import { apiGetHistoricalImageryLayers } from '@/api/backend';
import type { BasemapCatalogEntry } from './catalog';

export function useWaybackCatalog() {
    const loading = ref(false);
    const loaded = ref(false);
    const snapshots = ref<any[]>([]);

    /** 快照 → 统一目录条目（id 带 wayback: 前缀，选中时使用 customUrl） */
    const dynamicEntries = computed<BasemapCatalogEntry[]>(() =>
        snapshots.value.map((snapshot: any) => ({
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

    /** 按当前 URL 反查快照名（用于底图标题显示） */
    const findByUrl = (url: string) => snapshots.value.find((item: any) => item.xyz_url === url);

    /** 拉取目录；失败时保持可重试，不阻断地图启动 */
    async function load() {
        if (loaded.value || loading.value) return;
        loading.value = true;
        try {
            const data: any = await apiGetHistoricalImageryLayers();
            const layers = Array.isArray(data?.layers) ? data.layers : [];
            snapshots.value = layers;
            loaded.value = layers.length > 0;
        } catch {
            snapshots.value = [];
            loaded.value = false;
        } finally {
            loading.value = false;
        }
    }

    return { loading, loaded, snapshots, dynamicEntries, findByUrl, load };
}
