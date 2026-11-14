/**
 * 功能名称：面状航线测区交互（顶点订阅 / 拖拽 / 删除浮层）
 * 日    期：2026/11/13
 *
 * 从 planarRouteController 拆出：仅管理「测区」这一实体对象的绘制、顶点拖拽、
 * 右键删除浮层与交互订阅生命周期；航线规划与 KMZ 存取由控制器按回调驱动。
 */
import Cesium from 'cesium';
import Subscriber from '@cesium-extends/subscriber';
import { translate as t } from '@common/app/useLocale';
import { drawPolygon, movePolygon, PolygonDrawingResult } from '../utils/drawPolygon';

/** 测区删除浮层按钮 DOM id */
const DELETE_BUTTON_ID = 'planar-delete-area-btn';

/** scene.pick 的返回结构中本模块关心的字段 */
interface PickedEntityResult {
	id?: Cesium.Entity & { customData?: number };
}

/** 测区交互所需的外部上下文（由 PlanarRouteController 提供） */
export interface PolygonAreaEditorContext {
	/** 宿主 Viewer（window.mainViewer，可能尚未就绪） */
	getViewer(): Cesium.Viewer | null;
	/** 当前测区绘制结果 */
	getEntity(): PolygonDrawingResult | null;
	/** 写回测区绘制结果 */
	setEntity(value: PolygonDrawingResult | null): void;
	/** 测区顶点变化后刷新面积与共享坐标 */
	onAreaUpdated(): void;
	/** 状态快照上报 */
	onStateChange(): void;
	/** 请求重新规划航线 */
	requestRecalculate(): void;
	/** 测区被删除（面板 / 浮层按钮触发） */
	requestDelete(): void;
	/** 复位线角度手动标记（重新绘制测区时角度回到自动） */
	resetLineAngleManual(): void;
}

/**
 * 测区绘制与编辑交互。
 * 生命周期：startDrawing → (完成) → setupSubscriber → reset / dispose。
 */
export class PolygonAreaEditor {


	private ctx: PolygonAreaEditorContext;
	private subscriber: Subscriber | null = null;
	private stopPolygonDrawing: (() => void) | null = null;
	private polygonRightClickEnableTimer: ReturnType<typeof setTimeout> | null = null;
	private isPolygonRightClickEnabled = false;
	private deleteButtonEl: HTMLDivElement | null = null;

	constructor(ctx: PolygonAreaEditorContext) {
		this.ctx = ctx;
	}

	/** 当前测区绘制结果 */
	get entity(): PolygonDrawingResult | null {
		return this.ctx.getEntity();
	}

	set entity(value: PolygonDrawingResult | null) {
		this.ctx.setEntity(value);
	}

	/** 是否正在绘制测区（存在未结束的 drawPolygon 监听） */
	get isDrawing(): boolean {
		return !!this.stopPolygonDrawing;
	}

	/** 允许测区右键删除（绘制完成后延迟开启，避免与绘制右键冲突） */
	enableRightClick(): void {
		this.isPolygonRightClickEnabled = true;
	}

	/**
	 * 注册测区删除浮层和顶点拖动交互。
	 */
	setupSubscriber(): void {
		this.subscriber?.destroy();
		const viewer = this.ctx.getViewer();
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
			const entity = this.ctx.getEntity();
			if (!entity) {
				return;
			}
			const pickedObject = window.mainViewer!.scene.pick(movement.position) as PickedEntityResult | undefined;
			if (pickedObject?.id?.name !== 'polygonPoint' || pickedObject.id.customData === undefined) {
				this.hideDeleteButton();
				return;
			}

			entity.pointTndex = pickedObject.id.customData;
			movePolygon(entity, window.mainViewer!, (value: any) => {
				this.ctx.setEntity(value as PolygonDrawingResult);
				this.ctx.onAreaUpdated();
				this.ctx.requestRecalculate();
			});
		}, 'LEFT_CLICK');
	}

	/**
	 * 进入测区绘制（拾取起飞点成功后由控制器调用）。
	 * @param viewer 宿主 Viewer
	 */
	startDrawing(viewer: Cesium.Viewer): void {
		this.ctx.resetLineAngleManual();
		this.isPolygonRightClickEnabled = false;
		if (this.polygonRightClickEnableTimer) {
			clearTimeout(this.polygonRightClickEnableTimer);
			this.polygonRightClickEnableTimer = null;
		}
		this.stopPolygonDrawing?.();
		this.stopPolygonDrawing = null;
		this.setupSubscriber();

		this.stopPolygonDrawing = drawPolygon(
			viewer,
			(value: any) => {
				this.stopPolygonDrawing = null;
				this.ctx.setEntity(value as PolygonDrawingResult);
				this.polygonRightClickEnableTimer = setTimeout(() => {
					this.isPolygonRightClickEnabled = true;
					this.polygonRightClickEnableTimer = null;
				}, 0);
				this.ctx.onAreaUpdated();
				this.ctx.onStateChange();
				this.ctx.requestRecalculate();
			},
			() => {
				this.stopPolygonDrawing = null;
				this.ctx.requestDelete();
			},
		);
	}

	/**
	 * 暂停未完成的测区绘制。
	 * @returns 此前是否处于绘制中（调用方据此清理已落点实体）
	 */
	suspendDrawing(): boolean {
		const wasDrawing = !!this.stopPolygonDrawing;
		this.stopPolygonDrawing?.();
		this.stopPolygonDrawing = null;
		return wasDrawing;
	}

	/** 销毁顶点订阅（起飞点拾取期间需让出点击事件） */
	destroySubscriber(): void {
		this.subscriber?.destroy();
		this.subscriber = null;
	}

	/**
	 * 确保测区删除浮层按钮存在（挂宿主 Viewer 容器，内联样式自管理）。
	 * @param viewer 宿主 Viewer
	 */
	ensureDeleteButton(viewer: Cesium.Viewer): void {
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
			this.ctx.requestDelete();
		});
		host.appendChild(btn);
		this.deleteButtonEl = btn;
	}

	/** 隐藏测区删除浮层 */
	hideDeleteButton(): void {
		if (this.deleteButtonEl) {
			this.deleteButtonEl.style.display = 'none';
		}
	}

	/**
	 * 复位交互状态（保留浮层 DOM，供下次绘制复用）。
	 */
	reset(): void {
		this.suspendDrawing();
		this.isPolygonRightClickEnabled = false;
		if (this.polygonRightClickEnableTimer) {
			clearTimeout(this.polygonRightClickEnableTimer);
			this.polygonRightClickEnableTimer = null;
		}
		this.hideDeleteButton();
		this.destroySubscriber();
		this.ctx.setEntity(null);
	}

	/**
	 * 彻底释放：复位交互并移除浮层 DOM。
	 */
	dispose(): void {
		this.reset();
		this.deleteButtonEl?.remove();
		this.deleteButtonEl = null;
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
}
