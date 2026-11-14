import { onUnmounted } from 'vue';

/**
 * useTimerRegistry —— 定时器与帧回调统一托管
 * 功能：登记 setTimeout / setInterval / requestAnimationFrame，组件卸载时统一释放，
 *      避免各组件在 onUnmounted 里手写清理、遗漏导致泄漏。
 * 参数：无
 * 返回：{ later, every, frame, cancel, clearAll }
 * 核心逻辑：三组 Set 持有句柄；一次性定时器触发后自行出栈；卸载钩子由 composable 自行注册。
 */
export function useTimerRegistry() {
	const timeouts = new Set<ReturnType<typeof setTimeout>>();
	const intervals = new Set<ReturnType<typeof setInterval>>();
	const frames = new Set<number>();

	/** 注册一次性定时器；回调执行后自动出栈 */
	function later(fn: () => void, ms = 0) {
		const id = setTimeout(() => {
			timeouts.delete(id);
			fn();
		}, ms);
		timeouts.add(id);
		return id;
	}

	/** 注册循环定时器 */
	function every(fn: () => void, ms: number) {
		const id = setInterval(fn, ms);
		intervals.add(id);
		return id;
	}

	/** 注册一帧回调 */
	function frame(fn: FrameRequestCallback) {
		const id = requestAnimationFrame((t) => {
			frames.delete(id);
			fn(t);
		});
		frames.add(id);
		return id;
	}

	/** 取消任意一类句柄 */
	function cancel(id: ReturnType<typeof setTimeout> | number | null | undefined) {
		if (id == null) return;
		clearTimeout(id as ReturnType<typeof setTimeout>);
		clearInterval(id as ReturnType<typeof setInterval>);
		if (typeof id === 'number') cancelAnimationFrame(id);
		timeouts.delete(id as ReturnType<typeof setTimeout>);
		intervals.delete(id as ReturnType<typeof setInterval>);
		frames.delete(id as number);
	}

	/** 释放全部句柄（卸载时自动调用，也可手动提前释放） */
	function clearAll() {
		timeouts.forEach((id) => clearTimeout(id));
		intervals.forEach((id) => clearInterval(id));
		frames.forEach((id) => cancelAnimationFrame(id));
		timeouts.clear();
		intervals.clear();
		frames.clear();
	}

	onUnmounted(clearAll);

	return { later, every, frame, cancel, clearAll };
}
