/**
 * 功能名称：风水罗盘 SVG 渲染器
 * 日    期：2026/11/13（范式化改造）
 * 说    明：纯几何计算 + SVG 输出。所有位置/路径/变换方法均为实例方法，
 *          模板通过 render proxy 调用，`this` 指向实例。
 */
import { computed, defineComponent, onMounted, onUnmounted, watch, type ExtractPropTypes, type PropType, type SetupContext } from 'vue';
import type { FengShuiCompassConfig, Layer } from './types';

// 一、Emits
type EmitsType = ['latticeClick'];

// 二、Props
const propDefine = {
	config: { type: Object as PropType<Partial<FengShuiCompassConfig>>, default: undefined },
} as const;

export type FengShuiCompassSvgProps = ExtractPropTypes<typeof propDefine>;

/** 角度校正：0° 指向正上方 */
const CORRECTION_ANGLE = -90;

// 默认配置
const defaultConfig: FengShuiCompassConfig = {
	info: { id: '' },
	compassSize: { width: 800, height: 800 },
	data: [],
	line: { borderColor: '#666', scaleColor: '#666', scaleHighlightColor: '#999' },
	rotate: 0,
	latticeFill: [],
	isShowTianxinCross: false,
	isShowScale: true,
	scaclStyle: { maxLineHeight: 20, midLineHeight: 15, minLineHeight: 10 },
	autoFontSize: true,
	animation: { enable: true, duration: 500, delay: 300 },
	tianxinCrossWidth: 2,
	tianxinCrossColor: '#FF0000',
	tianxinCrossLengthRatio: 1 / 3,
};

