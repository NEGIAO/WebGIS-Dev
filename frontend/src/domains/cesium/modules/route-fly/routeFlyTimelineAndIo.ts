import JSZip from 'jszip';
import { downloadBlobFile } from '../planar-route/utils/comm';
import { buildRouteKml, parseRouteJson, parseRouteKml } from './routeSerialize';

/**
 * 三级表面高度采样：
 * ① 贴合建筑开 → scene.sampleHeight（含 3D Tiles，同步）
 * ② 地形提供者非椭球 → sampleTerrainMostDetailed（异步批量精确）
 * ③ 回退 globe.getHeight / 采样点自带高程
 */
export async function sampleRouteSurfaceHeights(
    Cesium: any,
    viewer: any,
    samples: any[],
    clampToBuildings: boolean,
) {
    const scene = viewer.scene;
    const heights = new Array(samples.length);

    if (clampToBuildings && scene.sampleHeightSupported) {
        for (let i = 0; i < samples.length; i++) {
            const h = scene.sampleHeight(samples[i]);
            heights[i] = Number.isFinite(h) ? h : undefined;
        }
        return heights;
    }

    const provider = viewer.scene.globe.terrainProvider;
    const isEllipsoid = !provider || provider instanceof Cesium.EllipsoidTerrainProvider;
    if (!isEllipsoid && Cesium.sampleTerrainMostDetailed) {
        try {
            const resolved = await Cesium.sampleTerrainMostDetailed(
                provider,
                samples.map((c: any) => c.clone()),
            );
            return resolved.map((c: any) => c.height);
        } catch {
            /* 落入下方回退 */
        }
    }

    return samples.map((c: any) => {
        const h = scene.globe.getHeight(c);
        return Number.isFinite(h) ? h : undefined;
    });
}

/**
 * 重采样 + 三级表面高度采样 + 时间轴构建
 */
export async function buildRouteFlyTimeline({
    Cesium,
    viewer,
    positions,
    params,
    setMarkersShow,
}: {
    Cesium: any;
    viewer: any;
    positions: any[];
    params: any;
    setMarkersShow: (show: boolean) => void;
}) {
    const step = Math.max(1, Number(params.sampleStep) || 20);
    const cartos = positions.map((p) => Cesium.Cartographic.fromCartesian(p));

    const samples = [];
    for (let i = 0; i < cartos.length - 1; i++) {
        const a = cartos[i];
        const b = cartos[i + 1];
        const segLength = Cesium.Cartesian3.distance(positions[i], positions[i + 1]);
        const count = Math.max(1, Math.ceil(segLength / step));
        for (let k = 0; k < count; k++) {
            const t = k / count;
            samples.push(
                new Cesium.Cartographic(
                    Cesium.Math.lerp(a.longitude, b.longitude, t),
                    Cesium.Math.lerp(a.latitude, b.latitude, t),
                    Cesium.Math.lerp(a.height, b.height, t),
                ),
            );
        }
    }
    samples.push(cartos[cartos.length - 1].clone());

    const markersWereVisible = params.showMarkers;
    setMarkersShow(false);
    let heights;
    try {
        heights = await sampleRouteSurfaceHeights(
            Cesium,
            viewer,
            samples,
            Boolean(params.clampToBuildings),
        );
    } finally {
        setMarkersShow(markersWereVisible);
    }

    const flyHeight = Number(params.flyHeight) || 0;
    const degrees = [];
    let elapsed = 0;
    let total = 0;
    let prev: any = null;
    for (let i = 0; i < samples.length; i++) {
        const c = samples[i];
        const h = (Number.isFinite(heights[i]) ? heights[i] : c.height) + flyHeight;
        const current = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, h);
        if (prev) {
            const d = Cesium.Cartesian3.distance(prev, current);
            total += d;
            elapsed += d;
        }
        degrees.push(
            elapsed,
            Cesium.Math.toDegrees(c.longitude),
            Cesium.Math.toDegrees(c.latitude),
            h,
        );
        prev = current;
    }
    return { degrees, length: total, duration: elapsed, sampleCount: samples.length };
}

/**
 * 构建并装载 CZML，同时接管实体朝向
 */
