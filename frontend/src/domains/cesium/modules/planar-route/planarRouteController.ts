/**
 * planarRouteController.ts — 面状航线无头运行时控制器
 *
 * 从浮层页方案 PlanarRoute.ts 迁移：剥离 Vue 组件与 Element Plus UI，
 * 由 toolPanel 模块卡片（PlanarRouteModule.js + LilGuiControls）驱动。
 * 职责：装配子处理器 + 生命周期 / 参数下发 / 状态快照；
 *       测区交互见 composables/usePolygonAreaEditor、航线计算见 utils/planarRoutePlanner、
 *       KMZ 存取见 utils/planarRouteKmzIO。
 */
import { ref } from 'vue';
import Cesium from 'cesium';
import { useMessage } from '@common/shell/useMessage';
import { translate as t } from '@common/app/useLocale';
import globeConfig from './config/planarConfig';
import { PolygonDrawingResult } from './utils/drawPolygon';
import { addStartPoint, calculateArea, cancelStartPointPick, hideStartPointTip } from './utils/planarLine';
import type { FiveDirectionRouteKey } from './utils/obliqueRoute';
import type { LineAngleHandler } from './composables/useLineAngle';
import type { KmzImportHandler, PlannedRouteData as KmzPlannedRouteData } from './composables/useKmzImport';
import type { RouteRenderer } from './composables/useCesiumRenderer';
import { PolygonAreaEditor } from './composables/usePolygonAreaEditor';
import { PlanarRouteKmzIO } from './utils/planarRouteKmzIO';
import { planPlanarRoutes } from './utils/planarRoutePlanner';
import {
	applyNumericPlanarParam,
	createPlanarSubHandlers,
	resetPlanarGlobeStats,
} from './utils/planarControllerSetup';

/** 全局消息提示（项目自有 toast，替代源工程 ElMessage） */
const message = useMessage();

interface RouteSummary {
	id: number;
	key: FiveDirectionRouteKey;
	label: string;
	totalLength: number;
	climbLength: number;
	photoCount: number;
}

type PlannedRouteData = KmzPlannedRouteData;

/** 控制器上报给模块卡片的状态快照（PlanarRouteModule.js 据此渲染 status/options/disabled） */
export interface PlanarRouteSnapshot {
	hasRoute: boolean;
	isCalculating: boolean;
	isImporting: boolean;
	pickingTakeoff: boolean;
	activeRouteIndex: number;
	routeOptions: Array<{ label: string; value: number }>;
	routeName: string;
}

export type PlanarRouteSnapshotPatch = Partial<PlanarRouteSnapshot>;

export interface PlanarRouteControllerOptions {
	getViewer: () => Cesium.Viewer | null;
	onStateChange?: (patch: PlanarRouteSnapshotPatch) => void;
	onWorkingSetChange?: (info: { present: boolean; name: string; dataSource: Cesium.CustomDataSource | null }) => void;
}

export class PlanarRouteController {
	private options: PlanarRouteControllerOptions;

	// ========== 响应式状态（上报源） ==========
	hasRoute = ref(false);
	isCalculating = ref(false);
	isImporting = ref(false);
	pickingTakeoff = ref(false);
	activeRouteIndex = ref(0);
	routeSummaries = ref<RouteSummary[]>([]);
	routeName = ref('');

	// ========== 内部绘制状态 ==========
	private flyPot: Cesium.Cartesian3 | null = null;
	private routeCalculationVersion = 0;
	private photoDistance = 0;
	private plannedRoutes: PlannedRouteData[] = [];
	private entityObjPolygonObj: PolygonDrawingResult | null = null;
	private drawDataSource: Cesium.CustomDataSource | null = null;
	private lineAngleIndicatorHeight = 0;
	private boundViewer: Cesium.Viewer | null = null;
	private workingSetRegistered = false;

	private areaEditor: PolygonAreaEditor;
	private kmzIO: PlanarRouteKmzIO;
	private kmzImporter!: KmzImportHandler;
	private lineAngleHandler!: LineAngleHandler;
	private routeRenderer!: RouteRenderer;

