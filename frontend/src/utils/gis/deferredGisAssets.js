import { loadMapRuntimeDeps } from './mapRuntimeDeps';
import * as geotiffRuntimeModule from 'geotiff';

let geotiffRuntimePromise = null;

/**
 * Warm geotiff runtime in background for upload workflows.
 */
export function loadGeotiffRuntime() {
    if (!geotiffRuntimePromise) {
        geotiffRuntimePromise = Promise.resolve(geotiffRuntimeModule);
    }
    return geotiffRuntimePromise;
}

/**
 * Start GIS heavy assets prewarm lazily.
 */
export function warmDeferredGisAssets() {
    return Promise.allSettled([
        loadMapRuntimeDeps(),
        loadGeotiffRuntime()
    ]);
}
