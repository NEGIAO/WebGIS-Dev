import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import { fromLonLat, toLonLat } from 'ol/proj';
import { defaults as defaultControls, ScaleLine, OverviewMap } from 'ol/control';
import { createEmpty, extend as extendExtent, isEmpty as isExtentEmpty } from 'ol/extent';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import XYZ from 'ol/source/XYZ';
import VectorSource from 'ol/source/Vector';
import Overlay from 'ol/Overlay';

let mapRuntimeDepsPromise = null;

const mapRuntimeDeps = {
    Map,
    View,
    fromLonLat,
    toLonLat,
    defaultControls,
    ScaleLine,
    OverviewMap,
    createEmpty,
    extendExtent,
    isExtentEmpty,
    TileLayer,
    VectorLayer,
    XYZ,
    VectorSource,
    Overlay
};

/**
 * Resolve OpenLayers runtime dependencies from a lazily loaded module and cache the result.
 */
export function loadMapRuntimeDeps() {
    if (!mapRuntimeDepsPromise) {
        mapRuntimeDepsPromise = Promise.resolve(mapRuntimeDeps);
    }
    return mapRuntimeDepsPromise;
}