	constructor(options: PlanarRouteControllerOptions) {
		this.options = options;
		this.areaEditor = new PolygonAreaEditor({
			getViewer: () => window.mainViewer ?? null,
			getEntity: () => this.entityObjPolygonObj,
			setEntity: (value) => {
				this.entityObjPolygonObj = value;
			},
			onAreaUpdated: () => this.updatePolygonArea(),
			onStateChange: () => this.emitState(),
			requestRecalculate: () => {
				void this.recalculateRoute();
			},
			requestDelete: () => this.delPoy(),
			resetLineAngleManual: () => {
				this.lineAngleHandler.isLineAngleManual = false;
			},
		});
		const subHandlers = createPlanarSubHandlers({
			isImporting: this.isImporting,
			hasRoute: this.hasRoute,
			getEntityObjPolygonObj: () => this.entityObjPolygonObj,
			setEntityObjPolygonObj: (v) => {
				this.entityObjPolygonObj = v;
			},
			getRouteCalculationVersion: () => this.routeCalculationVersion,
			bumpVersion: () => ++this.routeCalculationVersion,
			getDrawDataSource: () => this.drawDataSource,
			getLineAngleIndicatorHeight: () => this.lineAngleIndicatorHeight,
			setLineAngleIndicatorHeight: (v) => {
				this.lineAngleIndicatorHeight = v;
			},
			clearCurrentRouteState: (p) => this.clearCurrentRouteState(p),
			areaEditor: this.areaEditor,
			applyPlannedRoutes: (r, p) => this.applyPlannedRoutes(r, p),
			recalculateRoute: () => this.recalculateRoute(),
		});
		this.kmzImporter = subHandlers.kmzImporter;
		this.routeRenderer = subHandlers.routeRenderer;
		this.lineAngleHandler = subHandlers.lineAngleHandler;
		this.kmzIO = new PlanarRouteKmzIO({
			isImporting: this.isImporting,
			hasRoute: this.hasRoute,
			kmzImporter: this.kmzImporter,
			getPolygonPositions: () => this.entityObjPolygonObj?.polygonPositions ?? null,
			getPlannedRoutes: () => this.plannedRoutes,
			getPhotoDistance: () => this.photoDistance,
			getRouteName: () => this.routeName.value,
			setRouteName: (name) => {
				this.routeName.value = name;
			},
			isObliqueMode: () => this.isObliqueMode,
			onStateChange: () => this.emitState(),
		});
	}

	/** 是否为倾斜采集（五向航线）模式 */
	get isObliqueMode(): boolean {
		return Number(globeConfig.climbType) === 2;
	}

	//#region 生命周期

	bind(viewer: Cesium.Viewer): void {
		if (this.boundViewer === viewer && this.drawDataSource) {
			return;
		}
		if (this.boundViewer !== viewer) {
			this.destroy();
		}
		window.mainViewer = viewer;
		this.boundViewer = viewer;
		this.drawDataSource = new Cesium.CustomDataSource('drawDataSource');
		void viewer.dataSources.add(this.drawDataSource);
		this.drawDataSource.show = true;
		this.areaEditor.ensureDeleteButton(viewer);
		viewer.scene.requestRender();
		this.emitState();
	}

	destroy(): void {
		this.unregisterWorkingSet();
		this.routeCalculationVersion++;
		this.routeRenderer.cancelRoutePreviewReadyWait();
		this.kmzImporter.cancelImportedTerrainCorrection();
		this.areaEditor.dispose();
		this.lineAngleHandler.teardownSliderInteraction();
		this.lineAngleHandler.cancelIndicatorHide();
		this.cancelTakeoffPointSelection();
		const viewer = window.mainViewer ?? this.boundViewer;
		if (viewer && this.drawDataSource) {
			void viewer.dataSources.remove(this.drawDataSource, true);
		}
		this.drawDataSource = null;
		document.getElementById('planar-kinks-tip')?.remove();
		this.entityObjPolygonObj = null;
		this.plannedRoutes = [];
		this.flyPot = null;
		this.photoDistance = 0;
		this.lineAngleIndicatorHeight = 0;
		this.hasRoute.value = false;
		this.routeSummaries.value = [];
		this.activeRouteIndex.value = 0;
		this.isCalculating.value = false;
		this.isImporting.value = false;
		this.boundViewer = null;
		if (window.mainViewer === viewer) {
			window.mainViewer = null;
		}
		this.emitState();
	}