export async function loadRouteFlyCzml({
    Cesium,
    czmlDataSource,
    degrees,
    duration,
    degree,
    params,
}: {
    Cesium: any;
    czmlDataSource: any;
    degrees: any;
    duration: any;
    degree: any;
    params: any;
}) {
    const p = params;
    const startTime = Cesium.JulianDate.fromDate(new Date());
    const stopTime = Cesium.JulianDate.addSeconds(startTime, duration, new Cesium.JulianDate());
    const startStr = Cesium.JulianDate.toIso8601(startTime);
    const interval = `${startStr}/${Cesium.JulianDate.toIso8601(stopTime)}`;

    const czml = [
        {
            id: 'document',
            name: 'route-fly',
            version: '1.0',
            clock: { interval, currentTime: startStr, multiplier: 1 },
        },
        {
            id: 'route-fly',
            name: '手绘线路漫游',
            availability: interval,
            path: {
                material: { polylineDash: { color: { rgba: [0, 255, 255, 255] } } },
                width: 2,
                show: p.showPath,
            },
            model:
                p.showModel && p.modelUri
                    ? {
                          gltf: p.modelUri,
                          scale: p.modelScale,
                          minimumPixelSize: 32,
                          maximumScale: 200,
                      }
                    : undefined,
            orientation: { velocityReference: '#position' },
            position: {
                interpolationAlgorithm: 'LAGRANGE',
                interpolationDegree: degree,
                epoch: startStr,
                cartographicDegrees: degrees,
            },
        },
    ];

    await czmlDataSource.load(czml);
    const entity = czmlDataSource.entities.getById('route-fly');
    const baseOrientation = entity.orientation;

    entity.orientation = new Cesium.CallbackProperty((time: any, result: any) => {
        const q = baseOrientation.getValue(time);
        if (!q) return undefined;
        const offset = Number(p.modelHeadingOffset) || 0;
        if (!offset) return Cesium.Quaternion.clone(q, result || new Cesium.Quaternion());
        const offsetQ = Cesium.Quaternion.fromHeadingPitchRoll(
            new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(offset), 0, 0),
        );
        return Cesium.Quaternion.multiply(q, offsetQ, result || new Cesium.Quaternion());
    }, false);

    return { entity, baseOrientation };
}

/**
 * 导出已绘路线文件（geojson / kml / kmz）
 */
export function exportRouteFlyFile(Cesium: any, positions: any[], exportFormat: string) {
    if (!Cesium || positions.length < 2) throw new Error('NO_ROUTE');

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const name = `route-fly-${stamp}`;
    const cartos = positions.map((p) => Cesium.Cartographic.fromCartesian(p));

    if (exportFormat === 'geojson') {
        const geojson = {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    properties: { name, createdAt: new Date().toISOString() },
                    geometry: {
                        type: 'LineString',
                        coordinates: cartos.map((c) => [
                            Number(Cesium.Math.toDegrees(c.longitude).toFixed(8)),
                            Number(Cesium.Math.toDegrees(c.latitude).toFixed(8)),
                            Number(c.height.toFixed(2)),
                        ]),
                    },
                },
            ],
        };
        downloadBlobFile(JSON.stringify(geojson, null, 2), `${name}.geojson`);
        return;
    }

    const kml = buildRouteKml(Cesium, name, cartos);
    if (exportFormat === 'kml') {
        downloadBlobFile(kml, `${name}.kml`);
        return;
    }
    const zip = new JSZip();
    zip.file(`${name}.kml`, kml);
    zip.generateAsync({ type: 'blob' }).then((blob) => downloadBlobFile(blob, `${name}.kmz`));
}

/**
 * 解析导入的路线文件并返回 Cartographic 数组
 */
