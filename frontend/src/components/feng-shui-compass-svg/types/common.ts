// 通用类型定义

// 星星对象
export interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
}

// 星座连线
export interface ConstellationLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  opacity: number;
}

// 爻位配置
export interface YaoConfig {
  radius: number;
  angle: number;
  arcLength: number;
  layerHeight: number;
  enableCurve: boolean;
}

// 爻位条
export interface YaoBar {
  id: string;
  color: string;
  type: 'yin' | 'yang';
}

// 坐标点
export interface Point {
  x: number;
  y: number;
}

// 颜色值类型
export type ColorValue = string;

// 角度值类型（度数）
export type AngleValue = number;

// 半径值类型
export type RadiusValue = number;

// 尺寸类型
export interface Size {
  width: number;
  height: number;
}

// 位置类型
export interface Position {
  x: number;
  y: number;
}

// 变换类型
export interface Transform {
  rotate?: number;
  scale?: number;
  translate?: { x: number; y: number };
}