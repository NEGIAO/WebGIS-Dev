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
import globeConfig, { PLANAR_SPEED_HARD_MAX } from './config/planarConfig';
import { PolygonDrawingResult } from './utils/drawPolygon';
import { addStartPoint, calculateArea, cancelStartPointPick, hideStartPointTip } from './utils/planarLine';
import type { FiveDirectionRouteKey } from './utils/obliqueRoute';
import { LineAngleHandler } from './composables/useLineAngle';
import { KmzImportHandler, PlannedRouteData as KmzPlannedRouteData } from './composables/useKmzImport';
import { RouteRenderer } from './composables/useCesiumRenderer';
import { connectTakeoffToFirstWaypoint, calculateRoutePhotoCount, flattenRouteCoordinates } from './composables/useRouteCalc';
import { PolygonAreaEditor } from './composables/usePolygonAreaEditor';
import { PlanarRouteKmzIO } from './utils/planarRouteKmzIO';
import { planPlanarRoutes } from './utils/planarRoutePlanner';

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
	/** 方向指示器绝对高度（略高于航线），重规划期间保留以免指示器掉到地面或消失 */
	private lineAngleIndicatorHeight = 0;
	/** 已绑定的宿主 Viewer（bind 幂等判断用） */
	private boundViewer: Cesium.Viewer | null = null;
	/** 工作集是否已登记到统一图层管理 */
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
		this.initSubHandlers();
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
			setupPolygonSubscriber: () => self.areaEditor.setupSubscriber(),
			enablePolygonRightClick: () => {
				self.areaEditor.enableRightClick();
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
		this.areaEditor.ensureDeleteButton(viewer);
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
				this.areaEditor.setupSubscriber();
			} else if (this.flyPot) {
				this.drawWay(this.flyPot);
			}
			this.emitState();
			return;
		}

		// 暂停未完成的测区绘制监听（独立 ScreenSpaceEventHandler，会与起飞点拾取抢点击）
		const wasDrawingPolygon = this.areaEditor.suspendDrawing();
		if (wasDrawingPolygon) {
			this.drawDataSource?.entities.removeAll();
		}
		// 已完成测区时暂停顶点点击订阅，同样避免抢 LEFT_CLICK
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
	 * 设置绘制测区所需的地图交互（拾取起飞点成功后自动进入）。
	 */
	drawWay = (position?: Cesium.Cartesian3) => {
		if (!position || !window.mainViewer) {
			message.error(t('cesium.module.planarRoute.msg.takeoffMissing'));
			return;
		}

		this.flyPot = position;
		this.areaEditor.startDrawing(window.mainViewer);
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
	 */
	pickAndImportKmz(): void {
		this.kmzIO.pickAndImportKmz();
	}

	/**
	 * 选择 KMZ 文件后启动面状航线导入。
	 * @param file 用户选择的 KMZ 文件
	 */
	async importKmzFile(file: File): Promise<void> {
		await this.kmzIO.importKmzFile(file);
	}

	/**
	 * 保存航线：校验后由当前地图航线生成 KMZ 并下载（替代原 SaveAirlineDialog）。
	 */
	async saveKmz(): Promise<void> {
		await this.kmzIO.saveKmz();
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
	 * 计算本体在 utils/planarRoutePlanner（纯计算 + 版本过期即中断），此处只做编排与状态收敛。
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