	emitState(): void {
		this.options.onStateChange?.({
			hasRoute: this.hasRoute.value,
			isCalculating: this.isCalculating.value,
			isImporting: this.isImporting.value,
			pickingTakeoff: this.pickingTakeoff.value,
			activeRouteIndex: this.activeRouteIndex.value,
			routeOptions: this.routeSummaries.value.map((route, index) => ({
				label: route.label || String(route.id),
				value: index,
			})),
			routeName: this.routeName.value,
		});
	}

	private ensureWorkingSetRegistered(): void {
		if (this.workingSetRegistered || !this.drawDataSource) {
			return;
		}
		this.workingSetRegistered = true;
		this.options.onWorkingSetChange?.({
			present: true,
			name: this.resolveWorkingSetName(),
			dataSource: this.drawDataSource,
		});
	}

	private unregisterWorkingSet(): void {
		if (!this.workingSetRegistered) {
			return;
		}
		this.workingSetRegistered = false;
		this.options.onWorkingSetChange?.({ present: false, name: '', dataSource: null });
	}

	private resolveWorkingSetName(): string {
		let name = this.routeName.value.trim();
		if (!name) name = (sessionStorage.getItem('aircraftName') || '').trim();
		if (!name) name = t('cesium.module.planarRoute.msg.defaultRouteName');
		return name;
	}

	detachForExternalRemoval(): void {
		this.routeCalculationVersion++;
		this.kmzImporter.cancelImportedTerrainCorrection();
		this.cancelTakeoffPointSelection();
		this.areaEditor.reset();
		this.lineAngleHandler.teardownSliderInteraction();
		this.lineAngleHandler.hideIndicator();
		document.getElementById('planar-kinks-tip')?.remove();

		this.entityObjPolygonObj = null;
		this.plannedRoutes = [];
		this.flyPot = null;
		this.photoDistance = 0;
		this.lineAngleIndicatorHeight = 0;
		this.hasRoute.value = false;
		this.routeSummaries.value = [];
		this.activeRouteIndex.value = 0;
		this.isCalculating.value = false;
		resetPlanarGlobeStats(false);

		this.drawDataSource = null;
		this.boundViewer = null;
		this.unregisterWorkingSet();
		this.emitState();
	}

	//#endregion 生命周期 END

	//#region 业务逻辑 - 参考起飞点

	setTakeoffPicking(enabled: boolean): void {
		if (enabled && !window.mainViewer) {
			message.warning(t('cesium.module.planarRoute.msg.mapNotReady'));
			this.pickingTakeoff.value = false;
			this.emitState();
			return;
		}
		this.pickingTakeoff.value = enabled;
		if (!enabled) {
			this.cancelTakeoffPointSelection();
			if (this.entityObjPolygonObj) {
				this.areaEditor.setupSubscriber();
			} else if (this.flyPot) {
				this.drawWay(this.flyPot);
			}
			this.emitState();
			return;
		}

		const wasDrawingPolygon = this.areaEditor.suspendDrawing();
		if (wasDrawingPolygon) {
			this.drawDataSource?.entities.removeAll();
		}
		this.areaEditor.destroySubscriber();

		addStartPoint(window.mainViewer!, (position?: Cesium.Cartesian3) => {
			this.pickingTakeoff.value = false;
			if (position) {
				this.flyPot = position;
			}
			if (this.entityObjPolygonObj) {
				this.areaEditor.setupSubscriber();
				this.emitState();
				void this.recalculateRoute();
				return;
			}
			if (position) {
				this.drawWay(position);
			}
			this.emitState();
		});
		this.emitState();
	}

