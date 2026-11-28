/**
 * 底图定义：服务入口（WMS/WMTS/MVT/XYZ 触发）
 *
 * 每条定义自带完整 URL 与显式属性；order 用于恢复原始定义顺序。
 * V3.7.16 自 ol/basemap/constants/definitions 迁入 common 定义层：
 * 定义只声明原始 URL + method/correction/proxy，createSource 工厂已移至
 * ol/basemap/loaders/createOlSource.ts；本文件零引擎依赖。
 */
import type { TileLayerDefinition } from './types';

const definitions: TileLayerDefinition[] = [
    {
        order: 152,
        id: 'custom',
        name: '自定义URL',
        catalogCategory: 'service',
        provider: 'Custom',
        coord: 'NONE',
        description: '自定义URL · Custom / 未知',
        url: '',
        method: 'custom',
    },
    {
        order: 153,
        id: 'local_tiles',
        name: '自定义瓦片',
        catalogCategory: 'service',
        provider: 'Local',
        coord: 'WGS84',
        description: '自定义瓦片 · Local / WGS84',
        url: 'https://tiles.negiao.cc.cd/tiles/{z}/{x}/{y}.png',
        method: 'xyz',
    },
];

export default definitions;
