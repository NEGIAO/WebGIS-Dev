/**
 * usePanelDragResize —— 浮层面板拖拽与八向缩放
 * 功能：把「标题栏拖动 + 四边四角缩放」统一为指针交互，并把结果钳制在宿主范围内；
 *      ≤768px 视口切换为全宽底部停靠，仅保留顶边热区。
 * 参数：
 *   getRect     读取当前面板矩形（含 initialized 标记）
 *   setRect     写入面板矩形
 *   panelRef    面板根元素 getter（用于取父容器尺寸）
 *   minWidth / minHeight  最小宽高（实际会再按宿主尺寸收紧）
 *   onResized   尺寸变化后的回调（如刷新滚动视口）
 * 返回：isMobileViewport / interaction / 各交互入口 / ensureInitialPanelRect / stopInteraction
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

export type ResizeDirection = 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface PanelRect {
	x: number;
	y: number;
	width: number;
	height: number;
	initialized?: boolean;
}

export interface UsePanelDragResizeOptions {
	getRect: () => PanelRect;
	setRect: (rect: PanelRect) => void;
	panelRef: () => HTMLElement | null;
	minWidth: number;
	minHeight: number;
	mobileMediaQuery?: string;
	onResized?: () => void;
}

const RESIZE_CURSORS: Record<ResizeDirection, string> = {
	top: 'ns-resize',
	bottom: 'ns-resize',
	left: 'ew-resize',
	right: 'ew-resize',
	'top-left': 'nwse-resize',
	'bottom-right': 'nwse-resize',
	'top-right': 'nesw-resize',
	'bottom-left': 'nesw-resize',
};

export function usePanelDragResize(options: UsePanelDragResizeOptions) {
	const { minWidth, minHeight, onResized } = options;
	const mq = options.mobileMediaQuery ?? '(max-width: 768px)';

	const isMobileViewport = ref(typeof window !== 'undefined' && !!window.matchMedia?.(mq).matches);
	const mobileMql: MediaQueryList | null = typeof window !== 'undefined' ? window.matchMedia?.(mq) ?? null : null;

	const interaction = ref<{
		mode: 'drag' | 'resize';
		direction: ResizeDirection;
		startX: number;
		startY: number;
		startRect: PanelRect;
	} | null>(null);

	function getHostSize() {
		const host = options.panelRef()?.parentElement;
		if (host) return { width: host.clientWidth, height: host.clientHeight };
		return { width: window.innerWidth, height: window.innerHeight };
	}

	function clampRect(rect: PanelRect): PanelRect {
		const host = getHostSize();
		const minW = Math.min(minWidth, Math.max(300, host.width - 16));
		const minH = Math.min(minHeight, Math.max(180, host.height - 16));
		const width = Math.max(minW, Math.min(rect.width, host.width - 8));
		const height = Math.max(minH, Math.min(rect.height, host.height - 8));
		const x = Math.max(0, Math.min(rect.x, host.width - width));
		const y = Math.max(0, Math.min(rect.y, host.height - height));
		return { x, y, width, height, initialized: true };
	}

	/**
	 * 初始化 / 校正面板矩形。
	 * 面板未挂载（v-if 隐藏）时宿主尺寸不可测，必须跳过，
	 * 否则 getHostSize 落到 window 兜底会把「半屏」误写进初始矩形。
	 */
	function ensureInitialPanelRect(): void {
		if (!options.panelRef()) return;
		const host = getHostSize();
		const rect = options.getRect();

		// 移动端：全宽底部停靠（高度保留用户上次记忆，默认容器 55%）
		if (isMobileViewport.value) {
			const preferred = rect.initialized ? rect.height : Math.round(host.height * 0.55);
			const height = Math.round(Math.min(Math.max(preferred, 180), Math.max(180, host.height - 60)));
			options.setRect({ x: 0, y: Math.max(0, host.height - height), width: host.width, height, initialized: true });
			return;
		}

		if (!rect.initialized) {
			// 桌面端默认占据左半（ArcGIS Pro 布局）
			const width = Math.max(320, Math.round(host.width / 2));
			const height = Math.max(240, host.height);
			options.setRect({ x: 0, y: 0, width, height, initialized: true });
			return;
		}

		options.setRect(clampRect({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }));
	}

	function stopInteraction(): void {
		interaction.value = null;
		document.body.style.cursor = 'auto'; // 防粘手套光标恢复
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', stopInteraction);
	}

	function onPointerMove(event: PointerEvent): void {
		const state = interaction.value;
		if (!state) return;

		if (state.mode === 'drag') {
			options.setRect(
				clampRect({
					...state.startRect,
					x: state.startRect.x + (event.clientX - state.startX),
					y: state.startRect.y + (event.clientY - state.startY),
				})
			);
			return;
		}

		// 位移预钳制：任一方向到达最小宽高后停止推进，避免对侧边被连带推挤
		const hostSize = getHostSize();
		const minW = Math.min(minWidth, Math.max(300, hostSize.width - 16));
		const minH = Math.min(minHeight, Math.max(180, hostSize.height - 16));
		let dx = event.clientX - state.startX;
		let dy = event.clientY - state.startY;
		if (state.direction.includes('right')) dx = Math.max(dx, minW - state.startRect.width);
		if (state.direction.includes('left')) dx = Math.min(dx, state.startRect.width - minW);
		if (state.direction.includes('bottom')) dy = Math.max(dy, minH - state.startRect.height);
		if (state.direction.includes('top')) dy = Math.min(dy, state.startRect.height - minH);

		const nextRect: PanelRect = { ...state.startRect };
		if (state.direction.includes('right')) nextRect.width = state.startRect.width + dx;
		if (state.direction.includes('left')) {
			nextRect.width = state.startRect.width - dx;
			nextRect.x = state.startRect.x + dx;
		}
		if (state.direction.includes('bottom')) nextRect.height = state.startRect.height + dy;
		if (state.direction.includes('top')) {
			nextRect.height = state.startRect.height - dy;
			nextRect.y = state.startRect.y + dy;
		}

		options.setRect(clampRect(nextRect));
		onResized?.();
	}

	function startDrag(event: PointerEvent): void {
		// 移动端为固定底部停靠面板：拖拽标题栏易与页面滚动手势冲突，直接禁用
		if (isMobileViewport.value) return;
		const target = event.target as HTMLElement;
		if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('.win-btn')) return;

		interaction.value = {
			mode: 'drag',
			direction: 'right', // 拖拽不需要方向，仅为匹配类型模型
			startX: event.clientX,
			startY: event.clientY,
			startRect: { ...options.getRect() },
		};
		document.body.style.cursor = 'default';
		window.addEventListener('pointermove', onPointerMove, { passive: true });
		window.addEventListener('pointerup', stopInteraction, { passive: true, once: true });
	}

	function startResize(direction: ResizeDirection, event: PointerEvent): void {
		// 移动端仅保留顶边热区（上下拖动调高度），其余方向禁用防误触
		if (isMobileViewport.value && direction !== 'top') return;
		interaction.value = {
			mode: 'resize',
			direction,
			startX: event.clientX,
			startY: event.clientY,
			startRect: { ...options.getRect() },
		};
		document.body.style.cursor = RESIZE_CURSORS[direction];
		window.addEventListener('pointermove', onPointerMove, { passive: true });
		window.addEventListener('pointerup', stopInteraction, { passive: true, once: true });
	}

	function handleWindowResize(): void {
		ensureInitialPanelRect();
		onResized?.();
	}

	function handleMobileQueryChange(event: MediaQueryListEvent): void {
		isMobileViewport.value = event.matches;
		nextTick(() => {
			ensureInitialPanelRect();
			onResized?.();
		});
	}

	onMounted(() => {
		window.addEventListener('resize', handleWindowResize, { passive: true });
		mobileMql?.addEventListener?.('change', handleMobileQueryChange);
	});

	onBeforeUnmount(() => {
		window.removeEventListener('resize', handleWindowResize);
		mobileMql?.removeEventListener?.('change', handleMobileQueryChange);
		stopInteraction();
	});

	return {
		isMobileViewport,
		interaction,
		ensureInitialPanelRect,
		stopInteraction,
		startDrag,
		startResize,
		handleWindowResize,
		handleMobileQueryChange,
	};
}
