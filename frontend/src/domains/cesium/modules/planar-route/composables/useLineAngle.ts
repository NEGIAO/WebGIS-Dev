/**
 * 功能名称：主航线角度滑块与方向指示器交互
 * 日    期：2026/07/29
 */
import Cesium from 'cesium';
import globeConfig from '../config/planarConfig';
import { clearLineAngleIndicator, updateLineAngleIndicator } from '../utils/lineAngleIndicator';
import { PolygonDrawingResult } from '../utils/drawPolygon';

const LINE_ANGLE_CLICK_INDICATOR_DURATION = 500;
const LINE_ANGLE_DRAG_THRESHOLD = 4;

/** 角度滑块与方向指示器所需的外部上下文 */
export interface LineAngleContext {
	drawDataSource: Cesium.CustomDataSource | null;
	entityObjPolygonObj: PolygonDrawingResult | null;
	lineAngleIndicatorHeight: number;
	recalculateRoute: () => Promise<void>;
}

/**
 * 管理主航线角度的滑块交互与方向指示器显示/隐藏。
 */
export class LineAngleHandler {
	private ctx: LineAngleContext;
	isLineAngleManual = false;

	/** 主航线角度滑块是否正在进行指针交互 */
	private isSliderInteracting = false;
	/** 本次滑块交互是否超过拖动阈值 */
	private hasSliderMoved = false;
	/** 滑块按下时的指针位置 */
	private sliderPointerStart = { x: 0, y: 0 };
	/** 单击滑块或角度按钮后的指示器隐藏计时器 */
	private indicatorHideTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(ctx: LineAngleContext) {
		this.ctx = ctx;
	}

	/**
	 * 使用角度按钮调整主航线角度，短暂显示方向指示并立即重新规划。
	 */
	changeLineAngle = (delta: number) => {
		const next = this.normalizeLineAngle(Number(globeConfig.lineAngle) + delta);
		globeConfig.lineAngle = next;
		this.isLineAngleManual = true;
		this.showIndicatorTemporarily();
		void this.ctx.recalculateRoute();
	};

	/**
	 * 按下主航线角度滑块：立即显示方向指示，并记录本次交互是否发生拖动。
	 */
	beginSliderInteraction = (event: PointerEvent) => {
		if (this.isSliderInteracting) {
			return;
		}
		this.cancelIndicatorHide();
		this.isSliderInteracting = true;
		this.hasSliderMoved = false;
		this.sliderPointerStart.x = event.clientX;
		this.sliderPointerStart.y = event.clientY;
		this.isLineAngleManual = true;
		this.showIndicatorForDrag();
		window.addEventListener('pointermove', this.onSliderPointerMove);
		window.addEventListener('pointercancel', this.onSliderPointerCancel);
	};

	/**
	 * 拖动角度滑块过程中更新角度。
	 */
	handleSliderInput = (value: number | number[]) => {
		if (Array.isArray(value)) {
			return;
		}
		globeConfig.lineAngle = this.normalizeLineAngle(Number(value));
		this.isLineAngleManual = true;
		if (this.isSliderInteracting) {
			this.showIndicatorForDrag();
		}
	};

	/**
	 * 完成滑块交互：拖动后立即隐藏，单击后保留指示器 500ms，并立即重新规划。
	 */
	handleSliderChange = (value: number | number[]) => {
		if (Array.isArray(value)) {
			return;
		}
		globeConfig.lineAngle = this.normalizeLineAngle(Number(value));
		this.isLineAngleManual = true;
		if (this.isSliderInteracting) {
			const hasDragged = this.hasSliderMoved;
			this.teardownSliderInteraction();
			if (hasDragged) {
				this.hideIndicator();
			} else {
				this.showIndicatorTemporarily();
			}
		}
		void this.ctx.recalculateRoute();
	};

	/**
	 * 清理滑块交互监听。
	 */
	teardownSliderInteraction(): void {
		this.isSliderInteracting = false;
		this.hasSliderMoved = false;
		window.removeEventListener('pointermove', this.onSliderPointerMove);
		window.removeEventListener('pointercancel', this.onSliderPointerCancel);
	}

	/**
	 * 取消尚未执行的方向指示隐藏任务。
	 */
	cancelIndicatorHide(): void {
		if (!this.indicatorHideTimer) {
			return;
		}
		clearTimeout(this.indicatorHideTimer);
		this.indicatorHideTimer = null;
	}

	/**
	 * 隐藏方向指示并取消尚未执行的隐藏任务。
	 */
	hideIndicator(): void {
		this.cancelIndicatorHide();
		clearLineAngleIndicator(this.ctx.drawDataSource);
		window.mainViewer?.scene.requestRender();
	}

	/**
	 * 将主航线角度限制在滑块允许的范围内。
	 */
	private normalizeLineAngle(value: number): number {
		return Math.min(179, Math.max(0, value));
	}

	/**
	 * 根据指针位移判断滑块交互是否为拖动。
	 */
	private onSliderPointerMove = (event: PointerEvent) => {
		const deltaX = event.clientX - this.sliderPointerStart.x;
		const deltaY = event.clientY - this.sliderPointerStart.y;
		const distanceSquared = deltaX * deltaX + deltaY * deltaY;
		if (distanceSquared >= LINE_ANGLE_DRAG_THRESHOLD * LINE_ANGLE_DRAG_THRESHOLD) {
			this.hasSliderMoved = true;
		}
	};

	/**
	 * 指针交互被取消时清理临时指示器和监听器。
	 */
	private onSliderPointerCancel = () => {
		if (!this.isSliderInteracting) {
			return;
		}
		this.teardownSliderInteraction();
		this.hideIndicator();
	};

	/**
	 * 拖动滑块时显示方向指示，并请求 Cesium 按动态旋转值重新渲染。
	 */
	private showIndicatorForDrag(): void {
		this.ensureIndicator();
		window.mainViewer?.scene.requestRender();
	}

	/**
	 * 显示方向指示，并在单击反馈时长结束后隐藏。
	 */
	private showIndicatorTemporarily(): void {
		this.cancelIndicatorHide();
		this.showIndicatorForDrag();
		this.indicatorHideTimer = setTimeout(() => {
			this.indicatorHideTimer = null;
			this.hideIndicator();
		}, LINE_ANGLE_CLICK_INDICATOR_DURATION);
	}

	/**
	 * 创建方向指示，或更新已有指示器的动态角度值。
	 */
	private ensureIndicator(): void {
		if (!this.ctx.drawDataSource) {
			return;
		}
		const polygonPositions = this.ctx.entityObjPolygonObj?.polygonPositions;
		if (!polygonPositions || polygonPositions.length < 3) {
			return;
		}
		const height = this.ctx.lineAngleIndicatorHeight > 0 ? this.ctx.lineAngleIndicatorHeight : Math.max(Number(globeConfig.lineHeight) || 100, 50) + 25;
		updateLineAngleIndicator(this.ctx.drawDataSource, polygonPositions, Number(globeConfig.lineAngle), height);
	}
}
