// 罗盘相关类型定义

// 基础配置接口
export interface CompassSize {
  width: number;
  height: number;
  tianChiRadius?: number;
}

// 线条样式配置
export interface LineStyle {
  borderColor: string;
  scaleColor: string;
  scaleHighlightColor: string;
}

// 刻度样式配置
export interface ScaleStyle {
  minLineHeight: number;
  midLineHeight: number;
  maxLineHeight: number;
  numberFontSize?: number;
}

// 动画配置
export interface AnimationConfig {
  enable: boolean;
  duration?: number;
  delay?: number;
}

// 层数据配置
export interface Layer {
  name: string | string[];
  startAngle?: number;
  fontSize?: number;
  textColor?: string | string[];
  textOpacity?: number;
  vertical?: boolean;
  togetherStyle?: "empty" | "equally";
  data:
    | string[]
    | string[][];
  shape?: "circle" | "polygon";
  dataType?: "yao" | "normal";
  visible?: boolean;
  borderColor?: string;
  strokeWidth?: number;
  latticeFillColor?: string;
}

// 罗盘主配置接口
export interface FengShuiCompassConfig {
  info: {
    id: string | number;
    name?: string;
    preview?: string;
  };
  compassSize: CompassSize;
  data: Layer | Layer[];
  line: LineStyle;
  rotate: number;
  latticeFill: Array<[number, number, string?, string?]>;
  isShowTianxinCross?: boolean;
  isShowScale?: boolean;
  scaclStyle: ScaleStyle;
  autoFontSize?: boolean;
  animation?: AnimationConfig;
  tianxinCrossWidth?: number;
  tianxinCrossColor?: string;
  tianxinCrossLengthRatio?: number;
}

// 宫格点击事件数据
export interface LatticeClickEvent {
  latticeIndex: number;
  layerIndex: number;
  data: any;
}

// 文本位置信息
export interface TextPosition {
  x: number;
  y: number;
  angle: number;
}

// 分割线位置信息
export interface DividerPosition {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

// 刻度位置信息
export interface ScalePosition {
  start: { x: number; y: number };
  end: { x: number; y: number };
  text: { x: number; y: number; angle: number };
}