export async function parseImportedRouteFlyFile(Cesium: any, file: any) {
    if (!Cesium || !file) throw new Error('IMPORT_FAILED');

    const ext = String(file.name || '').split('.').pop()?.toLowerCase() ?? '';
    let text;
    try {
        if (ext === 'kmz') {
            const zip = await JSZip.loadAsync(file);
            const kmlEntry = Object.keys(zip.files).find((n) =>
                n.toLowerCase().endsWith('.kml'),
            );
            if (!kmlEntry) throw new Error('IMPORT_EMPTY');
            text = await zip.files[kmlEntry].async('string');
        } else {
            text = await file.text();
        }
    } catch (e) {
        if (e instanceof Error && e.message === 'IMPORT_EMPTY') throw e;
        throw new Error('IMPORT_FAILED', { cause: e });
    }

    const cartographics =
        ext === 'json' || ext === 'geojson'
            ? parseRouteJson(Cesium, text)
            : parseRouteKml(Cesium, text);
    if (cartographics.length < 2) throw new Error('IMPORT_EMPTY');
    return cartographics;
}

/**
 * 飞行跟随单帧相机解算与定位
 */
export function applyRouteFlyFollowTick({
    viewer,
    Cesium,
    entity,
    isFirstPerson,
    params,
    baselineFlyHeight,
    viewHeading,
    viewPitch,
    viewDistance,
}: {
    viewer: any;
    Cesium: any;
    entity: any;
    isFirstPerson: boolean;
    params: any;
    baselineFlyHeight: number | null;
    viewHeading: number;
    viewPitch: number;
    viewDistance: number;
}) {
    if (!viewer || !Cesium || !entity) return;

    if (entity?.model && Cesium.defined(entity.model.show)) {
        const show = !isFirstPerson && params.showModel !== false;
        if (entity.model.show !== show) entity.model.show = show;
    }

    let center = entity.position.getValue(viewer.clock.currentTime);
    if (!center) return;

    const current = Number(params.flyHeight) || 0;
    if (baselineFlyHeight != null && current !== baselineFlyHeight) {
        const carto = Cesium.Cartographic.fromCartesian(center);
        carto.height += current - baselineFlyHeight;
        center = Cesium.Cartesian3.fromRadians(
            carto.longitude,
            carto.latitude,
            carto.height,
            viewer.scene.globe.ellipsoid,
        );
    }

    viewer.camera.setView({
        destination: center,
        orientation: {
            heading: Cesium.Math.toRadians(viewHeading),
            pitch: Cesium.Math.toRadians(viewPitch),
            roll: 0,
        },
    });

    const dist = Math.max(0, Number(viewDistance) || 0);
    if (dist > 0.01) {
        const backward =
            viewer.camera.directionNegated ??
            Cesium.Cartesian3.negate(viewer.camera.direction, new Cesium.Cartesian3());
        viewer.camera.setView({
            destination: Cesium.Cartesian3.add(
                center,
                Cesium.Cartesian3.multiplyByScalar(backward, dist, new Cesium.Cartesian3()),
                new Cesium.Cartesian3(),
            ),
            orientation: {
                heading: Cesium.Math.toRadians(viewHeading),
                pitch: Cesium.Math.toRadians(viewPitch),
                roll: 0,
            },
        });
    }
}

/**
 * 构建绘制期双线（已确认贴地段 + 橡皮筋虚线）
 */
export function createRouteDrawLines({
    Cesium,
    dataSource,
    getPositions,
    isDrawing,
    getMovingPosition,
}: {
    Cesium: any;
    dataSource: any;
    getPositions: () => any[];
    isDrawing: () => boolean;
    getMovingPosition: () => any;
}) {
    const committedLine = dataSource.entities.add({
        polyline: {
            positions: new Cesium.CallbackProperty(() => getPositions().slice(), false),
            clampToGround: true,
            width: 3,
            material: Cesium.Color.fromCssColorString('#00e5ff'),
            depthFailMaterial: Cesium.Color.fromCssColorString('#00e5ff').withAlpha(0.35),
        },
    });

    const previewLine = dataSource.entities.add({
        polyline: {
            positions: new Cesium.CallbackProperty(() => {
                const positions = getPositions();
                const last = positions[positions.length - 1];
                const movingPos = getMovingPosition();
                if (isDrawing() && movingPos && last) {
                    return [last, movingPos];
                }
                return undefined;
            }, false),
            clampToGround: true,
            width: 2,
            material: Cesium.Color.CYAN.withAlpha(0.85),
            depthFailMaterial: Cesium.Color.CYAN.withAlpha(0.4),
        },
    });

    return { committedLine, previewLine };
}
