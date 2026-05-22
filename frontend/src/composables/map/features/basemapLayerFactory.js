import TileLayer from 'ol/layer/Tile';
import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';

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

// Create a raster tile basemap layer.
export function createRasterBasemapLayer(source, options = {}) {
    const {
        visible = true,
        zIndex = 0,
        opacity = 1,
    } = options;

    const layer = new TileLayer({
        source,
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
