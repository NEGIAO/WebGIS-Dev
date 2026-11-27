/**
 * 底图定义：历史影像
 *
 * 每条定义自带完整 URL 与显式属性；order 用于恢复原始定义顺序。
 */
import XYZ from 'ol/source/XYZ';
import {
    prioritizeTileSourceRequest,
} from '@ol/tile-source';
import type { LayerSourceDefinition } from '../basemapCore';

const definitions: LayerSourceDefinition[] = [
    {
        order: 17,
        id: 'theme_arcgis_imagery_root',
        name: 'ESRI影像图',
        catalogCategory: 'historical',
        provider: 'ESRI',
        coord: 'WGS84',
        description: 'ESRI影像图 · ESRI / WGS84',
        category: 'imagery',
        group: 'World',
        
        
        url: 'https://wayback-a.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/26334/{z}/{y}/{x}',
        
        
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    
                    url: 'https://wayback-a.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/26334/{z}/{y}/{x}',
                }),
            ),
    },
    {
        order: 27,
        id: 'imagery_s2_cloudless_2016',
        name: 'Sentinel无云2016',
        catalogCategory: 'historical',
        provider: 'Sentinel',
        coord: 'WGS84',
        description: 'Sentinel无云2016 · Sentinel / WGS84 · 2016',
        date: 2016,
        category: 'imagery',
        group: '影像',
        url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
                }),
            ),
    },
    {
        order: 28,
        id: 'imagery_s2_cloudless_2017',
        name: 'Sentinel无云2017',
        catalogCategory: 'historical',
        provider: 'Sentinel',
        coord: 'WGS84',
        description: 'Sentinel无云2017 · Sentinel / WGS84 · 2017',
        date: 2017,
        category: 'imagery',
        group: '影像',
        url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2017_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2017_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
                }),
            ),
    },
    {
        order: 29,
        id: 'imagery_s2_cloudless_2018',
        name: 'Sentinel无云2018',
        catalogCategory: 'historical',
        provider: 'Sentinel',
        coord: 'WGS84',
        description: 'Sentinel无云2018 · Sentinel / WGS84 · 2018',
        date: 2018,
        category: 'imagery',
        group: '影像',
        url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2018_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2018_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
                }),
            ),
    },
    {
        order: 30,
        id: 'imagery_s2_cloudless_2019',
        name: 'Sentinel无云2019',
        catalogCategory: 'historical',
        provider: 'Sentinel',
        coord: 'WGS84',
        description: 'Sentinel无云2019 · Sentinel / WGS84 · 2019',
        date: 2019,
        category: 'imagery',
        group: '影像',
        url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2019_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2019_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
                }),
            ),
    },
    {
        order: 31,
        id: 'imagery_s2_cloudless_2020',
        name: 'Sentinel无云2020',
        catalogCategory: 'historical',
        provider: 'Sentinel',
        coord: 'WGS84',
        description: 'Sentinel无云2020 · Sentinel / WGS84 · 2020',
        date: 2020,
        category: 'imagery',
        group: '影像',
        url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2020_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2020_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
                }),
            ),
    },
    {
        order: 32,
        id: 'imagery_s2_cloudless_2021',
        name: 'Sentinel无云2021',
        catalogCategory: 'historical',
        provider: 'Sentinel',
        coord: 'WGS84',
        description: 'Sentinel无云2021 · Sentinel / WGS84 · 2021',
        date: 2021,
        category: 'imagery',
        group: '影像',
        url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2021_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2021_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
                }),
            ),
    },
    {
        order: 33,
        id: 'imagery_s2_cloudless_2022',
        name: 'Sentinel无云2022',
        catalogCategory: 'historical',
        provider: 'Sentinel',
        coord: 'WGS84',
        description: 'Sentinel无云2022 · Sentinel / WGS84 · 2022',
        date: 2022,
        category: 'imagery',
        group: '影像',
        url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2022_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2022_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
                }),
            ),
    },
    {
        order: 34,
        id: 'imagery_s2_cloudless_2023',
        name: 'Sentinel无云2023',
        catalogCategory: 'historical',
        provider: 'Sentinel',
        coord: 'WGS84',
        description: 'Sentinel无云2023 · Sentinel / WGS84 · 2023',
        date: 2023,
        category: 'imagery',
        group: '影像',
        url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2023_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2023_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
                }),
            ),
    },
    {
        order: 35,
        id: 'imagery_s2_cloudless_2024',
        name: 'Sentinel无云2024',
        catalogCategory: 'historical',
        provider: 'Sentinel',
        coord: 'WGS84',
        description: 'Sentinel无云2024 · Sentinel / WGS84 · 2024',
        date: 2024,
        category: 'imagery',
        group: '影像',
        url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2024_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2024_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
                }),
            ),
    },
    {
        order: 36,
        id: 'imagery_s2_cloudless_2025',
        name: 'Sentinel无云2025',
        catalogCategory: 'historical',
        provider: 'Sentinel',
        coord: 'WGS84',
        description: 'Sentinel无云2025 · Sentinel / WGS84 · 2025',
        date: 2025,
        category: 'imagery',
        group: '影像',
        url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2025_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.maps.eox.at/wmts?layer=s2cloudless-2025_3857&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
                }),
            ),
    },
];

export default definitions;
