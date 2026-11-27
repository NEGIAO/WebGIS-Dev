/**
 * 底图定义：服务入口（WMS/WMTS/MVT/XYZ 触发）
 *
 * 每条定义自带完整 URL 与显式属性；order 用于恢复原始定义顺序。
 */
import XYZ from 'ol/source/XYZ';
import {
    NON_STANDARD_XYZ_ADAPTERS,
} from '../basemapCore';
import {
    createXYZSourceFromUrl,
    prioritizeTileSourceRequest,
} from '@ol/tile-source';
import type { LayerSourceDefinition } from '../basemapCore';

const definitions: LayerSourceDefinition[] = [
    {
        order: 8,
        id: 'custom',
        name: '自定义URL',
        catalogCategory: 'service',
        provider: 'Custom',
        coord: 'NONE',
        description: '自定义URL · Custom / 无坐标系',
        category: 'custom',
        group: '自定义',
        url: '',
        adapters: NON_STANDARD_XYZ_ADAPTERS,
        serviceType: 'custom',
        createSource: ({ customUrl }) =>
            customUrl
                ? createXYZSourceFromUrl(customUrl, { adapters: NON_STANDARD_XYZ_ADAPTERS })
                : null,
    },
    {
        order: 168,
        id: 'local_tiles',
        name: '自定义瓦片',
        catalogCategory: 'service',
        provider: 'Local',
        coord: 'NONE',
        description: '自定义瓦片 · Local / 无坐标系',
        category: 'custom',
        group: '自定义',
        url: 'https://tiles.negiao.cc.cd/tiles/{z}/{x}/{y}.png',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.negiao.cc.cd/tiles/{z}/{x}/{y}.png',
                }),
            ),
    },
];

export default definitions;
