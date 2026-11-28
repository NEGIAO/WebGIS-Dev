/**
 * 底图定义：矢量瓦片
 *
 * 每条定义自带完整 URL 与显式属性；order 用于恢复原始定义顺序。
 * V3.7.16 自 ol/basemap/constants/definitions 迁入 common 定义层：
 * 定义只声明原始 URL + method/correction/proxy，createSource 工厂已移至
 * ol/basemap/loaders/createOlSource.ts；本文件零引擎依赖。
 */
import type { TileLayerDefinition } from './types';

const definitions: TileLayerDefinition[] = [
    {
        order: 198,
        id: 'vector_tianditu_mvt',
        name: '天地图矢量(MVT)',
        catalogCategory: 'vector',
        provider: 'Tianditu',
        coord: 'WGS84',
        description: '天地图矢量(MVT) · Tianditu / WGS84',
        url: 'https://vpn.negiao.cn/tdt-mvt/mvt/{z}/{x}/{y}',
        styleUrl: 'https://vpn.negiao.cn/tdt-mvt/style-tech-blue.json',
        method: 'mvt',
        engines: ['ol'],
    },
    {
        order: 199,
        id: 'vector_openfreemap_liberty',
        name: 'OpenFreeMap矢量',
        catalogCategory: 'vector',
        provider: 'OpenFreeMap',
        coord: 'WGS84',
        description: 'OpenFreeMap矢量 · OpenFreeMap / WGS84',
        
        url: 'https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf',
        styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
        method: 'mvt',
        engines: ['ol'],
        maxZoom: 14,
    },
];

export default definitions;
