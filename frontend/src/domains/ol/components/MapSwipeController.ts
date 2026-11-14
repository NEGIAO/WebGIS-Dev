/**
 * 功能名称：OpenLayers 双底图卷帘分割控制条逻辑层
 * 说    明：采用视图层（MapSwipeController.vue）与逻辑层（MapSwipeController.ts）分离范式；
 *           支持桌面端鼠标拖拽、键盘微调及移动端长按（useTimerRegistry 托管计时器）平滑滑动。
 */
import {
    computed,
    defineComponent,
    onMounted,
    onUnmounted,
    ref,
    type ExtractPropTypes,
    type PropType,
    type SetupContext,
} from 'vue';
import { Hand } from '@lucide/vue';
import { useTimerRegistry } from '@common/composables/useTimerRegistry';

const LONG_PRESS_DELAY = 300;
const LONG_PRESS_TOLERANCE = 15;

type EmitsType = {
    'update:swipe-position': [position: number];
    'update:swipe-mode': [mode: 'horizontal' | 'vertical'];
    close: [];
};

const propDefine = {
    swipePosition: {
        type: Number,
        default: 0.5,
    },
    swipeMode: {
        type: String as PropType<'horizontal' | 'vertical'>,
        default: 'horizontal',
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    showPositionLabel: {
        type: Boolean,
        default: true,
    },
    containerRect: {
        type: Object as PropType<DOMRect | null>,
        default: null,
    },
} as const;

export type MapSwipeControllerProps = ExtractPropTypes<typeof propDefine>;

export default defineComponent({
    name: 'MapSwipeController',
    components: { Hand },
    props: propDefine,
    emits: ['update:swipe-position', 'update:swipe-mode', 'close'],
    setup(props, ctx) {
        return new Instance(props, ctx);
    },
});

export class Instance {
    public presetPositions = [
        { label: '25%', value: 0.25 },
        { label: '50%', value: 0.5 },
        { label: '75%', value: 0.75 },
    ];

    public isDragging = ref(false);
    public dragStartPos = ref({ x: 0, y: 0 });
    public swipePosition;
    public swipeMode;
    public isLongPressing = ref(false);
    public longPressActive = ref(false);
    public showLongPressHint = ref(false);
    public touchStartPos = ref({ x: 0, y: 0 });

    public positionPercentage;
    public isActive;
    public splitterStyle;

    private later: ReturnType<typeof useTimerRegistry>['later'];
    private cancel: ReturnType<typeof useTimerRegistry>['cancel'];
    private longPressHandle: ReturnType<typeof useTimerRegistry>['later'] extends (...a: any[]) => infer R ? R | null : any = null;
    private hintHideHandle: ReturnType<typeof useTimerRegistry>['later'] extends (...a: any[]) => infer R ? R | null : any = null;

    constructor(
        private props: MapSwipeControllerProps,
        private ctx: SetupContext<EmitsType>,
    ) {
        const registry = useTimerRegistry();
        this.later = registry.later;
        this.cancel = registry.cancel;

        this.swipePosition = ref(props.swipePosition);
        this.swipeMode = ref<'horizontal' | 'vertical'>(props.swipeMode);

        this.positionPercentage = computed(() => Math.round(this.swipePosition.value * 100));
        this.isActive = computed(
            () => this.props.isActive && this.swipePosition.value >= 0 && this.swipePosition.value <= 1,
        );

        this.splitterStyle = computed(() => {
            const baseStyle: Record<string, any> = {
                position: 'absolute',
                zIndex: 2000,
                cursor: this.swipeMode.value === 'horizontal' ? 'col-resize' : 'row-resize',
                transition: this.isDragging.value ? 'none' : 'all 0.2s ease-out',
            };

            if (this.swipeMode.value === 'horizontal') {
                baseStyle.left = `${this.swipePosition.value * 100}%`;
                baseStyle.top = 0;
                baseStyle.width = '4px';
                baseStyle.height = '100%';
                baseStyle.transform = 'translateX(-50%)';
            } else {
                baseStyle.left = 0;
                baseStyle.top = `${this.swipePosition.value * 100}%`;
                baseStyle.width = '100%';
                baseStyle.height = '4px';
                baseStyle.transform = 'translateY(-50%)';
            }

            return baseStyle;
        });

        onMounted(() => {
            this.swipePosition.value = this.props.swipePosition;
            this.swipeMode.value = this.props.swipeMode;
        });

        onUnmounted(() => {
            this.clearLongPressTimer();
            this.clearHintTimer();
            this.isDragging.value = false;
            this.isLongPressing.value = false;
            this.longPressActive.value = false;
            document.removeEventListener('mousemove', this.handleMouseMove);
            document.removeEventListener('mouseup', this.handleMouseUp);
        });
    }

    public get showPositionLabel() {
        return this.props.showPositionLabel;
    }

    private clearLongPressTimer(): void {
        if (this.longPressHandle !== null) {
            this.cancel(this.longPressHandle);
            this.longPressHandle = null;
        }
    }

    private clearHintTimer(): void {
        if (this.hintHideHandle !== null) {
            this.cancel(this.hintHideHandle);
            this.hintHideHandle = null;
        }
    }

    private cancelLongPress(): void {
        this.clearLongPressTimer();
        this.isLongPressing.value = false;
    }

    private updateSwipePositionFromEvent(clientX: number, clientY: number): void {
        if (!this.props.containerRect) return;

        let newPosition: number;
        if (this.swipeMode.value === 'horizontal') {
            const relativeX = clientX - this.props.containerRect.left;
            newPosition = Math.max(0, Math.min(1, relativeX / this.props.containerRect.width));
        } else {
            const relativeY = clientY - this.props.containerRect.top;
            newPosition = Math.max(0, Math.min(1, relativeY / this.props.containerRect.height));
        }

        const clamped = Math.max(0.05, Math.min(0.95, newPosition));
        this.swipePosition.value = clamped;
        this.ctx.emit('update:swipe-position', clamped);
    }

    public handleSplitterMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        this.isDragging.value = true;
        this.dragStartPos.value = { x: e.clientX, y: e.clientY };
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);
        e.preventDefault();
    };

    public handleMouseMove = (e: MouseEvent) => {
        if (!this.isDragging.value || !this.props.containerRect) return;
        this.updateSwipePositionFromEvent(e.clientX, e.clientY);
    };

    public handleMouseUp = () => {
        this.isDragging.value = false;
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
    };

    public handleSplitterTouchStart = (e: TouchEvent) => {
        if (this.longPressActive.value) return;

        const touch = e.touches[0];
        this.touchStartPos.value = { x: touch.clientX, y: touch.clientY };
        this.dragStartPos.value = { x: touch.clientX, y: touch.clientY };
        this.isLongPressing.value = true;
        this.clearLongPressTimer();

        this.longPressHandle = this.later(() => {
            this.longPressActive.value = true;
            this.isDragging.value = true;
            this.isLongPressing.value = false;

            try {
                navigator?.vibrate?.(50);
            } catch {
                // ignore
            }

            this.showLongPressHint.value = true;
            this.clearHintTimer();
            this.hintHideHandle = this.later(() => {
                this.showLongPressHint.value = false;
                this.hintHideHandle = null;
            }, 800);
        }, LONG_PRESS_DELAY);

        e.preventDefault();
    };

    public handleSplitterTouchMove = (e: TouchEvent) => {
        const touch = e.touches[0];

        if (this.isLongPressing.value && !this.longPressActive.value) {
            const dx = touch.clientX - this.touchStartPos.value.x;
            const dy = touch.clientY - this.touchStartPos.value.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > LONG_PRESS_TOLERANCE) {
                this.cancelLongPress();
            }
            return;
        }

        if (this.longPressActive.value && this.props.containerRect) {
            this.updateSwipePositionFromEvent(touch.clientX, touch.clientY);
            e.preventDefault();
        }
    };

    public handleSplitterTouchEnd = () => {
        this.clearLongPressTimer();
        this.isLongPressing.value = false;
        this.longPressActive.value = false;
        this.isDragging.value = false;
    };

    public handleSplitterTouchCancel = () => {
        this.clearLongPressTimer();
        this.isLongPressing.value = false;
        this.longPressActive.value = false;
        this.isDragging.value = false;
    };

    public setPresetPosition = (position: number) => {
        const clamped = Math.max(0.05, Math.min(0.95, position));
        this.swipePosition.value = clamped;
        this.ctx.emit('update:swipe-position', clamped);
    };

    public handleSliderInput = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const value = Number(target.value) / 100;
        const clamped = Math.max(0.05, Math.min(0.95, value));
        this.swipePosition.value = clamped;
        this.ctx.emit('update:swipe-position', clamped);
    };

    public handleSplitterKeyDown = (e: KeyboardEvent) => {
        const step = 0.02;

        if (this.swipeMode.value === 'horizontal') {
            if (e.key === 'ArrowLeft') {
                this.swipePosition.value = Math.max(0.05, this.swipePosition.value - step);
                e.preventDefault();
            } else if (e.key === 'ArrowRight') {
                this.swipePosition.value = Math.min(0.95, this.swipePosition.value + step);
                e.preventDefault();
            }
        } else {
            if (e.key === 'ArrowUp') {
                this.swipePosition.value = Math.max(0.05, this.swipePosition.value - step);
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                this.swipePosition.value = Math.min(0.95, this.swipePosition.value + step);
                e.preventDefault();
            }
        }

        if (e.key === 'Home') {
            this.swipePosition.value = 0.05;
            e.preventDefault();
        } else if (e.key === 'End') {
            this.swipePosition.value = 0.95;
            e.preventDefault();
        }

        this.ctx.emit('update:swipe-position', this.swipePosition.value);
    };

    public toggleMode = () => {
        this.swipeMode.value = this.swipeMode.value === 'horizontal' ? 'vertical' : 'horizontal';
        this.ctx.emit('update:swipe-mode', this.swipeMode.value);
    };

    public closeSwipe = () => {
        this.ctx.emit('close');
    };
}
