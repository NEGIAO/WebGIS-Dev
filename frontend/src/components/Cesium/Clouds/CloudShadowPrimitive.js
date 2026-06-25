import CloudShadowResources from './cloudShadowResources';

export default class CloudShadowPrimitive {
    constructor(viewer, options = {}) {
        if (!viewer?.scene?.context) {
            throw new Error('CloudShadowPrimitive requires a valid Cesium Viewer instance.');
        }

        this.viewer = viewer;
        this.Cesium = options.cesium || globalThis.Cesium;
        this.show = options.enabled === true;
        this.params = { ...options };
        this.resources = new CloudShadowResources(viewer, {
            cesium: this.Cesium,
            enabled: this.show,
            far: options.maxDistance,
            resolution: options.shadowResolution || 256,
        });
        this._destroyed = false;
    }

    get texture() {
        return this.resources?.texture || null;
    }

    get cascadeMatrices() {
        return this.resources?.cascadeMatrices || null;
    }

    get cascadeSplits() {
        return this.resources?.cascadeSplits || null;
    }

    get cascadeCount() {
        return this.resources?.options?.cascadeCount || 0;
    }

    get shadowResolution() {
        return this.resources?.options?.resolution || 0;
    }

    get status() {
        return this.resources?.status || null;
    }

    setParams(params = {}) {
        this.params = {
            ...this.params,
            ...params,
        };
        this.show = this.params.enabled !== false;
        if (this.resources) {
            this.resources.enabled = this.show;
            if (params.shadowResolution !== undefined) {
                this.resources.resize(params.shadowResolution);
            }
        }
    }

    update(frameState) {
        if (this._destroyed || !this.show || !this.resources) return;

        try {
            const scene = this.viewer.scene;
            const sunDirection = scene.context?.uniformState?.sunDirectionWC;
            this.resources.update({
                camera: this.viewer.camera,
                sunDirection,
                maxDistance: this.params.maxDistance,
                density: this.params.density,
                coverage: this.params.coverage,
                bottomRadius: this.params.bottomRadius,
                topRadius: this.params.topRadius,
                timeSeconds: this.params.timeSeconds,
                frameState,
            });
        } catch (error) {
            this.show = false;
            this.params.enabled = false;
            this.resources.enabled = false;
            console.warn('Cesium cloud BSM update disabled:', error);
        }
    }

    destroy() {
        if (this._destroyed) return;
        this.resources?.destroy();
        this.resources = null;
        this._destroyed = true;
    }

    isDestroyed() {
        return this._destroyed;
    }
}
