/**
 * terrainHeightMapSampler.ts — Cesium 水体流体模拟的地形高度图采样与垂向高程归一化工具
 *
 * 从 FluidSimulationPanel 抽离纯地形采样与值域计算模块（无 Vue 响应式状态依赖）：
 * 负责生成 ENU 局部采样网格、按合适瓦片层级采样高程、烘焙 Float32 高度图纹理及垂向水位换算。
 */

const FLUID_FALLBACK_DEPTH = 1200;
const FLUID_FALLBACK_BOTTOM_PADDING = 100;
const FLUID_MIN_VERTICAL_SPAN = 0.01;
const FLUID_INITIAL_WATER_RATIO = 0.03;
const TERRAIN_SAMPLE_TARGET_SPACING = 60;
const TERRAIN_SAMPLE_MIN_SIZE = 64;
const TERRAIN_SAMPLE_MAX_SIZE = 160;

export interface FluidVerticalRange {
    baseHeight: number;
    depth: number;
    minHeight: number;
    maxHeight: number;
}

export interface TerrainHeightMapSource {
    width: number;
    height: number;
    arrayBufferView: Float32Array;
    minHeight: number;
    maxHeight: number;
}

export function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function clampInteger(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(value)));
}

export function isValidHexColor(value: any): value is string {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function parseHexColor(
    value: string,
): { red: number; green: number; blue: number } | null {
    if (!isValidHexColor(value)) return null;
    return {
        red: Number.parseInt(value.slice(1, 3), 16) / 255,
        green: Number.parseInt(value.slice(3, 5), 16) / 255,
        blue: Number.parseInt(value.slice(5, 7), 16) / 255,
    };
}

export function createCesiumRgb(Cesium: any, hexColor: string): any {
    const rgb = parseHexColor(hexColor) || parseHexColor('#0d4fa3')!;
    return new Cesium.Cartesian3(rgb.red, rgb.green, rgb.blue);
}

export function pickCartesianOnGlobe(viewer: any, position: any): any {
    if (!position) return null;
    if (viewer.scene.pickPositionSupported && typeof viewer.scene.pickPosition === 'function') {
        const picked = viewer.scene.pickPosition(position);
        if (picked) return picked;
    }
    const ray = viewer.camera.getPickRay(position);
    if (!ray) return null;
    return viewer.scene.globe.pick(ray, viewer.scene);
}

function chooseTerrainSampleSize(dimensions: any): number {
    const horizontalSize = Math.max(Number(dimensions?.x) || 0, Number(dimensions?.y) || 0);
    const targetSize = Math.ceil(horizontalSize / TERRAIN_SAMPLE_TARGET_SPACING) + 1;
    return clampInteger(targetSize, TERRAIN_SAMPLE_MIN_SIZE, TERRAIN_SAMPLE_MAX_SIZE);
}

function createTerrainSamplePositions(
    Cesium: any,
    { lon, lat, centerHeight, dimensions }: any,
    size: number,
): any[] {
    const center = Cesium.Cartesian3.fromDegrees(lon, lat, centerHeight);
    const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(center);
    const positions: any[] = [];
    const denominator = Math.max(1, size - 1);

    for (let row = 0; row < size; row++) {
        const v = row / denominator;
        const north = (0.5 - v) * dimensions.y;
        for (let col = 0; col < size; col++) {
            const u = col / denominator;
            const east = (u - 0.5) * dimensions.x;
            const local = new Cesium.Cartesian3(east, north, 0);
            const world = Cesium.Matrix4.multiplyByPoint(enuMatrix, local, new Cesium.Cartesian3());
            positions.push(Cesium.Cartographic.fromCartesian(world));
        }
    }
    return positions;
}

function getExplicitTerrainSampleLevel(terrainProvider: any): number | null {
    const bottomLevel = Number(terrainProvider?._bottomLevel);
    if (Number.isFinite(bottomLevel)) return Math.max(0, bottomLevel - 1);
    return null;
}

/** 统一用 sampleTerrain 指定层级，避免 sampleTerrainMostDetailed 请求过高精度导致瓦片过载 */
async function sampleTerrainPositions(
    Cesium: any,
    terrainProvider: any,
    positions: any[],
): Promise<any[]> {
    const explicitLevel = getExplicitTerrainSampleLevel(terrainProvider);
    const sampleLevel = Number.isInteger(explicitLevel)
        ? explicitLevel
        : Math.min(terrainProvider?.maximumLevel ?? 12, 12);
    if (typeof Cesium.sampleTerrain === 'function') {
        return Cesium.sampleTerrain(terrainProvider, sampleLevel, positions);
    }
    return Cesium.sampleTerrainMostDetailed(terrainProvider, positions);
}

function getTerrainHeightRange(positions: any[]): { minHeight: number; maxHeight: number } | null {
    let minHeight = Number.POSITIVE_INFINITY;
    let maxHeight = Number.NEGATIVE_INFINITY;
    for (const position of positions || []) {
        const height = Number(position?.height);
        if (!Number.isFinite(height)) continue;
        minHeight = Math.min(minHeight, height);
        maxHeight = Math.max(maxHeight, height);
    }
    if (!Number.isFinite(minHeight) || !Number.isFinite(maxHeight)) return null;
    return { minHeight, maxHeight };
}

function createSampledHeightMapSource(
    positions: any[],
    { size }: { size: number },
): TerrainHeightMapSource | null {
    const range = getTerrainHeightRange(positions);
    if (!range) return null;
    const data = new Float32Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
        const height = Number(positions[i]?.height);
        const offset = i * 4;
        data[offset] = Number.isFinite(height)
            ? clampNumber(height, range.minHeight, range.maxHeight)
            : range.minHeight;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 1;
    }
    return {
        width: size,
        height: size,
        arrayBufferView: data,
        minHeight: range.minHeight,
        maxHeight: range.maxHeight,
    };
}

