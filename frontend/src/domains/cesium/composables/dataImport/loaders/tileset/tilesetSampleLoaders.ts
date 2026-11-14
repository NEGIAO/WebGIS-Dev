import { fitTilesetToTerrain } from './tilesetTerrainFit';
import { applyTilesetMaterial } from './tilesetMaterial';

export interface TilesetSampleLoaderBaseOptions {
    getCesium: () => any;
    getViewer: () => any;
    message: {
        success: (msg: string) => any;
        warning: (msg: string) => any;
        error: (msg: string) => any;
    };
    loadedDataSources: { value: any[] };
    nextId: { current: number };
}

/**
 * 加载内置样例 3D Tiles（public/tileset/city/tileset.json）
 * 默认应用白膜贴图材质
 */
export async function loadSampleTileset({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}: TilesetSampleLoaderBaseOptions) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const tileset = await Cesium.Cesium3DTileset.fromUrl(
        './tileset/city/tileset.json',
        { maximumScreenSpaceError: 10, maximumMemoryUsage: 5120 },
    );

    viewer.scene.primitives.add(tileset);
    applyTilesetMaterial(tileset, 'baimo', Cesium);

    const { terrainElevation, tilesetGeo, currentBaseHeight, baseSamples, fitResidual } = await fitTilesetToTerrain({
        tileset, viewer, Cesium, rootJsonUrl: './tileset/city/tileset.json', message,
    });

    const id = `tileset_${++nextId.current}`;
    const record = {
        id,
        name: '腾讯建筑高度',
        type: '3dtiles',
        entity: tileset,
        terrainElevation,
        tilesetGeo,
        currentBaseHeight,
        fitResidual,
        terrainFitSamples: baseSamples,
        materialMode: 'baimo',
    };
    loadedDataSources.value = [...loadedDataSources.value, record];

    await viewer.flyTo(tileset, {
        duration: 1.5,
        offset: new Cesium.HeadingPitchRange(
            0,
            Cesium.Math.toRadians(-45),
            tileset.boundingSphere.radius * 0.4,
        ),
    });
    message.success('样例 3D Tiles 加载成功');
    return record;
}

/**
 * 加载内置样例 3D Tiles：武汉建筑数据（public/tileset/baimo/tileset.json）
 */
export async function loadSampleBaimoTileset({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}: TilesetSampleLoaderBaseOptions) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const tileset = await Cesium.Cesium3DTileset.fromUrl(
        'https://3dtiles.negiao.cc.cd/baimo/tileset.json',
        { maximumScreenSpaceError: 10, maximumMemoryUsage: 5120 },
    );

    viewer.scene.primitives.add(tileset);
    applyTilesetMaterial(tileset, 'baimo', Cesium);

    const { terrainElevation, tilesetGeo, currentBaseHeight, baseSamples, fitResidual } = await fitTilesetToTerrain({
        tileset, viewer, Cesium, rootJsonUrl: './tileset/baimo/tileset.json', message,
    });

    const id = `tileset_${++nextId.current}`;
    const record = {
        id,
        name: '武汉建筑数据',
        type: '3dtiles',
        entity: tileset,
        terrainElevation,
        tilesetGeo,
        currentBaseHeight,
        fitResidual,
        terrainFitSamples: baseSamples,
        materialMode: 'baimo',
    };
    loadedDataSources.value = [...loadedDataSources.value, record];

    await viewer.flyTo(tileset, {
        duration: 1.5,
        offset: new Cesium.HeadingPitchRange(
            0,
            Cesium.Math.toRadians(-45),
            tileset.boundingSphere.radius * 0.4,
        ),
    });
    message.success('武汉建筑 3D Tiles 加载成功');
    return record;
}

/**
 * 加载 Cesium Ion 样例：河南大学摄影测量数据 (Asset 5115505)
 */
export async function loadSampleIonTileset({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}: TilesetSampleLoaderBaseOptions) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const assetId = 5115505;
    const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(assetId, {
        maximumScreenSpaceError: 4,
        enableCollision: true,
    });

    viewer.scene.primitives.add(tileset);

    const { terrainElevation, tilesetGeo, currentBaseHeight, baseSamples, fitResidual } = await fitTilesetToTerrain({
        tileset, viewer, Cesium, message,
    });

    const id = `tileset_${++nextId.current}`;
    const record = {
        id,
        name: 'Cesium Ion 河南大学',
        type: '3dtiles',
        entity: tileset,
        terrainElevation,
        tilesetGeo,
        currentBaseHeight,
        fitResidual,
        terrainFitSamples: baseSamples,
        materialMode: 'none',
    };
    loadedDataSources.value = [...loadedDataSources.value, record];

    await viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(114.302537, 34.813816, 158.50),
        orientation: {
            heading: Cesium.Math.toRadians(356.554),
            pitch: Cesium.Math.toRadians(-28.061),
            roll: 0,
        },
        duration: 1.5,
    });
    message.success(`已加载 Cesium Ion 样例 (Asset ${assetId})`);
    return record;
}

/**
 * 加载 Cesium Ion 样例：美国摄影测量数据 (Asset 354759)
 */
export async function loadSampleI3sTileset({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}: TilesetSampleLoaderBaseOptions) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const assetId = 354759;
    const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(assetId, {
        maximumScreenSpaceError: 4,
        enableCollision: true,
    });

    viewer.scene.primitives.add(tileset);

    const { terrainElevation, tilesetGeo, currentBaseHeight, baseSamples, fitResidual } = await fitTilesetToTerrain({
        tileset, viewer, Cesium, message,
    });

    const id = `tileset_${++nextId.current}`;
    const record = {
        id,
        name: '美国摄影测量数据',
        type: '3dtiles',
        entity: tileset,
        terrainElevation,
        tilesetGeo,
        currentBaseHeight,
        fitResidual,
        terrainFitSamples: baseSamples,
        materialMode: 'none',
    };
    loadedDataSources.value = [...loadedDataSources.value, record];

    await viewer.camera.flyTo({
        destination: tileset.boundingSphere.center,
        orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0,
        },
        duration: 1.5,
    });
    message.success(`已加载 Cesium Ion 样例 (Asset ${assetId})`);
    return record;
}

/**
 * 加载 Cesium 官方离散 LOD 样例（TilesetWithDiscreteLOD）
 */
export async function loadSampleDiscreteLODTileset({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}: TilesetSampleLoaderBaseOptions) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const url = 'https://raw.githubusercontent.com/CesiumGS/3d-tiles-samples/master/1.0/TilesetWithDiscreteLOD/tileset.json';

    const tileset = await Cesium.Cesium3DTileset.fromUrl(url);
    viewer.scene.primitives.add(tileset);

    const { terrainElevation, tilesetGeo, currentBaseHeight, baseSamples, fitResidual } = await fitTilesetToTerrain({
        tileset, viewer, Cesium, message,
    });

    const id = `tileset_${++nextId.current}`;
    const record = {
        id,
        name: '美国Dragon 3d Tiles (离散 LOD)',
        type: '3dtiles',
        entity: tileset,
        terrainElevation,
        tilesetGeo,
        currentBaseHeight,
        fitResidual,
        terrainFitSamples: baseSamples,
        materialMode: 'none',
    };
    loadedDataSources.value = [...loadedDataSources.value, record];

    await viewer.flyTo(tileset, {
        duration: 2,
        offset: new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(0.0),
            Cesium.Math.toRadians(-25.0),
            tileset.boundingSphere.radius * 2.5,
        ),
    });
    message.success('已加载离散 LOD 样例 (TilesetWithDiscreteLOD)');
    return record;
}
