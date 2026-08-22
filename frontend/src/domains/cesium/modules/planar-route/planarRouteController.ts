/**
 * planarRouteController.ts — 面状航线无头运行时控制器
 *
 * 从浮层页方案 PlanarRoute.ts 迁移：剥离 Vue 组件与 Element Plus UI，
 * 由 toolPanel 模块卡片（PlanarRouteModule.js + LilGuiControls）驱动。
 * 职责：参考起飞点拾取 / 测区绘制交互 / 航线规划计算 / Cesium 渲染 /
 *       KMZ 导入导出 / 测区顶点拖拽与删除浮层 / 状态快照上报。
 */
import { ref } from 'vue';
import Cesium from 'cesium';
import Subscriber from '@cesium-extends/subscriber';
import { useMessage } from '@common/shell/useMessage';
import { translate as t } from '@common/app/useLocale';
import { calculateCameraFieldOfView, M3TD_WIDE_CAMERA } from './config/cameraConfig';
import globeConfig, { applyFlightSpeedLimit, PLANAR_SPEED_HARD_MAX } from './config/planarConfig';
import { drawPolygon, movePolygon, PolygonDrawingResult } from './utils/drawPolygon';
import { calculateFiveDirectionRoutes, FiveDirectionRouteKey, FiveDirectionRoutePlan } from './utils/obliqueRoute';
import { buildPlanarKmz, PlanarKmzRoute } from './utils/planarKmzExport';
import { addStartPoint, calculateArea, cancelStartPointPick, hideStartPointTip } from './utils/planarLine';
import { roundPlanarRouteSegments } from './utils/planarRouteTurn';
import { calculateMaximumLineSpacing, calculatePhotoDistance, calculatePlanarRoute, LocalPoint } from './utils/wayLineCalc';
import {
	calculateCartesianRouteLength,
	createCartesianRouteSegments,
	createLocalCoordinateFrame,
	LocalRouteSegment,
	sampleMaximumTerrainHeightAlongSegments,
} from './utils/planarTerrain';
import { downloadBlobFile } from './utils/comm';
import { LineAngleHandler } from './composables/useLineAngle';
import { KmzImportHandler, PlannedRouteData as KmzPlannedRouteData } from './composables/useKmzImport';
import { RouteRenderer } from './composables/useCesiumRenderer';
import {
	connectTakeoffToFirstWaypoint,
	getFirstLocalRoutePoint,
	getFirstCartesianRoutePoint,
	calculateRoutePhotoCount,
	flattenRouteCoordinates,
	resolveFlightHeight,
} from './composables/useRouteCalc';

/** 全局消息提示（项目自有 toast，替代源工程 ElMessage） */
const message = useMessage();

interface PickedEntityResult {
	id?: Cesium.Entity & { customData?: number };
}

interface RouteSummary {
	id: number;
	key: FiveDirectionRouteKey;
	label: string;
	totalLength: number;
	climbLength: number;
	photoCount: number;
}

/** 与 KmzPlannedRouteData 结构完全一致，本地类型别名供本文件使用 */
type PlannedRouteData = KmzPlannedRouteData;

/** 控制器上报给模块卡片的状态快照（PlanarRouteModule.js 据此渲染 status/options/disabled） */
export interface PlanarRouteSnapshot {
	hasRoute: boolean;
	isCalculating: boolean;
	isImporting: boolean;
	/** 正在拾取参考起飞点 */
	pickingTakeoff: boolean;
	/** 当前激活的五向航线序号（0 基） */
	activeRouteIndex: number;
	/** 五向航线切换下拉选项（正射模式为单条） */
	routeOptions: Array<{ label: string; value: number }>;
	/** 保存 KMZ 文件名（不含扩展名） */
	routeName: string;
}

export type PlanarRouteSnapshotPatch = Partial<PlanarRouteSnapshot>;

/** 控制器构造依赖 */
export interface PlanarRouteControllerOptions {
	/** 宿主 Viewer 获取函数（CesiumContainer 注入） */
	getViewer: () => Cesium.Viewer | null;
	/** 状态快照变化回调（合并进 useCesiumToolModules 的响应式 ref） */
	onStateChange?: (patch: PlanarRouteSnapshotPatch) => void;
	/**
	 * 工作集生命周期回调（统一图层管理注册/注销）：
	 * 首次生成有效航线时 present=true（携带托管数据源句柄），
	 * 清除全部 / 外部删除 / 控制器销毁时 present=false。
	 */
	onWorkingSetChange?: (info: { present: boolean; name: string; dataSource: Cesium.CustomDataSource | null }) => void;
}

