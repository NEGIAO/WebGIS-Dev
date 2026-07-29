/**
 * Trigger GIS warmup through a second-stage dynamic import so the register entry
 * does not statically reference heavy GIS chunks before the 3-second timer fires.
 */
export async function launchDeferredGisWarmup() {
    const mod = await import('./deferredGisAssets');
    return mod.warmDeferredGisAssets();
}
