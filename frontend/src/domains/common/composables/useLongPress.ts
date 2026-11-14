/**
 * 功能名称：触摸长按识别
 * 日    期：2026/11/13
 *
 * 抽取来源：`LayerControlPanel`（`longPressTimer` / `LONG_PRESS_DURATION` / `LONG_PRESS_DRIFT`），
 *          原为面板私有实现，移动端「长按图层行弹出右键菜单」专用。
 *
 * 职责边界：只负责「判定是否构成一次长按」——按下起点、计时、漂移取消、多指取消、结束清理。
 *          触发后做什么由调用方回调决定，本模块不接触业务。
 *
 * 关键行为（与抽取前逐条对齐）：
 *   1. 计时到达即触发，触发后不清除计时句柄（由调用方在 end/cancel 时统一清理）；
 *   2. 位移超过 `driftTolerance` 立即取消，避免列表滚动误触菜单；
 *   3. 多指触摸直接取消；
 *   4. 同一实例只维护一个待触发的长按。
 */
import { onBeforeUnmount, ref } from 'vue';

export interface LongPressTriggerContext {
	/** 触点视口坐标 */
	x: number;
	y: number;
	/** 原始事件（用于取 currentTarget 等） */
	event: TouchEvent;
}

export interface UseLongPressOptions {
	/** 触发时长（ms），默认 500 */
	duration?: number;
	/** 允许的位移容差（px），默认 10 */
	driftTolerance?: number;
	/** 构成长按后的回调 */
	onTrigger: (ctx: LongPressTriggerContext) => void;
}

export function useLongPress(options: UseLongPressOptions) {
	const duration = options.duration ?? 500;
	const driftTolerance = options.driftTolerance ?? 10;

	/** 是否正在计时（供 touchmove 判定是否需要做漂移检查） */
	const pending = ref(false);
	/** 本次手势起点（拖拽等其它手势也复用该起点） */
	const startPoint = ref({ x: 0, y: 0 });

	let timer: ReturnType<typeof setTimeout> | null = null;

	function clearTimer() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		pending.value = false;
	}

	/** 取消本次长按（不触发） */
	function cancel() {
		clearTimer();
	}

	/**
	 * 记录起点并开始计时。
	 * @param event 触发 touchstart 的原始事件
	 */
	function begin(event: TouchEvent) {
		clearTimer();
		const touch = event.touches?.[0];
		if (!touch) return;
		startPoint.value = { x: touch.clientX, y: touch.clientY };
		pending.value = true;
		timer = setTimeout(() => {
			timer = null;
			pending.value = false;
			options.onTrigger({ x: startPoint.value.x, y: startPoint.value.y, event });
		}, duration);
	}

	/**
	 * 漂移检查；超出容差或多指则取消。
	 * @returns true 表示本次长按已被取消
	 */
	function move(event: TouchEvent): boolean {
		if (!timer) return false;
		const touches = event.touches;
		if (!touches || touches.length !== 1) {
			cancel();
			return true;
		}
		const dx = touches[0].clientX - startPoint.value.x;
		const dy = touches[0].clientY - startPoint.value.y;
		if (Math.hypot(dx, dy) > driftTolerance) {
			cancel();
			return true;
		}
		return false;
	}

	onBeforeUnmount(clearTimer);

	return { pending, startPoint, begin, move, cancel, clearTimer };
}