// 三、组件注册入口
export default defineComponent({
	name: 'FengShuiCompassSvg',
	props: propDefine,
	emits: ['latticeClick'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {


	/** 合并后的配置（默认值 ← 传入值，含嵌套 line / scaclStyle / compassSize） */
	public m = computed(() => ({
		...defaultConfig,
		...this.props.config,
		line: { ...defaultConfig.line, ...this.props.config?.line },
		scaclStyle: { ...defaultConfig.scaclStyle, ...this.props.config?.scaclStyle },
		compassSize: { ...defaultConfig.compassSize, ...this.props.config?.compassSize },
		// 确保 data 始终是数组类型
		data: Array.isArray(this.props.config?.data || defaultConfig.data)
			? ((this.props.config?.data || defaultConfig.data) as Layer[])
			: [((this.props.config?.data || defaultConfig.data) as unknown) as Layer],
	}));

	/** 主题切换时动画状态同步更新 */
	public shouldEnableAnimation = computed(() => this.m.value.animation?.enable !== false);

	public centerPoint = computed(() => ({
		x: this.m.value.compassSize.width / 2,
		y: this.m.value.compassSize.height / 2,
	}));

	public radius = computed(() => {
		// 预留刻度线和文字的空间
		const maxScaleSpace = this.m.value.scaclStyle ? this.m.value.scaclStyle.maxLineHeight * 3 : 0;
		const availableSpace = Math.min(this.m.value.compassSize.width, this.m.value.compassSize.height) / 2 - maxScaleSpace;
		return Math.max(availableSpace, 0);
	});

	public tianChiRadius = computed(() => {
		if (this.m.value.compassSize.tianChiRadius !== undefined) return this.m.value.compassSize.tianChiRadius;
		return this.radius.value * 0.1;
	});

	public tianxinCrossHalfLength = computed(() => {
		const ratioRaw = Number(this.m.value.tianxinCrossLengthRatio ?? 1 / 3);
		const ratio = Number.isFinite(ratioRaw) ? Math.max(0.1, Math.min(1, ratioRaw)) : 1 / 3;
		return this.radius.value * ratio;
	});

	public borderWidth = 1;

	/** 每层高度均分（天池外沿 → 最外层） */
	public layerHeight = computed(() => {
		const availableHeight = (this.radius.value - this.tianChiRadius.value) / this.m.value.data.length;
		return new Array(this.m.value.data.length).fill(availableHeight);
	});

	public baseFontSize = computed(() => {
		const base = this.radius.value / 20;
		if (this.m.value.autoFontSize || !this.m.value.autoFontSize) return Math.min(Math.max(base, 12), 40);
		const layerIndex = this.m.value.data.length - 1;
		const layerData = this.m.value.data[layerIndex];
		const count = layerData.data.length;
		const singleAngle = 360 / count;
		const arcLength = (2 * Math.PI * this.getLayerRadius(layerIndex + 1) * singleAngle) / 360;
		const maxFontSize = arcLength / 4;
		const userFontSize = layerData.fontSize || Math.min(this.m.value.compassSize.width, this.m.value.compassSize.height) / 20;
		return Math.min(userFontSize, maxFontSize);
	});

	/** 几何计算缓存（挂载/卸载/数据变更时清理） */
	private cachedResults = new Map<string, any>();

	constructor(
		private props: FengShuiCompassSvgProps,
		private ctx: SetupContext<EmitsType>
	) {
		this.init();
	}

	private init() {
		onMounted(() => this.cachedResults.clear());
		onUnmounted(() => this.cachedResults.clear());

		// 数据变化时清缓存，并纠正多边形层的 startAngle（多边形不支持起始角）
		watch(
			() => this.props.config?.data,
			(newData) => {
				if (!newData) return;
				this.cachedResults.clear();
				void (
					Array.isArray(newData) &&
					newData.forEach((layer: any, index: number) => {
						if (layer.shape === 'polygon' && layer.startAngle) {
							console.warn(`警告: 第${index + 1}层使用了多边形模式，多边形模式不支持startAngle设置。`);
							layer.startAngle = 0;
						}
					})
				);
			},
			{ deep: true }
		);
	}

	//#region 几何基础

	/** 获取指定层的起始半径（天池外沿起算） */
	public getLayerRadius = (index: number) => {
		let r = this.tianChiRadius.value;
		for (let i = 0; i < index; i++) r += this.layerHeight.value[i];
		return r;
	};

	/** 角度转弧度（含 -90° 校正） */
	public rads = (degrees: number) => {
		return (Math.PI * (degrees + CORRECTION_ANGLE)) / 180;
	};

	//#endregion

	//#region 宫格

	public hasLatticeFill = (latticeIndex: number, layerIndex: number) => {
		return this.m.value.latticeFill.some((fill) => fill[0] === latticeIndex && fill[1] === layerIndex);
	};

	public getLatticeFillColor = (latticeIndex: number, layerIndex: number) => {
		const fill = this.m.value.latticeFill.find((item) => item[0] === latticeIndex && item[1] === layerIndex);
		return fill ? fill[2] : 'none';
	};

	/** 宫格扇形路径（圆形层用 A 弧，多边形层用直线） */
	public getLatticePath = (latticeIndex: number, layerIndex: number) => {
		const layer = this.m.value.data[layerIndex];
		const count = layer.data.length;
		const startAngle = this.rads((360 / count) * latticeIndex);
		const endAngle = this.rads((360 / count) * (latticeIndex + 1));
		const innerRadius = this.getLayerRadius(layerIndex);
		const outerRadius = this.getLayerRadius(layerIndex + 1);
		const layerShape = layer.shape || 'circle';

		if (layerShape === 'circle') {
			const x1 = this.centerPoint.value.x + innerRadius * Math.cos(startAngle);
			const y1 = this.centerPoint.value.y + innerRadius * Math.sin(startAngle);
			const x2 = this.centerPoint.value.x + outerRadius * Math.cos(startAngle);
			const y2 = this.centerPoint.value.y + outerRadius * Math.sin(startAngle);
			const x3 = this.centerPoint.value.x + outerRadius * Math.cos(endAngle);
			const y3 = this.centerPoint.value.y + outerRadius * Math.sin(endAngle);
			const x4 = this.centerPoint.value.x + innerRadius * Math.cos(endAngle);
			const y4 = this.centerPoint.value.y + innerRadius * Math.sin(endAngle);

			return `
      M ${x1} ${y1}
      L ${x2} ${y2}
      A ${outerRadius} ${outerRadius} 0 0 1 ${x3} ${y3}
      L ${x4} ${y4}
      A ${innerRadius} ${innerRadius} 0 0 0 ${x1} ${y1}
      Z
    `.trim();
		}

		const path: string[] = [];
		const ox1 = this.centerPoint.value.x + outerRadius * Math.cos(startAngle);
		const oy1 = this.centerPoint.value.y + outerRadius * Math.sin(startAngle);
		const ox2 = this.centerPoint.value.x + outerRadius * Math.cos(endAngle);
		const oy2 = this.centerPoint.value.y + outerRadius * Math.sin(endAngle);
		path.push(`M ${ox1} ${oy1}`);
		path.push(`L ${ox2} ${oy2}`);

		const ix3 = this.centerPoint.value.x + innerRadius * Math.cos(endAngle);
		const iy3 = this.centerPoint.value.y + innerRadius * Math.sin(endAngle);
		const ix4 = this.centerPoint.value.x + innerRadius * Math.cos(startAngle);
		const iy4 = this.centerPoint.value.y + innerRadius * Math.sin(startAngle);
		path.push(`L ${ix3} ${iy3}`);
		path.push(`L ${ix4} ${iy4}`);
		path.push('Z');
		return path.join(' ');
	};

	//#endregion

	//#region 文字

	/** 单宫文字位置：角度取宫格中心，transform 使字头朝外 */
	public getTextPosition = (layerIndex: number, textIndex: number, layer: Layer) => {
		const count = layer.data.length;
		const angle = this.rads((360 / count) * textIndex + 360 / count / 2 + (layer.startAngle || 0));
		const r = this.getLayerRadius(layerIndex) + this.layerHeight.value[layerIndex] / 2;
		return {
			x: this.centerPoint.value.x + r * Math.cos(angle),
			y: this.centerPoint.value.y + r * Math.sin(angle),
			angle: (angle * 180) / Math.PI + 90,
		};
	};

	public getTextX = (layerIndex: number, textIndex: number, layer: Layer) => {
		return this.getTextPosition(layerIndex, textIndex, layer).x;
	};

	public getTextY = (layerIndex: number, textIndex: number, layer: Layer) => {
		return this.getTextPosition(layerIndex, textIndex, layer).y;
	};

	public getTextTransform = (layerIndex: number, textIndex: number, layer: Layer) => {
		const pos = this.getTextPosition(layerIndex, textIndex, layer);
		const extraRotation = layer.vertical ? (pos.angle > 90 && pos.angle < 270 ? 270 : 90) : 0;
		return `rotate(${pos.angle + extraRotation} ${pos.x} ${pos.y})`;
	};

	/** 同宫多文字位置：按 (文字数 + 1) 等分宫格角度 */
	public getTogetherTextPosition = (layerIndex: number, textIndex: number, subIndex: number, layer: Layer) => {
		const count = layer.data.length;
		const singleAngle = 360 / count;
		const baseAngle = singleAngle * textIndex + (layer.startAngle || 0);
		const currentLatticeTexts = layer.data[textIndex];
		const textsCount = currentLatticeTexts.length;
		const textSpacing = singleAngle / (textsCount + 1);
		const textAngle = baseAngle + textSpacing * (subIndex + 1);
		const angle = this.rads(textAngle);
		const r = this.getLayerRadius(layerIndex) + this.layerHeight.value[layerIndex] / 2;
		return {
			x: this.centerPoint.value.x + r * Math.cos(angle),
			y: this.centerPoint.value.y + r * Math.sin(angle),
			angle: (angle * 180) / Math.PI + 90,
		};
	};

	public getTogetherTextX = (layerIndex: number, textIndex: number, subIndex: number, layer: Layer) => {
		return this.getTogetherTextPosition(layerIndex, textIndex, subIndex, layer).x;
	};

	public getTogetherTextY = (layerIndex: number, textIndex: number, subIndex: number, layer: Layer) => {
		return this.getTogetherTextPosition(layerIndex, textIndex, subIndex, layer).y;
	};

	public getTogetherTextTransform = (layerIndex: number, textIndex: number, subIndex: number, layer: Layer) => {
		const pos = this.getTogetherTextPosition(layerIndex, textIndex, subIndex, layer);
		return `rotate(${pos.angle} ${pos.x} ${pos.y})`;
	};

	//#endregion

	//#region 层边界

	/** 层边框路径：多边形层按边数连线，并补齐与相邻圆形层之间的弧 */
	public getLayerBorderPath = (layerIndex: number) => {
		const layer = this.m.value.data[layerIndex];
		const sides = layer.data.length;
		const radius = this.getLayerRadius(layerIndex + 1);
		const path: string[] = [];

		if (layer.shape !== 'circle' && layer.shape) {
			const hasCircleAbove =
				layerIndex + 1 < this.m.value.data.length &&
				(this.m.value.data[layerIndex + 1].shape === 'circle' || !this.m.value.data[layerIndex + 1].shape);
			const hasCircleBelow =
				layerIndex > 0 &&
				(this.m.value.data[layerIndex - 1].shape === 'circle' || !this.m.value.data[layerIndex - 1].shape);

			for (let i = 0; i <= sides; i++) {
				const angle = (i * 2 * Math.PI) / sides;
				const x = this.centerPoint.value.x + radius * Math.cos(angle);
				const y = this.centerPoint.value.y + radius * Math.sin(angle);
				path.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
			}
			path.push('Z');

			if (hasCircleAbove) {
				path.push(`M ${this.centerPoint.value.x + radius} ${this.centerPoint.value.y}`);
				path.push(`A ${radius} ${radius} 0 1 1 ${this.centerPoint.value.x - radius} ${this.centerPoint.value.y}`);
				path.push(`A ${radius} ${radius} 0 1 1 ${this.centerPoint.value.x + radius} ${this.centerPoint.value.y}`);
			}

			if (hasCircleBelow) {
				const innerRadius = this.getLayerRadius(layerIndex);
				path.push(`M ${this.centerPoint.value.x + innerRadius} ${this.centerPoint.value.y}`);
				path.push(`A ${innerRadius} ${innerRadius} 0 1 1 ${this.centerPoint.value.x - innerRadius} ${this.centerPoint.value.y}`);
				path.push(`A ${innerRadius} ${innerRadius} 0 1 1 ${this.centerPoint.value.x + innerRadius} ${this.centerPoint.value.y}`);
			}
		} else {
			path.push(`M ${this.centerPoint.value.x + radius} ${this.centerPoint.value.y}`);
			path.push(`A ${radius} ${radius} 0 1 1 ${this.centerPoint.value.x - radius} ${this.centerPoint.value.y}`);
			path.push(`A ${radius} ${radius} 0 1 1 ${this.centerPoint.value.x + radius} ${this.centerPoint.value.y}`);
		}

		return path.join(' ');
	};

	//#endregion

	//#region 分隔线与刻度

	public getDividerPosition = (layerIndex: number, index: number) => {
		const layer = this.m.value.data[layerIndex];
		const count = layer.data.length;
		const angle = this.rads((360 / count) * index + (layer.startAngle || 0));
		const innerRadius = this.getLayerRadius(layerIndex);
		const outerRadius = this.getLayerRadius(layerIndex + 1);
		return {
			start: {
				x: this.centerPoint.value.x + innerRadius * Math.cos(angle),
				y: this.centerPoint.value.y + innerRadius * Math.sin(angle),
			},
			end: {
				x: this.centerPoint.value.x + outerRadius * Math.cos(angle),
				y: this.centerPoint.value.y + outerRadius * Math.sin(angle),
			},
		};
	};

	public getDividerStartX = (layerIndex: number, index: number) => {
		return this.getDividerPosition(layerIndex, index).start.x;
	};
	public getDividerStartY = (layerIndex: number, index: number) => {
		return this.getDividerPosition(layerIndex, index).start.y;
	};
	public getDividerEndX = (layerIndex: number, index: number) => {
		return this.getDividerPosition(layerIndex, index).end.x;
	};
	public getDividerEndY = (layerIndex: number, index: number) => {
		return this.getDividerPosition(layerIndex, index).end.y;
	};

	/** 刻度位置：10 的倍数为长线、5 的倍数为中线，其余短线 */
	public getScalePosition = (index: number) => {
		const angle = this.rads(index);
		const r = this.getLayerRadius(this.m.value.data.length);
		const scaleLength =
			index % 10 === 0
				? this.m.value.scaclStyle.maxLineHeight
				: index % 5 === 0
					? this.m.value.scaclStyle.midLineHeight
					: this.m.value.scaclStyle.minLineHeight;
		return {
			start: {
				x: this.centerPoint.value.x + r * Math.cos(angle),
				y: this.centerPoint.value.y + r * Math.sin(angle),
			},
			end: {
				x: this.centerPoint.value.x + (r + scaleLength) * Math.cos(angle),
				y: this.centerPoint.value.y + (r + scaleLength) * Math.sin(angle),
			},
			text: {
				x: this.centerPoint.value.x + (r + this.m.value.scaclStyle.maxLineHeight * 2) * Math.cos(angle),
				y: this.centerPoint.value.y + (r + this.m.value.scaclStyle.maxLineHeight * 2) * Math.sin(angle),
				angle: (angle * 180) / Math.PI + 90,
			},
		};
	};

	public getScaleStartX = (index: number) => {
		return this.getScalePosition(index).start.x;
	};
	public getScaleStartY = (index: number) => {
		return this.getScalePosition(index).start.y;
	};
	public getScaleEndX = (index: number) => {
		return this.getScalePosition(index).end.x;
	};
	public getScaleEndY = (index: number) => {
		return this.getScalePosition(index).end.y;
	};
	public getScaleTextX = (index: number) => {
		return this.getScalePosition(index).text.x;
	};
	public getScaleTextY = (index: number) => {
		return this.getScalePosition(index).text.y;
	};
	public getScaleTextTransform = (index: number) => {
		const pos = this.getScalePosition(index).text;
		return `rotate(${pos.angle} ${pos.x} ${pos.y})`;
	};

	/** 刻度文字大小：配置优先，否则按半径推算并夹在 12–40 */
	public getScaleFontSize = () => {
		if (this.m.value.scaclStyle?.numberFontSize) return this.m.value.scaclStyle.numberFontSize;
		const base = this.radius.value / 20;
		return Math.min(Math.max(base, 12), 40);
	};

	//#endregion

	//#region 交互

	/** 宫格点击：向父组件派发宫格索引、层索引与对应数据 */
	public handleLatticeClick = (latticeIndex: number, layerIndex: number) => {
		this.ctx.emit('latticeClick', {
			latticeIndex,
			layerIndex,
			data: this.m.value.data[layerIndex].data[latticeIndex],
		});
	};

	//#endregion
}
