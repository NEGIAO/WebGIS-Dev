/**
 * 功能名称：可拖拽分割条组件（ResizeHandle）实例层
 * 日    期：2026/11/14
 * 说    明：支持水平与垂直方向容器分栏比例拖拽与双击复原。
 */
import {
	computed,
	defineComponent,
	onUnmounted,
	ref,
	type CSSProperties,
	type ExtractPropTypes,
	type SetupContext,
} from 'vue';

type EmitsType = ('resize' | 'resize-end')[];

const propDefine = {
	direction: {
		type: String,
		default: 'horizontal',
		validator: (value: string) => ['horizontal', 'vertical'].includes(value),
	},
	minSize: {
		type: Number,
		default: 20,
		validator: (value: number) => value >= 0 && value <= 100,
	},
	maxSize: {
		type: Number,
		default: 80,
		validator: (value: number) => value >= 0 && value <= 100,
	},
	initialRatio: {
		type: Number,
		default: 50,
	},
} as const;

export type ResizeHandleProps = ExtractPropTypes<typeof propDefine>;

export default defineComponent({
	name: 'ResizeHandle',
	props: propDefine,
	emits: ['resize', 'resize-end'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public isDragging = ref(false);
	public isHovered = ref(false);
	public containerRef = ref<HTMLElement | null>(null);

	get direction() {
		return this.props.direction;
	}
	get minSize() {
		return this.props.minSize;
	}
	get maxSize() {
		return this.props.maxSize;
	}
	get initialRatio() {
		return this.props.initialRatio;
	}

	public handleStyle = computed<CSSProperties>(() => ({
		cursor: this.props.direction === 'horizontal' ? 'col-resize' : 'row-resize',
		userSelect: this.isDragging.value ? 'none' : 'auto',
	}));

	constructor(
		private props: ResizeHandleProps,
		private ctx: SetupContext<EmitsType>,
	) {
		this.emit = this.ctx.emit;
		this.init();
	}

	private init() {
		onUnmounted(() => {
			document.removeEventListener('mousemove', this.onMouseMove);
			document.removeEventListener('mouseup', this.onMouseUp);
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
		});
	}

	public onMouseEnter = () => {
		this.isHovered.value = true;
	};

	public onMouseLeave = () => {
		if (!this.isDragging.value) {
			this.isHovered.value = false;
		}
	};

	public onMouseDown = (event: MouseEvent) => {
		if (event.button !== 0) return;
		this.isDragging.value = true;
		this.isHovered.value = true;
		event.preventDefault();
		document.addEventListener('mousemove', this.onMouseMove);
		document.addEventListener('mouseup', this.onMouseUp);
		document.body.style.cursor =
			this.props.direction === 'horizontal' ? 'col-resize' : 'row-resize';
		document.body.style.userSelect = 'none';
	};

	public onMouseMove = (event: MouseEvent) => {
		if (!this.isDragging.value || !this.containerRef.value) return;
		const parent = this.containerRef.value.parentElement;
		if (!parent) return;
		const parentRect = parent.getBoundingClientRect();
		let newRatio: number;
		if (this.props.direction === 'horizontal') {
			const mouseX = event.clientX - parentRect.left;
			newRatio = (mouseX / parentRect.width) * 100;
		} else {
			const mouseY = event.clientY - parentRect.top;
			newRatio = (mouseY / parentRect.height) * 100;
		}
		newRatio = Math.max(this.props.minSize, Math.min(this.props.maxSize, newRatio));
		this.emit('resize', newRatio);
	};

	public onMouseUp = () => {
		this.isDragging.value = false;
		this.isHovered.value = false;
		document.removeEventListener('mousemove', this.onMouseMove);
		document.removeEventListener('mouseup', this.onMouseUp);
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
		this.emit('resize-end');
	};

	public onDoubleClick = () => {
		this.emit('resize', this.props.initialRatio);
	};
}
