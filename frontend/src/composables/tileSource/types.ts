/**
 * 瓦片源工厂 — 类型定义与常量
 *
 * 从 useTileSourceFactory.ts 拆分。
 */

import type XYZ from 'ol/source/XYZ';
import type TileWMS from 'ol/source/TileWMS';
import type WMTS from 'ol/source/WMTS';
import type VectorTileSource from 'ol/source/VectorTile';

export type TileYNormalizeMode = 'auto' | 'direct' | 'invert-tms' | 'ol-negative';
export type CustomTileSourceKind =
    | 'xyz'
    | 'non-standard-xyz'
    | 'wms'
    | 'wmts'
    | 'vector-tile'
    | 'unknown';
export type TileSourceLike = XYZ | TileWMS | WMTS | VectorTileSource;

export type AutoTileSourceResult = {
    source: TileSourceLike;
    kind: CustomTileSourceKind;
    detail: string;
};

export type NonStandardXYZAdapter = {
    pattern: RegExp;
    name: string;
    urlFunction: (tileCoord: number[]) => string;
};

export type ConfiguredTileServiceType = 'xyz' | 'wms' | 'wmts' | 'vector-tile';

export type ConfiguredTileServiceDefinition = {
    id: string;
    name: string;
    url: string;
    serviceType: ConfiguredTileServiceType;
    enabled?: boolean;
    wms?: {
        layers?: string;
        version?: string;
        styles?: string;
        format?: string;
        transparent?: boolean;
        srs?: string;
        crs?: string;
    };
    wmts?: {
        layer?: string;
        style?: string;
        matrixSet?: string;
        format?: string;
        version?: string;
    };
};

export type TileSourceFactoryOptions = {
    adapters?: Record<string, NonStandardXYZAdapter>;
};

export type AutoDetectOptions = {
    adapters?: Record<string, NonStandardXYZAdapter>;
};

export const DEFAULT_WMS_VERSION = '1.1.1';
export const DEFAULT_WMTS_VERSION = '1.0.0';
export const CAPABILITIES_FETCH_TIMEOUT_MS = 10000;
export const TILE_REQUEST_TIMEOUT_MS = 15000;
export const TILE_STATE_ERROR = 3;
