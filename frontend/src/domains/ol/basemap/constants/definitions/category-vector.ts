/**
 * 底图定义：矢量瓦片
 *
 * 每条定义自带完整 URL 与显式属性；order 用于恢复原始定义顺序。
 */
import VectorTileSource from 'ol/source/VectorTile';
import {
    createVectorTileSourceFromUrl,
} from '@ol/tile-source';
import type { LayerSourceDefinition } from '../basemapCore';

function createOpenFreeMapVectorSource(): VectorTileSource {
    const source = createVectorTileSourceFromUrl(
        'https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf',
    );
    source.set('styleUrl', 'https://tiles.openfreemap.org/styles/liberty');
    return source;
}

const definitions: LayerSourceDefinition[] = [
    {
        order: 87,
        id: 'vector_tianditu_mvt',
        name: '天地图矢量(MVT)',
        catalogCategory: 'vector',
        provider: 'Tianditu',
        coord: 'WGS84',
        description: '天地图矢量(MVT) · Tianditu / WGS84',
        category: 'vector',
        group: '矢量',
        url: 'https://vpn.negiao.cn/tdt-mvt/mvt/{z}/{x}/{y}',
        styleUrl: 'https://vpn.negiao.cn/tdt-mvt/style-tech-blue.json',
        serviceType: 'vector-tile',
        createSource: () => {
            const source = createVectorTileSourceFromUrl(
                'https://vpn.negiao.cn/tdt-mvt/mvt/{z}/{x}/{y}',
            );
            source.set('styleUrl', 'https://vpn.negiao.cn/tdt-mvt/style-tech-blue.json');
            return source;
        },
    },
    {
        order: 88,
        id: 'vector_openfreemap_liberty',
        name: 'OpenFreeMap矢量',
        catalogCategory: 'vector',
        provider: 'OpenFreeMap',
        coord: 'WGS84',
        description: 'OpenFreeMap矢量 · OpenFreeMap / WGS84',
        category: 'vector',
        group: '矢量',
        
        url: 'https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf',
        styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
        serviceType: 'vector-tile',
        maxZoom: 14,
        createSource: () => createOpenFreeMapVectorSource(),
    },
];

export default definitions;
