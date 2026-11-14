/**
 * 功能名称：面状航线 KMZ 存取（导入文件选择 / 保存下载）
 * 日    期：2026/11/13
 *
 * 从 planarRouteController 拆出：只负责「文件 ↔ 航线」这一层的交互与命名，
 * 解析与替换由 KmzImportHandler 承担，规划结果由控制器以 getter 注入。
 */
import Cesium from 'cesium';
import { Ref } from 'vue';
import { useMessage } from '@common/shell/useMessage';
import { translate as t } from '@common/app/useLocale';
import globeConfig, { applyFlightSpeedLimit } from '../config/planarConfig';
import { buildPlanarKmz, PlanarKmzRoute } from './planarKmzExport';
import { downloadBlobFile } from './comm';
import type { KmzImportHandler, PlannedRouteData } from '../composables/useKmzImport';

/** 全局消息提示（项目自有 toast，替代源工程 ElMessage） */
const message = useMessage();

/** KMZ 存取所需的外部上下文（由 PlanarRouteController 提供） */
export interface PlanarRouteKmzIOContext {
	/** 导入进行中标记（防重入） */
	isImporting: Ref<boolean>;
	/** 是否已有可用航线 */
	hasRoute: Ref<boolean>;
	/** KMZ 解析与替换处理器 */
	kmzImporter: KmzImportHandler;
	/** 当前测区顶点（无测区为 null） */
	getPolygonPositions(): Cesium.Cartesian3[] | null;
	/** 当前规划出的全部航线 */
	getPlannedRoutes(): PlannedRouteData[];
	/** 当前拍照间距 */
	getPhotoDistance(): number;
	/** 面板航线名 */
	getRouteName(): string;
	/** 写回面板航线名 */
	setRouteName(name: string): void;
	/** 是否五向倾斜采集 */
	isObliqueMode(): boolean;
	/** 状态快照上报 */
	onStateChange(): void;
}

/**
 * 面状航线 KMZ 导入 / 导出。
 */
export class PlanarRouteKmzIO {


	private ctx: PlanarRouteKmzIOContext;

	constructor(ctx: PlanarRouteKmzIOContext) {
		this.ctx = ctx;
	}

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
	 * @param file 用户选择的 KMZ 文件
	 */
	async importKmzFile(file: File): Promise<void> {
		if (this.ctx.isImporting.value) {
			return;
		}
		this.recordImportedWaylineName(file.name);
		await this.ctx.kmzImporter.importPlanarKmz(file);
		this.syncRouteNameFromSession();
		this.ctx.onStateChange();
	}

	/**
	 * 保存航线：校验后由当前地图航线生成 KMZ 并下载（替代原 SaveAirlineDialog）。
	 */
	async saveKmz(): Promise<void> {
		if (!this.ctx.hasRoute.value) {
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
			this.ctx.setRouteName(name);
		}
	}

	/** 导入完成后从会话缓存同步默认文件名。 */
	private syncRouteNameFromSession(): void {
		const cached = (sessionStorage.getItem('aircraftName') || '').trim();
		if (cached && !this.ctx.getRouteName().trim()) {
			this.ctx.setRouteName(cached);
		}
	}

	/** 解析保存文件名：面板输入 > 会话缓存 > 本地化默认名。 */
	private resolveSaveName(): string {
		let name = this.ctx.getRouteName().trim();
		if (!name) {
			name = (sessionStorage.getItem('aircraftName') || '').trim();
		}
		if (!name) {
			name = t('cesium.module.planarRoute.msg.defaultRouteName');
		}
		sessionStorage.setItem('aircraftName', name);
		this.ctx.setRouteName(name);
		return name;
	}

	/** 由当前地图航线生成 KMZ Blob。 */
	private async buildCurrentWaylineKmz(): Promise<Blob> {
		const polygonPositions = this.ctx.getPolygonPositions();
		const plannedRoutes = this.ctx.getPlannedRoutes();
		if (!polygonPositions || polygonPositions.length < 3 || plannedRoutes.length === 0 || !this.ctx.hasRoute.value) {
			throw new Error(t('cesium.module.planarRoute.msg.saveNeedBoth'));
		}
		if (!globeConfig.flyPosition) {
			throw new Error(t('cesium.module.planarRoute.err.setTakeoffFirst'));
		}

		const routes: PlanarKmzRoute[] = [];
		for (let routeIndex = 0; routeIndex < plannedRoutes.length; routeIndex++) {
			const route = plannedRoutes[routeIndex];
			routes.push({
				id: route.id,
				headingDegrees: route.headingDegrees,
				gimbalPitchDegrees: route.gimbalPitchDegrees,
				segments: route.exportSegments,
			});
		}

		return await buildPlanarKmz({
			isOblique: this.ctx.isObliqueMode(),
			polygonPositions,
			takeoffPosition: globeConfig.flyPosition,
			routes,
			lineAngle: Number(globeConfig.lineAngle),
			lineHeight: Number(globeConfig.lineHeight),
			heightType: Number(globeConfig.heightType),
			flightSpeed: applyFlightSpeedLimit(this.ctx.getPhotoDistance()),
			transitionalSpeed: Number(globeConfig.takeoffSpeed),
			overlapW: Number(globeConfig.overlapW),
			overlapH: Number(globeConfig.overlapH),
			gimbalPitchDegrees: Number(globeConfig.smartObliqueGimbalPitch),
			photoTriggerMode: globeConfig.photoTriggerMode,
			photoDistance: this.ctx.getPhotoDistance(),
		});
	}
}