const DELETE_BUTTON_ID = 'planar-delete-area-btn';

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
	private stopPolygonDrawing: (() => void) | null = null;
	private polygonRightClickEnableTimer: ReturnType<typeof setTimeout> | null = null;
	private isPolygonRightClickEnabled = false;
	private entityObjPolygonObj: PolygonDrawingResult | null = null;
	private drawDataSource: Cesium.CustomDataSource | null = null;
	private subscriber: Subscriber | null = null;
	/** 方向指示器绝对高度（略高于航线），重规划期间保留以免指示器掉到地面或消失 */
	private lineAngleIndicatorHeight = 0;
	/** 已绑定的宿主 Viewer（bind 幂等判断用） */
	private boundViewer: Cesium.Viewer | null = null;
	/** 测区删除浮层按钮（自管理 DOM，挂宿主 Viewer 容器） */
	private deleteButtonEl: HTMLDivElement | null = null;
	/** 工作集是否已登记到统一图层管理 */
	private workingSetRegistered = false;

	private kmzImporter!: KmzImportHandler;
	private lineAngleHandler!: LineAngleHandler;
	private routeRenderer!: RouteRenderer;

	constructor(options: PlanarRouteControllerOptions) {
		this.options = options;
		this.initSubHandlers();
	}

	/** 是否为倾斜采集（五向航线）模式 */
	get isObliqueMode(): boolean {
		return Number(globeConfig.climbType) === 2;
	}

	/**
	 * 初始化子处理器（对象字面量 getter 内 this 指向字面量本身，需捕获实例引用）。
	 */
	private initSubHandlers(): void {
		// eslint-disable-next-line @typescript-eslint/no-this-alias -- 对象字面量 getter 捕获实例引用，属必要写法
		const self = this;
		this.kmzImporter = new KmzImportHandler({
			isImporting: this.isImporting,
			get entityObjPolygonObj() {
				return self.entityObjPolygonObj;
			},
			hasRoute: this.hasRoute,
			get routeCalculationVersion() {
				return self.routeCalculationVersion;
			},
			get isLineAngleManual() {
				return self.lineAngleHandler.isLineAngleManual;
			},
			setEntityObjPolygonObj: (v) => {
				self.entityObjPolygonObj = v;
			},
			setIsLineAngleManual: (v) => {
				self.lineAngleHandler.isLineAngleManual = v;
			},
			bumpVersion: () => ++self.routeCalculationVersion,
			clearCurrentRouteState: (p) => self.clearCurrentRouteState(p),
			setupPolygonSubscriber: () => self.setupPolygonSubscriber(),
			enablePolygonRightClick: () => {
				self.isPolygonRightClickEnabled = true;
			},
			applyPlannedRoutes: (r, p) => self.applyPlannedRoutes(r, p),
			waitForRoutePreviewReady: (v) => self.routeRenderer.waitForRoutePreviewReady(v),
			connectTakeoffToFirstWaypoint: (s) => connectTakeoffToFirstWaypoint(s),
			calculateRoutePhotoCount: (s, d, g) => calculateRoutePhotoCount(s, d, g),
			flattenRouteCoordinates: (s) => flattenRouteCoordinates(s),
		});
		this.routeRenderer = new RouteRenderer({
			get drawDataSource() {
				return self.drawDataSource;
			},
			get routeCalculationVersion() {
				return self.routeCalculationVersion;
			},
			hasRoute: self.hasRoute,
			setLineAngleIndicatorHeight: (v) => {
				self.lineAngleIndicatorHeight = v;
			},
		});
		this.lineAngleHandler = new LineAngleHandler({
			get drawDataSource() {
				return self.drawDataSource;
			},
			get entityObjPolygonObj() {
				return self.entityObjPolygonObj;
			},
			get lineAngleIndicatorHeight() {
				return self.lineAngleIndicatorHeight;
			},
			recalculateRoute: () => self.recalculateRoute(),
		});
	}

	//#region 生命周期

	/**
	 * 绑定宿主 Viewer（幂等；viewer 重建后可再次调用）。
	 * 创建模块专属 CustomDataSource 并挂测区删除浮层按钮。
	 * @param viewer 宿主 Viewer
	 */
	bind(viewer: Cesium.Viewer): void {
		if (this.boundViewer === viewer && this.drawDataSource) {
			return;
		}
		if (this.boundViewer !== viewer) {
			// viewer 被重建（token 重试等）：先按旧引用清理
			this.destroy();
		}
		window.mainViewer = viewer;
		this.boundViewer = viewer;
		this.drawDataSource = new Cesium.CustomDataSource('drawDataSource');
		void viewer.dataSources.add(this.drawDataSource);
		this.drawDataSource.show = true;
		this.ensureDeleteButton(viewer);
		viewer.scene.requestRender();
		this.emitState();
	}

	/**
	 * 销毁控制器：释放全部实体、事件监听、定时器与 DOM，并清空全局 Viewer 引用。
	 */
	destroy(): void {
		this.unregisterWorkingSet();
		this.routeCalculationVersion++;
		this.routeRenderer.cancelRoutePreviewReadyWait();
		this.kmzImporter.cancelImportedTerrainCorrection();
		this.stopPolygonDrawing?.();
		this.stopPolygonDrawing = null;
		if (this.polygonRightClickEnableTimer) {
			clearTimeout(this.polygonRightClickEnableTimer);
			this.polygonRightClickEnableTimer = null;
		}
		this.lineAngleHandler.teardownSliderInteraction();
		this.lineAngleHandler.cancelIndicatorHide();
		this.cancelTakeoffPointSelection();
		this.subscriber?.destroy();
		this.subscriber = null;
		const viewer = window.mainViewer ?? this.boundViewer;
		if (viewer && this.drawDataSource) {
			void viewer.dataSources.remove(this.drawDataSource, true);
		}
		this.drawDataSource = null;
		this.deleteButtonEl?.remove();
		this.deleteButtonEl = null;
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

	/**
	 * 上报当前状态快照（全量合并到外部 ref）。
	 */
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

	/**
	 * 将当前工作集（测区+航线+起飞点实体）登记进统一图层管理。
	 * 幂等：仅首次生成有效航线时建档，后续重规划不重复上报。
	 */
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

	/**
	 * 从统一图层管理注销工作集（清除全部 / 外部删除 / 销毁时）。
	 */
	private unregisterWorkingSet(): void {
		if (!this.workingSetRegistered) {
			return;
		}
		this.workingSetRegistered = false;
		this.options.onWorkingSetChange?.({ present: false, name: '', dataSource: null });
	}

	/** 工作集显示名：面板命名 > 会话缓存 > 本地化默认名。 */
	private resolveWorkingSetName(): string {
		let name = this.routeName.value.trim();
		if (!name) name = (sessionStorage.getItem('aircraftName') || '').trim();
		if (!name) name = t('cesium.module.planarRoute.msg.defaultRouteName');
		return name;
	}

	/**
	 * 外部删除联动复位（统一图层管理移除 wayline 数据源前调用）：
	 * 数据源句柄即将被通用 removeDataSource 销毁，这里只复位内部状态与引用，
	 * 不触碰 Viewer；下次交互 bind 时会重建全新数据源。
	 */
	detachForExternalRemoval(): void {
		this.routeCalculationVersion++;
		this.kmzImporter.cancelImportedTerrainCorrection();
		this.cancelTakeoffPointSelection();
		this.stopPolygonDrawing?.();
		this.stopPolygonDrawing = null;
		if (this.polygonRightClickEnableTimer) {
			clearTimeout(this.polygonRightClickEnableTimer);
			this.polygonRightClickEnableTimer = null;
		}
		this.lineAngleHandler.teardownSliderInteraction();
		this.lineAngleHandler.hideIndicator();
		this.subscriber?.destroy();
		this.subscriber = null;
		this.hideDeleteButton();
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
		globeConfig.area = 0;
		globeConfig.lineLength = 0;
		globeConfig.takeoffClimbLength = 0;
		globeConfig.photoCount = 0;
		globeConfig.linesArrs = [];
		globeConfig.routeLinesArrs = [];
		globeConfig.polygonPositions = [];
		globeConfig.flyPosition = null;
		globeConfig.isSetTakeoffPoint = false;

		this.drawDataSource = null;
		this.boundViewer = null;
		this.unregisterWorkingSet();
		this.emitState();
	}

	//#endregion 生命周期 END

	//#region 业务逻辑 - 参考起飞点

	/**
	 * 进入 / 退出参考起飞点拾取（面板开关驱动）。
	 * 进入时暂停测区绘制与顶点订阅，避免同一点击同时落起飞点与测区顶点。
	 */
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
			// 取消重设：恢复测区绘制或顶点编辑
			if (this.entityObjPolygonObj) {
				this.setupPolygonSubscriber();
			} else if (this.flyPot) {
				this.drawWay(this.flyPot);
			}
			this.emitState();
			return;
		}

		const wasDrawingPolygon = !!this.stopPolygonDrawing;
		// 暂停未完成的测区绘制监听（独立 ScreenSpaceEventHandler，会与起飞点拾取抢点击）
		this.stopPolygonDrawing?.();
		this.stopPolygonDrawing = null;
		if (wasDrawingPolygon) {
			this.drawDataSource?.entities.removeAll();
		}
		// 已完成测区时暂停顶点点击订阅，同样避免抢 LEFT_CLICK
		this.subscriber?.destroy();
		this.subscriber = null;

		addStartPoint(window.mainViewer!, (position?: Cesium.Cartesian3) => {
			this.pickingTakeoff.value = false;
			if (position) {
				this.flyPot = position;
			}
			if (this.entityObjPolygonObj) {
				this.setupPolygonSubscriber();
				this.emitState();
				void this.recalculateRoute();
				return;
			}
			// 绘制中被打断或尚无测区：用新起飞点重新进入测区绘制
			if (position) {
				this.drawWay(position);
			}
			this.emitState();
		});
		this.emitState();
	}

	/**
	 * 退出参考起飞点拾取状态并恢复地图默认光标。
	 */
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

	/**
	 * 注册测区删除浮层和顶点拖动交互。
	 */
	private setupPolygonSubscriber(): void {
		this.subscriber?.destroy();
		const viewer = window.mainViewer;
		if (!viewer) {
			return;
		}
		this.subscriber = new Subscriber(viewer, { pickResult: { enable: true, moveDebounce: 3000 } });
		this.subscriber.addExternal(() => {
			this.hideDeleteButton();
		}, 'LEFT_DOWN');
		this.subscriber.addExternal(() => {
			this.hideDeleteButton();
		}, 'MIDDLE_DOWN');
		this.subscriber.addExternal((movement) => {
			if (!this.isPolygonRightClickEnabled) {
				this.hideDeleteButton();
				return;
			}
			const pick = movement.position;
			const pickedObject = window.mainViewer!.scene.pick(pick) as PickedEntityResult | undefined;
			if (!pick || pickedObject?.id?.name !== 'polygon') {
				this.hideDeleteButton();
				return;
			}
			this.showDeleteButtonAtCanvasPosition(pick);
			window.mainViewer!.scene.requestRender();
		}, 'RIGHT_CLICK');
		this.subscriber.addExternal((movement) => {
			if (!this.entityObjPolygonObj) {
				return;
			}
			const pickedObject = window.mainViewer!.scene.pick(movement.position) as PickedEntityResult | undefined;
			if (pickedObject?.id?.name !== 'polygonPoint' || pickedObject.id.customData === undefined) {
				this.hideDeleteButton();
				return;
			}

			this.entityObjPolygonObj.pointTndex = pickedObject.id.customData;
			movePolygon(this.entityObjPolygonObj, window.mainViewer!, (value) => {
				this.entityObjPolygonObj = value as PolygonDrawingResult;
				this.updatePolygonArea();
				void this.recalculateRoute();
			});
		}, 'LEFT_CLICK');
	}

	/**
	 * 设置绘制测区所需的地图交互（拾取起飞点成功后自动进入）。
	 */
	drawWay = (position?: Cesium.Cartesian3) => {
		if (!position || !window.mainViewer) {
			message.error(t('cesium.module.planarRoute.msg.takeoffMissing'));
			return;
		}

		this.flyPot = position;
		this.lineAngleHandler.isLineAngleManual = false;
		this.isPolygonRightClickEnabled = false;
		if (this.polygonRightClickEnableTimer) {
			clearTimeout(this.polygonRightClickEnableTimer);
			this.polygonRightClickEnableTimer = null;
		}
		this.stopPolygonDrawing?.();
		this.stopPolygonDrawing = null;
		this.setupPolygonSubscriber();

		this.stopPolygonDrawing = drawPolygon(
			window.mainViewer,
			(value) => {
				this.stopPolygonDrawing = null;
				this.entityObjPolygonObj = value as PolygonDrawingResult;
				this.polygonRightClickEnableTimer = setTimeout(() => {
					this.isPolygonRightClickEnabled = true;
					this.polygonRightClickEnableTimer = null;
				}, 0);
				this.updatePolygonArea();
				this.emitState();
				void this.recalculateRoute();
			},
			() => {
				this.stopPolygonDrawing = null;
				this.delPoy();
			},
		);
	};

	/**
	 * 删除当前测区并重新进入绘制状态（保留参考起飞点）。
	 */
	delPoy = () => {
		const restartPosition = this.flyPot ?? globeConfig.flyPosition;
		this.clearCurrentRouteState(true);
		if (restartPosition) {
			this.drawWay(restartPosition);
		}
	};

	/**
	 * 清空当前测区与航线状态；导入时可同时清理旧起飞点。
	 */
	private clearCurrentRouteState(preserveTakeoff: boolean): void {
		this.routeCalculationVersion++;
		this.kmzImporter.cancelImportedTerrainCorrection();
		this.cancelTakeoffPointSelection();
		this.isPolygonRightClickEnabled = false;
		if (this.polygonRightClickEnableTimer) {
			clearTimeout(this.polygonRightClickEnableTimer);
			this.polygonRightClickEnableTimer = null;
		}
		this.stopPolygonDrawing?.();
		this.stopPolygonDrawing = null;
		this.lineAngleHandler.teardownSliderInteraction();
		this.lineAngleHandler.hideIndicator();
		this.drawDataSource?.entities.removeAll();
		this.hideDeleteButton();
		this.subscriber?.destroy();
		this.subscriber = null;
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
		globeConfig.area = 0;
		globeConfig.lineLength = 0;
		globeConfig.takeoffClimbLength = 0;
		globeConfig.photoCount = 0;
		globeConfig.linesArrs = [];
		globeConfig.routeLinesArrs = [];
		globeConfig.polygonPositions = [];
		if (!preserveTakeoff) {
			// 起飞点实体已随 removeAll 清入托管数据源；此处仅复位引用
			this.flyPot = null;
			globeConfig.flyPosition = null;
			globeConfig.isSetTakeoffPoint = false;
		}
		this.emitState();
	}

	/**
	 * 更新测区面积和共享测区坐标。
	 */
	private updatePolygonArea(): void {
		if (!this.entityObjPolygonObj) {
			return;
		}
		const positions = this.entityObjPolygonObj.polygonPositions;
		globeConfig.polygonPositions = positions;
		globeConfig.area = Number(calculateArea(positions).toFixed(2));
	}

	/**
	 * 确保测区删除浮层按钮存在（挂宿主 Viewer 容器，内联样式自管理）。
	 */
	private ensureDeleteButton(viewer: Cesium.Viewer): void {
		if (this.deleteButtonEl) {
			return;
		}
		const host = (viewer.container as HTMLElement | undefined) ?? document.body;
		const btn = document.createElement('div');
		btn.id = DELETE_BUTTON_ID;
		btn.textContent = t('cesium.module.planarRoute.msg.deleteAreaBtn');
		Object.assign(btn.style, {
			display: 'none',
			position: 'absolute',
			zIndex: '30',
			color: '#fff',
			cursor: 'pointer',
			padding: '8px 12px',
			background: '#1f1f1f',
			borderRadius: '4px',
			minWidth: '196px',
			fontSize: '14px',
			lineHeight: '22px',
			textAlign: 'center',
			boxShadow: '0 0 8px rgba(0, 0, 0, 0.15)',
		});
		btn.addEventListener('mouseenter', () => {
			btn.style.background = '#0075ff';
		});
		btn.addEventListener('mouseleave', () => {
			btn.style.background = '#1f1f1f';
		});
		btn.addEventListener('click', () => {
			this.hideDeleteButton();
			this.delPoy();
		});
		host.appendChild(btn);
		this.deleteButtonEl = btn;
	}

	/**
	 * 将 Cesium 画布坐标换算为相对宿主容器坐标后显示删除按钮。
	 */
	private showDeleteButtonAtCanvasPosition(canvasPosition: { x: number; y: number }): void {
		const btn = this.deleteButtonEl;
		const viewer = window.mainViewer;
		if (!btn || !viewer) {
			return;
		}
		const canvas = viewer.canvas;
		const canvasRect = canvas.getBoundingClientRect();
		const host = (viewer.container as HTMLElement | undefined) ?? btn.parentElement;
		if (!(host instanceof HTMLElement)) {
			btn.style.left = `${canvasPosition.x}px`;
			btn.style.top = `${canvasPosition.y}px`;
			btn.style.display = 'block';
			return;
		}
		const hostRect = host.getBoundingClientRect();
		const canvasScaleX = canvas.clientWidth > 0 ? canvasRect.width / canvas.clientWidth : 1;
		const canvasScaleY = canvas.clientHeight > 0 ? canvasRect.height / canvas.clientHeight : 1;
		const visualX = canvasRect.left + canvasPosition.x * canvasScaleX;
		const visualY = canvasRect.top + canvasPosition.y * canvasScaleY;
		const hostScaleX = hostRect.width > 0 ? host.clientWidth / hostRect.width : 1;
		const hostScaleY = hostRect.height > 0 ? host.clientHeight / hostRect.height : 1;
		btn.style.left = `${(visualX - hostRect.left) * hostScaleX}px`;
		btn.style.top = `${(visualY - hostRect.top) * hostScaleY}px`;
		btn.style.display = 'block';
	}

	/**
	 * 隐藏测区删除浮层。
	 */
	private hideDeleteButton(): void {
		if (this.deleteButtonEl) {
			this.deleteButtonEl.style.display = 'none';
		}
	}

	//#endregion 业务逻辑 - 测区绘制与编辑 END

	//#region 业务逻辑 - 参数下发（面板控件 → 配置）

	/**
	 * 面板控件变更统一入口（PlanarRouteModule controls → globeConfig → 重规划）。
	 * @param controlId 控件 ID
	 * @param value 新值
	 */
	setParam(controlId: string, value: unknown): void {
		switch (controlId) {
			case 'setTakeoff':
				this.setTakeoffPicking(Boolean(value));
				return;
			case 'climbType':
				this.updateClimbType(Number(value));
				return;
			case 'heightType':
				globeConfig.heightType = Number(value);
				break;
			case 'lineHeight':
				globeConfig.lineHeight = Math.min(1500, Math.max(2, Number(value)));
				break;
			case 'speed':
				globeConfig.speed = Math.min(PLANAR_SPEED_HARD_MAX, Math.max(1, Number(value)));
				break;
			case 'takeoffSpeed':
				globeConfig.takeoffSpeed = Math.min(15, Math.max(1, Number(value)));
				break;
			case 'overlapW':
				globeConfig.overlapW = Math.min(90, Math.max(10, Number(value)));
				break;
			case 'overlapH':
				globeConfig.overlapH = Math.min(90, Math.max(10, Number(value)));
				break;
			case 'gimbalPitch':
				globeConfig.smartObliqueGimbalPitch = Math.min(-40, Math.max(-85, Number(value)));
				break;
			case 'lineAngle': {
				const next = Math.min(179, Math.max(0, Number(value)));
				if (Number(globeConfig.lineAngle) === next) {
					return;
				}
				globeConfig.lineAngle = next;
				this.lineAngleHandler.isLineAngleManual = true;
				break;
			}
			case 'photoTriggerMode':
				globeConfig.photoTriggerMode = value === 'distance' ? 'distance' : 'time';
				break;
			case 'activeRoute':
				this.selectObliqueRoute(Number(value));
				return;
			case 'routeName':
				this.routeName.value = String(value ?? '');
				this.emitState();
				return;
			default:
				return;
		}
		// 数值参数变更后重规划（无测区时 recalculateRoute 自动跳过）
		void this.recalculateRoute();
	}

	/**
	 * 修改航线采集方式（正射 / 五向倾斜）。
	 */
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

	/**
	 * 切换地图当前显示的五向航线。
	 */
	selectObliqueRoute(index: number): void {
		if (index < 0 || index >= this.plannedRoutes.length || index === this.activeRouteIndex.value) {
			return;
		}
		this.activeRouteIndex.value = index;
		const route = this.plannedRoutes[index];
		globeConfig.linesArrs = [...route.coordinates];
		this.routeRenderer.drawFlightPath(route.segments);
		// 上报快照：否则面板 select 的值同步会把用户选择弹回旧序号
		this.emitState();
	}

	//#endregion 业务逻辑 - 参数下发 END

	//#region 业务逻辑 - KMZ 导入导出

	/**
	 * 打开系统文件选择器选择 KMZ 并导入（替代原 el-upload）。
	 * change/cancel 后移除临时 input，避免取消选择时残留游离 DOM。
	 */
	pickAndImportKmz(): void {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.kmz';
		input.style.display = 'none';
		const cleanup = () => input.remove();
		input.addEventListener('cancel', cleanup);
		input.addEventListener('change', () => {
			cleanup();
			const file = input.files?.[0];
			if (file) {
				void this.importKmzFile(file);
			}
		});
		document.body.appendChild(input);
		input.click();
	}

	/**
	 * 选择 KMZ 文件后启动面状航线导入。
	 */
	async importKmzFile(file: File): Promise<void> {
		if (this.isImporting.value) {
			return;
		}
		this.recordImportedWaylineName(file.name);
		await this.kmzImporter.importPlanarKmz(file);
		this.syncRouteNameFromSession();
		this.emitState();
	}

	/**
	 * 记录导入文件名，供保存航线时回填默认名称。
	 * @param fileName 原始文件名
	 */
	private recordImportedWaylineName(fileName: string): void {
		const raw = (fileName || '').trim();
		if (!raw) return;
		const name = raw.replace(/\.kmz$/i, '');
		if (name) {
			sessionStorage.setItem('aircraftName', name);
			this.routeName.value = name;
		}
	}

	/** 导入完成后从会话缓存同步默认文件名。 */
	private syncRouteNameFromSession(): void {
		const cached = (sessionStorage.getItem('aircraftName') || '').trim();
		if (cached && !this.routeName.value.trim()) {
			this.routeName.value = cached;
		}
	}

	/**
	 * 保存航线：校验后由当前地图航线生成 KMZ 并下载（替代原 SaveAirlineDialog）。
	 */
	async saveKmz(): Promise<void> {
		if (!this.hasRoute.value) {
			message.warning(t('cesium.module.planarRoute.msg.saveNeedRoute'));
			return;
		}
		if (!globeConfig.flyPosition) {
			message.warning(t('cesium.module.planarRoute.err.setTakeoffFirst'));
			return;
		}
		const name = this.resolveSaveName();
		try {
			const blob = await this.buildCurrentWaylineKmz();
			downloadBlobFile(blob, `${name}.kmz`);
			message.success(t('cesium.module.planarRoute.msg.savedOk', { name }));
		} catch (error) {
			const msg = error instanceof Error ? error.message : t('cesium.module.planarRoute.msg.exportFailed');
			message.error(msg);
		}
	}

	/** 解析保存文件名：面板输入 > 会话缓存 > 本地化默认名。 */
	private resolveSaveName(): string {
		let name = this.routeName.value.trim();
		if (!name) {
			name = (sessionStorage.getItem('aircraftName') || '').trim();
		}
		if (!name) {
			name = t('cesium.module.planarRoute.msg.defaultRouteName');
		}
		sessionStorage.setItem('aircraftName', name);
		this.routeName.value = name;
		return name;
	}

	/** 由当前地图航线生成 KMZ Blob。 */
	private async buildCurrentWaylineKmz(): Promise<Blob> {
		const polygonPositions = this.entityObjPolygonObj?.polygonPositions;
		if (!polygonPositions || polygonPositions.length < 3 || this.plannedRoutes.length === 0 || !this.hasRoute.value) {
			throw new Error(t('cesium.module.planarRoute.msg.saveNeedBoth'));
		}
		if (!globeConfig.flyPosition) {
			throw new Error(t('cesium.module.planarRoute.err.setTakeoffFirst'));
		}

		const routes: PlanarKmzRoute[] = [];
		for (let routeIndex = 0; routeIndex < this.plannedRoutes.length; routeIndex++) {
			const route = this.plannedRoutes[routeIndex];
			routes.push({
				id: route.id,
				headingDegrees: route.headingDegrees,
				gimbalPitchDegrees: route.gimbalPitchDegrees,
				segments: route.exportSegments,
			});
		}

		return await buildPlanarKmz({
			isOblique: this.isObliqueMode,
			polygonPositions,
			takeoffPosition: globeConfig.flyPosition,
			routes,
			lineAngle: Number(globeConfig.lineAngle),
			lineHeight: Number(globeConfig.lineHeight),
			heightType: Number(globeConfig.heightType),
			flightSpeed: applyFlightSpeedLimit(this.photoDistance),
			transitionalSpeed: Number(globeConfig.takeoffSpeed),
			overlapW: Number(globeConfig.overlapW),
			overlapH: Number(globeConfig.overlapH),
			gimbalPitchDegrees: Number(globeConfig.smartObliqueGimbalPitch),
			photoTriggerMode: globeConfig.photoTriggerMode,
			photoDistance: this.photoDistance,
		});
	}

	//#endregion 业务逻辑 - KMZ 导入导出 END

	//#region 业务逻辑 - 清除

	/**
	 * 面板「清除」动作：清空全部测区 / 航线 / 起飞点，回到初始态。
	 */
	clearAll(): void {
		this.unregisterWorkingSet();
		this.clearCurrentRouteState(false);
	}

	//#endregion 业务逻辑 - 清除 END

	//#region 业务逻辑 - 航线规划

	/**
	 * 根据当前测区、地形、相机和面板参数重新生成正射或五向倾斜航线。
	 */
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
			const frame = createLocalCoordinateFrame(polygonPositions);
			const localPolygon: LocalPoint[] = [];
			for (let index = 0; index < polygonPositions.length; index++) {
				localPolygon.push(frame.toLocal(polygonPositions[index]));
			}

			const heightResult = await resolveFlightHeight(window.mainViewer, frame, localPolygon);
			if (version !== this.routeCalculationVersion) {
				return;
			}

			const minimumGroundClearance = heightResult.minimumGroundClearance;
			if (minimumGroundClearance <= 0) {
				throw new Error(t('cesium.module.planarRoute.err.insufficientFlightHeight'));
			}

			const cameraFieldOfView = calculateCameraFieldOfView(M3TD_WIDE_CAMERA);
			const crossTrackFov = cameraFieldOfView.horizontalDegrees;
			const halfFovRadians = (crossTrackFov * Math.PI) / 360;
			const footprintWidth = 2 * minimumGroundClearance * Math.tan(halfFovRadians);
			const maximumLineSpacing = calculateMaximumLineSpacing(minimumGroundClearance, crossTrackFov, Number(globeConfig.overlapW));
			const photoDistance = calculatePhotoDistance(minimumGroundClearance, cameraFieldOfView.verticalDegrees, Number(globeConfig.overlapH));
			// 建议限速随拍照间距更新；仅间距变化时同步为建议值，手动调速（最高 15）不被压回
			const previousPhotoDistance = this.photoDistance;
			const syncToSuggested = !(previousPhotoDistance > 0 && Math.abs(previousPhotoDistance - photoDistance) < 1e-6);
			applyFlightSpeedLimit(photoDistance, syncToSuggested);
			const takeoffPoint = globeConfig.flyPosition ? frame.toLocal(globeConfig.flyPosition) : undefined;
			let localRoutes: FiveDirectionRoutePlan[];
			if (this.isObliqueMode) {
				const manualAngle = this.lineAngleHandler.isLineAngleManual ? Number(globeConfig.lineAngle) : undefined;
				const result = calculateFiveDirectionRoutes({
					polygon: localPolygon,
					maximumLineSpacing,
					footprintWidth,
					minimumGroundClearance,
					gimbalPitchDegrees: Number(globeConfig.smartObliqueGimbalPitch),
					takeoffPoint,
					manualAngle,
				});
				localRoutes = result.routes;
				if (!this.lineAngleHandler.isLineAngleManual) {
					globeConfig.lineAngle = Number(result.angle.toFixed(1));
				}
				globeConfig.spacing = Number(result.lineSpacing.toFixed(2));
			} else {
				const manualAngle = this.lineAngleHandler.isLineAngleManual ? Number(globeConfig.lineAngle) : undefined;
				const plan = calculatePlanarRoute({
					polygon: localPolygon,
					maximumLineSpacing,
					footprintWidth,
					takeoffPoint,
					manualAngle,
				});
				if (!this.lineAngleHandler.isLineAngleManual) {
					globeConfig.lineAngle = Number(plan.angle.toFixed(1));
				}
				globeConfig.spacing = Number(plan.lineSpacing.toFixed(2));
				localRoutes = [
					{
						id: 1,
						key: 'nadir',
						label: t('cesium.module.planarRoute.option.nadir'),
						gimbalPitchDegrees: -90,
						segments: plan.segments,
					},
				];
			}

			if (Number(globeConfig.heightType) !== 3) {
				const allSegments: LocalRouteSegment[] = [];
				for (let routeIndex = 0; routeIndex < localRoutes.length; routeIndex++) {
					for (let segmentIndex = 0; segmentIndex < localRoutes[routeIndex].segments.length; segmentIndex++) {
						allSegments.push(localRoutes[routeIndex].segments[segmentIndex]);
					}
					const firstLocalWaypoint = getFirstLocalRoutePoint(localRoutes[routeIndex].segments);
					if (takeoffPoint && firstLocalWaypoint) {
						allSegments.push({ type: 'transit', points: [takeoffPoint, firstLocalWaypoint] });
					}
				}
				const maximumRouteTerrainHeight = await sampleMaximumTerrainHeightAlongSegments(window.mainViewer, frame, allSegments);
				if (version !== this.routeCalculationVersion) {
					return;
				}
				if (!Number.isFinite(heightResult.absoluteFlightHeight) || heightResult.absoluteFlightHeight! <= maximumRouteTerrainHeight) {
					throw new Error(t('cesium.module.planarRoute.err.terrainTooHighForPlan'));
				}
			}

			const plannedRoutes: PlannedRouteData[] = [];
			for (let routeIndex = 0; routeIndex < localRoutes.length; routeIndex++) {
				const localRoute = localRoutes[routeIndex];
				const rawCartesianSegments = await createCartesianRouteSegments(window.mainViewer, frame, localRoute.segments, {
					heightType: Number(globeConfig.heightType),
					lineHeight: Number(globeConfig.lineHeight),
					absoluteFlightHeight: heightResult.absoluteFlightHeight,
				});
				if (version !== this.routeCalculationVersion) {
					return;
				}
				const previewLocalSegments = roundPlanarRouteSegments(localRoute.segments);
				const roundedCartesianSegments = await createCartesianRouteSegments(window.mainViewer, frame, previewLocalSegments, {
					heightType: Number(globeConfig.heightType),
					lineHeight: Number(globeConfig.lineHeight),
					absoluteFlightHeight: heightResult.absoluteFlightHeight,
				});
				if (version !== this.routeCalculationVersion) {
					return;
				}
				if (Number(globeConfig.heightType) === 3 && takeoffPoint) {
					const firstLocalWaypoint = getFirstLocalRoutePoint(localRoute.segments);
					const firstCartesianWaypoint = getFirstCartesianRoutePoint(rawCartesianSegments);
					if (firstLocalWaypoint && firstCartesianWaypoint) {
						const maximumEntryTerrainHeight = await sampleMaximumTerrainHeightAlongSegments(window.mainViewer, frame, [
							{ type: 'transit', points: [takeoffPoint, firstLocalWaypoint] },
						]);
						if (version !== this.routeCalculationVersion) {
							return;
						}
						const firstWaypointCartographic = Cesium.Cartographic.fromCartesian(firstCartesianWaypoint);
						if (!firstWaypointCartographic || firstWaypointCartographic.height <= maximumEntryTerrainHeight) {
							throw new Error(t('cesium.module.planarRoute.err.entryTerrainTooHigh'));
						}
					}
				}
				// 圆角仅用于地图预览；导出使用原始折线航点，由司空 coordinateTurn 在转弯处平滑过点。
				const exportConnection = connectTakeoffToFirstWaypoint(rawCartesianSegments);
				const previewConnection = connectTakeoffToFirstWaypoint(roundedCartesianSegments);
				const totalLength = calculateCartesianRouteLength(exportConnection.segments);
				plannedRoutes.push({
					id: localRoute.id,
					key: localRoute.key,
					label: localRoute.label,
					headingDegrees: localRoute.headingDegrees,
					gimbalPitchDegrees: localRoute.gimbalPitchDegrees,
					segments: previewConnection.segments,
					exportSegments: rawCartesianSegments,
					coordinates: flattenRouteCoordinates(previewConnection.segments),
					totalLength,
					climbLength: exportConnection.climbLength,
					photoCount: calculateRoutePhotoCount(rawCartesianSegments, photoDistance, this.isObliqueMode),
				});
			}
			if (plannedRoutes.length === 0) {
				throw new Error(t('cesium.module.planarRoute.err.noValidRouteGenerated'));
			}

			this.applyPlannedRoutes(plannedRoutes, photoDistance);
			await this.routeRenderer.waitForRoutePreviewReady(version);
			if (version !== this.routeCalculationVersion) {
				return;
			}
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

	/**
	 * 同步规划航线、统计数据和当前地图预览。
	 */
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