	private cancelTakeoffPointSelection(): void {
		this.pickingTakeoff.value = false;
		const viewer = window.mainViewer ?? this.boundViewer;
		if (viewer) {
			cancelStartPointPick(viewer);
		} else {
			hideStartPointTip();
		}
	}

	//#endregion 业务逻辑 - 参考起飞点 END

	//#region 业务逻辑 - 测区绘制与编辑

	drawWay = (position?: Cesium.Cartesian3) => {
		if (!position || !window.mainViewer) {
			message.error(t('cesium.module.planarRoute.msg.takeoffMissing'));
			return;
		}

		this.flyPot = position;
		this.areaEditor.startDrawing(window.mainViewer);
	};

	delPoy = () => {
		const restartPosition = this.flyPot ?? globeConfig.flyPosition;
		this.clearCurrentRouteState(true);
		if (restartPosition) {
			this.drawWay(restartPosition);
		}
	};

	private clearCurrentRouteState(preserveTakeoff: boolean): void {
		this.routeCalculationVersion++;
		this.kmzImporter.cancelImportedTerrainCorrection();
		this.cancelTakeoffPointSelection();
		this.areaEditor.reset();
		this.lineAngleHandler.teardownSliderInteraction();
		this.lineAngleHandler.hideIndicator();
		this.drawDataSource?.entities.removeAll();
		this.entityObjPolygonObj = null;
		this.routeRenderer.clearRoutePreview();
		this.plannedRoutes = [];
		this.routeSummaries.value = [];
		this.activeRouteIndex.value = 0;
		this.lineAngleHandler.isLineAngleManual = false;
		this.isCalculating.value = false;
		this.photoDistance = 0;
		this.lineAngleIndicatorHeight = 0;
		this.hasRoute.value = false;
		if (!preserveTakeoff) {
			this.flyPot = null;
		}
		resetPlanarGlobeStats(preserveTakeoff);
		this.emitState();
	}

	private updatePolygonArea(): void {
		const entity = this.entityObjPolygonObj;
		if (!entity) {
			return;
		}
		const positions = entity.polygonPositions;
		globeConfig.polygonPositions = positions;
		globeConfig.area = Number(calculateArea(positions).toFixed(2));
	}

	//#endregion 业务逻辑 - 测区绘制与编辑 END

	//#region 业务逻辑 - 参数下发（面板控件 → 配置）

	setParam(controlId: string, value: unknown): void {
		switch (controlId) {
			case 'setTakeoff':
				this.setTakeoffPicking(Boolean(value));
				return;
			case 'climbType':
				this.updateClimbType(Number(value));
				return;
			case 'activeRoute':
				this.selectObliqueRoute(Number(value));
				return;
			case 'routeName':
				this.routeName.value = String(value ?? '');
				this.emitState();
				return;
			default:
				break;
		}
		if (applyNumericPlanarParam(controlId, value, this.lineAngleHandler)) {
			void this.recalculateRoute();
		}
	}

	private updateClimbType(value: number): void {
		if (Number(globeConfig.climbType) === value) {
			return;
		}
		globeConfig.climbType = value;
		if (value === 2) {
			this.lineAngleHandler.isLineAngleManual = false;
		}
		this.activeRouteIndex.value = 0;
		void this.recalculateRoute();
	}

	selectObliqueRoute(index: number): void {
		if (index < 0 || index >= this.plannedRoutes.length || index === this.activeRouteIndex.value) {
			return;
		}
		this.activeRouteIndex.value = index;
		const route = this.plannedRoutes[index];
		globeConfig.linesArrs = [...route.coordinates];
		this.routeRenderer.drawFlightPath(route.segments);
		this.emitState();
	}

	//#endregion 业务逻辑 - 参数下发 END

	//#region 业务逻辑 - KMZ 导入导出

	pickAndImportKmz(): void {
		this.kmzIO.pickAndImportKmz();
	}

