import { loadMapRuntimeDeps } from './mapRuntimeDeps';

let geotiffRuntimePromise = null;

/**
 * Warm geotiff runtime in background for upload workflows.
 * Uses dynamic import for code splitting — geotiff (~80KB) stays out of the main chunk.
 */
export function loadGeotiffRuntime() {
    if (!geotiffRuntimePromise) {
        geotiffRuntimePromise = import('geotiff');
    }
    return geotiffRuntimePromise;
}

/**
 * Start GIS heavy assets prewarm lazily.
 */
export function warmDeferredGisAssets() {
    return Promise.allSettled([loadMapRuntimeDeps(), loadGeotiffRuntime()]);
}
