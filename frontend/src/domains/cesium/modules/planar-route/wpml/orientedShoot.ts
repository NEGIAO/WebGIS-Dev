/**
 * 功能名称：定向拍照（orientedShoot）字段与坐标换算
 * 日    期：2026/07/21
 *
 * 对齐司空2 / WPML orientedShoot：960×720 逻辑画幅、框选中心与区域、姿态联动
 */

import { generateUUID } from '../utils/comm';
import type { UavActionItem } from './types';

/** 司空 orientedShoot 标准画幅 */
export const ORIENTED_IMAGE_WIDTH = 960;
export const ORIENTED_IMAGE_HEIGHT = 720;

/** 属性面板预览 canvas 尺寸（与 FlyTableControl 模板一致） */
export const ORIENTED_PREVIEW_WIDTH = 400;
export const ORIENTED_PREVIEW_HEIGHT = 300;

/** 默认框约占画幅 40%（接近原虚线框视觉比例） */
export const ORIENTED_DEFAULT_REGION_RATIO = 0.4;

/**
 * 将 Cesium miniPitch（弧度，相机俯仰）转为司空云台 Pitch 角度（度）
 */
export function cesiumMiniPitchToGimbalPitchDeg(miniPitchRad: number): number {
	const miniPitchDeg = (miniPitchRad * 180) / Math.PI;
	if (miniPitchDeg === 90) return 0;
	if (miniPitchDeg > 90) return -(miniPitchDeg - 90);
	if (miniPitchDeg === 0) return 0;
	return 90 - miniPitchDeg;
}

/**
 * 司空云台 Pitch（度）→ Cesium miniPitch（弧度）
 */
export function gimbalPitchDegToCesiumMiniPitch(pitchDeg: number): number {
	if (pitchDeg === 0) return (90 * Math.PI) / 180;
	if (pitchDeg < 0) return ((-pitchDeg + 90) * Math.PI) / 180;
	return ((90 - pitchDeg) * Math.PI) / 180;
}

/**
 * 角度限制
 */
export function clampOrientedAngle(value: number, min: number, max: number): number {
	if (value < min) return min;
	if (value > max) return max;
	return value;
}

/**
 * 为定向拍照动作写入司空默认字段（可在截图后再覆盖姿态）
 * @param item 动作对象
 * @param opts 可选覆盖
 */
export function ensureOrientedShootFields(
	item: UavActionItem,
	opts?: {
		heading?: number;
		miniPitch?: number;
		gimbalYaw?: number;
		focalLength?: number;
		zoomTimes?: number;
		fileSuffix?: string;
	},
): void {
	const regionW = Math.round(ORIENTED_IMAGE_WIDTH * ORIENTED_DEFAULT_REGION_RATIO);
	const regionH = Math.round(ORIENTED_IMAGE_HEIGHT * ORIENTED_DEFAULT_REGION_RATIO);
	const zoomTimes = opts?.zoomTimes != null && opts.zoomTimes > 0 ? opts.zoomTimes : 5;
	const focalLength = opts?.focalLength != null ? opts.focalLength : zoomTimes * 24;

	if (item.imageWidth == null) item.imageWidth = ORIENTED_IMAGE_WIDTH;
	if (item.imageHeight == null) item.imageHeight = ORIENTED_IMAGE_HEIGHT;
	if (item.focusRegionWidth == null) item.focusRegionWidth = regionW;
	if (item.focusRegionHeight == null) item.focusRegionHeight = regionH;
	if (item.focusX == null) item.focusX = Math.round(ORIENTED_IMAGE_WIDTH / 2);
	if (item.focusY == null) item.focusY = Math.round(ORIENTED_IMAGE_HEIGHT / 2);
	if (item.accurateFrameValid == null) item.accurateFrameValid = 0;
	if (item.targetAngle == null) item.targetAngle = 0;
	if (!item.actionUUID) item.actionUUID = generateUUID();
	if (item.focalLength == null) item.focalLength = focalLength;

	if (opts?.heading != null) item.heading = opts.heading;
	if (opts?.miniPitch != null) item.miniPitch = opts.miniPitch;
	if (opts?.gimbalYaw != null) {
		item.gimbalYaw = opts.gimbalYaw;
	} else if (item.gimbalYaw == null && item.heading != null) {
		item.gimbalYaw = item.heading;
	}
	if (opts?.fileSuffix != null) item.orientedFileSuffix = opts.fileSuffix;
	if (item.orientedFileSuffix == null && item.fileSuffix != null) {
		item.orientedFileSuffix = item.fileSuffix;
	}
}

/**
 * 逻辑画幅坐标 → 预览 canvas 上的框样式（left/top/width/height，单位 px）
 */
export function focusRegionToPreviewStyle(item: UavActionItem): { left: number; top: number; width: number; height: number } {
	const imgW = item.imageWidth || ORIENTED_IMAGE_WIDTH;
	const imgH = item.imageHeight || ORIENTED_IMAGE_HEIGHT;
	const regionW = item.focusRegionWidth || Math.round(imgW * ORIENTED_DEFAULT_REGION_RATIO);
	const regionH = item.focusRegionHeight || Math.round(imgH * ORIENTED_DEFAULT_REGION_RATIO);
	const focusX = item.focusX != null ? item.focusX : Math.round(imgW / 2);
	const focusY = item.focusY != null ? item.focusY : Math.round(imgH / 2);

	const scaleX = ORIENTED_PREVIEW_WIDTH / imgW;
	const scaleY = ORIENTED_PREVIEW_HEIGHT / imgH;
	const width = regionW * scaleX;
	const height = regionH * scaleY;
	const left = focusX * scaleX - width / 2;
	const top = focusY * scaleY - height / 2;
	return { left, top, width, height };
}

/**
 * 预览 canvas 上框中心 → 逻辑 focusX/Y
 * 允许框超出照片边缘，中心最多拖到与照片边重合（focus ∈ [0, 画幅]）
 */
export function previewCenterToFocus(centerPreviewX: number, centerPreviewY: number, item: UavActionItem): { focusX: number; focusY: number } {
	const imgW = item.imageWidth || ORIENTED_IMAGE_WIDTH;
	const imgH = item.imageHeight || ORIENTED_IMAGE_HEIGHT;
	const scaleX = ORIENTED_PREVIEW_WIDTH / imgW;
	const scaleY = ORIENTED_PREVIEW_HEIGHT / imgH;

	let focusX = Math.round(centerPreviewX / scaleX);
	let focusY = Math.round(centerPreviewY / scaleY);
	// 中心点可拖到照片四边，框体可部分超出画幅
	focusX = Math.round(clampOrientedAngle(focusX, 0, imgW));
	focusY = Math.round(clampOrientedAngle(focusY, 0, imgH));
	return { focusX, focusY };
}