function createFlatHeightMapSource(size: number): TerrainHeightMapSource {
    return {
        width: size,
        height: size,
        arrayBufferView: new Float32Array(size * size * 4),
        minHeight: 0,
        maxHeight: 0,
    };
}

async function sampleTerrainHeightMapSource(
    viewer: any,
    Cesium: any,
    options: any,
    size: number,
): Promise<TerrainHeightMapSource | null> {
    const positions = createTerrainSamplePositions(Cesium, options, size);
    const sampledPositions = await sampleTerrainPositions(Cesium, viewer.terrainProvider, positions);
    return createSampledHeightMapSource(sampledPositions || positions, { size });
}

export async function createTerrainHeightMapSource(
    viewer: any,
    Cesium: any,
    options: any,
): Promise<TerrainHeightMapSource | null> {
    const terrainProvider = viewer?.terrainProvider;
    const size = chooseTerrainSampleSize(options.dimensions);
    if (!terrainProvider) return null;

    if (
        Cesium.EllipsoidTerrainProvider &&
        terrainProvider instanceof Cesium.EllipsoidTerrainProvider
    ) {
        return createFlatHeightMapSource(size);
    }
    if (
        typeof Cesium.sampleTerrain !== 'function' &&
        typeof Cesium.sampleTerrainMostDetailed !== 'function'
    ) {
        return null;
    }

    try {
        return await sampleTerrainHeightMapSource(viewer, Cesium, options, size);
    } catch (error) {
        console.warn('Fluid terrain sampling warning:', error);
        if (size <= TERRAIN_SAMPLE_MIN_SIZE) throw error;
        return sampleTerrainHeightMapSource(viewer, Cesium, options, TERRAIN_SAMPLE_MIN_SIZE);
    }
}

export function resolveFluidVerticalRange(
    heightMapSource: any,
    centerHeight: number,
): FluidVerticalRange {
    const sampledMinHeight = Number(heightMapSource?.minHeight);
    const sampledMaxHeight = Number(heightMapSource?.maxHeight);

    if (Number.isFinite(sampledMinHeight) && Number.isFinite(sampledMaxHeight)) {
        const pickedHeight = Number(centerHeight);
        const minHeight = Number.isFinite(pickedHeight)
            ? Math.min(sampledMinHeight, sampledMaxHeight, pickedHeight)
            : Math.min(sampledMinHeight, sampledMaxHeight);
        const maxHeight = Number.isFinite(pickedHeight)
            ? Math.max(sampledMinHeight, sampledMaxHeight, pickedHeight)
            : Math.max(sampledMinHeight, sampledMaxHeight);
        const depth = Math.max(maxHeight - minHeight, FLUID_MIN_VERTICAL_SPAN);
        return { baseHeight: minHeight, depth, minHeight, maxHeight: minHeight + depth };
    }

    const fallbackCenterHeight = Number(centerHeight);
    const fallbackBaseHeight = Number.isFinite(fallbackCenterHeight)
        ? fallbackCenterHeight - FLUID_FALLBACK_BOTTOM_PADDING
        : 0;
    return {
        baseHeight: fallbackBaseHeight,
        depth: FLUID_FALLBACK_DEPTH,
        minHeight: fallbackBaseHeight,
        maxHeight: fallbackBaseHeight + FLUID_FALLBACK_DEPTH,
    };
}

export function resolveInitialWaterLevel(
    verticalRange: FluidVerticalRange,
    pickedWaterLevel: number,
): number {
    const fallbackLevel =
        verticalRange.minHeight + verticalRange.depth * FLUID_INITIAL_WATER_RATIO;
    const picked = Number(pickedWaterLevel);
    const nextWaterLevel = Number.isFinite(picked) ? picked : fallbackLevel;
    return clampNumber(nextWaterLevel, verticalRange.minHeight, verticalRange.maxHeight);
}

export function normalizeWaterLevel(
    absoluteWaterLevel: number,
    verticalRange: Pick<FluidVerticalRange, 'minHeight' | 'maxHeight'>,
): number {
    const span = verticalRange.maxHeight - verticalRange.minHeight;
    if (!Number.isFinite(span) || span <= 0) return 0;
    return clampNumber((absoluteWaterLevel - verticalRange.minHeight) / span, 0, 1);
}
