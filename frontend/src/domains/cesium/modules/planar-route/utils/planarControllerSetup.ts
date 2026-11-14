import type { Ref } from 'vue';
import type Cesium from 'cesium';
import globeConfig, { PLANAR_SPEED_HARD_MAX } from '../config/planarConfig';
import type { PolygonDrawingResult } from '../utils/drawPolygon';
import { LineAngleHandler } from '../composables/useLineAngle';
import { KmzImportHandler, type PlannedRouteData } from '../composables/useKmzImport';
import { RouteRenderer } from '../composables/useCesiumRenderer';
import {
    connectTakeoffToFirstWaypoint,
    calculateRoutePhotoCount,
    flattenRouteCoordinates,
} from '../composables/useRouteCalc';
import type { PolygonAreaEditor } from '../composables/usePolygonAreaEditor';

export interface PlanarSubHandlersHost {
    isImporting: Ref<boolean>;
    hasRoute: Ref<boolean>;
    getEntityObjPolygonObj: () => PolygonDrawingResult | null;
    setEntityObjPolygonObj: (v: PolygonDrawingResult | null) => void;
    getRouteCalculationVersion: () => number;
    bumpVersion: () => number;
    getDrawDataSource: () => Cesium.CustomDataSource | null;
    getLineAngleIndicatorHeight: () => number;
    setLineAngleIndicatorHeight: (v: number) => void;
    clearCurrentRouteState: (preserveTakeoff: boolean) => void;
    areaEditor: PolygonAreaEditor;
    applyPlannedRoutes: (routes: PlannedRouteData[], photoDistance: number) => void;
    recalculateRoute: () => Promise<void>;
}

export function createPlanarSubHandlers(host: PlanarSubHandlersHost) {
    const routeRenderer = new RouteRenderer({
        get drawDataSource() {
            return host.getDrawDataSource();
        },
        get routeCalculationVersion() {
            return host.getRouteCalculationVersion();
        },
        hasRoute: host.hasRoute,
        setLineAngleIndicatorHeight: (v) => host.setLineAngleIndicatorHeight(v),
    });

    const lineAngleHandler = new LineAngleHandler({
        get drawDataSource() {
            return host.getDrawDataSource();
        },
        get entityObjPolygonObj() {
            return host.getEntityObjPolygonObj();
        },
        get lineAngleIndicatorHeight() {
            return host.getLineAngleIndicatorHeight();
        },
        recalculateRoute: () => host.recalculateRoute(),
    });

    const kmzImporter = new KmzImportHandler({
        isImporting: host.isImporting,
        get entityObjPolygonObj() {
            return host.getEntityObjPolygonObj();
        },
        hasRoute: host.hasRoute,
        get routeCalculationVersion() {
            return host.getRouteCalculationVersion();
        },
        get isLineAngleManual() {
            return lineAngleHandler.isLineAngleManual;
        },
        setEntityObjPolygonObj: (v) => host.setEntityObjPolygonObj(v),
        setIsLineAngleManual: (v) => {
            lineAngleHandler.isLineAngleManual = v;
        },
        bumpVersion: () => host.bumpVersion(),
        clearCurrentRouteState: (p) => host.clearCurrentRouteState(p),
        setupPolygonSubscriber: () => host.areaEditor.setupSubscriber(),
        enablePolygonRightClick: () => {
            host.areaEditor.enableRightClick();
        },
        applyPlannedRoutes: (r, p) => host.applyPlannedRoutes(r, p),
        waitForRoutePreviewReady: (v) => routeRenderer.waitForRoutePreviewReady(v),
        connectTakeoffToFirstWaypoint: (s) => connectTakeoffToFirstWaypoint(s),
        calculateRoutePhotoCount: (s, d, g) => calculateRoutePhotoCount(s, d, g),
        flattenRouteCoordinates: (s) => flattenRouteCoordinates(s),
    });

    return {
        kmzImporter,
        routeRenderer,
        lineAngleHandler,
    };
}

export function resetPlanarGlobeStats(preserveTakeoff: boolean) {
    globeConfig.area = 0;
    globeConfig.lineLength = 0;
    globeConfig.takeoffClimbLength = 0;
    globeConfig.photoCount = 0;
    globeConfig.linesArrs = [];
    globeConfig.routeLinesArrs = [];
    globeConfig.polygonPositions = [];
    if (!preserveTakeoff) {
        globeConfig.flyPosition = null;
        globeConfig.isSetTakeoffPoint = false;
    }
}

export function applyNumericPlanarParam(
    controlId: string,
    value: unknown,
    lineAngleHandler: LineAngleHandler,
): boolean {
    switch (controlId) {
        case 'heightType':
            globeConfig.heightType = Number(value);
            return true;
        case 'lineHeight':
            globeConfig.lineHeight = Math.min(1500, Math.max(2, Number(value)));
            return true;
        case 'speed':
            globeConfig.speed = Math.min(PLANAR_SPEED_HARD_MAX, Math.max(1, Number(value)));
            return true;
        case 'takeoffSpeed':
            globeConfig.takeoffSpeed = Math.min(15, Math.max(1, Number(value)));
            return true;
        case 'overlapW':
            globeConfig.overlapW = Math.min(90, Math.max(10, Number(value)));
            return true;
        case 'overlapH':
            globeConfig.overlapH = Math.min(90, Math.max(10, Number(value)));
            return true;
        case 'gimbalPitch':
            globeConfig.smartObliqueGimbalPitch = Math.min(-40, Math.max(-85, Number(value)));
            return true;
        case 'lineAngle': {
            const next = Math.min(179, Math.max(0, Number(value)));
            if (Number(globeConfig.lineAngle) === next) {
                return false;
            }
            globeConfig.lineAngle = next;
            lineAngleHandler.isLineAngleManual = true;
            return true;
        }
        case 'photoTriggerMode':
            globeConfig.photoTriggerMode = value === 'distance' ? 'distance' : 'time';
            return true;
        default:
            return false;
    }
}