	async importKmzFile(file: File): Promise<void> {
		await this.kmzIO.importKmzFile(file);
	}

	async saveKmz(): Promise<void> {
		await this.kmzIO.saveKmz();
	}

	//#endregion 业务逻辑 - KMZ 导入导出 END

	//#region 业务逻辑 - 清除

	clearAll(): void {
		this.unregisterWorkingSet();
		this.clearCurrentRouteState(false);
	}

	//#endregion 业务逻辑 - 清除 END

	//#region 业务逻辑 - 航线规划

	recalculateRoute = async (): Promise<void> => {
		const polygonPositions = this.entityObjPolygonObj?.polygonPositions;
		if (!polygonPositions || polygonPositions.length < 3 || !window.mainViewer) {
			return;
		}

		const version = ++this.routeCalculationVersion;
		this.isCalculating.value = true;
		this.emitState();
		this.routeRenderer.clearRoutePreview();

		try {
			const result = await planPlanarRoutes({
				viewer: window.mainViewer,
				polygonPositions,
				isObliqueMode: this.isObliqueMode,
				isLineAngleManual: this.lineAngleHandler.isLineAngleManual,
				previousPhotoDistance: this.photoDistance,
				isStale: () => version !== this.routeCalculationVersion,
			});
			if (!result) {
				return;
			}
			this.applyPlannedRoutes(result.routes, result.photoDistance);
			await this.routeRenderer.waitForRoutePreviewReady(version);
		} catch (error) {
			if (version !== this.routeCalculationVersion) {
				return;
			}
			globeConfig.lineLength = 0;
			globeConfig.takeoffClimbLength = 0;
			globeConfig.photoCount = 0;
			globeConfig.linesArrs = [];
			globeConfig.routeLinesArrs = [];
			this.plannedRoutes = [];
			this.photoDistance = 0;
			this.routeSummaries.value = [];
			this.hasRoute.value = false;
			const msg = error instanceof Error ? error.message : t('cesium.module.planarRoute.msg.calcFailed');
			message.error(msg);
		} finally {
			if (version === this.routeCalculationVersion) {
				this.isCalculating.value = false;
			}
			this.emitState();
		}
	};

	private applyPlannedRoutes(plannedRoutes: PlannedRouteData[], photoDistance: number): void {
		if (plannedRoutes.length === 0) {
			throw new Error(t('cesium.module.planarRoute.err.noValidRouteGenerated'));
		}
		this.plannedRoutes = plannedRoutes;
		this.photoDistance = photoDistance;
		this.routeSummaries.value = plannedRoutes.map((route) => ({
			id: route.id,
			key: route.key,
			label: route.label,
			totalLength: route.totalLength,
			climbLength: route.climbLength,
			photoCount: route.photoCount,
		}));
		if (this.activeRouteIndex.value >= plannedRoutes.length) {
			this.activeRouteIndex.value = 0;
		}

		let totalLength = 0;
		let totalClimbLength = 0;
		let totalPhotoCount = 0;
		const routeCoordinates: number[][] = [];
		for (let routeIndex = 0; routeIndex < plannedRoutes.length; routeIndex++) {
			totalLength += plannedRoutes[routeIndex].totalLength;
			totalClimbLength += plannedRoutes[routeIndex].climbLength;
			totalPhotoCount += plannedRoutes[routeIndex].photoCount;
			routeCoordinates.push([...plannedRoutes[routeIndex].coordinates]);
		}
		const activeRoute = plannedRoutes[this.activeRouteIndex.value];
		globeConfig.lineLength = Math.round(totalLength);
		globeConfig.takeoffClimbLength = totalClimbLength;
		globeConfig.photoCount = totalPhotoCount;
		globeConfig.routeLinesArrs = routeCoordinates;
		globeConfig.linesArrs = [...activeRoute.coordinates];
		this.routeRenderer.drawFlightPath(activeRoute.segments);
		this.ensureWorkingSetRegistered();
		this.emitState();
	}

	//#endregion 业务逻辑 - 航线规划 END
}
