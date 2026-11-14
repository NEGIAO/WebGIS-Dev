/**
 * 功能名称：Cesium 三维场景对外门面与交互 Composable
 * 说    明：封装视角状态读取与静止等待（集成 useTimerRegistry）、底图预设切换、
 *           行政区边界定位、逆地理编码选点标注、统一数据导入与拖拽投放及相机快捷操作。
 */
import { nextTick, ref, type Ref } from 'vue';
import { getUrlLayerNumberByBasemapId } from '@common/basemap/basemapOptions';
import { TOC_LAYER_DRAG_MIME } from '@common/layer-tree/protocol';
import { getCesiumGroundResolution } from '@common/utils/viewScale/browserAdapter';
import { useTimerRegistry } from '@common/composables/useTimerRegistry';

export interface UseCesiumSceneFacadeDeps {
    getCesium: () => any;
    getViewer: () => any;
    emit: (event: any, ...args: any[]) => void;
    message: any;
    cesiumReady: Ref<boolean>;
    activeBasemap: Ref<string>;
    basemapOptions: Ref<any[]>;
    layers: any;
    syncBasemapToUrl: (payload: any) => void;
    dataImport: any;
    handleDataImport: (payload: any) => Promise<any>;
}

function transformGcj02Coords(coords: any, gcj02ToWgs84: (lng: number, lat: number) => number[]): any {
    if (!Array.isArray(coords)) return coords;
    if (coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
        const [lon, lat] = gcj02ToWgs84(coords[0], coords[1]);
        return [lon, lat, ...(coords.length > 2 ? coords.slice(2) : [])];
    }
    return coords.map((item) => transformGcj02Coords(item, gcj02ToWgs84));
}

function transformGcj02Geometry(geom: any, gcj02ToWgs84: (lng: number, lat: number) => number[]): any {
    if (!geom || typeof geom !== 'object') return geom;
    if (geom.type === 'GeometryCollection') {
        return {
            ...geom,
            geometries: (geom.geometries || []).map((g: any) => transformGcj02Geometry(g, gcj02ToWgs84)),
        };
    }
    if ('coordinates' in geom) {
        return { ...geom, coordinates: transformGcj02Coords(geom.coordinates, gcj02ToWgs84) };
    }
    return geom;
}

