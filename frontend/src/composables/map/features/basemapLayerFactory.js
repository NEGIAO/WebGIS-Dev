import TileLayer from 'ol/layer/Tile';
import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { tileHDRendering } from './useTileHDRendering';

// Basemap layer factory helpers for raster vs vector tile sources.
const VECTOR_TILE_LAYER_KIND = 'vector-tile';
const RASTER_LAYER_KIND = 'raster';

const vectorTileStyles = {
    Point: new Style({
        image: new CircleStyle({
            radius: 3,
            fill: new Fill({ color: 'rgba(37, 99, 235, 0.85)' }),
            stroke: new Stroke({ color: '#ffffff', width: 1 }),
        }),
    }),
    MultiPoint: new Style({
        image: new CircleStyle({
            radius: 3,
            fill: new Fill({ color: 'rgba(37, 99, 235, 0.85)' }),
            stroke: new Stroke({ color: '#ffffff', width: 1 }),
        }),
    }),
    LineString: new Style({
        stroke: new Stroke({ color: 'rgba(34, 197, 94, 0.8)', width: 1.2 }),
    }),
    MultiLineString: new Style({
        stroke: new Stroke({ color: 'rgba(34, 197, 94, 0.8)', width: 1.2 }),
    }),
    Polygon: new Style({
        stroke: new Stroke({ color: 'rgba(14, 116, 144, 0.85)', width: 1 }),
        fill: new Fill({ color: 'rgba(14, 116, 144, 0.12)' }),
    }),
    MultiPolygon: new Style({
        stroke: new Stroke({ color: 'rgba(14, 116, 144, 0.85)', width: 1 }),
        fill: new Fill({ color: 'rgba(14, 116, 144, 0.12)' }),
    }),
    default: new Style({
        stroke: new Stroke({ color: 'rgba(100, 116, 139, 0.9)', width: 1 }),
        fill: new Fill({ color: 'rgba(148, 163, 184, 0.15)' }),
    }),
};

function resolveVectorTileStyle(feature) {
    const geometry = feature?.getGeometry?.();
    const type = geometry?.getType?.();
    return vectorTileStyles[type] || vectorTileStyles.default;
}

// Detect vector tile sources for layer selection.
export function isVectorTileSource(source) {
    return source instanceof VectorTileSource;
}

// Detect vector tile layers created by this factory.
export function isVectorTileLayer(layer) {
    return layer?.get?.('basemapLayerKind') === VECTOR_TILE_LAYER_KIND;
}

// Create a vector tile basemap layer with a safe default style.
export function createVectorTileBasemapLayer(source, options = {}) {
    const {
        visible = true,
        zIndex = 0,
        opacity = 1,
    } = options;

    const layer = new VectorTileLayer({
        source,
        visible,
        zIndex,
        opacity,
        style: resolveVectorTileStyle,
    });

    layer.set('basemapLayerKind', VECTOR_TILE_LAYER_KIND);
    return layer;
}

/**
 * 自定义 NearestDirectionFunction：非整数 zoom 一律取更高层级瓦片。
 *
 * OL 的 linearFindNearest 在 target 落在两个 resolution 之间时调用此函数：
 *   - high = 较粗一级的 resolution（低 zoom，如 z=14 的 resolution）
 *   - low  = 较细一级的 resolution（高 zoom，如 z=15 的 resolution）
 *   返回 > 0 → 取 high（coarser）；返回 <= 0 → 取 low（finer / 更高 zoom）
 *
 * 策略：只要 target 不精确命中整数级，始终返回 -1（取 finer），
 * 实现"任何非整数 zoom 一律向上取整为高清瓦片"。
 *
 * @type {import('ol/array.js').NearestDirectionFunction}
 */
function alwaysPickFinerZoom(target, high, low) {
    if (high === target || low === target) return 1;   // 精确命中整数级，用该级
    return -1;                                          // 介于两级之间，取更高层级
}

/**
 * 根据 tileHDRendering 开关，在 source 上设置 OL 内置的 zDirection 属性。
 *
 * OL 渲染器在 TileLayer.js 主渲染路径中读取 `tileSource.zDirection`，
 * 传给 `tileGrid.getZForResolution(resolution, direction)`。
 * 使用自定义 NearestDirectionFunction 而非固定 -1，
 * 因为 zDirection=-1 仅在 fractional zoom < ~0.415 时偏向上层，
 * z=14.5+ 时与默认行为无差异。自定义函数确保任何非整数 zoom 一律取上层。
 *
 * 构造期与切换期共用此函数，确保开关 flip 后重建的 source 与初始构造走同一套逻辑。
 *
 * @param {import('ol/source/Tile').default|null} rawSource 已套用 prioritizeTileSourceRequest 的 base source
 * @returns {import('ol/source/Tile').default|null} 最终用于挂到 layer 的 source
 */
export function buildRasterBasemapSource(rawSource) {
    if (!rawSource) return null;
    if (tileHDRendering.value) {
        // 非整数 zoom 一律取上一层瓦片（z+1），瓦片数 ×4，清晰度提升
        rawSource.zDirection = alwaysPickFinerZoom;
    }
    return rawSource;
}

// Create a raster tile basemap layer.
export function createRasterBasemapLayer(source, options = {}) {
    const {
        visible = true,
        zIndex = 0,
        opacity = 1,
    } = options;

    const finalSource = buildRasterBasemapSource(source);

    const layer = new TileLayer({
        source: finalSource,
        visible,
        zIndex,
        opacity,
    });

    layer.set('basemapLayerKind', RASTER_LAYER_KIND);
    return layer;
}

// Create a basemap layer based on the provided source type.
export function createBasemapLayerFromSource(source, options = {}) {
    if (isVectorTileSource(source)) {
        return createVectorTileBasemapLayer(source, options);
    }

    return createRasterBasemapLayer(source, options);
}
