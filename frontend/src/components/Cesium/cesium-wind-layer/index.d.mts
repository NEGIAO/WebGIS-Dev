import { Cartesian3, Viewer, Scene } from 'cesium';

interface WindLayerOptions {
    /**
     * Size of the particle texture. Determines the maximum number of particles (size squared). Default is 100.
     */
    particlesTextureSize: number;
    /**
     * Height of particles above the ground in meters. Default is 0.
     */
    particleHeight: number;
    /**
     * Width range of particle trails in pixels. Default is { min: 1, max: 5 }.
     * Controls the width of the particles.
     * @property {number} min - Minimum width of particle trails
     * @property {number} max - Maximum width of particle trails
     */
    lineWidth: {
        min: number;
        max: number;
    };
    /**
     * Length range of particle trails. Default is { min: 20, max: 100 }.
     * @property {number} min - Minimum length of particle trails
     * @property {number} max - Maximum length of particle trails
     */
    lineLength: {
        min: number;
        max: number;
    };
    /**
     * Factor to adjust the speed of particles. Default is 1.0.
     * Controls the movement speed of particles.
     */
    speedFactor: number;
    /**
     * Rate at which particles are dropped (reset). Default is 0.003.
     * Controls the lifecycle of particles.
     */
    dropRate: number;
    /**
     * Additional drop rate for slow-moving particles. Default is 0.001.
     * Increases the probability of dropping particles when they move slowly.
     */
    dropRateBump: number;
    /**
     * Whether to flip the Y-axis of the wind data. Default is false.
     */
    flipY: boolean;
    /**
     * Array of colors for particles. Can be used to create color gradients.
     * Default is ['white'].
     */
    colors: string[];
    /**
     * Whether to use the viewer bounds to generate particles. Default is false.
     */
    useViewerBounds?: boolean;
    /**
     * Controls the speed rendering range. Default is undefined.
     * @property {number} [min] - Minimum speed value for rendering
     * @property {number} [max] - Maximum speed value for rendering
     */
    domain?: {
        min?: number;
        max?: number;
    };
    /**
     * Controls the speed display range for visualization. Default is undefined.
     * @property {number} [min] - Minimum speed value for display
     * @property {number} [max] - Maximum speed value for display
     */
    displayRange?: {
        min?: number;
        max?: number;
    };
    /**
     * Whether to enable dynamic particle animation. Default is true.
     * When set to false, particles will remain static.
     */
    dynamic: boolean;
}
interface WindDataDemention {
    array: Float32Array;
    min?: number;
    max?: number;
}
interface WindData {
    u: WindDataDemention;
    v: WindDataDemention;
    speed?: WindDataDemention;
    width: number;
    height: number;
    bounds: {
        west: number;
        south: number;
        east: number;
        north: number;
    };
}
interface Particle {
    position: Cartesian3;
    age: number;
}
interface WindDataAtLonLat {
    /**
     * Original data at the grid point
     */
    original: {
        /**
         * Original U component
         */
        u: number;
        /**
         * Original V component
         */
        v: number;
        /**
         * Original speed
         */
        speed: number;
    };
    /**
     * Interpolated data between grid points
     */
    interpolated: {
        /**
         * Interpolated U component
         */
        u: number;
        /**
         * Interpolated V component
         */
        v: number;
        /**
         * Interpolated speed
         */
        speed: number;
    };
}

type WindLayerEventType = 'dataChange' | 'optionsChange';
type WindLayerEventCallback = (data: WindData | WindLayerOptions) => void;
declare const DefaultOptions: WindLayerOptions;
declare class WindLayer {
    private _show;
    private _resized;
    windData: Required<WindData>;
    get show(): boolean;
    set show(value: boolean);
    static defaultOptions: WindLayerOptions;
    viewer: Viewer;
    scene: Scene;
    options: WindLayerOptions;
    private particleSystem;
    private viewerParameters;
    private _isDestroyed;
    private primitives;
    private eventListeners;
    /**
     * WindLayer class for visualizing wind field data with particle animation in Cesium.
     *
     * @class
     * @param {Viewer} viewer - The Cesium viewer instance.
     * @param {WindData} windData - The wind field data to visualize.
     * @param {Partial<WindLayerOptions>} [options] - Optional configuration options for the wind layer.
     * @param {number} [options.particlesTextureSize=100] - Size of the particle texture. Determines the maximum number of particles (size squared).
     * @param {number} [options.particleHeight=0] - Height of particles above the ground in meters.
     * @param {Object} [options.lineWidth={ min: 1, max: 2 }] - Width range of particle trails.
     * @param {Object} [options.lineLength={ min: 20, max: 100 }] - Length range of particle trails.
     * @param {number} [options.speedFactor=1.0] - Factor to adjust the speed of particles.
     * @param {number} [options.dropRate=0.003] - Rate at which particles are dropped (reset).
     * @param {number} [options.dropRateBump=0.001] - Additional drop rate for slow-moving particles.
     * @param {string[]} [options.colors=['white']] - Array of colors for particles. Can be used to create color gradients.
     * @param {boolean} [options.flipY=false] - Whether to flip the Y-axis of the wind data.
     * @param {boolean} [options.useViewerBounds=false] - Whether to use the viewer bounds to generate particles.
     * @param {boolean} [options.dynamic=true] - Whether to enable dynamic particle animation.
     */
    constructor(viewer: Viewer, windData: WindData, options?: Partial<WindLayerOptions>);
    private setupEventListeners;
    private removeEventListeners;
    private processWindData;
    /**
     * Get the wind data at a specific longitude and latitude.
     * @param {number} lon - The longitude.
     * @param {number} lat - The latitude.
     * @returns {Object} - An object containing the u, v, and speed values at the specified coordinates.
     */
    getDataAtLonLat(lon: number, lat: number): WindDataAtLonLat | null;
    private updateViewerParameters;
    /**
     * Update the wind data of the wind layer.
     * @param {WindData} data - The new wind data to apply.
     */
    updateWindData(data: WindData): void;
    /**
     * Update the options of the wind layer.
     * @param {Partial<WindLayerOptions>} options - The new options to apply.
     */
    updateOptions(options: Partial<WindLayerOptions>): void;
    /**
     * Zoom to the wind data bounds.
     * @param {number} [duration=0] - The duration of the zoom animation.
     */
    zoomTo(duration?: number): void;
    /**
     * Add the wind layer to the scene.
     */
    add(): void;
    /**
     * Remove the wind layer from the scene.
     */
    remove(): void;
    /**
     * Check if the wind layer is destroyed.
     * @returns {boolean} - True if the wind layer is destroyed, otherwise false.
     */
    isDestroyed(): boolean;
    /**
     * Destroy the wind layer and release all resources.
     */
    destroy(): void;
    private updatePrimitivesVisibility;
    /**
     * Add an event listener for the specified event type.
     * @param {WindLayerEventType} type - The type of event to listen for.
     * @param {WindLayerEventCallback} callback - The callback function to execute when the event occurs.
     */
    addEventListener(type: WindLayerEventType, callback: WindLayerEventCallback): void;
    /**
     * Remove an event listener for the specified event type.
     * @param {WindLayerEventType} type - The type of event to remove.
     * @param {WindLayerEventCallback} callback - The callback function to remove.
     */
    removeEventListener(type: WindLayerEventType, callback: WindLayerEventCallback): void;
    private dispatchEvent;
}

export { DefaultOptions, type Particle, type WindData, type WindDataAtLonLat, type WindDataDemention, WindLayer, type WindLayerEventCallback, type WindLayerEventType, type WindLayerOptions };