export function useCesiumSceneFacade(deps: UseCesiumSceneFacadeDeps) {
    const {
        getCesium,
        getViewer,
        emit,
        message,
        cesiumReady,
        activeBasemap,
        basemapOptions,
        layers,
        syncBasemapToUrl,
        dataImport,
        handleDataImport,
    } = deps;

    const { later } = useTimerRegistry();

    /**
     * Capture the Cesium camera and basemap directly from the runtime.
     */
    function getCurrentViewState(): Record<string, any> | null {
        const runtimeViewer = getViewer();
        const runtimeCesium = getCesium();
        const camera = runtimeViewer?.camera;
        const position = camera?.positionCartographic;
        if (!runtimeViewer || !runtimeCesium || !camera || !position) return null;

        const basemapId = String(activeBasemap.value || '').trim() || null;
        const layerIndex = basemapId ? getUrlLayerNumberByBasemapId(basemapId) : null;
        const basemapLabel = basemapId
            ? basemapOptions.value.find((option) => option.value === basemapId)?.label || basemapId
            : null;

        return {
            view: 'cesium',
            center: {
                lng: runtimeCesium.Math.toDegrees(position.longitude),
                lat: runtimeCesium.Math.toDegrees(position.latitude),
            },
            cesium: {
                cameraHeight: position.height,
                heading: runtimeCesium.Math.toDegrees(camera.heading),
                pitch: runtimeCesium.Math.toDegrees(camera.pitch),
                roll: runtimeCesium.Math.toDegrees(camera.roll),
            },
            basemap: {
                index: Number.isInteger(layerIndex) ? layerIndex : null,
                id: basemapId,
                label: basemapLabel,
            },
        };
    }

    /**
     * Wait until consecutive Cesium camera samples remain stable.
     */
    function waitForViewIdle({
        timeoutMs = 2500,
        stableMs = 120,
    }: { timeoutMs?: number; stableMs?: number } = {}): Promise<{ status: 'idle' | 'timeout' | 'destroyed' }> {
        return new Promise((resolve) => {
            const startedAt = Date.now();
            let previousSignature: number[] | null = null;
            let stableSince: number | null = null;

            const check = () => {
                const runtimeViewer = getViewer();
                if (!runtimeViewer || runtimeViewer.isDestroyed?.()) {
                    resolve({ status: 'destroyed' });
                    return;
                }

                const state = getCurrentViewState();
                if (!state?.center || !state.cesium) {
                    resolve({ status: 'destroyed' });
                    return;
                }

                const signature = [
                    state.center.lng,
                    state.center.lat,
                    state.cesium.cameraHeight,
                    state.cesium.heading,
                    state.cesium.pitch,
                    state.cesium.roll,
                ];
                const stable =
                    !!previousSignature &&
                    signature.every((value, index) => {
                        const tolerance = index === 2 ? 0.05 : index < 2 ? 0.0000001 : 0.005;
                        return Math.abs(value - previousSignature![index]) <= tolerance;
                    });

                const now = Date.now();
                if (stable) {
                    stableSince ??= now;
                    if (now - stableSince >= stableMs) {
                        resolve({ status: 'idle' });
                        return;
                    }
                } else {
                    stableSince = null;
                }
                previousSignature = signature;

                if (now - startedAt >= timeoutMs) {
                    resolve({ status: 'timeout' });
                    return;
                }
                later(check, 32);
            };

            check();
        });
    }

    async function setBasemapById(presetId: string): Promise<boolean> {
        const normalizedPresetId = String(presetId || '').trim();
        const exists = basemapOptions.value.some((option) => option.value === normalizedPresetId);
        if (!exists || !getViewer() || !getCesium()) return false;

        if (activeBasemap.value === normalizedPresetId) {
            const applied = layers.applyBasemap(normalizedPresetId);
            if (applied) {
                syncBasemapToUrl({ id: normalizedPresetId, source: 'preset' });
            }
            return !!applied;
        }

        activeBasemap.value = normalizedPresetId;
        await nextTick();
        return activeBasemap.value === normalizedPresetId;
    }

    async function focusDistrictByAdcode(payload: any = {}): Promise<boolean> {
        const adcode = String(payload?.adcode || payload?.value || '').trim();
        const districtName = String(payload?.name || payload?.label || '').trim() || `行政区-${adcode}`;

        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer) {
            message.warning('Cesium 尚未初始化');
            return false;
        }

        const { gcj02ToWgs84 } = await import('@common/data-import/crs/coordTransform');
        const endpoint = 'https://geo.datav.aliyun.com/areas_v3/bound';
        const sourceUrl = `${endpoint}/${adcode}.json`;

        try {
            const response = await fetch(sourceUrl, {
                method: 'GET',
                referrerPolicy: 'no-referrer',
            });

            if (!response.ok) {
                message.warning(`行政区边界请求失败（${response.status}）`);
                return false;
            }

            const rawGeoJSON = await response.json();
            const features = Array.isArray(rawGeoJSON?.features)
                ? rawGeoJSON.features
                : rawGeoJSON?.type === 'Feature'
                  ? [rawGeoJSON]
                  : [];

            if (!features.length) {
                message.warning('当前行政区没有可绘制边界要素');
                return false;
            }

            const wgs84GeoJSON = {
                type: 'FeatureCollection',
                features: features.map((f: any) => ({
                    ...f,
                    geometry: transformGcj02Geometry(f?.geometry, gcj02ToWgs84),
                })),
            };

            const dataSource = await Cesium.GeoJsonDataSource.load(wgs84GeoJSON, {
                clampToGround: true,
                stroke: Cesium.Color.fromCssColorString('#21bcff'),
                fill: Cesium.Color.fromCssColorString('#21bcff').withAlpha(0.15),
                markerColor: Cesium.Color.fromCssColorString('#21bcff'),
                markerSize: 24,
            });

            dataSource.name = districtName;
            await viewer.dataSources.add(dataSource);

            if (dataImport?.registerExternalDataSource) {
                dataImport.registerExternalDataSource({
                    name: districtName,
                    entity: dataSource,
                    type: 'geojson',
                });
            }

            const entities = dataSource.entities.values;
            if (entities.length) {
                await viewer.flyTo(entities, {
                    duration: 1.2,
                    maximumHeight: 50000,
                });
            }

            message.success(`已定位到行政区：${districtName}`);
            return true;
        } catch (error: any) {
            console.error('[Cesium] 行政区加载失败:', error);
            message.error(`行政区加载失败: ${error?.message || error}`);
            return false;
        }
    }

    // ────────────────────────── 逆地理编码标注（地图选点） ──────────────────────────
    const isReverseGeocodePickMode = ref(false);
    let reverseGeocodeClickHandler: (() => void) | null = null;

    function cleanupReverseGeocodePick(): void {
        isReverseGeocodePickMode.value = false;
        if (reverseGeocodeClickHandler) {
            reverseGeocodeClickHandler();
            reverseGeocodeClickHandler = null;
        }
    }

    async function toggleReverseGeocodePick(): Promise<void> {
        if (isReverseGeocodePickMode.value) {
            cleanupReverseGeocodePick();
            message.info('已退出标注模式');
            return;
        }

        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer) {
            message.warning('Cesium 尚未初始化');
            return;
        }

        isReverseGeocodePickMode.value = true;
        message.info('请在地球上单击一个点，系统将自动逆地理编码并绘制。', {
            closable: true,
            duration: 4500,
        });

        const { apiReverseGeocodeWithFallback } = await import('@/api');
        if (!isReverseGeocodePickMode.value) return;

        const canvas = viewer.scene.canvas;
        const handler = new Cesium.ScreenSpaceEventHandler(canvas);
        reverseGeocodeClickHandler = () => {
            if (!handler.isDestroyed?.()) handler.destroy();
        };

        handler.setInputAction(async (click: any) => {
            cleanupReverseGeocodePick();

            try {
                const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
                let lng: number;
                let lat: number;

                if (cartesian) {
                    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                    lng = Cesium.Math.toDegrees(cartographic.longitude);
                    lat = Cesium.Math.toDegrees(cartographic.latitude);
                } else {
                    const ray = viewer.camera.getPickRay(click.position);
                    const globePos = viewer.scene.globe.pick(ray, viewer.scene);
                    if (!globePos) {
                        message.warning('无法获取点击位置的坐标');
                        return;
                    }
                    const cartographic = Cesium.Cartographic.fromCartesian(globePos);
                    lng = Cesium.Math.toDegrees(cartographic.longitude);
                    lat = Cesium.Math.toDegrees(cartographic.latitude);
                }

                let reverseResult: any = null;
                try {
                    const reverseResponse = await apiReverseGeocodeWithFallback(lng, lat, { silent: true });
                    reverseResult = reverseResponse?.data || null;
                } catch {
                    reverseResult = null;
                }

                const formattedAddress = String(reverseResult?.formattedAddress || '').trim();
                const label = formattedAddress || `标注点_${lng.toFixed(6)}_${lat.toFixed(6)}`;

                const markDataSource = new Cesium.CustomDataSource(label);
                markDataSource.entities.add({
                    position: Cesium.Cartesian3.fromDegrees(lng, lat, 0),
                    point: {
                        pixelSize: 12,
                        color: Cesium.Color.fromCssColorString('#21bcff'),
                        outlineColor: Cesium.Color.WHITE,
                        outlineWidth: 2,
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    },
                    label: {
                        text: label,
                        font: '600 13px "Microsoft YaHei", sans-serif',
                        fillColor: Cesium.Color.WHITE,
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 3,
                        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                        pixelOffset: new Cesium.Cartesian2(0, -16),
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    },
                    properties: {
                        来源: '逆地理编码标注',
                        地址: formattedAddress || '未解析',
                        经度: lng,
                        纬度: lat,
                        省: String(reverseResult?.province || '').trim() || '未知',
                        市: String(reverseResult?.city || '').trim() || '未知',
                        区县: String(reverseResult?.district || '').trim() || '未知',
                    },
                });
                await viewer.dataSources.add(markDataSource);

                if (dataImport?.registerExternalDataSource) {
                    dataImport.registerExternalDataSource({
                        name: label,
                        entity: markDataSource,
                        type: 'geojson',
                    });
                }

                if (formattedAddress) {
                    message.success(`逆地理编码成功：${formattedAddress}`);
                } else {
                    message.info('已放置标注点（逆地理编码未返回结果）');
                }
            } catch (error: any) {
                console.error('[Cesium] 逆地理编码选点失败:', error);
                message.warning(`逆地理编码选点失败: ${error?.message || error}`);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    /**
     * 统一导入入口（3D 模式下 SidePanel 上传/共享资源/拖拽的落点）
     */
    async function importUserData(data: {
        resources?: File[];
        name?: string;
        overrideCrs?: string;
        silent?: boolean;
    }): Promise<any> {
        const files = Array.isArray(data?.resources) ? data.resources : [];
        if (!files.length) return null;
        const beforeIds = new Set(dataImport.loadedDataSources.value.map((item: any) => item.id));
        await handleDataImport({
            files,
            overrideCrs: data?.overrideCrs || '',
            silent: !!data?.silent,
        });
        return dataImport.loadedDataSources.value.find((item: any) => !beforeIds.has(item.id)) || null;
    }

    // ────────────────────────── 拖拽文件/图层导入 ──────────────────────────
    const isDragOver = ref(false);

    function onDragOver(event: DragEvent): void {
        isDragOver.value = true;
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
        }
    }

    function onDragLeave(event: DragEvent): void {
        const related = event?.relatedTarget;
        const current = event?.currentTarget;
        if (related instanceof Node && current instanceof Node && current.contains(related)) {
            return;
        }
        isDragOver.value = false;
    }

    async function onDrop(event: DragEvent): Promise<void> {
        isDragOver.value = false;
        if (!cesiumReady.value) return;

        const transfer = event.dataTransfer;
        const hasFiles = !!transfer?.files?.length;
        if (!hasFiles && Array.from(transfer?.types || []).includes(TOC_LAYER_DRAG_MIME)) {
            const layerId = String(transfer?.getData(TOC_LAYER_DRAG_MIME) || '').trim();
            if (layerId && !layerId.startsWith('cesium:') && !layerId.startsWith('rsvc:')) {
                emit('drop-ol-layer', { layerId });
            }
            return;
        }

        const files = transfer?.files;
        if (!files || files.length === 0) return;

        try {
            await dataImport.loadDataFiles(Array.from(files));
        } catch (err) {
            console.warn('[Cesium] file import error:', err);
        }
    }

    // ────────────────────────── Precision 校准与常用地点视口操作 ──────────────────────────
    function jumpTo(lng: number, lat: number, heightMeters?: number): boolean {
        const v = getViewer();
        const C = getCesium();
        if (!v?.camera || !C || !Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) {
            return false;
        }
        v.camera.flyTo({
            destination: C.Cartesian3.fromDegrees(
                Number(lng),
                Number(lat),
                Math.max(1, Number(heightMeters) || 1),
            ),
            duration: 1.2,
        });
        return true;
    }

    function measureGroundResolution(): number | null {
        return getCesiumGroundResolution(getViewer())?.groundResolution ?? null;
    }

    function getCameraHeight(): number | null {
        const v = getViewer();
        const h = v?.camera?.positionCartographic?.height;
        return Number.isFinite(h) ? h : null;
    }

    function setCameraHeightKeepOrientation(heightMeters: number): void {
        const v = getViewer();
        const C = getCesium();
        if (!v?.camera || !C || !Number.isFinite(Number(heightMeters))) return;
        const carto = C.Cartographic.fromCartesian(v.camera.position);
        if (!carto) return;
        v.camera.setView({
            destination: C.Cartesian3.fromRadians(
                carto.longitude,
                carto.latitude,
                Number(heightMeters),
            ),
            orientation: {
                heading: v.camera.heading,
                pitch: v.camera.pitch,
                roll: v.camera.roll,
            },
        });
    }

    return {
        getCurrentViewState,
        waitForViewIdle,
        setBasemapById,
        focusDistrictByAdcode,
        isReverseGeocodePickMode,
        toggleReverseGeocodePick,
        cleanupReverseGeocodePick,
        importUserData,
        isDragOver,
        onDragOver,
        onDragLeave,
        onDrop,
        jumpTo,
        measureGroundResolution,
        getCameraHeight,
        setCameraHeightKeepOrientation,
    };
}
